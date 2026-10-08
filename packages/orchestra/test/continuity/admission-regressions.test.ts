import { expect } from "bun:test"
import { Cause, Deferred, Effect, Fiber, Stream } from "effect"
import { jsonSchema } from "ai"
import { ContinuityAdmission } from "@/continuity/admission"
import { Archive } from "@/continuity/archive"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
import { LLM } from "@/session/llm"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderTest } from "../fake/provider"
import { awaitWithTimeout, it } from "../lib/effect"
import { messages } from "./memory-fixture"
import { FIRST, SECOND, applyFirst, begin, complete, entered, environment, held, seed, terminal } from "./service-fixture"

const selected = ProviderTest.model({ id: ModelV2.ID.make("admission-selected"), limit: { context: 200_000, output: 20_000 } })

it.instance("overlapping cancel joins held cleanup and preserves the configured backend for another actual producer", () => Effect.gen(function* () {
  const old = yield* held(FIRST, { holdCleanup: true })
  const next = yield* held(SECOND)
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const llm = yield* LLM.Service
    const sessionID = (yield* sessions.create({ title: "Overlapping cancellation" })).id
    yield* continuity.configure({ sessionID, model: selected, llm })
    yield* complete(yield* begin(sessionID, "FIRST_CALLER"), "FIRST_EVIDENCE " + "pad ".repeat(1000), 50_000)
    const hit = yield* entered(old)
    const first = yield* continuity.cancel(sessionID).pipe(Effect.forkChild({ startImmediately: true }))
    yield* awaitWithTimeout(Deferred.await(old.closing), "Cancel did not reach producer cleanup")
    const second = yield* continuity.cancel(sessionID).pipe(Effect.forkChild({ startImmediately: true }))
    expect(first.pollUnsafe()).toBeUndefined()
    expect(second.pollUnsafe()).toBeUndefined()
    yield* Deferred.succeed(old.cleanup, undefined)
    yield* awaitWithTimeout(Fiber.join(first), "First cancel did not finish")
    yield* awaitWithTimeout(Fiber.join(second), "Second cancel did not finish")
    expect(yield* Deferred.isDone(old.closed)).toBe(true)
    yield* terminal(hit.jobID, "cancelled")
    yield* complete(yield* begin(sessionID, "NEXT_CALLER"), "NEXT_EVIDENCE", 50_000)
    const later = yield* entered(next)
    expect(later.request.model.id).toBe(selected.id)
    yield* Deferred.succeed(next.release, undefined)
    yield* terminal(later.jobID, "completed", "applied")
    expect((yield* continuity.prepare({ sessionID, messages: yield* sessions.messages({ sessionID }) })).system[0]).toContain(SECOND)
  }).pipe(Effect.provide(environment([old, next], { node: LLM.node })))
}), 120_000)

for (const candidate of ["native", "admitted"] as const) for (const phase of ["prepare", "fits"] as const)
  for (const change of ["caller", "epoch", "generation", "none"] as const)
    it.live(`non-fresh ${candidate} admission checks ${change} after effectful ${phase}`, Effect.gen(function* () {
      const history = messages(["user", "assistant", "user"])
      const owner = { epoch: 1, generation: 2, ...(candidate === "admitted" ? { boundary: history[1].info.id, admitted: history[1].info.id } : {}) }
      const caller = { current: history[2] }
      const reached = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
      const pause = Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release)))
      const prepared = { messages: history, system: [] }
      const admit = ContinuityAdmission.create({ settle: () => Effect.void, candidate: () => Effect.sync(() => ({ ...owner })),
        current: () => Effect.sync(() => caller.current), history: () => Effect.succeed(history), latest: () => undefined,
        compact: () => Effect.die("Non-fresh admission must not compact"), commit: () => Effect.die("Non-fresh admission must not commit"),
        prepare: () => (phase === "prepare" ? pause : Effect.void).pipe(Effect.as(prepared)),
        fits: () => (phase === "fits" ? pause : Effect.void).pipe(Effect.as(true)) })
      const task = yield* admit({ sessionID: history[0].info.sessionID, messages: history, expectedUserID: history[2].info.id }).pipe(Effect.exit, Effect.forkChild)
      yield* awaitWithTimeout(Deferred.await(reached), "Admission never reached selected async boundary")
      if (change === "caller") caller.current = { ...history[2], info: { ...history[2].info, id: MessageID.ascending() } }
      if (change === "epoch") owner.epoch++
      if (change === "generation") owner.generation++
      yield* Deferred.succeed(release, undefined)
      const result = yield* Fiber.join(task)
      expect(result._tag).toBe(change === "none" ? "Success" : "Failure")
      if (result._tag === "Failure") expect(Cause.squash(result.cause)).toMatchObject({ reason: change === "caller" ? "complete-prefix-caller-stale" : "complete-prefix-admission-stale" })
      if (result._tag === "Success") expect(result.value).toEqual(prepared)
    }))

it.live("fresh admission rejects a caller arriving while commit is held", Effect.gen(function* () {
  const history = messages(["user", "assistant", "user"])
  const caller = { current: history[2] }
  const reached = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  const admit = ContinuityAdmission.create({ settle: () => Effect.void, candidate: () => Effect.succeed({ boundary: history[1].info.id, epoch: 0, generation: 0 }),
    current: () => Effect.sync(() => caller.current), history: () => Effect.succeed(history),
    latest: () => history[1].info.role === "assistant" ? history[1].info : undefined,
    compact: () => Effect.die("Current candidate must not compact"), fits: () => Effect.succeed(true),
    prepare: () => Effect.succeed({ messages: [history[2]], system: [FIRST], coverage: { version: 5, boundary: history[1].info.id, coveredThrough: history[1].info.id } }),
    commit: () => Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as(true)) })
  const task = yield* admit({ sessionID: history[0].info.sessionID, messages: history }).pipe(Effect.exit, Effect.forkChild)
  yield* awaitWithTimeout(Deferred.await(reached), "Fresh admission did not commit")
  caller.current = { ...history[2], info: { ...history[2].info, id: MessageID.ascending() } }
  yield* Deferred.succeed(release, undefined)
  const result = yield* Fiber.join(task)
  expect(result._tag).toBe("Failure")
  if (result._tag === "Failure") expect(Cause.squash(result.cause)).toMatchObject({ reason: "complete-prefix-caller-stale" })
}))

for (const phase of ["publish", "list"] as const) for (const change of ["invalidate", "advance", "none"] as const)
  it.instance(`producer-failure masks held in archive ${phase} respect ${change}`, () => Effect.gen(function* () {
    const plan = yield* held(FIRST, { output: Stream.fail(new Error("Producer failed before finish")) })
    const reached = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const calls = { publish: 0 }
    const receipt = Array.from({ length: 80 }, (_, index) => `OLD_OUTPUT_${index} ${"evidence ".repeat(100)}`).join("\n")
    yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
    yield* Effect.gen(function* () {
      const continuity = yield* SessionContinuity.Service
      const sessions = yield* Session.Service
      const archive = yield* Archive.Service
      const sessionID = yield* seed(undefined, undefined, receipt)
      const hit = yield* entered(plan)
      yield* Deferred.succeed(plan.release, undefined)
      yield* awaitWithTimeout(Deferred.await(reached), "Producer failure never reached mask fallback", "15 seconds")
      if (change === "invalidate") yield* continuity.invalidate(sessionID)
      if (change === "advance") yield* continuity.advance(sessionID)
      yield* Deferred.succeed(release, undefined)
      yield* terminal(hit.jobID, "completed")
      const history = yield* sessions.messages({ sessionID })
      const view = yield* continuity.prepare({ sessionID, messages: history, canRecall: true })
      const output = view.messages.flatMap((message) => message.parts).find((part) => part.type === "tool")
      if (!output || output.type !== "tool" || output.state.status !== "completed") throw new Error("Missing actual archived tool output")
      const durable = yield* archive.readMemory(sessionID)
      if (change === "none") {
        expect(output.state.output).toContain("[masked ")
        expect(durable?.masks).toHaveLength(1)
      }
      if (change !== "none") {
        expect(durable).toBeUndefined()
        expect(output.state.output).toBe(receipt)
      }
      const refs = yield* archive.list(sessionID)
      expect(refs.length).toBeGreaterThan(0)
      const sources = refs.filter((ref) => ref.first === output.messageID)
      expect(sources.length).toBeGreaterThan(0)
      const chunks = yield* Effect.forEach(sources, (ref) => archive.read({ sessionID, id: ref.id }))
      expect(chunks.map((chunk) => chunk?.markdown).join("\n")).toContain("OLD_OUTPUT_79")
    }).pipe(Effect.provide(environment([plan], { archive: (actual) => ({ ...actual,
      publish: (input) => Effect.gen(function* () {
        if (++calls.publish === 2 && phase === "publish") {
          yield* Deferred.succeed(reached, undefined)
          yield* Deferred.await(release)
        }
        return yield* actual.publish(input)
      }),
      list: (sessionID) => Effect.gen(function* () {
        if (phase === "list" && !(yield* Deferred.isDone(reached))) {
          yield* Deferred.succeed(reached, undefined)
          yield* Deferred.await(release)
        }
        return yield* actual.list(sessionID)
      }),
    }) })))
  }), 120_000)

it.instance("stale and partial prepare stay native without retiring healthy durable memory; full history restores it", () => Effect.gen(function* () {
  const plan = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    const sessions = yield* Session.Service
    const archive = yield* Archive.Service
    const sessionID = yield* seed()
    const original = yield* applyFirst(sessionID, plan)
    const history = yield* sessions.messages({ sessionID })
    const durable = yield* archive.readMemory(sessionID)
    expect(durable?.context?.artifact.version).toBe(5)
    const edited = structuredClone(history)
    const part = edited[0].parts[0]
    if (part.type !== "text") throw new Error("Expected covered text")
    part.text = "STALE_CALLER_PROJECTION"
    for (const partial of [history.slice(1), history.slice(0, -1), edited]) {
      const native = yield* continuity.prepare({ sessionID, messages: partial, canRecall: true })
      expect(native.system).toEqual([])
      expect(native.messages).toEqual(partial)
      expect(yield* archive.readMemory(sessionID)).toEqual(durable)
    }
    expect(yield* continuity.prepare({ sessionID, messages: history, canRecall: true })).toEqual(original)
  }).pipe(Effect.provide(environment([plan])))
}), 120_000)

it.instance("admission-selected model controls catch-up stream and render capacity instead of historical model", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const catchup = yield* held(SECOND)
  const small = { ...selected, id: ModelV2.ID.make("historical-small"), limit: { context: 2_000, output: 1_000 } }
  yield* Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    const sessions = yield* Session.Service
    const sessionID = yield* seed()
    const hit = yield* entered(first)
    yield* Deferred.succeed(first.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const current = yield* begin(sessionID, "DELTA_CALLER")
    const last = yield* complete(current, "COMPLETED_DELTA", 100)
    yield* sessions.updateMessage({ ...last, modelID: small.id })
    yield* sessions.updateMessage({ ...current, model: { ...current.model, modelID: small.id } })
    const admitting = yield* continuity.admit({ sessionID, messages: yield* sessions.messages({ sessionID }), model: selected, expectedUserID: current.id, canRecall: true }).pipe(Effect.forkChild)
    const next = yield* entered(catchup)
    expect(next.request.model).toEqual(selected)
    expect(next.request.user.model).toMatchObject({ modelID: selected.id, providerID: selected.providerID })
    yield* Deferred.succeed(catchup.release, undefined)
    const view = yield* Fiber.join(admitting)
    expect(view.system[0]).toContain(SECOND)
    expect(view.messages.map((message) => message.info.id)).toEqual([current.id])
    expect((yield* continuity.prepare({ sessionID, messages: yield* sessions.messages({ sessionID }), model: small })).system).toEqual([])
    expect((yield* continuity.prepare({ sessionID, messages: yield* sessions.messages({ sessionID }), model: selected })).system).toEqual(view.system)
  }).pipe(Effect.provide(environment([first, catchup], { getModel: (providerID, id) => Effect.succeed(
    ProviderTest.model({ providerID, id, ...(id === small.id ? { limit: small.limit } : {}) }),
  ) })))
}), 120_000)

for (const overhead of ["supplied", "system", "tool"] as const)
  it.instance(`configured backend hard-fit includes ${overhead} overhead after idempotent configure`, () => Effect.gen(function* () {
    const plan = yield* held(FIRST)
    yield* Effect.gen(function* () {
      const continuity = yield* SessionContinuity.Service
      const sessions = yield* Session.Service
      const jobs = yield* BackgroundJob.Service
      const llm = yield* LLM.Service
      const sessionID = yield* seed()
      const request = (yield* entered(plan)).request
      yield* applyFirst(sessionID, plan)
      const history = yield* sessions.messages({ sessionID })
      const model = { ...selected, limit: { context: 20_000, output: 2_000 } }
      yield* continuity.configure({ sessionID, model, llm })
      expect((yield* continuity.admit({ sessionID, messages: history, canRecall: true })).system[0]).toContain(FIRST)
      if (overhead === "supplied") {
        yield* continuity.release(sessionID)
        yield* continuity.configure({ sessionID, model, llm, overhead: 100_000 })
      }
      if (overhead !== "supplied") yield* continuity.observe({ sessionID, messageIDs: history.map((message) => message.info.id), request: {
        ...request, model, purpose: undefined, system: overhead === "system" ? ["SYSTEM_OVERHEAD ".repeat(20_000)] : [],
        tools: overhead === "tool" ? { large: { description: "TOOL_OVERHEAD ".repeat(20_000), inputSchema: jsonSchema({ type: "object" }) } } : {},
      } })
      yield* continuity.configure({ sessionID, model: structuredClone(model), llm })
      const result = yield* continuity.admit({ sessionID, messages: history, canRecall: true }).pipe(Effect.exit)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(Cause.squash(result.cause)).toMatchObject({ reason: "complete-prefix-hard-limit" })
      const count = (yield* jobs.list()).length
      expect(count).toBe(1)
      yield* continuity.configure({ sessionID, model, llm, overhead: 0 })
      expect((yield* continuity.admit({ sessionID, messages: history, canRecall: true })).system[0]).toContain(FIRST)
      expect((yield* jobs.list()).length).toBe(count)
    }).pipe(Effect.provide(environment([plan], { node: LLM.node })))
  }), 120_000)
