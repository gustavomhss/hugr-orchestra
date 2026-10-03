import { For, Match, Show, Switch, createUniqueId, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode-ai/ui/icon"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { AppsPanel, type DockAddressDraft } from "./apps-panel"
import { appDockController, sameTab } from "./apps-panel-controller"
import "./orchestra-dock.css"

export type DockPane = "browser" | "files" | "docs" | "terminal"

const panes = ["browser", "files", "docs", "terminal"] as const
const label = {
  browser: "orchestra.dock.browser",
  files: "orchestra.dock.files",
  docs: "orchestra.dock.docs",
  terminal: "orchestra.dock.terminal",
} as const

// The cockpit's top card. Only the selected pane is mounted: leaving Browser unmounts its view, so
// the controller hides the native tab, and returning shows the same tab and generation again. The
// local panes are factories and nothing runs for a pane until it is selected.
export function OrchestraDock(props: {
  pane: DockPane
  onPaneChange: (pane: DockPane) => void
  files: () => JSX.Element
  docs: () => JSX.Element
  terminal: () => JSX.Element
}) {
  const language = useLanguage()
  const platform = usePlatform()
  const dock = appDockController()
  const id = createUniqueId()
  const [view, setView] = createStore({ draft: undefined as DockAddressDraft | undefined })
  const activeURL = () => dock.state.tabs.find((tab) => sameTab(tab, dock.state.active))?.url

  const keydown = (event: KeyboardEvent & { currentTarget: HTMLButtonElement }, index: number) => {
    const forward = getComputedStyle(event.currentTarget).direction === "rtl" ? "ArrowLeft" : "ArrowRight"
    const backward = forward === "ArrowRight" ? "ArrowLeft" : "ArrowRight"
    const steps: Record<string, number> = {
      [forward]: index + 1,
      [backward]: index - 1,
      Home: 0,
      End: panes.length - 1,
    }
    const next = steps[event.key]
    if (next === undefined) return
    event.preventDefault()
    const pane = panes[(next + panes.length) % panes.length]
    props.onPaneChange(pane)
    document.getElementById(`${id}-tab-${pane}`)?.focus()
  }

  return (
    <section class="orchestra-dock-card" data-pane={props.pane} aria-labelledby={`${id}-title`}>
      <header class="orchestra-dock-header">
        <Icon name="window-cursor" size="small" />
        <h2 id={`${id}-title`}>{language.t("orchestra.nav.dock")}</h2>
        <Show when={props.pane === "browser" && dock.available}>
          <button
            type="button"
            class="orchestra-dock-icon-button"
            aria-label={language.t("orchestra.dock.openExternal")}
            title={language.t("orchestra.dock.openExternal")}
            disabled={!activeURL()}
            onClick={() => {
              const url = activeURL()
              if (url) platform.openExternal(url)
            }}
          >
            <Icon name="square-arrow-top-right" size="small" />
          </button>
        </Show>
      </header>
      <div class="orchestra-dock-tabs" role="tablist" aria-label={language.t("orchestra.dock.panes")}>
        <For each={panes}>
          {(pane, index) => (
            <button
              id={`${id}-tab-${pane}`}
              type="button"
              role="tab"
              aria-selected={props.pane === pane}
              aria-controls={`${id}-panel`}
              tabIndex={props.pane === pane ? 0 : -1}
              onClick={() => props.onPaneChange(pane)}
              onKeyDown={(event) => keydown(event, index())}
            >
              {language.t(label[pane])}
            </button>
          )}
        </For>
      </div>
      <div
        id={`${id}-panel`}
        class="orchestra-dock-pane"
        role="tabpanel"
        aria-labelledby={`${id}-tab-${props.pane}`}
        data-pane={props.pane}
      >
        <Switch>
          <Match when={props.pane === "browser"}>
            <Show
              when={dock.available}
              fallback={
                <div class="orchestra-dock-state" role="status">
                  <strong>{language.t("orchestra.dock.unavailable.title")}</strong>
                  <span>{language.t("orchestra.dock.unavailable.body")}</span>
                </div>
              }
            >
              <Switch>
                <Match when={dock.state.status === "loading"}>
                  <p class="orchestra-dock-note" role="status">
                    {language.t("orchestra.dock.loading")}
                  </p>
                </Match>
                <Match when={dock.state.status === "failed"}>
                  <div class="orchestra-dock-note" role="alert">
                    <span>{language.t("orchestra.dock.loadFailed")}</span>
                    <ButtonV2 size="small" variant="outline" onClick={dock.retry}>
                      {language.t("orchestra.dock.retry")}
                    </ButtonV2>
                  </div>
                </Match>
                <Match when={dock.state.status === "ready" && dock.state.tabs.length === 0}>
                  <p class="orchestra-dock-note" role="status">
                    {language.t("orchestra.dock.empty")}
                  </p>
                </Match>
              </Switch>
              <AppsPanel compact draft={view.draft} onDraftChange={(draft) => setView("draft", draft)} />
            </Show>
          </Match>
          <Match when={props.pane === "files"}>{props.files()}</Match>
          <Match when={props.pane === "docs"}>{props.docs()}</Match>
          <Match when={props.pane === "terminal"}>{props.terminal()}</Match>
        </Switch>
      </div>
    </section>
  )
}
