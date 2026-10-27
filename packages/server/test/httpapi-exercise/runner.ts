import { Cause, Duration, Effect } from "effect"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { $ } from "bun"
import path from "path"
import { exerciseConfigDirectory } from "./environment"
import { basic, call, callAuthProbe, capture, locate, makeApp, type ExerciseApp } from "./backend"
import { isRecord } from "./assertions"
import type { ActiveScenario, Options, ProjectOptions, Result, Scenario, ScenarioContext, SeededContext } from "./types"

export function runScenario(options: Options, shared: { auth: ExerciseApp | undefined }) {
  return (scenario: Scenario) => {
    if (scenario.kind === "todo") return Effect.succeed({ status: "skip", scenario } as Result)
    return (options.mode === "auth" ? runAuth(scenario, shared) : runActive(options, scenario)).pipe(
      Effect.timeoutOrElse({
        duration: options.scenarioTimeout,
        orElse: () => Effect.die(new Error(`scenario timed out after ${Duration.format(options.scenarioTimeout)}`)),
      }),
      Effect.as({ status: "pass", scenario } as Result),
      Effect.catchCause((cause) => Effect.succeed({ status: "fail" as const, scenario, message: Cause.pretty(cause) })),
      Effect.scoped,
    )
  }
}

function runAuth(scenario: ActiveScenario, shared: { auth: ExerciseApp | undefined }) {
  return Effect.gen(function* () {
    // One authenticated app serves every probe: the probes only read the auth layer's verdict.
    const app = (shared.auth ??= makeApp({ auth: true }))
    const result = yield* callAuthProbe(app, scenario, "missing")
    if (scenario.auth === "protected") {
      if (result.status !== 401) throw new Error(`auth expected 401, got ${result.status}`)
      const authed = yield* callAuthProbe(app, scenario, "valid")
      if (authed.status === 401) throw new Error("auth rejected valid credentials")
      return
    }
    if (scenario.auth === "ticket-bypass") {
      // The ticket is the only credential: header auth is skipped, and Basic must not stand in for a missing ticket.
      if (result.status !== 401) throw new Error(`auth expected 401 without a ticket, got ${result.status}`)
      const authed = yield* callAuthProbe(app, scenario, "valid")
      if (authed.status !== 401) throw new Error(`auth expected Basic not to replace the ticket, got ${authed.status}`)
      return
    }

    if (result.status === 401) throw new Error("auth expected public access, got 401")
    if (result.timedOut) throw new Error("auth expected public access, probe timed out")
  })
}

function runActive(options: Options, scenario: ActiveScenario) {
  return Effect.acquireRelease(
    Effect.gen(function* () {
      yield* trace(options, scenario, "context acquire")
      const dir = scenario.project
        ? yield* Effect.promise(() => projectDirectory(scenario.project ?? {}))
        : undefined
      return { dir, app: makeApp({ auth: scenario.basicAuth }) }
    }),
    (context) =>
      Effect.promise(async () => {
        await context.app.dispose().catch(() => undefined)
        await context.dir?.[Symbol.asyncDispose]().catch(() => undefined)
      }),
  ).pipe(
    Effect.flatMap((context) =>
      Effect.gen(function* () {
        const ctx = scenarioContext(context.app, context.dir?.path, scenario.basicAuth)
        yield* trace(options, scenario, "seed start")
        const state = yield* scenario.seed(ctx)
        const seeded: SeededContext<unknown> = { ...ctx, state }
        yield* trace(options, scenario, "request start")
        const result = yield* call(context.app, scenario, scenario.request(seeded, state))
        yield* trace(options, scenario, `response ${result.status}`)
        yield* scenario.expect(seeded, state, result)
        yield* trace(options, scenario, "expect done")
      }),
    ),
  )
}

/** A scratch directory, optionally a git repository with one commit so project identity resolves. */
async function projectDirectory(project: ProjectOptions) {
  const dir = await tmpdir()
  if (project.git) {
    await $`git init -q`.cwd(dir.path).quiet()
    await $`git config commit.gpgsign false`.cwd(dir.path).quiet()
    await $`git config user.email test@orchestra.test`.cwd(dir.path).quiet()
    await $`git config user.name Test`.cwd(dir.path).quiet()
    await $`git commit -q --allow-empty -m root`.cwd(dir.path).quiet()
  }
  if (project.config) await Bun.write(`${dir.path}/orchestra.json`, JSON.stringify(project.config))
  // Only the user's own config can trust a project; Scenarios run one at a time, so each trusted one replaces it.
  if (project.trusted)
    await Bun.write(path.join(exerciseConfigDirectory, "orchestra.json"), JSON.stringify({ trusted_projects: [dir.path] }))
  await project.init?.(dir.path)
  return dir
}

function scenarioContext(app: ExerciseApp, directory: string | undefined, authenticated: boolean): ScenarioContext {
  const headers = (extra?: Record<string, string>) => ({
    ...(directory ? { "x-orchestra-directory": directory } : {}),
    ...extra,
  })
  const send = (path: string, init: { method?: string; body?: unknown } = {}) =>
    Effect.promise(async () => {
      const url = new URL(path, "http://localhost")
      if (directory) url.searchParams.set("location[directory]", directory)
      const response = await app.request(
        new Request(url, {
          method: init.method ?? "GET",
          headers: {
            ...(init.body === undefined ? {} : { "content-type": "application/json" }),
            ...(authenticated ? { authorization: basic() } : {}),
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        }),
      )
      const text = await response.text()
      if (!response.ok) throw new Error(`seed ${init.method ?? "GET"} ${path} failed with ${response.status}: ${text}`)
      return JSON.parse(text) as unknown
    })
  return {
    directory,
    headers,
    file: (name, content) =>
      Effect.promise(() => {
        if (!directory) throw new Error("scenario needs a project directory")
        return Bun.write(`${directory}/${name}`, content)
      }).pipe(Effect.asVoid),
    observe: (method, path, body) =>
      Effect.promise(async () =>
        capture(
          await app.request(
            new Request(locate(path, headers()), {
              method: method.toUpperCase(),
              headers: {
                ...(body === undefined ? {} : { "content-type": "application/json" }),
                ...(authenticated ? { authorization: basic() } : {}),
              },
              body: body === undefined ? undefined : JSON.stringify(body),
            }),
          ),
          "full",
        ),
      ),
    session: () =>
      send("/api/session", { method: "POST", body: { location: { directory } } }).pipe(
        Effect.map((body) => {
          if (!isRecord(body) || !isRecord(body.data) || typeof body.data.id !== "string")
            throw new Error("session create did not return an id")
          return { id: body.data.id }
        }),
      ),
    project: () =>
      send("/api/location").pipe(
        Effect.map((body) => {
          if (!isRecord(body) || !isRecord(body.project) || typeof body.project.id !== "string")
            throw new Error("location did not name a project")
          return { id: body.project.id, directory: String(body.project.directory) }
        }),
      ),
  }
}

function trace(options: Options, scenario: ActiveScenario, phase: string) {
  return Effect.sync(() => {
    if (options.trace) console.log(`[trace] ${scenario.name}: ${phase}`)
  })
}
