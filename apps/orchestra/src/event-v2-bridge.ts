// Orchestra publish boundary for core events. Attach routed instance location
// so direct EventV2 consumers can isolate directory/workspace streams.
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
import { GlobalBus } from "@/bus/global"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV1 } from "@orchestra/core/v1/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { Database } from "@orchestra/core/database/database"
import { SessionTable } from "@orchestra/core/session/sql"
import type { SessionID } from "@/session/schema"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema } from "effect"

export class Service extends Context.Service<Service, EventV2.Interface>()("@orchestra/EventV2Bridge") {}

const layer: Layer.Layer<Service, never, EventV2.Service | Database.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const database = yield* Database.Service

    const publish: EventV2.Interface["publish"] = (definition, data, options) =>
      Effect.gen(function* () {
        if (options?.location) return yield* events.publish(definition, data, options)
        const ctx = yield* InstanceRef
        if (!ctx) return yield* events.publish(definition, data, options)
        const workspaceID = yield* WorkspaceRef
        return yield* events.publish(definition, data, {
          ...options,
          location: new Location.Info({
            directory: AbsolutePath.make(ctx.directory),
            ...(workspaceID ? { workspaceID } : {}),
            project: { id: Project.ID.make(ctx.project.id), directory: AbsolutePath.make(ctx.worktree) },
          }),
        })
      })

    const unsubscribe = yield* events.listen((event) =>
      Effect.gen(function* () {
        const ctx = yield* InstanceRef
        const explicit = event.location
        const project =
          explicit && typeof explicit === "object" && "project" in explicit
            ? Schema.decodeUnknownOption(Schema.Struct({ project: Schema.Struct({ id: Schema.String }) }))(explicit)
            : undefined
        const route = {
          directory: explicit ? explicit.directory : ctx?.directory,
          project: explicit
            ? project && Option.isSome(project)
              ? project.value.project.id
              : undefined
            : ctx?.project.id,
          workspace: explicit ? explicit.workspaceID : yield* WorkspaceRef,
        }
        // Legacy consumers such as the TUI follow only session.updated; send them the committed row.
        const updated = Effect.fnUntraced(function* (sessionID: SessionID) {
          const row = yield* database.db
            .select()
            .from(SessionTable)
            .where(eq(SessionTable.id, sessionID))
            .get()
            .pipe(Effect.orDie)
          if (!row) return
          const { Session } = yield* Effect.promise(() => import("@/session/session"))
          GlobalBus.emit("event", {
            ...route,
            payload: {
              id: EventV2.ID.create(),
              type: SessionV1.Event.Updated.type,
              properties: { sessionID, info: Session.fromRow(row) },
            },
          })
        })
        const admitted =
          event.type === SessionV1.Event.PromptAdmitted.type && event.durable !== undefined
            ? Schema.decodeUnknownSync(SessionV1.Event.PromptAdmitted.data)(event.data)
            : undefined
        if (admitted) {
          if (admitted.transition) yield* updated(admitted.sessionID)
          GlobalBus.emit("event", {
            ...route,
            payload: {
              id: EventV2.ID.create(),
              type: SessionV1.Event.MessageUpdated.type,
              properties: { sessionID: admitted.sessionID, info: admitted.info },
            },
          })
          admitted.parts.forEach((part) =>
            GlobalBus.emit("event", {
              ...route,
              payload: {
                id: EventV2.ID.create(),
                type: SessionV1.Event.PartUpdated.type,
                properties: { sessionID: admitted.sessionID, part, time: admitted.info.time.created },
              },
            }),
          )
        }
        // Listeners receive decoded data, where a DateTime serializes as an ISO string. Consumers of this event decode
        // epoch millis (the app's live decoder and workspace replay), so send its encoded form.
        const archived =
          event.type === SessionEvent.ArchiveChanged.type && Schema.is(SessionEvent.ArchiveChanged.data)(event.data)
            ? event.data
            : undefined
        const data = archived ? Schema.encodeSync(SessionEvent.ArchiveChanged.data)(archived) : event.data
        if (!admitted)
          GlobalBus.emit("event", { ...route, payload: { id: event.id, type: event.type, properties: data } })
        if (event.durable === undefined) return
        GlobalBus.emit("event", {
          ...route,
          payload: {
            type: "sync",
            syncEvent: {
              id: event.id,
              type: EventV2.versionedType(event.type, event.durable.version),
              seq: event.durable.seq,
              aggregateID: event.durable.aggregateID,
              data,
            },
          },
        })
        if (archived) yield* updated(archived.sessionID)
      }),
    )
    yield* Effect.addFinalizer(() => unsubscribe)

    return Service.of({ ...events, publish })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [EventV2.node, Database.node] })

export * as EventV2Bridge from "./event-v2-bridge"
