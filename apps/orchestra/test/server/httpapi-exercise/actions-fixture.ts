import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Context, Effect, Option, Schema, Scope } from "effect"
import { chmod, mkdir } from "node:fs/promises"
import path from "node:path"
import { check, stable } from "./assertions"
import { call } from "./backend"
import { http, route } from "./dsl"
import { bindingInput, nativeReplies, Reply, Replies, workflowPath, workflowText } from "./actions-native-data"
import { RunnerConfig, ScopedNativeCall } from "./actions-native-scope"
import type { Method, ScenarioContext } from "./types"

export function seedActions(ctx: ScenarioContext, state = "completed") {
  return Effect.withFiber((fiber) => Effect.gen(function* () {
    check(ctx.directory !== undefined, "ActionsFixtureError:isolated-directory-missing")
    // DSL seed callbacks omit Scope in their type. Register against the runner's existing lifetime,
    // not a seed-local Effect.scoped that would restore PATH before the HTTP request.
    const scope = Context.getOption(fiber.context, Scope.Scope)
    check(Option.isSome(scope), "ActionsFixtureError:runner-scope-missing")
    const directory = ctx.directory
    const bin = path.join(directory, ".httpapi-actions")
    const config = path.join(bin, "config")
    yield* Effect.promise(() => mkdir(config, { recursive: true, mode: 0o700 }))
    // Ledger owns only CLI discovery/config placement. Ambient tokens are never cleared or copied to disk.
    const owned = /^(PATH|GH_CONFIG_DIR)$/i
    const environment = Object.entries(process.env).filter(([key]) => owned.test(key))
    yield* Scope.addFinalizer(scope.value, Effect.sync(() => {
      Object.keys(process.env).filter((key) => owned.test(key))
        .forEach((key) => delete process.env[key])
      environment.forEach(([key, value]) => { process.env[key] = value })
    }))
    yield* Effect.promise(() => Bun.write(path.join(config, "hosts.yml"),
      "github.com:\n  user: fixture-actor\n  oauth_token: fixture-only-never-sent\n  git_protocol: https\n"))
    // The expectation comes from fixture ownership, never the owner's ambient config or a child observation.
    const runnerConfig = RunnerConfig.make({
      directory,
      environment: { GH_CONFIG_DIR: config },
      credentialSelection: "config",
    })
    yield* Effect.promise(() => Bun.write(path.join(bin, "runner-config.json"), JSON.stringify(runnerConfig)))
    const cli = path.join(import.meta.dirname, "actions-native-cli.ts")
    yield* Effect.forEach(["gh", "glab"], (name) => Effect.promise(async () => {
      const executable = path.join(bin, process.platform === "win32" ? `${name}.cmd` : name)
      const invocation = `"${process.execPath}" "${cli}" "${bin}" "${name}"`
      await Bun.write(executable, process.platform === "win32" ? `@${invocation} %*\r\n` : `#!/bin/sh\nexec ${invocation} "$@"\n`)
      if (process.platform !== "win32") await chmod(executable, 0o755)
    }))
    const search = process.env.PATH ?? process.env.Path ?? ""
    Object.keys(process.env).filter((key) => owned.test(key)).forEach((key) => delete process.env[key])
    process.env.PATH = bin + path.delimiter + search
    process.env.GH_CONFIG_DIR = config
    yield* ctx.file(workflowPath, workflowText)
    yield* actionsGit(directory, ["add", workflowPath])
    yield* actionsGit(directory, ["-c", "user.name=Actions Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Actions HTTP sources"])
    yield* actionsGit(directory, ["remote", "add", "origin", "https://github.com/acme/widgets.git"])
    const commit = yield* actionsGit(directory, ["rev-parse", "HEAD"])
    const blob = yield* actionsGit(directory, ["rev-parse", `HEAD:${workflowPath}`])
    yield* Effect.promise(() => Bun.write(path.join(bin, "replies.json"), JSON.stringify(nativeReplies(commit, blob, state))))
    yield* Effect.promise(() => Bun.write(path.join(bin, "calls.jsonl"), ""))
    yield* Effect.promise(() => Bun.write(path.join(bin, "fixture-errors.jsonl"), ""))
    return { bin, commit, blob, directory, runnerConfig }
  }))
}

export function seedBinding(ctx: ScenarioContext, state = "completed") {
  return Effect.gen(function* () {
    const native = yield* seedActions(ctx, state)
    const result = yield* actionsRequest(ctx, "POST", "/api/actions/binding", bindingInput)
    check(result.status === 200, `ActionsFixtureError:create-binding:${result.text}`)
    const projectID = createdProject(result.body, native)
    const binding = decodeLocation(Actions.Binding, result.body, { ...native, projectID })
    check(binding.revision === 1 && binding.projectID === "1234" && binding.account === "fixture-actor", "native binding identity must be observed")
    return { ...native, projectID, binding, ref: { id: binding.id, revision: binding.revision } }
  })
}

export function actionPath(template: string, binding: { id: string; revision: number }, params: Record<string, string> = {}, query: Record<string, string> = {}) {
  return route(template, { bindingID: binding.id, ...params }) + "?" + new URLSearchParams({ revision: String(binding.revision), ...query })
}

export function actionsRequest(ctx: ScenarioContext, method: Method, pathname: string, body?: unknown) {
  const builder = method === "GET" ? http.protected.get : method === "POST" ? http.protected.post
    : method === "PUT" ? http.protected.put : method === "PATCH" ? http.protected.patch : http.protected.delete
  return call(builder(pathname, "actions.fixture.request").at(() => ({ path: pathname, body, headers: ctx.headers() })).json(),
    { ...ctx, state: undefined })
}

// Adding the origin remote in seedActions re-keys the Project, while the runner's instance keeps its pre-seed identity.
// Pin the Project of the Location that admitted the binding, after checking it is this directory's; later responses must retain it.
export function createdProject(body: unknown, native: { directory: string }) {
  const created = Schema.decodeUnknownSync(Location.response(Actions.Binding))(body)
  check(created.location.directory === native.directory && created.location.project.directory === native.directory,
    "Actions binding must be created at the selected Location")
  return created.location.project.id
}

export function decodeLocation<A>(schema: Schema.Decoder<A>, body: unknown, native: { directory: string; projectID: string }) {
  const result = Schema.decodeUnknownSync(Location.response(schema))(body)
  check(result.location.directory === native.directory && result.location.project.id === native.projectID, "Actions response must retain selected Location")
  check(result.location.workspaceID === undefined, "implicit-local Actions fixture must not invent workspace placement")
  return result.data
}

export function nativeCalls(native: { bin: string }) {
  return Effect.promise(async () => {
    check((await Bun.file(path.join(native.bin, "fixture-errors.jsonl")).text()) === "", "ActionsFixtureError:unrecorded-or-unsupported-call")
    return (await Bun.file(path.join(native.bin, "calls.jsonl")).text()).split("\n").filter(Boolean)
      .map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(ScopedNativeCall), { onExcessProperty: "error" })(line))
  })
}

export function prepareActions(ctx: ScenarioContext, native: Effect.Success<ReturnType<typeof seedBinding>>,
  kind: Actions.OperationKind, target: Actions.OperationTarget, expected?: Actions.OperationExpected) {
  return Effect.gen(function* () {
    const intent = Actions.OperationIntent.make({ clientID: crypto.randomUUID(), binding: native.ref, kind, target, expected })
    const result = yield* actionsRequest(ctx, "POST", actionPath("/api/actions/operation/{bindingID}", native.ref), intent)
    check(result.status === 200, `ActionsFixtureError:admit:${result.text}`)
    const operation = decodeLocation(Actions.Operation, result.body, native)
    check(operation.state === "prepared" && operation.bindingID === native.binding.id && stable(operation.target) === stable(target), "admission must durably freeze target")
    return { ...native, intent, operation }
  })
}

export function setNativeReply(native: { bin: string }, key: string, reply: typeof Reply.Type) {
  return Effect.promise(async () => {
    const filename = path.join(native.bin, "replies.json")
    const replies = Schema.decodeUnknownSync(Schema.fromJsonString(Replies))(await Bun.file(filename).text())
    check(key in replies, "ActionsFixtureError:override-of-unrecorded-endpoint")
    await Bun.write(filename, JSON.stringify({ ...replies, [key]: reply }))
  })
}

export function actionsGit(directory: string, args: string[]) {
  return Effect.promise(async () => {
    const { AppProcess } = await import("@orchestra/core/process")
    const { LayerNode } = await import("@orchestra/core/effect/layer-node")
    const { ChildProcess } = await import("effect/unstable/process")
    const result = await Effect.runPromise(AppProcess.Service.use((proc) => proc.run(ChildProcess.make("git", args, {
      cwd: directory, stdin: "ignore", stdout: "pipe", stderr: "pipe", extendEnv: false,
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key))),
    }), { maxOutputBytes: 64 * 1024, maxErrorBytes: 4 * 1024, timeout: "10 seconds" })).pipe(
      Effect.provide(LayerNode.compile(AppProcess.node)), Effect.scoped,
    ))
    check(!result.stdoutTruncated && !result.stderrTruncated, "ActionsFixtureError:git-output-truncated")
    check(result.exitCode === 0, "ActionsFixtureError:git-failed")
    return result.stdout.toString("utf8").trim()
  })
}
