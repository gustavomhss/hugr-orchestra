import { Match, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { AppsPanel } from "@/pages/session/apps-panel"
import { appDockController } from "@/pages/session/apps-panel-controller"
import "./dock.css"

// The Dock destination is another view of the window's App Dock: Chat's Apps tab and this page
// attach to the same controller, so moving between them keeps the live tabs of this repository.
// Without the desktop bridge the browser chrome still renders and its page area says so.
export default function DockPage() {
  const language = useLanguage()
  const dock = appDockController()

  return (
    <section class="orchestra-dock" aria-labelledby="orchestra-dock-title" data-status={dock.state.status}>
      <h1 id="orchestra-dock-title" class="sr-only">
        {language.t("orchestra.nav.dock")}
      </h1>
      <AppsPanel
        placeholder={
          <Switch>
            <Match when={dock.state.status === "loading"}>
              <div class="zen-empty-state" role="status">
                <strong>{language.t("orchestra.dock.loading")}</strong>
              </div>
            </Match>
            <Match when={dock.state.status === "failed"}>
              <div class="zen-empty-state" role="alert">
                <strong>{language.t("orchestra.dock.loadFailed")}</strong>
                <button class="zen-open-button" type="button" onClick={dock.retry}>
                  {language.t("orchestra.dock.retry")}
                </button>
              </div>
            </Match>
            <Match when={dock.state.status === "ready" && dock.state.tabs.length === 0}>
              <div class="zen-empty-state" role="status">
                <strong>{language.t("orchestra.dock.page.empty")}</strong>
                <span>{language.t("orchestra.dock.page.emptyHint")}</span>
              </div>
            </Match>
          </Switch>
        }
      />
    </section>
  )
}
