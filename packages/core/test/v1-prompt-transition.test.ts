import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { asc, eq } from "drizzle-orm"
import path from "node:path"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Project } from "@orchestra/core/project"
import { MessageTable, PartTable, SessionTable } from "@orchestra/core/session/sql"
import { PromptAdmission } from "@orchestra/core/v1/prompt-admission"
import { SessionV1 } from "@orchestra/core/v1/session"
import { firstPart, layer, otherSessionID, payload, seed, sessionID } from "./fixture/v1-prompt-admission"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { ProjectionState } from "./fixture/projection-state"

const it = testEffect(layer())
const historicalID = SessionV1.MessageID.make("msg_transition_old")
const history = Effect.gen(function* () {
  const events = yield* EventV2.Service
  yield* seed
  yield* events.publish(SessionV1.Event.MessageUpdated, { sessionID, info: { ...payload.info, id: historicalID } })
  yield* events.publish(SessionV1.Event.PartUpdated, {
    sessionID,
    time: 0,
    part: {
      ...firstPart,
      id: SessionV1.PartID.make("prt_transition_old"),
      messageID: historicalID,
    },
  })
  yield* events.publish(SessionV1.Event.PartUpdated, {
    sessionID,
    time: 0,
    part: {
      id: SessionV1.PartID.make("prt_transition_usage"),
      sessionID,
      messageID: historicalID,
      type: "step-finish",
      reason: "stop",
      cost: 5,
      tokens: { input: 3, output: 2, reasoning: 1, cache: { read: 4, write: 6 } },
    },
  })
  yield* events.publish(SessionV1.Event.Updated, {
    sessionID,
    info: {
      id: sessionID,
      slug: "test",
      directory: "/project",
      projectID: Project.ID.global,
      title: "initial",
      version: "test",
      time: { created: 0, updated: 0 },
      revert: { messageID: historicalID },
      cost: 5,
      tokens: { input: 3, output: 2, reasoning: 1, cache: { read: 4, write: 6 } },
    },
  })
})
const transition = {
  expectedRevert: { messageID: historicalID },
  removeMessageIDs: [historicalID],
  removePartIDs: [],
  permission: [{ permission: "write", pattern: "*", action: "deny" as const }],
  expectedPermission: null,
  timeUpdated: 100,
}
const defect = <A>(effect: Effect.Effect<A>) => effect.pipe(Effect.catchDefect(Effect.succeed))

it.effect(
  "permission writes require a defined expectation in typed publication and replay before any durable delta",
  () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      yield* history
      const observed: string[] = []
      yield* events.listen((event) =>
        Effect.sync(() => {
          observed.push(event.type)
        }),
      )
      const before = yield* ProjectionState.capture(database.db)
      const { expectedPermission: _, ...omitted } = transition
      yield* Effect.forEach([omitted, { ...omitted, expectedPermission: undefined }], (input) =>
        Effect.gen(function* () {
          expect(
            yield* defect(events.publish(SessionV1.Event.PromptAdmitted, { ...payload, transition: input })),
          ).toMatchObject({
            _tag: "PromptAdmission.Conflict",
            reason: "permission-expectation-missing",
          })
          expect(
            yield* defect(
              events.replay({
                id: EventV2.ID.create(),
                type: "session.v1.prompt.admitted.1",
                aggregateID: sessionID,
                seq: (yield* EventV2.latestSequence(database.db, sessionID)) + 1,
                data: { ...payload, transition: input },
              }),
            ),
          ).toMatchObject({ _tag: "PromptAdmission.Conflict", reason: "permission-expectation-missing" })
          expect(yield* ProjectionState.capture(database.db)).toEqual(before)
          expect(observed).toEqual([])
        }),
      )
      // Positive control: null means the currently unset permission, not a missing expectation.
      yield* events.publish(SessionV1.Event.PromptAdmitted, { ...payload, transition })
      expect(observed).toEqual([SessionV1.Event.PromptAdmitted.type])
      expect(yield* ProjectionState.capture(database.db)).not.toEqual(before)
    }),
)

it.effect("critical transition commits with receipt and preserves unrelated updates and deletion accounting", () =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    const events = yield* EventV2.Service
    yield* history
    yield* db
      .update(SessionTable)
      .set({ title: "unrelated title", cost: 12 })
      .where(eq(SessionTable.id, sessionID))
      .run()
    yield* events.publish(SessionV1.Event.PromptAdmitted, { ...payload, transition })
    expect(yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get()).toMatchObject({
      title: "unrelated title",
      cost: 7,
      revert: null,
      time_updated: 100,
      agent: payload.info.agent,
      permission: transition.permission,
      model: { id: payload.info.model.modelID, providerID: payload.info.model.providerID },
      tokens_input: 0,
      tokens_output: 0,
      tokens_reasoning: 0,
      tokens_cache_read: 0,
      tokens_cache_write: 0,
    })
    expect((yield* db.select().from(MessageTable).all()).map((row) => row.id)).toEqual([payload.messageID])
    expect((yield* db.select().from(PartTable).all()).map((row) => row.id).sort()).toEqual(
      payload.parts.map((part) => part.id).sort(),
    )
    expect(yield* PromptAdmission.reconcile(db, payload)).toEqual({ info: payload.info, parts: payload.parts })
    yield* events.publish(SessionV1.Event.Updated, {
      sessionID,
      info: {
        id: sessionID,
        slug: "test",
        directory: "/project",
        projectID: Project.ID.global,
        title: "newer",
        version: "test",
        time: { created: 0, updated: 101 },
        revert: { messageID: SessionV1.MessageID.make("msg_newer_revert") },
      },
    })
    const before = yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get()
    expect(yield* defect(events.publish(SessionV1.Event.PromptAdmitted, { ...payload, transition }))).toBeInstanceOf(
      PromptAdmission.AlreadyAdmitted,
    )
    expect(yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get()).toEqual(before)
  }),
)

it.effect("CAS and removal ownership failures precede all writes; missing removal IDs are allowed", () =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    const events = yield* EventV2.Service
    yield* history
    const foreign = SessionV1.MessageID.make("msg_foreign")
    const foreignPart = SessionV1.PartID.make("prt_foreign")
    yield* events.publish(SessionV1.Event.MessageUpdated, {
      sessionID: otherSessionID,
      info: {
        ...payload.info,
        sessionID: otherSessionID,
        id: foreign,
      },
    })
    yield* events.publish(SessionV1.Event.PartUpdated, {
      sessionID: otherSessionID,
      time: 0,
      part: {
        ...firstPart,
        id: foreignPart,
        sessionID: otherSessionID,
        messageID: foreign,
      },
    })
    const before = yield* ProjectionState.capture(db)
    yield* Effect.forEach(
      [
        { ...transition, expectedRevert: null },
        { ...transition, expectedPermission: [] },
        { ...transition, removeMessageIDs: [foreign] },
        { ...transition, removePartIDs: [foreignPart] },
        { ...transition, removeMessageIDs: [payload.messageID] },
        { ...transition, removePartIDs: [firstPart.id] },
      ],
      (input) =>
        Effect.gen(function* () {
          expect(
            yield* defect(events.publish(SessionV1.Event.PromptAdmitted, { ...payload, transition: input })),
          ).toBeInstanceOf(PromptAdmission.Conflict)
          expect(yield* PromptAdmission.find(db, payload.messageID)).toBeUndefined()
          expect(yield* ProjectionState.capture(db)).toEqual(before)
        }),
    )
    yield* events.publish(SessionV1.Event.MessageRemoved, { sessionID, messageID: historicalID })
    yield* events.publish(SessionV1.Event.PromptAdmitted, {
      ...payload,
      transition: {
        ...transition,
        removeMessageIDs: [historicalID, SessionV1.MessageID.make("msg_absent")],
        removePartIDs: [SessionV1.PartID.make("prt_transition_old"), SessionV1.PartID.make("prt_absent")],
      },
    })
    expect(yield* PromptAdmission.find(db, payload.messageID)).toBeDefined()
  }),
)

it.live("persisted transition replays into receipt plus critical Session state; old events remain patch-free", () =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    yield* history
    yield* events.publish(SessionV1.Event.PromptAdmitted, { ...payload, transition })
    const serialized = (yield* database.db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, sessionID))
      .orderBy(asc(EventTable.seq))
      .all()).map((row) => ({
      id: row.id,
      type: row.type,
      aggregateID: row.aggregate_id,
      seq: row.seq,
      data: row.data,
    }))
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    yield* Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      yield* seed
      // Existing project prerequisite; restore the imported aggregate from its real event history.
      yield* events.remove(sessionID)
      yield* database.db.delete(SessionTable).where(eq(SessionTable.id, sessionID)).run()
      yield* events.replayAll(serialized)
      expect(yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get()).toMatchObject({
        revert: null,
        permission: transition.permission,
        time_updated: 100,
        agent: payload.info.agent,
        model: { id: payload.info.model.modelID, providerID: payload.info.model.providerID, variant: "default" },
        cost: 0,
        tokens_input: 0,
        tokens_output: 0,
        tokens_reasoning: 0,
        tokens_cache_read: 0,
        tokens_cache_write: 0,
      })
      expect((yield* database.db.select().from(MessageTable).all()).map((row) => row.id)).toEqual([payload.messageID])
      expect(yield* PromptAdmission.reconcile(database.db, payload)).toEqual({
        info: payload.info,
        parts: payload.parts,
      })
      expect(
        (yield* database.db.select().from(PartTable).orderBy(PartTable.id).all()).map((row) => ({
          ...row.data,
          id: row.id,
          messageID: row.message_id,
          sessionID: row.session_id,
        })),
      ).toEqual([...payload.parts].sort((a, b) => a.id.localeCompare(b.id)))
      const next = {
        ...payload,
        messageID: SessionV1.MessageID.make("msg_old_event"),
        info: {
          ...payload.info,
          id: SessionV1.MessageID.make("msg_old_event"),
          agent: "old-event-agent",
        },
        parts: [],
      }
      yield* events.publish(SessionV1.Event.PromptAdmitted, next)
      expect((yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get())?.agent).toBe(
        payload.info.agent,
      )
    }).pipe(Effect.provide(Layer.fresh(layer(path.join(tmp.path, "transition.sqlite")))))
  }),
)
