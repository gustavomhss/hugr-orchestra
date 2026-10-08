import { expect, test } from "bun:test"
import { Cause, Deferred, Effect, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Session } from "@/session/session"
import { SessionContinuity } from "@/continuity/service"
import { Archive } from "@/continuity/archive"
import { MessageID, PartID } from "@/session/schema"
import { completeSnapshot, run } from "@/continuity/fork"
import { decode } from "@/continuity/memory"
import { readStored, writeStored } from "@/continuity/archive-format"
import { create } from "@/continuity/context"
import { fragments, packet, environment, held, entered, terminal, begin, complete, recall, FIRST, SECOND } from "./service-fixture"
import { it } from "../lib/effect"
import { ProviderTest } from "../fake/provider"
import { LLMEvent } from "@opencode-ai/llm"
import { ModelV2 } from "@opencode-ai/core/model"
import { messages, artifact, host, producerID, provider, model } from "./memory-fixture"

const FACT = "LAST_STEP_FACT_46_8A91"
const ERROR = "exit 75: final-step cache receipt 46F0"
const NEXT = "Verify the final-step cache receipt before publishing."

it.instance("one-user 46-step production complete pass archives all aliases and removes every covered assistant/tool/binary/stub", () => Effect.gen(function* () {
  const plan = yield* held(FACT, { respond: (request) => {
    const entries = fragments(packet(request))
    const final = entries.find((entry) => entry.text.includes(FACT))
    if (!final) throw new Error("The actual complete source omitted final-step evidence")
    return JSON.stringify({ now: { doing: "Final-step cache receipt failed verification.", next: NEXT, src: [final.id] }, ops: [
      { op: "add", section: "findings", src: [final.id], fields: { finding: FACT, why: "Latest completed observation.", status: "confirmed" } },
      { op: "add", section: "failures", src: [final.id], fields: { tried: "final receipt check", error: ERROR, cause: "cache receipt mismatch", lesson: "When the receipt fails, verify it before publishing." } },
    ] })
  } })
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const archive = yield* Archive.Service
    const chat = yield* sessions.create({ title: "Complete-prefix long turn" })
    const user = yield* begin(chat.id, "Restore cache consistency. " + "OLD_USER_NOISE ".repeat(9000))
    for (let step = 0; step < 46; step++) {
      const assistant: SessionV1.Assistant = { id: MessageID.ascending(), sessionID: chat.id, parentID: user.id, role: "assistant", agent: "build", mode: "build",
        path: { cwd: "/fixture", root: "/fixture" }, modelID: user.model.modelID, providerID: user.model.providerID, cost: 0,
        tokens: { input: step === 45 ? 50_000 : 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        finish: "tool-calls", time: { created: user.time.created + step + 1, completed: user.time.created + step + 2 } }
      yield* sessions.updateMessage(assistant)
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id, type: "tool", tool: "bash", callID: `call-${step}`,
        state: { status: "completed", input: { command: `recorded-check-${step} --old-command-noise` }, output: step === 45 ? `${FACT}\n${ERROR}\n${NEXT}` : "OLD_TOOL_NOISE ".repeat(150),
          title: "check", metadata: { exit: step === 45 ? 75 : 0 }, time: { start: 1, end: 2 }, attachments: [{ id: PartID.ascending(), sessionID: chat.id,
            messageID: assistant.id, type: "file", mime: "image/png", url: "data:image/png;base64," + "BINARY_NOISE".repeat(2000) }] } })
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id, type: "reasoning", text: "PRIVATE_REASONING", time: { start: 1, end: 2 } })
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id, type: "patch", hash: "large-patch", files: ["state.txt"] })
      yield* continuity.start({ sessionID: chat.id, message: assistant, canRecall: true })
    }
    const hit = yield* entered(plan)
    expect(packet(hit.request)).toContain(FACT)
    expect(packet(hit.request)).toContain(ERROR)
    expect(packet(hit.request)).not.toContain("PRIVATE_REASONING")
    expect(packet(hit.request)).not.toContain("BINARY_NOISE")
    yield* Deferred.succeed(plan.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const history = yield* sessions.messages({ sessionID: chat.id })
    const stored = yield* archive.readMemory(chat.id)
    expect(stored?.context?.artifact.version).toBe(5)
    expect(stored?.context?.artifact.coveredThrough).toBe(history.at(-1)?.info.id)
    expect(stored?.context?.artifact).not.toHaveProperty("tailStart")
    const pending = yield* begin(chat.id, "CURRENT_PENDING_ASK")
    const view = yield* continuity.admit({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true })
    expect(view.messages.map((message) => message.info.id)).toEqual([pending.id])
    expect(view.coverage?.coveredThrough).toBe(history.at(-1)?.info.id)
    expect(view.system[0]).toContain(FACT)
    expect(view.system[0]).toContain(ERROR)
    expect(view.system[0]).toContain(NEXT)
    for (const noise of ["OLD_USER_NOISE", "OLD_TOOL_NOISE", "old-command-noise", "BINARY_NOISE", "PRIVATE_REASONING", "masked tool result", "User messages (verbatim)"])
      expect(view.system[0]).not.toContain(noise)
    expect((yield* recall(chat.id, { reference: "t46", limit: 8000 })).content).toContain(ERROR)
    expect((yield* archive.list(chat.id)).some((reference) => reference.first === history.at(-1)?.info.id)).toBe(true)
    expect(readStored(writeStored(chat.id, stored!), chat.id).context?.artifact.version).toBe(5)
  }).pipe(Effect.provide(environment([plan])))
}), 180_000)

it.instance("pure prepare never pays; first candidate admission catches completed delta once and later ordinary steps remain native", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const catchup = yield* held(SECOND)
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const chat = yield* sessions.create({ title: "Admission catchup" })
    const user = yield* begin(chat.id, "restore cache")
    yield* complete(user, "FIRST_COMPLETED_BOUNDARY " + "pad ".repeat(1000), 50_000)
    const hit = yield* entered(first)
    yield* complete(user, "NEW_COMPLETED_DELTA " + "pad ".repeat(1000), 100)
    expect((yield* continuity.prepare({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true })).system).toEqual([])
    expect(yield* Deferred.isDone(catchup.entered)).toBe(false)
    yield* Deferred.succeed(first.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const queued = yield* begin(chat.id, "QUEUED_RAW_REQUEST")
    const context = yield* Effect.context<never>()
    const admission = Effect.runPromiseWith(context)(continuity.admit({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true }))
    const next = yield* entered(catchup)
    expect(packet(next.request)).toContain("NEW_COMPLETED_DELTA")
    yield* Deferred.succeed(catchup.release, undefined)
    const sealed = yield* Effect.promise(() => admission)
    expect(sealed.messages.map((message) => message.info.id)).toEqual([queued.id])
    expect(sealed.system[0]).toContain(SECOND)
    const boundary = sealed.coverage?.boundary
    const later = yield* complete(queued, "NORMAL_LATER_STEP", 100)
    const second = yield* continuity.admit({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true })
    expect(second.coverage?.boundary).toBe(boundary)
    expect(second.messages.some((message) => message.info.id === later.id)).toBe(true)
  }).pipe(Effect.provide(environment([first, catchup])))
}), 180_000)

for (const change of ["new-user", "source-edit"] as const) it.instance(`first candidate admission rejects ${change} during its asynchronous hard-fit check`, () => Effect.gen(function* () {
  const plan = yield* held(FIRST)
  const reached = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const gate = { armed: false, calls: 0 }
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const sessionID = yield* sessions.create({ title: "Admission generation race" }).pipe(Effect.map((session) => session.id))
    const user = yield* begin(sessionID, "FIRST_REAL_REQUEST")
    yield* complete(user, "FIRST_COMPLETED_EVIDENCE", 50_000)
    const hit = yield* entered(plan)
    yield* Deferred.succeed(plan.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    gate.armed = true
    const admitting = yield* continuity.admit({ sessionID, messages: yield* sessions.messages({ sessionID }), canRecall: true }).pipe(Effect.exit, Effect.forkChild)
    yield* Deferred.await(reached)
    const queued = change === "new-user" ? yield* begin(sessionID, "NEW_USER_DURING_ADMISSION_FIT") : undefined
    const original = change === "source-edit" ? (yield* sessions.messages({ sessionID }))[0].parts[0] : undefined
    if (original) {
      if (original.type !== "text") throw new Error("Expected editable text")
      yield* sessions.updatePart({ ...original, text: "SOURCE_EDIT_DURING_FIT_WITHOUT_ADVANCE" })
    }
    yield* Deferred.succeed(release, undefined)
    const result = yield* Fiber.join(admitting)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(Cause.squash(result.cause)).toMatchObject({ reason: "complete-prefix-admission-stale" })
    gate.armed = false
    if (original) yield* sessions.updatePart(original)
    const view = yield* continuity.admit({ sessionID, messages: yield* sessions.messages({ sessionID }), canRecall: true })
    expect(view.messages.map((message) => message.info.id)).toEqual([queued?.id ?? user.id])
    expect(view.system[0]).toContain(FIRST)
  }).pipe(Effect.provide(environment([plan], { getModel: (providerID, id) => Effect.gen(function* () {
    if (gate.armed && ++gate.calls === 2) {
      yield* Deferred.succeed(reached, undefined)
      yield* Deferred.await(release)
    }
    return ProviderTest.model({ providerID, id })
  }) })))
}), 180_000)

it.instance("admission uses the current user's smaller model bound without retiring durable prior memory", () => Effect.gen(function* () {
  const plan = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const sessionID = yield* sessions.create({ title: "Current model admission" }).pipe(Effect.map((session) => session.id))
    yield* complete(yield* begin(sessionID, "INITIAL_LARGE_MODEL"), "VERIFIED_LARGE_MODEL_EVIDENCE", 50_000)
    const hit = yield* entered(plan)
    yield* Deferred.succeed(plan.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const original = yield* continuity.admit({ sessionID, messages: yield* sessions.messages({ sessionID }), canRecall: true })
    const user = yield* begin(sessionID, "SMALL_QUERY ".repeat(6000))
    yield* sessions.updateMessage({ ...user, model: { ...user.model, modelID: ModelV2.ID.make("small") } })
    const result = yield* continuity.admit({ sessionID, messages: yield* sessions.messages({ sessionID }), canRecall: true }).pipe(Effect.exit)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(Cause.squash(result.cause)).toMatchObject({ reason: "complete-prefix-hard-limit" })
    yield* sessions.updateMessage(user)
    const restored = yield* continuity.admit({ sessionID, messages: yield* sessions.messages({ sessionID }), canRecall: true })
    expect(restored.system).toEqual(original.system)
    expect(restored.coverage?.coveredThrough).toBe(original.coverage?.coveredThrough)
    expect(restored.messages.map((message) => message.info.id)).toEqual([user.id])
  }).pipe(Effect.provide(environment([plan], { getModel: (providerID, id) => Effect.succeed(ProviderTest.model({ providerID, id,
    ...(id === "small" ? { limit: { context: 20_000, output: 2_000 } } : {}) })) })))
}), 180_000)

test("v4 cold migration retains partial invariants; v5 validates exact prefix/Now and cold projection invalidates edited coverage", () => {
  const old = artifact()
  const restored = readStored(writeStored(old.parentID, { context: { sessionID: old.parentID, boundary: old.boundary,
    tailStart: old.tailStart, text: old.text, artifact: old }, masks: [] }), old.parentID)
  expect(restored.context?.artifact.version).toBe(4)
  expect(restored.context?.artifact.coveredThrough).not.toBe(restored.context?.artifact.boundary)
  const history = messages()
  const snapshot = completeSnapshot(history[0].info.sessionID, history, old, true)
  if (!snapshot) throw new Error("No complete migration snapshot")
  const missing = decode({ text: JSON.stringify({ ops: [] }), snapshot, producerID, host: host(history), budget: model.limit.context })
  expect("check" in missing && missing.check).toBe("C15")
  const invalid = decode({ text: JSON.stringify({ now: { doing: "CURRENT", next: "NEXT", src: ["a99999"] }, ops: [] }), snapshot,
    producerID, host: host(history), budget: model.limit.context })
  expect("check" in invalid && invalid.check).toBe("C15")
  const decoded = decode({ text: JSON.stringify({ now: { doing: "Current verified state", next: "Verify the next step", src: ["a8"] }, ops: [] }),
    snapshot, producerID, host: host(history), budget: model.limit.context })
  if (!("artifact" in decoded)) throw new Error(JSON.stringify(decoded))
  expect(decoded.artifact.version).toBe(5)
  expect(decoded.artifact.coveredThrough).toBe(snapshot.boundary)
  const contexts = create()
  const cold = readStored(writeStored(old.parentID, { context: { sessionID: old.parentID, boundary: snapshot.boundary, text: decoded.artifact.text,
    artifact: decoded.artifact }, masks: [] }), old.parentID)
  if (!cold.context) throw new Error("No cold v5 artifact")
  const corrupted = writeStored(old.parentID, { context: { ...cold.context, tailStart: old.tailStart }, masks: [] })
  expect(() => readStored(corrupted, old.parentID)).toThrow("archive-corrupt-memory")
  contexts.set(cold.context)
  const view = contexts.prepare(old.parentID, history)
  const actual = history[14]
  expect(view.messages.map((message) => message.info.id)).toEqual([actual.info.id])
  expect(view.messages[0].parts).toEqual(actual.parts)
  const continuation = { info: { ...history[0].info, id: MessageID.make("msg_synthetic_continue"), time: { created: 999 } },
    parts: [{ id: PartID.ascending(), sessionID: old.parentID, messageID: MessageID.make("msg_synthetic_continue"), type: "text" as const, text: "continue", synthetic: true }] }
  const continued = contexts.prepare(old.parentID, [...history, continuation], actual)
  expect(continued.coverage?.currentUserID).toBe(actual.info.id)
  expect(continued.messages.map((message) => message.info.id)).toEqual([actual.info.id, continuation.info.id])
  expect(continued.messages[0].parts).toEqual(actual.parts)
  expect(view.coverage?.coveredThrough).toBe(snapshot.boundary)
  const edited = structuredClone(history)
  if (edited[1].parts[0].type === "text") edited[1].parts[0].text = "changed covered history"
  expect(contexts.prepare(old.parentID, edited).system).toEqual([])
})

test("queued user before a late earlier-turn assistant and pending tools remain outside complete prefix", () => {
  const history = messages(["user", "assistant", "user", "assistant"])
  const queued = history[2]
  const late = history[3].info
  if (late.role !== "assistant") throw new Error("Expected assistant")
  late.parentID = history[0].info.id
  const captured = completeSnapshot(history[0].info.sessionID, history)
  expect(captured?.covered?.map((message) => message.info.id)).toEqual(history.slice(0, 2).map((message) => message.info.id))
  expect(captured?.covered?.some((message) => message.info.id === queued.info.id)).toBe(false)
  expect(completeSnapshot(history[0].info.sessionID, history, undefined, true, late.id)).toBeUndefined()
  for (const status of ["pending", "running"] as const) {
    const active = structuredClone(history.slice(0, 2))
    active[1].parts.push({ id: PartID.ascending(), sessionID: active[1].info.sessionID, messageID: active[1].info.id, type: "tool", tool: "bash", callID: status,
      state: status === "pending" ? { status, input: {}, raw: "{}" } : { status, input: {}, time: { start: 1 } } })
    expect(completeSnapshot(active[0].info.sessionID, active)).toBeUndefined()
  }
})

it.live("whole input budget failure names unmet span and leaves prior v5 intact instead of silently cutting to 32k", Effect.gen(function* () {
  const history = messages(["user", "assistant"])
  if (history[0].parts[0].type === "text") history[0].parts[0].text = "ENTIRE_SPAN ".repeat(30_000)
  const captured = completeSnapshot(history[0].info.sessionID, history)
  if (!captured) throw new Error("No complete snapshot")
  expect(captured.covered).toHaveLength(2)
  expect(captured.head).toHaveLength(2)
  let called = false
  const selected = ProviderTest.model({ ...model, limit: { context: 20_000, output: 2_000 } })
  const result = yield* run(captured, { provider: provider(selected), llm: { stream: () => { called = true; return Stream.empty } } }, host(history))
  expect(result.failure).toBe("input-budget")
  expect(result.artifact).toBeUndefined()
  expect(called).toBe(false)
}))

it.effect("600-second full producer deadline joins transport cleanup and classifies timeout without an artifact", Effect.gen(function* () {
  const history = messages(["user", "assistant"])
  const captured = completeSnapshot(history[0].info.sessionID, history)
  if (!captured) throw new Error("No snapshot")
  const entered = yield* Deferred.make<void>()
  const closing = yield* Deferred.make<void>()
  const cleanup = yield* Deferred.make<void>()
  const returned = yield* Deferred.make<void>()
  const task = yield* run(captured, { provider: provider(), llm: { stream: () => Stream.scoped(Stream.unwrap(Effect.gen(function* () {
    yield* Effect.addFinalizer(() => Deferred.succeed(closing, undefined).pipe(Effect.andThen(Deferred.await(cleanup))))
    yield* Deferred.succeed(entered, undefined)
    return Stream.fromEffect(Effect.never)
  }))) } }, host(history)).pipe(Effect.tap(() => Deferred.succeed(returned, undefined)), Effect.forkChild)
  yield* Deferred.await(entered)
  const deadline = yield* TestClock.adjust("600 seconds").pipe(Effect.forkChild)
  yield* Deferred.await(closing)
  expect(yield* Deferred.isDone(returned)).toBe(false)
  yield* Deferred.succeed(cleanup, undefined)
  yield* Fiber.join(deadline)
  const result = yield* Fiber.join(task)
  expect(result.failure).toBe("timeout")
  expect(result.artifact).toBeUndefined()
}))

it.effect("schema retry shares the original 600-second deadline instead of receiving a new deadline", Effect.gen(function* () {
  const history = messages(["user", "assistant"])
  const captured = completeSnapshot(history[0].info.sessionID, history)
  if (!captured) throw new Error("No snapshot")
  const first = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const retry = yield* Deferred.make<void>()
  const requests: unknown[] = []
  const task = yield* run(captured, { provider: provider(), llm: { stream: (request) => {
    requests.push(request)
    return requests.length === 1 ? Stream.unwrap(Deferred.succeed(first, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as(Stream.make(
      LLMEvent.textDelta({ id: "invalid", text: "{\"ops\":[]}" }), LLMEvent.finish({ reason: "stop" }))))) :
      Stream.fromEffect(Deferred.succeed(retry, undefined).pipe(Effect.andThen(Effect.never)))
  } } }, host(history)).pipe(Effect.forkChild)
  yield* Deferred.await(first)
  yield* TestClock.adjust("590 seconds")
  yield* Deferred.succeed(release, undefined)
  yield* Deferred.await(retry)
  yield* TestClock.adjust("9 seconds")
  expect(task.pollUnsafe()).toBeUndefined()
  yield* TestClock.adjust("1 second")
  const result = yield* Fiber.join(task)
  expect(requests).toHaveLength(2)
  expect(result.failure).toBe("timeout")
  expect(result.artifact).toBeUndefined()
}))
