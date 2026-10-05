import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { Deferred, Effect, Fiber, Scheduler, Stream } from "effect"
import { ModelV2 } from "@opencode-ai/core/model"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { LLMEvent } from "@opencode-ai/llm"
import { Archive } from "@/continuity/archive"
import { run } from "@/continuity/fork"
import { Transcript } from "@/continuity/transcript"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
import { Provider } from "@/provider/provider"
import { InstanceStore } from "@/project/instance-store"
import type { LLM } from "@/session/llm"
import { PartID, type SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { Token } from "@/util/token"
import { ProviderTest } from "../fake/provider"
import { TestInstance } from "../fixture/fixture"
import { awaitWithTimeout, it, pollWithTimeout } from "../lib/effect"
import { captured, provider } from "./memory-fixture"
import { FIRST, SECOND, applyFirst, begin, complete, entered, environment, fragments, held, jobFor, packet, prepare, seed, terminal } from "./service-fixture"

function payload(markdown: string) {
  const fence = /\n(`{3,})markdown\n/.exec(markdown)
  if (!fence) throw new Error("Archive Markdown has no payload frame")
  const end = markdown.lastIndexOf(`\n${fence[1]}\n`)
  if (end <= fence.index) throw new Error("Archive Markdown has no closing frame")
  return markdown.slice(fence.index + fence[0].length, end)
}

function inventory(sessionID: SessionID, history: SessionV1.WithParts[]) {
  return Effect.gen(function* () {
    const archive = yield* Archive.Service
    const refs = yield* archive.list(sessionID)
    expect(new Set(refs.map((ref) => ref.first))).toEqual(new Set(history.map((message) => message.info.id)))
    for (const source of history) {
      const pieces = yield* Effect.forEach(refs.filter((ref) => ref.first === source.info.id), (ref) => archive.read({ sessionID, id: ref.id }))
      expect(pieces.length).toBeGreaterThan(0)
      const text = pieces.map((piece) => {
        if (!piece) throw new Error("Inventoried archive fragment is unavailable")
        expect(piece.last).toBe(source.info.id)
        expect(createHash("sha256").update(piece.markdown).digest("hex")).toBe(piece.id)
        return payload(piece.markdown)
      }).join("")
      for (const part of source.parts) {
        if (part.type === "text") expect(text).toContain(part.text)
        if (part.type === "tool" && part.state.status === "completed") {
          expect(text).toContain(part.state.output)
          expect(text).toContain("Exit: 75")
          expect(text).toContain("Truncated: true")
        }
        if (part.type === "tool" && part.state.status === "error") expect(text).toContain(part.state.error)
      }
    }
    return refs
  })
}

it.instance("G1 every durable source, including pre-compaction history and native tail, is archived before pruning and after append", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const second = yield* held(SECOND)
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const archive = yield* Archive.Service
    const chat = yield* sessions.create({ title: "Complete archive inventory" })
    for (let i = 0; i < 3; i++) {
      const user = yield* begin(chat.id, `OLD_USER_${i}\r\n${i === 0 ? "u😀\r\n".repeat(23000) : "old observation"}`)
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: user.id, type: "text", text: `MULTIPART_${i}` })
      const assistant = yield* complete(user, `OLD_ASSISTANT_${i}`)
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id, type: "tool", tool: "bash", callID: `receipt-${i}`,
        state: { status: "completed", input: { command: "check --read-only" }, output: `FAILED_CAPTURE_${i} 😀\r\n`, title: "Failed check",
          metadata: { exit: 75, truncated: true }, time: { start: 1, end: 2 } } })
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id, type: "tool", tool: "read", callID: `error-${i}`,
        state: { status: "error", input: { path: "missing" }, error: `ERROR_CAPTURE_${i}`, time: { start: 2, end: 3 } } })
    }
    const compact = yield* begin(chat.id, "NATIVE_COMPACTION")
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: compact.id, type: "compaction", auto: true })
    const summary = yield* complete(compact, "NATIVE_SUMMARY: keep local read-only constraint.")
    yield* sessions.updateMessage({ ...summary, summary: true })
    for (let i = 0; i < 5; i++) yield* complete(yield* begin(chat.id, `ACTIVE_USER_${i}`), `ACTIVE_ASSISTANT_${i}`, i === 4 ? 50_000 : 100)
    const hit = yield* entered(first)
    expect(packet(hit.request)).toContain("NATIVE_SUMMARY")
    expect(packet(hit.request)).not.toContain("OLD_USER_")
    const original = yield* sessions.messages({ sessionID: chat.id })
    const refs = yield* inventory(chat.id, original)
    expect(refs.filter((ref) => ref.first === original[0].info.id).length).toBeGreaterThan(2)
    const retained = yield* archive.read({ sessionID: chat.id, id: refs[0].id })
    yield* applyFirst(chat.id, first)
    yield* complete(yield* begin(chat.id, "APPENDED_USER"), "APPENDED_ASSISTANT", 50_000)
    const appended = yield* entered(second)
    yield* inventory(chat.id, yield* sessions.messages({ sessionID: chat.id }))
    expect(yield* archive.read({ sessionID: chat.id, id: refs[0].id })).toEqual(retained)
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(appended.jobID, "completed", "applied")
  }).pipe(Effect.provide(environment([first, second])))
}), 60_000)

it.effect("G1 missing middle continuation with valid hashes and every message represented declines before LLM streaming", () => Effect.gen(function* () {
  const source = captured()
  const part = source.head[0].parts[0]
  if (part.type !== "text") throw new Error("Expected text fixture")
  part.text = "source 😀\r\n".repeat(9000)
  const archived = Transcript.chunks(source.sessionID, source.head)
  const split = archived.filter((chunk) => chunk.first === source.head[0].info.id)
  expect(split.length).toBeGreaterThan(2)
  const incomplete = archived.filter((chunk) => chunk.id !== split[1].id)
  expect(new Set(incomplete.map((chunk) => chunk.first))).toEqual(new Set(source.head.map((message) => message.info.id)))
  for (const chunk of incomplete) expect(createHash("sha256").update(chunk.markdown).digest("hex")).toBe(chunk.id)
  const calls: LLM.StreamInput[] = []
  const services = { provider: provider(), llm: { stream: (request: LLM.StreamInput) => {
    calls.push(request)
    return Stream.make(LLMEvent.textDelta({ id: "memory", text: JSON.stringify({ memory: FIRST, references: [] }) }), LLMEvent.finish({ reason: "stop" }))
  } } }
  expect(yield* run(source, services, archived, archived)).toBeDefined()
  expect(calls).toHaveLength(1)
  calls.length = 0
  expect(yield* run(source, services, incomplete, archived)).toBeUndefined()
  expect(calls).toEqual([])
  expect(yield* run(source, services, [archived[1], archived[0], ...archived.slice(2)], archived)).toBeUndefined()
  expect(calls).toEqual([])
}))

it.instance("G2 smaller parent model, growing native tail and failed model lookup fall back without retiring stored memory", () => Effect.gen(function* () {
  const plan = yield* held(FIRST)
  const state = { fail: false }
  const lookups: string[] = []
  const getModel: Provider.Interface["getModel"] = (providerID, modelID) => {
    lookups.push(modelID)
    return state.fail ? Effect.fail(new Provider.ModelNotFoundError({ providerID, modelID })) : Effect.succeed(ProviderTest.model({ providerID, id: modelID,
      limit: modelID === "small" ? { context: 2000, output: 1000 } : modelID === "medium" ? { context: 16000, output: 1000 } : { context: 200000, output: 10000 } }))
  }
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const original = yield* applyFirst(sessionID, plan)
    const sessions = yield* Session.Service
    const history = yield* sessions.messages({ sessionID })
    const user = history.findLast((message) => message.info.role === "user")!.info
    if (user.role !== "user") throw new Error("Expected user")
    yield* sessions.updateMessage({ ...user, model: { ...user.model, modelID: ModelV2.ID.make("small") } })
    expect(yield* prepare(sessionID)).toEqual({ messages: yield* sessions.messages({ sessionID }), system: [] })
    yield* sessions.updateMessage(user)
    expect((yield* prepare(sessionID)).system).toEqual(original.system)
    yield* sessions.updateMessage({ ...user, model: { ...user.model, modelID: ModelV2.ID.make("medium") } })
    expect((yield* prepare(sessionID)).system).toEqual(original.system)
    yield* sessions.updateMessage(user)
    const growth = yield* begin(sessionID, "GROWING_NATIVE_TAIL " + "x".repeat(80_000))
    yield* sessions.updateMessage({ ...growth, model: { ...growth.model, modelID: ModelV2.ID.make("medium") } })
    expect(yield* prepare(sessionID)).toEqual({ messages: yield* sessions.messages({ sessionID }), system: [] })
    yield* sessions.updateMessage(growth)
    expect((yield* prepare(sessionID)).system).toEqual(original.system)
    state.fail = true
    expect(yield* prepare(sessionID)).toEqual({ messages: yield* sessions.messages({ sessionID }), system: [] })
    state.fail = false
    const restored = yield* prepare(sessionID)
    expect(restored.system).toEqual(original.system)
    expect(restored.messages).toEqual((yield* sessions.messages({ sessionID })).slice(4))
    expect(lookups).toContain("small")
    expect(lookups).toContain("medium")
  }).pipe(Effect.provide(environment([plan], { getModel })))
}), 30_000)

it.instance("G3 budget batches preserve every unfinished turn and low-token completions advance coverage until backlog is consumed", () => Effect.gen(function* () {
  const plans = yield* Effect.forEach([0, 1, 2, 3], (i) => held(`# Work\nBatch ${i}; keep checks read-only and deployment awaiting approval.`))
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const archive = yield* Archive.Service
    const chat = yield* sessions.create({ title: "Whole-turn backlog" })
    for (let i = 0; i < 8; i++) {
      const assistant = yield* complete(yield* begin(chat.id, `BATCH_USER_${i}`), `BATCH_ASSISTANT_${i}`, i === 7 ? 50_000 : 100)
      // Single-line failed output stays verbatim under masking, so these turns still need producer batches.
      if (i < 4) yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id, type: "tool", tool: "bash", callID: `batch-${i}`,
        state: { status: "completed", input: { command: `read-only-${i}` }, output: `TOOL_TURN_${i} ` + "x".repeat(72_000), title: "Whole exchange",
          metadata: { exit: 1 }, time: { start: 1, end: 2 } } })
    }
    const initial = yield* sessions.messages({ sessionID: chat.id })
    expect(Token.estimate(Transcript.transcript(initial.slice(0, 2)))).toBeLessThan(32_000)
    expect(Token.estimate(Transcript.transcript(initial.slice(0, 4)))).toBeGreaterThan(32_000)
    for (let i = 0; i < plans.length; i++) {
      if (i > 0) yield* complete(yield* begin(chat.id, `LOW_USAGE_REFRESH_${i}`), `LOW_REPLY_${i}`, 100)
      const hit = yield* entered(plans[i])
      const history = yield* sessions.messages({ sessionID: chat.id })
      const refs = new Map((yield* archive.list(chat.id)).map((ref) => [ref.id, ref.first]))
      const sourceIDs = [...new Set(fragments(packet(hit.request)).map((fragment) => refs.get(fragment.id)))]
      const end = i < 3 ? (i + 1) * 2 : history.length - 8
      expect(sourceIDs).toEqual(history.slice(i * 2, end).map((message) => message.info.id))
      if (i > 0) expect(packet(hit.request)).toContain(plans[i - 1].memory)
      yield* Deferred.succeed(plans[i].release, undefined)
      yield* terminal(hit.jobID, "completed", "applied")
      const prepared = yield* prepare(chat.id)
      expect(prepared.messages).toEqual(history.slice(end))
      expect(prepared.messages[0].info.role).toBe("user")
      expect(prepared.system[0].replaceAll("\\_", "_")).toContain(`covered through ${history[end - 1].info.id}; native tail begins ${history[end].info.id}`)
      expect(yield* sessions.messages({ sessionID: chat.id })).toEqual(history)
    }
    const jobs = yield* BackgroundJob.Service
    const before = yield* jobs.list()
    yield* complete(yield* begin(chat.id, "BACKLOG_FINISHED"), "LOW_NO_REFRESH", 100)
    expect(yield* jobs.list()).toEqual(before)
  }).pipe(Effect.provide(environment(plans)))
}), 60_000)

it.instance("G3 indivisible first over-budget tool turn stays native without a partial producer submission", () => Effect.gen(function* () {
  const plan = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const chat = yield* sessions.create({ title: "Oversized first turn" })
    for (let i = 0; i < 5; i++) {
      const assistant = yield* complete(yield* begin(chat.id, `OVERSIZED_${i}`), `REPLY_${i}`, i === 4 ? 50_000 : 100)
      if (i === 0) yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id, type: "tool", tool: "read", callID: "oversized",
        state: { status: "completed", input: {}, output: "INDIVISIBLE " + "y".repeat(145_000), title: "Full observation", metadata: {}, time: { start: 1, end: 2 } } })
    }
    const history = yield* sessions.messages({ sessionID: chat.id })
    expect(Token.estimate(Transcript.transcript(history.slice(0, 2)))).toBeGreaterThan(32_000)
    expect(Token.estimate(JSON.stringify(history))).toBeLessThan(190_000)
    yield* terminal((yield* jobFor(chat.id, history.at(-1)!.info.id)).id, "completed", "discarded")
    expect(yield* Deferred.isDone(plan.entered)).toBe(false)
    expect(yield* prepare(chat.id)).toEqual({ messages: history, system: [] })
  }).pipe(Effect.provide(environment([plan])))
}), 30_000)

for (const action of ["advance", "cancel", "forget-rearm"] as const) it.instance(`G4 terminal-stop result held in cleanup cannot overwrite newer context or slot: ${action}`, () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const stale = yield* held("# Work\nSTALE_TERMINAL_RESULT", { holdCleanup: true })
  const fresh = yield* held(SECOND)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const original = yield* applyFirst(sessionID, first)
    yield* complete(yield* begin(sessionID, "STOP_THEN_HOLD_CLEANUP"), "STOP_REPLY", 50_000)
    const hit = yield* entered(stale)
    yield* Deferred.succeed(stale.release, undefined)
    yield* awaitWithTimeout(Deferred.await(stale.closing), "Terminal stop did not reach cleanup", "15 seconds")
    const jobs = yield* BackgroundJob.Service
    const continuity = yield* SessionContinuity.Service
    expect((yield* prepare(sessionID)).system).toEqual(original.system)
    expect((yield* jobs.get(hit.jobID))?.status).toBe("running")
    const cancel = action === "cancel" ? yield* jobs.cancel(hit.jobID).pipe(Effect.forkChild) : undefined
    if (cancel) {
      yield* pollWithTimeout(jobs.get(hit.jobID).pipe(Effect.map((job) => job?.status === "cancelled" ? job : undefined)), "Cancel did not begin")
      expect(yield* Effect.sync(() => cancel.pollUnsafe())).toBeUndefined()
    }
    if (action === "forget-rearm") yield* continuity.forget(sessionID)
    const newer = yield* complete(yield* begin(sessionID, "NEWER_BOUNDARY"), "NEWER_REPLY", action === "forget-rearm" ? 50_000 : 100)
    yield* continuity.start({ sessionID, message: newer, canRecall: true })
    const rearmed = action === "forget-rearm" ? yield* entered(fresh) : undefined
    if (!rearmed) expect(yield* Deferred.isDone(fresh.entered)).toBe(false)
    expect(yield* Deferred.isDone(stale.closed)).toBe(false)
    yield* Deferred.succeed(stale.cleanup, undefined)
    if (cancel) expect((yield* Fiber.join(cancel))?.status).toBe("cancelled")
    yield* terminal(hit.jobID, cancel ? "cancelled" : "completed", cancel ? undefined : "discarded")
    expect(yield* Deferred.isDone(stale.closed)).toBe(true)
    expect((yield* prepare(sessionID)).system).toEqual(action === "forget-rearm" ? [] : original.system)
    const next = rearmed ?? (yield* entered(fresh))
    expect((yield* jobs.list()).filter((job) => job.id.includes(`:${newer.id}:`)).map((job) => job.id)).toEqual([next.jobID])
    expect((yield* jobs.get(next.jobID))?.status).toBe("running")
    yield* Deferred.succeed(fresh.release, undefined)
    yield* terminal(next.jobID, "completed", "applied")
    const after = yield* prepare(sessionID)
    expect(after.system[0]).toContain(SECOND)
    expect(after.system[0]).not.toContain("STALE_TERMINAL_RESULT")
    expect(after.messages.at(-1)?.parts.some((part) => part.type === "text" && part.text === "NEWER_REPLY")).toBe(true)
    yield* continuity.start({ sessionID, message: newer, canRecall: true })
    expect((yield* jobs.list()).filter((job) => job.id.includes(`:${newer.id}:`)).map((job) => job.id)).toEqual([next.jobID])
  }).pipe(Effect.provide(environment([first, stale, fresh])))
}), 60_000)

function dispatchGate() {
  const tasks: { task: () => void; priority: number }[] = []
  const normal = new Scheduler.MixedScheduler()
  let paused = false
  const scheduler: Scheduler.Scheduler = {
    executionMode: "async", shouldYield: () => false,
    makeDispatcher: () => {
      const dispatcher = normal.makeDispatcher()
      return {
        scheduleTask(task, priority) {
          if (paused) { tasks.push({ task, priority }); return }
          dispatcher.scheduleTask(task, priority)
        },
        flush() { if (!paused) dispatcher.flush() },
      }
    },
  }
  return { scheduler, tasks, pause() { paused = true }, flush() {
    paused = false
    for (const { task } of tasks.splice(0).sort((a, b) => a.priority - b.priority)) task()
  } }
}

for (const action of ["deliver", "duplicate", "advance", "invalidate", "forget", "dispose"] as const) it.instance(`G4 queued dispatch rechecks admission and instance lifetime before start: ${action}`, () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const old = yield* held("# Work\nOld terminal snapshot", { holdCleanup: true })
  const fresh = yield* held(SECOND)
  const gate = dispatchGate()
  yield* Effect.addFinalizer(() => Effect.sync(gate.flush))
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    const jobs = yield* BackgroundJob.Service
    const continuity = yield* SessionContinuity.Service
    const user = yield* begin(sessionID, "DEFER_DISPATCH")
    yield* complete(user, "OLD_STOP", 50_000).pipe(Effect.provideService(Scheduler.Scheduler, gate.scheduler))
    const hit = yield* entered(old)
    yield* Deferred.succeed(old.release, undefined)
    yield* awaitWithTimeout(Deferred.await(old.closing), "Old transport never reached finalization", "15 seconds")
    const newer = yield* complete(yield* begin(sessionID, "QUEUED_SAFE_TURN"), "QUEUED_REPLY", 100)
    gate.pause()
    yield* Deferred.succeed(old.cleanup, undefined)
    yield* terminal(hit.jobID, "completed", "discarded")
    expect(yield* Deferred.isDone(old.closed)).toBe(true)
    expect(gate.tasks.length).toBeGreaterThan(0)
    expect(yield* Deferred.isDone(fresh.entered)).toBe(false)
    const before = (yield* jobs.list()).map((job) => job.id)
    expect(before.some((id) => id.includes(`:${newer.id}:`))).toBe(false)
    if (action === "advance") yield* begin(sessionID, "UNFINISHED_NEW_USER")
    if (action === "invalidate") yield* continuity.invalidate(sessionID)
    if (action === "forget") yield* continuity.forget(sessionID)
    if (action === "dispose") {
      const instance = yield* TestInstance
      const store = yield* InstanceStore.Service
      yield* store.disposeDirectory(instance.directory)
      // A fresh instance/registry must not receive the old queued callback.
      yield* store.provide({ directory: instance.directory }, Effect.gen(function* () {
        expect(yield* jobs.list()).toEqual([])
        gate.flush()
        expect(yield* jobs.list()).toEqual([])
        expect(yield* Deferred.isDone(fresh.entered)).toBe(false)
      }))
      return
    }
    if (action === "duplicate") yield* continuity.start({ sessionID, message: newer, canRecall: true })
    gate.flush()
    if (action !== "deliver" && action !== "duplicate") {
      expect((yield* jobs.list()).map((job) => job.id)).toEqual(before)
      expect(yield* Deferred.isDone(fresh.entered)).toBe(false)
      return
    }
    const delivered = yield* entered(fresh)
    expect(delivered.jobID).toContain(`:${newer.id}:`)
    expect((yield* jobs.list()).filter((job) => job.id.includes(`:${newer.id}:`))).toHaveLength(1)
    yield* Deferred.succeed(fresh.release, undefined)
    yield* terminal(delivered.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system[0]).toContain(SECOND)
  }).pipe(Effect.provide(environment([first, old, fresh])))
}), 60_000)
