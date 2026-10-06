import { expect, test } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
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
    const { artifact, ...pass } = yield* run(captured, { provider: provider(selected), llm: { stream: (value) => {
      requests.push(value)
      // A retry replays the last scripted reply unless the scenario scripts another.
      return replies[Math.min(requests.length, replies.length) - 1]
    } } }, host([...captured.head, ...captured.tail]), { trigger })
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
      title: "check", output: "failed verification\n".repeat(300), metadata: { exit: 75 }, time: { start: 1, end: 2 } } })
  const budget = Token.estimate(transcript(history.slice(0, 2)))
  expect(snapshot(sessionID, history, undefined, true, budget)?.head).toEqual(history.slice(0, 2))
  expect(snapshot(sessionID, history, undefined, true, budget)?.tail).toEqual(history.slice(2))
  // One whole turn over the budget is still taken, so coverage never stalls on it.
  expect(snapshot(sessionID, history, undefined, true, budget - 1)?.head).toEqual(history.slice(0, 2))
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
  if (part.type === "text") part.text = `turn-0 ${"historical context ".repeat(150)}`
  const larger = yield* execute([stopped(long), stopped(long)], small)
  expect(larger.requests).toHaveLength(2)
  expect(larger.artifact).toBeUndefined()
  expect(String(larger.requests[1].messages.at(-1)!.content)).toContain("C12: the rendered memory is")
  // No positive ceiling: the protected tail alone exceeds the post-swap level, so no pass runs.
  const none = yield* execute(stopped(), input(), model, 0.16)
  expect(none.requests).toEqual([])
  expect(none.pass.skip).toBe("no-ceiling")
  // A head smaller than the fixed scaffold cannot be replaced by any reply: skip, not a failure (P4).
  const tiny = input()
  const first = tiny.head[0].parts[0]
  if (first.type === "text") first.text = "turn-0"
  const room = yield* execute(stopped(), tiny)
  expect(room.requests).toEqual([])
  expect(room.pass.skip).toBe("no-room")
  const large = input()
  const text = large.head[0].parts[0]
  if (text.type !== "text") throw new Error("Expected text")
  text.text = "raw input ".repeat(10_000)
  const oversized = yield* execute(stopped(), large, { ...model, limit: { ...model.limit, input: 10_000 } })
  expect(oversized.requests).toEqual([])
  expect(oversized.pass.skip).toBe("input-limit")
  // The head is measured as the model sees it: stored metadata such as an edit diff is not context.
  const inflated = input()
  inflated.head[1].parts.push({ id: PartID.make("prt_edit"), messageID: inflated.head[1].info.id, sessionID, type: "tool", tool: "edit",
    callID: "edit", state: { status: "completed", input: { filePath: "src/app.ts" }, output: "Edit applied.", title: "edit",
      metadata: { diff: "+ changed line\n".repeat(15_000), filediff: { patch: "+ changed line\n".repeat(15_000) } }, time: { start: 1, end: 2 } } })
  const measured = yield* execute(stopped(), inflated)
  expect(measured.artifact).toBeDefined()
  expect(measured.pass.ceiling).toBeLessThan(10_000)
}))

it.effect("declines without recall capability", () => Effect.gen(function* () {
  const calls: LLM.StreamInput[] = []
  const services = { provider: provider(), llm: { stream: (value: LLM.StreamInput) => { calls.push(value); return stopped() } } }
  expect(yield* run({ ...input(), canRecall: false }, services, host(), { trigger: 0.7 })).toMatchObject({ skip: "precondition" })
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
