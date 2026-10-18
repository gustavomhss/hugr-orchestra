export * as HostCatalog from "./catalog"

import { Context, Effect, Layer } from "effect"
import { CatalogAvailability } from "@orchestra/server/catalog-availability"
import type { Catalog } from "@orchestra/core/catalog"
import { Location } from "@orchestra/core/location"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { Config } from "@/config/config"
import { InstanceStore } from "@/project/instance-store"
import { ClaudeCodeSDK } from "@/claude-code/sdk"

/** V2 catalog lists advertise host execution separately from ordinary API transport availability. */
export const layer = Layer.effectContext(
  Effect.gen(function* () {
    const config = yield* Config.Service
    const instances = yield* InstanceStore.Service
    const sdk = yield* ClaudeCodeSDK.Service
    const status = yield* Effect.cachedWithTTL(
      Effect.gen(function* () {
        const { ClaudeHostProvider } = yield* Effect.promise(() => import("@/claude-code/host/provider"))
        return yield* ClaudeHostProvider.signedIn.pipe(Effect.provideService(ClaudeCodeSDK.Service, sdk))
      }),
      "30 seconds",
    )
    const additional = Effect.fn(function* (catalog: Catalog.Interface) {
      const location = yield* Location.Service
      const settings = yield* instances.provide({ directory: location.directory }, config.get())
      // The app's primary conversation is Maestro; a secondary Claude seat cannot enable its ordinary API picker.
      if (settings.agent?.maestro?.engine !== "claude-code") return []
      if (
        settings.disabled_providers?.includes("anthropic") ||
        (settings.enabled_providers && !settings.enabled_providers.includes("anthropic"))
      )
        return []
      const provider = yield* catalog.provider.get(ProviderV2.ID.anthropic)
      if (!provider || provider.disabled || !(yield* status)) return []
      return [
        { ...provider, api: { ...provider.api, settings: { ...provider.api.settings, executionHost: "claude-code" } } },
      ]
    })
    const preferred = Effect.fn(function* (catalog: Catalog.Interface) {
      if (!(yield* additional(catalog)).length) return undefined
      const location = yield* Location.Service
      const settings = yield* instances.provide({ directory: location.directory }, config.get())
      const configured = settings.agent?.maestro?.model ?? settings.model
      const model = configured?.startsWith("anthropic/")
        ? yield* catalog.model.get(ProviderV2.ID.anthropic, ModelV2.ID.make(configured.slice("anthropic/".length)))
        : undefined
      if (model?.enabled) return model
      return (yield* catalog.model.all()).find((model) => model.providerID === ProviderV2.ID.anthropic && model.enabled)
    })
    return Context.make(CatalogAvailability.AdditionalProviders, additional).pipe(
      Context.add(CatalogAvailability.DefaultModel, preferred),
    )
  }),
)
