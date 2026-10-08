import { expect } from "bun:test"
import { Deferred, Effect, Logger, Stream } from "effect"
import { LLMEvent } from "@opencode-ai/llm"
import { Archive } from "@/continuity/archive"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { SessionContinuity } from "@/continuity/service"
import type { LLM } from "@/session/llm"
import { awaitWithTimeout, it } from "../lib/effect"
import { A, B, FIRST, NONCE, RECEIPT, SECOND, applyFirst, begin, complete, entered, environment, fragments, held, jobFor, packet, prepare, seed, terminal } from "./service-fixture"

it.instance("repeat maintenance receives prior Markdown and only the newly completed prefix delta", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const second = yield* held(SECOND)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const original = yield* applyFirst(sessionID, first)
    yield* complete(yield* begin(sessionID, "NEW_USER_INCREMENTAL"), "NEW_REPLY_INCREMENTAL", 50_000)
    const hit = yield* entered(second)
    const data = packet(hit.request)
    expect(data).toContain(FIRST)
    const head = fragments(data)
    expect(head.map((entry) => entry.text).join("\n")).toContain("NEW_USER_INCREMENTAL")
    expect(head.map((entry) => entry.text).join("\n")).toContain("NEW_REPLY_INCREMENTAL")
    expect(head.map((entry) => entry.id)).toEqual(["u7", "a7"])
    expect(data.slice(data.indexOf("## Transcript of the new span"))).not.toContain(A)
    expect(data).not.toContain("SEED_REPLY_2_027D")
    const sessions = yield* Session.Service
    const history = yield* sessions.messages({ sessionID })
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const prepared = yield* prepare(sessionID)
    expect(prepared.system[0]).toContain(SECOND)
    expect(prepared.system[0]).not.toContain(FIRST)
    expect(prepared.messages).toEqual([history.at(-2)!])
    expect(prepared.coverage?.coveredThrough).not.toBe(original.coverage?.coveredThrough)
    expect(yield* sessions.messages({ sessionID })).toEqual(history)
    expect(JSON.stringify(history)).not.toContain("# Working memory")
    expect(yield* sessions.children(sessionID)).toEqual([])
  }).pipe(Effect.provide(environment([first, second])))
}), 30_000)

for (const ongoing of [false, true]) it.instance(`held stale A cannot prune; below-threshold refresh waits for whole parent turn; ongoing=${ongoing}`, () => Effect.gen(function* () {
  const stale = yield* held("Work: STALE_A_MUST_NOT_APPLY")
  const fresh = yield* held(SECOND)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const old = yield* entered(stale)
    const jobs = yield* BackgroundJob.Service
    const sessions = yield* Session.Service
    expect((yield* jobs.get(old.jobID))?.status).toBe("running")
    // This parent completion must finish while the actual BackgroundJob stream is held.
    yield* awaitWithTimeout(complete(yield* begin(sessionID, "PENDING_USER"), "PENDING_REPLY", 100), "Parent blocked on maintenance")
    const user = ongoing ? yield* begin(sessionID, "ONGOING_USER") : undefined
    expect(yield* Deferred.isDone(stale.release)).toBe(false)
    expect(yield* Deferred.isDone(fresh.entered)).toBe(false)
    yield* Deferred.succeed(stale.release, undefined)
    yield* terminal(old.jobID, "completed", "discarded")
    const native = yield* sessions.messages({ sessionID })
    expect(yield* prepare(sessionID)).toEqual({ messages: native, system: [] })
    if (user) {
      expect(yield* Deferred.isDone(fresh.entered)).toBe(false)
      expect((yield* jobs.list()).filter((job) => job.status === "running")).toEqual([])
      yield* complete(user, "ONGOING_COMPLETED_REPLY", 100)
    }
    const hit = yield* entered(fresh)
    expect(packet(hit.request)).not.toContain("STALE_A_MUST_NOT_APPLY")
    yield* Deferred.succeed(fresh.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const applied = yield* prepare(sessionID)
    expect(applied.system[0]).toContain(SECOND)
    expect(applied.messages[0].info.role).toBe("user")
    expect(applied.messages).toEqual([(yield* sessions.messages({ sessionID })).at(-2)!])
  }).pipe(Effect.provide(environment([stale, fresh])))
}), 30_000)

for (const failure of ["provider-error", "stream-failure", "tool-attempt", "partial-only", "malformed", "resumed-work", "refusal", "length"] as const) {
  it.instance(`${failure} after emitted memory preserves prior usable context`, () => Effect.gen(function* () {
    const first = yield* held(FIRST)
    const output = failure === "stream-failure" ? Stream.fail(new Error("SECRET_CONVERSATION_MARKER"))
      : failure === "partial-only" ? Stream.empty : Stream.fromIterable([
        ...(failure === "provider-error" ? [LLMEvent.providerError({ message: "provider-error" })]
          : failure === "tool-attempt" ? [LLMEvent.toolCall({ id: "forbidden", name: "bash", input: { command: "forbidden" } })] : []),
        LLMEvent.finish({ reason: failure === "refusal" ? "content-filter" : failure === "length" ? "length" : "stop" }),
      ])
    const invalid = failure === "malformed" ? '{"memory":"missing references"}'
      : failure === "resumed-work" ? "I continued working and changed the code." : "Work: REJECTED_MEMORY"
    const second = yield* held(invalid, { output, raw: failure === "malformed" || failure === "resumed-work" })
    yield* Effect.gen(function* () {
      const sessionID = yield* seed()
      yield* applyFirst(sessionID, first)
      yield* complete(yield* begin(sessionID, `FAILURE_USER_${failure}`), `FAILURE_REPLY_${failure}`, 50_000)
      const hit = yield* entered(second)
      const before = yield* prepare(sessionID)
      yield* Deferred.succeed(second.release, undefined)
      yield* terminal(hit.jobID, "completed", failure === "stream-failure" ? "provider" : "invalid-schema")
      expect(yield* prepare(sessionID)).toEqual(before)
      expect(before.system[0]).toContain(FIRST)
      expect(JSON.stringify(yield* prepare(sessionID))).not.toContain("REJECTED_MEMORY")
      const jobs = yield* BackgroundJob.Service
      expect((yield* jobs.list()).filter((job) => job.status === "running")).toEqual([])
      if (failure === "stream-failure") {
        expect((yield* jobs.get(hit.jobID))?.output).toBe("provider")
        expect(JSON.stringify(yield* jobs.list())).not.toContain("SECRET_CONVERSATION_MARKER")
      }
    }).pipe(Effect.provide(environment([first, second])))
  }), 30_000)
}

it.instance("cancellation interrupts the real held stream and frees the next maintenance slot", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const cancelled = yield* held(SECOND)
  const next = yield* held(SECOND)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    expect(yield* Deferred.isDone(first.closed)).toBe(true)
    yield* complete(yield* begin(sessionID, "CANCEL_USER"), "CANCEL_REPLY", 50_000)
    const hit = yield* entered(cancelled)
    const before = yield* prepare(sessionID)
    const jobs = yield* BackgroundJob.Service
    expect((yield* jobs.get(hit.jobID))?.status).toBe("running")
    expect(yield* Deferred.isDone(cancelled.release)).toBe(false)
    expect(yield* Deferred.isDone(cancelled.closed)).toBe(false)
    const stopped = yield* awaitWithTimeout(jobs.cancel(hit.jobID), "Cancellation did not finish", "5 seconds")
    expect(stopped?.status).toBe("cancelled")
    yield* terminal(hit.jobID, "cancelled")
    expect(yield* prepare(sessionID)).toEqual(before)
    expect(yield* Deferred.isDone(cancelled.release)).toBe(false)
    yield* complete(yield* begin(sessionID, "AFTER_CANCEL_USER"), "AFTER_CANCEL_REPLY", 50_000)
    const hitNext = yield* entered(next)
    expect(hitNext.jobID).not.toBe(hit.jobID)
    yield* Deferred.succeed(next.release, undefined)
    yield* terminal(hitNext.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system[0]).toContain(SECOND)
    expect(yield* Deferred.isDone(next.closed)).toBe(true)
    expect(yield* Deferred.isDone(cancelled.closed)).toBe(true)
  }).pipe(Effect.provide(environment([first, cancelled, next])))
}), 30_000)

for (const action of ["edit", "revert", "forget"] as const) it.instance(`${action} invalidates memory and an in-flight result, then restarts from native history`, () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const stale = yield* held(SECOND)
  const fresh = yield* held("Work: Recheck edited or rewound history; approval still required.")
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    yield* complete(yield* begin(sessionID, "EDIT_PENDING_USER"), "EDIT_PENDING_REPLY", 50_000)
    const hit = yield* entered(stale)
    const continuity = yield* SessionContinuity.Service
    const sessions = yield* Session.Service
    const history = yield* sessions.messages({ sessionID })
    if (action === "forget") yield* continuity.forget(sessionID)
    if (action !== "forget") yield* continuity.invalidate(sessionID)
    if (action === "edit") {
      const part = history[0].parts[0]
      if (part.type !== "text") throw new Error("Expected fixture text")
      yield* sessions.updatePart({ ...part, text: "EDITED_HEAD_FACT" })
    }
    if (action === "revert") for (const message of history.slice(-2))
      yield* sessions.removeMessage({ sessionID, messageID: message.info.id })
    const native = yield* sessions.messages({ sessionID })
    expect(yield* prepare(sessionID)).toEqual({ messages: native, system: [] })
    yield* Deferred.succeed(stale.release, undefined)
    yield* terminal(hit.jobID, "completed", "discarded")
    yield* complete(yield* begin(sessionID, "AFTER_INVALIDATION"), "AFTER_INVALIDATION_REPLY", action === "forget" ? 50_000 : 100)
    const next = yield* entered(fresh)
    expect(packet(next.request)).toContain("## Current working memory\n\n(none)")
    expect(packet(next.request)).toContain(action === "edit" ? "EDITED_HEAD_FACT" : A)
    yield* Deferred.succeed(fresh.release, undefined)
    yield* terminal(next.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system[0]).toContain(fresh.memory)
  }).pipe(Effect.provide(environment([first, stale, fresh])))
}), 30_000)

it.instance("native compaction archives durable old history but supplies only summary and displaced active turns", () => Effect.gen(function* () {
  const plan = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const archive = yield* Archive.Service
    const continuity = yield* SessionContinuity.Service
    const chat = yield* sessions.create({ title: "Native compaction before working memory" })
    for (let i = 0; i < 5; i++) yield* complete(yield* begin(chat.id, `OLD_DURABLE_HISTORY_${i}`), `OLD_REPLY_${i}`)
    const compaction = yield* begin(chat.id, "COMPACTION_REQUEST")
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: compaction.id, type: "compaction", auto: true })
    const summary = yield* complete(compaction, "NATIVE_SUMMARY: cache investigation; read-only constraint remains.")
    yield* sessions.updateMessage({ ...summary, summary: true })
    for (let i = 0; i < 5; i++) yield* complete(yield* begin(chat.id, `ACTIVE_DISCOVERY_${i}`), `ACTIVE_REPLY_${i}`, i === 4 ? 50_000 : 100)
    const hit = yield* entered(plan)
    const data = packet(hit.request)
    expect(data).toContain("NATIVE_SUMMARY:")
    expect(data).toContain("ACTIVE_DISCOVERY_0")
    expect(data).not.toContain("OLD_DURABLE_HISTORY_")
    expect(data).toContain("ACTIVE_DISCOVERY_4")
    const durable = yield* sessions.messages({ sessionID: chat.id })
    const refs = yield* archive.list(chat.id)
    const historical = refs.find((ref) => ref.first === durable[0].info.id)
    expect(historical).toBeDefined()
    expect((yield* archive.read({ sessionID: chat.id, id: historical!.id }))?.markdown).toContain("OLD_DURABLE_HISTORY_0")
    const active = MessageV2.filterCompacted(durable.toReversed())
    expect(active[0].info.id).toBe(compaction.id)
    expect(active[1].info.id).toBe(summary.id)
    yield* Deferred.succeed(plan.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const prepared = yield* continuity.prepare({ sessionID: chat.id, messages: active, canRecall: true })
    expect(prepared.messages).toEqual([active.at(-2)!])
    expect(prepared.system[0]).toContain(FIRST)
    expect(yield* sessions.messages({ sessionID: chat.id })).toEqual(durable)
  }).pipe(Effect.provide(environment([plan])))
}), 30_000)

for (const config of [{ continuity: { enabled: false } }, { continuity: { trigger: 0.5 } }]) {
  it.instance(`no maintenance starts below the configured trigger or when disabled: ${JSON.stringify(config)}`, () => Effect.gen(function* () {
    yield* Effect.gen(function* () {
      // Seed reports 50,000 tokens on a 200,000-token window: 25%, below 0.5 and irrelevant when disabled.
      const sessionID = yield* seed()
      const jobs = yield* BackgroundJob.Service
      expect((yield* jobs.list()).filter((job) => job.metadata?.sessionId === sessionID)).toEqual([])
      expect((yield* prepare(sessionID)).system).toEqual([])
    }).pipe(Effect.provide(environment([], { config })))
  }), 30_000)
}

it.instance("the default fixture trigger starts maintenance at the same usage", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const jobs = yield* BackgroundJob.Service
    expect((yield* jobs.list()).filter((job) => job.metadata?.sessionId === sessionID)).toHaveLength(1)
  }).pipe(Effect.provide(environment([first])))
}), 30_000)

it.instance("failed complete production uses reversible masking relief without declaring complete coverage", () => Effect.gen(function* () {
  yield* Effect.gen(function* () {
    // The fixture window is 200,000 tokens at trigger 0.25: the fork is needed above 0.10 (20,000 tokens).
    // Seed turn 0 carries ~40,000 tokens of tool output, so masking brings 50,000 below that line.
    const output = "build log line\n".repeat(10_000)
    const sessionID = yield* seed(B, A, output)
    const sessions = yield* Session.Service
    const history = yield* sessions.messages({ sessionID })
    const job = yield* jobFor(sessionID, history.at(-1)!.info.id)
    // No producer plan exists: failure falls back to reversible masks, never complete-prefix success.
    yield* terminal(job.id, "completed", "masked")
    const prepared = yield* prepare(sessionID)
    expect(prepared.system).toEqual([])
    expect(prepared.coverage).toBeUndefined()
    const tool = prepared.messages.flatMap((message) => message.parts).find((part) => part.type === "tool")
    if (tool?.type !== "tool" || tool.state.status !== "completed") throw new Error("Expected tool part")
    expect(tool.state.output).toStartWith(`build log line\n`)
    expect(tool.state.output).toContain("masked")
    const reference = /"reference":"([a-f0-9]{64})"/.exec(tool.state.output)?.[1]
    expect(reference).toBeDefined()
    const archive = yield* Archive.Service
    expect((yield* archive.read({ sessionID, id: reference! }))?.markdown).toContain("build log line\nbuild log line")
    // Stored history keeps the full output; masking only changes the model view.
    const stored = (yield* sessions.messages({ sessionID })).flatMap((message) => message.parts).find((part) => part.type === "tool")
    expect(stored?.type === "tool" && stored.state.status === "completed" && stored.state.output === output).toBe(true)
    expect((yield* prepare(sessionID, false)).messages).toEqual(yield* sessions.messages({ sessionID }))
  }).pipe(Effect.provide(environment([])))
}), 60_000)

it.instance("three consecutive invalid producer results stop maintenance until history changes", () => Effect.gen(function* () {
  const plans = yield* Effect.forEach([0, 1, 2], () => held("not a JSON operation set", { raw: true }))
  const recovered = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const jobs = yield* BackgroundJob.Service
    const continuity = yield* SessionContinuity.Service
    const sessionID = yield* seed()
    for (const [index, plan] of plans.entries()) {
      if (index > 0) yield* complete(yield* begin(sessionID, `RETRY_${index}`), `RETRY_REPLY_${index}`, 50_000)
      const hit = yield* entered(plan)
      yield* Deferred.succeed(plan.release, undefined)
      yield* terminal(hit.jobID, "completed", "invalid-schema")
    }
    const count = () => jobs.list().pipe(Effect.map((list) => list.filter((job) => job.metadata?.sessionId === sessionID).length))
    expect(yield* count()).toBe(3)
    // The breaker is open: another over-trigger turn starts nothing.
    yield* complete(yield* begin(sessionID, "AFTER_BREAKER"), "AFTER_BREAKER_REPLY", 50_000)
    expect(yield* count()).toBe(3)
    // An edit or revert invalidates history and closes the breaker again.
    yield* continuity.invalidate(sessionID)
    yield* complete(yield* begin(sessionID, "AFTER_EDIT"), "AFTER_EDIT_REPLY", 50_000)
    const hit = yield* entered(recovered)
    yield* Deferred.succeed(recovered.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    expect(yield* count()).toBe(4)
  }).pipe(Effect.provide(environment([...plans, recovered])))
}), 90_000)

it.instance("an old parent request falls back to isolated complete production carrying current memory", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const second = yield* held(SECOND)
  yield* Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    const sessions = yield* Session.Service
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    // The model never matches, so a request that passes the memory check falls back to the isolated producer.
    const request = (system: string[], contextMemory: boolean) => ({
      sessionID, model: { providerID: "none", id: "none" }, system, messages: [], tools: {}, contextMemory,
    }) as unknown as LLM.StreamInput
    yield* continuity.observe({ sessionID, request: request(["parent system"], false), messageIDs: [] })
    yield* complete(yield* begin(sessionID, "STALE_TURN"), "STALE_REPLY", 50_000)
    const hit = yield* entered(second)
    expect(hit.request.purpose).toBe("context-maintenance")
    expect(packet(hit.request)).toContain(FIRST)
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
  }).pipe(Effect.provide(environment([first, second])))
}), 60_000)

it.instance("C13: history that grows during a pass without an advance keeps the result; the growth stays native", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const hit = yield* entered(first)
    const sessions = yield* Session.Service
    // Written straight to storage: the boundary moves without the scheduler being told.
    const user = { ...(yield* sessions.messages({ sessionID })).findLast((message) => message.info.role === "user")!.info,
      id: MessageID.ascending(), time: { created: Date.now() } }
    yield* sessions.updateMessage(user)
    yield* Deferred.succeed(first.release, undefined)
    // A long turn keeps adding steps while maintenance runs: the memory still applies and the new message is in the tail.
    yield* terminal(hit.jobID, "completed", "applied")
    const prepared = yield* prepare(sessionID)
    expect(prepared.system[0]).toContain(FIRST)
    expect(prepared.messages.at(-1)!.info.id).toBe(user.id)
  }).pipe(Effect.provide(environment([first])))
}), 30_000)

it.instance("C-R10: one structural event per pass, without op contents", () => Effect.gen(function* () {
  const first = yield* held(FIRST, { reference: NONCE })
  const events: unknown[] = []
  yield* Effect.gen(function* () {
    const sessionID = yield* seed(B, A, RECEIPT)
    yield* applyFirst(sessionID, first)
  }).pipe(Effect.provide(environment([first])), Effect.provide(Logger.layer([
    Logger.make<unknown, void>((options) => { events.push(options.message) })])))
  const passes = events.filter((event) => Array.isArray(event) && event[0] === "continuity maintenance")
  expect(passes).toEqual([["continuity maintenance", expect.objectContaining({ reason: "applied", retried: false,
    ops: [{ op: "add", section: "findings" }], size: expect.any(Number) })]])
  expect(JSON.stringify(events)).not.toContain(FIRST)
  expect(JSON.stringify(events)).not.toContain(NONCE)
}), 30_000)
