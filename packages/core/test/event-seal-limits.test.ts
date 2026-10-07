import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { eq, sql } from "drizzle-orm"
import { EventV2 } from "@opencode-ai/core/event"
import { EventSeal } from "@opencode-ai/core/event/seal"
import { EventSequenceTable, EventTable } from "@opencode-ai/core/event/sql"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node])))
const Large = EventV2.define({
  type: "test.seal-large",
  durable: { version: 1, aggregate: "aggregateID" },
  schema: { aggregateID: Schema.String, value: Schema.String },
})

it.live("invalid windows and anchors produce named INVALID_WINDOW errors", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const valid = { aggregateID: "limit-invalid", fromSeq: 0, toSeq: 0 }
    yield* Effect.forEach(
      [
        { ...valid, fromSeq: -1 },
        { ...valid, toSeq: 0.5 },
        { ...valid, toSeq: NaN },
        { ...valid, toSeq: Number.MAX_SAFE_INTEGER + 1 },
        { ...valid, fromSeq: 1 },
        { ...valid, aggregateID: "" },
        { ...valid, expectedPreviousHash: "bad" },
        { ...valid, expectedTipHash: "bad" },
      ],
      (input) =>
        events.verifySealWindow(input).pipe(
          Effect.result,
          Effect.map((result) => {
            expect(result._tag).toBe("Failure")
            if (result._tag === "Failure") expect(result.failure.code).toBe("INVALID_WINDOW")
          }),
        ),
    )
  }),
)

it.live("2048-row SQLite window verifies; oversized request returns OVERFLOW", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    const rows: Array<typeof EventTable.$inferSelect> = []
    Array.from({ length: 2048 }, (_, seq) => seq).forEach((seq) => {
      const row = { id: EventV2.ID.create(), aggregate_id: aggregateID, seq, type: "unfiltered.limit.1", data: { seq } }
      rows.push({ ...row, ...EventSeal.sealRow(row, rows.at(-1)) })
    })
    yield* database.db.insert(EventSequenceTable).values({ aggregate_id: aggregateID, seq: 2047 }).run()
    yield* database.db.insert(EventTable).values(rows).run()
    expect(yield* events.verifySealWindow({ aggregateID, fromSeq: 0, toSeq: 2047 })).toMatchObject({
      status: "VERIFIED_WINDOW",
      rows: 2048,
      historyComplete: true,
    })
    const overflow = yield* events.verifySealWindow({ aggregateID, fromSeq: 0, toSeq: 2048 }).pipe(Effect.result)
    expect(overflow._tag).toBe("Failure")
    if (overflow._tag === "Failure") expect(overflow.failure.code).toBe("OVERFLOW")
  }),
)

it.live(
  "8 MiB canonical window verifies; extra bytes overflow without rejecting normal writes",
  () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const database = yield* Database.Service
      const aggregateID = EventV2.ID.create()
      const id = EventV2.ID.create()
      const empty = {
        id,
        aggregate_id: aggregateID,
        seq: 0,
        type: "test.seal-large.1",
        data: { aggregateID, value: "" },
      }
      const value = "x".repeat(8 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(empty), "utf8"))
      yield* events.publish(Large, { aggregateID, value }, { id })
      expect((yield* events.verifySealWindow({ aggregateID, fromSeq: 0, toSeq: 0 })).status).toBe("VERIFIED_WINDOW")
      yield* events.publish(Large, { aggregateID, value: "extra bytes" })
      const overflow = yield* events.verifySealWindow({ aggregateID, fromSeq: 0, toSeq: 1 }).pipe(Effect.result)
      expect(overflow._tag).toBe("Failure")
      if (overflow._tag === "Failure") expect(overflow.failure.code).toBe("OVERFLOW")
      const huge = yield* events.publish(Large, { aggregateID, value: "é".repeat(5 * 1024 * 1024) })
      expect(
        yield* database.db
          .select({ seal: EventTable.seal_hash })
          .from(EventTable)
          .where(eq(EventTable.id, huge.id))
          .get(),
      ).toMatchObject({ seal: expect.stringMatching(/^[a-f0-9]{64}$/) })
      const utf8 = yield* events.verifySealWindow({ aggregateID, fromSeq: 2, toSeq: 2 }).pipe(Effect.result)
      expect(utf8._tag).toBe("Failure")
      if (utf8._tag === "Failure") expect(utf8.failure.code).toBe("OVERFLOW")
    }),
  30000,
)

it.live("real SQLite acquisition failure produces named ACQUISITION_FAILED, never green", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    yield* database.db.run(sql`DROP TABLE event`)
    const result = yield* events
      .verifySealWindow({ aggregateID: "read-failure", fromSeq: 0, toSeq: 0 })
      .pipe(Effect.result)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.code).toBe("ACQUISITION_FAILED")
  }),
)

it.live("oversized malformed seal metadata is BROKEN in window and predecessor", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    const first = yield* events.publish(Large, { aggregateID, value: "small payload" })
    yield* events.publish(Large, { aggregateID, value: "next" })
    yield* database.db
      .update(EventTable)
      .set({ seal_hash: "z".repeat(9 * 1024 * 1024) })
      .where(eq(EventTable.id, first.id))
      .run()
    expect(yield* events.verifySealWindow({ aggregateID, fromSeq: 0, toSeq: 0 })).toMatchObject({
      status: "BROKEN",
      reasons: ["MALFORMED_SEAL", "TAIL_OUTSIDE_WINDOW"],
    })
    expect(yield* events.verifySealWindow({ aggregateID, fromSeq: 1, toSeq: 1 })).toMatchObject({
      status: "BROKEN",
      reasons: ["MALFORMED_SEAL", "PREFIX_OUTSIDE_WINDOW"],
    })
  }),
)
