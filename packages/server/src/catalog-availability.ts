export * as CatalogAvailability from "./catalog-availability"

import { Context, Effect } from "effect"
import type { Catalog } from "@orchestra/core/catalog"
import type { Location } from "@orchestra/core/location"
import type { ProviderV2 } from "@orchestra/core/provider"
import type { ModelV2 } from "@orchestra/core/model"

/** Applications can expose execution-host availability without creating an API credential or connection. */
export const AdditionalProviders = Context.Reference<
  (catalog: Catalog.Interface) => Effect.Effect<ProviderV2.Info[], never, Location.Service>
>("@orchestra/server/CatalogAvailability", { defaultValue: () => () => Effect.succeed([]) })

/** A host application may select its configured model without manufacturing an ordinary API connection. */
export const DefaultModel = Context.Reference<
  (catalog: Catalog.Interface) => Effect.Effect<ModelV2.Info | undefined, never, Location.Service>
>("@orchestra/server/CatalogAvailability/DefaultModel", { defaultValue: () => () => Effect.succeed(undefined) })
