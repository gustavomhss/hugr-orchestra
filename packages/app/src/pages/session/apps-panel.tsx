import { createMediaQuery } from "@solid-primitives/media"
import { createEffect, createMemo, on, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"
import { pathKey } from "@/utils/path-key"
import {
  appDockController,
  appDockProfile,
  isLinux,
  sameTab,
  tabLabel,
  type AppDockAPI,
  type Bookmark,
  type Tab,
  type TabIdentity,
} from "./apps-panel-controller"
import { bounds, createAppDockBoundsSync } from "./apps-panel-resize"
import { TabMenu } from "./apps-panel-tab-menu"
import { createLinuxMenuController, LinuxMenu } from "./linux-menu"
import "./apps-panel.css"

const sidebarCollapsedKey = "opencode.app-dock.sidebar-collapsed"
export type DockAddressDraft = { owner?: string; tab?: TabIdentity; value: string }

// A view of the window's App Dock. The live tabs belong to the controller and the repository
// profile in context, so unmounting this view hides the native browser instead of closing it.
// The compact view is the cockpit's Dock card: tabs above the address bar and only the core controls.
export function AppsPanel(
  props: {
    compact?: boolean
    draft?: DockAddressDraft
    onDraftChange?: (draft: DockAddressDraft | undefined) => void
  } = {},
) {
  const dock = appDockController()
  const api = dock.api
  const state = dock.state
  const serverSDK = useServerSDK()
  const sdk = useSDK()
  const global = useGlobal()
  const settings = useSettings()
  const language = useLanguage()
  const desktop = createMediaQuery("(min-width: 768px)")
  // Orchestra's desktop workspace (the titlebar's profile-scoped tab mode) binds the Dock to the
  // repository profile. Everywhere else the Apps panel keeps its manual browser profiles.
  const repository = () => settings.general.newLayoutDesigns() && desktop()
  // Sessions in a sandbox share the profile of their project worktree, like the sidebar profile.
  const profile = createMemo(() => {
    if (!repository()) return
    const server = serverSDK().server
    const directory = pathKey(sdk().directory)
    const project = global
      .ensureServerCtx(server)
      .projects.list()
      .find(
        (item) =>
          pathKey(item.worktree) === directory || item.sandboxes?.some((sandbox) => pathKey(sandbox) === directory),
      )
    return appDockProfile(ServerConnection.key(server), project?.worktree ?? sdk().directory)
  })
  const [view, setView] = createStore({
    libraryOpen: undefined as "bookmarks" | "history" | undefined,
    findOpen: false,
    findText: "",
    findResult: undefined as { requestID: number; activeMatchOrdinal: number; matches: number } | undefined,
    downloadsOpen: false,
    sidebarCollapsed: localStorage.getItem(sidebarCollapsedKey) === "true",
    menu: undefined as { tab: Tab; x: number; y: number; rtl: boolean; invoker: HTMLButtonElement } | undefined,
    profileCreating: false,
    profileDraft: "",
  })
  let findRequestID: number | undefined
  let root: HTMLDivElement | undefined
  let host: HTMLDivElement | undefined
  let menuElement: HTMLDivElement | undefined
  let addressInput: HTMLInputElement | undefined
  const capability = (name: keyof AppDockAPI) => typeof api?.[name] === "function"
  const ready = () => state.status === "ready"
  const activeLinux = () => state.mode === "linux"
  const linuxMenu = createLinuxMenuController({
    api,
    get profile() {
      return state.profile ?? ""
    },
    generation: () => state.linuxIntent,
    get disabled() {
      return !ready()
    },
    open: dock.openLinux,
    onLaunched: dock.refreshWindows,
  })
  const closeMenu = (restoreFocus = true) => {
    const invoker = view.menu?.invoker
    setView("menu", undefined)
    if (restoreFocus) requestAnimationFrame(() => invoker?.focus())
  }
  const resize = createAppDockBoundsSync({
    snapshot: () => {
      const tab = state.active
      return tab && host && dock.owns(host)
        ? { tab, bounds: bounds(host), resize: (next) => dock.resize(tab, next) }
        : undefined
    },
    // A visible native view can leave its owner document hidden, which suspends animation frames; a
    // microtask still coalesces a burst of layout changes into one measurement.
    requestAnimationFrame: (callback) => {
      queueMicrotask(callback)
      return 0
    },
    cancelAnimationFrame: () => undefined,
  })
  createEffect(
    on(profile, (id) => {
      if (host) onCleanup(dock.attach(host, id))
    }),
  )
  // Resizes reach only the tab they name. A tab the desktop attached while one was in flight (a new
  // tab, a popup or a recovery) is measured again once it becomes active here.
  createEffect(
    on(
      () => state.active,
      () => resize.request(),
      { defer: true },
    ),
  )
  onMount(() => {
    // Linux windows open and close inside the workspace without a Dock event; keep the picker current.
    const windows = setInterval(() => {
      if (activeLinux() && !linuxMenu.store.busy) void dock.refreshWindows()
    }, 2000)
    const unsubscribeFind = api?.appDockFindResult?.((result) => {
      if (!activeLinux() && sameTab(result, state.active) && result.requestID === findRequestID) setView("findResult", result)
    })
    const observer = new ResizeObserver(resize.request)
    if (host) observer.observe(host)
    // ResizeObserver does not report position-only layout changes.
    window.addEventListener("resize", resize.request)
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || !(root?.contains(target) || menuElement?.contains(target))) return
      const editable = !!target.closest("input, textarea, select, [contenteditable]")
      if (event.key === "Escape") {
        if (view.menu) closeMenu()
        else if (view.findOpen) closeFind()
        else if (view.libraryOpen) setView("libraryOpen", undefined)
        else if (view.downloadsOpen) setView("downloadsOpen", false)
        else return
        event.preventDefault()
        return
      }
      if (editable) return
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() === "l") {
        event.preventDefault()
        if (activeLinux()) return
        addressInput?.focus()
        addressInput?.select()
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault()
        void dock.openNewTab()
      } else if (event.key.toLowerCase() === "w" && state.active) {
        event.preventDefault()
        void dock.close()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    const insideMenu = (target: EventTarget | null) => target instanceof Node && menuElement?.contains(target)
    const onPointerDown = (event: PointerEvent) => {
      if (view.menu && !insideMenu(event.target)) closeMenu(false)
    }
    const onFocusIn = (event: FocusEvent) => {
      if (view.menu && !insideMenu(event.target)) closeMenu(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("focusin", onFocusIn)
    onCleanup(() => {
      clearInterval(windows)
      if (view.findOpen) closeFind()
      observer.disconnect()
      window.removeEventListener("resize", resize.request)
      resize.dispose()
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("focusin", onFocusIn)
      unsubscribeFind?.()
    })
  })
  const activeTab = () => state.tabs.find((tab) => sameTab(tab, state.active))
  const address = () => {
    const draft = props.draft
    return draft && draft.owner === state.owner && (draft.tab ? sameTab(draft.tab, state.active) : !state.active)
      ? draft.value
      : state.url
  }
  const activeCrashed = () => activeTab()?.crashed
  const bookmarked = () => !activeLinux() && !!activeTab() && state.bookmarks.some((item) => item.url === activeTab()!.url)
  const toggleSidebar = () => {
    const next = !view.sidebarCollapsed
    setView("sidebarCollapsed", next)
    localStorage.setItem(sidebarCollapsedKey, String(next))
  }
  const find = async (forward: boolean) => {
    const tab = state.active
    if (!tab || activeLinux() || !view.findText.trim()) return
    setView("findResult", undefined)
    findRequestID = await api?.appDockFind(tab.tabID, view.findText, forward)
  }
  const closeFind = () => {
    const tab = state.active
    if (tab && !activeLinux()) void api?.appDockStopFind(tab.tabID)
    findRequestID = undefined
    setView({ findOpen: false, findResult: undefined })
  }
  const zoom = (delta: number) => {
    const tab = state.active
    if (!tab || activeLinux()) return
    void api?.appDockZoom(tab.tabID).then((factor) => api.appDockZoom(tab.tabID, factor + delta))
  }
  const toggleFullscreen = () => {
    const tab = state.active
    if (tab) void api?.appDockFullscreen(tab.tabID, !state.fullscreen)
  }
  const openLibraryItem = (entry: Bookmark) => {
    setView("libraryOpen", undefined)
    void dock.openLibraryItem(entry)
  }
  const createProfile = (event: SubmitEvent) => {
    event.preventDefault()
    if (!dock.createProfile(view.profileDraft.trim())) return
    setView({ profileDraft: "", profileCreating: false })
  }
  const command = (action: "back" | "forward" | "reload", tab: TabIdentity | undefined = state.active) => {
    if (tab && !activeLinux()) void api?.appDockCommand(tab.tabID, action)
  }
  // A crashed Linux workspace recovers by reconnecting, not through the browser's tab recovery.
  const recover = () => (activeLinux() ? void linuxMenu.run({ type: "open" }) : void dock.recover())
  return (
    <div ref={root} class="zen-browser-frame">
      <div class="zen-dock-modes" role="tablist" aria-label={language.t("appDock.contexts")}>
        <button
          type="button"
          role="tab"
          aria-selected={!activeLinux()}
          class={!activeLinux() ? "is-active" : ""}
          onClick={() => dock.showBrowser()}
        >
          <span aria-hidden="true">◎</span>
          {language.t("appDock.browser.title")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeLinux()}
          disabled={linuxMenu.blocked() || !capability("appDockLinuxOpen")}
          class={activeLinux() ? "is-active" : ""}
          onClick={() => void linuxMenu.run({ type: "open" })}
        >
          <span aria-hidden="true">▣</span>
          {language.t("appDock.linux.workspace")}
        </button>
      </div>
    <div
      class={`zen-browser-shell ${view.sidebarCollapsed && !props.compact ? "is-sidebar-collapsed" : ""} ${props.compact ? "is-compact" : ""}`}
      data-status={state.status}
    >
      <aside class="zen-browser-sidebar" aria-label="Browser workspaces">
        <div class="zen-workspace-indicator" aria-label="Current workspace">
          <button
            class="zen-sidebar-toggle"
            type="button"
            aria-label={view.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={view.sidebarCollapsed}
            onClick={toggleSidebar}
          >
            ||
          </button>
          {!activeLinux() && <span class="zen-workspace-indicator-dot" aria-hidden="true" />}
          {activeLinux() && !view.sidebarCollapsed && (
            <strong class="zen-workspace-kind">
              <bdi dir="ltr">{language.t("appDock.linux.title")}</bdi>
            </strong>
          )}
          {!repository() && !activeLinux() && (
            <>
              <select
                class="zen-workspace-indicator-name"
                value={state.profile}
                aria-label="Browser profile"
                disabled={state.status === "loading"}
                onChange={(event) => {
                  setView("libraryOpen", undefined)
                  void dock.switchProfile(event.currentTarget.value)
                }}
              >
                {/* Manifest writes replace these options; mark the selection on each one so the
                    select does not fall back to the first profile. */}
                {state.profiles.map((item) => (
                  <option value={item.id} selected={item.id === state.profile}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                class="zen-profile-add"
                type="button"
                aria-label="Create browser profile"
                onClick={() => setView("profileCreating", true)}
              >
                +
              </button>
            </>
          )}
        </div>
        {!repository() && !activeLinux() && view.profileCreating && (
          <form class="zen-profile-form" onSubmit={createProfile}>
            <input
              autofocus
              value={view.profileDraft}
              onInput={(event) => setView("profileDraft", event.currentTarget.value)}
              placeholder="Profile name"
              aria-label="New profile name"
            />
            <button type="submit" aria-label="Save profile">
              +
            </button>
            <button
              type="button"
              aria-label="Cancel profile creation"
              onClick={() => setView("profileCreating", false)}
            >
              x
            </button>
          </form>
        )}
        {activeLinux() && <LinuxMenu controller={linuxMenu} collapsed={view.sidebarCollapsed} />}
        <div class="zen-tabs" role="tablist" aria-label="Tabs" hidden={activeLinux()}>
          {state.tabs.filter((tab) => tab.pinned && !isLinux(tab.url)).length > 0 && <div class="zen-tab-section-label">Pinned</div>}
          {state.tabs
            .filter((tab) => tab.pinned && !isLinux(tab.url))
            .map((tab) => (
              <TabButton
                tab={tab}
                active={() => state.active}
                select={dock.select}
                setMenu={(menu) => setView("menu", menu)}
              />
            ))}
          {state.tabs
            .filter((tab) => !tab.pinned && !isLinux(tab.url))
            .map((tab) => (
              <TabButton
                tab={tab}
                active={() => state.active}
                select={dock.select}
                setMenu={(menu) => setView("menu", menu)}
              />
            ))}
          <button class="zen-new-tab" type="button" disabled={!ready()} onClick={() => void dock.openNewTab()}>
            + New tab
          </button>
        </div>
      </aside>
      <main class="zen-browser-content">
        {activeLinux() && (
          <div class="zen-native-toolbar">
            <strong title={language.t("appDock.linux.shared")}>
              <bdi>{language.t("appDock.linux.workspace")}</bdi>
            </strong>
            <select
              class="zen-window-picker"
              aria-label={language.t("appDock.linux.windows")}
              disabled={state.focusing || state.windows.length === 0}
              value={state.windows.find((window) => window.focused)?.id ?? ""}
              onChange={(event) => void dock.focusWindow(Number(event.currentTarget.value))}
            >
              {state.windows.length === 0 && (
                <option value="">
                  {language.t(linuxMenu.store.busy ? "common.loading" : "appDock.linux.noWindows")}
                </option>
              )}
              {state.windows.map((window) => (
                <option value={window.id}>{window.title}</option>
              ))}
            </select>
            <button
              class="zen-nav-button"
              type="button"
              title={language.t("appDock.linux.reconnect")}
              aria-label={language.t("appDock.linux.reconnect")}
              disabled={linuxMenu.blocked()}
              onClick={() => void linuxMenu.run({ type: "open" })}
            >
              ↻
            </button>
            {state.active && (
              <button
                class="zen-nav-button"
                type="button"
                aria-label={language.t("appDock.linux.closeWorkspace")}
                title={language.t("appDock.linux.closeWorkspace")}
                onClick={() => void dock.close()}
              >
                ×
              </button>
            )}
          </div>
        )}
        <form
          hidden={activeLinux()}
          class="zen-urlbar"
          onSubmit={(event) => {
            event.preventDefault()
            dock.setURL(address())
            props.onDraftChange?.(undefined)
            void dock.launch()
          }}
        >
          <button
            class="zen-nav-button"
            type="button"
            aria-label="Back"
            disabled={!activeTab()?.canGoBack || !!activeCrashed() || !capability("appDockCommand")}
            onClick={() => command("back")}
          >
            &#8592;
          </button>
          <button
            class="zen-nav-button"
            type="button"
            aria-label="Forward"
            disabled={!activeTab()?.canGoForward || !!activeCrashed() || !capability("appDockCommand")}
            onClick={() => command("forward")}
          >
            &#8594;
          </button>
          <button
            class={`zen-nav-button zen-nav-extra ${bookmarked() ? "is-active" : ""}`}
            type="button"
            aria-label={bookmarked() ? "Remove bookmark" : "Add bookmark"}
            disabled={!!activeCrashed()}
            onClick={dock.toggleBookmark}
          >
            &#9733;
          </button>
          <input
            ref={addressInput}
            value={address()}
            dir="ltr"
            onInput={(event) => {
              const value = event.currentTarget.value
              if (props.onDraftChange) props.onDraftChange({ owner: state.owner, tab: state.active, value })
              dock.setURL(value)
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return
              event.preventDefault()
              props.onDraftChange?.(undefined)
              dock.setURL(activeTab()?.url ?? "")
            }}
            aria-label="Address"
            disabled={!!activeCrashed()}
          />
          <button
            class="zen-nav-button zen-nav-extra"
            type="button"
            aria-label="Bookmarks"
            onClick={() => setView("libraryOpen", view.libraryOpen === "bookmarks" ? undefined : "bookmarks")}
          >
            &#9734;
          </button>
          <button
            class="zen-nav-button zen-nav-extra"
            type="button"
            aria-label="History"
            onClick={() => setView("libraryOpen", view.libraryOpen === "history" ? undefined : "history")}
          >
            &#8986;
          </button>
          <button
            class="zen-nav-button zen-nav-extra"
            type="button"
            aria-label="Find in page"
            disabled={!!activeCrashed()}
            onClick={() => setView("findOpen", true)}
          >
            &#8981;
          </button>
          <button
            class="zen-nav-button zen-nav-extra"
            type="button"
            aria-label="Zoom out"
            disabled={!!activeCrashed()}
            onClick={() => zoom(-0.1)}
          >
            A-
          </button>
          <button
            class="zen-nav-button zen-nav-extra"
            type="button"
            aria-label="Zoom in"
            disabled={!!activeCrashed()}
            onClick={() => zoom(0.1)}
          >
            A+
          </button>
          <button
            class="zen-nav-button zen-nav-extra"
            type="button"
            aria-label="Downloads"
            onClick={() => setView("downloadsOpen", !view.downloadsOpen)}
          >
            &#8595;
          </button>
          <button
            class="zen-nav-button zen-nav-extra"
            type="button"
            aria-label={state.fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            disabled={!!activeCrashed()}
            onClick={toggleFullscreen}
          >
            {state.fullscreen ? "Exit" : "Full"}
          </button>
          <button
            class="zen-open-button"
            type="button"
            disabled={!state.active || !!activeCrashed() || !capability("appDockCommand")}
            onClick={() => command("reload")}
          >
            {activeTab()?.loading ? "Loading" : "Reload"}
          </button>
          <button class="zen-open-button" type="submit" disabled={!api || !ready() || !!activeCrashed()}>
            {activeTab()?.loading ? "Loading" : "Open"}
          </button>
          {state.active && (
            <button class="zen-nav-button" type="button" onClick={() => void dock.close()} aria-label="Close tab">
              x
            </button>
          )}
        </form>
        {state.error && (
          <div class="zen-error" role="alert" aria-live="assertive">
            {state.error}
          </div>
        )}
        {state.permission && (
          <div class="zen-error" role="status" aria-live="polite">
            {`${state.permission.permission} permission ${state.permission.state}`}
          </div>
        )}
        {activeCrashed() && (
          <div class="zen-tab-crash" role="alert" aria-live="assertive">
            <span>Tab crashed ({activeCrashed()!.reason}).</span>
            <button
              type="button"
              disabled={
                !(activeLinux() ? capability("appDockLinuxOpen") : capability("appDockRecoverTab")) || !!state.recovering
              }
              onClick={recover}
            >
              {state.recovering ? "Recovering" : "Recover"}
            </button>
          </div>
        )}
        {activeLinux() && state.windowError && !linuxMenu.store.busy && (
          <div class="zen-error" role="status">
            {language.t("common.requestFailed")}
          </div>
        )}
        {api && ready() && !state.active && !activeLinux() && (
          <div class="zen-empty-state">
            <strong>{language.t("appDock.browser.title")}</strong>
            <span>{language.t("appDock.browser.empty")}</span>
          </div>
        )}
        {view.libraryOpen && (
          <div
            class="zen-library"
            role="dialog"
            aria-label={view.libraryOpen === "bookmarks" ? "Bookmarks" : "History"}
          >
            <div class="zen-library-title">{view.libraryOpen === "bookmarks" ? "Bookmarks" : "History"}</div>
            {(view.libraryOpen === "bookmarks" ? state.bookmarks : state.history).map((entry) => (
              <button type="button" onClick={() => openLibraryItem(entry)}>
                <span>{entry.title}</span>
                <small>{new URL(entry.url).hostname}</small>
              </button>
            ))}
            {(view.libraryOpen === "bookmarks" ? state.bookmarks : state.history).length === 0 && (
              <p>Nothing here yet.</p>
            )}
          </div>
        )}
        {view.findOpen && !activeLinux() && (
          <form
            class="zen-findbar"
            onSubmit={(event) => {
              event.preventDefault()
              void find(true)
            }}
          >
            <input
              autofocus
              value={view.findText}
              onInput={(event) => setView("findText", event.currentTarget.value)}
              aria-label="Find in page"
              placeholder="Find in page"
            />
            <span>{view.findResult ? `${view.findResult.activeMatchOrdinal}/${view.findResult.matches}` : ""}</span>
            <button type="button" aria-label="Previous match" onClick={() => void find(false)}>
              &#8593;
            </button>
            <button type="submit" aria-label="Next match">
              &#8595;
            </button>
            <button type="button" aria-label="Close find" onClick={closeFind}>
              x
            </button>
          </form>
        )}
        {view.downloadsOpen && (
          <div class="zen-library" role="dialog" aria-label="Downloads">
            <div class="zen-library-title">Downloads</div>
            {state.downloads.map((download) => (
              <div class="zen-download">
                <span>{download.filename}</span>
                <small>
                  {download.state === "progressing" && download.totalBytes > 0
                    ? `${Math.round((download.receivedBytes / download.totalBytes) * 100)}%`
                    : download.state}
                </small>
                {download.state === "completed" ? (
                  <button type="button" onClick={() => void api?.appDockOpenDownload(download.id)}>
                    Open
                  </button>
                ) : download.state === "progressing" || download.state === "paused" ? (
                  <button type="button" onClick={() => void api?.appDockCancelDownload(download.id)}>
                    Cancel
                  </button>
                ) : null}
              </div>
            ))}
            {state.downloads.length === 0 && <p>No downloads yet.</p>}
          </div>
        )}
        {!api && (
          <div class="zen-empty-state">
            <strong>Browser needs OpenCode Desktop.</strong>
            <span>Native browser tabs are unavailable in web app.</span>
          </div>
        )}
        <div ref={host} class="zen-browser-host" />
        {view.menu && (
          <TabMenu
            tab={view.menu.tab}
            x={view.menu.x}
            y={view.menu.y}
            rtl={view.menu.rtl}
            setElement={(element) => (menuElement = element)}
            onDismiss={() => closeMenu()}
            canDuplicate={capability("appDockOpen") && !view.menu.tab.crashed}
            canReload={capability("appDockCommand") && !view.menu.tab.crashed}
            canClose={capability("appDockCloseTab")}
            hasOthers={state.tabs.length > 1}
            hasRight={
              [...state.tabs.filter((item) => item.pinned), ...state.tabs.filter((item) => !item.pinned)].findIndex(
                (item) => sameTab(item, view.menu!.tab),
              ) <
              state.tabs.length - 1
            }
            onDuplicate={() => {
              void dock.duplicate(view.menu!.tab)
              closeMenu()
            }}
            onTogglePin={() => {
              dock.togglePin(view.menu!.tab)
              closeMenu()
            }}
            onReload={() => {
              command("reload", view.menu!.tab)
              closeMenu()
            }}
            onClose={() => {
              void dock.close(view.menu!.tab)
              closeMenu()
            }}
            onCloseOthers={() => {
              void dock.closeTabs(view.menu!.tab, "others")
              closeMenu()
            }}
            onCloseRight={() => {
              void dock.closeTabs(view.menu!.tab, "right")
              closeMenu()
            }}
          />
        )}
      </main>
    </div>
    </div>
  )
}

function TabButton(props: {
  tab: Tab
  active: () => TabIdentity | undefined
  select: (tab: Tab) => void
  setMenu: (menu: { tab: Tab; x: number; y: number; rtl: boolean; invoker: HTMLButtonElement }) => void
}) {
  const openMenu = (x: number, y: number, invoker: HTMLButtonElement) =>
    props.setMenu({ tab: props.tab, x, y, rtl: getComputedStyle(invoker).direction === "rtl", invoker })
  const keydown = (event: KeyboardEvent) => {
    const current = event.currentTarget
    if (!(current instanceof HTMLButtonElement)) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      props.select(props.tab)
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault()
      const rect = current.getBoundingClientRect()
      openMenu(getComputedStyle(current).direction === "rtl" ? rect.right - 8 : rect.left + 8, rect.bottom + 4, current)
    } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const tabs = [...(current.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']") ?? [])]
      const index = tabs.indexOf(current)
      if (index < 0) return
      const next =
        event.key === "Home"
          ? tabs[0]
          : event.key === "End"
            ? tabs.at(-1)
            : tabs[
                (index +
                  (event.key === (getComputedStyle(current).direction === "rtl" ? "ArrowLeft" : "ArrowRight")
                    ? 1
                    : -1) +
                  tabs.length) %
                  tabs.length
              ]
      event.preventDefault()
      next?.focus()
      next?.click()
    }
  }
  return (
    <button
      class={`zen-tab ${sameTab(props.active(), props.tab) ? "is-active" : ""}`}
      type="button"
      role="tab"
      tabindex={sameTab(props.active(), props.tab) ? 0 : -1}
      aria-selected={sameTab(props.active(), props.tab)}
      onClick={() => props.select(props.tab)}
      onContextMenu={(event) => {
        event.preventDefault()
        openMenu(event.clientX, event.clientY, event.currentTarget)
      }}
      onKeyDown={keydown}
    >
      <span class={`zen-tab-icon ${props.tab.loading ? "is-loading" : ""}`}>
        {props.tab.favicon ? (
          <img src={props.tab.favicon} alt="" />
        ) : (
          new URL(props.tab.url).hostname.slice(0, 1).toUpperCase()
        )}
      </span>
      <bdi dir="auto" class="zen-tab-title">
        {tabLabel(props.tab)}
      </bdi>
      {props.tab.pinned ? "Pinned" : ""}
      {props.tab.audible && <span class="zen-tab-audio">&#9835;</span>}
    </button>
  )
}
