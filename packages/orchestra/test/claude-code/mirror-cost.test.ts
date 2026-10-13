import { expect } from "bun:test"
import { Effect } from "effect"
import type { SDKAssistantMessage, SDKResultSuccess } from "@anthropic-ai/claude-agent-sdk"
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

const persisted = Effect.fn("MirrorCostFixture")(function* () {
  const f = yield* ClaudeEngineFixture.setup()
  const agents = yield* Agent.Service
  const snapshot = yield* Snapshot.Service
  const instance = yield* TestInstance
  const user = yield* f.sessions.updateMessage({ id: MessageID.ascending(), sessionID: f.chat.id,
    role: "user", agent: "maestro", time: { created: Date.now() },
    model: { modelID: ModelV2.ID.make(model), providerID: ProviderV2.ID.make("anthropic") } })
  return { ...f, view: ClaudeCodeMirror.create({ sessionID: f.chat.id, user,
    agent: yield* agents.get("maestro"), sessions: f.sessions, snapshot,
    path: { cwd: instance.directory, root: instance.directory } }) }
})

const observed = (id: string, actualModel = model, stop: SDKAssistantMessage["message"]["stop_reason"] = "end_turn"): SDKAssistantMessage => ({ type: "assistant", ...ClaudeEngineFixture.frame,
  uuid: crypto.randomUUID(), message: { id, model: actualModel, role: "assistant", type: "message",
    container: null, context_management: null, stop_sequence: null,
    content: [{ type: "text", text: "observed", citations: null }], stop_reason: stop, usage: tokens } })

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

for (const failed of [false, true]) ClaudeEngineFixture.it.instance(
  `closed observed step keeps its actual model and receipt across ${failed ? "failure" : "success"}`,
  () => Effect.gen(function* () {
    const f = yield* persisted()
    yield* f.view.on(observed("closed", "actual-sdk-model", null))
    yield* f.view.finish(0)
    const before = yield* f.sessions.messages({ sessionID: f.chat.id })
    const owner = before.find((message) => message.info.role === "assistant")
    const receipt = owner?.parts.find((part) => part.type === "step-finish")
    if (!owner || !receipt) throw new Error("Missing closed observed owner")
    yield* f.view.on(failed ? { ...completion(0.2, "actual-sdk-model"), subtype: "error_during_execution" as const,
      is_error: true, errors: ["Observed failure"] } : completion(0.2, "actual-sdk-model"))
    if (failed) yield* f.view.fail({ aborted: false, message: "Observed failure" })
    yield* f.view.finish(0)
    const after = yield* f.sessions.messages({ sessionID: f.chat.id })
    const replies = after.filter((message) => message.info.role === "assistant")
    expect(replies).toHaveLength(1)
    expect(replies[0].info).toMatchObject({ id: owner.info.id, modelID: "actual-sdk-model", cost: 0.2,
      finish: failed ? "error" : "stop",
      tokens: { input: 10, output: 5, reasoning: 3, cache: { read: 2, write: 1 } } })
    const finishes = replies[0].parts.filter((part) => part.type === "step-finish")
    expect(finishes).toHaveLength(1)
    expect(finishes[0]).toMatchObject({ id: receipt.id, messageID: owner.info.id, cost: 0.2,
      reason: failed ? "error" : "stop", tokens: { input: 10, output: 5, reasoning: 3, cache: { read: 2, write: 1 } } })
    expect(yield* f.sessions.get(f.chat.id)).toMatchObject({ cost: 0.2,
      tokens: { input: 10, output: 5, reasoning: 3, cache: { read: 2, write: 1 } } })
    yield* f.view.finish(0)
    if (failed) yield* f.view.fail({ aborted: false, message: "Repeated failure" })
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(after)
  }), 30_000)

for (const changed of ["retracted", "replaced"] as const) ClaudeEngineFixture.it.instance(
  `priced result cannot transfer to a ${changed} same-model receipt`, () => Effect.gen(function* () {
    const f = yield* persisted()
    yield* f.view.on(observed("first"))
    const owner = observed("owner")
    if (changed === "retracted") yield* f.view.on(owner)
    yield* f.view.on(completion(0.2))
    if (changed === "retracted") yield* f.view.retract([owner.uuid])
    if (changed === "replaced") yield* f.view.on(observed("later"))
    expect((yield* f.view.finish(0)).cost).toBe(0)
    const replies = (yield* f.sessions.messages({ sessionID: f.chat.id })).filter((message) => message.info.role === "assistant")
    expect(replies).toHaveLength(changed === "retracted" ? 1 : 2)
    expect(replies.flatMap((message) => message.parts.filter((part) => part.type === "step-finish").map((part) => part.cost)))
      .toEqual(changed === "retracted" ? [0] : [0, 0])
    expect((yield* f.sessions.get(f.chat.id)).cost).toBe(0)
  }), 30_000)

ClaudeEngineFixture.it.instance("pending no-frame result cannot bind to an intervening actual assistant", () => Effect.gen(function* () {
  const f = yield* persisted()
  yield* f.view.on({ ...completion(0.2), subtype: "error_during_execution" as const, is_error: true, errors: ["No frame"] })
  yield* f.view.on(observed("intervening"))
  yield* f.view.fail({ aborted: false, message: "Later failure" })
  expect((yield* f.view.finish(0)).cost).toBe(0)
  const replies = (yield* f.sessions.messages({ sessionID: f.chat.id })).filter((message) => message.info.role === "assistant")
  expect(replies).toHaveLength(1)
  expect(replies[0].info).toMatchObject({ cost: 0, tokens: { input: 10, output: 5, reasoning: 3, cache: { read: 2, write: 1 } } })
  expect(replies[0].parts.filter((part) => part.type === "step-finish")).toMatchObject([{ cost: 0 }])
  expect((yield* f.sessions.get(f.chat.id)).cost).toBe(0)
}), 30_000)

for (const basis of ["known", "unknown", "negative", "nonfinite"] as const) ClaudeEngineFixture.it.instance(
  `whole-query allocation requires priced contributing model totals (${basis})`, () => Effect.gen(function* () {
    const f = yield* persisted()
    yield* f.view.on(observed("mixed"))
    const result = completion(1)
    yield* f.view.on({ ...result, modelUsage: { [model]: { ...result.modelUsage[model], costUSD: 0.1 },
      other: { ...result.modelUsage[model], costUSD: basis === "negative" ? -0.9 : basis === "nonfinite" ? Number.NaN : 0.9,
        ...(basis === "unknown" ? { costBasis: "unknown" as const } : {}) } } })
    expect((yield* f.view.finish(0)).cost).toBe(basis === "known" ? 1 : 0)
    expect((yield* f.sessions.get(f.chat.id)).cost).toBe(basis === "known" ? 1 : 0)
    const receipt = (yield* f.sessions.messages({ sessionID: f.chat.id })).flatMap((message) => message.parts)
      .filter((part) => part.type === "step-finish")
    expect(receipt).toHaveLength(1)
    expect(receipt[0].cost).toBe(basis === "known" ? 1 : 0)
  }), 30_000)

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

;[
  { name: "negative", frame: completion(-1) },
  { name: "NaN", frame: completion(Number.NaN) },
  { name: "positive infinity", frame: completion(Number.POSITIVE_INFINITY) },
  { name: "negative infinity", frame: completion(Number.NEGATIVE_INFINITY) },
  { name: "overflow", frame: completion(Number.MAX_VALUE * 2) },
  { name: "missing", frame: { ...completion(0.05), total_cost_usd: undefined } },
  { name: "null", frame: { ...completion(0.05), total_cost_usd: null } },
  { name: "non-number", frame: { ...completion(0.05), total_cost_usd: "-1" } },
  { name: "unattributed model", frame: completion(0.05, "incompatible-model") },
  { name: "unknown price basis", frame: { ...completion(0.05), modelUsage: {
    [model]: { ...completion(0.05).modelUsage[model], costBasis: "unknown" as const },
  } } },
  { name: "overflowed model total", frame: { ...completion(0.05), modelUsage: {
    [model]: { ...completion(0.05).modelUsage[model], costUSD: Number.MAX_VALUE * 2 },
  } } },
].forEach((invalid) => ClaudeEngineFixture.it.instance(
  `host valid-${invalid.name}-valid observations preserve admitted baseline and accept a genuine zero reset`,
  () => Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const f = yield* ClaudeEngineFixture.setup()
    const host = yield* ClaudeHost.Service
    const frames = [completion(0.1), invalid.frame, completion(0.14), { ...completion(0), modelUsage: {} }, completion(0.24)]
    ClaudeEngineFixture.state.scripts.push(async function* (input) {
      for (const [index, frame] of frames.entries()) {
        const send = await input[Symbol.asyncIterator]().next()
        if (send.done) return
        yield { type: "system", subtype: "init", model, ...ClaudeEngineFixture.frame }
        yield { ...send.value, session_id: "sdk-1" }
        if (index === 0 || index === 2 || index === 4) yield { type: "assistant", ...ClaudeEngineFixture.frame,
          uuid: `baseline-answer-${index}`, user_message_uuid: send.value.uuid,
          message: { id: `baseline-answer-${index}`, model, content: [{ type: "text", text: "observed answer" }],
            stop_reason: "end_turn", usage: tokens } }
        yield index === 1 || index === 3
          ? { ...frame, subtype: "error_during_execution", is_error: true, errors: ["No assistant frame"],
              user_message_uuid: send.value.uuid }
          : frame
      }
      for await (const _ of input) {}
    })
    // Oracles are explicit: rejecting an observation keeps 0.10; the next valid total adds only 0.04.
    const expected = [
      { baseline: 0.1, total: 0.1, charge: 0.1, answers: 1 },
      { baseline: 0.1, total: 0.1, charge: 0, answers: 1 },
      { baseline: 0.14, total: 0.14, charge: 0.04, answers: 2 },
      { baseline: 0, total: 0.14, charge: 0, answers: 2 },
      { baseline: 0.24, total: 0.38, charge: 0.24, answers: 3 },
    ]
    for (const [index, oracle] of expected.entries()) {
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say(`baseline observation ${index}`) })
      const saved = yield* f.sessions.get(f.chat.id)
      expect(saved.metadata?.claudeCode?.cost).toBeCloseTo(oracle.baseline)
      expect(saved.cost).toBeCloseTo(oracle.total)
      const replies = (yield* f.sessions.messages({ sessionID: f.chat.id })).filter((message) => message.info.role === "assistant")
      const reply = replies.at(-1)
      if (reply?.info.role !== "assistant") throw new Error("Missing settled baseline observation")
      expect(reply.info.cost).toBeCloseTo(oracle.charge)
      const receipts = reply.parts.filter((part) => part.type === "step-finish")
      expect(receipts).toHaveLength(1)
      expect(receipts[0].messageID).toBe(reply.info.id)
      expect(receipts[0].cost).toBeCloseTo(oracle.charge)
      expect(receipts[0].tokens).toEqual(reply.info.tokens)
      expect(reply.info.tokens).toEqual(index === 1 || index === 3
        ? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
        : { input: 10, output: 5, reasoning: 3, cache: { read: 2, write: 1 } })
      expect(saved.tokens).toEqual({ input: oracle.answers * 10, output: oracle.answers * 5,
        reasoning: oracle.answers * 3, cache: { read: oracle.answers * 2, write: oracle.answers } })
      expect(replies.reduce((sum, message) => sum + (message.info.role === "assistant" ? message.info.cost : 0), 0)).toBeCloseTo(oracle.total)
      expect(replies.flatMap((message) => message.parts.filter((part) => part.type === "step-finish"))
        .reduce((sum, part) => sum + part.cost, 0)).toBeCloseTo(oracle.total)
    }
    yield* host.release(f.chat.id)
  }), 30_000,
))
