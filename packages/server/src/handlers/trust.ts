import { ConfigTrust } from "@orchestra/core/config/trust"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { Mcp } from "@orchestra/core/mcp"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { Context, Effect, RcMap } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"

export const TrustHandler = HttpApiBuilder.group(Api, "server.trust", (handlers) =>
  Effect.gen(function* () {
    // Trust is global: approvals are written to the user's config, then every open Location re-applies it.
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const locations = yield* LocationServiceMap.Service
    const applyTrust = Effect.fn(function* () {
      const refs = yield* RcMap.keys(locations.rcMap)
      yield* Effect.forEach(
        refs,
        (ref) =>
          Effect.scoped(
            Effect.gen(function* () {
              const context = yield* locations.contextEffect(ref)
              yield* Context.get(context, Mcp.Service).applyTrust()
            }),
          ).pipe(Effect.ignore),
        { discard: true },
      )
    })
    return handlers
      .handle("trust.list", () =>
        ConfigTrust.list().pipe(
          Effect.provideService(FSUtil.Service, fs),
          Effect.provideService(Global.Service, global),
        ),
      )
      .handle(
        "trust.approve",
        Effect.fn(function* (ctx) {
          yield* ConfigTrust.approve(ctx.payload.directory).pipe(
            Effect.catchTag("ConfigTrust.DirectoryError", (error) =>
              Effect.fail(new InvalidRequestError({ message: error.message })),
            ),
            Effect.provideService(FSUtil.Service, fs),
            Effect.provideService(Global.Service, global),
          )
          yield* applyTrust()
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "trust.revoke",
        Effect.fn(function* (ctx) {
          yield* ConfigTrust.revoke(ctx.payload.directory).pipe(
            Effect.provideService(FSUtil.Service, fs),
            Effect.provideService(Global.Service, global),
          )
          yield* applyTrust()
          return HttpApiSchema.NoContent.make()
        }),
      )
  }),
)
