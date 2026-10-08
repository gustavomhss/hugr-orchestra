import { describe, expect } from "bun:test"
import { Deferred, Effect, Layer, Schema, Stream } from "effect"
import { asc, eq, sql } from "drizzle-orm"
import path from "node:path"
import { Durable } from "@orchestra/schema/durable-event-manifest"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { MessageTable, PartTable } from "@orchestra/core/session/sql"
import { PromptAdmission } from "@orchestra/core/v1/prompt-admission"
import { PromptAdmissionTable } from "@orchestra/core/v1/prompt-admission.sql"
import { SessionV1 } from "@orchestra/core/v1/session"
import { firstPart, layer, otherSessionID, payload, seed, sessionID } from "./fixture/v1-prompt-admission"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(layer())
const defect = <A>(effect: Effect.Effect<A>) => effect.pipe(Effect.catchDefect(Effect.succeed))

describe("V1 prompt admission", () => {
  it.effect("stores ordered context and immutable winner; exact retry adds no event or notification", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const db = database.db
      const events = yield* EventV2.Service
      yield* seed
      const notified: string[] = []
      yield* events.listen((event) =>
        Effect.sync(() => {
          notified.push(event.type)
        }),
      )
      expect(yield* PromptAdmission.reconcile(db, payload)).toBeUndefined()
      yield* events.publish(SessionV1.Event.PromptAdmitted, payload)
      expect((yield* PromptAdmission.find(db, payload.messageID))?.snapshot).toEqual({
        info: payload.info,
        parts: payload.parts,
      })
      expect((yield* db.select().from(MessageTable).get())?.data).toMatchObject({
        promptContext: payload.info.promptContext,
      })
      expect(yield* db.select().from(PartTable).all()).toHaveLength(2)
      expect(yield* PromptAdmission.reconcile(db, payload)).toEqual({ info: payload.info, parts: payload.parts })
      const retry = { ...payload, info: { ...payload.info, promptContext: { reminders: ["losing hook"] } }, parts: [] }
      expect(yield* defect(events.publish(SessionV1.Event.PromptAdmitted, retry))).toBeInstanceOf(
        PromptAdmission.AlreadyAdmitted,
      )
      expect(yield* PromptAdmission.reconcile(db, payload)).toEqual({ info: payload.info, parts: payload.parts })
      expect(yield* EventV2.latestSequence(db, sessionID)).toBe(1)
      expect(yield* db.select().from(EventTable).all()).toHaveLength(3)
      expect(notified).toEqual([SessionV1.Event.PromptAdmitted.type])
    }),
  )

  it.effect("rejects changed identity and global cross-Session reuse with named conflicts", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      yield* seed
      yield* events.publish(SessionV1.Event.PromptAdmitted, payload)
      yield* Effect.forEach(
        [
          { ...payload, identity: "different bytes" },
          {
            ...payload,
            sessionID: otherSessionID,
            info: { ...payload.info, sessionID: otherSessionID },
            parts: payload.parts.map((part) => ({ ...part, sessionID: otherSessionID })),
          },
        ],
        (input) =>
          Effect.gen(function* () {
            expect(yield* PromptAdmission.reconcile(database.db, input).pipe(Effect.flip)).toBeInstanceOf(
              PromptAdmission.Conflict,
            )
            expect(yield* defect(events.publish(SessionV1.Event.PromptAdmitted, input))).toMatchObject({
              _tag: "PromptAdmission.Conflict",
              reason: "identity-mismatch",
            })
          }),
      )
      expect(yield* EventV2.latestSequence(database.db, otherSessionID)).toBe(0)
      expect(yield* database.db.select().from(PromptAdmissionTable).all()).toHaveLength(1)
    }),
  )

  it.effect("rejects duplicate, occupied, and foreign-owned IDs before admission", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const db = database.db
      const events = yield* EventV2.Service
      yield* seed
      const occupiedID = SessionV1.PartID.make("prt_occupied")
      const historical = { ...payload.info, id: SessionV1.MessageID.make("msg_historical"), sessionID: otherSessionID }
      yield* events.publish(SessionV1.Event.MessageUpdated, { sessionID: otherSessionID, info: historical })
      yield* events.publish(SessionV1.Event.PartUpdated, {
        sessionID: otherSessionID,
        time: 0,
        part: {
          ...firstPart,
          id: occupiedID,
          messageID: historical.id,
          sessionID: otherSessionID,
        },
      })
      const before = yield* db.select().from(EventTable).all()
      yield* Effect.forEach(
        [
          { input: { ...payload, parts: [firstPart, firstPart] }, reason: "duplicate-part-id" },
          { input: { ...payload, info: { ...payload.info, id: historical.id } }, reason: "ownership-mismatch" },
          { input: { ...payload, info: { ...payload.info, sessionID: otherSessionID } }, reason: "ownership-mismatch" },
          { input: { ...payload, parts: [{ ...firstPart, sessionID: otherSessionID }] }, reason: "ownership-mismatch" },
          { input: { ...payload, parts: [{ ...firstPart, messageID: historical.id }] }, reason: "ownership-mismatch" },
          { input: { ...payload, parts: [{ ...firstPart, id: occupiedID }] }, reason: "occupied-part-id" },
        ],
        (entry) =>
          Effect.gen(function* () {
            expect(yield* defect(events.publish(SessionV1.Event.PromptAdmitted, entry.input))).toMatchObject({
              _tag: "PromptAdmission.Conflict",
              reason: entry.reason,
            })
          }),
      )
      expect(yield* db.select().from(EventTable).all()).toEqual(before)
      expect(yield* db.select().from(PromptAdmissionTable).all()).toEqual([])
      expect(yield* db.select().from(MessageTable).all()).toHaveLength(1)
      expect(yield* db.select().from(PartTable).all()).toHaveLength(1)
    }),
  )

  it.live(
    "last-part SQL failure rolls back receipt, message, parts, sequence, event, notification and durable wake",
    () =>
      Effect.gen(function* () {
        const reads: string[] = []
        const ready = yield* Deferred.make<void>()
        const admitted = yield* Deferred.make<void>()
        yield* Effect.gen(function* () {
          const database = yield* Database.Service
          const db = database.db
          const events = yield* EventV2.Service
          yield* seed
          const received: string[] = []
          yield* events.durable({ aggregateID: sessionID }).pipe(
            Stream.runForEach((event) =>
              Effect.gen(function* () {
                received.push(event.type)
                if (event.type === SessionV1.Event.Created.type) yield* Deferred.succeed(ready, undefined)
                if (event.type === SessionV1.Event.PromptAdmitted.type) yield* Deferred.succeed(admitted, undefined)
              }),
            ),
            Effect.forkScoped,
          )
          // Historical Created reaches the consumer only after subscription and its initial real DB read.
          yield* Deferred.await(ready).pipe(Effect.timeout("10 seconds"))
          expect(reads).toEqual([sessionID])
          const notified: string[] = []
          yield* events.listen((event) =>
            Effect.sync(() => {
              notified.push(event.type)
            }),
          )
          yield* db.run(
            sql.raw(`CREATE TRIGGER fail_last_part BEFORE INSERT ON part WHEN NEW.id = 'prt_v1_a'
        BEGIN SELECT RAISE(ABORT, 'last-part-failure'); END`),
          )
          const failed = yield* defect(events.publish(SessionV1.Event.PromptAdmitted, payload))
          // Drain continuations already queued by publication; no wall-clock sleeps or missing-event timeout.
          yield* Effect.yieldNow
          expect(reads).toEqual([sessionID])
          expect(received).toEqual([SessionV1.Event.Created.type])
          expect(failed).not.toHaveProperty("type")
          expect(failed).not.toBeInstanceOf(PromptAdmission.AlreadyAdmitted)
          expect(yield* db.select().from(PromptAdmissionTable).all()).toEqual([])
          expect(yield* db.select().from(MessageTable).all()).toEqual([])
          expect(yield* db.select().from(PartTable).all()).toEqual([])
          expect(yield* EventV2.latestSequence(db, sessionID)).toBe(0)
          expect(yield* db.select().from(EventTable).all()).toHaveLength(2)
          expect(notified).toEqual([])
          yield* db.run(sql`DROP TRIGGER fail_last_part`)
          yield* events.publish(SessionV1.Event.PromptAdmitted, payload)
          yield* Deferred.await(admitted).pipe(Effect.timeout("10 seconds"))
          // Positive control: committed admission wakes this same subscriber and starts another real DB read.
          expect(reads).toEqual([sessionID, sessionID])
          expect(received).toEqual([SessionV1.Event.Created.type, SessionV1.Event.PromptAdmitted.type])
          expect(notified).toEqual([SessionV1.Event.PromptAdmitted.type])
          expect(yield* db.select().from(PartTable).all()).toHaveLength(2)
        }).pipe(
          Effect.provide(
            Layer.fresh(
              layer(
                ":memory:",
                EventV2.layerWith({
                  beforeAggregateRead: (aggregateID) =>
                    Effect.sync(() => {
                      reads.push(aggregateID)
                    }),
                }),
              ),
            ),
          ),
        )
      }),
  )

  it.effect("older data lacks sidecar; historical ID conflicts; ordinary edits leave receipt intact", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const db = database.db
      const events = yield* EventV2.Service
      yield* seed
      const { promptContext: _, ...old } = payload.info
      expect(Schema.encodeSync(SessionV1.User)(old)).not.toHaveProperty("promptContext")
      const decoded = Schema.decodeUnknownSync(SessionV1.Event.MessageUpdated.data)({ sessionID, info: old })
      expect(decoded.info).not.toHaveProperty("promptContext")
      yield* events.publish(SessionV1.Event.MessageUpdated, decoded)
      expect(yield* PromptAdmission.find(db, payload.messageID)).toBeUndefined()
      expect(yield* PromptAdmission.reconcile(db, payload).pipe(Effect.flip)).toMatchObject({
        _tag: "PromptAdmission.Conflict",
        reason: "historical-message-without-receipt",
      })
      expect(yield* defect(events.publish(SessionV1.Event.PromptAdmitted, payload))).toBeInstanceOf(
        PromptAdmission.Conflict,
      )
      yield* events.publish(SessionV1.Event.MessageRemoved, { sessionID, messageID: payload.messageID })
      yield* events.publish(SessionV1.Event.PromptAdmitted, payload)
      yield* events.publish(SessionV1.Event.MessageUpdated, { sessionID, info: { ...payload.info, agent: "edited" } })
      yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 2, part: { ...firstPart, text: "edited" } })
      expect((yield* db.select().from(MessageTable).get())?.data).toMatchObject({ agent: "edited" })
      expect((yield* db.select().from(PartTable).where(eq(PartTable.id, firstPart.id)).get())?.data).toMatchObject({
        text: "edited",
      })
      expect(yield* PromptAdmission.reconcile(db, payload)).toEqual({ info: payload.info, parts: payload.parts })
      yield* events.publish(SessionV1.Event.PartRemoved, {
        sessionID,
        messageID: payload.messageID,
        partID: firstPart.id,
      })
      yield* events.publish(SessionV1.Event.MessageRemoved, { sessionID, messageID: payload.messageID })
      expect(yield* db.select().from(PartTable).all()).toEqual([])
      expect(yield* PromptAdmission.reconcile(db, payload)).toEqual({ info: payload.info, parts: payload.parts })
    }),
  )

  it.effect("unrelated projector defects remain failures even after receipt insertion", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      yield* seed
      const failure = new Error("unrelated projector failure")
      yield* events.project(SessionV1.Event.PromptAdmitted, () => Effect.die(failure))
      expect(yield* defect(events.publish(SessionV1.Event.PromptAdmitted, payload))).toBe(failure)
      expect(yield* PromptAdmission.find(database.db, payload.messageID)).toBeUndefined()
      expect(yield* database.db.select().from(MessageTable).all()).toEqual([])
      expect(yield* database.db.select().from(EventTable).all()).toHaveLength(2)
    }),
  )

  it.live("replay reconstructs durable receipt; reopening preserves winner and replay checks", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      yield* seed
      yield* events.publish(SessionV1.Event.PromptAdmitted, payload)
      expect(Durable.get(EventV2.versionedType(SessionV1.Event.PromptAdmitted.type, 1))).toBe(
        SessionV1.Event.PromptAdmitted,
      )
      const serialized = (yield* database.db
        .select()
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, sessionID))
        .orderBy(asc(EventTable.seq))
        .all()).map((row) => ({
        id: row.id,
        type: row.type,
        seq: row.seq,
        aggregateID: row.aggregate_id,
        data: row.data,
      }))
      const admission = serialized.find((event) => event.seq === 1)
      if (!admission) return yield* Effect.die("Admission event missing")
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const target = layer(path.join(tmp.path, "replay.sqlite"))
      yield* Effect.gen(function* () {
        const database = yield* Database.Service
        const events = yield* EventV2.Service
        yield* seed
        // Remove seeded sequences/projections, preserving the real project prerequisite.
        yield* database.db.run(sql`DELETE FROM session`)
        yield* database.db.run(sql`DELETE FROM event`)
        yield* database.db.run(sql`DELETE FROM event_sequence`)
        yield* events.replayAll(serialized)
        expect(yield* PromptAdmission.reconcile(database.db, payload)).toEqual({
          info: payload.info,
          parts: payload.parts,
        })
      }).pipe(Effect.provide(Layer.fresh(target)))
      yield* Effect.gen(function* () {
        const database = yield* Database.Service
        const events = yield* EventV2.Service
        expect(yield* PromptAdmission.reconcile(database.db, payload)).toEqual({
          info: payload.info,
          parts: payload.parts,
        })
        yield* events.replayAll(serialized)
        expect(yield* database.db.select().from(EventTable).all()).toHaveLength(2)
        expect(
          yield* defect(events.replay({ ...admission, data: { ...admission.data, identity: "diverged" } })),
        ).toBeInstanceOf(EventV2.InvalidDurableEventError)
      }).pipe(Effect.provide(Layer.fresh(target)))
    }),
  )
})
