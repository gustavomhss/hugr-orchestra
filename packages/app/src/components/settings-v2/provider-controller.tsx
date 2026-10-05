import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createMemo, type Accessor } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { showToast } from "@/utils/toast"
import { DialogConnectProvider, useProviderConnectController } from "../dialog-connect-provider"
import { storedCredentials } from "./provider-credentials"

export { providerIdentity } from "./provider-credentials"

type ProviderSource = "env" | "api" | "config" | "custom"
export type ProviderItem = ReturnType<ReturnType<typeof useProviders>["connected"]>[number]

const PROVIDER_NOTES = [
  { match: (id: string) => id === "opencode", key: "dialog.provider.opencode.note" },
  { match: (id: string) => id === "opencode-go", key: "dialog.provider.opencodeGo.tagline" },
  { match: (id: string) => id === "anthropic", key: "dialog.provider.anthropic.note" },
  { match: (id: string) => id.startsWith("github-copilot"), key: "dialog.provider.copilot.note" },
  { match: (id: string) => id === "openai", key: "dialog.provider.openai.note" },
  { match: (id: string) => id === "google", key: "dialog.provider.google.note" },
  { match: (id: string) => id === "openrouter", key: "dialog.provider.openrouter.note" },
  { match: (id: string) => id === "vercel", key: "dialog.provider.vercel.note" },
] as const

// Connected/popular provider state and the connect, disconnect and remove-key actions shared by
// the Settings dialog and the routed Settings view.
export function createProviderSettingsController(input: {
  directory: Accessor<string | undefined>
  onBack?: () => void
}) {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const protocol = useServerProtocol()
  const serverSync = useServerSync()
  const providers = useProviders(input.directory)
  const providerConnect = useProviderConnectController({ onBack: input.onBack })

  const connected = createMemo(() =>
    providers.connected().filter((p) => p.id !== "opencode" || Object.values(p.models).find((m) => m.cost?.input)),
  )

  const popular = createMemo(() => {
    const connectedIDs = new Set(connected().map((p) => p.id))
    const items = providers
      .popular()
      .filter((p) => !connectedIDs.has(p.id))
      .slice()
    items.sort((a, b) => popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id))
    return items
  })

  const source = (item: ProviderItem): ProviderSource | undefined => {
    if (!("source" in item)) return
    const value = item.source
    if (value === "env" || value === "api" || value === "config" || value === "custom") return value
    return
  }

  const isConfigCustom = (providerID: string) => {
    const provider = serverSync().data.config.provider?.[providerID]
    if (!provider) return false
    if (provider.npm !== "@ai-sdk/openai-compatible") return false
    if (!provider.models || Object.keys(provider.models).length === 0) return false
    return true
  }

  const type = (item: ProviderItem) => {
    const current = source(item)
    if (current === "env") return language.t("settings.providers.tag.environment")
    if (current === "api") return language.t("provider.connect.method.apiKey")
    if (current === "config") {
      if (isConfigCustom(item.id)) return language.t("settings.providers.tag.custom")
      return language.t("settings.providers.tag.config")
    }
    if (current === "custom") return language.t("settings.providers.tag.custom")
    return language.t("settings.providers.tag.other")
  }

  const disableProvider = async (providerID: string, name: string) => {
    if (protocol() !== "v1") return
    const before = serverSync().data.config.disabled_providers ?? []
    const next = before.includes(providerID) ? before : [...before, providerID]
    serverSync().set("config", "disabled_providers", next)

    await serverSync()
      .updateConfig({ disabled_providers: next })
      .then(() => disconnected(name))
      .catch((err: unknown) => {
        serverSync().set("config", "disabled_providers", before)
        failed(err)
      })
  }

  const disconnected = (name: string) =>
    showToast({
      variant: "success",
      icon: "circle-check",
      title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
      description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
    })

  const failed = (err: unknown) =>
    showToast({
      title: language.t("common.requestFailed"),
      description: err instanceof Error ? err.message : String(err),
    })

  return {
    providers,
    connected,
    popular,
    type,
    protocol,
    canDisconnect: (item: ProviderItem) => source(item) !== "env" && (protocol() === "v1" || !isConfigCustom(item.id)),
    note: (id: string) => PROVIDER_NOTES.find((item) => item.match(id))?.key,
    connect: (provider?: string) => {
      providerConnect.select(provider)
      void dialog.show(() => <DialogConnectProvider directory={input.directory} controller={providerConnect} />)
    },
    disconnect: async (providerID: string, name: string) => {
      // V2 keeps credentials in the server database; auth.remove only touches the v1 auth file.
      if (protocol() === "v2") {
        const directory = input.directory()
        const location = directory ? { directory } : undefined
        const api = serverSdk().api
        await Promise.all([api.provider.list({ location }), api.integration.list({ location })])
          .then(([providers, integrations]) =>
            storedCredentials({ providerID, providers: providers.data, integrations: integrations.data }),
          )
          .then((ids) => {
            // Environment connections are not stored, so there is nothing to remove for them.
            if (!ids.length) throw new Error(language.t("settings.providers.connected.environmentDescription"))
            return Promise.all(ids.map((credentialID) => api.credential.remove({ credentialID, location })))
          })
          .then(async () => {
            await serverSync().refreshProviders()
            disconnected(name)
          })
          .catch(failed)
        return
      }
      if (isConfigCustom(providerID)) {
        await serverSdk()
          .client.auth.remove({ providerID })
          .catch(() => undefined)
        await disableProvider(providerID, name)
        return
      }
      await serverSdk()
        .client.auth.remove({ providerID })
        .then(async () => {
          await serverSdk().client.global.dispose()
          disconnected(name)
        })
        .catch(failed)
    },
    removeKey: async (credentialID: string, providerName: string) => {
      const directory = input.directory()
      const location = directory ? { directory } : undefined
      const remove =
        protocol() === "v2"
          ? serverSdk().api.credential.remove({ credentialID, location })
          : serverSdk().createClient({ directory, throwOnError: true }).v2.credential.remove({ credentialID, location })
      await remove
        .then(async () => {
          await serverSync().refreshProviders()
          disconnected(providerName)
        })
        .catch(failed)
    },
  }
}
