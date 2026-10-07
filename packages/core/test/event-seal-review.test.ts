import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { eq, sql, type SQLWrapper } from "drizzle-orm"
import { EventV2 } from "@opencode-ai/core/event"
import { EventSeal } from "@opencode-ai/core/event/seal"
import { EventSequenceTable, EventTable } from "@opencode-ai/core/event/sql"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node])))
const Message = EventV2.define({
  type: "test.seal-review",
  durable: { version: 1, aggregate: "aggregateID" },
  schema: { aggregateID: Schema.String, value: Schema.String },
})

it.live("raw TEXT and BLOB NUL corruption is malformed in window and predecessor", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const cases = [
      { kind: "text", bytes: 71, value: (column: SQLWrapper) => sql`${column} || char(0) || 'hidden'` },
      { kind: "blob", bytes: 64, value: (column: SQLWrapper) => sql`cast(${column} as blob)` },
      { kind: "blob", bytes: 71, value: (column: SQLWrapper) => sql`cast(${column} || char(0) || 'hidden' as blob)` },
      { kind: "text", bytes: 64, value: (column: SQLWrapper) => sql`substr(${column}, 1, 63) || char(0)` },
    ]
    yield* Effect.forEach(["seal_prev", "seal_hash"] as const, (field) =>
      Effect.forEach(cases, (test) =>
        Effect.gen(function* () {
          const aggregateID = EventV2.ID.create()
          const first = yield* events.publish(Message, { aggregateID, value: "before" })
          yield* events.publish(Message, { aggregateID, value: "after" })
          expect((yield* events.verifySealWindow({ aggregateID, fromSeq: 0, toSeq: 0 })).status).toBe("VERIFIED_WINDOW")
          expect((yield* events.verifySealWindow({ aggregateID, fromSeq: 1, toSeq: 1 })).status).toBe("VERIFIED_WINDOW")
          yield* database.db.run(
            sql`UPDATE event SET ${sql.identifier(field)} = ${test.value(EventTable[field])} WHERE id = ${first.id}`,
          )
          expect(
            yield* database.db.get(
              sql`SELECT typeof(${EventTable[field]}) AS kind, length(cast(${EventTable[field]} as blob)) AS bytes FROM event WHERE id = ${first.id}`,
            ),
          ).toEqual({ kind: test.kind, bytes: test.bytes })
          const window = yield* events.verifySealWindow({ aggregateID, fromSeq: 0, toSeq: 0 })
          const predecessor = yield* events.verifySealWindow({ aggregateID, fromSeq: 1, toSeq: 1 })
          expect(window.status).toBe("BROKEN")
          expect(window.reasons).toContain("MALFORMED_SEAL")
          expect(predecessor.status).toBe("BROKEN")
          expect(predecessor.reasons).toContain("MALFORMED_SEAL")
        }),
      ),
    )
  }),
)

it.live("indexed retained tail exposes lowered high-water outside requested window", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    yield* events.publish(Message, { aggregateID, value: "zero" })
    yield* events.publish(Message, { aggregateID, value: "one" })
    const input = { aggregateID, fromSeq: 0, toSeq: 0 }
    expect(yield* events.verifySealWindow(input)).toMatchObject({
      status: "VERIFIED_WINDOW",
      historyComplete: false,
      reasons: ["TAIL_OUTSIDE_WINDOW"],
    })
    yield* database.db
      .update(EventSequenceTable)
      .set({ seq: 0 })
      .where(eq(EventSequenceTable.aggregate_id, aggregateID))
      .run()
    expect(yield* database.db.get(sql`SELECT max(seq) AS tail FROM event WHERE aggregate_id = ${aggregateID}`)).toEqual(
      { tail: 1 },
    )
    const report = yield* events.verifySealWindow(input)
    expect(report).toMatchObject({
      status: "BROKEN",
      rows: 1,
      headSeq: 0,
      rangeComplete: true,
      historyComplete: false,
      reasons: ["HEAD_SEQUENCE_MISMATCH", "TAIL_OUTSIDE_WINDOW"],
    })
    yield* database.db.run(
      sql`INSERT INTO data_migration(name, time_completed) VALUES ('event_snapshot_compaction', 1)`,
    )
    expect((yield* events.verifySealWindow(input)).status).toBe("BROKEN")
    expect(
      yield* database.db
        .select({ seq: EventSequenceTable.seq })
        .from(EventSequenceTable)
        .where(eq(EventSequenceTable.aggregate_id, aggregateID))
        .get(),
    ).toEqual({ seq: 0 })
  }),
)

it.live("fractional SQLite quota preflight visits at most 2049 actual rows before aggregation", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    yield* database.db.insert(EventSequenceTable).values({ aggregate_id: aggregateID, seq: 1 }).run()
    yield* database.db.run(sql`WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x + 1 FROM n WHERE x < 4095)
    INSERT INTO event(id, aggregate_id, seq, type, data)
    SELECT 'fraction-' || x, ${aggregateID}, x / 4096.0, 'unfiltered.real.1', '{}' FROM n`)
    expect(
      yield* database.db.get(
        sql`SELECT count(*) AS rows FROM event WHERE aggregate_id = ${aggregateID} AND seq BETWEEN 0 AND 1`,
      ),
    ).toEqual({ rows: 4096 })
    const input = { aggregateID, fromSeq: 0, toSeq: 1 }
    const size = yield* database.db.transaction((tx) => EventSeal.windowSize(tx, input))
    expect(size?.rows).toBe(2049)
    const report = yield* events.verifySealWindow(input).pipe(Effect.result)
    expect(report._tag).toBe("Failure")
    if (report._tag === "Failure") expect(report.failure.code).toBe("OVERFLOW")
  }),
)

it.live("fractional row below quota is BROKEN even with known compaction and integer tail", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    yield* database.db.insert(EventSequenceTable).values({ aggregate_id: aggregateID, seq: 1 }).run()
    yield* database.db.run(sql`INSERT INTO event(id, aggregate_id, seq, type, data) VALUES
    ('real-zero', ${aggregateID}, 0, 'unfiltered.real.1', '{}'),
    ('real-half', ${aggregateID}, 0.5, 'unfiltered.real.1', '{}'),
    ('real-one', ${aggregateID}, 1, 'unfiltered.real.1', '{}')`)
    yield* database.db.run(
      sql`INSERT INTO data_migration(name, time_completed) VALUES ('event_snapshot_compaction', 1)`,
    )
    const report = yield* events.verifySealWindow({ aggregateID, fromSeq: 0, toSeq: 1 })
    expect(report.status).toBe("BROKEN")
    expect(report.reasons).toContain("MISSING_EVENT")
  }),
)

it.live(
  "canonical-only byte expansion triggers OVERFLOW below raw SQLite byte cap",
  () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const database = yield* Database.Service
      const aggregateID = EventV2.ID.create()
      const id = EventV2.ID.create()
      const cap = 8 * 1024 * 1024
      const empty = {
        id,
        aggregate_id: aggregateID,
        seq: 0,
        type: "test.seal-review.1",
        data: { aggregateID, value: "" },
      }
      const value = "x".repeat(cap + 1 - Buffer.byteLength(JSON.stringify(empty), "utf8"))
      yield* events.publish(Message, { aggregateID, value }, { id })
      const row = yield* database.db.select().from(EventTable).where(eq(EventTable.id, id)).get()
      expect(row).toBeDefined()
      if (!row) throw new Error("Expected actual persisted canonical-only fixture")
      expect(Buffer.byteLength(EventSeal.canonicalRow(row), "utf8")).toBe(cap + 1)
      const input = { aggregateID, fromSeq: 0, toSeq: 0 }
      const size = yield* database.db.transaction((tx) => EventSeal.windowSize(tx, input))
      expect(size?.rows).toBe(1)
      expect(size?.bytes).toBeLessThan(cap)
      const report = yield* events.verifySealWindow(input).pipe(Effect.result)
      expect(report._tag).toBe("Failure")
      if (report._tag === "Failure") {
        expect(report.failure.code).toBe("OVERFLOW")
        expect(report.failure.message).toBe("Canonical seal window exceeds 8 MiB")
      }
    }),
  60000,
)
