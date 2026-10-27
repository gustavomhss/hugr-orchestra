import { ProviderIcon } from "@orchestra/ui/provider-icon"
import { useSearchParams } from "@solidjs/router"
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { reconcile } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useModels } from "@/context/models"
import { serverName, type ServerConnection } from "@/context/server"

import { useServerSync } from "@/context/server-sync"
import { popularProviders } from "@/hooks/use-providers"
import { MxBadge, MxToggle } from "@/orchestra/chapters/kit"
import { ProviderList } from "@/orchestra/chapters/providers-list"
import { resolveModelLogo } from "@/orchestra/model-logo-resolver"
import { showToast } from "@/utils/toast"
import { createDefaultModelController } from "../default-model"
import { SettingsGeneralV2 } from "../general"
import { SettingsServersV2 } from "../servers"
import { AgentsSection, McpSection } from "./capabilities-section"
import { TrustedProjectsSection } from "./trust-section"
import {
  contextLabel,
  PERMISSION_ACTIONS,
  PERMISSION_TOOLS,
  permissionAction,
  permissionLock,
  permissionRules,
  permissionWrite,
  SETTINGS_SECTIONS,
  settingsSection,
  type PermissionTool,
  type SettingsSection,
} from "./settings-data"

type PermissionAction = (typeof PERMISSION_ACTIONS)[number]
import { SettingsSec } from "./settings-sec"
import { ShortcutsSection } from "./shortcuts-section"
import "./settings-view.css"

const sectionLabels = {
  permissions: "settings.permissions.title",
  providers: "settings.providers.title",
  models: "settings.models.title",
  agents: "settings.agents.title",
  mcp: "settings.mcp.title",
  shortcuts: "settings.tab.shortcuts",
  general: "settings.tab.general",
  servers: "status.popover.tab.servers",
  trust: "orchestra.settings.trust.title",
} as const

// The routed Settings view (mock `#settings`): a slim masthead, a section rail and one section body.
// The selected section lives in `?section=` so other screens can deep-link to it.
export function SettingsView(props: { server: ServerConnection.Any; directory: string }) {
  const language = useLanguage()
  const [params, setParams] = useSearchParams<{ section?: string }>()
  const section = () => settingsSection(params.section)
  const open = (next: SettingsSection) => setParams({ section: next }, { replace: true })

  return (
    <section class="mx-page orchestra-settings" aria-labelledby="orchestra-settings-title" data-mx-page="settings">
      <div class="inner">
        <header class="mx-heading">
          <div>
            <div class="mx-eyebrow">{language.t("orchestra.settings.eyebrow")}</div>
            <h1 id="orchestra-settings-title">{language.t("orchestra.settings.title")}</h1>
            <p>{language.t("orchestra.settings.subtitle")}</p>
          </div>
        </header>
        <div class="settings">
          <nav class="settings-nav" aria-label={language.t("orchestra.settings.sections")}>
            <For each={SETTINGS_SECTIONS}>
              {(item) => (
                <button
                  type="button"
                  data-sec={item}
                  classList={{ on: section() === item }}
                  aria-current={section() === item ? "page" : undefined}
                  onClick={() => open(item)}
                >
                  {language.t(sectionLabels[item])}
                </button>
              )}
            </For>
          </nav>
          <div class="settings-body" data-section={section()}>
            <Show when={section() === "providers" || section() === "models"}>
              <p class="settings-field-note settings-scope">
                {language.t("orchestra.settings.scope.server", { server: serverName(props.server) })}
              </p>
            </Show>
            <Switch>
              <Match when={section() === "permissions"}>
                <PermissionsSection />
              </Match>
              <Match when={section() === "providers"}>
                <ProviderList server={props.server} directory={props.directory} onModels={() => open("models")}>
                  {(list) => (
                    <SettingsSec
                      title={language.t("settings.providers.title")}
                      description={language.t("orchestra.settings.providers.description")}
                      action={list.connect}
                    >
                      {list.body}
                    </SettingsSec>
                  )}
                </ProviderList>
              </Match>
              <Match when={section() === "models"}>
                <ModelsSection directory={props.directory} onConnect={() => open("providers")} />
              </Match>
              <Match when={section() === "agents"}>
                <AgentsSection server={props.server} directory={props.directory} />
              </Match>
              <Match when={section() === "mcp"}>
                <McpSection directory={props.directory} />
              </Match>
              <Match when={section() === "shortcuts"}>
                <ShortcutsSection />
              </Match>
              <Match when={section() === "general"}>
                <SettingsSec title={language.t("settings.tab.general")}>
                  <div class="settings-inherited">
                    <SettingsGeneralV2 />
                  </div>
                </SettingsSec>
              </Match>
              <Match when={section() === "servers"}>
                <SettingsSec title={language.t("status.popover.tab.servers")}>
                  <div class="settings-inherited">
                    <SettingsServersV2 />
                  </div>
                </SettingsSec>
              </Match>
              <Match when={section() === "trust"}>
                <TrustedProjectsSection />
              </Match>
            </Switch>
          </div>
        </div>
      </div>
    </section>
  )
}

function PermissionsSection() {
  const language = useLanguage()
  const serverSync = useServerSync()
  const rules = () => permissionRules(serverSync().data.config.permissions)
  const set = (tool: PermissionTool, action: PermissionAction) => {
    const current = rules()
    if (permissionAction(current, tool) === action) return
    const result = permissionWrite(current, tool, action)
    if ("locked" in result) return
    // permissionRules returns fresh objects, so `current` stays a detached copy to restore.
    serverSync().set("config", "permissions", reconcile(result.next))
    serverSync()
      .updateConfig({ permissions: result.next })
      .catch((err: unknown) => {
        serverSync().set("config", "permissions", reconcile(current))
        showToast({
          title: language.t("settings.permissions.toast.updateFailed.title"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
  }

  return (
    <SettingsSec
      title={language.t("settings.permissions.title")}
      description={language.t("settings.permissions.description")}
    >
      <p class="settings-note">{language.t("orchestra.settings.permissions.scope")}</p>
      <div class="perm-table">
        <For each={PERMISSION_TOOLS}>
          {(tool) => {
            const current = () => permissionAction(rules(), tool)
            const lock = () => permissionLock(rules(), tool)
            const title = () => language.t(`settings.permissions.tool.${tool}.title`)
            return (
              <div class="perm-tool" data-tool={tool} data-locked={lock()}>
                <div>
                  <div class="tname">{title()}</div>
                  <div class="tdesc">{language.t(`settings.permissions.tool.${tool}.description`)}</div>
                  <Show when={lock()}>
                    {(reason) => (
                      <div class="tnote" id={`perm-lock-${tool}`}>
                        {language.t(`orchestra.settings.permissions.locked.${reason()}`)}
                      </div>
                    )}
                  </Show>
                </div>
                <PermissionSegment
                  label={title()}
                  value={current()}
                  disabled={!!lock()}
                  describedBy={lock() ? `perm-lock-${tool}` : undefined}
                  onChange={(action) => set(tool, action)}
                />
              </div>
            )
          }}
        </For>
      </div>
    </SettingsSec>
  )
}

// A radio group: one tab stop on the checked option; arrow keys, Home and End move and select.
function PermissionSegment(props: {
  label: string
  value: PermissionAction
  disabled: boolean
  describedBy?: string
  onChange: (action: PermissionAction) => void
}) {
  const language = useLanguage()
  const move = (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
    const step = {
      ArrowDown: 1,
      ArrowUp: -1,
      ArrowRight: rtl ? -1 : 1,
      ArrowLeft: rtl ? 1 : -1,
    }[event.key]
    const index = PERMISSION_ACTIONS.indexOf(props.value)
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? PERMISSION_ACTIONS.length - 1
          : step === undefined
            ? undefined
            : (index + step + PERMISSION_ACTIONS.length) % PERMISSION_ACTIONS.length
    if (target === undefined) return
    event.preventDefault()
    props.onChange(PERMISSION_ACTIONS[target])
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[target]?.focus()
  }

  return (
    <div
      class="seg"
      role="radiogroup"
      aria-label={props.label}
      aria-describedby={props.describedBy}
      aria-disabled={props.disabled || undefined}
      onKeyDown={move}
    >
      <For each={PERMISSION_ACTIONS}>
        {(action) => (
          <button
            type="button"
            role="radio"
            data-v={action}
            classList={{ on: props.value === action }}
            aria-checked={props.value === action}
            tabindex={props.value === action ? 0 : -1}
            disabled={props.disabled}
            onClick={() => props.onChange(action)}
          >
            {language.t(`settings.permissions.action.${action}`)}
          </button>
        )}
      </For>
    </div>
  )
}

// Visibility lives in the app-wide model store (the ancestor ModelsProvider), the same one every composer reads.
function ModelsSection(props: { directory: string; onConnect: () => void }) {
  const language = useLanguage()
  const serverSync = useServerSync()
  const models = useModels()
  const defaults = createDefaultModelController(() => props.directory)
  const [query, setQuery] = createSignal("")
  const all = createMemo(() =>
    models
      .list()
      .slice()
      .sort((a, b) => {
        const rank = (id: string) =>
          popularProviders.includes(id) ? popularProviders.indexOf(id) : popularProviders.length
        return (
          rank(a.provider.id) - rank(b.provider.id) ||
          a.provider.name.localeCompare(b.provider.name) ||
          a.name.localeCompare(b.name)
        )
      }),
  )
  const rows = createMemo(() => {
    const term = query().trim().toLowerCase()
    if (!term) return all()
    return all().filter((item) =>
      [item.name, item.id, item.provider.name].some((value) => value.toLowerCase().includes(term)),
    )
  })

  return (
    <SettingsSec
      title={language.t("settings.models.title")}
      description={language.t("orchestra.settings.models.description")}
    >
      <Show
        when={all().length > 0}
        fallback={
          <div class="mx-empty">
            {language.t(
              serverSync().child(props.directory)[0].provider_ready
                ? "orchestra.settings.models.empty"
                : "orchestra.settings.models.loading",
            )}
            <Show when={serverSync().child(props.directory)[0].provider_ready}>
              <br />
              <button type="button" class="mx-btn" onClick={props.onConnect}>
                {language.t("orchestra.settings.providers.connect")}
              </button>
            </Show>
          </div>
        }
      >
        <div class="mx-toolbar">
          <input
            class="mx-search"
            type="search"
            value={query()}
            placeholder={language.t("orchestra.settings.models.search")}
            aria-label={language.t("orchestra.settings.models.search")}
            spellcheck={false}
            autocomplete="off"
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <Show
          when={rows().length > 0}
          fallback={<div class="mx-empty">{language.t("orchestra.settings.models.noMatches")}</div>}
        >
          <div class="mx-table">
            <For each={rows()}>
              {(item) => {
                const key = { providerID: item.provider.id, modelID: item.id }
                const logo = resolveModelLogo({ id: item.id, providerID: item.provider.id }).logo
                const context = contextLabel(item.limit?.context)
                return (
                  <div class="mx-row" data-mx-card data-model={`${item.provider.id}/${item.id}`}>
                    <Show when={logo !== "neutral"} fallback={<NeutralMark />}>
                      <ProviderIcon id={logo} width={22} height={22} class="mx-brand" aria-hidden="true" />
                    </Show>
                    <div class="mx-grow">
                      <strong>{item.name}</strong>
                      <small>
                        {context
                          ? language.t("orchestra.settings.models.meta", { provider: item.provider.name, context })
                          : item.provider.name}
                      </small>
                    </div>
                    <Show
                      when={defaults.isDefault(key)}
                      fallback={
                        <Show when={defaults.writable() && models.visible(key)}>
                          <button
                            type="button"
                            class="mx-btn"
                            aria-label={language.t("orchestra.settings.models.makeDefaultLabel", { model: item.name })}
                            onClick={() => defaults.set(key)}
                          >
                            {language.t("orchestra.settings.models.makeDefault")}
                          </button>
                        </Show>
                      }
                    >
                      <MxBadge tone="good">{language.t("orchestra.settings.models.default")}</MxBadge>
                    </Show>
                    <MxToggle
                      checked={models.visible(key)}
                      label={language.t("orchestra.settings.models.enable", { model: item.name })}
                      onChange={(next) => models.setVisibility(key, next)}
                    />
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </Show>
    </SettingsSec>
  )
}

function NeutralMark() {
  return (
    <svg class="mx-brand" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18M4 7.5l8 4.5 8-4.5"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </svg>
  )
}
