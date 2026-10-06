import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useSettingsDialog } from "@/components/settings-dialog"
import { createMemo, createResource, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { ModelsProvider } from "@/context/models"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { resolveDefaultModel } from "@/hooks/provider-catalog"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { displayName } from "@/pages/layout/helpers"
import { showToast } from "@/utils/toast"
import { MxBadge, MxPage } from "./kit"
import {
  type CatalogEntry,
  customProvider,
  errorMessage,
  fromV1,
  fromV2,
  matches,
  noteKey,
  pickerEntries,
  popularEntries,
  type ProviderCard,
  routeModel,
} from "./providers-data"
import {
  CustomProviderDialog,
  ProviderBrand,
  ProviderConfirmDialog,
  ProviderConnectDialog,
  ProviderPickerDialog,
} from "./providers-dialogs"
import "./providers.css"

export default function ProvidersPage(props: ChapterPageProps) {
  return (
    <ModelsProvider directory={() => props.directory}>
      <ProvidersScreen {...props} />
    </ModelsProvider>
  )
}

function ProvidersScreen(props: ChapterPageProps) {
  const language = useLanguage()
  const dialog = useDialog()
  // The mock's Models action opens Settings › Models; this page's ModelsProvider backs that panel.
  const openModels = useSettingsDialog("models")
  const sdk = useServerSDK()
  const sync = useServerSync()
  const protocol = useServerProtocol()
  const providers = useProviders(() => props.directory)
  const child = sync().child(props.directory)[0]
  const location = { directory: props.directory }
  // V2 lists only available providers and has no default-model route on every server, so read the raw catalog here.
  const [v2, v2Actions] = createResource(
    () => (protocol() === "v2" ? props.directory : undefined),
    async () => {
      const api = sdk().api
      const [providerList, integrations, models, preferred] = await Promise.all([
        api.provider.list({ location }),
        api.integration.list({ location }),
        api.model.list({ location }),
        api.model
          .default({ location })
          .then((result) => result.data ?? undefined)
          .catch(() => undefined),
      ])
      // A malformed reply becomes this page's load error with Retry instead of crashing the whole app.
      if (![providerList.data, integrations.data, models.data].every(Array.isArray))
        throw new Error("The server returned an unexpected provider catalog.")
      return { providers: providerList.data, integrations: integrations.data, models: models.data, preferred }
    },
  )
  onCleanup(
    sdk().event.on(props.directory, (event) => {
      const type: string = event.type
      if (type === "integration.connection.updated" || type === "catalog.updated") void v2Actions.refetch()
    }),
  )
  const [state, setState] = createStore({
    search: "",
    route: undefined as string | undefined,
    busy: {} as Record<string, boolean>,
  })

  // Label helpers come before the memos below: those run at creation and read them when data is already cached.
  const note = (card: ProviderCard) => {
    const key = noteKey(card.base)
    if (key) return language.t(key)
    if (card.custom) return language.t("orchestra.providers.note.custom")
    return language.t("orchestra.providers.note.models", { count: card.models.length })
  }
  const noteText = (id: string) => {
    const key = noteKey(id)
    return key ? language.t(key) : undefined
  }
  const status = (card: ProviderCard) =>
    language.t(card.connected ? "orchestra.providers.status.connected" : "orchestra.providers.status.disconnected")
  const method = (card: ProviderCard) => {
    if (card.method === "apiKey") return language.t("provider.connect.method.apiKey")
    if (card.method === "environment") return language.t("settings.providers.tag.environment")
    if (card.method === "custom") return language.t("settings.providers.tag.custom")
    if (card.method === "credential") return language.t("orchestra.providers.method.credential")
    return language.t("settings.providers.tag.config")
  }

  // Read the resource only once settled: an unsettled read would suspend the whole chapter route.
  const v2Data = () => (v2.state === "ready" || v2.state === "refreshing" ? v2.latest : undefined)
  const data = createMemo(() => {
    if (protocol() === "v2") {
      const value = v2Data()
      return value ? fromV2(value) : undefined
    }
    if (protocol() !== "v1" || !sync().ready || !child.provider_ready) return
    return fromV1({ all: [...providers.all().values()], connected: providers.connected(), config: sync().data.config })
  })
  const failed = () => protocol() === "v2" && v2.state === "errored"
  const profile = createMemo(() => {
    const project = sync().data.project.find((item) => item.worktree === props.directory)
    return displayName(project ?? { worktree: props.directory })
  })
  const cards = createMemo(() =>
    (data()?.cards ?? []).filter((card) => matches([card.name, note(card), status(card), method(card)], state.search)),
  )
  const popular = createMemo(() => {
    const value = data()
    if (!value) return []
    return popularEntries(value.catalog, value.cards, popularProviders).filter((entry) =>
      matches([entry.name, noteText(entry.id)], state.search),
    )
  })
  const routes = createMemo(() => (data()?.cards ?? []).filter((card) => card.connected && card.models.length))
  // A pending choice shows only while its write is in flight; afterwards the select follows the reloaded
  // directory config, which also reveals a project-level `model` that shadows the server-wide write.
  const route = createMemo(() => {
    if (state.route !== undefined) return state.route
    const preferred = resolveDefaultModel(providers.defaultModel(), child.config.model)
    return routes().find((card) => card.id === preferred?.providerID)?.id ?? ""
  })
  const serverRoute = createMemo(() => {
    const preferred = v2Data()?.preferred
    if (!preferred) return
    return routes().find((card) => card.id === preferred.providerID)?.name ?? preferred.providerID
  })
  const baseName = (card: ProviderCard) => data()?.catalog.find((entry) => entry.id === card.base)?.name ?? card.name

  const refresh = async () => {
    await sync().refreshProviders()
    if (protocol() === "v2") await v2Actions.refetch()
  }
  const requestFailed = (error: unknown) =>
    showToast({
      title: language.t("common.requestFailed"),
      description: errorMessage(error, language.t("common.requestFailed")),
    })

  const openConnect = (id: string, name: string) =>
    dialog.show(() => <ProviderConnectDialog id={id} name={name} directory={props.directory} onConnected={refresh} />)
  const openCustom = () =>
    dialog.show(() => (
      <CustomProviderDialog
        unavailable={protocol() === "v1" ? undefined : language.t("provider.custom.unavailable")}
        onSubmit={async (input) => {
          const existing = new Set([
            ...providers.all().keys(),
            ...(data()?.cards ?? []).map((card) => card.id),
            ...Object.keys(sync().data.config.provider ?? {}),
          ])
          const result = customProvider({ ...input, existing })
          if ("error" in result) {
            if (result.error === "name") return language.t("orchestra.providers.custom.nameError")
            if (result.error === "endpoint") return language.t("orchestra.providers.custom.endpointError")
            return language.t("orchestra.providers.custom.modelError")
          }
          return sync()
            .updateConfig({
              provider: { [result.id]: result.config },
              disabled_providers: (sync().data.config.disabled_providers ?? []).filter((id) => id !== result.id),
            })
            .then(() => undefined)
            .catch((error: unknown) => errorMessage(error, language.t("common.requestFailed")))
        }}
      />
    ))
  const openPicker = () =>
    dialog.show(() => (
      <ProviderPickerDialog
        entries={pickerEntries(data()?.catalog ?? [], popularProviders)}
        onConnect={(entry: CatalogEntry) => openConnect(entry.id, entry.name)}
        onCustom={openCustom}
      />
    ))

  const toggle = (card: ProviderCard) => {
    const action = card.disconnect
    if (action.type === "none" || state.busy[card.id]) return
    if (action.type === "enable") {
      setState("busy", card.id, true)
      void disconnect(card)
        .catch(requestFailed)
        .finally(() => refresh().finally(() => setState("busy", card.id, false)))
      return
    }
    dialog.show(() => (
      <ProviderConfirmDialog
        title={language.t("orchestra.providers.disconnectDialog.title", { provider: card.name })}
        description={language.t("orchestra.providers.disconnectDialog.description", { provider: card.name })}
        submit={language.t("common.disconnect")}
        onConfirm={async () => {
          setState("busy", card.id, true)
          const error = await disconnect(card)
            .then(() => undefined)
            .catch((error: unknown) => errorMessage(error, language.t("common.requestFailed")))
          // Some credentials may be gone even when another removal failed, so always reload.
          await refresh().catch(() => undefined)
          setState("busy", card.id, false)
          if (error) return error
          showToast({
            variant: "success",
            icon: "circle-check",
            title: language.t("provider.disconnect.toast.disconnected.title", { provider: card.name }),
            description: language.t("provider.disconnect.toast.disconnected.description", { provider: card.name }),
          })
        }}
      />
    ))
  }
  // Mirrors the Settings providers panel: V2 removes stored credentials; V1 removes auth or disables a config provider.
  const disconnect = async (card: ProviderCard) => {
    const action = card.disconnect
    const disabled = sync().data.config.disabled_providers ?? []
    if (action.type === "credentials" && protocol() === "v2") {
      await Promise.all(action.ids.map((credentialID) => sdk().api.credential.remove({ credentialID, location })))
      return
    }
    if (action.type === "credentials") {
      const client = sdk().createClient({ directory: props.directory, throwOnError: true })
      await Promise.all(action.ids.map((credentialID) => client.v2.credential.remove({ credentialID, location })))
      return
    }
    if (action.type === "enable") {
      await sync().updateConfig({ disabled_providers: disabled.filter((id) => id !== card.id) })
      return
    }
    if (action.type !== "auth") return
    if (action.custom) {
      await sdk()
        .client.auth.remove({ providerID: card.id })
        .catch(() => undefined)
      await sync().updateConfig({ disabled_providers: disabled.includes(card.id) ? disabled : [...disabled, card.id] })
      return
    }
    await sdk().client.auth.remove({ providerID: card.id }, { throwOnError: true })
    await sdk().client.global.dispose()
  }

  const chooseRoute = async (id: string) => {
    const card = routes().find((item) => item.id === id)
    const model = card && routeModel(card, providers.default()[card.id])
    if (!card || !model) return
    setState("route", card.id)
    await sync()
      .updateConfig({ model: `${card.id}/${model}` })
      .catch(requestFailed)
      .finally(() => setState("route", undefined))
  }

  return (
    <MxPage
      id="orchestra-providers"
      eyebrow={language.t("orchestra.providers.eyebrow", { profile: profile() })}
      title={language.t("orchestra.nav.providers")}
      description={language.t("orchestra.providers.description")}
      action={
        <button type="button" class="mx-btn primary" disabled={!data()} onClick={openPicker}>
          {language.t("orchestra.providers.connect")}
        </button>
      }
    >
      <div class="mx-toolbar">
        <input
          class="mx-search"
          placeholder={language.t("orchestra.providers.search")}
          aria-label={language.t("orchestra.providers.searchLabel")}
          value={state.search}
          onInput={(event) => setState("search", event.currentTarget.value)}
        />
        <MxBadge>
          <bdi>{profile()}</bdi>
        </MxBadge>
      </div>
      <Show when={failed()}>
        <div class="mx-error providers-message" role="alert">
          <span>{language.t("orchestra.providers.error")}</span>
          <button type="button" class="mx-btn" onClick={() => void v2Actions.refetch()}>
            {language.t("orchestra.providers.retry")}
          </button>
        </div>
      </Show>
      <Show when={!data() && !failed()}>
        <p class="mx-note providers-message" role="status">
          {language.t("orchestra.providers.loading")}
        </p>
      </Show>
      <Show when={data()}>
        <Show
          when={protocol() === "v1"}
          fallback={
            <div class="providers-route">
              <span class="providers-route-label">{language.t("orchestra.providers.route")}</span>
              <p class="mx-note" data-providers-route-server>
                <Show when={serverRoute()} fallback={language.t("orchestra.providers.route.serverUnknown")}>
                  {(provider) => language.t("orchestra.providers.route.server", { provider: provider() })}
                </Show>
              </p>
            </div>
          }
        >
          <div class="providers-route">
            <label class="mx-field">
              <span>{language.t("orchestra.providers.route")}</span>
              <select
                data-providers-route
                disabled={state.route !== undefined}
                aria-describedby="orchestra-providers-route-scope"
                onChange={(event) => void chooseRoute(event.currentTarget.value)}
              >
                {/* Selection lives on the options: a select value set before its option exists is lost. */}
                <option value="" selected={route() === ""}>
                  {language.t("orchestra.providers.route.placeholder")}
                </option>
                <For each={routes()}>
                  {(card) => (
                    <option value={card.id} selected={card.id === route()}>
                      {card.name}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <p id="orchestra-providers-route-scope" class="mx-note">
              {language.t("orchestra.providers.route.scope")}
            </p>
          </div>
        </Show>
        <Show when={!cards().length && state.search.trim()}>
          <div class="mx-empty" role="status">
            {language.t("orchestra.providers.noMatches")}
          </div>
        </Show>
        <div class="mx-grid">
          <For each={cards()}>
            {(card) => (
              <article
                class="mx-card"
                data-provider-id={card.id}
                data-status={card.connected ? "connected" : "disconnected"}
                aria-busy={!!state.busy[card.id]}
              >
                <div class="mx-card-top">
                  <span class="mx-mark">
                    <ProviderBrand id={card.base} />
                  </span>
                  <h3>
                    <bdi>{card.name}</bdi>
                  </h3>
                </div>
                <p>{note(card)}</p>
                <div class="mx-meta">
                  <MxBadge tone={card.connected ? "good" : "bad"}>{status(card)}</MxBadge>
                  <MxBadge>{method(card)}</MxBadge>
                </div>
                <footer class="mx-card-foot">
                  <div>
                    <button type="button" class="mx-btn" onClick={() => openConnect(card.base, baseName(card))}>
                      {language.t("orchestra.providers.configure")}
                    </button>{" "}
                    <button type="button" class="mx-btn" onClick={openModels}>
                      {language.t("orchestra.providers.models")}
                    </button>
                  </div>
                  <button
                    type="button"
                    class="mx-btn"
                    disabled={card.disconnect.type === "none" || !!state.busy[card.id]}
                    title={
                      card.method === "environment"
                        ? language.t("settings.providers.connected.environmentDescription")
                        : undefined
                    }
                    onClick={() => toggle(card)}
                  >
                    {language.t(card.connected ? "common.disconnect" : "common.connect")}
                  </button>
                </footer>
              </article>
            )}
          </For>
        </div>
        <h3 class="mx-section">{language.t("orchestra.providers.popular")}</h3>
        <div class="mx-table" data-providers-popular>
          <For
            each={popular()}
            fallback={
              <div class="mx-row">
                <small>{language.t("orchestra.providers.popular.empty")}</small>
              </div>
            }
          >
            {(entry) => (
              <div class="mx-row" data-provider-id={entry.id}>
                <ProviderBrand id={entry.id} />
                <div class="mx-grow">
                  <strong>{entry.name}</strong>
                  <Show when={noteText(entry.id)}>{(text) => <small>{text()}</small>}</Show>
                </div>
                <button type="button" class="mx-btn" onClick={() => openConnect(entry.id, entry.name)}>
                  {language.t("common.connect")}
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </MxPage>
  )
}
