import { expect } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { Deferred, Effect, Fiber, Schema } from "effect"
import type { SDKMessage, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import { FSUtil } from "@orchestra/core/fs-util"
import { TestInstance } from "../fixture/fixture"
import { pollWithTimeout } from "../lib/effect"
import { Global } from "@orchestra/core/global"
import { hash } from "@/continuity/archive-format"
import { SessionRevert } from "@/session/revert"
import { ClaudeEngineFixture } from "./engine-fixture"

ClaudeEngineFixture.it.instance("cancel stops Claude Code and marks the turn aborted", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.state.queries.length = 0
    const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
    let aborted = false
    ClaudeEngineFixture.state.scripts.push(async function* (signal) {
      yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
      yield { type: "assistant", message: { id: "msg_c", content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "sleep 60" } }], stop_reason: null, usage: {} }, ...ClaudeEngineFixture.frame }
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve() }))
    })
    const run = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("long job") }).pipe(Effect.forkChild)
    yield* pollWithTimeout(sessions.messages({ sessionID: chat.id }).pipe(Effect.map((list) =>
      list.some((message) => message.parts.some((part) => part.type === "tool")) ? true : undefined)), "no tool part", "10 seconds")
    yield* prompt.cancel(chat.id)
    yield* Fiber.await(run)
    expect(aborted).toBe(true)
    const last = (yield* sessions.messages({ sessionID: chat.id })).findLast((message) => message.info.role === "assistant")!
    expect((last.info as SessionV1.Assistant).error?.name).toBe("MessageAbortedError")
    const tool = last.parts.find((part) => part.type === "tool")
    expect(tool?.type === "tool" && tool.state.status).toBe("error")
  }), 30_000)

ClaudeEngineFixture.it.instance("a native record corruption produces exactly one completed host error and blocks resume", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  const fs = yield* FSUtil.Service
  const context = yield* Effect.context<never>()
  ClaudeEngineFixture.state.scripts.push(async function* () {
    yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
    await Effect.runPromiseWith(context)(fs.writeFileString(path.join(Global.Path.data, "claude-code", hash(chat.id), "archive.sqlite"), "{corrupt"))
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: "corrupt-assistant", message: { id: "corrupt-api", content: [{ type: "tool_use", id: "late", name: "Bash", input: {} }], usage: {}, stop_reason: "tool_use" } }
  })
  const result = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("record fails") })
  expect(result.info.role === "assistant" && result.info.finish).toBe("error")
  const assistants = (yield* sessions.messages({ sessionID: chat.id })).filter((message) => message.info.role === "assistant")
  expect(assistants).toHaveLength(1)
  expect(assistants[0].info.time).toHaveProperty("completed")
  expect(assistants[0].parts.some((part) => part.type === "tool" && part.state.status === "running")).toBe(false)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeArchiveFailed: true })
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("blocked resume") })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
}), 60_000)

ClaudeEngineFixture.it.instance("a native filesystem failure cannot recurse through record when constructing its host error reply", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  const fs = yield* FSUtil.Service
  const context = yield* Effect.context<never>()
  const dir = path.join(Global.Path.data, "claude-code", hash(chat.id))
  ClaudeEngineFixture.state.scripts.push(async function* () {
    yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
    await Effect.runPromiseWith(context)(fs.remove(dir, { recursive: true }).pipe(Effect.andThen(fs.writeFileString(dir, "not a directory"))))
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: "fs-failed", message: { id: "fs-api", content: [{ type: "text", text: "uncommitted" }], usage: {}, stop_reason: "end_turn" } }
  })
  const result = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("filesystem error") })
  expect(result.info.role === "assistant" && result.info.finish).toBe("error")
  expect((yield* sessions.messages({ sessionID: chat.id })).filter((message) => message.info.role === "assistant")).toHaveLength(1)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeArchiveFailed: true })
}), 60_000)

ClaudeEngineFixture.it.instance("Stop joins a held mirror record and query.return disposal before creating the aborted reply", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  const lockEntered = yield* Deferred.make<void>()
  const lockRelease = yield* Deferred.make<void>()
  const disposing = yield* Deferred.make<void>()
  const cancelled = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  const cleanup: { release?: () => void; disposed: boolean } = { disposed: false }
  const fs = yield* FSUtil.Service
  const data = yield* fs.realPath(Global.Path.data)
  yield* Effect.addFinalizer(() => Deferred.succeed(lockRelease, undefined).pipe(Effect.andThen(Effect.sync(() => cleanup.release?.()))))
  // Hold the actual record's asynchronous path check after preflight, independently of the kernel DB transaction.
  ClaudeEngineFixture.state.scripts.push(async function* () {
    yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
    ClaudeEngineFixture.state.heldRead.plan = { file: path.join(data, "claude-code", hash(chat.id)), entered: lockEntered, release: lockRelease }
    const release = new Promise<void>((resolve) => { cleanup.release = resolve })
    try {
      yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: "held", message: { id: "held-api", content: [{ type: "tool_use", id: "never-running", name: "Bash", input: {} }], usage: {}, stop_reason: "tool_use" } }
    } finally {
      await Effect.runPromiseWith(context)(Deferred.succeed(disposing, undefined))
      await release
      cleanup.disposed = true
    }
  })
  const worker = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("held record") }).pipe(Effect.forkChild)
  yield* Deferred.await(lockEntered)
  yield* pollWithTimeout(sessions.messages({ sessionID: chat.id }).pipe(Effect.map((list) => list.some((message) => message.info.role === "assistant") ? true : undefined)), "mirror did not open")
  const stop = yield* prompt.cancel(chat.id).pipe(Effect.andThen(Deferred.succeed(cancelled, undefined)), Effect.forkChild)
  expect(yield* Deferred.isDone(cancelled)).toBe(false)
  yield* Deferred.succeed(lockRelease, undefined)
  yield* Deferred.await(disposing)
  expect(yield* Deferred.isDone(cancelled)).toBe(false)
  cleanup.release?.()
  yield* Fiber.join(stop)
  yield* Fiber.await(worker)
  expect(cleanup.disposed).toBe(true)
  const assistants = (yield* sessions.messages({ sessionID: chat.id })).filter((message) => message.info.role === "assistant")
  expect(assistants).toHaveLength(1)
  expect(assistants[0].info.role === "assistant" && assistants[0].info.error?.name).toBe("MessageAbortedError")
  expect(assistants[0].parts.some((part) => part.type === "tool" && part.state.status === "running")).toBe(false)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toMatchObject({ nativeArchiveFailed: true })
}), 120_000)

for (const mode of ["success", "return-error", "construct-error", "cancel"]) {
  ClaudeEngineFixture.it.instance(`engine joins real child before turn settles (${mode})`, () => Effect.gen(function* () {
    ClaudeEngineFixture.state.queries.length = 0
    ClaudeEngineFixture.state.scripts.length = 0
    const { directory } = yield* TestInstance
    writeFileSync(path.join(directory, ".credentials.json"), JSON.stringify({ claudeAiOauth: {
      accessToken: "local-test-token", refreshToken: "local-test-refresh", expiresAt: 4102444800000, scopes: ["user:inference"],
    } }))
    const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
    const entered = yield* Deferred.make<void>()
    const returned = yield* Deferred.make<void>()
    const done = yield* Deferred.make<void>()
    const context = yield* Effect.context<never>()
    const children: SpawnedProcess[] = []
    const environments: Promise<string>[] = []
    yield* Effect.addFinalizer(() => Effect.sync(() => { ClaudeEngineFixture.state.construct = undefined; children.forEach((child) => child.kill("SIGKILL")) }))
    ClaudeEngineFixture.state.construct = (params) => {
      if (!params.options?.spawnClaudeCodeProcess || !params.options.env) throw new Error("missing lifetime options")
      expect(params.options.env).toEqual({ HOME: directory, CLAUDE_CONFIG_DIR: directory, CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: "1" })
      expect(params.options.managedSettings).toBeUndefined()
      const child = params.options.spawnClaudeCodeProcess({ command: process.execPath, args: ["-e", `
        process.stdin.resume();
        process.stdin.on("end", () => setInterval(() => {
          if (require("node:fs").existsSync(${JSON.stringify(path.join(directory, "release-child"))})) process.exit(0);
        }, 10));
        process.stdout.write(JSON.stringify(process.env));
      `], env: params.options.env, signal: new AbortController().signal })
      children.push(child)
      const environment = new Promise<string>((resolve, reject) => {
        child.stdout.once("data", (data: Buffer) => resolve(data.toString()))
        child.once("error", reject)
        child.once("exit", () => reject(new Error("child exited before environment receipt")))
      })
      environment.catch(() => {})
      environments.push(environment)
      if (mode === "construct-error") {
        // No Query exists to dispose this child; only the pre-registered finalizer owns it.
        params.options.abortController?.signal.addEventListener("abort", () => child.stdin.end(), { once: true })
        void Effect.runPromiseWith(context)(Deferred.succeed(returned, undefined))
        throw new Error("query constructor threw after spawn")
      }
      return Object.assign((async function* () {
        await environment
        if (mode === "cancel") {
          const aborted = new Promise<void>((resolve) => params.options?.abortController?.signal.addEventListener("abort", () => resolve(), { once: true }))
          yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
          await Effect.runPromiseWith(context)(Deferred.succeed(entered, undefined))
          await aborted
          return
        }
        yield* ClaudeEngineFixture.reply("joined", "joined-api")(params.options?.abortController?.signal ?? AbortSignal.any([]), params) as AsyncGenerator<SDKMessage>
      })(), {
        close: () => child.stdin.end(),
        return: async () => {
          await Effect.runPromiseWith(context)(Deferred.succeed(returned, undefined))
          if (mode === "return-error") throw new Error("query.return rejected")
          return { done: true as const, value: undefined }
        },
      }) as unknown as ReturnType<ClaudeCodeSDK.Interface["query"]>
    }
    const worker = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("local child only") }).pipe(
      Effect.provideService(ClaudeCodeSDK.Environment, { HOME: directory, CLAUDE_CONFIG_DIR: directory, ANTHROPIC_API_KEY: "must-strip",
        ANTHROPIC_BASE_URL: "https://must-strip.invalid", CLAUDE_CODE_USE_VERTEX: "1", CLAUDE_CODE_OAUTH_TOKEN: "must-strip-host-token" }),
      Effect.onExit(() => Deferred.succeed(done, undefined)), Effect.forkChild)
    const stop = mode === "cancel" ? yield* Effect.raceFirst(Deferred.await(entered), Deferred.await(done).pipe(
      Effect.andThen(Effect.die(new Error("engine settled before cancellation readiness"))))).pipe(
        Effect.andThen(prompt.cancel(chat.id)), Effect.forkChild) : undefined
    yield* Effect.raceFirst(Deferred.await(returned), Deferred.await(done).pipe(
      Effect.andThen(Effect.die(new Error("engine settled before query disposal")))))
    yield* Effect.yieldNow
    expect(children).toHaveLength(1)
    expect(children[0].exitCode).toBeNull()
    expect(yield* Deferred.isDone(done)).toBe(false)
    expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(yield* Effect.promise(() => environments[0]))).toEqual({
      HOME: directory, CLAUDE_CONFIG_DIR: directory, CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: "1",
      CLAUDE_CODE_OAUTH_TOKEN: "local-test-token", CLAUDE_CODE_OAUTH_SCOPES: "user:inference",
    })
    writeFileSync(path.join(directory, "release-child"), "release")
    yield* Fiber.await(worker)
    if (stop) yield* Fiber.join(stop)
    expect(children[0].exitCode).toBe(0)
    const result = (yield* sessions.messages({ sessionID: chat.id })).findLast((message) => message.info.role === "assistant")
    expect(result?.info.role === "assistant" && result.info.finish).toBe(mode === "success" ? "stop" : "error")
    if (mode === "return-error" || mode === "construct-error")
      expect(result?.info.role === "assistant" && result.info.error?.data).toMatchObject({ message:
        mode === "return-error" ? "query.return rejected" : "query constructor threw after spawn" })
    if (mode === "cancel") {
      expect(result?.info.role === "assistant" && result.info.error?.name).toBe("MessageAbortedError")
      expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toMatchObject({ nativeArchiveFailed: true })
    }
    ClaudeEngineFixture.state.construct = undefined
  }), 60_000)
}

ClaudeEngineFixture.it.instance("ordinary SDK Stop retains real patch evidence and SessionRevert restores edited file bytes", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { directory } = yield* TestInstance
  const file = path.join(directory, "notes.txt")
  writeFileSync(file, "original bytes\n")
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  const changed = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  ClaudeEngineFixture.state.scripts.push(async function* (signal) {
    const stopped = new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()))
    yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: "edit-step", message: { id: "edit-api", content: [{ type: "tool_use", id: "editing", name: "Bash", input: { command: "recorded edit" } }], usage: {}, stop_reason: "tool_use" } }
    writeFileSync(file, "SDK edited bytes\n")
    await Effect.runPromiseWith(context)(Deferred.succeed(changed, undefined))
    await stopped
  })
  const worker = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("edit and hold") }).pipe(Effect.forkChild)
  yield* Deferred.await(changed)
  yield* prompt.cancel(chat.id)
  yield* Fiber.await(worker)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toMatchObject({ nativeArchiveFailed: true })
  const history = yield* sessions.messages({ sessionID: chat.id })
  expect(history.flatMap((message) => message.parts).some((part) => part.type === "patch" && part.files.some((path) => path.endsWith("notes.txt")))).toBe(true)
  const user = history.find((message) => message.info.role === "user")
  if (!user) throw new Error("Missing original user")
  const revert = yield* SessionRevert.Service
  yield* revert.revert({ sessionID: chat.id, messageID: user.info.id })
  expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("original bytes\n")
}), { git: true }, 120_000)
