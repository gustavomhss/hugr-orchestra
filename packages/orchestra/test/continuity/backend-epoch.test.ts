import { expect } from "bun:test"
import { Deferred, Effect, Exit, Fiber, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ProviderTest } from "../fake/provider"
import { it } from "../lib/effect"
import { FIRST, SECOND, applyFirst, begin, body, complete, entered, environment, held, seed } from "./service-fixture"
import type { LLM } from "@/session/llm"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { MessageID } from "@/session/schema"
import { Tool } from "@/tool/tool"
import { ContextCompactTool } from "@/tool/context-compact"
import { jsonSchema } from "ai"

const model = ProviderTest.model({ id: ModelV2.ID.make("claude-haiku-4-5-20251001"), providerID: ProviderV2.ID.make("anthropic"),
  limit: { context: 20_000, output: 2_000 } })

it.instance("changing backend joins the held API transport before admitting SDK work, and keeps each model/LLM pair immutable", () => Effect.gen(function* () {
  const old = yield* held(FIRST, { holdCleanup: true })
  const requests: LLM.StreamInput[] = []
  const stopped = yield* Deferred.make<void>()
  yield* Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    const sessionID = yield* seed()
    yield* entered(old)
    const llm: LLM.Interface = { stream: (request) => {
      requests.push(request)
      return Stream.make(LLMEvent.textDelta({ id: "memory", text: JSON.stringify(body(request, SECOND)) }), LLMEvent.finish({ reason: "stop" }))
    } }
    const change = yield* continuity.configure({ sessionID, model, llm }).pipe(Effect.andThen(Deferred.succeed(stopped, undefined)), Effect.forkChild)
    yield* Deferred.await(old.closing)
    expect(yield* Deferred.isDone(stopped)).toBe(false)
    expect(requests).toEqual([])
    yield* Deferred.succeed(old.cleanup, undefined)
    yield* Fiber.join(change)
    expect(yield* Deferred.isDone(old.closed)).toBe(true)
    yield* complete(yield* begin(sessionID, "SDK switch complete"), "SDK reply", 9_000)
    const jobs = yield* BackgroundJob.Service
    const job = (yield* jobs.list()).findLast((job) => job.metadata?.sessionId === sessionID)
    if (!job) throw new Error("No SDK maintenance job")
    expect((yield* jobs.wait({ id: job.id, timeout: 15_000 })).info?.output).toBe("applied")
    expect(requests).toHaveLength(1)
    expect(requests[0].model.id).toBe(model.id)
    expect(requests[0].model.limit.context).toBe(20_000)
    yield* continuity.configure({ sessionID, model: structuredClone(model), llm })
    expect(requests).toHaveLength(1)
  }).pipe(Effect.provide(environment([old])))
}), 120_000)

it.instance("cancel fences and joins a maintenance admission held before BackgroundJob registry insertion", () => Effect.gen(function* () {
  const admission = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const cancelled = yield* Deferred.make<void>()
  const plan = yield* held(FIRST)
  const captured: { sessionID?: SessionID } = {}
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  yield* Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    // Hold only the actual registry call. The real BackgroundJob implementation still creates and owns its worker.
    const seedFiber = yield* seed().pipe(Effect.forkChild)
    yield* Deferred.await(admission)
    const sessions = yield* Session.Service
    const jobs = yield* BackgroundJob.Service
    const chats = yield* jobs.list()
    expect(chats).toEqual([])
    // The admitted session is available through the seeded user's durable records.
    const sessionID = captured.sessionID
    if (!sessionID) throw new Error("Missing captured admission session")
    const stop = yield* continuity.cancel(sessionID).pipe(Effect.andThen(Deferred.succeed(cancelled, undefined)), Effect.forkChild)
    yield* Effect.sleep("10 millis")
    expect(yield* Deferred.isDone(cancelled)).toBe(false)
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(seedFiber)
    yield* Fiber.join(stop)
    expect(yield* Deferred.isDone(plan.entered)).toBe(false)
    expect((yield* sessions.messages({ sessionID })).length).toBeGreaterThan(0)
  }).pipe(Effect.provide(environment([plan], { background: (actual) => ({ ...actual,
    start: (input) => Effect.gen(function* () {
      captured.sessionID = typeof input.metadata?.sessionId === "string" ? SessionID.make(input.metadata.sessionId) : undefined
      yield* Deferred.succeed(admission, undefined)
      yield* Deferred.await(release)
      return yield* actual.start(input)
    }),
  }) })))
}), 120_000)

it.instance("release prevents a deferred follow-up from using default API and subsequent explicit work uses default transport before forget", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const second = yield* held(SECOND)
  let sdkCalls = 0
  yield* Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    const llm: LLM.Interface = { stream: () => { sdkCalls++; return Stream.fail(new Error("Unexpected SDK work after release")) } }
    yield* continuity.configure({ sessionID, model, llm })
    yield* continuity.release(sessionID)
    yield* complete(yield* begin(sessionID, "default work after release"), "default response", 50_000)
    yield* applyFirst(sessionID, second)
    expect(sdkCalls).toBe(0)
  }).pipe(Effect.provide(environment([first, second])))
}), 120_000)

it.instance("release fences a follow-up already queued behind SDK transport disposal", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const laterDefault = yield* held(SECOND)
  const closing = yield* Deferred.make<void>()
  const cleanup = yield* Deferred.make<void>()
  const released = yield* Deferred.make<void>()
  let sdkCalls = 0
  yield* Effect.addFinalizer(() => Deferred.succeed(cleanup, undefined))
  yield* Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    const llm: LLM.Interface = { stream: (request) => Stream.scoped(Stream.unwrap(Effect.gen(function* () {
      sdkCalls++
      yield* Effect.addFinalizer(() => Deferred.succeed(closing, undefined).pipe(Effect.andThen(Deferred.await(cleanup))))
      return Stream.make(LLMEvent.textDelta({ id: "memory", text: JSON.stringify(body(request, SECOND)) }), LLMEvent.finish({ reason: "stop" }))
    }))) }
    yield* continuity.configure({ sessionID, model, llm })
    yield* complete(yield* begin(sessionID, "first SDK boundary"), "SDK response", 9_000)
    yield* Deferred.await(closing)
    // This creates a pending safe boundary while the worker still owns its cleanup slot.
    yield* complete(yield* begin(sessionID, "deferred SDK follow-up"), "later response", 9_000)
    const release = yield* continuity.release(sessionID).pipe(Effect.andThen(Deferred.succeed(released, undefined)), Effect.forkChild)
    expect(yield* Deferred.isDone(released)).toBe(false)
    yield* Deferred.succeed(cleanup, undefined)
    yield* Fiber.join(release)
    yield* Effect.sleep("50 millis")
    expect(sdkCalls).toBe(1)
    expect(yield* Deferred.isDone(laterDefault.entered)).toBe(false)
    yield* complete(yield* begin(sessionID, "explicit default work"), "default response", 50_000)
    yield* applyFirst(sessionID, laterDefault)
  }).pipe(Effect.provide(environment([first, laterDefault])))
}), 120_000)

it.instance("configure race never pairs an old model with the new LLM and identical configuration leaves active work alone", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const enteredA = yield* Deferred.make<void>()
  const closingA = yield* Deferred.make<void>()
  const releaseA = yield* Deferred.make<void>()
  const cleanupA = yield* Deferred.make<void>()
  const changed = yield* Deferred.make<void>()
  const requestsA: LLM.StreamInput[] = []
  const requestsB: LLM.StreamInput[] = []
  yield* Effect.addFinalizer(() => Deferred.succeed(releaseA, undefined).pipe(Effect.andThen(Deferred.succeed(cleanupA, undefined))))
  yield* Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    const llmA: LLM.Interface = { stream: (request) => Stream.scoped(Stream.unwrap(Effect.gen(function* () {
      requestsA.push(request)
      yield* Effect.addFinalizer(() => Deferred.succeed(closingA, undefined).pipe(Effect.andThen(Deferred.await(cleanupA))))
      yield* Deferred.succeed(enteredA, undefined)
      yield* Deferred.await(releaseA)
      return Stream.make(LLMEvent.finish({ reason: "stop" }))
    }))) }
    const llmB: LLM.Interface = { stream: (request) => {
      requestsB.push(request)
      return Stream.make(LLMEvent.textDelta({ id: "memory", text: JSON.stringify(body(request, SECOND)) }), LLMEvent.finish({ reason: "stop" }))
    } }
    yield* continuity.configure({ sessionID, model, llm: llmA })
    yield* complete(yield* begin(sessionID, "held model A"), "A response", 9_000)
    yield* Deferred.await(enteredA)
    yield* continuity.configure({ sessionID, model: structuredClone(model), llm: llmA })
    expect(yield* Deferred.isDone(closingA)).toBe(false)
    const newer = { ...model, limit: { context: 30_000, output: 3_000 } }
    const switching = yield* continuity.configure({ sessionID, model: newer, llm: llmB }).pipe(Effect.andThen(Deferred.succeed(changed, undefined)), Effect.forkChild)
    yield* Deferred.await(closingA)
    expect(yield* Deferred.isDone(changed)).toBe(false)
    expect(requestsB).toEqual([])
    yield* Deferred.succeed(cleanupA, undefined)
    yield* Fiber.join(switching)
    yield* complete(yield* begin(sessionID, "new model B"), "B response", 12_000)
    const jobs = yield* BackgroundJob.Service
    const job = (yield* jobs.list()).findLast((job) => job.metadata?.sessionId === sessionID)
    if (!job) throw new Error("Missing B maintenance")
    expect((yield* jobs.wait({ id: job.id, timeout: 15_000 })).info?.output).toBe("applied")
    expect(requestsA[0].model.limit.context).toBe(20_000)
    expect(requestsB).toHaveLength(1)
    expect(requestsB[0].model.limit.context).toBe(30_000)
  }).pipe(Effect.provide(environment([first])))
}), 120_000)

it.instance("context_compact asks before its actual paid producer admission and denied permission leaves no job", () => Effect.gen(function* () {
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const jobs = yield* BackgroundJob.Service
    expect(yield* jobs.list()).toEqual([])
    const definition = yield* ContextCompactTool
    const tool = yield* Tool.init(definition)
    const asks: unknown[] = []
    const result = yield* tool.execute({}, { sessionID, messageID: MessageID.ascending(), agent: "build", abort: AbortSignal.any([]), messages: [],
      extra: { canRecall: true }, metadata: () => Effect.void, ask: (request) => Effect.sync(() => { asks.push(request) }).pipe(
        Effect.andThen(Effect.die(new Error("permission denied")))) }).pipe(Effect.exit)
    expect(Exit.isFailure(result)).toBe(true)
    expect(asks).toEqual([{ permission: "context_compact", patterns: [sessionID], always: [sessionID], metadata: {} }])
    expect(yield* jobs.list()).toEqual([])
  }).pipe(Effect.provide(environment([], { config: { continuity: { trigger: 0.65 } } })))
}), 120_000)

for (const transition of ["configure", "pause", "release", "forget"] as const) it.instance(`observe drops an actual pending asSchema JSON promise crossing ${transition}`, () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const enteredSchema = yield* Deferred.make<void>()
  const releaseSchema = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  yield* Effect.addFinalizer(() => Deferred.succeed(releaseSchema, undefined))
  yield* Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    const jobs = yield* BackgroundJob.Service
    const sessionID = yield* seed()
    const hit = yield* entered(first)
    yield* applyFirst(sessionID, first)
    const sessions = yield* Session.Service
    const history = yield* sessions.messages({ sessionID })
    const schema = jsonSchema(async () => {
      await Effect.runPromiseWith(context)(Deferred.succeed(enteredSchema, undefined))
      await Effect.runPromiseWith(context)(Deferred.await(releaseSchema))
      return { type: "object" as const, properties: {} }
    })
    const observer = yield* continuity.observe({ sessionID, messageIDs: history.map((message) => message.info.id), request: { ...hit.request,
      purpose: undefined, tools: { async_schema: { description: "large old API overhead ".repeat(50_000), inputSchema: schema } } } }).pipe(Effect.forkChild)
    yield* Deferred.await(enteredSchema)
    if (transition === "configure") yield* continuity.configure({ sessionID, model, llm: { stream: () => Stream.fail(new Error("stale overhead admitted SDK work")) } })
    if (transition === "pause") yield* continuity.pause(sessionID)
    if (transition === "release") yield* continuity.release(sessionID)
    if (transition === "forget") yield* continuity.forget(sessionID)
    yield* Deferred.succeed(releaseSchema, undefined)
    yield* Fiber.join(observer)
    yield* continuity.release(sessionID)
    const before = (yield* jobs.list()).length
    expect(yield* continuity.compact({ sessionID, canRecall: true })).toBe("fits")
    expect((yield* jobs.list()).length).toBe(before)
  }).pipe(Effect.provide(environment([first])))
}), 120_000)

for (const transition of ["configure", "release"] as const) it.instance(`${transition} publishes a transitioning sentinel before old worker disposal and rejects racing fresh starts`, () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const closing = yield* Deferred.make<void>()
  const cleanup = yield* Deferred.make<void>()
  const returned = yield* Deferred.make<void>()
  let oldCalls = 0
  let newCalls = 0
  yield* Effect.addFinalizer(() => Deferred.succeed(cleanup, undefined))
  yield* Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    const old: LLM.Interface = { stream: (request) => Stream.scoped(Stream.unwrap(Effect.gen(function* () {
      oldCalls++
      yield* Effect.addFinalizer(() => Deferred.succeed(closing, undefined).pipe(Effect.andThen(Deferred.await(cleanup))))
      return Stream.make(LLMEvent.textDelta({ id: "memory", text: JSON.stringify(body(request, SECOND)) }), LLMEvent.finish({ reason: "stop" }))
    }))) }
    const next: LLM.Interface = { stream: () => { newCalls++; return Stream.fail(new Error("no explicit new work was scheduled")) } }
    yield* continuity.configure({ sessionID, model, llm: old })
    yield* complete(yield* begin(sessionID, "held old revision"), "old response", 9_000)
    yield* Deferred.await(closing)
    const changing = yield* (transition === "configure" ? continuity.configure({ sessionID, model, llm: next }) : continuity.release(sessionID)).pipe(
      Effect.andThen(Deferred.succeed(returned, undefined)), Effect.forkChild)
    yield* Effect.sleep("10 millis")
    expect(yield* Deferred.isDone(returned)).toBe(false)
    yield* complete(yield* begin(sessionID, "racing fresh safe boundary"), "racing response", 12_000)
    yield* Deferred.succeed(cleanup, undefined)
    yield* Fiber.join(changing)
    yield* Effect.sleep("50 millis")
    expect(oldCalls).toBe(1)
    expect(newCalls).toBe(0)
    const sessions = yield* Session.Service
    expect((yield* sessions.messages({ sessionID })).length).toBeGreaterThan(0)
  }).pipe(Effect.provide(environment([first])))
}), 120_000)
