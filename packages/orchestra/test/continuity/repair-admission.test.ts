import { expect } from "bun:test"
import { Cause, Deferred, Effect, Fiber, Stream } from "effect"
import { jsonSchema, tool } from "ai"
import { Session } from "@/session/session"
import { SessionContinuity } from "@/continuity/service"
import { LLMContextBudget } from "@/session/llm/context-budget"
import { ParentReceipt } from "@/continuity/parent-receipt"
import { ContinuityAdmission } from "@/continuity/admission"
import { completeSnapshot, replay, run } from "@/continuity/fork"
import type { ParentRequest } from "@/continuity/fork"
import type { LLM } from "@/session/llm"
import { MessageID } from "@/session/schema"
import { it } from "../lib/effect"
import { ProviderTest } from "../fake/provider"
import { SessionV1 } from "@orchestra/core/v1/session"
import { FIRST, held, entered, environment, begin, complete, terminal } from "./service-fixture"
import { messages, model, provider, host } from "./memory-fixture"

it.instance("caller binding rejects queue arriving before candidate capture, then admits exact new caller model", () => Effect.gen(function* () {
  const plan = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const chat = yield* sessions.create({ title: "Caller binding" })
    const original = yield* begin(chat.id, "ORIGINAL_CALLER_ASK")
    yield* complete(original, "DONE", 50_000)
    const hit = yield* entered(plan)
    const newer = yield* begin(chat.id, "NEW_CALLER_EXACT_ASK")
    yield* sessions.updateMessage({ ...newer, agent: "different-agent", tools: { bash: false }, format: { type: "json_schema", schema: { type: "object" } } })
    yield* Deferred.succeed(plan.release, undefined)
    yield* terminal(hit.jobID, "completed", "discarded")
    const result = yield* continuity.admit({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), expectedUserID: original.id,
      model: ProviderTest.model({ ...model, limit: { context: 200_000, output: 10_000 } }), canRecall: true }).pipe(Effect.exit)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(Cause.squash(result.cause)).toMatchObject({ reason: "complete-prefix-caller-stale" })
    const bound = yield* continuity.admit({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), expectedUserID: newer.id,
      model: ProviderTest.model({ ...model, limit: { context: 200_000, output: 10_000 } }), canRecall: true })
    expect(bound.messages.at(-1)?.info).toMatchObject({ id: newer.id, agent: "different-agent", tools: { bash: false }, format: { type: "json_schema" } })
  }).pipe(Effect.provide(environment([plan])))
}), 180_000)

it.live("full transformed request and first-request tool definitions cannot evade hard guard via zero cached overhead", Effect.gen(function* () {
  const selected = { ...model, limit: { context: 6000, input: 5000, output: 1000 } }
  const base = { model: selected, params: { options: {} }, messages: [{ role: "user" as const, content: "normal" }], tools: {} }
  yield* LLMContextBudget.check(base, undefined, undefined, true)
  const appended = yield* LLMContextBudget.check({ ...base, messages: [{ role: "system", content: "PLUGIN_APPEND ".repeat(3000) }, ...base.messages] }, undefined, undefined, true).pipe(Effect.exit)
  expect(appended._tag).toBe("Failure")
  const definitions = yield* LLMContextBudget.check({ ...base, tools: { large: tool({ description: "TOOL_DESCRIPTION ".repeat(3000), inputSchema: jsonSchema({ type: "object" }), execute: async () => "unused" }) } }, undefined, undefined, true).pipe(Effect.exit)
  expect(definitions._tag).toBe("Failure")
  if (definitions._tag === "Failure") expect(Cause.squash(definitions.cause)).toBeInstanceOf(SessionV1.ContextOverflowError)
}))

it.live("matched parent receipt preserves cache prefix but supplies full original facts after masked/plugin projection", Effect.gen(function* () {
  const history = messages(["user", "assistant"])
  if (history[0].parts[0].type === "text") history[0].parts[0].text = "old raw source " + "pad ".repeat(4000) + "ORIGINAL_BEYOND_INDEX_CLIP"
  const last = history[1].info
  if (last.role !== "assistant") throw new Error("Expected assistant")
  last.tokens.input = 1000
  const captured = completeSnapshot(history[0].info.sessionID, history)
  if (!captured) throw new Error("No snapshot")
  const projected = structuredClone(history.slice(0, 1))
  if (projected[0].parts[0].type === "text") projected[0].parts[0].text = "PLUGIN_OR_MASK_STUB"
  const user = history[0].info
  if (user.role !== "user") throw new Error("Expected user")
  const parent: ParentRequest = ParentReceipt.capture({ input: { user, model, sessionID: user.sessionID,
    agent: { name: "build", mode: "primary", permission: [], options: {} }, system: ["SAME_CACHE_SYSTEM"], messages: [{ role: "user", content: "PLUGIN_OR_MASK_STUB" }],
    tools: {}, toolChoice: "auto" }, messageIDs: [user.id] }, last.id, projected)
  ParentReceipt.complete(parent, last)
  const requests: LLM.StreamInput[] = []
  const services = { provider: provider(), llm: { stream: (request: LLM.StreamInput) => { requests.push(request); return Stream.fail(new Error("fixture transport")) } } }
  yield* run(captured, services, host(history), { parent })
  expect(requests).toHaveLength(1)
  expect(requests[0].messages.slice(0, -1)).toEqual(parent.input.messages)
  expect(requests[0].system).toEqual(parent.input.system)
  expect(String(requests[0].messages.at(-1)?.content)).toContain("ORIGINAL_BEYOND_INDEX_CLIP")
  const wrong = ParentReceipt.capture({ ...parent }, MessageID.make("msg_newer_unmatched_response"), projected)
  requests.length = 0
  yield* run(captured, services, host(history), { parent: wrong })
  expect(requests[0].purpose).toBe("context-maintenance")
  expect(String(requests[0].messages[0].content)).toContain("ORIGINAL_BEYOND_INDEX_CLIP")
}))

for (const outcome of ["fits", "masked", "over"] as const) for (const changed of ["caller", "generation", "epoch", "none"] as const)
  it.live(`held catch-up ${outcome} classifies ${changed} ownership before unmet result`, Effect.gen(function* () {
    const history = messages(["user", "assistant", "user", "assistant", "user"])
    const user = history[4].info
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const owner = { boundary: history[1].info.id, epoch: 0, generation: 0 }
    const caller = { id: user.id }
    const admit = ContinuityAdmission.create({ prepare: () => Effect.die("Stale/unmet candidate must not prepare"), settle: () => Effect.void,
      history: () => Effect.succeed(history), current: () => Effect.succeed({ ...history[4], info: { ...user, id: caller.id } }),
      candidate: () => Effect.succeed({ ...owner }), latest: () => history[3].info.role === "assistant" ? history[3].info : undefined,
      compact: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as(outcome)),
      commit: () => Effect.die("Stale/unmet candidate must not commit"), fits: () => Effect.die("Stale/unmet candidate must not fit") })
    const task = yield* admit({ sessionID: user.sessionID, messages: history, expectedUserID: user.id }).pipe(Effect.exit, Effect.forkChild)
    yield* Deferred.await(entered)
    if (changed === "caller") caller.id = MessageID.ascending()
    if (changed === "generation") owner.generation++
    if (changed === "epoch") owner.epoch++
    yield* Deferred.succeed(release, undefined)
    const result = yield* Fiber.join(task)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(Cause.squash(result.cause)).toMatchObject({ reason: changed === "none" ? "complete-prefix-catchup-unmet" :
      changed === "caller" ? "complete-prefix-caller-stale" : "complete-prefix-admission-stale" })
  }))

for (const field of ["messages", "system", "options", "variant", "agent", "tools", "params", "order"] as const)
  it.live(`paired receipt rejects ${field} mutation with same message IDs and falls back to full isolated source`, Effect.gen(function* () {
    const history = messages(["user", "assistant"])
    const user = history[0].info
    const last = history[1].info
    if (user.role !== "user" || last.role !== "assistant") throw new Error("Expected complete turn")
    last.tokens.input = 1000
    if (history[0].parts[0].type === "text") history[0].parts[0].text = "IMMUTABLE_SOURCE_FACT " + "pad ".repeat(1000)
    const snapshot = completeSnapshot(user.sessionID, history)
    if (!snapshot) throw new Error("No receipt snapshot")
    const original: ParentRequest = { input: { user, model: structuredClone(model), sessionID: user.sessionID,
      agent: { name: "build", mode: "primary", permission: [], options: { reasoningEffort: "high" } }, system: ["CACHE_SYSTEM"],
      messages: [{ role: "user", content: "ORIGINAL_PREPARED_PREFIX" }], preflightParams: { options: { reasoningEffort: "high" }, maxOutputTokens: 1234,
        temperature: undefined, topP: undefined, topK: undefined },
      tools: { first: tool({ description: "Original tool", inputSchema: jsonSchema({ type: "object", properties: { path: { type: "string" } } }), execute: async () => "unused" }),
        second: tool({ inputSchema: jsonSchema({ type: "object" }), execute: async () => "unused" }) } }, messageIDs: [user.id] }
    const parent = ParentReceipt.capture(original, last.id, [history[0]])
    ParentReceipt.complete(parent, last)
    expect(replay(parent, snapshot, model, "instruction")).toBeDefined()
    // Mutating objects retained by caller cannot change the captured prefix or its observed-usage proof.
    original.input.messages.push({ role: "user", content: "MUTATED_CALLER" })
    original.input.tools.first.description = "Mutable caller definition"
    expect(parent.input.messages).toHaveLength(1)
    expect(parent.input.tools.first.description).toBe("Original tool")
    expect(replay(parent, snapshot, model, "instruction")).toBeDefined()
    if (field === "messages") parent.input.messages.push({ role: "user", content: "UNMATCHED_APPEND" })
    if (field === "system") parent.input.system.push("UNMATCHED_SYSTEM")
    if (field === "options") parent.input.model.options.reasoningEffort = "low"
    if (field === "variant") parent.input.user.model.variant = "low"
    if (field === "agent") parent.input.agent.options.reasoningEffort = "low"
    if (field === "tools") parent.input.tools.first.description = "UNMATCHED_TOOL"
    if (field === "params" && parent.input.preflightParams) parent.input.preflightParams.maxOutputTokens = 99999
    if (field === "order") parent.input.tools = { second: parent.input.tools.second, first: parent.input.tools.first }
    expect(replay(parent, snapshot, model, "instruction")).toBeUndefined()
    expect(ParentReceipt.usage(parent, snapshot, model)).toBeUndefined()
    const requests: LLM.StreamInput[] = []
    yield* run(snapshot, { provider: provider(), llm: { stream: (input) => { requests.push(input); return Stream.fail(new Error("fixture transport")) } } }, host(history), { parent })
    expect(requests).toHaveLength(1)
    expect(requests[0].purpose).toBe("context-maintenance")
    expect(String(requests[0].messages[0].content)).toContain("IMMUTABLE_SOURCE_FACT")
  }))
