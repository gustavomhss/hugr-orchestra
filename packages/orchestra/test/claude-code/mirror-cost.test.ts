import { expect } from "bun:test"
import { Effect } from "effect"
import type { SDKResultSuccess } from "@anthropic-ai/claude-agent-sdk"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ClaudeCodeMirror } from "@/claude-code/mirror"
import { ClaudeHost } from "@/claude-code/host/session"
import { Agent } from "@/agent/agent"
import { Snapshot } from "@/snapshot"
import { MessageID } from "@/session/schema"
import { TestInstance } from "../fixture/fixture"
import { ClaudeEngineFixture } from "./engine-fixture"

const model = "claude-haiku-4-5-20251001"
const tokens = { input_tokens: 10, output_tokens: 8, cache_read_input_tokens: 2, cache_creation_input_tokens: 1,
  cache_creation: null, server_tool_use: null, service_tier: null, output_tokens_details: { thinking_tokens: 3 } }

function completion(cost: number, reported: string | undefined = model): SDKResultSuccess {
  return { type: "result", ...ClaudeEngineFixture.frame, uuid: crypto.randomUUID(), subtype: "success", is_error: false,
    total_cost_usd: cost, stop_reason: "end_turn", duration_ms: 1, duration_api_ms: 1, num_turns: 1,
    result: "", permission_denials: [], modelUsage: reported ? { [reported]: {
      inputTokens: 50, outputTokens: 40, cacheReadInputTokens: 10, cacheCreationInputTokens: 5,
      webSearchRequests: 0, costUSD: cost, contextWindow: 200_000, maxOutputTokens: 32_000,
    } } : {}, usage: { input_tokens: 10, output_tokens: 8, cache_read_input_tokens: 2,
      cache_creation_input_tokens: 1, cache_creation: { ephemeral_5m_input_tokens: 1, ephemeral_1h_input_tokens: 0 },
      server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 }, service_tier: "standard" } }
}

;[false, true].forEach((failed) => ClaudeEngineFixture.it.instance(
  `${failed ? "failed" : "successful"} cost settlement rewrites one persisted step receipt without repeating tokens`,
  () => Effect.gen(function* () {
    const f = yield* ClaudeEngineFixture.setup()
    const agents = yield* Agent.Service
    const snapshot = yield* Snapshot.Service
    const instance = yield* TestInstance
    const prompt = yield* f.sessions.updateMessage({ id: MessageID.ascending(), sessionID: f.chat.id,
      role: "user", agent: "maestro", time: { created: Date.now() },
      model: { modelID: ModelV2.ID.make(model), providerID: ProviderV2.ID.make("anthropic") } })
    const view = ClaudeCodeMirror.create({ sessionID: f.chat.id, user: prompt,
      agent: yield* agents.get("maestro"), sessions: f.sessions, snapshot,
      path: { cwd: instance.directory, root: instance.directory } })
    yield* view.on({ type: "assistant", ...ClaudeEngineFixture.frame, uuid: crypto.randomUUID(), message: { id: "receipt", model,
      role: "assistant", type: "message", container: null, context_management: null, stop_sequence: null,
      content: [{ type: "text", text: "observed", citations: null }], stop_reason: "end_turn", usage: tokens } })
    yield* view.on({ ...completion(0.14), is_error: failed })
    if (failed) yield* view.fail({ aborted: false, message: "Observed SDK failure" })
    yield* view.finish(0.1)
    const before = yield* f.sessions.messages({ sessionID: f.chat.id })
    const receipt = before.flatMap((message) => message.parts).filter((part) => part.type === "step-finish")
    expect(receipt).toHaveLength(1)
    expect(receipt[0].cost).toBeCloseTo(0.04)
    yield* view.finish(0.1)
    yield* view.finish(0.14)
    const after = yield* f.sessions.messages({ sessionID: f.chat.id })
    expect(after).toEqual(before)
    const reply = after.find((message) => message.info.role === "assistant")
    if (reply?.info.role !== "assistant") throw new Error("Missing persisted receipt owner")
    expect(reply.info.cost).toBeCloseTo(0.04)
    expect(reply.info.finish).toBe(failed ? "error" : "stop")
    expect(receipt[0].messageID).toBe(reply.info.id)
    expect(receipt[0].tokens).toEqual(reply.info.tokens)
    expect(yield* f.sessions.get(f.chat.id)).toMatchObject({ tokens: {
      input: 10, output: 5, reasoning: 3, cache: { read: 2, write: 1 },
    } })
    expect((yield* f.sessions.get(f.chat.id)).cost).toBeCloseTo(0.04)
  }), 30_000,
))

ClaudeEngineFixture.it.instance("host replay, zero deltas, reset and reopen keep session, assistant and receipt costs consistent", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const f = yield* ClaudeEngineFixture.setup()
    const host = yield* ClaudeHost.Service
    const outcomes = [
      { uuid: "cost-success", cost: 0.1, total: 0.1, error: false, assistant: true },
      { uuid: "cost-error", cost: 0.14, total: 0.14, error: true, assistant: true },
      { uuid: "cost-recovery", cost: 0.2, total: 0.2, error: false, assistant: true },
      { uuid: "cost-error", cost: 0.14, total: 0.2, error: true, assistant: true },
      { uuid: "cost-zero", cost: 0.2, total: 0.2, error: false, assistant: true },
      { uuid: "cost-no-frame", cost: 0.24, total: 0.24, error: true, assistant: false },
    ]
    const script = (outcomes: readonly { uuid: string; cost: number; error: boolean; assistant: boolean }[]): ClaudeEngineFixture.Script =>
      async function* (input) {
        for (const [index, outcome] of outcomes.entries()) {
          const send = await input[Symbol.asyncIterator]().next()
          if (send.done) return
          yield { type: "system", subtype: "init", model, ...ClaudeEngineFixture.frame }
          yield { ...send.value, session_id: "sdk-1" }
          if (outcome.assistant) {
            // Two actual SDK messages in one turn: only the final receipt owns the admitted cost delta.
            if (outcome.uuid === "cost-success") yield { type: "assistant", ...ClaudeEngineFixture.frame,
              uuid: "cost-preface", user_message_uuid: send.value.uuid,
              message: { id: "cost-preface", model, content: [{ type: "text", text: "preface" }],
                stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 2 } } }
            yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: `${outcome.uuid}-answer-${index}`,
              user_message_uuid: send.value.uuid, message: { id: `${outcome.uuid}-answer-${index}`, model,
                content: [{ type: "text", text: "observed answer" }], stop_reason: "end_turn", usage: tokens } }
          }
          yield { ...completion(outcome.cost), uuid: outcome.uuid,
            ...(outcome.error ? { subtype: "error_during_execution", is_error: true, errors: ["Observed SDK failure"] }
              : { subtype: "success", is_error: false, stop_reason: "end_turn" }) }
        }
        for await (const _ of input) {}
      }
    ClaudeEngineFixture.state.scripts.push(script(outcomes),
      script([{ uuid: "cost-error", cost: 0.14, error: true, assistant: false }]),
      script([{ uuid: "cost-reset", cost: 0.03, error: false, assistant: true }]))
    for (const [index, outcome] of outcomes.entries()) {
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say(`receipt turn ${index}`) })
      const saved = yield* f.sessions.get(f.chat.id)
      const replies = (yield* f.sessions.messages({ sessionID: f.chat.id })).filter((message) => message.info.role === "assistant")
      expect(saved.cost).toBeCloseTo(outcome.total)
      expect(replies.reduce((sum, message) => sum + (message.info.role === "assistant" ? message.info.cost : 0), 0)).toBeCloseTo(outcome.total)
      const receipts = replies.flatMap((message) => message.parts.filter((part) => part.type === "step-finish"))
      expect(receipts.reduce((sum, part) => sum + part.cost, 0)).toBeCloseTo(outcome.total)
      for (const reply of replies) {
        if (reply.info.role !== "assistant") throw new Error("Missing assistant receipt owner")
        const finishes = reply.parts.filter((part) => part.type === "step-finish")
        expect(finishes).toHaveLength(1)
        expect(finishes[0].messageID).toBe(reply.info.id)
        expect(finishes[0].cost).toBeCloseTo(reply.info.cost)
        expect(finishes[0].tokens).toEqual(reply.info.tokens)
      }
      const last = replies.at(-1)
      if (last?.info.role !== "assistant") throw new Error("Missing settled assistant")
      expect(last.info.finish).toBe(outcome.error ? "error" : "stop")
      expect(last.info.tokens).toEqual(outcome.assistant
        ? { input: 10, output: 5, reasoning: 3, cache: { read: 2, write: 1 } }
        : { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })
      expect(saved.tokens).toEqual({ input: Math.min(index + 1, 5) * 10 + 1,
        output: Math.min(index + 1, 5) * 5 + 2, reasoning: Math.min(index + 1, 5) * 3,
        cache: { read: Math.min(index + 1, 5) * 2, write: Math.min(index + 1, 5) } })
    }
    yield* host.release(f.chat.id)
    yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("reopen replay") })
    expect((yield* f.sessions.get(f.chat.id)).cost).toBeCloseTo(0.24)
    yield* host.release(f.chat.id)
    yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("producer reset") })
    const reset = yield* f.sessions.messages({ sessionID: f.chat.id })
    expect((yield* f.sessions.get(f.chat.id)).cost).toBeCloseTo(0.27)
    expect(reset.flatMap((message) => message.parts.filter((part) => part.type === "step-finish"))
      .reduce((sum, part) => sum + part.cost, 0)).toBeCloseTo(0.27)
    expect(reset.flatMap((message) => message.info.role === "assistant" ? [message.info.cost] : [])
      .reduce((sum, cost) => sum + cost, 0)).toBeCloseTo(0.27)
    yield* host.release(f.chat.id)
  }), 30_000)

;[undefined, "incompatible-model", model].forEach((reported) => ClaudeEngineFixture.it.instance(
  `no-frame failure requires matching SDK model totals: ${reported ?? "absent"}`,
  () => Effect.gen(function* () {
    const f = yield* ClaudeEngineFixture.setup()
    const agents = yield* Agent.Service
    const snapshot = yield* Snapshot.Service
    const instance = yield* TestInstance
    const prompt = yield* f.sessions.updateMessage({ id: MessageID.ascending(), sessionID: f.chat.id,
      role: "user", agent: "maestro", time: { created: Date.now() },
      model: { modelID: ModelV2.ID.make(model), providerID: ProviderV2.ID.make("anthropic") } })
    const view = ClaudeCodeMirror.create({ sessionID: f.chat.id, user: prompt,
      agent: yield* agents.get("maestro"), sessions: f.sessions, snapshot,
      path: { cwd: instance.directory, root: instance.directory } })
    yield* view.on({ ...completion(0.1, reported ?? ""), subtype: "error_during_execution" as const, is_error: true,
      errors: ["No assistant frame"] })
    yield* view.fail({ aborted: false, message: "No assistant frame" })
    yield* view.finish(0)
    const replies = (yield* f.sessions.messages({ sessionID: f.chat.id })).filter((message) => message.info.role === "assistant")
    expect(replies).toHaveLength(1)
    const reply = replies[0]
    if (reply.info.role !== "assistant") throw new Error("Missing failed reply")
    expect(reply.info.cost).toBe(reported === model ? 0.1 : 0)
    expect(reply.info.tokens).toEqual({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })
    const finishes = reply.parts.filter((part) => part.type === "step-finish")
    expect(finishes).toHaveLength(1)
    expect(finishes[0]).toMatchObject({ messageID: reply.info.id, cost: reply.info.cost, tokens: reply.info.tokens })
    expect((yield* f.sessions.get(f.chat.id)).cost).toBe(reply.info.cost)
  }), 30_000,
))
