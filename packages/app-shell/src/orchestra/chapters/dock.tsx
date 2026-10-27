import { Match, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { AppsPanel } from "@/pages/session/apps-panel"
import { appDockController } from "@/pages/session/apps-panel-controller"
import "./kit.css"
import "./dock.css"

// The Dock destination is another view of the window's App Dock: Chat's Apps tab and this page
// attach to the same controller, so moving between them keeps the live tabs of this repository.
// Without the desktop bridge the browser chrome still renders and its page area says so.
export default function DockPage() {
  const language = useLanguage()
  const dock = appDockController(language.t)

  return (
    <section class="orchestra-dock" aria-labelledby="orchestra-dock-title" data-status={dock.state.status}>
      <h1 id="orchestra-dock-title" class="sr-only">
        {language.t("orchestra.nav.dock")}
      </h1>
      <AppsPanel
        placeholder={
          <Switch>
            <Match when={dock.state.status === "loading"}>
              <div class="mx-empty" role="status">
                <strong>{language.t("orchestra.dock.loading")}</strong>
              </div>
            </Match>
            <Match when={dock.state.status === "failed"}>
              <div class="mx-empty" role="alert">
                <strong>{language.t("orchestra.dock.loadFailed")}</strong>
                <button class="mx-btn" type="button" onClick={dock.retry}>
                  {language.t("orchestra.dock.retry")}
                </button>
              </div>
            </Match>
            <Match when={dock.state.status === "ready" && dock.state.tabs.length === 0}>
              <div class="mx-empty" role="status">
                <strong>{language.t("orchestra.dock.page.empty")}</strong>
                <p>{language.t("orchestra.dock.page.emptyHint")}</p>
              </div>
            </Match>
          </Switch>
        }
      />
    </section>
  )
}
