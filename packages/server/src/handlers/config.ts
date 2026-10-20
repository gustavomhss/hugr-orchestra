import { AgentV2 } from "@orchestra/core/agent"
import { Catalog } from "@orchestra/core/catalog"
import { Config } from "@orchestra/core/config"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Shell } from "@orchestra/core/shell"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { Context, Effect, RcMap } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"

export const ConfigHandler = HttpApiBuilder.group(Api, "server.config", (handlers) =>
  Effect.gen(function* () {
    // Settings are global: the document is written with process-global services and every open location reloads.
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const locations = yield* LocationServiceMap.Service
    return handlers
      .handle("config.shells", () => Effect.promise(() => Shell.list()))
      .handle("config.get", () =>
        Config.readGlobal().pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(Global.Service, global)),
      )
      .handle(
        "config.update",
        Effect.fn(function* (ctx) {
          yield* Config.updateGlobal(ctx.payload).pipe(
            Effect.provideService(FSUtil.Service, fs),
            Effect.provideService(Global.Service, global),
          )
          // Agents carry the Maestro engine; the catalog carries the default model and the provider policies.
          const refs = yield* RcMap.keys(locations.rcMap)
          yield* Effect.forEach(
            refs,
            (ref) =>
              Effect.scoped(
                Effect.gen(function* () {
                  const context = yield* locations.contextEffect(ref)
                  yield* Context.get(context, AgentV2.Service).reload()
                  yield* Context.get(context, Catalog.Service).reload()
                }),
              ).pipe(Effect.ignore),
            { discard: true },
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
  }),
)
