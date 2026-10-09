import { expect } from "bun:test"
import path from "node:path"
import { Effect, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { MessageTable, PartTable, SessionTable } from "@orchestra/core/session/sql"
import { SessionV1 } from "@orchestra/core/v1/session"
import { WorkspaceV2 } from "@orchestra/core/workspace"
import { GlobalBus } from "@/bus/global"
import { EventV2Bridge } from "@/event-v2-bridge"
import { WorkspaceRef } from "@/effect/instance-ref"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { TestInstance } from "./fixture/fixture"
import { testEffect } from "./lib/effect"
import { makeHttp } from "./session/prompt.fixture"

const it = testEffect(
  makeHttp({
    replacements: [
      [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true, experimentalEventSystem: true })],
    ],
  }),
)
const decode = Schema.decodeUnknownSync(
  Schema.Struct({
    directory: Schema.optional(Schema.String),
    project: Schema.optional(Schema.String),
    workspace: Schema.optional(Schema.String),
    payload: Schema.Struct({
      id: Schema.String,
      type: Schema.String,
      properties: Schema.optional(Schema.Unknown),
      syncEvent: Schema.optional(
        Schema.Struct({
          id: Schema.String,
          type: Schema.String,
          seq: Schema.Int,
          aggregateID: Schema.String,
          data: Schema.Unknown,
        }),
      ),
    }),
  }),
)

it.instance(
  "admission fan-out is postcommit, ordered, independently deduplicable and carries routed metadata with one original sync",
  () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const bridge = yield* EventV2Bridge.Service
      const database = yield* Database.Service
      const instance = yield* TestInstance
      const session = yield* sessions.create()
      const messageID = MessageID.ascending()
      const info: SessionV1.User = {
        id: messageID,
        sessionID: session.id,
        role: "user",
        time: { created: 1 },
        agent: "maestro",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
        promptContext: { reminders: ["first", "second"] },
      }
      const parts: SessionV1.Part[] = ["first", "second"].map((text) => ({
        id: PartID.ascending(),
        sessionID: session.id,
        messageID,
        type: "text",
        text,
      }))
      const payload = {
        sessionID: session.id,
        messageID,
        identityVersion: 1 as const,
        identity: "original bridge request",
        info,
        parts,
      }
      const observed: unknown[] = []
      const listener = (event: { payload: unknown }) => {
        observed.push(event)
      }
      yield* Effect.acquireRelease(
        Effect.sync(() => GlobalBus.on("event", listener)),
        () =>
          Effect.sync(() => {
            GlobalBus.off("event", listener)
          }),
      )
      // This projector executes inside the real transaction, after receipt/message/parts, before event append.
      yield* bridge.project(SessionV1.Event.PromptAdmitted, () =>
        Effect.gen(function* () {
          expect(observed).toEqual([])
          expect(
            yield* database.db.select().from(MessageTable).where(eq(MessageTable.id, messageID)).get(),
          ).toBeDefined()
          expect(yield* database.db.select().from(PartTable).all()).toHaveLength(2)
          expect(
            yield* database.db
              .select()
              .from(EventTable)
              .where(eq(EventTable.type, "session.v1.prompt.admitted.1"))
              .all(),
          ).toEqual([])
        }).pipe(Effect.orDie),
      )
      const location = new Location.Info({
        directory: AbsolutePath.make(path.join(instance.directory, "routed")),
        workspaceID: WorkspaceV2.ID.make("wrk_routed"),
        project: { id: Project.ID.make(session.projectID), directory: AbsolutePath.make(instance.directory) },
      })
      const event = yield* bridge
        .publish(SessionV1.Event.PromptAdmitted, payload, { location })
        .pipe(Effect.provideService(WorkspaceRef, WorkspaceV2.ID.make("wrk_ambient")))
      const notifications = observed.map((event) => decode(event))
      expect(notifications.map((item) => item.payload.type)).toEqual([
        "message.updated",
        "message.part.updated",
        "message.part.updated",
        "sync",
      ])
      expect(new Set(notifications.map((item) => item.payload.id)).size).toBe(4)
      notifications.forEach((item) =>
        expect({ directory: item.directory, workspace: item.workspace, project: item.project }).toEqual({
          directory: location.directory,
          workspace: location.workspaceID,
          project: session.projectID,
        }),
      )
      expect(notifications.map((item) => item.payload.properties).slice(0, 3)).toEqual([
        { sessionID: session.id, info },
        ...parts.map((part) => ({ sessionID: session.id, part, time: info.time.created })),
      ])
      const sync = notifications.find((item) => item.payload.type === "sync")?.payload.syncEvent
      if (!event.durable) return yield* Effect.die("Admission must be durable")
      expect(sync).toEqual({
        id: event.id,
        type: "session.v1.prompt.admitted.1",
        seq: event.durable.seq,
        aggregateID: session.id,
        data: payload,
      })
      expect(yield* database.db.select().from(EventTable).where(eq(EventTable.id, event.id)).get()).toMatchObject({
        type: "session.v1.prompt.admitted.1",
        data: payload,
      })
      expect(yield* sessions.admitPrompt(payload)).toEqual({ created: false, message: { info, parts } })
      expect(observed.map((event) => decode(event))).toEqual(notifications)
    }),
  { git: true },
)

it.instance(
  "arbitrary admission projector defects remain failures and produce no compatibility or sync notifications",
  () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const bridge = yield* EventV2Bridge.Service
      const database = yield* Database.Service
      const session = yield* sessions.create()
      const messageID = MessageID.ascending()
      const payload = {
        sessionID: session.id,
        messageID,
        identityVersion: 1 as const,
        identity: "failed bridge request",
        info: {
          id: messageID,
          sessionID: session.id,
          role: "user" as const,
          time: { created: 1 },
          agent: "maestro",
          model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
        },
        parts: [],
      }
      const observed: unknown[] = []
      const listener = (event: { payload: unknown }) => {
        observed.push(event)
      }
      yield* Effect.acquireRelease(
        Effect.sync(() => GlobalBus.on("event", listener)),
        () =>
          Effect.sync(() => {
            GlobalBus.off("event", listener)
          }),
      )
      const failure = new Error("unrelated bridge projector failure")
      yield* bridge.project(SessionV1.Event.PromptAdmitted, () => Effect.die(failure))
      expect(yield* sessions.admitPrompt(payload).pipe(Effect.catchDefect(Effect.succeed))).toBe(failure)
      expect(yield* sessions.reconcilePrompt(payload)).toBeUndefined()
      expect(yield* database.db.select().from(MessageTable).all()).toEqual([])
      expect(observed).toEqual([])
    }),
  { git: true },
)

it.instance(
  "explicit cross-project implicit-local route never inherits ambient workspace; ordinary local-only and durable updates pass through",
  () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const bridge = yield* EventV2Bridge.Service
      const instance = yield* TestInstance
      const session = yield* sessions.create()
      const observed: unknown[] = []
      const core: string[] = []
      const listener = (event: { payload: unknown }) => {
        observed.push(event)
      }
      yield* Effect.acquireRelease(
        Effect.sync(() => GlobalBus.on("event", listener)),
        () =>
          Effect.sync(() => {
            GlobalBus.off("event", listener)
          }),
      )
      yield* bridge.listen((event) =>
        Effect.sync(() => {
          core.push(event.type)
        }),
      )
      const location = new Location.Info({
        directory: AbsolutePath.make(path.join(instance.directory, "other-project")),
        project: {
          id: Project.ID.make("other-project"),
          directory: AbsolutePath.make(path.join(instance.directory, "other-project")),
        },
      })
      const info: SessionV1.User = {
        id: MessageID.ascending(),
        sessionID: session.id,
        role: "user",
        time: { created: 1 },
        agent: "maestro",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
      }
      const update = { sessionID: session.id, info }
      const local = yield* bridge
        .publish(SessionV1.Event.MessageUpdated, update, { location, persist: false })
        .pipe(Effect.provideService(WorkspaceRef, WorkspaceV2.ID.make("wrk_ambient")))
      const durable = yield* bridge
        .publish(SessionV1.Event.MessageUpdated, update, { location })
        .pipe(Effect.provideService(WorkspaceRef, WorkspaceV2.ID.make("wrk_ambient")))
      expect(local.durable).toBeUndefined()
      expect(durable.durable).toBeDefined()
      expect(core).toEqual(["message.updated", "message.updated"])
      const notifications = observed.map((event) => decode(event))
      expect(notifications.map((item) => item.payload.type)).toEqual(["message.updated", "message.updated", "sync"])
      notifications.forEach((item) =>
        expect({ directory: item.directory, project: item.project, workspace: item.workspace }).toEqual({
          directory: location.directory,
          project: location.project.id,
          workspace: undefined,
        }),
      )
      expect(
        notifications.filter((item) => item.payload.type === "message.updated").map((item) => item.payload.properties),
      ).toEqual([update, update])
      const unknown = EventV2.define({ type: "test.unknown.bridge", schema: { text: Schema.String } })
      yield* bridge.publish(unknown, { text: "unchanged" }, { location })
      expect(observed.map((event) => decode(event)).at(-1)?.payload).toMatchObject({
        type: unknown.type,
        properties: { text: "unchanged" },
      })
    }),
  { git: true },
)

it.instance(
  "transition notification reads actual committed row; rollback and loser are silent against real Core and UI baselines",
  () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const bridge = yield* EventV2Bridge.Service
      const database = yield* Database.Service
      const session = yield* sessions.create({ title: "before" })
      const observed: unknown[] = []
      const core: string[] = []
      const listener = (event: { payload: unknown }) => {
        observed.push(event)
      }
      yield* Effect.acquireRelease(
        Effect.sync(() => GlobalBus.on("event", listener)),
        () =>
          Effect.sync(() => {
            GlobalBus.off("event", listener)
          }),
      )
      yield* bridge.listen((event) =>
        Effect.sync(() => {
          core.push(event.type)
        }),
      )
      const messageID = MessageID.ascending()
      const payload = {
        sessionID: session.id,
        messageID,
        identityVersion: 1 as const,
        identity: "critical UI baseline",
        info: {
          id: messageID,
          sessionID: session.id,
          role: "user" as const,
          time: { created: 1 },
          agent: "maestro",
          model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
        },
        parts: [],
        transition: { expectedRevert: null, removeMessageIDs: [], removePartIDs: [], timeUpdated: 100 },
      }
      yield* bridge.project(SessionV1.Event.PromptAdmitted, () =>
        database.db
          .update(SessionTable)
          .set({ title: "actual committed title", time_updated: 150 })
          .where(eq(SessionTable.id, session.id))
          .run()
          .pipe(Effect.orDie, Effect.asVoid),
      )
      const failure = new Error("cache commit failure")
      expect(yield* sessions.admitPrompt(payload, Effect.die(failure)).pipe(Effect.catchDefect(Effect.succeed))).toBe(
        failure,
      )
      expect(core).toEqual([])
      expect(observed).toEqual([])
      expect((yield* sessions.get(session.id)).title).toBe("before")
      expect((yield* sessions.admitPrompt(payload)).created).toBe(true)
      expect(core).toEqual(["session.v1.prompt.admitted"])
      const notifications = observed.map((event) => decode(event))
      expect(notifications.map((item) => item.payload.type)).toEqual(["session.updated", "message.updated", "sync"])
      expect(notifications.find((item) => item.payload.type === "session.updated")?.payload.properties).toMatchObject({
        sessionID: session.id,
        info: { title: "actual committed title", agent: "maestro", time: { updated: 150 } },
      })
      expect(new Set(notifications.map((item) => item.payload.id)).size).toBe(3)
      expect((yield* sessions.admitPrompt(payload, Effect.die(new Error("loser callback must not run")))).created).toBe(
        false,
      )
      expect(observed.map((event) => decode(event))).toEqual(notifications)
      expect(core).toEqual(["session.v1.prompt.admitted"])
    }),
  { git: true },
)
