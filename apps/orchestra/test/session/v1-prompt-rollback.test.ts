import { expect } from "bun:test"
import { Deferred, Effect, Layer, Schema, Stream } from "effect"
import { sql } from "drizzle-orm"
import { EventV2 } from "@orchestra/core/event"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { SessionV1 } from "@orchestra/core/v1/session"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ProjectionState } from "../../../core/test/fixture/projection-state"
import { GlobalBus } from "@/bus/global"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { testEffect } from "../lib/effect"

const reads: string[] = []
const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([Database.node, EventV2.node, SessionProjector.node, Session.node, EventV2Bridge.node]),
    [
      [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true, experimentalEventSystem: true })],
      [
        EventV2.node,
        EventV2.layerWith({
          beforeAggregateRead: (id) =>
            Effect.sync(() => {
              reads.push(id)
            }),
        }),
      ],
    ],
  ),
)

it.instance(
  "transition-bearing part/event/cache failures restore full projection and stay silent until real positive publication",
  () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const events = yield* EventV2Bridge.Service
      const database = yield* Database.Service
      const db = database.db
      const session = yield* sessions.create({ title: "Rollback transition" })
      const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
      const old = {
        info: yield* sessions.updateMessage({
          id: MessageID.ascending(),
          sessionID: session.id,
          role: "user",
          agent: "old-agent",
          model,
          time: { created: 1 },
        }),
      }
      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: session.id,
        messageID: old.info.id,
        type: "text",
        text: "captured old part",
      })
      yield* sessions.setRevert({ sessionID: session.id, revert: { messageID: old.info.id }, summary: undefined })
      const messageID = MessageID.ascending()
      const payload = {
        sessionID: session.id,
        messageID,
        identityVersion: 1 as const,
        identity: "full rollback delta",
        info: {
          id: messageID,
          sessionID: session.id,
          role: "user" as const,
          agent: "changed-agent",
          model,
          time: { created: 2 },
          promptContext: { reminders: ["winning note"] },
        },
        parts: ["prt_rollback_first", "prt_rollback_last"].map((id) => ({
          id: PartID.make(id),
          sessionID: session.id,
          messageID,
          type: "text" as const,
          text: id,
        })),
        transition: {
          expectedRevert: { messageID: old.info.id },
          removeMessageIDs: [old.info.id],
          removePartIDs: [],
          permission: [{ permission: "write", pattern: "*", action: "deny" as const }],
          expectedPermission: null,
          timeUpdated: 200,
        },
      }
      const core: string[] = []
      const ui: unknown[] = []
      const durable: string[] = []
      const listener = (event: { payload: unknown }) => {
        ui.push(event)
      }
      yield* Effect.acquireRelease(
        Effect.sync(() => GlobalBus.on("event", listener)),
        () =>
          Effect.sync(() => {
            GlobalBus.off("event", listener)
          }),
      )
      yield* events.listen((event) =>
        Effect.sync(() => {
          core.push(event.type)
        }),
      )
      const ready = yield* Deferred.make<void>()
      const positive = yield* Deferred.make<void>()
      const seq = yield* EventV2.latestSequence(db, session.id)
      const actualCore = events
      yield* actualCore.durable({ aggregateID: session.id }).pipe(
        Stream.runForEach((event) =>
          Effect.gen(function* () {
            durable.push(event.id)
            if (event.durable?.seq === seq) yield* Deferred.succeed(ready, undefined)
            if (
              event.type === SessionV1.Event.PromptAdmitted.type &&
              Schema.decodeUnknownSync(SessionV1.Event.PromptAdmitted.data)(event.data).messageID === messageID
            )
              yield* Deferred.succeed(positive, undefined)
          }),
        ),
        Effect.forkScoped,
      )
      yield* Deferred.await(ready).pipe(Effect.timeout("10 seconds"))
      const priorReads = reads.filter((id) => id === session.id).length
      const priorDurable = [...durable]
      const before = yield* ProjectionState.capture(db)
      const { expectedPermission: _, ...omission } = payload.transition
      const rejected: unknown = yield* sessions.admitPrompt({ ...payload, transition: omission }).pipe(Effect.result)
      expect(rejected).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "PromptAdmission.Conflict",
          reason: "permission-expectation-missing",
        },
      })
      expect(yield* ProjectionState.capture(db)).toEqual(before)
      expect(core).toEqual([])
      expect(ui).toEqual([])
      expect(durable).toEqual(priorDurable)
      expect(reads.filter((id) => id === session.id)).toHaveLength(priorReads)
      yield* Effect.forEach(
        [
          {
            trigger:
              "CREATE TRIGGER fail_admission_part BEFORE INSERT ON part WHEN NEW.id = 'prt_rollback_last' BEGIN SELECT RAISE(ABORT, 'last-part-failure'); END",
            drop: "DROP TRIGGER fail_admission_part",
            cache: Effect.void,
          },
          {
            trigger:
              "CREATE TRIGGER fail_admission_event BEFORE INSERT ON event WHEN NEW.type = 'session.v1.prompt.admitted.1' BEGIN SELECT RAISE(ABORT, 'event-insert-failure'); END",
            drop: "DROP TRIGGER fail_admission_event",
            cache: Effect.void,
          },
          { trigger: undefined, drop: undefined, cache: Effect.die(new Error("operational-cache-failure")) },
        ],
        (failure) =>
          Effect.gen(function* () {
            if (failure.trigger) yield* db.run(sql.raw(failure.trigger))
            const outcome = yield* sessions.admitPrompt(payload, failure.cache).pipe(Effect.catchDefect(Effect.succeed))
            expect(outcome).not.toHaveProperty("created")
            expect(yield* ProjectionState.capture(db)).toEqual(before)
            yield* Effect.yieldNow
            expect(core).toEqual([])
            expect(ui).toEqual([])
            expect(durable).toEqual(priorDurable)
            expect(reads.filter((id) => id === session.id)).toHaveLength(priorReads)
            if (failure.drop) yield* db.run(sql.raw(failure.drop))
          }),
      )
      expect((yield* sessions.admitPrompt(payload)).created).toBe(true)
      yield* Deferred.await(positive).pipe(Effect.timeout("10 seconds"))
      expect(core).toEqual([SessionV1.Event.PromptAdmitted.type])
      expect(ui).toHaveLength(5)
      expect(durable).toHaveLength(priorDurable.length + 1)
      expect(reads.filter((id) => id === session.id)).toHaveLength(priorReads + 1)
      expect(yield* ProjectionState.capture(db)).not.toEqual(before)
    }),
  { git: true },
)
