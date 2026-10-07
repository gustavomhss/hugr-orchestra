import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { resolveDefaultModel } from "@/hooks/provider-catalog"
import { MxBadge } from "@/orchestra/chapters/kit"
import { showToast } from "@/utils/toast"
import { createProviderSettingsController, providerIdentity, type ProviderItem } from "../provider-controller"
import { routeModel } from "./settings-data"
import { SettingsSec } from "./settings-sec"

export function ProvidersSection(props: { directory: string; onModels: () => void }) {
  const language = useLanguage()
  const serverSync = useServerSync()
  const controller = createProviderSettingsController({ directory: () => props.directory })
  // New turns start on the configured default model; the directory config already merges the global one.
  const current = createMemo(() =>
    resolveDefaultModel(
      controller.providers.defaultModel(),
      serverSync().child(props.directory)[0].config.model ?? serverSync().data.config.model,
    ),
  )
  const routes = createMemo(() =>
    controller.providers.connected().filter((item) => !providerIdentity(item.id).credentialID),
  )
  // Only the v1 API writes the global config.
  const routeBlocked = () => {
    if (controller.protocol() === "v2") return "orchestra.settings.providers.routeReadOnly" as const
    if (routes().length === 0 && serverSync().child(props.directory)[0].provider_ready)
      return "orchestra.settings.providers.routeNone" as const
    return undefined
  }
  // The route is the provider of that model.
  const setRoute = (providerID: string) => {
    const provider = routes().find((item) => item.id === providerID)
    if (!provider) return
    const model = routeModel({ provider, defaults: controller.providers.default(), current: current() })
    if (!model) return
    const [directory, setDirectory] = serverSync().child(props.directory)
    const before = { global: serverSync().data.config.model, directory: directory.config.model }
    serverSync().set("config", "model", model)
    setDirectory("config", "model", model)
    serverSync()
      .updateConfig({ model })
      .catch((err: unknown) => {
        serverSync().set("config", "model", before.global)
        setDirectory("config", "model", before.directory)
        showToast({
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
  }
  const note = (item: { id: string; models: Record<string, unknown> }) => {
    const key = controller.note(providerIdentity(item.id).baseID)
    if (key) return language.t(key)
    const count = Object.keys(item.models).length
    if (count === 1) return language.t("orchestra.settings.providers.model")
    return language.t("orchestra.settings.providers.models", { count })
  }

  return (
    <SettingsSec
      title={language.t("settings.providers.title")}
      description={language.t("orchestra.settings.providers.description")}
      action={
        <button type="button" class="mx-btn" onClick={() => controller.connect()}>
          {language.t("orchestra.settings.providers.connect")}
        </button>
      }
    >
      <label class="mx-field settings-route">
        <span>{language.t("orchestra.settings.providers.route")}</span>
        <select
          data-mx-route
          value={current()?.providerID ?? ""}
          disabled={controller.protocol() !== "v1" || routes().length === 0}
          onChange={(event) => setRoute(event.currentTarget.value)}
        >
          <option value="">{language.t("orchestra.settings.providers.routeEmpty")}</option>
          <For each={routes()}>
            {(item) => (
              <option value={item.id} selected={item.id === current()?.providerID}>
                {item.name}
              </option>
            )}
          </For>
        </select>
        <Show when={routeBlocked()}>
          {(reason) => <small class="settings-field-note">{language.t(reason())}</small>}
        </Show>
      </label>
      <Show when={controller.connected().length > 0}>
        <div class="mx-grid">
          <For each={controller.connected()}>
            {(item) => <ProviderCard item={item} note={note(item)} controller={controller} onModels={props.onModels} />}
          </For>
        </div>
      </Show>
      <h3 class="mx-section">{language.t("settings.providers.section.popular")}</h3>
      <div class="mx-table">
        <For
          each={controller.popular()}
          fallback={
            <div class="mx-row">
              <small>
                {language.t(
                  serverSync().child(props.directory)[0].provider_ready
                    ? "orchestra.settings.providers.allListed"
                    : "orchestra.settings.providers.loading",
                )}
              </small>
            </div>
          }
        >
          {(item) => (
            <div class="mx-row" data-mx-card data-provider={item.id}>
              <ProviderIcon id={item.id} width={22} height={22} class="mx-brand" aria-hidden="true" />
              <div class="mx-grow">
                <strong>{item.name}</strong>
                <small>{note(item)}</small>
              </div>
              <button type="button" class="mx-btn" onClick={() => controller.connect(item.id)}>
                {language.t("common.connect")}
              </button>
            </div>
          )}
        </For>
      </div>
    </SettingsSec>
  )
}

function ProviderCard(props: {
  item: ProviderItem
  note: string
  controller: ReturnType<typeof createProviderSettingsController>
  onModels: () => void
}) {
  const language = useLanguage()
  const identity = providerIdentity(props.item.id)
  return (
    <article class="mx-card" data-mx-card data-provider={props.item.id}>
      <div class="mx-card-top">
        <span class="mx-mark">
          <ProviderIcon id={identity.baseID} width={22} height={22} class="mx-brand" aria-hidden="true" />
        </span>
        <h3>{props.item.name}</h3>
      </div>
      <p>{props.note}</p>
      <div class="mx-meta">
        <MxBadge tone="good">{language.t("orchestra.settings.providers.connected")}</MxBadge>
        <MxBadge>{props.controller.type(props.item)}</MxBadge>
      </div>
      <footer class="mx-card-foot">
        <div>
          <button type="button" class="mx-btn" onClick={() => props.controller.connect(identity.baseID)}>
            {language.t("orchestra.settings.configure")}
          </button>{" "}
          <button type="button" class="mx-btn" onClick={props.onModels}>
            {language.t("settings.models.title")}
          </button>
        </div>
        <Show
          when={identity.credentialID}
          fallback={
            <button
              type="button"
              class="mx-btn"
              disabled={!props.controller.canDisconnect(props.item)}
              title={
                props.controller.canDisconnect(props.item)
                  ? undefined
                  : language.t("settings.providers.connected.environmentDescription")
              }
              onClick={() => void props.controller.disconnect(props.item.id, props.item.name)}
            >
              {language.t("common.disconnect")}
            </button>
          }
        >
          {(credential) => (
            <button
              type="button"
              class="mx-btn"
              onClick={() => void props.controller.removeKey(credential(), props.item.name)}
            >
              {language.t("common.disconnect")}
            </button>
          )}
        </Show>
      </footer>
    </article>
  )
}
