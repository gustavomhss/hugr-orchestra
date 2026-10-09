import { expect } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { Deferred, Effect, Layer, Schema, Stream } from "effect"
import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import { LLM } from "@/session/llm"
import { FSUtil } from "@orchestra/core/fs-util"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { body } from "../continuity/service-fixture"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { makeHttp } from "../session/prompt.fixture"
import { promptSnapshot } from "./native-fixture"
import { LayerNode } from "@orchestra/core/effect/layer-node"

export const state: {
  queries: Params[]
  scripts: Script[]
  producer: ((params: Params) => AsyncGenerator<unknown>) | undefined
  producers: number
  apiCalls: number
  construct: ClaudeCodeSDK.Interface["query"] | undefined
  heldRead: { plan?: { file: string; entered: Deferred.Deferred<void>; release: Deferred.Deferred<void> } }
} = { queries: [], scripts: [], producer: undefined, producers: 0, apiCalls: 0, construct: undefined, heldRead: {} }

export type Params = Parameters<ClaudeCodeSDK.Interface["query"]>[0]

export type Script = (signal: AbortSignal, params: Params) => AsyncGenerator<unknown>

const sdk = Layer.succeed(ClaudeCodeSDK.Service, ClaudeCodeSDK.Service.of({
  query: (params) => {
    state.queries.push(params)
    if (state.construct) return state.construct(params)
    if (params.options?.persistSession === false) {
      state.producers++
      if (!state.producer) throw new Error("Unexpected SDK producer")
      return state.producer(params) as ReturnType<ClaudeCodeSDK.Interface["query"]>
    }
    const script = state.scripts.shift()
    if (!script) throw new Error("Unexpected SDK engine query")
    return script(params.options?.abortController?.signal ?? AbortSignal.any([]), params) as ReturnType<ClaudeCodeSDK.Interface["query"]>
  },
}))

const filesystem = Layer.effect(FSUtil.Service, FSUtil.Service.use((actual) => Effect.succeed({ ...actual,
  readDirectoryEntries: (file: string) => Effect.gen(function* () {
    if (state.heldRead.plan?.file === file) {
      const plan = state.heldRead.plan
      state.heldRead.plan = undefined
      yield* Deferred.succeed(plan.entered, undefined)
      yield* Deferred.await(plan.release).pipe(Effect.uninterruptible)
    }
    return yield* actual.readDirectoryEntries(file)
  }),
}))).pipe(Layer.provide(LayerNode.compile(FSUtil.node)))

export const it = testEffect(makeHttp({ replacements: [[ClaudeCodeSDK.node, sdk], [FSUtil.node, filesystem], [LLM.node, Layer.mock(LLM.Service, {
  stream: () => { state.apiCalls++; return Stream.fail(new Error("Default API transport must not run")) },
})]] }))

export const frame = { parent_tool_use_id: null, uuid: "u", session_id: "sdk-1" }

export const reply = (text: string, id: string): Script => async function* (_signal, params) {
  yield { type: "system", subtype: "init", ...frame }
  const key = { projectKey: params.options?.cwd ?? "fixture", sessionId: frame.session_id }
  await params.options?.sessionStore?.append(key, [{ type: "user", uuid: `${id}-user`, sessionId: key.sessionId,
    parentUuid: (await params.options?.sessionStore?.load(key))?.at(-1)?.uuid ?? null, message: { role: "user", content: params.prompt } }])
  yield { type: "assistant", message: { id, content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } }, ...frame, uuid: id }
  yield { type: "result", subtype: "success", total_cost_usd: 0.01, ...frame }
}

export const setup = (continuity?: { enabled: boolean }, append?: string) => Effect.gen(function* () {
  const { directory } = yield* TestInstance
  writeFileSync(path.join(directory, "orchestra.json"), JSON.stringify({
    continuity,
    agent: { claude: { mode: "primary", engine: "claude-code", model: "anthropic/claude-haiku-4-5-20251001", prompt: append } },
  }))
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Claude Code", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  return { sessions, prompt: yield* SessionPrompt.Service, chat }
})

export const say = (text: string) => ({ agent: "claude", parts: [{ type: "text" as const, text }] })

export function nativeReply(index: number, options: { usage?: number; version?: string; modelKey?: string; output?: string; snapshot?: boolean; loaded?: SessionStoreEntry[][]; inspect?: (params: Params) => void } = {}): Script {
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

export const memoryProducer = async function* (params: Params) {
  expect(params.options).toMatchObject({ tools: [], persistSession: false, maxTurns: 1 })
  expect(typeof params.prompt).toBe("string")
  const historical = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(String(params.prompt).split("\n").slice(1).join("\n"))
  const reply = JSON.stringify(body({ messages: historical }, "SDK_MEMORY_NEEDLE_9C41"))
  yield { type: "assistant", ...frame, message: { id: "memory", content: [{ type: "text", text: reply }], stop_reason: "end_turn", usage: {} } }
  yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", ...frame }
}

export const compactTurn: Script = async function* (_signal, params) {
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

export * as ClaudeEngineFixture from "./engine-fixture"
