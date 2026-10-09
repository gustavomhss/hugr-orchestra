import { expect } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import type { SDKMessage, SessionStoreEntry, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import { LLM } from "@/session/llm"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
import { Archive } from "@/continuity/archive"
import { ClaudeCodeStore } from "@/claude-code/store"
import { FSUtil } from "@orchestra/core/fs-util"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { body } from "../continuity/service-fixture"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { TestInstance } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { makeHttp } from "../session/prompt.fixture"
import { promptSnapshot } from "./native-fixture"
import { Global } from "@orchestra/core/global"
import { hash } from "@/continuity/archive-format"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { SessionRevert } from "@/session/revert"
import { MessageID } from "@/session/schema"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelsDev } from "@orchestra/core/models-dev"
import { Provider } from "@/provider/provider"
import { hardLimit } from "@/continuity/trigger"
import { estimate } from "@/continuity/masking"

// A scripted Claude Code: each query records its options and plays the next script.
type Params = Parameters<ClaudeCodeSDK.Interface["query"]>[0]
type Script = (signal: AbortSignal, params: Params) => AsyncGenerator<unknown>
const queries: Params[] = []
const scripts: Script[] = []
let producer: ((params: Params) => AsyncGenerator<unknown>) | undefined
let producers = 0
let apiCalls = 0
let construct: ClaudeCodeSDK.Interface["query"] | undefined
const sdk = Layer.succeed(ClaudeCodeSDK.Service, ClaudeCodeSDK.Service.of({
  query: (params) => {
    queries.push(params)
    if (construct) return construct(params)
    if (params.options?.persistSession === false) {
      producers++
      if (!producer) throw new Error("Unexpected SDK producer")
      return producer(params) as ReturnType<ClaudeCodeSDK.Interface["query"]>
    }
    const script = scripts.shift()
    if (!script) throw new Error("Unexpected SDK engine query")
    return script(params.options?.abortController?.signal ?? AbortSignal.any([]), params) as ReturnType<ClaudeCodeSDK.Interface["query"]>
  },
}))

const heldRead: { plan?: { file: string; entered: Deferred.Deferred<void>; release: Deferred.Deferred<void> } } = {}
const filesystem = Layer.effect(FSUtil.Service, FSUtil.Service.use((actual) => Effect.succeed({ ...actual,
  readDirectoryEntries: (file: string) => Effect.gen(function* () {
    if (heldRead.plan?.file === file) {
      const plan = heldRead.plan
      heldRead.plan = undefined
      yield* Deferred.succeed(plan.entered, undefined)
      yield* Deferred.await(plan.release).pipe(Effect.uninterruptible)
    }
    return yield* actual.readDirectoryEntries(file)
  }),
}))).pipe(Layer.provide(LayerNode.compile(FSUtil.node)))
const it = testEffect(makeHttp({ replacements: [[ClaudeCodeSDK.node, sdk], [FSUtil.node, filesystem], [LLM.node, Layer.mock(LLM.Service, {
  stream: () => { apiCalls++; return Stream.fail(new Error("Default API transport must not run")) },
})]] }))

const frame = { parent_tool_use_id: null, uuid: "u", session_id: "sdk-1" }
const reply = (text: string, id: string): Script => async function* (_signal, params) {
  yield { type: "system", subtype: "init", ...frame }
  const key = { projectKey: params.options?.cwd ?? "fixture", sessionId: frame.session_id }
  await params.options?.sessionStore?.append(key, [{ type: "user", uuid: `${id}-user`, sessionId: key.sessionId,
    parentUuid: (await params.options?.sessionStore?.load(key))?.at(-1)?.uuid ?? null, message: { role: "user", content: params.prompt } }])
  yield { type: "assistant", message: { id, content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } }, ...frame, uuid: id }
  yield { type: "result", subtype: "success", total_cost_usd: 0.01, ...frame }
}

const setup = (continuity?: { enabled: boolean }, append?: string) => Effect.gen(function* () {
  const { directory } = yield* TestInstance
  writeFileSync(path.join(directory, "orchestra.json"), JSON.stringify({
    continuity,
    agent: { claude: { mode: "primary", engine: "claude-code", model: "anthropic/claude-haiku-4-5-20251001", prompt: append } },
  }))
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Claude Code", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  return { sessions, prompt: yield* SessionPrompt.Service, chat }
})
const say = (text: string) => ({ agent: "claude", parts: [{ type: "text" as const, text }] })

function nativeReply(index: number, options: { usage?: number; version?: string; modelKey?: string; output?: string; snapshot?: boolean; loaded?: SessionStoreEntry[][]; inspect?: (params: Params) => void } = {}): Script {
  return async function* (_signal, params) {
    options.inspect?.(params)
    const key = { projectKey: params.options?.cwd ?? "fixture", sessionId: "sdk-1" }
    const loaded = params.options?.resume ? await params.options.sessionStore?.load(key) : null
    if (loaded && options.loaded) options.loaded.push(loaded)
    yield { type: "system", subtype: "init", model: options.modelKey ?? "claude-haiku-4-5-20251001", ...frame }
    const base = { sessionId: "sdk-1", isSidechain: false, version: options.version ?? "2.1.289", cwd: key.projectKey }
    const user: SessionStoreEntry = { ...base, type: "user", uuid: `user-${index}`, parentUuid: loaded?.at(-1)?.uuid ?? null,
      message: { role: "user", content: params.prompt } }
    await params.options?.sessionStore?.append(key, [user])
    if (options.snapshot !== false) await params.options?.sessionStore?.append(key, [{ ...promptSnapshot, ...base, uuid: `snapshot-${index}`, parentUuid: user.uuid }])
    if (options.output !== undefined) {
      const call = { id: `tool-api-${index}`, model: "claude-haiku-4-5-20251001", content: [{ type: "tool_use", id: `tool-${index}`, name: "Bash", input: { command: "recorded-check" } }],
        stop_reason: "tool_use", usage: { input_tokens: 50, output_tokens: 2 } }
      yield { type: "assistant", ...frame, uuid: `call-${index}`, message: call }
      await params.options?.sessionStore?.append(key, [{ ...base, type: "assistant", uuid: `call-${index}`, parentUuid: user.uuid, message: call }])
      const receipt = { ...base, type: "user", uuid: `receipt-${index}`, parentUuid: `call-${index}`, message: { role: "user",
        content: [{ type: "tool_result", tool_use_id: `tool-${index}`, content: options.output }] } }
      yield { ...receipt, ...frame, uuid: receipt.uuid }
      await params.options?.sessionStore?.append(key, [receipt])
    }
    const message = { id: `api-${index}`, model: "claude-haiku-4-5-20251001", content: [{ type: "text", text: `answer-${index} ` + "historical padding ".repeat(120) }],
      stop_reason: "end_turn", usage: { input_tokens: options.usage ?? 50, output_tokens: 2 } }
    yield { type: "assistant", ...frame, uuid: `assistant-${index}`, message }
    await params.options?.sessionStore?.append(key, [{ ...base, type: "assistant", uuid: `assistant-${index}`, parentUuid: options.output === undefined ? user.uuid : `receipt-${index}`, message }])
    yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: index / 100, ...frame,
      // Deliberately cumulative and huge: these counters must not become current context pressure.
      modelUsage: { [options.modelKey ?? "claude-haiku-4-5-20251001"]: { contextWindow: 20_000, maxOutputTokens: 2_000, inputTokens: 999_999, outputTokens: 999_999 } } }
  }
}

const memoryProducer = async function* (params: Params) {
  expect(params.options).toMatchObject({ tools: [], persistSession: false, maxTurns: 1 })
  expect(typeof params.prompt).toBe("string")
  const historical = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(String(params.prompt).split("\n").slice(1).join("\n"))
  const reply = JSON.stringify(body({ messages: historical }, "SDK_MEMORY_NEEDLE_9C41"))
  yield { type: "assistant", ...frame, message: { id: "memory", content: [{ type: "text", text: reply }], stop_reason: "end_turn", usage: {} } }
  yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", ...frame }
}

const compactTurn: Script = async function* (_signal, params) {
  const key = { projectKey: params.options?.cwd ?? "fixture", sessionId: "sdk-1" }
  const loaded = await params.options?.sessionStore?.load(key)
  yield { type: "system", subtype: "init", ...frame }
  const base = { version: "2.1.289", sessionId: "sdk-1", isSidechain: false }
  const user = { ...base, type: "user", uuid: "compact-user", parentUuid: loaded?.at(-1)?.uuid ?? null, message: { role: "user", content: params.prompt } }
  await params.options?.sessionStore?.append(key, [user])
  const tool = { id: "compact-api", model: "claude-haiku-4-5-20251001", content: [{ type: "tool_use", id: "compact-call", name: "mcp__orchestra__context_compact", input: {} }],
    stop_reason: "tool_use", usage: { input_tokens: 50, output_tokens: 2 } }
  yield { type: "assistant", ...frame, uuid: "compact-assistant", message: tool }
  await params.options?.sessionStore?.append(key, [{ ...base, type: "assistant", uuid: "compact-assistant", parentUuid: user.uuid, message: tool }])
  const server = params.options?.mcpServers?.orchestra
  if (server?.type !== "sdk") throw new Error("Actual Orchestra SDK server missing")
  const client = new Client({ name: "scripted-cli", version: "1" })
  const transports = InMemoryTransport.createLinkedPair()
  await server.instance.connect(transports[0])
  await client.connect(transports[1])
  const result = await client.callTool({ name: "context_compact", arguments: {} })
  await client.close()
  expect(result.isError).not.toBe(true)
  expect(JSON.stringify(result)).toContain("next SDK resume")
  const receipt = { ...base, type: "user", uuid: "compact-receipt", parentUuid: "compact-assistant", message: { role: "user",
    content: [{ type: "tool_result", tool_use_id: "compact-call", content: result.content }] } }
  yield { ...receipt, ...frame, uuid: receipt.uuid, parent_tool_use_id: null }
  await params.options?.sessionStore?.append(key, [receipt])
  const answer = { id: "compact-final-api", model: "claude-haiku-4-5-20251001", content: [{ type: "text", text: "Prepared; this query still has its old native context." }],
    stop_reason: "end_turn", usage: { input_tokens: 50, output_tokens: 2 } }
  yield { type: "assistant", ...frame, uuid: "compact-final", message: answer }
  await params.options?.sessionStore?.append(key, [{ ...base, type: "assistant", uuid: "compact-final", parentUuid: receipt.uuid, message: answer }])
  yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.1, ...frame,
    modelUsage: { "claude-haiku-4-5-20251001": { contextWindow: 20_000, maxOutputTokens: 2_000 } } }
}

it.instance("a Claude Code agent's turn is mirrored and the loop ends on it; the next turn resumes the same session", () =>
  Effect.gen(function* () {
    queries.length = 0
     const { sessions, prompt, chat } = yield* setup()
    scripts.push(reply("first answer", "msg_a"), reply("second answer", "msg_b"))
    const first = yield* prompt.prompt({ sessionID: chat.id, ...say("hello") })
    expect(first.info.role).toBe("assistant")
    expect((first.info as SessionV1.Assistant).finish).toBe("stop")
    expect(first.parts.some((part) => part.type === "text" && part.text === "first answer")).toBe(true)
    expect(queries[0].prompt).toBe("hello")
    expect(queries[0].options?.resume).toBeUndefined()
    expect(queries[0].options?.settingSources).toEqual([])
    expect(queries[0].options?.disallowedTools).toEqual(["Read", "Edit", "Write", "NotebookEdit", "Task"])
    expect(queries[0].options?.model).toBe("claude-haiku-4-5-20251001")
    expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ sessionId: "sdk-1", cost: 0.01 })

    const second = yield* prompt.prompt({ sessionID: chat.id, ...say("again") })
    expect(second.parts.some((part) => part.type === "text" && part.text === "second answer")).toBe(true)
    expect(queries).toHaveLength(2)
    expect(queries[1].prompt).toBe("again")
    expect(queries[1].options?.resume).toBe("sdk-1")
  }), 30_000)

it.instance("a failed turn answers with an error and does not fall back to Orchestra's loop", () =>
  Effect.gen(function* () {
    queries.length = 0
    const { prompt, chat } = yield* setup()
    scripts.push(async function* () { throw new Error("Claude Code is not logged in") })
    const result = yield* prompt.prompt({ sessionID: chat.id, ...say("hello") })
    const info = result.info as SessionV1.Assistant
    expect(info.finish).toBe("error")
    expect(info.error?.data).toMatchObject({ message: "Claude Code is not logged in" })
    expect(queries).toHaveLength(1)
  }), 30_000)

it.instance("SDK mirror_error is an explicit persistence failure and never resumes a dropped native batch", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { sessions, prompt, chat } = yield* setup()
  scripts.push(async function* () {
    yield { type: "system", subtype: "init", ...frame }
    yield { type: "system", subtype: "mirror_error", error: "claude-code-corrupt-storage", key: { projectKey: "fixture", sessionId: "sdk-1" }, ...frame }
  })
  const first = yield* prompt.prompt({ sessionID: chat.id, ...say("persist this turn") })
  expect(first.info.role === "assistant" && first.info.error?.data).toMatchObject({ message: "Claude Code native transcript persistence failed; SDK resume is blocked until its archive is repaired." })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeArchiveFailed: true })
  const next = yield* prompt.prompt({ sessionID: chat.id, ...say("do not resume missing native entries") })
  expect(next.info.role === "assistant" && next.info.finish).toBe("error")
  expect(queries).toHaveLength(1)
}), 60_000)

it.instance("cancel stops Claude Code and marks the turn aborted", () =>
  Effect.gen(function* () {
    queries.length = 0
    const { sessions, prompt, chat } = yield* setup()
    let aborted = false
    scripts.push(async function* (signal) {
      yield { type: "system", subtype: "init", ...frame }
      yield { type: "assistant", message: { id: "msg_c", content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "sleep 60" } }], stop_reason: null, usage: {} }, ...frame }
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve() }))
    })
    const run = yield* prompt.prompt({ sessionID: chat.id, ...say("long job") }).pipe(Effect.forkChild)
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

it.instance("SDK window triggers the actual SDK producer and loads accepted memory on resume without changing the native archive", () =>
  Effect.gen(function* () {
    queries.length = 0
    scripts.length = 0
    producers = 0
    apiCalls = 0
    producer = memoryProducer
    const { sessions, prompt, chat } = yield* setup()
    const continuity = yield* SessionContinuity.Service
    const jobs = yield* BackgroundJob.Service
    const loaded: SessionStoreEntry[][] = []
    for (let index = 0; index < 6; index++) {
      scripts.push(nativeReply(index, { usage: index === 5 ? 15_000 : 50, loaded }))
      const reply = yield* prompt.prompt({ sessionID: chat.id, ...say(`prompt-${index} ` + "source context ".repeat(120)) })
      expect(reply.info.role === "assistant" && reply.info.error).toBeUndefined()
    }
    expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ contextWindow: 20_000, maxOutputTokens: 2_000, version: "2.1.289", continuityPaused: null })
    const job = yield* pollWithTimeout(jobs.list().pipe(Effect.map((list) => list.find((job) => job.metadata?.sessionId === chat.id))), "SDK producer never scheduled", "15 seconds")
    const done = yield* jobs.wait({ id: job.id, timeout: 15_000 })
    expect(done.info?.status).toBe("completed")
    expect(done.info?.output).toBe("applied")
    expect(producers).toBe(1)
    expect(apiCalls).toBe(0)
    expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ contextWindow: 20_000, maxOutputTokens: 2_000, version: "2.1.289", continuityPaused: null })
    const prepared = yield* continuity.prepare({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true })
    expect(prepared.system.join("\n")).toContain("SDK_MEMORY_NEEDLE_9C41")
    const context = yield* Effect.context<never>()
    const archive = ClaudeCodeStore.create({ sessionID: chat.id, sessions, continuity, fs: yield* FSUtil.Service,
      run: (effect) => Effect.runPromiseWith(context)(effect), rewrite: () => true, canRecall: true })
    const before = yield* archive.read
    scripts.push(nativeReply(6, { loaded, inspect: (params) => {
      expect(params.options?.settings).toMatchObject({ autoCompactEnabled: false })
    } }))
    yield* prompt.prompt({ sessionID: chat.id, ...say("recall the memory") })
    const view = loaded.at(-1)!
    expect(view[0].subtype).toBe("compact_boundary")
    expect(view[1].isCompactSummary).toBe(true)
    expect(JSON.stringify(view[1])).toContain("SDK_MEMORY_NEEDLE_9C41")
    expect(view.length).toBeLessThan(before.keys[0].entries.length)
    const after = yield* archive.read
    expect(after.keys[0].entries.slice(0, before.keys[0].entries.length)).toEqual(before.keys[0].entries)
    expect(after.mapping["api-0"]).toBe(before.mapping["api-0"])
    expect(apiCalls).toBe(0)
    producer = undefined
  }), 120_000)

it.instance("unknown transcript version keeps native compaction enabled and pauses Orchestra production", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  producers = 0
  producer = undefined
  const { sessions, prompt, chat } = yield* setup()
  for (let index = 0; index < 2; index++) {
    scripts.push(nativeReply(index, { version: "99.9.9", usage: 19_000 }))
    yield* prompt.prompt({ sessionID: chat.id, ...say("native only") })
  }
  expect(producers).toBe(0)
  expect(queries.every((query) => typeof query.options?.settings !== "string" && query.options?.settings?.autoCompactEnabled === true)).toBe(true)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ continuityPaused: "Claude Code 99.9.9 not yet supported" })
}), 60_000)

it.instance("SDK init model aliases reconcile actual modelUsage without borrowing catalog limits", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  producers = 0
  const { sessions, prompt, chat } = yield* setup()
  scripts.push(async function* (signal, params) {
    for await (const message of nativeReply(0, { modelKey: "claude-haiku-4-5" })(signal, params)) {
      yield message
      if (typeof message === "object" && message !== null && "type" in message && message.type === "assistant")
        yield { type: "assistant", ...frame, uuid: "child", parent_tool_use_id: "ignored-child", message: { id: "child-api", model: "claude-opus-4-6",
          content: [{ type: "text", text: "ignored child" }], stop_reason: "end_turn", usage: {} } }
    }
  })
  yield* prompt.prompt({ sessionID: chat.id, ...say("model alias") })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ contextWindow: 20_000, maxOutputTokens: 2_000,
    model: "claude-haiku-4-5-20251001", continuityPaused: null })
  expect(producers).toBe(0)
}), 60_000)

it.instance("session-pattern recall denial disables masking while SDK memory production remains available", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  producers = 0
  apiCalls = 0
  producer = memoryProducer
  const { sessions, prompt, chat } = yield* setup()
  const jobs = yield* BackgroundJob.Service
  const archive = yield* Archive.Service
  yield* sessions.setPermission({ sessionID: chat.id, permission: [{ permission: "*", pattern: "*", action: "allow" },
    { permission: "context_recall", pattern: chat.id, action: "deny" }] })
  for (let index = 0; index < 6; index++) {
    scripts.push(nativeReply(index, { usage: index === 5 ? 9_000 : 50, output: index === 0 ? "old output ".repeat(3000) : undefined }))
    yield* prompt.prompt({ sessionID: chat.id, ...say(`phase-${index} ` + "source padding ".repeat(120)) })
  }
  const job = yield* pollWithTimeout(jobs.list().pipe(Effect.map((list) => list.find((job) => job.metadata?.sessionId === chat.id))), "producer did not schedule", "15 seconds")
  expect((yield* jobs.wait({ id: job.id, timeout: 15_000 })).info?.output).toBe("applied")
  expect((yield* archive.readMemory(chat.id))?.masks).toEqual([])
  expect(producers).toBe(1)
  expect(apiCalls).toBe(0)
  producer = undefined
}), 120_000)

it.instance("disabled continuity retains native compaction and never starts the SDK producer", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  producers = 0
  producer = undefined
  const { sessions, prompt, chat } = yield* setup({ enabled: false })
  for (let index = 0; index < 2; index++) {
    scripts.push(nativeReply(index, { usage: 19_000 }))
    yield* prompt.prompt({ sessionID: chat.id, ...say("continuity disabled") })
  }
  expect(producers).toBe(0)
  expect(queries.every((query) => typeof query.options?.settings !== "string" && query.options?.settings?.autoCompactEnabled === true)).toBe(true)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ continuityPaused: "disabled" })
}), 60_000)

it.instance("context_compact uses the real SDK backend without awaiting its own unfinished tool; swap is deferred to resume", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  producers = 0
  apiCalls = 0
  producer = memoryProducer
  const { sessions, prompt, chat } = yield* setup()
  for (let index = 0; index < 6; index++) {
    scripts.push(nativeReply(index))
    yield* prompt.prompt({ sessionID: chat.id, ...say(`phase-${index} ` + "historical source ".repeat(120)) })
  }
  expect(producers).toBe(0)
  scripts.push(compactTurn)
  const result = yield* prompt.prompt({ sessionID: chat.id, ...say("compact now") }).pipe(Effect.timeout("20 seconds"))
  expect(result.info.role === "assistant" && result.info.error).toBeUndefined()
  const history = yield* sessions.messages({ sessionID: chat.id })
  const part = history.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.callID === "compact-call")
  expect(part?.type === "tool" && part.state.status).toBe("completed")
  expect(part?.type === "tool" && part.state.status === "completed" && part.state.metadata.outcome).toBe("applied")
  expect(producers).toBe(1)
  const loaded: SessionStoreEntry[][] = []
  scripts.push(nativeReply(8, { loaded }))
  yield* prompt.prompt({ sessionID: chat.id, ...say("continue") })
  expect(loaded[0][0].subtype).toBe("compact_boundary")
  expect(JSON.stringify(loaded[0][1])).toContain("SDK_MEMORY_NEEDLE_9C41")
  expect(apiCalls).toBe(0)
  producer = undefined
}), 120_000)

it.instance("hard-limit admission waits before the next SDK query; Stop closes the held producer transport", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  producers = 0
  apiCalls = 0
  const entered = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  const gate: { release?: () => void; aborted: boolean } = { aborted: false }
  yield* Effect.addFinalizer(() => Effect.sync(() => gate.release?.()))
  producer = async function* (params) {
    const stopped = new Promise<void>((resolve) => {
      gate.release = resolve
      params.options?.abortController?.signal.addEventListener("abort", () => { gate.aborted = true; resolve() })
    })
    await Effect.runPromiseWith(context)(Deferred.succeed(entered, undefined))
    await stopped
    if (!gate.aborted) yield* memoryProducer(params)
  }
  const { sessions, prompt, chat } = yield* setup()
  for (let index = 0; index < 6; index++) {
    scripts.push(nativeReply(index, { usage: index === 5 ? 15_000 : 50 }))
    yield* prompt.prompt({ sessionID: chat.id, ...say(`completed-${index} ` + "source payload ".repeat(120)) })
  }
  yield* Deferred.await(entered).pipe(Effect.timeout("15 seconds"))
  const next = yield* prompt.prompt({ sessionID: chat.id, ...say("next query must wait") }).pipe(Effect.forkChild)
  yield* pollWithTimeout(sessions.messages({ sessionID: chat.id }).pipe(Effect.map((list) =>
    list.some((message) => message.parts.some((part) => part.type === "text" && part.text === "next query must wait")) ? true : undefined)), "next input not admitted")
  expect(queries.filter((query) => query.options?.persistSession !== false)).toHaveLength(6)
  yield* prompt.cancel(chat.id)
  yield* Fiber.await(next)
  expect(gate.aborted).toBe(true)
  expect(queries.filter((query) => query.options?.persistSession !== false)).toHaveLength(6)
  expect(apiCalls).toBe(0)
  producer = undefined
}), 120_000)

it.instance("a native record corruption produces exactly one completed host error and blocks resume", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { sessions, prompt, chat } = yield* setup()
  const fs = yield* FSUtil.Service
  const context = yield* Effect.context<never>()
  scripts.push(async function* () {
    yield { type: "system", subtype: "init", ...frame }
    await Effect.runPromiseWith(context)(fs.writeFileString(path.join(Global.Path.data, "claude-code", hash(chat.id), "archive.sqlite"), "{corrupt"))
    yield { type: "assistant", ...frame, uuid: "corrupt-assistant", message: { id: "corrupt-api", content: [{ type: "tool_use", id: "late", name: "Bash", input: {} }], usage: {}, stop_reason: "tool_use" } }
  })
  const result = yield* prompt.prompt({ sessionID: chat.id, ...say("record fails") })
  expect(result.info.role === "assistant" && result.info.finish).toBe("error")
  const assistants = (yield* sessions.messages({ sessionID: chat.id })).filter((message) => message.info.role === "assistant")
  expect(assistants).toHaveLength(1)
  expect(assistants[0].info.time).toHaveProperty("completed")
  expect(assistants[0].parts.some((part) => part.type === "tool" && part.state.status === "running")).toBe(false)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeArchiveFailed: true })
  yield* prompt.prompt({ sessionID: chat.id, ...say("blocked resume") })
  expect(queries).toHaveLength(1)
}), 60_000)

it.instance("a native filesystem failure cannot recurse through record when constructing its host error reply", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { sessions, prompt, chat } = yield* setup()
  const fs = yield* FSUtil.Service
  const context = yield* Effect.context<never>()
  const dir = path.join(Global.Path.data, "claude-code", hash(chat.id))
  scripts.push(async function* () {
    yield { type: "system", subtype: "init", ...frame }
    await Effect.runPromiseWith(context)(fs.remove(dir, { recursive: true }).pipe(Effect.andThen(fs.writeFileString(dir, "not a directory"))))
    yield { type: "assistant", ...frame, uuid: "fs-failed", message: { id: "fs-api", content: [{ type: "text", text: "uncommitted" }], usage: {}, stop_reason: "end_turn" } }
  })
  const result = yield* prompt.prompt({ sessionID: chat.id, ...say("filesystem error") })
  expect(result.info.role === "assistant" && result.info.finish).toBe("error")
  expect((yield* sessions.messages({ sessionID: chat.id })).filter((message) => message.info.role === "assistant")).toHaveLength(1)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeArchiveFailed: true })
}), 60_000)

it.instance("exact native fallback admission refuses spawn even though the Orchestra prepared view fits", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  producers = 0
  producer = memoryProducer
  const { sessions, prompt, chat } = yield* setup()
  const jobs = yield* BackgroundJob.Service
  const continuity = yield* SessionContinuity.Service
  for (let index = 0; index < 6; index++) {
    scripts.push(nativeReply(index, { usage: index === 5 ? 15_000 : 50 }))
    yield* prompt.prompt({ sessionID: chat.id, ...say(`boundary-${index} ` + "span text ".repeat(120)) })
  }
  const job = yield* pollWithTimeout(jobs.list().pipe(Effect.map((list) => list.find((job) => job.metadata?.sessionId === chat.id))), "missing producer")
  expect((yield* jobs.wait({ id: job.id, timeout: 15_000 })).info?.output).toBe("applied")
  expect((yield* continuity.prepare({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true })).system).toHaveLength(1)
  const context = yield* Effect.context<never>()
  const native = ClaudeCodeStore.create({ sessionID: chat.id, sessions, continuity, fs: yield* FSUtil.Service,
    run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => true })
  const stored = yield* native.read
  const key = stored.keys[0].key
  yield* Effect.promise(() => native.store.append(key, [{ version: "2.1.289", sessionId: key.sessionId, isSidechain: false,
    type: "assistant", uuid: "unmapped-large", parentUuid: "assistant-5", message: { id: "unmapped-api", role: "assistant", content: [{ type: "text", text: "overflow ".repeat(30_000) }] } }]))
  const before = queries.length
  const result = yield* prompt.prompt({ sessionID: chat.id, ...say("must not spawn") })
  expect(result.info.role === "assistant" && result.info.finish).toBe("error")
  expect(JSON.stringify(result.info)).toContain("native admission blocked before spawn")
  expect(queries).toHaveLength(before)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeAdmission: { ready: false, reason: "unmapped-native-message" } })
  producer = undefined
}), 120_000)

it.instance("unknown deferred carrier uses authoritative native fallback and auto-compaction before actual SDK spawn", () => Effect.gen(function* () {
  queries.length = 0; scripts.length = 0; producers = 0; producer = memoryProducer
  const { sessions, prompt, chat } = yield* setup()
  const jobs = yield* BackgroundJob.Service
  for (let index = 0; index < 6; index++) {
    scripts.push(nativeReply(index, { usage: index === 5 ? 15_000 : 50 }))
    yield* prompt.prompt({ sessionID: chat.id, ...say(`carrier-boundary-${index} ` + "span text ".repeat(120)) })
  }
  const job = yield* pollWithTimeout(jobs.list().pipe(Effect.map((list) => list.find((job) => job.metadata?.sessionId === chat.id))), "missing producer")
  yield* jobs.wait({ id: job.id, timeout: 15_000 })
  const context = yield* Effect.context<never>()
  const continuity = yield* SessionContinuity.Service
  const native = ClaudeCodeStore.create({ sessionID: chat.id, sessions, continuity, fs: yield* FSUtil.Service,
    run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => true })
  const key = (yield* native.read).keys[0].key
  yield* Effect.promise(() => native.store.append(key, [{ version: "2.1.289", sessionId: key.sessionId, isSidechain: false,
    type: "attachment", uuid: "unknown-carrier", parentUuid: "assistant-5", attachment: { type: "deferred_tools_record", entries: "new-version-shape" } }]))
  scripts.push(async function* (signal, params) {
    expect(params.options).toMatchObject({ settings: { autoCompactEnabled: true } })
    const loaded = await params.options?.sessionStore?.load(key)
    expect(loaded?.some((entry) => entry.uuid === "unknown-carrier")).toBe(true)
    yield* nativeReply(6)(signal, params)
  })
  const result = yield* prompt.prompt({ sessionID: chat.id, ...say("continue with native fallback") })
  expect(result.info.role === "assistant" && result.info.finish).toBe("stop")
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toMatchObject({ nativeArchiveFailed: true })
  producer = undefined
}), 120_000)

it.instance("Stop joins a held mirror record and query.return disposal before creating the aborted reply", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { sessions, prompt, chat } = yield* setup()
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
  scripts.push(async function* () {
    yield { type: "system", subtype: "init", ...frame }
    heldRead.plan = { file: path.join(data, "claude-code", hash(chat.id)), entered: lockEntered, release: lockRelease }
    const release = new Promise<void>((resolve) => { cleanup.release = resolve })
    try {
      yield { type: "assistant", ...frame, uuid: "held", message: { id: "held-api", content: [{ type: "tool_use", id: "never-running", name: "Bash", input: {} }], usage: {}, stop_reason: "tool_use" } }
    } finally {
      await Effect.runPromiseWith(context)(Deferred.succeed(disposing, undefined))
      await release
      cleanup.disposed = true
    }
  })
  const worker = yield* prompt.prompt({ sessionID: chat.id, ...say("held record") }).pipe(Effect.forkChild)
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

it.instance("a queued user admitted before a late SDK assistant is delivered exactly once on the next query", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { sessions, prompt, chat } = yield* setup()
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  scripts.push(async function* (_signal, params) {
    yield { type: "system", subtype: "init", ...frame }
    await params.options?.sessionStore?.append({ projectKey: params.options.cwd ?? "fixture", sessionId: "sdk-1" }, [
      { type: "user", uuid: "first-user", sessionId: "sdk-1", parentUuid: null, message: { role: "user", content: params.prompt } },
    ])
    await Effect.runPromiseWith(context)(Deferred.succeed(entered, undefined))
    await Effect.runPromiseWith(context)(Deferred.await(release))
    yield { type: "assistant", ...frame, uuid: "first-late", message: { id: "first-late-api", content: [{ type: "text", text: "first done" }], stop_reason: "end_turn", usage: {} } }
    yield { type: "result", subtype: "success", total_cost_usd: 0, ...frame }
  }, reply("queued done", "queued-api"), reply("third done", "third-api"))
  const first = yield* prompt.prompt({ sessionID: chat.id, ...say("first payload") }).pipe(Effect.forkChild)
  yield* Deferred.await(entered)
  yield* prompt.prompt({ sessionID: chat.id, ...say("queued payload"), noReply: true })
  yield* Deferred.succeed(release, undefined)
  yield* Fiber.join(first)
  yield* prompt.prompt({ sessionID: chat.id, ...say("third payload") })
  expect(queries[0].prompt).toBe("first payload")
  expect(queries[1].prompt).toBe("queued payload")
  expect(queries[2].prompt).toBe("third payload")
  expect(queries.filter((query) => String(query.prompt).includes("queued payload"))).toHaveLength(1)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toHaveProperty("delivered")
}), 120_000)

it.instance("assistant with uncommitted exact receipt cannot hand off; Stop joins callbacks without poisoning archive", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { sessions, prompt, chat } = yield* setup()
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const returned = yield* Deferred.make<void>()
  const stopped = yield* Deferred.make<void>()
  const mirrored = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  const fs = yield* FSUtil.Service
  const data = yield* fs.realPath(Global.Path.data)
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  scripts.push(async function* (signal, params) {
    const aborted = new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
    yield { type: "system", subtype: "init", ...frame }
    heldRead.plan = { file: path.join(data, "claude-code", hash(chat.id)), entered, release }
    // SDK may return while a store RPC is still pending; engine must retain that callback.
    void params.options?.sessionStore?.append({ projectKey: params.options.cwd ?? "fixture", sessionId: "sdk-1" }, [
      { type: "user", uuid: "held-receipt", parentUuid: null, message: { role: "user", content: params.prompt } },
    ]).catch(() => {})
    await Effect.runPromiseWith(context)(Deferred.await(entered))
    yield { type: "assistant", ...frame, uuid: "pending-receipt-answer", message: { id: "pending-api", content: [{ type: "text", text: "not a delivery receipt" }], usage: {} } }
    await Effect.runPromiseWith(context)(Deferred.succeed(mirrored, undefined))
    await aborted
    await Effect.runPromiseWith(context)(Deferred.succeed(returned, undefined))
  })
  const worker = yield* prompt.prompt({ sessionID: chat.id, ...say("held callback") }).pipe(Effect.forkChild)
  yield* Deferred.await(entered)
  yield* Deferred.await(mirrored)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toHaveProperty("delivered")
  const stop = yield* prompt.cancel(chat.id).pipe(Effect.andThen(Deferred.succeed(stopped, undefined)), Effect.forkChild)
  yield* Deferred.await(returned)
  yield* Effect.yieldNow
  expect(yield* Deferred.isDone(stopped)).toBe(false)
  yield* Deferred.succeed(release, undefined)
  yield* Fiber.join(stop)
  yield* Fiber.await(worker)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toHaveProperty("delivered")
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toMatchObject({ nativeArchiveFailed: true })
}), 60_000)

it.instance("assistant frames without an exact durable receipt cannot hand off host input", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { sessions, prompt, chat } = yield* setup()
  scripts.push(async function* (_signal, params) {
    yield { type: "system", subtype: "init", ...frame }
    await params.options?.sessionStore?.append({ projectKey: params.options.cwd ?? "fixture", sessionId: "sdk-1" }, [
      { type: "user", uuid: "unrelated-input", message: { role: "user", content: "not the admitted host prompt" }, parentUuid: null },
    ])
    yield { type: "assistant", ...frame, uuid: "unreceipted-answer", message: { id: "unreceipted-api", content: [{ type: "text", text: "partial" }], usage: {} } }
    throw new Error("crash before exact native receipt")
  }, reply("retried", "retry-api"))
  yield* prompt.prompt({ sessionID: chat.id, ...say("original input") })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toHaveProperty("delivered")
  yield* prompt.prompt({ sessionID: chat.id, ...say("retry input") })
  expect(queries).toHaveLength(2)
  expect(queries[1].prompt).toBe("original input\n\nretry input")
}), 60_000)

it.instance("durable receipt survives crash before onDelivery metadata handoff and is never resent", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { sessions, prompt, chat } = yield* setup()
  const context = yield* Effect.context<never>()
  const fs = yield* FSUtil.Service
  const continuity = yield* SessionContinuity.Service
  scripts.push(async function* (_signal, params) {
    yield { type: "system", subtype: "init", ...frame }
    const history = await Effect.runPromiseWith(context)(sessions.messages({ sessionID: chat.id }))
    const ids = history.filter((message) => message.info.role === "user").map((message) => message.info.id)
    const archive = ClaudeCodeStore.create({ sessionID: chat.id, sessions, fs, continuity, userID: ids.at(-1), userIDs: ids,
      run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => false,
      onDelivery: () => Effect.die(new Error("crash between durable receipt and metadata handoff")) })
    await archive.store.append({ projectKey: params.options?.cwd ?? "fixture", sessionId: "sdk-1" }, [
      { type: "user", uuid: "committed-input", message: { role: "user", content: params.prompt }, parentUuid: null },
    ])
  }, reply("next", "after-gap"))
  const first = yield* prompt.prompt({ sessionID: chat.id, ...say("committed once") })
  expect(first.info.role === "assistant" && first.info.error?.data).toMatchObject({ message: expect.stringContaining("crash between durable receipt") })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toHaveProperty("delivered")
  yield* prompt.prompt({ sessionID: chat.id, ...say("after crash") })
  expect(queries).toHaveLength(2)
  expect(queries[1].prompt).toBe("after crash")
}), 60_000)

for (const payload of ["prompt", "append"]) {
  it.instance(`huge first ${payload} blocks before query even without SDK overhead snapshot`, () => Effect.gen(function* () {
    queries.length = 0
    scripts.length = 0
    const { sessions, prompt, chat } = yield* setup(undefined, payload === "append" ? "huge append ".repeat(100_000) : undefined)
    const result = yield* prompt.prompt({ sessionID: chat.id, ...say(payload === "prompt" ? "huge input ".repeat(100_000) : "tiny input") })
    expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message: expect.stringContaining("native admission blocked before spawn") })
    expect(queries).toHaveLength(0)
    expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeAdmission: { ready: false, bounded: false } })
  }), 60_000)
}

it.instance("model change bounds known payload using selected catalog limit before query", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { sessions, prompt, chat } = yield* setup()
  scripts.push(nativeReply(0))
  yield* prompt.prompt({ sessionID: chat.id, ...say("previous model") })
  const models = yield* Effect.gen(function* () {
    const catalog = yield* ModelsDev.Service
    return yield* catalog.get()
  }).pipe(Effect.provide(LayerNode.compile(ModelsDev.node)))
  if (!models.anthropic) throw new Error("Missing Anthropic catalog fixture")
  const selected = Object.values(Provider.fromModelsDevProvider(models.anthropic).models).find((model) =>
    model.id !== "claude-haiku-4-5-20251001" && model.limit.context > 0 && model.limit.output > 0 && hardLimit(model) > 0)
  if (!selected) throw new Error("Missing second bounded Anthropic catalog model")
  expect(hardLimit(selected)).toBeGreaterThan(0)
  const result = yield* prompt.prompt({ sessionID: chat.id, ...say("huge changed-model input ".repeat(hardLimit(selected))),
    model: { providerID: ProviderV2.ID.make("anthropic"), modelID: selected.id } })
  expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message: expect.stringContaining("native admission blocked before spawn") })
  expect(queries).toHaveLength(1)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeAdmission: { ready: false, limit: hardLimit(selected) } })
}), 60_000)

it.instance("first-turn tool schemas count toward admission even when prompt alone fits", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { sessions, prompt, chat } = yield* setup()
  scripts.push(nativeReply(0, { snapshot: false }))
  yield* prompt.prompt({ sessionID: chat.id, ...say("measure selected limit") })
  const state = Schema.decodeUnknownSync(Schema.Struct({ nativeAdmission: Schema.Struct({ limit: Schema.Number }) }))(
    (yield* sessions.get(chat.id)).metadata?.claudeCode)
  const system = queries[0].options?.systemPrompt
  if (!system || typeof system === "string" || Array.isArray(system) || system.type !== "preset") throw new Error("Missing preset system options")
  const text = "x".repeat(4 * (state.nativeAdmission.limit - estimate({ append: system.append }) - estimate([]) - 5))
  expect(estimate(text) + estimate({ append: system.append }) + estimate([])).toBeLessThan(state.nativeAdmission.limit)
  const next = yield* sessions.create({ title: "Near-limit first turn", permission: chat.permission })
  const result = yield* prompt.prompt({ sessionID: next.id, ...say(text) })
  expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message: expect.stringContaining("native admission blocked before spawn") })
  expect(queries).toHaveLength(1)
  expect((yield* sessions.get(next.id)).metadata?.claudeCode).toMatchObject({ nativeAdmission: { ready: false, bounded: false } })
}), 60_000)

for (const mode of ["success", "return-error", "construct-error", "cancel"]) {
  it.instance(`engine joins real child before turn settles (${mode})`, () => Effect.gen(function* () {
    queries.length = 0
    scripts.length = 0
    const { directory } = yield* TestInstance
    writeFileSync(path.join(directory, ".credentials.json"), JSON.stringify({ claudeAiOauth: {
      accessToken: "local-test-token", refreshToken: "local-test-refresh", expiresAt: 4102444800000, scopes: ["user:inference"],
    } }))
    const { sessions, prompt, chat } = yield* setup()
    const entered = yield* Deferred.make<void>()
    const returned = yield* Deferred.make<void>()
    const done = yield* Deferred.make<void>()
    const context = yield* Effect.context<never>()
    const children: SpawnedProcess[] = []
    yield* Effect.addFinalizer(() => Effect.sync(() => { construct = undefined; children.forEach((child) => child.kill("SIGKILL")) }))
    construct = (params) => {
      if (!params.options?.spawnClaudeCodeProcess || !params.options.env) throw new Error("missing lifetime options")
      expect(params.options.env).toEqual({ HOME: directory, CLAUDE_CONFIG_DIR: directory })
      expect(params.options.managedSettings).toMatchObject({ forceLoginMethod: "claudeai", allowedProviders: ["anthropic"] })
      const child = params.options.spawnClaudeCodeProcess({ command: process.execPath, args: ["-e", `
        process.stdin.resume();
        process.stdin.on("end", () => setInterval(() => {
          if (require("node:fs").existsSync(${JSON.stringify(path.join(directory, "release-child"))})) process.exit(0);
        }, 10));
        process.stdout.write("ready");
      `], env: params.options.env, signal: new AbortController().signal })
      children.push(child)
      if (mode === "construct-error") {
        // No Query exists to dispose this child; only the pre-registered finalizer owns it.
        params.options.abortController?.signal.addEventListener("abort", () => child.stdin.end(), { once: true })
        void Effect.runPromiseWith(context)(Deferred.succeed(returned, undefined))
        throw new Error("query constructor threw after spawn")
      }
      return Object.assign((async function* () {
        await new Promise<void>((resolve) => child.stdout.once("data", () => resolve()))
        if (mode === "cancel") {
          const aborted = new Promise<void>((resolve) => params.options?.abortController?.signal.addEventListener("abort", () => resolve(), { once: true }))
          yield { type: "system", subtype: "init", ...frame }
          await Effect.runPromiseWith(context)(Deferred.succeed(entered, undefined))
          await aborted
          return
        }
        yield* reply("joined", "joined-api")(params.options?.abortController?.signal ?? AbortSignal.any([]), params) as AsyncGenerator<SDKMessage>
      })(), {
        close: () => child.stdin.end(),
        return: async () => {
          await Effect.runPromiseWith(context)(Deferred.succeed(returned, undefined))
          if (mode === "return-error") throw new Error("query.return rejected")
          return { done: true as const, value: undefined }
        },
      }) as unknown as ReturnType<ClaudeCodeSDK.Interface["query"]>
    }
    const worker = yield* prompt.prompt({ sessionID: chat.id, ...say("local child only") }).pipe(
      Effect.provideService(ClaudeCodeSDK.Environment, { HOME: directory, CLAUDE_CONFIG_DIR: directory, ANTHROPIC_API_KEY: "must-strip", CLAUDE_CODE_USE_VERTEX: "1" }),
      Effect.onExit(() => Deferred.succeed(done, undefined)), Effect.forkChild)
    const stop = mode === "cancel" ? yield* Deferred.await(entered).pipe(Effect.andThen(prompt.cancel(chat.id)), Effect.forkChild) : undefined
    yield* Deferred.await(returned)
    yield* Effect.yieldNow
    expect(children).toHaveLength(1)
    expect(children[0].exitCode).toBeNull()
    expect(yield* Deferred.isDone(done)).toBe(false)
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
    construct = undefined
  }), 60_000)
}

it.instance("missing SDK snapshot keeps native compaction on, but known SDK limit still rejects huge ordinary next prompt", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  producers = 0
  const { sessions, prompt, chat } = yield* setup()
  scripts.push(nativeReply(0, { usage: 50, snapshot: false }), nativeReply(1, { usage: 50, snapshot: false,
    inspect: (params) => expect(params.options?.settings).toMatchObject({ autoCompactEnabled: true }) }))
  yield* prompt.prompt({ sessionID: chat.id, ...say("small previous prompt") })
  const rejected = yield* prompt.prompt({ sessionID: chat.id, ...say("huge next prompt ".repeat(30_000)) })
  expect(rejected.info.role === "assistant" && rejected.info.error?.data).toMatchObject({ message: expect.stringContaining("native admission blocked before spawn") })
  expect(queries).toHaveLength(1)
  expect(queries[0].options?.settings).toMatchObject({ autoCompactEnabled: true })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ continuityPaused: "SDK system/tool snapshot unavailable; native compaction enabled" })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeAdmission: { bounded: false } })
  expect(producers).toBe(0)
}), 120_000)

it.instance("legacy sessionId without a complete host archive fails explicitly before query", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { sessions, prompt, chat } = yield* setup()
  const first = yield* prompt.prompt({ sessionID: chat.id, ...say("old answered first"), noReply: true })
  const second = yield* prompt.prompt({ sessionID: chat.id, ...say("old answered second"), noReply: true })
  yield* prompt.prompt({ sessionID: chat.id, ...say("legacy queued"), noReply: true })
  const answered = (parentID: MessageID) => ({ id: MessageID.ascending(), sessionID: chat.id, parentID, role: "assistant" as const,
    agent: "claude", mode: "claude", modelID: ModelV2.ID.make("claude-haiku-4-5-20251001"), providerID: ProviderV2.ID.make("anthropic"),
    path: { cwd: "/fixture", root: "/fixture" }, cost: 0, finish: "stop", tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: Date.now(), completed: Date.now() } })
  yield* sessions.updateMessage(answered(first.info.id))
  yield* sessions.updateMessage(answered(second.info.id))
  yield* sessions.setMetadata({ sessionID: chat.id, metadata: { claudeCode: { sessionId: "sdk-1", cost: 0 } } })
  const result = yield* prompt.prompt({ sessionID: chat.id, ...say("new followup") })
  expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message:
    "Claude Code native archive unavailable; legacy SDK resume is blocked until a complete native archive is imported." })
  expect(queries).toHaveLength(0)
  const context = yield* Effect.context<never>()
  const archive = ClaudeCodeStore.create({ sessionID: chat.id, sessions, continuity: yield* SessionContinuity.Service, fs: yield* FSUtil.Service,
    run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => false })
  expect((yield* archive.read).keys).toHaveLength(0)
}), 120_000)

it.instance("ordinary SDK Stop retains real patch evidence and SessionRevert restores edited file bytes", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  const { directory } = yield* TestInstance
  const file = path.join(directory, "notes.txt")
  writeFileSync(file, "original bytes\n")
  const { sessions, prompt, chat } = yield* setup()
  const changed = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  scripts.push(async function* (signal) {
    const stopped = new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()))
    yield { type: "system", subtype: "init", ...frame }
    yield { type: "assistant", ...frame, uuid: "edit-step", message: { id: "edit-api", content: [{ type: "tool_use", id: "editing", name: "Bash", input: { command: "recorded edit" } }], usage: {}, stop_reason: "tool_use" } }
    writeFileSync(file, "SDK edited bytes\n")
    await Effect.runPromiseWith(context)(Deferred.succeed(changed, undefined))
    await stopped
  })
  const worker = yield* prompt.prompt({ sessionID: chat.id, ...say("edit and hold") }).pipe(Effect.forkChild)
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

it.instance("actual engine caller turns reuse the stable SDK backend while a soft producer is held", () => Effect.gen(function* () {
  queries.length = 0
  scripts.length = 0
  producers = 0
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  let aborted = false
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  producer = async function* (params) {
    params.options?.abortController?.signal.addEventListener("abort", () => { aborted = true })
    await Effect.runPromiseWith(context)(Deferred.succeed(entered, undefined))
    await Effect.runPromiseWith(context)(Deferred.await(release))
    yield* memoryProducer(params)
  }
  const { sessions, prompt, chat } = yield* setup()
  for (let index = 0; index < 6; index++) {
    scripts.push(nativeReply(index, { usage: index === 5 ? 9_000 : 50 }))
    yield* prompt.prompt({ sessionID: chat.id, ...say(`soft-${index} ` + "source padding ".repeat(120)) })
  }
  yield* Deferred.await(entered)
  scripts.push(nativeReply(6))
  const next = yield* prompt.prompt({ sessionID: chat.id, ...say("next caller turn") }).pipe(Effect.forkChild)
  yield* pollWithTimeout(sessions.messages({ sessionID: chat.id }).pipe(Effect.map((history) => history.some((message) =>
    message.parts.some((part) => part.type === "text" && part.text === "next caller turn")) ? true : undefined)), "next caller input not admitted")
  yield* Effect.sleep("50 millis")
  expect(aborted).toBe(false)
  expect(producers).toBe(1)
  yield* Deferred.succeed(release, undefined)
  yield* Fiber.join(next)
  producer = undefined
}), 120_000)
