import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Context, Effect, Option, Schema, Scope } from "effect"
import { chmod, mkdir } from "node:fs/promises"
import path from "node:path"
import { check, stable } from "./assertions"
import { call } from "./backend"
import { http, route } from "./dsl"
import { bindingInput, NativeCall, nativeReplies, Reply, Replies, workflowPath, workflowText } from "./actions-native-data"
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
    yield* Effect.promise(() => mkdir(bin, { recursive: true }))
    const environment = Object.entries(process.env).filter(([key]) => /^(PATH|GH_TOKEN|GITHUB_TOKEN|GH_CONFIG_DIR)$/i.test(key))
    yield* Scope.addFinalizer(scope.value, Effect.sync(() => {
      Object.keys(process.env).filter((key) => /^(PATH|GH_TOKEN|GITHUB_TOKEN|GH_CONFIG_DIR)$/i.test(key))
        .forEach((key) => delete process.env[key])
      environment.forEach(([key, value]) => { process.env[key] = value })
    }))
    const cli = path.join(import.meta.dirname, "actions-native-cli.ts")
    yield* Effect.forEach(["gh", "glab"], (name) => Effect.promise(async () => {
      const executable = path.join(bin, process.platform === "win32" ? `${name}.cmd` : name)
      const invocation = `"${process.execPath}" "${cli}" "${bin}"`
      await Bun.write(executable, process.platform === "win32" ? `@${invocation} %*\r\n` : `#!/bin/sh\nexec ${invocation} "$@"\n`)
      if (process.platform !== "win32") await chmod(executable, 0o755)
    }))
    process.env.PATH = bin + path.delimiter + (process.env.PATH ?? process.env.Path ?? "")
    process.env.GH_TOKEN = ""
    process.env.GITHUB_TOKEN = ""
    process.env.GH_CONFIG_DIR = bin
    yield* ctx.file(workflowPath, workflowText)
    yield* actionsGit(directory, ["add", workflowPath])
    yield* actionsGit(directory, ["-c", "user.name=Actions Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Actions HTTP sources"])
    yield* actionsGit(directory, ["remote", "add", "origin", "https://github.com/acme/widgets.git"])
    const commit = yield* actionsGit(directory, ["rev-parse", "HEAD"])
    const blob = yield* actionsGit(directory, ["rev-parse", `HEAD:${workflowPath}`])
    yield* Effect.promise(() => Bun.write(path.join(bin, "replies.json"), JSON.stringify(nativeReplies(commit, blob, state))))
    yield* Effect.promise(() => Bun.write(path.join(bin, "calls.jsonl"), ""))
    yield* Effect.promise(() => Bun.write(path.join(bin, "fixture-errors.jsonl"), ""))
    const project = yield* ctx.project()
    return { bin, commit, blob, directory, projectID: project.id }
  }))
}

export function seedBinding(ctx: ScenarioContext, state = "completed") {
  return Effect.gen(function* () {
    const native = yield* seedActions(ctx, state)
    const result = yield* actionsRequest(ctx, "POST", "/api/actions/binding", bindingInput)
    check(result.status === 200, `ActionsFixtureError:create-binding:${result.text}`)
    const binding = decodeLocation(Actions.Binding, result.body, native)
    check(binding.revision === 1 && binding.projectID === "1234" && binding.account === "fixture-actor", "native binding identity must be observed")
    return { ...native, binding, ref: { id: binding.id, revision: binding.revision } }
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
      .map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(NativeCall))(line))
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
    const process = Bun.spawn(["git", ...args], { cwd: directory, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()])
    check(code === 0, `ActionsFixtureError:git:${stderr}`)
    return stdout.trim()
  })
}
