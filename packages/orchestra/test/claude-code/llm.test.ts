import { expect } from "bun:test"
import { Deferred, Effect, Exit, Fiber, Stream } from "effect"
import type { SDKMessage, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeLLM } from "@/claude-code/llm"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import type { LLM } from "@/session/llm"
import { SessionID, MessageID } from "@/session/schema"
import { ProviderTest } from "../fake/provider"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { it } from "../lib/effect"
import { tmpdir } from "../fixture/fixture"

const input: LLM.StreamInput = {
  sessionID: SessionID.descending(), model: ProviderTest.model({ id: ModelV2.ID.make("claude-haiku-4-5-20251001") }),
  user: { id: MessageID.ascending(), sessionID: SessionID.descending(), role: "user", agent: "continuity",
    model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-haiku-4-5-20251001") }, time: { created: 0 } },
  agent: { name: "continuity", mode: "subagent", permission: [], options: {}, prompt: "host memory instruction" },
  system: ["host system"], tools: {}, purpose: "context-maintenance",
  messages: [{ role: "user", content: "history" }, { role: "assistant", content: "historical reply" }],
}
const frame = { session_id: "isolated", uuid: "memory", parent_tool_use_id: null }
const assistant = (content: unknown[], stop_reason = "end_turn") => ({ type: "assistant", ...frame,
  message: { id: "memory", model: input.model.id, content, stop_reason, usage: {} } })
const result = { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", ...frame }

function scripted(messages: unknown[]) {
  const calls: Parameters<ClaudeCodeSDK.Interface["query"]>[0][] = []
  let closed = 0
  const sdk: ClaudeCodeSDK.Interface = { query: (params) => {
    calls.push(params)
    return Object.assign((async function* () { yield* messages as SDKMessage[] })(), { close: () => { closed++ } }) as ReturnType<ClaudeCodeSDK.Interface["query"]>
  } }
  return { adapter: ClaudeCodeLLM.create(sdk), calls, closed: () => closed }
}

it.live("SDK maintenance is isolated, role-preserving, and finishes only on a successful result", Effect.gen(function* () {
  const fixture = scripted([assistant([{ type: "text", text: '{"ops":[]}' }]), result])
  const events = yield* Stream.runCollect(fixture.adapter.stream(input))
  expect(events.map((event) => event.type)).toEqual(["text-start", "text-delta", "text-end", "finish"])
  expect(fixture.calls).toHaveLength(1)
  expect(fixture.calls[0].options).toMatchObject({ model: input.model.id, tools: [], mcpServers: {}, strictMcpConfig: true,
    disallowedTools: ["*"], maxTurns: 1, persistSession: false, settingSources: [],
    systemPrompt: { type: "custom", prompt: "host system\n\nhost memory instruction" } })
  expect(fixture.calls[0].options?.resume).toBeUndefined()
  expect(fixture.calls[0].prompt).toContain(JSON.stringify(input.messages))
  expect(fixture.closed()).toBe(1)
}))

it.live("maintenance rejects tools, truncation, missing result, and success carrying an API error", Effect.gen(function* () {
  for (const messages of [
    [assistant([{ type: "tool_use", id: "t", name: "Bash", input: {} }]), result],
    [assistant([{ type: "text", text: "partial" }], "max_tokens"), result],
    [assistant([{ type: "text", text: "partial" }])],
    [assistant([{ type: "text", text: "failure" }]), { ...result, is_error: true }],
  ]) {
    const fixture = scripted(messages)
    expect(Exit.isFailure(yield* Stream.runCollect(fixture.adapter.stream(input)).pipe(Effect.exit))).toBe(true)
    expect(fixture.closed()).toBe(1)
  }
}))

it.live("interrupting a real Stream scope aborts and closes the isolated SDK query", Effect.gen(function* () {
  const entered = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  let aborted = false
  let closed = false
  const sdk: ClaudeCodeSDK.Interface = { query: (params) => Object.assign((async function* () {
    const stopped = new Promise<void>((resolve) => params.options?.abortController?.signal.addEventListener("abort", () => { aborted = true; resolve() }))
    await Effect.runPromiseWith(context)(Deferred.succeed(entered, undefined))
    await stopped
  })(), { close: () => { closed = true } }) as ReturnType<ClaudeCodeSDK.Interface["query"]> }
  const fiber = yield* Stream.runCollect(ClaudeCodeLLM.create(sdk).stream(input)).pipe(Effect.forkChild)
  yield* Deferred.await(entered)
  yield* Fiber.interrupt(fiber)
  expect(aborted).toBe(true)
  expect(closed).toBe(true)
}))

it.live("producer cancellation joins asynchronous query.return disposal before releasing its Stream scope", Effect.gen(function* () {
  const entered = yield* Deferred.make<void>()
  const disposing = yield* Deferred.make<void>()
  const disposed = yield* Deferred.make<void>()
  const stopped = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  const cleanup: { release?: () => void } = {}
  yield* Effect.addFinalizer(() => Effect.sync(() => cleanup.release?.()))
  const sdk: ClaudeCodeSDK.Interface = { query: (params) => Object.assign((async function* () {
    const abort = new Promise<void>((resolve) => params.options?.abortController?.signal.addEventListener("abort", () => resolve()))
    const release = new Promise<void>((resolve) => { cleanup.release = resolve })
    try {
      await Effect.runPromiseWith(context)(Deferred.succeed(entered, undefined))
      await abort
    } finally {
      await Effect.runPromiseWith(context)(Deferred.succeed(disposing, undefined))
      await release
      await Effect.runPromiseWith(context)(Deferred.succeed(disposed, undefined))
    }
  })(), { close: () => {} }) as ReturnType<ClaudeCodeSDK.Interface["query"]> }
  const worker = yield* Stream.runCollect(ClaudeCodeLLM.create(sdk).stream(input)).pipe(Effect.forkChild)
  yield* Deferred.await(entered)
  const interrupt = yield* Fiber.interrupt(worker).pipe(Effect.andThen(Deferred.succeed(stopped, undefined)), Effect.forkChild)
  yield* Deferred.await(disposing)
  expect(yield* Deferred.isDone(stopped)).toBe(false)
  expect(yield* Deferred.isDone(disposed)).toBe(false)
  cleanup.release?.()
  yield* Fiber.join(interrupt)
  expect(yield* Deferred.isDone(disposed)).toBe(true)
}))

for (const abort of [false, true]) {
  it.live(`producer scope joins real child past SDK disposal deadline (abort and return rejection=${abort})`, Effect.gen(function* () {
    const dir = yield* Effect.acquireRelease(Effect.promise(() => tmpdir({ init: (dir) => Bun.write(`${dir}/.credentials.json`, JSON.stringify({ claudeAiOauth: {
      accessToken: "local-test-token", refreshToken: "local-test-refresh", expiresAt: 4102444800000, scopes: ["user:inference"],
    } })) })), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))
    const ready = yield* Deferred.make<void>()
    const returned = yield* Deferred.make<void>()
    const stopped = yield* Deferred.make<void>()
    const context = yield* Effect.context<never>()
    const children: SpawnedProcess[] = []
    const calls: Parameters<ClaudeCodeSDK.Interface["query"]>[0][] = []
    const sdk: ClaudeCodeSDK.Interface = { query: (params) => {
      calls.push(params)
      if (!params.options?.spawnClaudeCodeProcess || !params.options.env) throw new Error("missing lifetime options")
      const child = params.options.spawnClaudeCodeProcess({ command: process.execPath, args: ["-e", `
        process.stdin.resume();
        process.stdin.on("end", () => setTimeout(() => process.exit(0), 2600));
        process.stdout.write("ready");
      `], env: params.options.env, signal: new AbortController().signal })
      children.push(child)
      return Object.assign((async function* () {
        const interrupted = new Promise<void>((resolve) => params.options?.abortController?.signal.addEventListener("abort", () => resolve(), { once: true }))
        await new Promise<void>((resolve) => child.stdout.once("data", () => resolve()))
        await Effect.runPromiseWith(context)(Deferred.succeed(ready, undefined))
        if (abort) {
          await interrupted
          return
        }
        yield* [assistant([{ type: "text", text: "memory" }]), result] as unknown as SDKMessage[]
      })(), {
        close: () => { child.stdin.end() },
        return: async () => {
          // Same deadline as pinned SDK, while the real child remains alive for another 600ms.
          await new Promise((resolve) => setTimeout(resolve, 2000))
          await Effect.runPromiseWith(context)(Deferred.succeed(returned, undefined))
          if (abort) throw new Error("query.return rejected")
          return { done: true as const, value: undefined }
        },
      }) as unknown as ReturnType<ClaudeCodeSDK.Interface["query"]>
    } }
    const worker = yield* Stream.runCollect(ClaudeCodeLLM.create(sdk).stream(input)).pipe(
      Effect.provideService(ClaudeCodeSDK.Environment, { HOME: dir.path, CLAUDE_CONFIG_DIR: dir.path,
        ANTHROPIC_API_KEY: "paid", ANTHROPIC_AUTH_TOKEN: "paid", ANTHROPIC_BASE_URL: "https://wrong.invalid",
        CLAUDE_CODE_USE_VERTEX: "1", CLAUDE_CODE_OAUTH_TOKEN: "override" }),
      Effect.onExit(() => Deferred.succeed(stopped, undefined)), Effect.forkChild,
    )
    yield* Deferred.await(ready)
    const interrupt = abort ? yield* Fiber.interrupt(worker).pipe(Effect.forkChild) : undefined
    yield* Deferred.await(returned)
    yield* Effect.yieldNow
    expect(children[0].exitCode).toBeNull()
    expect(yield* Deferred.isDone(stopped)).toBe(false)
    expect(calls[0].options?.env).toEqual({ HOME: dir.path, CLAUDE_CONFIG_DIR: dir.path })
    if (interrupt) yield* Fiber.join(interrupt)
    if (!abort) yield* Fiber.join(worker)
    expect(children[0].exitCode).toBe(0)
    expect(yield* Deferred.isDone(stopped)).toBe(true)
  }))
}
