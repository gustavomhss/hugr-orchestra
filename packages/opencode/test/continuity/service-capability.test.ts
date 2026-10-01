import { expect } from "bun:test"
import { Deferred, Effect } from "effect"
import { Session } from "@/session/session"
import { it } from "../lib/effect"
import { bodyFromRequest, readSourceCatalogue, selectSource, wireInput } from "./fixtures"
import { A, B, begin, complete, entered, environment, held, prepare, seed, terminal } from "./service-fixture"

it.instance("allowed recall keeps ref-dependent prior during incremental regeneration", () => Effect.gen(function* () {
  const first = yield* held(A)
  const second = yield* held(B)
  first.respond = (request) => {
    const data = wireInput(request)
    const source = selectSource(readSourceCatalogue(data).units, "SEED_REPLY_0_027D")
    return JSON.stringify({ ...bodyFromRequest(data, A), reference_only: [{ source: source.id,
      purpose: "Historical proposal", retrieve_when: "Before adopting proposal" }] })
  }
  second.respond = (request) => {
    const data = wireInput(request)
    const catalogue = readSourceCatalogue(data)
    expect(catalogue.canRecall).toBe(true)
    expect(catalogue.previous).not.toBeNull()
    const source = catalogue.units.find((unit) => unit.origin === "prior" && unit.role === "assistant")
    if (!source) throw new Error("missing prior reference source")
    expect(source.value).toBeUndefined()
    expect(source.recoverable).toBe(true)
    return JSON.stringify({ ...bodyFromRequest(data, B), reference_only: [{ source: source.id,
      purpose: "Historical proposal", retrieve_when: "Before adopting proposal" }] })
  }
  yield* Effect.gen(function* () {
    const sessionID = yield* seed(B, A, undefined, true)
    const hit = yield* entered(first)
    yield* Deferred.succeed(first.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    yield* complete(yield* begin(sessionID, "ALLOWED_REFRESH"), "ALLOWED_REPLY", 50_000, true)
    const refresh = yield* entered(second)
    const catalogue = readSourceCatalogue(wireInput(refresh.request))
    expect(selectSource(catalogue.units, A).origin).toBe("prior")
    expect(selectSource(catalogue.units, B).origin).toBe("head")
    const sessions = yield* Session.Service
    const history = yield* sessions.messages({ sessionID })
    expect([...new Set(catalogue.units.filter((unit) => unit.origin === "head").map((unit) => unit.locator.messageID))])
      .toEqual(history.slice(4, 6).map((message) => message.info.id))
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(refresh.jobID, "completed", "applied")
    const prepared = yield* prepare(sessionID, true)
    expect(prepared.messages).toHaveLength(8)
    expect(prepared.system[0]).toContain(A)
    expect(prepared.system[0]).toContain(B)
    expect(prepared.system[0]).toContain('"retrieve_when":"Before adopting proposal"')
  }).pipe(Effect.provide(environment([first, second])))
}), 30_000)

it.instance("revoked recall regenerates raw prefix; rejected refs retain last valid artifact", () => Effect.gen(function* () {
  const first = yield* held(A)
  const rejected = yield* held(A)
  const exactOnly = yield* held(A)
  for (const plan of [first, rejected]) plan.respond = (request) => {
    const data = wireInput(request)
    const selected = selectSource(readSourceCatalogue(data).units, "SEED_REPLY_0_027D")
    expect(selected.role).toBe("assistant")
    return JSON.stringify({ ...bodyFromRequest(data, A), reference_only: [{ source: selected.id,
      purpose: "Historical proposal", retrieve_when: "Before adopting proposal" }] })
  }
  yield* Effect.gen(function* () {
    const sessionID = yield* seed(B, A, undefined, true)
    const hit = yield* entered(first)
    expect(readSourceCatalogue(wireInput(hit.request)).canRecall).toBe(true)
    yield* Deferred.succeed(first.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const allowed = yield* prepare(sessionID, true)
    expect(allowed.messages).toHaveLength(8)
    expect(allowed.system).toHaveLength(1)
    expect(allowed.system[0]).toContain('"retrieve_when":"Before adopting proposal"')
    const sessions = yield* Session.Service
    const history = yield* sessions.messages({ sessionID })
    expect(yield* prepare(sessionID)).toEqual({ messages: history, system: [] })
    expect(yield* prepare(sessionID, true)).toEqual(allowed)

    yield* complete(yield* begin(sessionID, "REVOKED_REFRESH"), "REVOKED_REPLY", 50_000, false)
    const refresh = yield* entered(rejected)
    const catalogue = readSourceCatalogue(wireInput(refresh.request))
    expect(catalogue.canRecall).toBe(false)
    expect(catalogue.previous).toBeNull()
    const current = yield* sessions.messages({ sessionID })
    expect([...new Set(catalogue.units.map((unit) => unit.locator.messageID))])
      .toEqual(current.slice(0, -8).map((message) => message.info.id))
    expect(selectSource(catalogue.units, A).origin).toBe("head")
    expect(selectSource(catalogue.units, "SEED_REPLY_0_027D").recoverable).toBe(false)
    yield* Deferred.succeed(rejected.release, undefined)
    yield* terminal(refresh.jobID, "completed", "discarded")
    expect(yield* prepare(sessionID, false)).toEqual({ messages: current, system: [] })
    expect((yield* prepare(sessionID, true)).system).toEqual(allowed.system)

    yield* complete(yield* begin(sessionID, "EXACT_REFRESH"), "EXACT_REPLY", 50_000, false)
    const exactHit = yield* entered(exactOnly)
    expect(readSourceCatalogue(wireInput(exactHit.request)).previous).toBeNull()
    yield* Deferred.succeed(exactOnly.release, undefined)
    yield* terminal(exactHit.jobID, "completed", "applied")
    const prepared = yield* prepare(sessionID, false)
    expect(prepared.messages).toHaveLength(8)
    expect(prepared.system).toHaveLength(1)
    expect(prepared.system[0]).toContain(A)
    expect(prepared.system[0]).not.toContain('"retrieve_when":"Before adopting proposal"')
  }).pipe(Effect.provide(environment([first, rejected, exactOnly])))
}), 30_000)
