import { expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Scope, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LLMEvent } from "@orchestra/llm"
import type { LLM } from "@/session/llm"
import { completeSnapshot, run } from "@/continuity/fork"
import { validChecklist } from "@/continuity/checklist-seal"
import { PartID } from "@/session/schema"
import { it } from "../lib/effect"
import { host, messages, model, provider } from "./memory-fixture"

function scenario() {
  const history = messages(["user", "assistant", "user", "assistant"])
  const first = history[0].parts[0]
  const latest = history[2].parts[0]
  if (first.type !== "text" || latest.type !== "text") throw new Error("Expected user text")
  first.text = "Keep deployment read-only. Release code ORCHID-SELFCHECK-3C97."
  latest.text = "Report delivered and verified. Wait for my next request; do not rerun completed checks."
  history[1].parts.push({ id: PartID.make("prt_failed_check"), sessionID: history[1].info.sessionID,
    messageID: history[1].info.id, type: "tool", tool: "bash", callID: "failed-check",
    state: { status: "completed", input: { command: "verify-receipt" }, output: "exit 75: stale receipt",
      title: "Receipt", metadata: { exit: 75 }, time: { start: 1, end: 2 } } })
  const snapshot = completeSnapshot(history[0].info.sessionID, history)
  if (!snapshot) throw new Error("Expected complete snapshot")
  return { history, snapshot, host: host(history) }
}

const valueOp = (value = "ORCHID-SELFCHECK-3C97") => ({ op: "add", section: "values", src: ["u1"],
  fields: { name: "release code", value } })
const candidate = (ops: unknown[] = [valueOp()], next = "Wait for owner", src = ["a2"]) => JSON.stringify({
  now: { doing: "Report delivered", next, src }, ops,
})
const response = (text: string) => Stream.make(LLMEvent.textStart({ id: "text" }), LLMEvent.textDelta({ id: "text", text }),
  LLMEvent.textEnd({ id: "text" }), LLMEvent.finish({ reason: "stop" }))

function transport(replies: ReturnType<LLM.Interface["stream"]>[]) {
  const requests: LLM.StreamInput[] = []
  const llm: LLM.Interface = { stream: (input) => {
    requests.push(input)
    if (input.agent.name !== "continuity") throw new Error("Unexpected reviewer or fallback model request")
    const reply = replies[requests.length - 1]
    if (!reply) throw new Error("Producer exceeded the permitted stream count")
    return reply
  } }
  return { requests, llm }
}

it.effect("ordinary now/ops succeeds in one producer stream with a host checklist and no reviewer fallback", () => Effect.gen(function* () {
  const value = scenario()
  const sent = transport([response(candidate())])
  const result = yield* run(value.snapshot, { provider: provider(), llm: sent.llm }, value.host)
  expect(sent.requests).toHaveLength(1)
  expect(result).toMatchObject({ retried: false, dropped: 0 })
  expect(result.failure).toBeUndefined()
  if (result.artifact?.version !== 5) throw new Error("Missing v5 artifact")
  expect(result.artifact.review).toBeUndefined()
  expect(result.artifact.checklist).toEqual({ version: 1, critical: ["m1"], digest: expect.stringMatching(/^[a-f0-9]{64}$/) })
  expect(validChecklist(result.artifact)).toBe(true)
  expect(result.artifact.items[0].fields.value).toBe("ORCHID-SELFCHECK-3C97")
  const request = sent.requests[0]
  expect(request.model).toBe(model)
  expect(request.tools).toEqual({})
  expect(request.toolChoice).toBe("none")
  expect(request.purpose).toBe("context-maintenance")
  expect(request.parentSessionID).toBe(value.snapshot.sessionID)
  expect(request.agent.permission).toEqual([{ permission: "*", pattern: "*", action: "deny" }])
  expect(request.agent.prompt).toContain("within this same generation")
  expect(request.agent.prompt).toContain("Do not emit reasoning")
  expect(JSON.stringify(request.messages)).toContain("Executable retention checklist")
}))

for (const exact of [
  { section: "values", field: "value", good: "ORCHID-SELFCHECK-3C97", fields: { name: "release code" } },
  { section: "rules", field: "quote", good: "Keep deployment read-only.", fields: { kind: "must_not", rule: "No deployment" } },
  { section: "failures", field: "error", good: "exit 75: stale receipt", fields: { tried: "receipt", cause: "stale", lesson: "Verify receipt" } },
]) it.effect(`C17 ${exact.section}.${exact.field} permits exactly one corrective producer stream`, () => Effect.gen(function* () {
  const value = scenario()
  const payload = (text: string) => candidate([{ op: "add", section: exact.section, src: ["u1"], fields: { ...exact.fields, [exact.field]: text } }])
  const bad = payload("UNLOCATED_EXACT_BYTES")
  const sent = transport([response(bad), response(payload(exact.good))])
  const result = yield* run(value.snapshot, { provider: provider(), llm: sent.llm }, value.host)
  expect(sent.requests.map((request) => request.agent.name)).toEqual(["continuity", "continuity"])
  expect(sent.requests[1].messages.slice(0, -2)).toEqual(sent.requests[0].messages)
  expect(sent.requests[1].messages.at(-2)).toEqual({ role: "assistant", content: bad })
  expect(JSON.stringify(sent.requests[1].messages.at(-1))).toContain("HOST CHECK FAILED. C17:")
  expect(sent.requests[1].sessionID).toBe(sent.requests[0].sessionID)
  expect(result).toMatchObject({ retried: true, dropped: 0 })
  if (result.artifact?.version !== 5) throw new Error("Missing corrected v5 artifact")
  expect(result.artifact.items[0].fields[exact.field]).toBe(exact.good)
    expect(result.artifact.review).toBeUndefined()
    expect(result.artifact.checklist).toBeDefined()
    expect(validChecklist(result.artifact)).toBe(true)
}))

it.effect("repeated C17 failure exhausts two streams without publishing a candidate", () => Effect.gen(function* () {
  const value = scenario()
  const sent = transport([response(candidate([valueOp("FORGED")])), response(candidate([valueOp("STILL_FORGED")]))])
  const result = yield* run(value.snapshot, { provider: provider(), llm: sent.llm }, value.host)
  expect(sent.requests).toHaveLength(2)
  expect(result).toMatchObject({ check: "C17", failure: "invalid-schema", retried: true, ops: [] })
  expect(result.artifact).toBeUndefined()
}))

for (const bad of [
  { name: "tool call", events: [LLMEvent.toolCall({ id: "forbidden", name: "read", input: {} }), LLMEvent.finish({ reason: "stop" })] },
  { name: "provider refusal", events: [LLMEvent.finish({ reason: "content-filter" })] },
  { name: "provider error event", events: [LLMEvent.providerError({ message: "refusal" }), LLMEvent.finish({ reason: "stop" })] },
  { name: "missing terminal stop", events: [] },
]) it.effect(`${bad.name} after valid JSON fails C1 with at most two producer streams`, () => Effect.gen(function* () {
  const value = scenario()
  const reply = Stream.fromIterable([LLMEvent.textDelta({ id: "text", text: candidate() }), ...bad.events])
  const sent = transport([reply, reply])
  const result = yield* run(value.snapshot, { provider: provider(), llm: sent.llm }, value.host)
  expect(sent.requests).toHaveLength(2)
  expect(JSON.stringify(sent.requests[1].messages.at(-1))).toContain("HOST CHECK FAILED. C1:")
  expect(result).toMatchObject({ check: "C1", failure: "invalid-schema", retried: true })
  expect(result.artifact).toBeUndefined()
}))

it.effect("provider stream failure returns without a reviewer or transport retry", () => Effect.gen(function* () {
  const value = scenario()
  const sent = transport([Stream.fail(new Error("provider unavailable"))])
  const result = yield* run(value.snapshot, { provider: provider(), llm: sent.llm }, value.host)
  expect(sent.requests).toHaveLength(1)
  expect(result).toMatchObject({ failure: "provider", retried: false })
  expect(result.artifact).toBeUndefined()
}))

it.effect("empty no-op candidate still requires an exact completed boundary alias", () => Effect.gen(function* () {
  const value = scenario()
  const sent = transport([response(candidate([], "Wait", ["u2", "a1"])), response(candidate([]))])
  const result = yield* run(value.snapshot, { provider: provider(), llm: sent.llm }, value.host)
  expect(sent.requests).toHaveLength(2)
  expect(JSON.stringify(sent.requests[1].messages.at(-1))).toContain("HOST CHECK FAILED. C15:")
  expect(result.retried).toBe(true)
  if (result.artifact?.version !== 5) throw new Error("Missing empty v5 artifact")
  expect(result.artifact.items).toEqual([])
  expect(result.artifact.now.src).toEqual(["a2"])
  expect(result.artifact.checklist?.critical).toEqual([])
}))

it.effect("semantic limitation: structurally valid stale prose is accepted, not independently judged safe", () => Effect.gen(function* () {
  const value = scenario()
  expect(JSON.stringify(value.history)).toContain("do not rerun completed checks")
  const sent = transport([response(candidate(undefined, "Rerun completed checks"))])
  const result = yield* run(value.snapshot, { provider: provider(), llm: sent.llm }, value.host)
  expect(sent.requests).toHaveLength(1)
  if (result.artifact?.version !== 5) throw new Error("Expected structural acceptance, not semantic approval")
  expect(result.artifact.now.next).toBe("Rerun completed checks")
  expect(result.artifact.checklist).toBeDefined()
  expect(validChecklist(result.artifact)).toBe(true)
  expect(result.artifact.review).toBeUndefined()
}))

for (const action of ["complete", "interrupt", "scope-close", "deadline"] as const)
  it.effect(`${action} joins held producer cleanup before returning or publishing`, () => Effect.gen(function* () {
    const value = scenario()
    const entered = yield* Deferred.make<void>()
    const finish = yield* Deferred.make<void>()
    const closing = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const scope = yield* Scope.make()
    const events: string[] = []
    yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void))
    yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
    const reply = Stream.scoped(Stream.unwrap(Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.gen(function* () {
        events.push("closing")
        yield* Deferred.succeed(closing, undefined)
        yield* Deferred.await(release)
        events.push("closed")
      }))
      yield* Deferred.succeed(entered, undefined)
      yield* Deferred.await(finish)
      return response(candidate())
    })))
    const sent = transport([reply])
    const operation = yield* run(value.snapshot, { provider: provider(), llm: sent.llm }, value.host).pipe(
      Effect.tap(() => Effect.sync(() => events.push("returned"))), Effect.forkIn(scope))
    yield* Deferred.await(entered)
    if (action === "complete") yield* Deferred.succeed(finish, undefined)
    const trigger = action === "interrupt" ? yield* Fiber.interrupt(operation).pipe(Effect.forkChild)
      : action === "scope-close" ? yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild)
      : action === "deadline" ? yield* TestClock.adjust("600 seconds").pipe(Effect.forkChild) : undefined
    yield* Deferred.await(closing)
    expect(operation.pollUnsafe()).toBeUndefined()
    expect(events).toEqual(["closing"])
    yield* Deferred.succeed(release, undefined)
    const result = yield* Fiber.await(operation)
    if (trigger) yield* Fiber.join(trigger)
    expect(sent.requests).toHaveLength(1)
    expect(events).toEqual(action === "interrupt" || action === "scope-close" ? ["closing", "closed"] : ["closing", "closed", "returned"])
    if (action === "interrupt" || action === "scope-close") {
      expect(result._tag).toBe("Failure")
      if (result._tag !== "Failure") throw new Error("Expected interruption")
      expect(Cause.hasInterruptsOnly(result.cause)).toBe(true)
      return
    }
    if (result._tag !== "Success") throw new Error("Expected returned pass")
    if (action === "complete") expect(result.value.artifact?.version).toBe(5)
    if (action === "deadline") {
      expect(result.value.failure).toBe("timeout")
      expect(result.value.artifact).toBeUndefined()
    }
  }))

it.effect("one 600-second deadline covers both producer attempts, not 600 seconds per attempt", () => Effect.gen(function* () {
  const value = scenario()
  const first = yield* Deferred.make<void>()
  const second = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const closed: string[] = []
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  const sent = transport([
    Stream.scoped(Stream.unwrap(Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.sync(() => { closed.push("first") }))
      yield* Deferred.succeed(first, undefined)
      yield* Deferred.await(release)
      return response(candidate([valueOp("FORGED")]))
    }))),
    Stream.scoped(Stream.unwrap(Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.sync(() => { closed.push("second") }))
      yield* Deferred.succeed(second, undefined)
      return Stream.never
    }))),
  ])
  const operation = yield* run(value.snapshot, { provider: provider(), llm: sent.llm }, value.host).pipe(Effect.forkChild)
  yield* Deferred.await(first)
  yield* TestClock.adjust("400 seconds")
  yield* Deferred.succeed(release, undefined)
  yield* Deferred.await(second)
  expect(closed).toEqual(["first"])
  yield* TestClock.adjust("199 seconds")
  expect(operation.pollUnsafe()).toBeUndefined()
  yield* TestClock.adjust("1 second")
  const result = yield* Fiber.join(operation)
  expect(sent.requests).toHaveLength(2)
  expect(closed).toEqual(["first", "second"])
  expect(result.failure).toBe("timeout")
  expect(result.artifact).toBeUndefined()
}))
