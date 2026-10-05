import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Deferred, Effect, Exit } from "effect"
import { Archive } from "@/continuity/archive"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import { SessionContinuity } from "@/continuity/service"
import { it } from "../lib/effect"
import { A, B, FIRST, SECOND, NONCE, RECEIPT, applyFirst, archiveDirectory, archiveFile, begin, complete, entered,
  environment, fragments, held, jobFor, packet, prepare, recall, seed, terminal } from "./service-fixture"

it.instance("denied recall prevents maintenance; revocation restores native history even without active references", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const second = yield* held(SECOND)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed(B, A, undefined, false)
    const jobs = yield* BackgroundJob.Service
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const history = yield* sessions.messages({ sessionID })
    expect(yield* jobs.list()).toEqual([])
    expect(yield* Deferred.isDone(first.entered)).toBe(false)
    expect(yield* prepare(sessionID, false)).toEqual({ messages: history, system: [] })
    const latest = history.at(-1)!.info
    if (latest.role !== "assistant") throw new Error("Expected assistant")
    yield* continuity.start({ sessionID, message: latest, canRecall: true })
    const allowed = yield* applyFirst(sessionID, first)
    expect(yield* prepare(sessionID, false)).toEqual({ messages: history, system: [] })
    expect(yield* prepare(sessionID, true)).toEqual(allowed)
    yield* complete(yield* begin(sessionID, "REVOKED_USER"), "REVOKED_REPLY", 50_000, false)
    const current = yield* sessions.messages({ sessionID })
    expect(yield* prepare(sessionID, false)).toEqual({ messages: current, system: [] })
    expect((yield* prepare(sessionID, true)).system).toEqual(allowed.system)
    expect(yield* Deferred.isDone(second.entered)).toBe(false)
    yield* complete(yield* begin(sessionID, "RE_ENABLED"), "RE_ENABLED_REPLY", 50_000, true)
    const hit = yield* entered(second)
    expect(packet(hit.request)).toContain(FIRST)
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system[0]).toContain(SECOND)
  }).pipe(Effect.provide(environment([first, second])))
}), 30_000)

it.instance("reference retirement preserves real recall; append-only publication avoids rereading retired history until invalidation", () => Effect.gen(function* () {
  const first = yield* held(FIRST, { reference: NONCE })
  const second = yield* held(SECOND)
  const third = yield* held("Work: Verification still pending; approval constraint retained.")
  const repaired = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed(B, A, RECEIPT)
    const enteredFirst = yield* entered(first)
    const ref = fragments(packet(enteredFirst.request)).find((entry) => entry.text.includes(NONCE))!
    const initial = yield* applyFirst(sessionID, first)
    expect(initial.system[0]).toContain(ref.id)
    expect(initial.system[0]).not.toContain(NONCE)
    const archived = yield* recall(sessionID, { reference: ref.id })
    expect(archived.status).toBe("found")
    expect(archived.content).toContain(RECEIPT)
    expect(archived.content).toContain("Exit: 75")
    yield* complete(yield* begin(sessionID, "RETIRE_TRIGGER"), "RETIRE_REPLY", 50_000)
    const refresh = yield* entered(second)
    expect(packet(refresh.request)).toContain(ref.id)
    expect(packet(refresh.request)).toContain(FIRST)
    expect(packet(refresh.request)).not.toContain(NONCE)
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(refresh.jobID, "completed", "applied")
    const retired = yield* prepare(sessionID)
    expect(retired.system[0]).toContain(SECOND)
    expect(retired.system[0]).not.toContain(ref.id)
    expect((yield* recall(sessionID, { archive_list: true, limit: 20 })).references?.some((entry) => entry.id === ref.id)).toBe(true)
    expect((yield* recall(sessionID, { reference: ref.id })).content).toBe(archived.content)
    const archive = yield* Archive.Service
    const original = yield* archive.read({ sessionID, id: ref.id })
    if (!original) throw new Error("Expected real retained fragment")
    yield* Effect.promise(() => Bun.write(archiveFile(sessionID, ref.id), original.markdown + "CORRUPTED"))
    expect(Exit.isFailure(yield* archive.read({ sessionID, id: ref.id }).pipe(Effect.exit))).toBe(true)
    // A publish that resubmits/rereads the old prefix would now fail hash verification.
    yield* complete(yield* begin(sessionID, "APPEND_ONLY_TRIGGER"), "APPEND_ONLY_REPLY", 50_000)
    const append = yield* entered(third)
    yield* Deferred.succeed(third.release, undefined)
    yield* terminal(append.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system[0]).toContain(third.memory)
    const continuity = yield* SessionContinuity.Service
    yield* continuity.invalidate(sessionID)
    const invalidated = yield* complete(yield* begin(sessionID, "RESET_CURSOR"), "RESET_REPLY", 100)
    yield* terminal((yield* jobFor(sessionID, invalidated.id)).id, "error")
    expect(yield* Deferred.isDone(repaired.entered)).toBe(false)
    const sessions = yield* Session.Service
    expect(yield* prepare(sessionID)).toEqual({ messages: yield* sessions.messages({ sessionID }), system: [] })
    yield* Effect.promise(() => Bun.write(archiveFile(sessionID, ref.id), original.markdown))
    yield* complete(yield* begin(sessionID, "REPAIR_RETRY"), "REPAIR_REPLY", 100)
    const retry = yield* entered(repaired)
    expect(packet(retry.request)).toContain("No prior working memory.")
    expect(packet(retry.request)).toContain(NONCE)
    yield* Deferred.succeed(repaired.release, undefined)
    yield* terminal(retry.jobID, "completed", "applied")
  }).pipe(Effect.provide(environment([first, second, third, repaired])))
}), 30_000)

for (const damage of ["missing", "corrupt"] as const) it.instance(`active reference ${damage} prevents pruning; repaired bytes restore stored context`, () => Effect.gen(function* () {
  const first = yield* held(FIRST, { reference: NONCE })
  yield* Effect.gen(function* () {
    const sessionID = yield* seed(B, A, RECEIPT)
    const hit = yield* entered(first)
    const ref = fragments(packet(hit.request)).find((entry) => entry.text.includes(NONCE))!
    const allowed = yield* applyFirst(sessionID, first)
    const archive = yield* Archive.Service
    const original = yield* archive.read({ sessionID, id: ref.id })
    if (!original) throw new Error("Expected real archive")
    expect((yield* recall(sessionID, { reference: ref.id })).content).toContain(NONCE)
    if (damage === "missing") yield* Effect.promise(() => fs.unlink(archiveFile(sessionID, ref.id)))
    if (damage === "corrupt") yield* Effect.promise(() => Bun.write(archiveFile(sessionID, ref.id), "not the hashed content"))
    expect((yield* recall(sessionID, { reference: ref.id })).status).toBe("unavailable")
    const sessions = yield* Session.Service
    expect(yield* prepare(sessionID)).toEqual({ messages: yield* sessions.messages({ sessionID }), system: [] })
    yield* Effect.promise(() => Bun.write(archiveFile(sessionID, ref.id), original.markdown))
    expect(yield* prepare(sessionID)).toEqual(allowed)
  }).pipe(Effect.provide(environment([first])))
}), 30_000)

it.instance("failed real archive publication never starts the producer or authorizes pruning", () => Effect.gen(function* () {
  const plan = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const chat = yield* sessions.create()
    yield* Effect.promise(async () => {
      await fs.mkdir(path.dirname(archiveDirectory(chat.id)), { recursive: true })
      await Bun.write(archiveDirectory(chat.id), "A file cannot be a session archive directory")
    })
    for (let i = 0; i < 5; i++) yield* complete(yield* begin(chat.id, `PUBLICATION_${i}`), `REPLY_${i}`)
    const last = yield* complete(yield* begin(chat.id, "FAIL_PUBLICATION"), "FAIL_REPLY", 50_000)
    yield* terminal((yield* jobFor(chat.id, last.id)).id, "error")
    expect(yield* Deferred.isDone(plan.entered)).toBe(false)
    expect(yield* prepare(chat.id)).toEqual({ messages: yield* sessions.messages({ sessionID: chat.id }), system: [] })
    yield* Effect.promise(() => fs.unlink(archiveDirectory(chat.id)))
    yield* complete(yield* begin(chat.id, "PUBLICATION_RETRY"), "RETRY_REPLY", 50_000)
    yield* applyFirst(chat.id, plan)
  }).pipe(Effect.provide(environment([plan])))
}), 30_000)

it.instance("foreign-owner archive IDs cannot enter memory or bypass real tool ownership", () => Effect.gen(function* () {
  const first = yield* held(FIRST, { reference: NONCE })
  const rejected = yield* held(SECOND)
  yield* Effect.gen(function* () {
    const own = yield* seed(B, A, RECEIPT)
    yield* applyFirst(own, first)
    const foreign = yield* seed(B, A, RECEIPT, false)
    const sessions = yield* Session.Service
    const archive = yield* Archive.Service
    const refs = yield* archive.publish({ sessionID: foreign, messages: yield* sessions.messages({ sessionID: foreign }) })
    const selected = refs.find((ref) => ref.markdown.includes(NONCE))!
    expect((yield* recall(foreign, { reference: selected.id })).content).toContain(NONCE)
    const denied = yield* recall(own, { reference: selected.id }, { sessionID: foreign })
    expect(denied.status).toBe("unavailable")
    expect(denied.content).toBeUndefined()
    rejected.respond = () => JSON.stringify({ memory: SECOND, references: [{ id: selected.id, why: "Foreign evidence" }] })
    yield* complete(yield* begin(own, "FOREIGN_REFERENCE_ATTEMPT"), "FOREIGN_REPLY", 50_000)
    const hit = yield* entered(rejected)
    const before = yield* prepare(own)
    yield* Deferred.succeed(rejected.release, undefined)
    yield* terminal(hit.jobID, "completed", "discarded")
    expect(yield* prepare(own)).toEqual(before)
    expect(before.system[0]).not.toContain(selected.id)
  }).pipe(Effect.provide(environment([first, rejected])))
}), 30_000)
