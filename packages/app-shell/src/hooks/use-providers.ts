import { useServerSync } from "@/context/server-sync"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { useLanguage } from "@/context/language"
import { decode64 } from "@/utils/base64"
import { useParams } from "@solidjs/router"
import { Iterable, pipe } from "effect"
import { type Accessor } from "solid-js"
import { createProviderResource, selectProviderCatalog } from "./provider-catalog"

export const popularProviders = ["anthropic", "github-copilot", "openai", "google", "openrouter", "vercel"]
const popularProviderSet = new Set(popularProviders)

// Omitted accessor follows the route; undefined from an accessor is unresolved; null is server-wide.
export function useProviders(directory?: Accessor<string | null | undefined>) {
  const serverSync = useServerSync()
  const language = useLanguage()
  const params = useParams()
  const dir = () => (directory ? directory() : params.dir === undefined ? null : decode64(params.dir))
  const providers = () => {
    const value = dir()
    const projectStore = value ? serverSync().child(value)[0] : undefined
    if (value !== null)
      return selectProviderCatalog({
        explicit: true,
        directory: value,
        catalog: projectStore && { ready: projectStore.provider_ready, providers: projectStore.provider },
      })
    return selectProviderCatalog({
      explicit: false,
      directory: value ?? undefined,
      catalog: projectStore && { ready: projectStore.provider_ready, providers: projectStore.provider },
      global: serverSync().data.provider,
    })
  }

  return {
    directory: dir,
    refresh: async () => {
      const value = dir()
      if (value !== null && !value) throw new Error(language.t("common.requestFailed"))
      await serverSync().refreshProviders(value ?? null)
    },
    all: () => providers().all,
    default: () => providers().default,
    defaultModel: () => providers().defaultModel,
    popular: () =>
      pipe(
        providers().all,
        Iterable.map(([, p]) => p),
        Iterable.filter((p) => popularProviderSet.has(p.id)),
        (v) => Array.from(v),
      ),
    connected: () => {
      const connected = new Set(providers().connected)
      return pipe(
        providers().all,
        Iterable.map(([, p]) => p),
        Iterable.filter((p) => connected.has(p.id)),
        (v) => Array.from(v),
      )
    },
    paid: () => {
      const connected = new Set(providers().connected)
      return [...Iterable.filter(providers().all, ([id]) => connected.has(id))]
    },
  }
}

export function useProviderDiscovery(directory?: Accessor<string | null | undefined>) {
  const providers = useProviders(directory)
  const sdk = useServerSDK()
  const protocol = useServerProtocol()
  const integrations = createProviderResource(
    () => {
      const value = providers.directory()
      const client = sdk()
      if (protocol() !== "v2" || value === undefined) return
      return { directory: value, client, server: client.scope }
    },
    (input) =>
      input.client.api.integration
        .list({ location: input.directory ? { directory: input.directory } : undefined })
        .then((result) => result.data.map((item) => ({ id: item.id, name: item.name }))),
  )
  return {
    all: () => (integrations.data() ?? []),
    loading: () => !protocol() || providers.directory() === undefined || integrations.loading(),
    error: integrations.error,
    retry: integrations.retry,
  }
}
