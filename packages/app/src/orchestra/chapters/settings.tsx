import { SettingsView } from "@/components/settings-v2/view/settings-view"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { For, Match, Show, Switch } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { SettingsGeneralV2 } from "@/components/settings-v2/general"
import { SettingsServersV2 } from "@/components/settings-v2/servers"
import { ShortcutsSection } from "@/components/settings-v2/view/shortcuts-section"
import { SETTINGS_SECTIONS } from "@/components/settings-v2/view/settings-data"

// Routed Settings view (`/orchestra/settings?section=<id>`), registered in chapterPages by the shell.
export default function SettingsPage(props: ChapterPageProps) {
  const language = useLanguage()
  const [params, setParams] = useSearchParams<{ section?: string }>()
  const labels = {
    general: "settings.tab.general",
    servers: "status.popover.tab.servers",
    shortcuts: "settings.tab.shortcuts",
    permissions: "settings.permissions.title",
    providers: "settings.providers.title",
    models: "settings.models.title",
    agents: "settings.agents.title",
    mcp: "settings.mcp.title",
  } as const
  return (
    <Show
      when={props.directory}
      fallback={
        <section class="mx-page orchestra-settings" data-mx-page="settings" aria-labelledby="orchestra-settings-title">
          <div class="inner">
            <h1 id="orchestra-settings-title">{language.t("sidebar.settings")}</h1>
            <div class="settings">
              <nav class="settings-nav" aria-label={language.t("orchestra.settings.sections")}>
                <For each={SETTINGS_SECTIONS}>
                  {(item) => (
                    <button
                      type="button"
                      aria-current={(params.section ?? "general") === item ? "page" : undefined}
                      onClick={() => setParams({ section: item }, { replace: true })}
                    >
                      {language.t(labels[item])}
                    </button>
                  )}
                </For>
              </nav>
              <div class="settings-body settings-inherited">
                <Switch fallback={<p role="status">{language.t("orchestra.shell.settings.repository")}</p>}>
                  <Match when={!params.section || params.section === "general"}>
                    <SettingsGeneralV2 />
                  </Match>
                  <Match when={params.section === "servers"}>
                    <SettingsServersV2 />
                  </Match>
                  <Match when={params.section === "shortcuts"}>
                    <ShortcutsSection />
                  </Match>
                </Switch>
              </div>
            </div>
          </div>
        </section>
      }
    >
      <SettingsView server={props.server} directory={props.directory} />
    </Show>
  )
}
