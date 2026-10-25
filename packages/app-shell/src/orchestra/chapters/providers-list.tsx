import { useDialog } from "@orchestra/ui/context/dialog"
import { createMemo, createResource, createUniqueId, For, type JSX, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { DialogConnectProvider, useProviderConnectController } from "@/components/dialog-connect-provider"
import { useProviderDialogScope } from "@/components/settings-v2/provider-dialog-scope"
import { useLanguage } from "@/context/language"
import { type ServerConnection, serverName } from "@/context/server"
import { useServerReady, useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { loadDefaultModel } from "@/context/global-sync/bootstrap"
import { refetchProviderResource, resolveDefaultModel } from "@/hooks/provider-catalog"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { displayName } from "@/pages/layout/helpers"
import { showToast } from "@/utils/toast"
import { ClaudeModeSection } from "./claude-mode"
import { MxBadge } from "./kit"
import {
  errorMessage,
  fromV2,
  matches,
  noteKey,
  popularEntries,
  type ProviderCard,
  routeModel,
} from "./providers-data"
import { ProviderBrand, ProviderConfirmDialog } from "./providers-dialogs"
import "./providers.css"

// The one provider list: the Providers chapter and both Settings surfaces render it, so connected cards,
// Configure, confirmed Disconnect and the route for new turns behave the same everywhere. The host lays out
// the parts: `connect` is the Connect provider button, `body` everything below the header.
export function ProviderList(props: {
  server: ServerConnection.Any
  // Empty means server-wide: the list reads the server catalog, not a project store.
  directory: string
  // Opens the Models settings; omitted where there are none to open.
  onModels?: () => void
  // Where Back returns from a provider opened straight from this list (Settings reopens itself).
  onBack?: () => void
  children: (parts: { connect: JSX.Element; profile: () => string; body: JSX.Element }) => JSX.Element
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const sdk = useServerSDK()
  const sync = useServerSync()
  const ready = useServerReady()
  const providers = useProviders(() => props.directory || null)
  const child = props.directory ? sync().child(props.directory)[0] : undefined
  const scope = useProviderDialogScope(() => props.directory || null)
  const connector = useProviderConnectController({ onBack: props.onBack })
  // The chapter and the Settings Providers tab can be mounted together, so the note's id must be unique.
  const routeScope = createUniqueId()
  // V2 lists only available providers and has no default-model route on every server, so read the raw catalog here.
  const [v2, v2Actions] = createResource(
    () => (ready() ? { directory: props.directory, client: sdk(), server: sdk().scope } : undefined),
    async (input) => {
      const api = input.client.api
      const location = input.directory ? { directory: input.directory } : undefined
      const [providerList, integrations, models, preferred] = await Promise.all([
        api.provider.list({ location }),
        api.integration.list({ location }),
        api.model.list({ location }),
        loadDefaultModel(api.model, { location }),
      ])
      // A malformed reply becomes this list's load error with Retry instead of crashing the whole app.
      if (![providerList.data, integrations.data, models.data].every(Array.isArray))
        throw new Error("The server returned an unexpected provider catalog.")
      return { providers: providerList.data, integrations: integrations.data, models: models.data, preferred }
    },
  )
  onCleanup(
    sdk().event.on(props.directory || "global", (event) => {
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
    if (card.method === "credential") return language.t("orchestra.providers.method.credential")
    return language.t("settings.providers.tag.config")
  }

  // Read the resource only once settled: an unsettled read would suspend the host route.
  const v2Data = () => (v2.state === "ready" || v2.state === "refreshing" ? v2.latest : undefined)
  const data = createMemo(() => {
    const value = v2Data()
    return value ? fromV2(value) : undefined
  })
  const failed = () => v2.state === "errored"
  const profile = createMemo(() => {
    if (!props.directory) return serverName(props.server)
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
    const preferred = resolveDefaultModel(providers.defaultModel(), (child?.config ?? sync().data.config).model)
    return routes().find((card) => card.id === preferred?.providerID)?.id ?? ""
  })
  const serverRoute = createMemo(() => {
    const preferred = v2Data()?.preferred
    if (!preferred) return
    return routes().find((card) => card.id === preferred.providerID)?.name ?? preferred.providerID
  })

  const refresh = async () => {
    await providers.refresh()
    await refetchProviderResource(v2, v2Actions, () => language.t("common.requestFailed"))
  }
  const requestFailed = (error: unknown) =>
    showToast({
      title: language.t("common.requestFailed"),
      description: errorMessage(error, language.t("common.requestFailed")),
    })

  // One connect flow everywhere: the full dialog, on a provider or on its picker. show() replaces a Settings
  // dialog under its original opener, so the scope keeps this list's server and directory.
  const connect = (provider?: string) => {
    const target = scope()
    connector.select(provider)
    void dialog.show(
      () => (
        <target.Provider>
          <DialogConnectProvider directory={target.directory} controller={connector} />
        </target.Provider>
      ),
      () => void refresh().catch(() => undefined),
    )
  }

  const toggle = (card: ProviderCard) => {
    const action = card.disconnect
    if (action.type === "none" || state.busy[card.id]) return
    // Pushed, not shown: inside the Settings dialog the question stacks on it instead of replacing it.
    void dialog.push(() => (
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
  const disconnect = (card: ProviderCard) =>
    disconnectProvider(card, {
      sdk: sdk(),
      directory: props.directory,
      failed: language.t("common.requestFailed"),
    })

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

  return props.children({
    profile,
    connect: (
      <button type="button" class="mx-btn primary" onClick={() => connect()}>
        {language.t("orchestra.providers.connect")}
      </button>
    ),
    body: (
      <>
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
            when={false}
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
                  aria-describedby={routeScope}
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
              <p id={routeScope} class="mx-note">
                {language.t("orchestra.providers.route.scope")}
              </p>
            </div>
          </Show>
          <ClaudeModeSection />
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
                      <button type="button" class="mx-btn" onClick={() => connect(card.base)}>
                        {language.t("orchestra.providers.configure")}
                      </button>{" "}
                      <Show when={props.onModels}>
                        <button type="button" class="mx-btn" onClick={() => props.onModels?.()}>
                          {language.t("orchestra.providers.models")}
                        </button>
                      </Show>
                    </div>
                    <button
                      type="button"
                      class="mx-btn"
                      disabled={card.disconnect.type === "none" || !!state.busy[card.id]}
                      title={
                        card.method === "environment"
                          ? language.t("settings.providers.connected.environmentDescription")
                          : card.method === "config" && card.disconnect.type === "none"
                            ? language.t("orchestra.providers.configDescription")
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
                  <button type="button" class="mx-btn" onClick={() => connect(entry.id)}>
                    {language.t("common.connect")}
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </>
    ),
  })
}

// A failed write is never presented as success.
export function disconnectProvider(
  card: ProviderCard,
  input: {
    sdk: ReturnType<ReturnType<typeof useServerSDK>>
    directory: string
    failed: string
  },
) {
  const run = async () => {
    const action = card.disconnect
    const location = input.directory ? { directory: input.directory } : undefined
    if (action.type === "credentials")
      await Promise.all(action.ids.map((credentialID) => input.sdk.api.credential.remove({ credentialID, location })))
  }
  return run().catch(() => {
    throw new Error(input.failed)
  })
}
