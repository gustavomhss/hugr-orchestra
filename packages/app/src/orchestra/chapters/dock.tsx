import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { AppsPanel } from "@/pages/session/apps-panel"
import { appDockController } from "@/pages/session/apps-panel-controller"
import "./dock.css"

// The Dock destination is another view of the window's App Dock: Chat's Apps tab and this page
// attach to the same controller, so moving between them keeps the live tabs of this repository.
export default function DockPage(props: ChapterPageProps) {
  const language = useLanguage()
  const dock = appDockController()

  return (
    <section class="orchestra-dock" aria-labelledby="orchestra-dock-title" data-status={dock.state.status}>
      <header>
        <h1 id="orchestra-dock-title">{language.t("orchestra.nav.dock")}</h1>
        <p>{language.t("orchestra.dock.description")}</p>
      </header>
      <Show
        when={dock.available}
        fallback={
          <p role="status" class="orchestra-dock-message">
            <span>{language.t("orchestra.dock.unavailable")}</span>
          </p>
        }
      >
        <div class="orchestra-dock-toolbar">
          <bdi class="orchestra-dock-directory" title={props.directory}>
            {props.directory}
          </bdi>
          <Show when={dock.state.status === "loading"}>
            <p role="status">{language.t("orchestra.dock.loading")}</p>
          </Show>
          <Show when={dock.state.status === "ready" && dock.state.tabs.length === 0}>
            <p role="status">{language.t("orchestra.dock.empty")}</p>
          </Show>
          <Show when={dock.state.status === "failed"}>
            <div role="alert" class="orchestra-dock-message">
              <p>{language.t("orchestra.dock.loadFailed")}</p>
              <ButtonV2 variant="outline" onClick={dock.retry}>
                {language.t("orchestra.dock.retry")}
              </ButtonV2>
            </div>
          </Show>
        </div>
        <div class="orchestra-dock-browser">
          <AppsPanel />
        </div>
      </Show>
    </section>
  )
}
