import { useLanguage } from "@/context/language"
import type { AppDockController } from "./apps-panel-controller"
import type { createLinuxMenuController } from "./linux-menu"

type Props = { dock: AppDockController; menu: ReturnType<typeof createLinuxMenuController> }

// Switches the Dock between its browser and Linux workspace sides.
export function DockModes(props: Props & { compact?: boolean }) {
  const language = useLanguage()
  const linux = () => props.dock.state.mode === "linux"
  const openable = () => typeof props.dock.api?.appDockLinuxOpen === "function"
  return (
    <>
      {/* The cockpit card already names its panes as tabs (Browser among them), so there the Linux
          workspace is a toggle instead of a second tab list with a second Browser tab. */}
      {props.compact ? (
        <div class="zen-dock-modes">
          <button
            type="button"
            aria-pressed={linux()}
            disabled={!linux() && (props.menu.blocked() || !openable())}
            class={linux() ? "is-active" : ""}
            onClick={() => (linux() ? props.dock.showBrowser() : void props.menu.run({ type: "open" }))}
          >
            <span aria-hidden="true">▣</span>
            {language.t("appDock.linux.workspace")}
          </button>
        </div>
      ) : (
        <div class="zen-dock-modes" role="tablist" aria-label={language.t("appDock.contexts")}>
          <button
            type="button"
            role="tab"
            aria-selected={!linux()}
            class={!linux() ? "is-active" : ""}
            onClick={() => props.dock.showBrowser()}
          >
            <span aria-hidden="true">◎</span>
            {language.t("appDock.browser.title")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={linux()}
            disabled={props.menu.blocked() || !openable()}
            class={linux() ? "is-active" : ""}
            onClick={() => void props.menu.run({ type: "open" })}
          >
            <span aria-hidden="true">▣</span>
            {language.t("appDock.linux.workspace")}
          </button>
        </div>
      )}
    </>
  )
}

// The Linux side's toolbar: which app window has focus, reconnect, and close the workspace.
export function LinuxToolbar(props: Props) {
  const language = useLanguage()
  return (
    <div class="zen-native-toolbar">
      <strong title={language.t("appDock.linux.shared")}>
        <bdi>{language.t("appDock.linux.workspace")}</bdi>
      </strong>
      <select
        class="zen-window-picker"
        aria-label={language.t("appDock.linux.windows")}
        disabled={props.dock.state.focusing || props.dock.state.windows.length === 0}
        value={props.dock.state.windows.find((window) => window.focused)?.id ?? ""}
        onChange={(event) => void props.dock.focusWindow(Number(event.currentTarget.value))}
      >
        {props.dock.state.windows.length === 0 && (
          <option value="">{language.t(props.menu.store.busy ? "common.loading" : "appDock.linux.noWindows")}</option>
        )}
        {props.dock.state.windows.map((window) => (
          <option value={window.id}>{window.title}</option>
        ))}
      </select>
      <button
        class="zen-nav-button"
        type="button"
        title={language.t("appDock.linux.reconnect")}
        aria-label={language.t("appDock.linux.reconnect")}
        disabled={props.menu.blocked()}
        onClick={() => void props.menu.run({ type: "open" })}
      >
        ↻
      </button>
      {props.dock.state.active && (
        <button
          class="zen-nav-button"
          type="button"
          aria-label={language.t("appDock.linux.closeWorkspace")}
          title={language.t("appDock.linux.closeWorkspace")}
          onClick={() => void props.dock.close()}
        >
          ×
        </button>
      )}
    </div>
  )
}
