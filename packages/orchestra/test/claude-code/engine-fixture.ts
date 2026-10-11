import { expect } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { Effect, Layer, Stream } from "effect"
import type { Query, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import { LLM } from "@/session/llm"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { makeHttp } from "../session/prompt.fixture"

// A scripted Claude Code host session: each query is one long-lived session that reads the host's streaming input.

export const state: {
  queries: Params[]
  scripts: Script[]
  /** The text of every user message the host handed Claude Code, in order. */
  inputs: string[]
  apiCalls: number
  construct: ClaudeCodeSDK.Interface["query"] | undefined
} = { queries: [], scripts: [], inputs: [], apiCalls: 0, construct: undefined }

export type Params = Parameters<ClaudeCodeSDK.Interface["query"]>[0]

/** Claude Code's side of one session: the frames it emits while reading the host's input. */
export type Script = (input: AsyncIterable<SDKUserMessage>, params: Params) => AsyncGenerator<unknown>

export function reset() {
  state.queries.length = 0
  state.scripts.length = 0
  state.inputs.length = 0
  state.apiCalls = 0
  state.construct = undefined
}

const sdk = Layer.succeed(ClaudeCodeSDK.Service, ClaudeCodeSDK.Service.of({
  query: (params) => {
    state.queries.push(params)
    // Every Claude mode query keeps Claude Code's preset.
    expect(params.options?.systemPrompt).toMatchObject({ type: "preset", preset: "claude_code" })
    // Claude mode makes no side model call: a tool-less, unpersisted query would be the removed maintenance transport.
    if (params.options?.persistSession === false) throw new Error("Unexpected SDK maintenance query: Claude mode runs no side model call")
    if (state.construct) return state.construct(params)
    const script = state.scripts.shift()
    if (!script) throw new Error("Unexpected SDK query")
    return hosted(script, params)
  },
}))

function hosted(script: Script, params: Params) {
  if (typeof params.prompt === "string") throw new Error("The host feeds Claude Code a streaming input, never a one-shot prompt")
  const prompt = params.prompt
  const input = (async function* () {
    for await (const message of prompt) {
      state.inputs.push(String(message.message.content))
      yield message
    }
  })()
  const frames = script(input, params)
  // Only the Query surface the host uses besides iteration.
  return Object.assign(frames, {
    close: () => { void frames.return(undefined) },
    interrupt: async () => {},
    setModel: async () => {},
    accountInfo: async () => ({ subscriptionType: "Claude Max", apiProvider: "firstParty" }),
    getContextUsage: async () => ({ totalTokens: 10, maxTokens: 200_000, percentage: 0 }),
  }) as unknown as Query
}

export const it = testEffect(makeHttp({ replacements: [[ClaudeCodeSDK.node, sdk], [LLM.node, Layer.mock(LLM.Service, {
  stream: () => { state.apiCalls++; return Stream.fail(new Error("Default API transport must not run")) },
})]] }))

export const frame = { parent_tool_use_id: null, uuid: "u", session_id: "sdk-1" }

/** Answers each message the host sends with the next text, one Claude Code turn each. */
export const replies = (...texts: string[]): Script => async function* (input) {
  for (const [index, text] of texts.entries()) {
    const next = await input[Symbol.asyncIterator]().next()
    if (next.done) return
    // Claude Code opens each turn with its init frame.
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    const id = `msg_${index}`
    yield { type: "assistant", message: { id, model: "claude-haiku-4-5-20251001", content: [{ type: "text", text }], stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 2 } }, ...frame, uuid: id }
    yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: (index + 1) / 100, ...frame }
  }
  // The session stays open until the host releases it.
  for await (const _ of input) {}
}

export const setup = () => Effect.gen(function* () {
  const { directory } = yield* TestInstance
  writeFileSync(path.join(directory, "orchestra.json"), JSON.stringify({
    agent: { claude: { mode: "primary", engine: "claude-code", model: "anthropic/claude-haiku-4-5-20251001" } },
  }))
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Claude Code", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  return { sessions, prompt: yield* SessionPrompt.Service, chat }
})

export const say = (text: string) => ({ agent: "claude", parts: [{ type: "text" as const, text }] })

export * as ClaudeEngineFixture from "./engine-fixture"
