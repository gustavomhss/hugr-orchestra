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
  body, environment, fragments, held, jobFor, packet, prepare, recall, seed, terminal } from "./service-fixture"

it.instance("memory applies without recall; recall only gates masking", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  yield* Effect.gen(function* () {
    // Without the legacy compaction, an agent that cannot recall still needs its context maintained.
    const sessionID = yield* seed(B, A, undefined, false)
    const allowed = yield* applyFirst(sessionID, first)
    expect(yield* prepare(sessionID, false)).toEqual(allowed)
  }).pipe(Effect.provide(environment([first])))
}), 30_000)

it.instance("memory aliases recall exact sources; append-only publication avoids rereading old history until invalidation", () => Effect.gen(function* () {
  const first = yield* held(FIRST, { reference: NONCE })
  const second = yield* held(SECOND)
  const third = yield* held("Work: Verification still pending; approval constraint retained.")
  const repaired = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed(B, A, RECEIPT)
    const enteredFirst = yield* entered(first)
    const ref = fragments(packet(enteredFirst.request)).find((entry) => entry.text.includes(NONCE))!
    expect(ref.id).toMatch(/^t\d+$/)
    const initial = yield* applyFirst(sessionID, first)
    expect(initial.system[0]).toContain(`(${ref.id} · `)
    expect(initial.system[0]).not.toContain(NONCE)
    const recalled = yield* recall(sessionID, { reference: ref.id })
    expect(recalled.status).toBe("found")
    expect(recalled.content).toContain(NONCE)
    expect(recalled.content).toContain('"exit":75')
    yield* complete(yield* begin(sessionID, "RETIRE_TRIGGER"), "RETIRE_REPLY", 50_000)
    const refresh = yield* entered(second)
    expect(packet(refresh.request)).toContain(FIRST)
    expect(fragments(packet(refresh.request)).map((entry) => entry.text).join("\n")).not.toContain(NONCE)
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(refresh.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system[0]).toContain(SECOND)
    // Retiring the item does not retire the source: the alias still recalls the same stored record.
    expect((yield* recall(sessionID, { reference: ref.id })).content).toBe(recalled.content)
    const archive = yield* Archive.Service
    const fragment = (yield* Effect.forEach(yield* archive.list(sessionID), (item) => archive.read({ sessionID, id: item.id })))
      .find((chunk) => chunk?.markdown.includes(NONCE))
    if (!fragment) throw new Error("Expected real retained fragment")
    yield* Effect.promise(() => Bun.write(archiveFile(sessionID, fragment.id), fragment.markdown + "CORRUPTED"))
    expect(Exit.isFailure(yield* archive.read({ sessionID, id: fragment.id }).pipe(Effect.exit))).toBe(true)
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
    yield* Effect.promise(() => Bun.write(archiveFile(sessionID, fragment.id), fragment.markdown))
    yield* complete(yield* begin(sessionID, "REPAIR_RETRY"), "REPAIR_REPLY", 100)
    const retry = yield* entered(repaired)
    expect(packet(retry.request)).toContain("## Current working memory\n\n(none)")
    expect(packet(retry.request)).toContain(NONCE)
    yield* Deferred.succeed(repaired.release, undefined)
    yield* terminal(retry.jobID, "completed", "applied")
  }).pipe(Effect.provide(environment([first, second, third, repaired])))
}), 30_000)

for (const damage of ["missing", "corrupt"] as const) it.instance(`a ${damage} archive fragment leaves memory and alias recall intact`, () => Effect.gen(function* () {
  const first = yield* held(FIRST, { reference: NONCE })
  yield* Effect.gen(function* () {
    const sessionID = yield* seed(B, A, RECEIPT)
    const hit = yield* entered(first)
    const ref = fragments(packet(hit.request)).find((entry) => entry.text.includes(NONCE))!
    const allowed = yield* applyFirst(sessionID, first)
    const archive = yield* Archive.Service
    for (const item of yield* archive.list(sessionID)) {
      if (damage === "missing") yield* Effect.promise(() => fs.unlink(archiveFile(sessionID, item.id)))
      if (damage === "corrupt") yield* Effect.promise(() => Bun.write(archiveFile(sessionID, item.id), "not the hashed content"))
    }
    // Aliases resolve from stored messages, so the memory never depends on archive fragments.
    expect(yield* prepare(sessionID)).toEqual(allowed)
    expect((yield* recall(sessionID, { reference: ref.id })).content).toContain(NONCE)
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
  const other = yield* held(FIRST)
  const rejected = yield* held(SECOND)
  yield* Effect.gen(function* () {
    const own = yield* seed(B, A, RECEIPT)
    yield* applyFirst(own, first)
    const foreign = yield* seed(B, A, RECEIPT, false)
    // The foreign session is maintained too (memory needs no recall); let its own pass finish first.
    yield* applyFirst(foreign, other)
    const sessions = yield* Session.Service
    const archive = yield* Archive.Service
    const refs = yield* archive.publish({ sessionID: foreign, messages: yield* sessions.messages({ sessionID: foreign }) })
    const selected = refs.find((ref) => ref.markdown.includes(NONCE))!
    expect((yield* recall(foreign, { reference: selected.id })).content).toContain(NONCE)
    const denied = yield* recall(own, { reference: selected.id }, { sessionID: foreign })
    expect(denied.status).toBe("unavailable")
    expect(denied.content).toBeUndefined()
    rejected.respond = (request) => {
      const value = body(request, SECOND)
      return JSON.stringify({ ...value, ops: value.ops.map((op) => op.op === "add" ? { ...op, src: [selected.id] } : op) })
    }
    yield* complete(yield* begin(own, "FOREIGN_REFERENCE_ATTEMPT"), "FOREIGN_REPLY", 50_000)
    const hit = yield* entered(rejected)
    const before = yield* prepare(own)
    yield* Deferred.succeed(rejected.release, undefined)
    yield* terminal(hit.jobID, "completed", "invalid-schema")
    expect(yield* prepare(own)).toEqual(before)
    expect(before.system[0]).not.toContain(selected.id)
  }).pipe(Effect.provide(environment([first, other, rejected])))
}), 30_000)
