import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { asc, eq } from "drizzle-orm"
import { EventV2 } from "@orchestra/core/event"
import { EventSeal } from "@orchestra/core/event/seal"
import { EventSequenceTable, EventTable } from "@orchestra/core/event/sql"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node])))
const First = EventV2.define({
  type: "test.seal-first",
  durable: { version: 1, aggregate: "aggregateID" },
  schema: { aggregateID: Schema.String, value: Schema.String },
})
const Other = EventV2.define({
  type: "test.seal-other",
  durable: { version: 2, aggregate: "aggregateID" },
  schema: { aggregateID: Schema.String, value: Schema.String },
})
const seed = Effect.gen(function* () {
  const events = yield* EventV2.Service
  const database = yield* Database.Service
  const aggregateID = EventV2.ID.create()
  yield* events.publish(First, { aggregateID, value: "zero" })
  yield* events.publish(Other, { aggregateID, value: "one" })
  yield* events.publish(First, { aggregateID, value: "two" })
  const rows = yield* database.db
    .select()
    .from(EventTable)
    .where(eq(EventTable.aggregate_id, aggregateID))
    .orderBy(asc(EventTable.seq))
    .all()
  return { events, database, aggregateID, rows, input: { aggregateID, fromSeq: 0, toSeq: 2 } }
})

it.live("verifies every actual event type and exact locally retained anchors/tip", () =>
  Effect.gen(function* () {
    const f = yield* seed
    const report = yield* f.events.verifySealWindow(f.input)
    expect(report).toEqual({
      status: "VERIFIED_WINDOW",
      algorithm: "sha256-native-event-v1",
      ...f.input,
      rows: 3,
      headSeq: 2,
      previousHash: EventSeal.GENESIS,
      tipHash: f.rows[2].seal_hash,
      anchor: "genesis",
      rangeComplete: true,
      historyComplete: true,
      reasons: [],
    })
    expect(
      (yield* f.events.verifySealWindow({
        ...f.input,
        expectedPreviousHash: EventSeal.GENESIS,
        expectedTipHash: f.rows[2].seal_hash ?? undefined,
      })).anchor,
    ).toBe("caller")
    expect((yield* f.events.verifySealWindow({ ...f.input, expectedPreviousHash: "1".repeat(64) })).reasons).toContain(
      "EXPECTED_ANCHOR_MISMATCH",
    )
    expect((yield* f.events.verifySealWindow({ ...f.input, expectedTipHash: "1".repeat(64) })).reasons).toContain(
      "EXPECTED_TIP_MISMATCH",
    )
  }),
)

it.live("bounded prefix/tail coverage never certifies history outside window", () =>
  Effect.gen(function* () {
    const f = yield* seed
    const report = yield* f.events.verifySealWindow({ aggregateID: f.aggregateID, fromSeq: 1, toSeq: 1 })
    expect(report).toMatchObject({
      status: "VERIFIED_WINDOW",
      rows: 1,
      headSeq: 2,
      anchor: "stored-predecessor",
      rangeComplete: true,
      historyComplete: false,
      previousHash: f.rows[0].seal_hash,
      tipHash: f.rows[1].seal_hash,
    })
    expect(report.reasons).toEqual(["PREFIX_OUTSIDE_WINDOW", "TAIL_OUTSIDE_WINDOW"])
  }),
)

it.live("edited content is BROKEN even with same expected tip; restored content verifies", () =>
  Effect.gen(function* () {
    const f = yield* seed
    const input = { ...f.input, expectedTipHash: f.rows[2].seal_hash ?? undefined }
    yield* f.database.db
      .update(EventTable)
      .set({ data: { ...f.rows[1].data, value: "edited" } })
      .where(eq(EventTable.id, f.rows[1].id))
      .run()
    expect(yield* f.events.verifySealWindow(input)).toMatchObject({
      status: "BROKEN",
      historyComplete: false,
      tipHash: f.rows[2].seal_hash,
    })
    expect((yield* f.events.verifySealWindow(input)).reasons).toContain("HASH_MISMATCH")
    yield* f.database.db.update(EventTable).set({ data: f.rows[1].data }).where(eq(EventTable.id, f.rows[1].id)).run()
    expect((yield* f.events.verifySealWindow(input)).status).toBe("VERIFIED_WINDOW")
  }),
)

it.live("rehashed wrong previous link is BROKEN independently of content hashing", () =>
  Effect.gen(function* () {
    const f = yield* seed
    yield* f.database.db
      .update(EventTable)
      .set(EventSeal.sealRow(f.rows[1]))
      .where(eq(EventTable.id, f.rows[1].id))
      .run()
    const report = yield* f.events.verifySealWindow(f.input)
    expect(report.status).toBe("BROKEN")
    expect(report.reasons).toContain("LINK_MISMATCH")
    expect(report.reasons).not.toContain("HASH_MISMATCH")
  }),
)

it.live("partial or malformed metadata is BROKEN; all-null history remains UNKNOWN", () =>
  Effect.gen(function* () {
    const f = yield* seed
    yield* f.database.db.update(EventTable).set({ seal_prev: null }).where(eq(EventTable.id, f.rows[1].id)).run()
    expect(yield* f.events.verifySealWindow(f.input)).toMatchObject({ status: "BROKEN", reasons: ["MALFORMED_SEAL"] })
    yield* f.database.db
      .update(EventTable)
      .set({ seal_version: null, seal_prev: null, seal_hash: null })
      .where(eq(EventTable.aggregate_id, f.aggregateID))
      .run()
    expect(yield* f.events.verifySealWindow(f.input)).toMatchObject({
      status: "UNKNOWN",
      rangeComplete: true,
      historyComplete: false,
      reasons: ["UNSEALED_HISTORY"],
    })
    yield* f.events.publish(First, { aggregateID: f.aggregateID, value: "unanchored suffix" })
    expect(yield* f.events.verifySealWindow({ aggregateID: f.aggregateID, fromSeq: 3, toSeq: 3 })).toMatchObject({
      status: "UNKNOWN",
      previousHash: EventSeal.GENESIS,
      anchor: "historical-unknown",
      historyComplete: false,
      reasons: ["PREFIX_OUTSIDE_WINDOW", "UNSEALED_HISTORY"],
    })
  }),
)

it.live("removed middle row is BROKEN even when retained expected tip still matches", () =>
  Effect.gen(function* () {
    const f = yield* seed
    yield* f.database.db.delete(EventTable).where(eq(EventTable.id, f.rows[1].id)).run()
    expect(
      yield* f.events.verifySealWindow({ ...f.input, expectedTipHash: f.rows[2].seal_hash ?? undefined }),
    ).toMatchObject({ status: "BROKEN", rangeComplete: false, historyComplete: false, reasons: ["MISSING_EVENT"] })
  }),
)

it.live("sequence-only gap with valid recomputed hashes and links stays BROKEN", () =>
  Effect.gen(function* () {
    const f = yield* seed
    yield* f.database.db.delete(EventTable).where(eq(EventTable.id, f.rows[1].id)).run()
    const sealed = EventSeal.sealRow(f.rows[2], f.rows[0])
    yield* f.database.db.update(EventTable).set(sealed).where(eq(EventTable.id, f.rows[2].id)).run()
    const report = yield* f.events.verifySealWindow({ ...f.input, expectedTipHash: sealed.seal_hash })
    expect(report.status).toBe("BROKEN")
    expect(report.reasons).toEqual(["MISSING_EVENT"])
    expect(report.tipHash).toBe(sealed.seal_hash)
  }),
)

it.live("real snapshot compaction leaves physical middle gap UNKNOWN, retained corruption BROKEN", () =>
  Effect.gen(function* () {
    const f = yield* seed
    const one = { ...f.rows[1], type: "message.updated.1", data: { info: { id: "same-message", text: "one" } } }
    const firstSeal = EventSeal.sealRow(one, f.rows[0])
    const two = { ...f.rows[2], type: "message.updated.1", data: { info: { id: "same-message", text: "two" } } }
    yield* f.database.db
      .update(EventTable)
      .set({ type: one.type, data: one.data, ...firstSeal })
      .where(eq(EventTable.id, one.id))
      .run()
    yield* f.database.db
      .update(EventTable)
      .set({ type: two.type, data: two.data, ...EventSeal.sealRow(two, firstSeal) })
      .where(eq(EventTable.id, two.id))
      .run()
    expect((yield* EventV2.compactSnapshotEvents(f.database.db)).removed).toBe(1)
    expect(yield* f.database.db.select().from(EventTable).where(eq(EventTable.id, one.id)).get()).toBeUndefined()
    expect(yield* f.events.verifySealWindow(f.input)).toMatchObject({
      status: "UNKNOWN",
      rows: 2,
      rangeComplete: false,
      historyComplete: false,
      reasons: ["COMPACTED_HISTORY", "MISSING_EVENT"],
    })
    yield* f.database.db
      .update(EventTable)
      .set({ data: { info: { id: "same-message", text: "changed" } } })
      .where(eq(EventTable.id, two.id))
      .run()
    expect((yield* f.events.verifySealWindow(f.input)).status).toBe("BROKEN")
    expect((yield* f.events.verifySealWindow(f.input)).reasons).toContain("HASH_MISMATCH")
  }),
)

it.live("empty acquisition is UNKNOWN, recorded missing tail is BROKEN", () =>
  Effect.gen(function* () {
    const f = yield* seed
    expect(yield* f.events.verifySealWindow({ aggregateID: EventV2.ID.create(), fromSeq: 0, toSeq: 0 })).toMatchObject({
      status: "UNKNOWN",
      rows: 0,
      headSeq: null,
      historyComplete: false,
    })
    yield* f.database.db.delete(EventTable).where(eq(EventTable.id, f.rows[2].id)).run()
    expect(yield* f.events.verifySealWindow(f.input)).toMatchObject({
      status: "BROKEN",
      headSeq: 2,
      historyComplete: false,
    })
  }),
)

it.live("tampered sequence high-water is BROKEN and never returns invalid result shape", () =>
  Effect.gen(function* () {
    const f = yield* seed
    yield* f.database.db
      .update(EventSequenceTable)
      .set({ seq: 1 })
      .where(eq(EventSequenceTable.aggregate_id, f.aggregateID))
      .run()
    expect((yield* f.events.verifySealWindow(f.input)).status).toBe("BROKEN")
    yield* f.database.db
      .update(EventSequenceTable)
      .set({ seq: -1 })
      .where(eq(EventSequenceTable.aggregate_id, f.aggregateID))
      .run()
    expect(yield* f.events.verifySealWindow(f.input)).toMatchObject({
      status: "BROKEN",
      headSeq: null,
      historyComplete: false,
      reasons: ["MISSING_EVENT"],
    })
  }),
)
