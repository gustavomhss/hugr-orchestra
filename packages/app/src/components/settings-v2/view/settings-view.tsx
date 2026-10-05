import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { useSearchParams } from "@solidjs/router"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { ModelsProvider, useModels } from "@/context/models"
import type { ServerConnection } from "@/context/server"
import { useServerProtocol } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { popularProviders } from "@/hooks/use-providers"
import { MxToggle } from "@/orchestra/chapters/kit"
import { resolveModelLogo } from "@/orchestra/model-logo-resolver"
import { showToast } from "@/utils/toast"
import { SettingsGeneralV2 } from "../general"
import { SettingsServersV2 } from "../servers"
import { AgentsSection, McpSection } from "./capabilities-section"
import { ProvidersSection } from "./providers-section"
import {
  contextLabel,
  PERMISSION_ACTIONS,
  PERMISSION_TOOLS,
  permissionAction,
  permissionUpdate,
  SETTINGS_SECTIONS,
  settingsSection,
  type PermissionTool,
  type SettingsSection,
} from "./settings-data"
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
        <header class="mast slim">
          <div>
            <div class="kicker">{language.t("sidebar.settings")}</div>
            <h1 id="orchestra-settings-title">
              {language.t("orchestra.settings.title")}
              <br />
              <span>{language.t("orchestra.settings.subtitle")}</span>
            </h1>
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
            <ModelsProvider directory={() => props.directory}>
              <Switch>
                <Match when={section() === "permissions"}>
                  <PermissionsSection />
                </Match>
                <Match when={section() === "providers"}>
                  <ProvidersSection directory={props.directory} onModels={() => open("models")} />
                </Match>
                <Match when={section() === "models"}>
                  <ModelsSection directory={props.directory} />
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
              </Switch>
            </ModelsProvider>
          </div>
        </div>
      </div>
    </section>
  )
}

function PermissionsSection() {
  const language = useLanguage()
  const serverSync = useServerSync()
  const protocol = useServerProtocol()
  // Tool defaults live in the server's global config, which only the v1 API reads and writes.
  const editable = () => protocol() === "v1"
  const set = (tool: PermissionTool, action: (typeof PERMISSION_ACTIONS)[number]) => {
    const before = serverSync().data.config.permission
    if (permissionAction(before, tool) === action) return
    const next = permissionUpdate(before, tool, action)
    serverSync().set("config", "permission", next)
    serverSync()
      .updateConfig({ permission: next })
      .catch((err: unknown) => {
        serverSync().set("config", "permission", before)
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
      <div class="perm-table">
        <For each={PERMISSION_TOOLS}>
          {(tool) => {
            const current = () => permissionAction(serverSync().data.config.permission, tool)
            const title = () => language.t(`settings.permissions.tool.${tool}.title`)
            return (
              <div class="perm-tool" data-tool={tool}>
                <div>
                  <div class="tname">{title()}</div>
                  <div class="tdesc">{language.t(`settings.permissions.tool.${tool}.description`)}</div>
                </div>
                <div class="seg" role="radiogroup" aria-label={title()}>
                  <For each={PERMISSION_ACTIONS}>
                    {(action) => (
                      <button
                        type="button"
                        role="radio"
                        data-v={action}
                        classList={{ on: current() === action }}
                        aria-checked={current() === action}
                        disabled={!editable()}
                        onClick={() => set(tool, action)}
                      >
                        {language.t(`settings.permissions.action.${action}`)}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            )
          }}
        </For>
      </div>
      <Show when={protocol() === "v2"}>
        <p class="mx-note">{language.t("orchestra.settings.permissions.readOnly")}</p>
      </Show>
    </SettingsSec>
  )
}

function ModelsSection(props: { directory: string }) {
  const language = useLanguage()
  const serverSync = useServerSync()
  const models = useModels()
  const rows = createMemo(() =>
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

  return (
    <SettingsSec
      title={language.t("settings.models.title")}
      description={language.t("orchestra.settings.models.description")}
    >
      <Show
        when={rows().length > 0}
        fallback={
          <div class="mx-empty">
            {language.t(
              serverSync().child(props.directory)[0].provider_ready
                ? "orchestra.settings.models.empty"
                : "orchestra.settings.models.loading",
            )}
          </div>
        }
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
