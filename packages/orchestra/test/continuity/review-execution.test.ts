import { expect } from "bun:test"
import { Deferred, Effect, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LLMEvent } from "@orchestra/llm"
import type { LLM } from "@/session/llm"
import { completeSnapshot, run } from "@/continuity/fork"
import { validReview } from "@/continuity/review-seal"
import { ContinuityReview } from "@/continuity/review"
import { decode } from "@/continuity/memory"
import { ClaudeCodeLLM } from "@/claude-code/llm"
import { Token } from "@/util/token"
import { it } from "../lib/effect"
import { host, messages, model, provider, producerID } from "./memory-fixture"

function scenario() {
  const history = messages(["user", "assistant", "user", "assistant"])
  const first = history[0].parts[0]
  const latest = history[2].parts[0]
  if (first.type !== "text" || latest.type !== "text") throw new Error("Expected user text")
  first.text = "Keep release code ORCHID-REVIEW-3C97."
  latest.text = "Report delivered and verified. Wait for my next request; do not rerun completed checks."
  const snapshot = completeSnapshot(history[0].info.sessionID, history)
  if (!snapshot) throw new Error("Expected complete snapshot")
  return { history, snapshot, host: host(history) }
}

const candidate = (next = "Wait for owner", value = "ORCHID-REVIEW-3C97") => JSON.stringify({
  now: { doing: "Report delivered", next, src: ["a2"] },
  ops: [{ op: "add", section: "values", src: ["u1"], fields: { name: "release code", value } }],
})
const accepted = JSON.stringify({ verdict: "accept", cursor: { supported: true, state: "closed", next: "wait-user",
  reason: "Owner confirmed completion and requested waiting.", src: ["u2", "a2"] },
  critical: [{ item: "m1", src: ["u1"] }], resolved: [], issues: [] })
const rejected = JSON.stringify({ verdict: "repair", cursor: { supported: false, state: "closed", next: "wait-user",
  reason: "Next step reopens completed verification contrary to owner request.", src: ["u2", "a2"] },
  critical: [{ item: "m1", src: ["u1"] }], resolved: [], issues: [{ kind: "repetition", detail: "Wait for owner instead of rerunning completed checks.", src: ["u2"] }] })
const response = (text: string) => Stream.make(LLMEvent.textStart({ id: "text" }), LLMEvent.textDelta({ id: "text", text }),
  LLMEvent.textEnd({ id: "text" }), LLMEvent.finish({ reason: "stop" }))

it.effect("semantic rejection repairs once and publishes only after corrected candidate is reviewed", () => Effect.gen(function* () {
  const value = scenario()
  const requests: LLM.StreamInput[] = []
  const replies = [candidate("Rerun completed checks"), rejected, candidate(), accepted]
  const result = yield* run(value.snapshot, { provider: provider(), llm: { stream: (input) => {
    requests.push(input)
    const reply = replies[requests.length - 1]
    if (!reply) throw new Error("Unexpected paid retry")
    return response(reply)
  } } }, value.host)
  expect(requests).toHaveLength(4)
  expect(requests.map((request) => request.agent.name)).toEqual(["continuity", "continuity-review", "continuity", "continuity-review"])
  expect(JSON.stringify(requests[2].messages)).toContain("C18")
  expect(JSON.stringify(requests[2].messages)).toContain("Wait for owner")
  for (const review of [requests[1], requests[3]]) {
    expect(review.model).toBe(model)
    expect(review.tools).toEqual({})
    expect(review.purpose).toBe("context-maintenance")
    expect(JSON.stringify(review.messages)).toContain("Report delivered and verified")
  }
  expect(result.retried).toBe(true)
  expect(result.artifact?.version).toBe(5)
  if (result.artifact?.version !== 5) throw new Error("Missing reviewed v5 artifact")
  expect(result.artifact.now.next).toBe("Wait for owner")
  expect(result.artifact.review).toMatchObject({ state: "closed", next: "wait-user", critical: ["m1"] })
  expect(validReview(result.artifact)).toBe(true)
}))

it.effect("structural correction and semantic review share one producer correction allowance", () => Effect.gen(function* () {
  const value = scenario()
  const requests: LLM.StreamInput[] = []
  const replies = [candidate("Rerun checks", "FORGED_RELEASE"), candidate("Rerun checks"), rejected]
  const result = yield* run(value.snapshot, { provider: provider(), llm: { stream: (input) => {
    requests.push(input)
    const reply = replies[requests.length - 1]
    if (!reply) throw new Error("Second producer correction is forbidden")
    return response(reply)
  } } }, value.host)
  expect(requests).toHaveLength(3)
  expect(requests.map((request) => request.agent.name)).toEqual(["continuity", "continuity", "continuity-review"])
  expect(result.artifact).toBeUndefined()
  expect(result).toMatchObject({ check: "C18", failure: "invalid-schema", retried: true })
}))

it.effect("malformed or tool-emitting review cannot publish a structurally valid candidate", () => Effect.gen(function* () {
  const value = scenario()
  for (const bad of [response("{}"), Stream.make(LLMEvent.toolCall({ id: "forbidden", name: "read", input: {} }), LLMEvent.finish({ reason: "stop" }))]) {
    const requests: LLM.StreamInput[] = []
    const result = yield* run(value.snapshot, { provider: provider(), llm: { stream: (input) => {
      requests.push(input)
      return input.agent.name === "continuity-review" ? bad : response(candidate())
    } } }, value.host)
    expect(requests).toHaveLength(4)
    expect(result.artifact).toBeUndefined()
    expect(result).toMatchObject({ check: "C18", failure: "invalid-schema", retried: true })
  }
}))

it.effect("review source budget fails explicitly without paying an unchecked audit or publishing candidate", () => Effect.gen(function* () {
  const value = scenario()
  const selected = { ...model, limit: { context: 20_000, output: 2_000 } }
  const requests: LLM.StreamInput[] = []
  const result = yield* run(value.snapshot, { provider: provider(selected), llm: { stream: (input) => {
    requests.push(input)
    return response(candidate("Unsupported lengthy next action ".repeat(10_000)))
  } } }, value.host)
  expect(requests).toHaveLength(1)
  expect(result.artifact).toBeUndefined()
  expect(result).toMatchObject({ check: "C18", failure: "input-budget", retried: false })
}))

it.effect("near-limit SDK audit budgets compiled role framing and never constructs over-budget child query", () => Effect.gen(function* () {
  const value = scenario()
  const parsed = decode({ text: candidate(), snapshot: value.snapshot, host: value.host, producerID, budget: model.limit.context })
  if (!("artifact" in parsed) || parsed.artifact.version !== 5) throw new Error("Expected v5 candidate")
  const packet = ContinuityReview.request(value.snapshot, value.host, parsed.artifact)
  const compiled = ClaudeCodeLLM.payload({ ...packet, agent: { name: "continuity-review", mode: "subagent", permission: [], options: {} } })
  const budget = Token.estimate(compiled.system + compiled.prompt) + 10_000
  const selected = { ...model, limit: { ...model.limit, input: budget } }
  const opened = { calls: 0 }
  const native = ClaudeCodeLLM.create({ query: () => { opened.calls++; throw new Error("Over-budget SDK must not spawn") } })
  const requests: LLM.StreamInput[] = []
  const result = yield* run(value.snapshot, { provider: provider(selected), llm: { estimateInput: native.estimateInput, stream: (input) => {
    requests.push(input)
    return input.agent.name === "continuity-review" ? native.stream(input) : response(candidate())
  } } }, value.host)
  expect(opened.calls).toBe(0)
  expect(requests).toHaveLength(1)
  expect(result).toMatchObject({ check: "C18", failure: "input-budget" })
}))

it.effect("abort deadline includes review and joins held review transport cleanup before returning", () => Effect.gen(function* () {
  const value = scenario()
  const entered = yield* Deferred.make<void>()
  const closing = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const requests: LLM.StreamInput[] = []
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  const audit = Stream.scoped(Stream.unwrap(Effect.gen(function* () {
    yield* Effect.addFinalizer(() => Deferred.succeed(closing, undefined).pipe(Effect.andThen(Deferred.await(release))))
    yield* Deferred.succeed(entered, undefined)
    return Stream.never
  })))
  const operation = yield* run(value.snapshot, { provider: provider(), llm: { stream: (input) => {
    requests.push(input)
    return input.agent.name === "continuity-review" ? audit : response(candidate())
  } } }, value.host).pipe(Effect.forkChild)
  yield* Deferred.await(entered)
  const deadline = yield* TestClock.adjust("601 seconds").pipe(Effect.forkChild)
  yield* Deferred.await(closing)
  yield* TestClock.adjust("30 seconds")
  expect(operation.pollUnsafe()).toBeUndefined()
  yield* Deferred.succeed(release, undefined)
  const result = yield* Fiber.join(operation)
  yield* Fiber.join(deadline)
  expect(requests).toHaveLength(2)
  expect(result.artifact).toBeUndefined()
  expect(result.failure).toBe("timeout")
}))
