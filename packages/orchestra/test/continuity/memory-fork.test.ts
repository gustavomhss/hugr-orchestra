import { expect, test } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LLMEvent } from "@orchestra/llm"
import type { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { request, run, snapshot, tailCut } from "@/continuity/fork"
import { transcript } from "@/continuity/transcript"
import { Token } from "@/util/token"
import type { MemorySnapshot } from "@/continuity/memory-types"
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
  selected: Provider.Model = model) {
  return Effect.gen(function* () {
    const requests: LLM.StreamInput[] = []
    const replies = Array.isArray(events) ? events : [events]
    const { artifact, ...pass } = yield* run(captured, { provider: provider(selected), llm: { stream: (value) => {
      requests.push(value)
      // A retry replays the last scripted reply unless the scenario scripts another.
      return replies[Math.min(requests.length, replies.length) - 1]
    } } }, host([...captured.head, ...captured.tail]))
    return { artifact, pass, requests }
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
      title: "check", output: "failed verification\n".repeat(90), metadata: { exit: 75 }, time: { start: 1, end: 2 } } })
  const budget = Token.estimate(transcript(history.slice(0, 2)))
  expect(snapshot(sessionID, history, undefined, true, budget)?.head).toEqual(history.slice(0, 2))
  expect(snapshot(sessionID, history, undefined, true, budget)?.tail).toEqual(history.slice(2))
  // A turn over the budget is cut between its messages; the first message is always taken, so coverage never stalls.
  expect(snapshot(sessionID, history, undefined, true, budget - 1)?.head).toEqual(history.slice(0, 1))
  // The replay transport sends no head transcript: an infinite budget covers up to the native tail.
  expect(snapshot(sessionID, history, undefined, true, Infinity)?.head).toEqual(history.slice(0, 8))
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

test("a turn longer than the tail ceiling is cut between its steps", () => {
  const history = messages(["user", ...Array<"assistant">(12).fill("assistant")])
  for (const message of history.slice(1)) message.parts.push({ id: PartID.make(`prt_${message.info.id}`), messageID: message.info.id,
    sessionID, type: "tool", tool: "read", callID: `call_${message.info.id}`, state: { status: "completed", input: { filePath: "a.ts" },
      title: "read", output: "line\n".repeat(400), metadata: {}, time: { start: 1, end: 2 } } })
  const step = Token.estimate(transcript(history.slice(12)))
  // Without a ceiling the whole turn stays native and nothing can be covered.
  expect(snapshot(sessionID, history)).toBeUndefined()
  expect(tailCut(history)).toBe(0)
  // With one: the most recent steps that fit stay native, the earlier steps join the head.
  const result = snapshot(sessionID, history, undefined, true, Infinity, step * 3)!
  expect(result.tail).toEqual(history.slice(10))
  expect(result.head).toEqual(history.slice(0, 10))
  expect(result.tail[0].info.role).toBe("assistant")
  expect(result.tailTokens).toBe(step * 3)
  // The last message always stays native, even when it alone is over the ceiling.
  expect(snapshot(sessionID, history, undefined, true, Infinity, 1)?.tail).toEqual(history.slice(12))
  // A turn that fits keeps the old rule: the tail starts at its user message.
  expect(tailCut(messages(), Infinity)).toBe(tailCut(messages(), 1_000_000))
})

test("declines empty head, oversized first turn, foreign messages and invalid budgets", () => {
  for (const history of [[], messages().slice(0, 2), messages(["user", ...Array<"assistant">(12).fill("assistant")])])
    expect(snapshot(sessionID, history)).toBeUndefined()
  const foreign = messages()
  foreign[0].info.sessionID = SessionID.make("ses_other")
  expect(snapshot(sessionID, foreign)).toBeUndefined()
  for (const budget of [0, -1, NaN]) expect(snapshot(sessionID, messages(), undefined, true, budget)).toBeUndefined()
})

test("isolated request carries the prior memory, the new span transcript and the index", () => {
  const history = messages()
  history[3].parts.push({ id: PartID.make("prt_tool"), messageID: history[3].info.id, sessionID, type: "tool", tool: "bash",
    callID: "call", state: { status: "completed", input: { command: "bun test" }, output: "1 pass", title: "test",
      metadata: { exit: 0 }, time: { start: 1, end: 2 } } })
  const previous = artifact()
  const captured = snapshot(sessionID, history, previous, true)!
  const prepared = request(captured, host(history), "## New span\nINDEX")
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
  // Transcript headings carry the aliases the index and the checks use.
  expect(span).toContain("## user message msg_2 · u2\n")
  expect(span).toContain("## assistant message msg_3 · a2\n")
  expect(span).toContain('### Tool "bash" — prt_tool · t1\n')
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
  expect(call.agent.prompt).toStartWith("CONTEXT CONTINUITY CHECKPOINT · working memory v5 complete prefix")
  expect(call.agent.prompt).toContain("do not continue the task, call tools or answer anyone")
  expect(call.agent.prompt).toContain("There is no size limit")
  expect(call.user.system).toBeUndefined()
  expect(call.user.tools).toBeUndefined()
  expect(call.user.format).toBeUndefined()
  const content = String(call.messages[0].content)
  expect(content).toContain("historical-system-not-producer-authority")
  expect(content).toMatch(/## New span\nu1, a1 \(through a1\)\. The native tail starts at u2 and is not covered\./)
  expect(content).toMatch(/## Index of the new span\nu1 [^\n]+ "turn-0 historical context/)
  expect(content).toMatch(/## Size\nRendered memory now ~0 tokens\./)
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
  const result = yield* execute(Stream.concat(Stream.fromIterable(text()), Stream.fail(failure)))
  expect(result.pass.failure).toBe("provider")
  expect(result.artifact).toBeUndefined()
  expect(result.requests).toHaveLength(1)
}))

it.effect("a failed check gets one cache-hot retry with the rejected reply and the check", () => Effect.gen(function* () {
  const invalid = JSON.stringify({ ops: [{ ...finding(), src: ["u9"] }] })
  const result = yield* execute([stopped(invalid), stopped()])
  expect(result.artifact?.text).toContain(memory)
  expect(result.requests).toHaveLength(2)
  const [first, second] = result.requests
  expect(second.messages.slice(0, first.messages.length)).toEqual(first.messages)
  expect(second.messages.at(-2)).toEqual({ role: "assistant", content: invalid })
  expect(String(second.messages.at(-1)!.content)).toStartWith("HOST CHECK FAILED. C4: u9 is not an alias")
  // The pass summary is structural: op kinds, sections and IDs, never contents.
  expect(result.pass).toMatchObject({ retried: true, ops: [{ op: "add", section: "findings" }] })
  expect(JSON.stringify(result.pass)).not.toContain(memory)
  // A failed retry rejects the pass; the breaker counts it in the service.
  const twice = yield* execute([stopped(invalid), Stream.fromIterable([...text(invalid), LLMEvent.finish({ reason: "length" })])])
  expect(twice.requests).toHaveLength(2)
  expect(twice.artifact).toBeUndefined()
  expect(twice.pass).toMatchObject({ check: "C1", retried: true })
  expect(twice.pass.skip).toBeUndefined()
  // A failed reply too large to retry within the input limit is a failure, not a skip: the breaker counts it.
  const huge = yield* execute(stopped("x".repeat(200_000)), input(), { ...model, limit: { ...model.limit, input: 30_000 } })
  expect(huge.requests).toHaveLength(1)
  expect(huge.artifact).toBeUndefined()
  expect(huge.pass).toMatchObject({ check: "C1", retried: false })
  expect(huge.pass.skip).toBeUndefined()
  // A transport failure is not a check failure and is never retried.
  const down = yield* execute([Stream.fail(new Error("down")), stopped()])
  expect(down.pass.failure).toBe("provider")
  expect(down.artifact).toBeUndefined()
  expect(down.requests).toHaveLength(1)
}))

it.effect("the memory has no size limit; only the producer's own input limit can skip a pass", () => Effect.gen(function* () {
  // A memory larger than the head it replaces is accepted: the producer judges what stays, not a ceiling.
  const long = JSON.stringify({ ops: [finding(memory.repeat(30))] })
  const small = input()
  const part = small.head[0].parts[0]
  if (part.type === "text") part.text = `turn-0 ${"historical context ".repeat(150)}`
  const larger = yield* execute(stopped(long), small, { ...model, limit: { ...model.limit, output: 100 } })
  expect(larger.requests).toHaveLength(1)
  expect(larger.artifact).toBeDefined()
  expect(Token.estimate(larger.artifact!.text)).toBeGreaterThan(1000)
  // A tiny head still gets a pass: no scaffold-size skip.
  const tiny = input()
  const first = tiny.head[0].parts[0]
  if (first.type === "text") first.text = "turn-0"
  expect((yield* execute(stopped(), tiny)).pass.skip).toBeUndefined()
  const large = input()
  const text = large.head[0].parts[0]
  if (text.type !== "text") throw new Error("Expected text")
  text.text = "raw input ".repeat(10_000)
  // A huge part reaches the producer clipped (the archive keeps every byte), so it fits a 10,000-token input.
  const clipped = yield* execute(stopped(), large, { ...model, limit: { ...model.limit, input: 10_000 } })
  expect(clipped.pass.skip).toBeUndefined()
  expect(String(clipped.requests[0].messages[0].content)).toContain("more characters; the archive keeps them")
  const oversized = yield* execute(stopped(), large, { ...model, limit: { ...model.limit, input: 2_000 } })
  expect(oversized.requests).toEqual([])
  expect(oversized.pass.skip).toBe("input-limit")
}))

it.effect("runs without recall capability: memory no longer depends on it", () => Effect.gen(function* () {
  const calls: LLM.StreamInput[] = []
  const services = { provider: provider(), llm: { stream: (value: LLM.StreamInput) => { calls.push(value); return stopped() } } }
  expect((yield* run({ ...input(), canRecall: false }, services, host())).skip).toBeUndefined()
  expect(calls.length).toBeGreaterThan(0)
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

for (const phase of ["lookup", "stream"] as const) it.effect(`600-second timeout includes ${phase}`, () => Effect.gen(function* () {
  const ready = yield* Deferred.make<void>()
  const captured = input()
  const wait = Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never))
  const fiber = yield* run(captured, {
    provider: phase === "lookup" ? { ...provider(), getModel: () => wait } : provider(),
    llm: { stream: () => Stream.fromEffect(wait) },
  }, host()).pipe(Effect.exit, Effect.forkChild)
  yield* Deferred.await(ready)
  yield* TestClock.adjust("599 seconds")
  expect(yield* Effect.sync(() => fiber.pollUnsafe())).toBeUndefined()
  yield* TestClock.adjust("1 second")
  const exit = yield* Fiber.join(fiber)
  expect(Exit.isSuccess(exit)).toBe(true)
  if (Exit.isSuccess(exit)) {
    expect(exit.value.failure).toBe("timeout")
    expect(exit.value.artifact).toBeUndefined()
  }
}))

it.effect("a span inside one long turn takes the model from that turn's user message in the history", () => Effect.gen(function* () {
  const history = messages(["user", ...Array<"assistant">(12).fill("assistant")])
  const part = history[1].parts[0]
  if (part.type === "text") part.text = `step-1 ${"historical context ".repeat(1_000)}`
  // Head and tail both sit inside the turn: neither holds a user message.
  const captured: MemorySnapshot = { sessionID, boundary: history[12].info.id, tailStart: history[5].info.id,
    head: history.slice(1, 5), tail: history.slice(5), canRecall: true }
  const calls: LLM.StreamInput[] = []
  const services = { provider: provider(), llm: { stream: (value: LLM.StreamInput) => { calls.push(value); return stopped() } } }
  expect((yield* run(captured, services, host(history))).skip).toBeUndefined()
  expect(calls[0]?.model.id).toBe(model.id)
}))
