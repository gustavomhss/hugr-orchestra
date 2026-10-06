import { expect, test } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Logger, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LLMEvent } from "@opencode-ai/llm"
import type { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { request, run, snapshot } from "@/continuity/fork"
import { transcript } from "@/continuity/transcript"
import { Token } from "@/util/token"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { testEffect } from "../lib/effect"
import { artifact, finding, host, memory, messages, model, provider, sessionID } from "./memory-fixture"

const it = testEffect(Layer.empty)
const body = { ops: [finding()] }
const text = (value = JSON.stringify(body)) => [LLMEvent.textStart({ id: "text" }),
  LLMEvent.textDelta({ id: "text", text: value }), LLMEvent.textEnd({ id: "text" })]
const stopped = (value = JSON.stringify(body)) => Stream.fromIterable([...text(value), LLMEvent.finish({ reason: "stop" })])

// A realistic head: every swap must shrink the context, so the head outweighs the memory scaffold.
function input() {
  const history = messages().slice(0, 10)
  const part = history[0].parts[0]
  if (part.type === "text") part.text = `turn-0 ${"historical context ".repeat(1_000)}`
  const captured = snapshot(sessionID, history, undefined, true)
  if (!captured) throw new Error("Expected whole-turn snapshot")
  return captured
}

function execute(events: Stream.Stream<LLMEvent, unknown> | Stream.Stream<LLMEvent, unknown>[] = stopped(), captured = input(),
  selected: Provider.Model = model, trigger = 0.7) {
  return Effect.gen(function* () {
    const requests: LLM.StreamInput[] = []
    const replies = Array.isArray(events) ? events : [events]
    const artifact = yield* run(captured, { provider: provider(selected), llm: { stream: (value) => {
      requests.push(value)
      // A retry replays the last scripted reply unless the scenario scripts another.
      return replies[Math.min(requests.length, replies.length) - 1]
    } } }, host([...captured.head, ...captured.tail]), { trigger })
    return { artifact, requests }
  })
}

test("snapshot retains eight native messages and expands to a complete user turn", () => {
  const history = messages().slice(0, 10)
  const result = snapshot(sessionID, history)
  expect(result?.head).toEqual(history.slice(0, 2))
  expect(result?.tail).toEqual(history.slice(2))
  expect(result?.boundary).toBe(history[9].info.id)
  expect(result?.canRecall).toBe(false)
  const exchange = messages(["user", "assistant", "user", ...Array<"assistant">(11).fill("assistant")])
  expect(snapshot(sessionID, exchange)?.head).toEqual(exchange.slice(0, 2))
  expect(snapshot(sessionID, exchange)?.tail).toEqual(exchange.slice(2))
})

test("head budget uses real transcript cost and never splits a tool exchange", () => {
  const history = messages()
  history[1].parts.push({ id: PartID.make("prt_tool"), messageID: history[1].info.id, sessionID,
    type: "tool", tool: "bash", callID: "call", state: { status: "completed", input: { command: "read-only check" },
      title: "check", output: "failed verification\n".repeat(300), metadata: { exit: 75 }, time: { start: 1, end: 2 } } })
  const budget = Token.estimate(transcript(history.slice(0, 2)))
  expect(snapshot(sessionID, history, undefined, true, budget)?.head).toEqual(history.slice(0, 2))
  expect(snapshot(sessionID, history, undefined, true, budget)?.tail).toEqual(history.slice(2))
  expect(snapshot(sessionID, history, undefined, true, budget - 1)).toBeUndefined()
  expect(snapshot(sessionID, history, undefined, true, Token.estimate(transcript(history.slice(0, 4))))?.head)
    .toEqual(history.slice(0, 4))
})

test("prior memory starts at its tail; incompatible prior falls back to the raw head", () => {
  const history = messages()
  const previous = artifact()
  const result = snapshot(sessionID, history, previous, true)
  expect(result?.previous).toBe(previous)
  expect(result?.head).toEqual(history.slice(2, 8))
  expect(snapshot(sessionID, history.slice(2), previous, true)?.head).toEqual(result?.head)
  expect(snapshot(sessionID, history.slice(0, 10), previous, true)).toBeUndefined()
  for (const change of [
    (value: typeof previous) => { Reflect.set(value, "version", 1) },
    (value: typeof previous) => { value.parentID = SessionID.make("ses_foreign") },
    (value: typeof previous) => { value.tailStart = history[3].info.id },
    (value: typeof previous) => { value.coveredThrough = history[5].info.id },
    (value: typeof previous) => { value.boundary = MessageID.make("msg_missing") },
  ]) {
    const invalid = structuredClone(previous)
    change(invalid)
    const fallback = snapshot(sessionID, history, invalid, true)
    expect(fallback?.previous).toBeUndefined()
    expect(fallback?.head).toEqual(history.slice(0, 8))
  }
})

test("declines empty head, oversized first turn, foreign messages and invalid budgets", () => {
  for (const history of [[], messages().slice(0, 2), messages(["user", ...Array<"assistant">(12).fill("assistant")])])
    expect(snapshot(sessionID, history)).toBeUndefined()
  const foreign = messages()
  foreign[0].info.sessionID = SessionID.make("ses_other")
  expect(snapshot(sessionID, foreign)).toBeUndefined()
  for (const budget of [0, -1, NaN, Infinity]) expect(snapshot(sessionID, messages(), undefined, true, budget)).toBeUndefined()
})

test("isolated request carries the prior memory, the new span transcript and the index", () => {
  const history = messages()
  const previous = artifact()
  const captured = snapshot(sessionID, history, previous, true)!
  const prepared = request(captured, "## New span\nINDEX")
  expect(prepared.tools).toEqual({})
  expect(prepared.toolChoice).toBe("none")
  expect(prepared.system).toEqual([])
  expect(prepared.messages).toHaveLength(1)
  const content = prepared.messages[0].content
  expect(content).toStartWith("# Working-memory maintenance snapshot")
  expect(content).toContain(previous.text)
  const span = content.slice(content.indexOf("## Transcript of the new span"))
  expect(span).toContain("turn-2")
  expect(span).not.toContain("turn-0")
  expect(span).not.toContain("turn-8")
  expect(content).toEndWith("## New span\nINDEX")
})

it.effect("isolated request preserves parent model settings and dedicated role, never parent authority", () => Effect.gen(function* () {
  const captured = input()
  for (const message of [...captured.head, ...captured.tail]) {
    if (message.info.role !== "user") continue
    message.info.system = "historical-system-not-producer-authority"
    message.info.tools = { bash: true }
    message.info.format = { type: "json_schema", schema: { parent: true }, retryCount: 2 }
  }
  const result = yield* execute(stopped(), captured)
  expect(result.artifact?.text).toContain(memory)
  expect(result.requests).toHaveLength(1)
  const call = result.requests[0]
  expect(call.model).toEqual(model)
  expect(call.user.model.variant).toBe("parent-variant")
  expect(call.purpose).toBe("context-maintenance")
  expect(call.parentSessionID).toBe(sessionID)
  expect(call.sessionID).not.toBe(sessionID)
  expect(call.tools).toEqual({})
  expect(call.toolChoice).toBe("none")
  expect(call.system).toEqual([])
  expect(call.agent.permission).toEqual([{ permission: "*", pattern: "*", action: "deny" }])
  expect(call.agent.prompt).toStartWith("CONTEXT CONTINUITY CHECKPOINT · working memory v4")
  expect(call.agent.prompt).toContain("do not continue the task, call tools or answer anyone")
  expect(call.agent.prompt).toContain("There is no size target")
  expect(call.user.system).toBeUndefined()
  expect(call.user.tools).toBeUndefined()
  expect(call.user.format).toBeUndefined()
  const content = String(call.messages[0].content)
  expect(content).toContain("historical-system-not-producer-authority")
  expect(content).toMatch(/## New span\nu1, a1 \(through a1\)\. The native tail starts at u2 and is not covered\./)
  expect(content).toMatch(/## Index of the new span\nu1 [^\n]+ "turn-0 historical context/)
  expect(content).toMatch(/## Size\nRendered memory now ~0 tokens; ceiling [\d,]+\./)
  expect(call.responseSchema).toBeUndefined()
}))

for (const event of [
  LLMEvent.providerError({ message: "refusal" }),
  LLMEvent.toolInputStart({ id: "tool", name: "bash" }),
  LLMEvent.toolInputDelta({ id: "tool", name: "bash", text: "{}" }),
  LLMEvent.toolInputEnd({ id: "tool", name: "bash" }),
  LLMEvent.toolCall({ id: "tool", name: "bash", input: {} }),
  LLMEvent.toolResult({ id: "tool", name: "bash", result: { type: "text", value: "attempted" } }),
  LLMEvent.toolError({ id: "tool", name: "bash", message: "attempted" }),
  LLMEvent.stepFinish({ index: 0, reason: "length" }),
  LLMEvent.stepFinish({ index: 0, reason: "content-filter" }),
]) it.effect(`${event.type} invalidation remains sticky through a later valid stop`, () => Effect.gen(function* () {
  const result = yield* execute(Stream.fromIterable([event, ...text(), LLMEvent.finish({ reason: "stop" })]))
  // C1 fails, and the one retry fails the same way.
  expect(result.requests).toHaveLength(2)
  expect(result.artifact).toBeUndefined()
}))

it.effect("partial, refused, nonterminal and post-finish streams cannot become memory", () => Effect.gen(function* () {
  for (const events of [
    text(), [...text(), LLMEvent.finish({ reason: "length" })],
    [...text(), LLMEvent.finish({ reason: "content-filter" })],
    [...text(), LLMEvent.finish({ reason: "stop" }), LLMEvent.textDelta({ id: "text", text: "extra" })],
    [...text('{"memory":"partial'), LLMEvent.finish({ reason: "stop" })],
  ]) expect((yield* execute(Stream.fromIterable(events))).artifact).toBeUndefined()
  const failure = new Error("transport failed")
  const exit = yield* execute(Stream.concat(Stream.fromIterable(text()), Stream.fail(failure))).pipe(Effect.exit)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe(failure)
}))

it.effect("a failed check gets one cache-hot retry with the rejected reply and the check", () => Effect.gen(function* () {
  const invalid = JSON.stringify({ ops: [{ ...finding(), src: ["u9"] }] })
  const events: unknown[] = []
  const result = yield* execute([stopped(invalid), stopped()]).pipe(Effect.provide(Logger.layer([
    Logger.make<unknown, void>((options) => { events.push(options.message) })])))
  expect(result.artifact?.text).toContain(memory)
  expect(result.requests).toHaveLength(2)
  const [first, second] = result.requests
  expect(second.messages.slice(0, first.messages.length)).toEqual(first.messages)
  expect(second.messages.at(-2)).toEqual({ role: "assistant", content: invalid })
  expect(String(second.messages.at(-1)!.content)).toStartWith("HOST CHECK FAILED. C4: u9 is not an alias")
  expect(events).toContainEqual(["continuity maintenance", expect.objectContaining({ reason: "pass", outcome: "accepted", retried: true,
    ops: body.ops, ceiling: expect.any(Number), size: expect.any(Number) })])
  // A failed retry discards the pass; the breaker counts it in the service.
  const twice = yield* execute([stopped(invalid), Stream.fromIterable([...text(invalid), LLMEvent.finish({ reason: "length" })])])
  expect(twice.requests).toHaveLength(2)
  expect(twice.artifact).toBeUndefined()
  // A transport failure is not a check failure and is never retried.
  expect((yield* execute([Stream.fail(new Error("down")), stopped()]).pipe(Effect.exit))._tag).toBe("Failure")
}))

it.effect("the ceiling is derived from the trigger and the head, never from the output limit", () => Effect.gen(function* () {
  const long = JSON.stringify({ ops: [finding(memory.repeat(30))] })
  const valid = yield* execute(stopped(long), input(), { ...model, limit: { ...model.limit, output: 100 } })
  expect(valid.artifact).toBeDefined()
  expect(Token.estimate(valid.artifact!.text)).toBeGreaterThan(1000)
  // Every swap shrinks the context: memory larger than the head it replaces is rejected.
  const small = input()
  const part = small.head[0].parts[0]
  if (part.type === "text") part.text = "turn-0"
  const larger = yield* execute([stopped(long), stopped(long)], small)
  expect(larger.requests).toHaveLength(2)
  expect(larger.artifact).toBeUndefined()
  expect(String(larger.requests[1].messages.at(-1)!.content)).toContain("C12: the rendered memory is")
  // No positive ceiling: the protected tail alone exceeds the post-swap level, so no pass runs.
  expect((yield* execute(stopped(), input(), model, 0.16)).requests).toEqual([])
  const large = input()
  const text = large.head[0].parts[0]
  if (text.type !== "text") throw new Error("Expected text")
  text.text = "raw input ".repeat(10_000)
  const oversized = yield* execute(stopped(), large, { ...model, limit: { ...model.limit, input: 10_000 } })
  expect(oversized.requests).toEqual([])
}))

it.effect("declines without recall capability", () => Effect.gen(function* () {
  const calls: LLM.StreamInput[] = []
  const services = { provider: provider(), llm: { stream: (value: LLM.StreamInput) => { calls.push(value); return stopped() } } }
  expect(yield* run({ ...input(), canRecall: false }, services, host(), { trigger: 0.7 })).toBeUndefined()
  expect(calls).toEqual([])
}))

it.effect("workflow aliases decline; generic providers retain JSON transport without native schema", () => Effect.gen(function* () {
  const workflow = { ...model, api: { ...model.api, id: "duo-workflow-test", npm: "gitlab-ai-provider" } }
  expect((yield* execute(stopped(), input(), workflow)).requests).toEqual([])
  const generic = yield* execute(stopped(), input(), { ...model, api: { ...model.api, npm: "@ai-sdk/openai-compatible" } })
  expect(generic.artifact).toBeDefined()
}))

it.effect("verbosity only adjusts supported defaults, respecting explicit model and variant options", () => Effect.gen(function* () {
  for (const value of [model, { ...model, options: { textVerbosity: "low" } },
    { ...model, variants: { "parent-variant": { textVerbosity: "high" } } },
    { ...model, api: { ...model.api, npm: "@ai-sdk/openai-compatible" } }]) {
    const result = yield* execute(stopped(), input(), value)
    expect(result.artifact).toBeDefined()
    expect(result.requests[0].agent.options).toEqual(value === model ? { textVerbosity: "medium" } : {})
  }
}))

for (const phase of ["lookup", "stream"] as const) it.effect(`180-second timeout includes ${phase}`, () => Effect.gen(function* () {
  const ready = yield* Deferred.make<void>()
  const captured = input()
  const wait = Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never))
  const fiber = yield* run(captured, {
    provider: phase === "lookup" ? { ...provider(), getModel: () => wait } : provider(),
    llm: { stream: () => Stream.fromEffect(wait) },
  }, host(), { trigger: 0.7 }).pipe(Effect.exit, Effect.forkChild)
  yield* Deferred.await(ready)
  yield* TestClock.adjust("179 seconds")
  expect(yield* Effect.sync(() => fiber.pollUnsafe())).toBeUndefined()
  yield* TestClock.adjust("1 second")
  const exit = yield* Fiber.join(fiber)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toMatchObject({ _tag: "TimeoutError" })
}))
