import { expect, test } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LLMEvent } from "@opencode-ai/llm"
import type { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { request, run, snapshot } from "@/continuity/fork"
import { chunks, transcript } from "@/continuity/transcript"
import { Token } from "@/util/token"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { testEffect } from "../lib/effect"
import { artifact, memory, messages, model, producerID, provider, sessionID } from "./memory-fixture"

const it = testEffect(Layer.empty)
const body = { memory, references: [] }
const text = (value = JSON.stringify(body)) => [LLMEvent.textStart({ id: "text" }),
  LLMEvent.textDelta({ id: "text", text: value }), LLMEvent.textEnd({ id: "text" })]
const stopped = (value = JSON.stringify(body)) => Stream.fromIterable([...text(value), LLMEvent.finish({ reason: "stop" })])

function input() {
  const captured = snapshot(sessionID, messages().slice(0, 10), undefined, true)
  if (!captured) throw new Error("Expected whole-turn snapshot")
  return captured
}

function execute(events: Stream.Stream<LLMEvent, unknown> = stopped(), captured = input(), selected: Provider.Model = model) {
  return Effect.gen(function* () {
    const requests: LLM.StreamInput[] = []
    const archived = chunks(sessionID, captured.head)
    const artifact = yield* run(captured, { provider: provider(selected), llm: { stream: (value) => {
      requests.push(value)
      return events
    } } }, archived, [...archived, ...(captured.previous?.references ?? [])])
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

test("request is natural Markdown prior memory plus only the displaced archive chunks", () => {
  const history = messages()
  const previous = artifact()
  const captured = snapshot(sessionID, history, previous, true)!
  const archived = chunks(sessionID, history)
  const prepared = request(captured, archived, [...archived, ...previous.references], producerID)
  expect(prepared.tools).toEqual({})
  expect(prepared.toolChoice).toBe("none")
  expect(prepared.system).toEqual([])
  expect(prepared.messages).toHaveLength(1)
  expect(prepared.messages[0].role).toBe("user")
  const content = prepared.messages[0].content
  expect(content).toStartWith("# Working-memory maintenance snapshot")
  expect(content).toContain(previous.memory)
  expect(content).toContain("turn-2")
  expect(content).not.toContain("turn-0")
  expect(content).not.toContain("turn-8")
  expect(content).toContain(previous.references[0].id)
  expect(content).not.toContain('"source":')
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
  expect(result.artifact?.memory).toBe(memory)
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
  expect(call.agent.prompt).toContain("PRODUCER PROTOCOL v2")
  expect(call.agent.prompt).toContain("not the parent assistant or task owner")
  expect(call.agent.prompt).toContain("Do not continue, execute, approve")
  expect(call.agent.prompt).toContain("approximately 70% reduction")
  expect(call.user.system).toBeUndefined()
  expect(call.user.tools).toBeUndefined()
  expect(call.user.format).toBeUndefined()
  expect(String(call.messages[0].content)).toContain("historical-system-not-producer-authority")
  expect(call.responseSchema).toMatchObject({ additionalProperties: false, required: ["memory", "references"] })
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
  expect(result.requests).toHaveLength(1)
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

it.effect("checks raw assembled input, native parent reserve and output capacity, allowing memory above 6000", () => Effect.gen(function* () {
  const long = stopped(JSON.stringify({ memory: memory.repeat(220), references: [] }))
  const valid = yield* execute(long)
  expect(valid.artifact).toBeDefined()
  expect(Token.estimate(valid.artifact!.text)).toBeGreaterThan(6000)
  const output = yield* execute(long, input(), { ...model, limit: { ...model.limit, output: 1000 } })
  expect(output.requests).toHaveLength(1)
  expect(output.artifact).toBeUndefined()
  const large = input()
  const part = large.head[0].parts[0]
  if (part.type !== "text") throw new Error("Expected text")
  part.text = "raw input ".repeat(10_000)
  const oversized = yield* execute(stopped(), large, { ...model, limit: { ...model.limit, input: 10_000 } })
  expect(oversized.requests).toEqual([])
  const tail = input()
  const assistant = tail.tail.at(-1)!.info
  if (assistant.role !== "assistant") throw new Error("Expected assistant")
  assistant.tokens.input = 195_000
  expect((yield* execute(stopped(), tail)).requests).toEqual([])
  expect((yield* execute(stopped(), input(), { ...model, limit: { context: 21_000, output: 20_000 } })).requests).toEqual([])
}))

it.effect("uses only passed head chunks and declines incomplete archive coverage", () => Effect.gen(function* () {
  const captured = input()
  const archived = chunks(sessionID, [...captured.head, ...captured.tail])
  const calls: LLM.StreamInput[] = []
  const services = { provider: provider(), llm: { stream: (value: LLM.StreamInput) => { calls.push(value); return stopped() } } }
  expect(yield* run(captured, services, archived.slice(0, 1), archived)).toBeUndefined()
  expect(calls).toEqual([])
  expect(yield* run(captured, services, archived, archived)).toBeDefined()
  expect(String(calls[0].messages[0].content)).toContain("turn-0")
  expect(String(calls[0].messages[0].content)).not.toContain("turn-2")
  expect(yield* run({ ...captured, canRecall: false }, services, archived, archived)).toBeUndefined()
  expect(calls).toHaveLength(1)
}))

it.effect("workflow aliases decline; generic providers retain JSON transport without native schema", () => Effect.gen(function* () {
  const workflow = { ...model, api: { ...model.api, id: "duo-workflow-test", npm: "gitlab-ai-provider" } }
  expect((yield* execute(stopped(), input(), workflow)).requests).toEqual([])
  const generic = yield* execute(stopped(), input(), { ...model, api: { ...model.api, npm: "@ai-sdk/openai-compatible" } })
  expect(generic.artifact).toBeDefined()
  expect(generic.requests[0].responseSchema).toBeUndefined()
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
  const archived = chunks(sessionID, captured.head)
  const wait = Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never))
  const fiber = yield* run(captured, {
    provider: phase === "lookup" ? { ...provider(), getModel: () => wait } : provider(),
    llm: { stream: () => Stream.fromEffect(wait) },
  }, archived, archived).pipe(Effect.exit, Effect.forkChild)
  yield* Deferred.await(ready)
  yield* TestClock.adjust("179 seconds")
  expect(yield* Effect.sync(() => fiber.pollUnsafe())).toBeUndefined()
  yield* TestClock.adjust("1 second")
  const exit = yield* Fiber.join(fiber)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toMatchObject({ _tag: "TimeoutError" })
}))
