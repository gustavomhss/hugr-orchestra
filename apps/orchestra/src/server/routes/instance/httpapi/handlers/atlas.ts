import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { AtlasSurface } from "@/maestro/atlas-surface"
import { InstanceHttpApi } from "../api"
import { ServiceUnavailableError } from "../errors"

export const atlasHandlers = HttpApiBuilder.group(InstanceHttpApi, "atlas", (handlers) =>
  Effect.gen(function* () {
    const atlas = yield* AtlasSurface.Service
    const unavailable = (error: AtlasSurface.Unavailable) =>
      new ServiceUnavailableError({ service: "atlas", message: error.message })

    return handlers
      .handle("snapshot", () => atlas.snapshot().pipe(Effect.mapError(unavailable)))
      .handle("reasoning", (ctx) => atlas.reasoning(ctx.params.id).pipe(Effect.mapError(unavailable)))
      .handle("own", (ctx) => atlas.own(ctx.query.scope).pipe(Effect.mapError(unavailable)))
      .handle("health", () => atlas.health().pipe(Effect.mapError(unavailable)))
      .handle("promote", (ctx) => atlas.promote(ctx.payload).pipe(Effect.mapError(unavailable)))
      .handle("draft", (ctx) => atlas.draft(ctx.payload).pipe(Effect.mapError(unavailable)))
      .handle("emit", (ctx) => atlas.emit(ctx.payload).pipe(Effect.mapError(unavailable)))
      .handle("link", (ctx) => atlas.link(ctx.payload).pipe(Effect.mapError(unavailable)))
      .handle("verify", (ctx) => atlas.verify(ctx.payload).pipe(Effect.mapError(unavailable)))
  }),
).pipe(Layer.provide(LayerNode.compile(AtlasSurface.node)))
