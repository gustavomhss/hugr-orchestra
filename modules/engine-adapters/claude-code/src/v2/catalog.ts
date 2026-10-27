export * as ClaudeCodeCatalog from "./catalog"

import type { Catalog } from "@orchestra/core/catalog"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { Config } from "@orchestra/core/config"
import { CatalogAvailability } from "@orchestra/core/host/catalog-availability"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { Context, Effect, Layer } from "effect"

/**
 * In Claude mode (Maestro's engine is `claude-code`) the Anthropic provider is available through the signed-in Claude
 * Code binary, so catalog lists advertise it, and its default model, without an API connection. The sign-in read is
 * cached by `ClaudeCodeAccount`.
 */
export const layer = Layer.effectContext(
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service
    const account = yield* ClaudeCodeAccount.Service

    const maestro = Effect.fn(function* () {
      const location = yield* Location.Service
      const config = yield* Config.Service.pipe(
        Effect.provide(locations.get({ directory: location.directory, workspaceID: location.workspaceID })),
      )
      const entries = yield* config.entries()
      const agents = entries.flatMap((entry) => (entry.type === "document" ? [entry.info.agents?.maestro] : []))
      return {
        engine: agents.findLast((agent) => agent?.engine !== undefined)?.engine,
        model: agents.findLast((agent) => agent?.model !== undefined)?.model ?? Config.latest(entries, "model"),
      }
    })

    const additional = Effect.fn(function* (catalog: Catalog.Interface) {
      // The app's primary conversation is Maestro; a secondary Claude seat cannot enable its ordinary API picker.
      if ((yield* maestro()).engine !== "claude-code") return []
      const provider = yield* catalog.provider.get(ProviderV2.ID.anthropic)
      // `disabled` already carries the disabled/enabled provider policy.
      if (!provider || provider.disabled || !(yield* account.account).signedIn) return []
      return [
        { ...provider, api: { ...provider.api, settings: { ...provider.api.settings, executionHost: "claude-code" } } },
      ]
    })

    const preferred = Effect.fn(function* (catalog: Catalog.Interface) {
      if (!(yield* additional(catalog)).length) return undefined
      const configured = (yield* maestro()).model
      const model = configured?.startsWith("anthropic/")
        ? yield* catalog.model.get(ProviderV2.ID.anthropic, ModelV2.ID.make(configured.slice("anthropic/".length)))
        : undefined
      if (model?.enabled) return model
      return (yield* catalog.model.all()).find((item) => item.providerID === ProviderV2.ID.anthropic && item.enabled)
    })

    return Context.make(CatalogAvailability.AdditionalProviders, additional).pipe(
      Context.add(CatalogAvailability.DefaultModel, preferred),
    )
  }),
)
