import { createRoutes } from "@orchestra/server/routes"
import { Context, Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { parse } from "./assertions"
import { exerciseProbeDirectory } from "./environment"
import type { ActiveScenario, BackendApp, CallResult, CaptureMode, RequestSpec } from "./types"

export type ExerciseApp = BackendApp & { readonly dispose: () => Promise<void>; ready?: Promise<void> }

const credentials = { username: "orchestra", password: "secret" }

/**
 * The whole V2 server, built from `createRoutes` the way `webHandler` builds it. A fresh memo map means a fresh
 * in-memory database and fresh Location services, so one Scenario never sees another's state. Passing a password turns
 * Basic auth on; without one the server runs open, as it does for a local desktop.
 */
export function makeApp(options: { auth: boolean }): ExerciseApp {
  const web = HttpRouter.toWebHandler(
    createRoutes(options.auth ? { password: credentials.password } : {}).pipe(Layer.provide(HttpServer.layerServices)),
    { disableLogger: true, memoMap: Layer.makeMemoMapUnsafe() },
  )
  return {
    dispose: web.dispose,
    request: (input, init) =>
      web.handler(
        input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init),
        Context.makeUnsafe<unknown>(new Map()),
      ),
  }
}

export function call(app: ExerciseApp, scenario: ActiveScenario, spec: RequestSpec) {
  return Effect.promise(async () => capture(await app.request(toRequest(scenario, spec)), scenario.capture))
}

export function callAuthProbe(app: ExerciseApp, scenario: ActiveScenario, mode: "missing" | "valid" = "missing") {
  return Effect.promise(async () => {
    // The deadline below bounds a public route that never finishes, not startup. The first request builds every
    // route layer, which on a cold runner can outlast the deadline and turn a protected route's 401 into a timeout,
    // so the clock starts only after one untimed request that the auth layer answers without a handler.
    app.ready ??= Promise.resolve(app.request(new Request("http://localhost/api/health"))).then((response) =>
      response.body?.cancel(),
    )
    await app.ready
    const controller = new AbortController()
    return Promise.race([
      Promise.resolve(app.request(toAuthProbeRequest(scenario, mode, controller.signal))).then((response) =>
        capture(response, scenario.capture),
      ),
      Bun.sleep(1_000).then(() => {
        controller.abort("auth probe timed out")
        return { status: 0, contentType: "", text: "auth probe timed out", body: undefined, timedOut: true }
      }),
    ])
  })
}

function toRequest(scenario: ActiveScenario, spec: RequestSpec) {
  const headers = scenario.basicAuth ? { ...spec.headers, authorization: basic() } : spec.headers
  return new Request(locate(spec.path, headers), {
    method: scenario.method,
    headers: spec.body === undefined ? headers : { "content-type": spec.contentType ?? "application/json", ...headers },
    body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
  })
}

function toAuthProbeRequest(scenario: ActiveScenario, mode: "missing" | "valid", signal: AbortSignal) {
  const spec = scenario.authProbe ?? {
    path: authProbePath(scenario.path),
    body: scenario.method === "GET" ? undefined : {},
  }
  const headers = {
    ...(spec.body === undefined ? {} : { "content-type": "application/json" }),
    // Without a directory the server falls back to process.cwd(), this package's checkout, where valid-credential
    // probes would register git worktrees and branches in the real repository.
    "x-orchestra-directory": exerciseProbeDirectory,
    ...spec.headers,
    ...(mode === "valid" ? { authorization: basic() } : {}),
  }
  return new Request(locate(spec.path, headers), {
    method: scenario.method,
    headers,
    body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
    signal,
  })
}

/**
 * V2 names a Location with the `location[directory]` query. Scenarios keep stating it as the `x-orchestra-directory`
 * header (`ctx.headers()`), so this is where the header becomes the query a client would send.
 */
export function locate(path: string, headers: Record<string, string> | undefined) {
  const url = new URL(path, "http://localhost")
  const directory = headers?.["x-orchestra-directory"]
  if (directory && !url.searchParams.has("location[directory]")) url.searchParams.set("location[directory]", directory)
  return url
}

export function basic() {
  return `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`
}

function authProbePath(path: string) {
  return path
    .replace(/\{([^}]+)\}/g, (_match, key: string) => `auth_${key}`)
    .replace(/:([^/]+)/g, (_match, key: string) => `auth_${key}`)
}

export async function capture(response: Response, mode: CaptureMode): Promise<CallResult> {
  const text = mode === "stream" ? await captureStream(response) : await response.text()
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    text,
    body: parse(text),
    timedOut: false,
  }
}

async function captureStream(response: Response) {
  if (!response.body) return ""
  const reader = response.body.getReader()
  const read = reader.read().then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  )
  const winner = await Promise.race([read, Bun.sleep(1_000).then(() => ({ timeout: true }))])
  if ("timeout" in winner) {
    await reader.cancel("timed out waiting for stream chunk").catch(() => undefined)
    throw new Error("timed out waiting for stream chunk")
  }
  if ("error" in winner) throw winner.error
  await reader.cancel().catch(() => undefined)
  if (winner.result.done) return ""
  return new TextDecoder().decode(winner.result.value)
}
