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
import { Context, Effect, Layer, Schema } from "effect"

export class Service extends Context.Service<Service, EventV2.Interface>()("@orchestra/EventV2Bridge") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2.Service

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
        const workspaceID = event.location?.workspaceID ?? (yield* WorkspaceRef)
        const route = {
          directory: event.location?.directory ?? ctx?.directory,
          project: ctx?.project.id,
          workspace: workspaceID,
        }
        const admitted =
          event.type === SessionV1.Event.PromptAdmitted.type && event.durable !== undefined
            ? Schema.decodeUnknownSync(SessionV1.Event.PromptAdmitted.data)(event.data)
            : undefined
        if (admitted) {
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
        if (!admitted)
          GlobalBus.emit("event", { ...route, payload: { id: event.id, type: event.type, properties: event.data } })
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
              data: event.data,
            },
          },
        })
      }),
    )
    yield* Effect.addFinalizer(() => unsubscribe)

    return Service.of({ ...events, publish })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [EventV2.node] })

export * as EventV2Bridge from "./event-v2-bridge"
