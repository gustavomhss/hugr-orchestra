export * as ReviewPrecisionStore from "./precision-store"

import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { and, asc, eq, gt } from "drizzle-orm"
import { Cause, Effect, Exit, Schema } from "effect"
import { ReviewPrecisionEvent } from "@orchestra/schema/review-precision-event"
import { Database } from "../database/database"
import { EventV2 } from "../event"
import type { ReviewLedger } from "./ledger"

const decode = Schema.decodeUnknownSync(ReviewPrecisionEvent.Observed.data)

/** Host-only. Call after source-bound outcomes settle, never with model receipt items. */
export const append = Effect.fn("ReviewPrecisionStore.append")(function* (input: {
  readonly review: string
  readonly project: string
  readonly reads: ReadonlyArray<ReviewLedger.Read>
}) {
  const data = decode({ ledgerID: ReviewPrecisionEvent.Aggregate, ...input }, { onExcessProperty: "error" })
  const reads = new Map<string, typeof data.reads[number]>()
  for (const read of data.reads) {
    const identity = JSON.stringify([read.pack, read.rule, read.generation, read.fingerprint])
    const existing = reads.get(identity)
    if (existing && existing.outcome !== read.outcome) throw new Error("precision-conflict")
    reads.set(identity, read)
  }
  const wanted = {
    ...data,
    reads: [...reads.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map((entry) => entry[1]),
  }
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const id = eventID(data.review)
  // Reject a malformed/replayed aggregate rather than appending a new clean
  // batch beside unaccounted history, including a noncanonical id for this review.
  yield* history()
  const retained = yield* existing(database.db, id)
  if (retained) return requireEquivalent(retained, wanted)
  const published = yield* Effect.exit(events.publish(ReviewPrecisionEvent.Observed, wanted, { id }))
  if (Exit.isSuccess(published)) {
    if (!published.value.durable) throw new Error("precision-invalid")
    return batch(id, published.value.durable.seq, wanted)
  }
  const duplicate = published.cause.reasons.length === 1 && published.cause.reasons[0]
  if (!duplicate || !Cause.isDieReason(duplicate) || !(duplicate.defect instanceof EventV2.InvalidDurableEventError))
    return yield* Effect.failCause(published.cause)
  // Recover only the writer's identified duplicate-id refusal, not arbitrary
  // publication, projection or notification failures with a coincidental winner.
  const winner = yield* existing(database.db, id)
  if (winner && duplicate.defect.type === ReviewPrecisionEvent.Observed.type &&
      duplicate.defect.message === `Event ${id} already exists at aggregate ${ReviewPrecisionEvent.Aggregate} sequence ${winner.seq}`)
    return requireEquivalent(winner, wanted)
  return yield* Effect.failCause(published.cause)
})

/** Read the private global aggregate in pages; no legacy receipt is reinterpreted. */
export const history = Effect.fn("ReviewPrecisionStore.history")(function* () {
  const database = yield* Database.Service
  const batches: ReviewLedger.Batch[] = []
  let after = -1
  while (true) {
    // Do not filter by type: unknown events in this private aggregate are a
    // corrupt history, not rows that may be silently left out of the windows.
    const rows = yield* database.db.select().from(EventV2.EventTable).where(and(
      eq(EventV2.EventTable.aggregate_id, ReviewPrecisionEvent.Aggregate), gt(EventV2.EventTable.seq, after),
    )).orderBy(asc(EventV2.EventTable.seq)).limit(1001).all().pipe(Effect.orDie)
    for (const row of rows.slice(0, 1000)) {
      if (row.seq !== after + 1 || row.type !== EventV2.versionedType(ReviewPrecisionEvent.Observed.type, 1))
        throw new Error("precision-invalid")
      const data = decode(row.data, { onExcessProperty: "error" })
      if (row.id !== eventID(data.review)) throw new Error("precision-invalid")
      batches.push(batch(row.id, row.seq, data))
      after = row.seq
    }
    if (rows.length <= 1000) return batches
  }
})

const existing = Effect.fn("ReviewPrecisionStore.existing")(function* (db: Database.Interface["db"], id: EventV2.ID) {
  const row = yield* db.select().from(EventV2.EventTable).where(eq(EventV2.EventTable.id, id)).get().pipe(Effect.orDie)
  if (!row) return undefined
  if (row.aggregate_id !== ReviewPrecisionEvent.Aggregate ||
      row.type !== EventV2.versionedType(ReviewPrecisionEvent.Observed.type, 1)) throw new Error("precision-conflict")
  return { id: row.id, seq: row.seq, data: decode(row.data, { onExcessProperty: "error" }) }
})

function requireEquivalent(retained: { id: EventV2.ID; seq: number; data: typeof ReviewPrecisionEvent.Observed.data.Type },
  wanted: typeof ReviewPrecisionEvent.Observed.data.Type) {
  if (!isDeepStrictEqual(retained.data, wanted)) throw new Error("precision-conflict")
  return batch(retained.id, retained.seq, retained.data)
}

function batch(id: string, seq: number, data: typeof ReviewPrecisionEvent.Observed.data.Type): ReviewLedger.Batch {
  if (!Number.isSafeInteger(seq) || seq < 0 || !Number.isSafeInteger(seq + 1)) throw new Error("precision-invalid")
  return { id, project: data.project, order: seq + 1, reads: data.reads }
}

function eventID(review: string) {
  return EventV2.ID.make(`evt_review_precision_${createHash("sha256").update(review).digest("hex")}`)
}
