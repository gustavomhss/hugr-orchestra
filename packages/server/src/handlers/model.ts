import { Catalog } from "@orchestra/core/catalog"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"
import { CatalogAvailability } from "@orchestra/core/host/catalog-availability"

export const ModelHandler = HttpApiBuilder.group(Api, "server.model", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "model.list",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const additional = yield* CatalogAvailability.AdditionalProviders
          return yield* response(
            Effect.gen(function* () {
              const available = yield* catalog.model.available()
              const extra = new Set((yield* additional(catalog)).map((provider) => provider.id))
              if (extra.size === 0) return available
              return [
                ...available,
                ...(yield* catalog.model.all()).filter(
                  (model) =>
                    extra.has(model.providerID) &&
                    model.enabled &&
                    !available.some((item) => item.providerID === model.providerID && item.id === model.id),
                ),
              ]
            }),
          )
        }),
      )
      .handle(
        "model.default",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const preferred = yield* CatalogAvailability.DefaultModel
          return yield* response(
            Effect.gen(function* () {
              return (yield* preferred(catalog)) ?? (yield* catalog.model.default()) ?? null
            }),
          )
        }),
      )
  }),
)
