import { expect } from "bun:test"
import { Deferred, Effect, Stream } from "effect"
import { LLMEvent } from "@opencode-ai/llm"
import { Archive } from "@/continuity/archive"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { PartID } from "@/session/schema"
import { SessionContinuity } from "@/continuity/service"
import { awaitWithTimeout, it } from "../lib/effect"
import { A, B, FIRST, SECOND, applyFirst, begin, complete, entered, environment, fragments, held, jobFor, packet, prepare, seed, terminal } from "./service-fixture"

it.instance("repeat maintenance receives prior Markdown and only newly displaced whole turns", () => Effect.gen(function* () {
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
    expect(head.map((entry) => entry.text).join("\n")).toContain(B)
    expect(head.map((entry) => entry.text).join("\n")).toContain("SEED_REPLY_2_027D")
    expect(data).not.toContain(A)
    expect(data).not.toContain("NEW_USER_INCREMENTAL")
    const sessions = yield* Session.Service
    const archive = yield* Archive.Service
    const history = yield* sessions.messages({ sessionID })
    const indexed = yield* archive.list(sessionID)
    expect(head.map((entry) => indexed.find((ref) => ref.id === entry.id)?.first))
      .toEqual(history.slice(4, 6).map((message) => message.info.id))
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const prepared = yield* prepare(sessionID)
    expect(prepared.system[0]).toContain(SECOND)
    expect(prepared.system[0]).not.toContain(FIRST)
    expect(prepared.messages.slice(0, 6)).toEqual(original.messages.slice(2))
    expect(yield* sessions.messages({ sessionID })).toEqual(history)
    expect(JSON.stringify(history)).not.toContain("# Historical working memory")
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
    expect(applied.messages).toEqual((yield* sessions.messages({ sessionID })).slice(-8))
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
      yield* terminal(hit.jobID, failure === "stream-failure" ? "error" : "completed", failure === "stream-failure" ? undefined : "discarded")
      expect(yield* prepare(sessionID)).toEqual(before)
      expect(before.system[0]).toContain(FIRST)
      expect(JSON.stringify(yield* prepare(sessionID))).not.toContain("REJECTED_MEMORY")
      const jobs = yield* BackgroundJob.Service
      expect((yield* jobs.list()).filter((job) => job.status === "running")).toEqual([])
      if (failure === "stream-failure") {
        expect((yield* jobs.get(hit.jobID))?.error).toBe("Continuity maintenance failed")
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
    expect(packet(next.request)).toContain("No prior working memory.")
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
    expect(data).not.toContain("ACTIVE_DISCOVERY_1")
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
    expect(prepared.messages).toEqual(active.slice(4))
    expect(prepared.system[0]).toContain(FIRST)
    expect(yield* sessions.messages({ sessionID: chat.id })).toEqual(durable)
  }).pipe(Effect.provide(environment([plan])))
}), 30_000)

for (const config of [{ continuity: { enabled: false } }, { continuity: { trigger: 0.9 } }]) {
  it.instance(`no maintenance starts below the configured trigger or when disabled: ${JSON.stringify(config)}`, () => Effect.gen(function* () {
    yield* Effect.gen(function* () {
      // Seed reports 50,000 tokens on a 200,000-token window: 25%, below 0.9 and irrelevant when disabled.
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

it.instance("masking old tool output alone skips the fork when it frees enough", () => Effect.gen(function* () {
  yield* Effect.gen(function* () {
    // The fixture window is 200,000 tokens at trigger 0.25: the fork is needed above 0.10 (20,000 tokens).
    // Seed turn 0 carries ~40,000 tokens of tool output, so masking brings 50,000 below that line.
    const output = "build log line\n".repeat(10_000)
    const sessionID = yield* seed(B, A, output)
    const sessions = yield* Session.Service
    const history = yield* sessions.messages({ sessionID })
    const job = yield* jobFor(sessionID, history.at(-1)!.info.id)
    // No maintenance plan exists: a fork request would fail this job instead of returning "masked".
    yield* terminal(job.id, "completed", "masked")
    const prepared = yield* prepare(sessionID)
    expect(prepared.system).toEqual([])
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
