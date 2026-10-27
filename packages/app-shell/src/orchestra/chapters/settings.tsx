import { SettingsView } from "@/components/settings-v2/view/settings-view"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { For, Match, Show, Switch } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { SettingsGeneralV2 } from "@/components/settings-v2/general"
import { SettingsServersV2 } from "@/components/settings-v2/servers"
import { ShortcutsSection } from "@/components/settings-v2/view/shortcuts-section"
import { TrustedProjectsSection } from "@/components/settings-v2/view/trust-section"
import { GLOBAL_SETTINGS_SECTIONS, globalSettingsSection } from "@/components/settings-v2/view/settings-data"

// Routed Settings view (`/orchestra/settings?section=<id>`), registered in chapterPages by the shell. With no project
// open only the server-wide tabs are offered; the project tabs appear once a project is open (SettingsView).
export default function SettingsPage(props: ChapterPageProps) {
  const language = useLanguage()
  const [params, setParams] = useSearchParams<{ section?: string }>()
  const labels = {
    general: "settings.tab.general",
    servers: "status.popover.tab.servers",
    shortcuts: "settings.tab.shortcuts",
    trust: "orchestra.settings.trust.title",
  } as const
  return (
    <Show
      when={props.directory}
      fallback={
        <section class="mx-page orchestra-settings" data-mx-page="settings" aria-labelledby="orchestra-settings-title">
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
                <For each={GLOBAL_SETTINGS_SECTIONS}>
                  {(item) => (
                    <button
                      type="button"
                      classList={{ on: globalSettingsSection(params.section) === item }}
                      aria-current={globalSettingsSection(params.section) === item ? "page" : undefined}
                      onClick={() => setParams({ section: item }, { replace: true })}
                    >
                      {language.t(labels[item])}
                    </button>
                  )}
                </For>
              </nav>
              <div class="settings-body settings-inherited">
                <Switch>
                  <Match when={globalSettingsSection(params.section) === "general"}>
                    <SettingsGeneralV2 />
                  </Match>
                  <Match when={globalSettingsSection(params.section) === "servers"}>
                    <SettingsServersV2 />
                  </Match>
                  <Match when={globalSettingsSection(params.section) === "shortcuts"}>
                    <ShortcutsSection />
                  </Match>
                  <Match when={globalSettingsSection(params.section) === "trust"}>
                    <TrustedProjectsSection />
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
