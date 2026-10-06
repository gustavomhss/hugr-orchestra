import { createMediaQuery } from "@solid-primitives/media"
import { createEffect, createMemo, on, onCleanup, onMount, Show, type JSX } from "solid-js"
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
  type AppDockAPI,
  type Bookmark,
  type Tab,
  type TabIdentity,
} from "./apps-panel-controller"
import { bounds, createAppDockBoundsSync } from "./apps-panel-resize"
import { FindBar, LibraryPopover } from "./apps-panel-library"
import { DockModes, LinuxToolbar } from "./apps-panel-linux"
import { TabButton } from "./apps-panel-tab-button"
import { TabMenu } from "./apps-panel-tab-menu"
import { createLinuxMenuController, LinuxMenu } from "./linux-menu"
import "./apps-panel.css"

const sidebarCollapsedKey = "opencode.app-dock.sidebar-collapsed"
export type DockAddressDraft = { owner?: string; tab?: TabIdentity; value: string }

// A view of the window's App Dock. The live tabs belong to the controller and the repository
// profile in context, so unmounting this view hides the native browser instead of closing it.
// The compact view is the cockpit's Dock card: tabs above the address bar and only the core controls.
// A placeholder fills the page area while no native page covers it (loading, no tabs, a failed load).
export function AppsPanel(
  props: {
    compact?: boolean
    draft?: DockAddressDraft
    onDraftChange?: (draft: DockAddressDraft | undefined) => void
    placeholder?: JSX.Element
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
    libraryOpen: undefined as "bookmarks" | "history" | "downloads" | undefined,
    findOpen: false,
    findText: "",
    findResult: undefined as { requestID: number; activeMatchOrdinal: number; matches: number } | undefined,
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
      if (!activeLinux() && sameTab(result, state.active) && result.requestID === findRequestID)
        setView("findResult", result)
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
  const bookmarked = () =>
    !activeLinux() && !!activeTab() && state.bookmarks.some((item) => item.url === activeTab()!.url)
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
  const toggleLibrary = (kind: "bookmarks" | "history" | "downloads") =>
    setView("libraryOpen", view.libraryOpen === kind ? undefined : kind)
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
      <DockModes compact={props.compact} dock={dock} menu={linuxMenu} />
      <div
        class={`zen-browser-shell ${view.sidebarCollapsed && !props.compact ? "is-sidebar-collapsed" : ""} ${props.compact ? "is-compact" : ""} ${view.findOpen && !activeLinux() ? "is-finding" : ""}`}
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
            {state.tabs.filter((tab) => tab.pinned && !isLinux(tab.url)).length > 0 && (
              <div class="zen-tab-section-label">Pinned</div>
            )}
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
          {activeLinux() && <LinuxToolbar dock={dock} menu={linuxMenu} />}
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
              onClick={() => toggleLibrary("bookmarks")}
            >
              &#9734;
            </button>
            <button
              class="zen-nav-button zen-nav-extra"
              type="button"
              aria-label="History"
              onClick={() => toggleLibrary("history")}
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
              onClick={() => toggleLibrary("downloads")}
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
            <div class="zen-error warn" role="status" aria-live="polite">
              {`${state.permission.permission} permission ${state.permission.state}`}
            </div>
          )}
          {activeCrashed() && (
            <div class="zen-tab-crash" role="alert" aria-live="assertive">
              <span>Tab crashed ({activeCrashed()!.reason}).</span>
              <button
                class="zen-open-button"
                type="button"
                disabled={
                  !(activeLinux() ? capability("appDockLinuxOpen") : capability("appDockRecoverTab")) ||
                  !!state.recovering
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
          <Show when={view.libraryOpen}>
            {(kind) => (
              <LibraryPopover
                kind={kind()}
                entries={kind() === "bookmarks" ? state.bookmarks : state.history}
                downloads={state.downloads}
                register={dock.registerOverlay}
                onOpen={openLibraryItem}
                onOpenDownload={(id) => void api?.appDockOpenDownload(id)}
                onCancelDownload={(id) => void api?.appDockCancelDownload(id)}
              />
            )}
          </Show>
          <Show when={view.findOpen && !activeLinux()}>
            <FindBar
              text={view.findText}
              result={view.findResult}
              onInput={(text) => setView("findText", text)}
              onFind={(forward) => void find(forward)}
              onClose={closeFind}
            />
          </Show>
          {/* The page area. The native browser covers the view inside it, which starts below the find
              bar while that is open so the bar stays above the page it searches. */}
          <div class="zen-browser-host">
            <div ref={host} class="zen-browser-view" />
            {api ? (
              props.placeholder
            ) : (
              <div class="zen-empty-state">
                <strong>Browser needs OpenCode Desktop.</strong>
                <span>Native browser tabs are unavailable in web app.</span>
              </div>
            )}
            {/* The browser side with no page. Views that already report an empty Dock (the cockpit card,
                a placeholder) only need it while the Linux workspace is the sole tab. */}
            {api &&
              ready() &&
              !state.active &&
              !activeLinux() &&
              (state.tabs.length > 0 || !(props.compact || "placeholder" in props)) && (
                <div class="zen-empty-state">
                  <strong>{language.t("appDock.browser.title")}</strong>
                  <span>{language.t("appDock.browser.empty")}</span>
                </div>
              )}
          </div>
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
