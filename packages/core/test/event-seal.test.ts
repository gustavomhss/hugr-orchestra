import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { Effect, Exit, Schema } from "effect"
import { asc, eq, sql } from "drizzle-orm"
import { EventV2 } from "@opencode-ai/core/event"
import { EventSeal } from "@opencode-ai/core/event/seal"
import { EventSequenceTable, EventTable } from "@opencode-ai/core/event/sql"
import { Database } from "@opencode-ai/core/database/database"
import { DatabaseMigration } from "@opencode-ai/core/database/migration"
import eventSeals from "../src/database/migration/20261002195730_event_seals"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Session } from "@opencode-ai/schema/session"
import { SessionV1 } from "@opencode-ai/schema/session-v1"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node])))
const Message = EventV2.define({
  type: "test.sealed-row",
  durable: { version: 1, aggregate: "aggregateID" },
  schema: { aggregateID: Schema.String, value: Schema.Unknown },
})

it.live("seals actual encoded rows using canonical JSON and links the previous row", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    const first = yield* events.publish(Message, { aggregateID, value: { z: undefined, a: [2, { b: 1, a: 0 }] } })
    yield* events.publish(Message, { aggregateID, value: "second" })
    const rows = yield* database.db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, aggregateID))
      .orderBy(asc(EventTable.seq))
      .all()
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.seq)).toEqual([0, 1])
    const canonical = `{"aggregate_id":${JSON.stringify(aggregateID)},"data":{"aggregateID":${JSON.stringify(aggregateID)},"value":{"a":[2,{"a":0,"b":1}]}},"id":${JSON.stringify(first.id)},"seq":0,"type":"test.sealed-row.1"}`
    expect(rows[0].seal_hash).toBe(
      createHash("sha256")
        .update(`opencode:event-seal:v1\n${"0".repeat(64)}\n${canonical}`)
        .digest("hex"),
    )
    expect(rows[0].seal_version).toBe(1)
    expect(rows[0].seal_prev).toBe("0".repeat(64))
    expect(rows[1].seal_prev).toBe(rows[0].seal_hash)
    expect(rows[1].seal_hash).not.toBe(rows[0].seal_hash)
  }),
)

it.live("new replay gets local seals; exact retry preserves all existing metadata", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = Session.ID.create()
    const data = { sessionID: aggregateID, messageID: SessionV1.MessageID.ascending() }
    const published = yield* events.publish(SessionV1.Event.MessageRemoved, data)
    const original = yield* database.db.select().from(EventTable).where(eq(EventTable.id, published.id)).get()
    const retry = { id: published.id, aggregateID, seq: 0, type: "message.removed.1", data }
    yield* events.replay(retry)
    expect(yield* database.db.select().from(EventTable).where(eq(EventTable.id, published.id)).get()).toEqual(original)
    yield* events.replay({ ...retry, id: EventV2.ID.create(), seq: 1 })
    const rows = yield* database.db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, aggregateID))
      .orderBy(asc(EventTable.seq))
      .all()
    expect(rows[1].seal_prev).toBe(rows[0].seal_hash)
    expect(rows[1].seal_hash).toMatch(/^[a-f0-9]{64}$/)
    // Historical exact replay remains unknown, rather than rewriting old evidence.
    yield* database.db
      .update(EventTable)
      .set({ seal_version: null, seal_prev: null, seal_hash: null })
      .where(eq(EventTable.id, published.id))
      .run()
    yield* events.replay(retry)
    expect(
      yield* database.db
        .select({ seal: EventTable.seal_hash })
        .from(EventTable)
        .where(eq(EventTable.id, published.id))
        .get(),
    ).toEqual({ seal: null })
  }),
)

it.live("deep valid JSON remains admissible and receives its exact canonical seal", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    const source = "[".repeat(4000) + "0" + "]".repeat(4000)
    const value = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(source)
    const published = yield* events.publish(Message, { aggregateID, value })
    const row = yield* database.db.select().from(EventTable).where(eq(EventTable.id, published.id)).get()
    expect(JSON.stringify(row?.data.value)).toBe(source)
    const canonical = `{"aggregate_id":${JSON.stringify(aggregateID)},"data":{"aggregateID":${JSON.stringify(aggregateID)},"value":${source}},"id":${JSON.stringify(published.id)},"seq":0,"type":"test.sealed-row.1"}`
    expect(row?.seal_hash).toBe(
      createHash("sha256").update(`opencode:event-seal:v1\n${EventSeal.GENESIS}\n${canonical}`).digest("hex"),
    )
  }),
)

it.live("seals the exact stored JSON when nested toJSON changes on each invocation", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    const calls: number[] = []
    const published = yield* events.publish(Message, {
      aggregateID,
      value: {
        toJSON() {
          calls.push(1)
          return { tick: calls.length }
        },
      },
    })
    const row = yield* database.db.select().from(EventTable).where(eq(EventTable.id, published.id)).get()
    expect(row?.data.value).toEqual({ tick: 1 })
    expect(calls).toHaveLength(1)
    const canonical = `{"aggregate_id":${JSON.stringify(aggregateID)},"data":{"aggregateID":${JSON.stringify(aggregateID)},"value":{"tick":1}},"id":${JSON.stringify(published.id)},"seq":0,"type":"test.sealed-row.1"}`
    expect(row?.seal_hash).toBe(
      createHash("sha256").update(`opencode:event-seal:v1\n${EventSeal.GENESIS}\n${canonical}`).digest("hex"),
    )
  }),
)

it.live("failed local commit rolls back row, seal and sequence before another append", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    yield* events.publish(Message, { aggregateID, value: "before" })
    const failed = yield* events
      .publish(Message, { aggregateID, value: "rollback" }, { commit: () => Effect.die("rollback-probe") })
      .pipe(Effect.exit)
    expect(Exit.isFailure(failed)).toBe(true)
    expect(
      yield* database.db
        .select({ seq: EventSequenceTable.seq })
        .from(EventSequenceTable)
        .where(eq(EventSequenceTable.aggregate_id, aggregateID))
        .get(),
    ).toEqual({ seq: 0 })
    yield* events.publish(Message, { aggregateID, value: "after" })
    const rows = yield* database.db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, aggregateID))
      .orderBy(asc(EventTable.seq))
      .all()
    expect(rows.map((row) => row.data.value)).toEqual(["before", "after"])
    expect(rows[1].seq).toBe(1)
    expect(rows[1].seal_prev).toBe(rows[0].seal_hash)
  }),
)

it.live("concurrent same-aggregate appends keep contiguous sequence and seal links", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    yield* Effect.forEach(
      Array.from({ length: 8 }, (_, value) => value),
      (value) => events.publish(Message, { aggregateID, value }),
      { concurrency: 8 },
    )
    const rows = yield* database.db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, aggregateID))
      .orderBy(asc(EventTable.seq))
      .all()
    expect(rows.map((row) => row.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    rows.forEach((row, index) => expect(row.seal_prev).toBe(index ? rows[index - 1].seal_hash : EventSeal.GENESIS))
  }),
)

it.live("SQLite failure after sealed insert rolls back both sequence and row", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    yield* events.publish(Message, { aggregateID, value: "before" })
    yield* database.db.run(
      sql.raw(
        "CREATE TRIGGER seal_abort AFTER INSERT ON event WHEN json_extract(NEW.data, '$.value') = 'abort-after-seal' BEGIN SELECT RAISE(ABORT, 'seal insert probe'); END",
      ),
    )
    const failed = yield* events.publish(Message, { aggregateID, value: "abort-after-seal" }).pipe(Effect.exit)
    expect(Exit.isFailure(failed)).toBe(true)
    expect(
      yield* database.db
        .select({ seq: EventSequenceTable.seq })
        .from(EventSequenceTable)
        .where(eq(EventSequenceTable.aggregate_id, aggregateID))
        .get(),
    ).toEqual({ seq: 0 })
    yield* events.publish(Message, { aggregateID, value: "after" })
    const rows = yield* database.db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, aggregateID))
      .orderBy(asc(EventTable.seq))
      .all()
    expect(rows.map((row) => row.data.value)).toEqual(["before", "after"])
    expect(rows[1].seq).toBe(1)
    expect(rows[1].seal_prev).toBe(rows[0].seal_hash)
  }),
)

it.live("persist false writes no durable row or seal and does not advance chain", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    yield* events.publish(Message, { aggregateID, value: "before" })
    const ephemeral = yield* events.publish(Message, { aggregateID, value: "local" }, { persist: false })
    expect(ephemeral.durable).toBeUndefined()
    expect(yield* database.db.select().from(EventTable).where(eq(EventTable.id, ephemeral.id)).get()).toBeUndefined()
    yield* events.publish(Message, { aggregateID, value: "after" })
    const rows = yield* database.db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, aggregateID))
      .orderBy(asc(EventTable.seq))
      .all()
    expect(rows).toHaveLength(2)
    expect(rows[1].seq).toBe(1)
    expect(rows[1].seal_prev).toBe(rows[0].seal_hash)
  }),
)

it.live("all-null historical rows stay null and new suffix uses unanchored genesis", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    yield* database.db.insert(EventSequenceTable).values({ aggregate_id: aggregateID, seq: 0 }).run()
    yield* database.db
      .insert(EventTable)
      .values({ id: EventV2.ID.create(), aggregate_id: aggregateID, seq: 0, type: "historical.any.1", data: {} })
      .run()
    yield* events.publish(Message, { aggregateID, value: "native" })
    const rows = yield* database.db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, aggregateID))
      .orderBy(asc(EventTable.seq))
      .all()
    expect([rows[0].seal_version, rows[0].seal_prev, rows[0].seal_hash]).toEqual([null, null, null])
    expect(rows[1].seal_prev).toBe(EventSeal.GENESIS)
    expect(rows[1].seal_hash).toMatch(/^[a-f0-9]{64}$/)
  }),
)

it.live("generated migration upgrades old SQLite columns and journal once without backfill", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const aggregateID = EventV2.ID.create()
    yield* database.db.insert(EventSequenceTable).values({ aggregate_id: aggregateID, seq: 0 }).run()
    yield* database.db
      .insert(EventTable)
      .values({ id: EventV2.ID.create(), aggregate_id: aggregateID, seq: 0, type: "historical.upgrade.1", data: {} })
      .run()
    yield* database.db.run(sql`ALTER TABLE event DROP COLUMN seal_version`)
    yield* database.db.run(sql`ALTER TABLE event DROP COLUMN seal_prev`)
    yield* database.db.run(sql`ALTER TABLE event DROP COLUMN seal_hash`)
    yield* database.db.run(sql`DELETE FROM migration WHERE id = ${eventSeals.id}`)
    yield* DatabaseMigration.applyOnly(database.db, [eventSeals])
    yield* DatabaseMigration.applyOnly(database.db, [eventSeals])
    expect(
      yield* database.db
        .select({ version: EventTable.seal_version, prev: EventTable.seal_prev, hash: EventTable.seal_hash })
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, aggregateID))
        .get(),
    ).toEqual({ version: null, prev: null, hash: null })
    expect(yield* database.db.all(sql`SELECT id FROM migration WHERE id = ${eventSeals.id}`)).toEqual([
      { id: eventSeals.id },
    ])
    yield* events.publish(Message, { aggregateID, value: "after upgrade" })
    const native = yield* database.db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, aggregateID))
      .orderBy(asc(EventTable.seq))
      .all()
    expect(native[1].seal_prev).toBe(EventSeal.GENESIS)
    expect(native[1].seal_hash).toMatch(/^[a-f0-9]{64}$/)
  }),
)
