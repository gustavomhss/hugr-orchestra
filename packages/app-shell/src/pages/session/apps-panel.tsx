import { createMediaQuery } from "@solid-primitives/media"
import { Icon } from "@orchestra/ui/icon"
import { createEffect, createMemo, on, onCleanup, onMount, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
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
import { tabButtonID, tabPanelID, TabStrip } from "./apps-panel-tab-button"
import { TabMenu } from "./apps-panel-tab-menu"
import { createLinuxMenuController, LinuxMenu } from "./linux-menu"
import "@/orchestra/chapters/kit.css"
import "./apps-panel.css"

const sidebarCollapsedKey = "orchestra.app-dock.sidebar-collapsed"
export type DockAddressDraft = { owner?: string; tab?: TabIdentity; value: string }

// A view of the window's MCP Dock. The live tabs belong to the controller and the repository
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
  const language = useLanguage()
  const dock = appDockController(language.t)
  const api = dock.api
  const state = dock.state
  const serverSDK = useServerSDK()
  const sdk = useSDK()
  const global = useGlobal()
  const t = language.t
  // Orchestra's desktop workspace (the titlebar's profile-scoped tab mode) binds the Dock to the
  // repository profile. Everywhere else the Apps panel keeps its manual browser profiles.
  const desktop = createMediaQuery("(min-width: 768px)")
  // Sessions in a sandbox share the profile of their project worktree, like the sidebar profile.
  const profile = createMemo(() => {
    if (!desktop()) return
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
    addressEdited: false,
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
    const unsubscribeShortcut = dock.onShortcut((command) => {
      if (!dock.owns(host) || activeLinux()) return
      if (command === "address") {
        addressInput?.focus()
        addressInput?.select()
      }
      if (command === "new-tab") void dock.openNewTab()
      if (command === "close-tab") void dock.close()
    })
    // Linux windows open and close inside the workspace without a Dock event; keep the picker current.
    const windows = setInterval(() => {
      if (activeLinux() && !linuxMenu.store.busy) void dock.refreshWindows()
    }, 2000)
    // Apps installed inside the workspace (a terminal, a package manager) reach the list without a Dock event too.
    const apps = setInterval(() => {
      if (activeLinux() && !linuxMenu.store.busy) void linuxMenu.refresh(true)
    }, 10_000)
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
      clearInterval(apps)
      if (view.findOpen) closeFind()
      observer.disconnect()
      window.removeEventListener("resize", resize.request)
      resize.dispose()
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("focusin", onFocusIn)
      unsubscribeFind?.()
      unsubscribeShortcut()
    })
  })
  const activeTab = () => state.tabs.find((tab) => sameTab(tab, state.active))
  const address = () => {
    const draft = props.draft
    return draft && draft.owner === state.owner && (draft.tab ? sameTab(draft.tab, state.active) : !state.active)
      ? draft.value
      : state.active || view.addressEdited
        ? state.url
        : ""
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
        <aside class="zen-browser-sidebar" aria-label={t("appDock.browser.workspaces")}>
          <div class="zen-workspace-indicator" role="group" aria-label={t("appDock.browser.workspace")}>
            <button
              class="zen-sidebar-toggle"
              type="button"
              aria-label={t(
                view.sidebarCollapsed ? "appDock.browser.sidebar.expand" : "appDock.browser.sidebar.collapse",
              )}
              aria-pressed={view.sidebarCollapsed}
              onClick={toggleSidebar}
            >
              <Icon name="sidebar" size="small" />
            </button>
            {!activeLinux() && <span class="zen-workspace-indicator-dot" aria-hidden="true" />}
            {activeLinux() && !view.sidebarCollapsed && (
              <strong class="zen-workspace-kind">
                <bdi dir="ltr">{t("appDock.linux.title")}</bdi>
              </strong>
            )}
            {!desktop() && !activeLinux() && (
              <>
                <select
                  class="zen-workspace-indicator-name"
                  value={state.profile}
                  aria-label={t("appDock.browser.profile.label")}
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
                  aria-label={t("appDock.browser.profile.create")}
                  onClick={() => setView("profileCreating", true)}
                >
                  +
                </button>
              </>
            )}
          </div>
          {!desktop() && !activeLinux() && view.profileCreating && (
            <form class="zen-profile-form" onSubmit={createProfile}>
              <input
                autofocus
                value={view.profileDraft}
                onInput={(event) => setView("profileDraft", event.currentTarget.value)}
                placeholder={t("appDock.browser.profile.placeholder")}
                aria-label={t("appDock.browser.profile.name")}
              />
              <button type="submit" aria-label={t("appDock.browser.profile.save")}>
                +
              </button>
              <button
                type="button"
                aria-label={t("appDock.browser.profile.cancel")}
                onClick={() => setView("profileCreating", false)}
              >
                x
              </button>
            </form>
          )}
          {activeLinux() && <LinuxMenu controller={linuxMenu} collapsed={view.sidebarCollapsed} />}
          <TabStrip
            tabs={state.tabs}
            active={() => state.active}
            hidden={activeLinux()}
            disabled={!ready()}
            select={dock.select}
            setMenu={(menu) => setView("menu", menu)}
            onNewTab={() => void dock.openNewTab()}
          />
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
              setView("addressEdited", false)
              void dock.launch()
            }}
          >
            <div class="zen-tool-group">
              <button
                class="zen-nav-button"
                type="button"
                aria-label={t("appDock.browser.back")}
                title={t("appDock.browser.back")}
                disabled={!activeTab()?.canGoBack || !!activeCrashed() || !capability("appDockCommand")}
                onClick={() => command("back")}
              >
                <Icon name="arrow-left" size="small" />
              </button>
              <button
                class="zen-nav-button"
                type="button"
                aria-label={t("appDock.browser.forward")}
                title={t("appDock.browser.forward")}
                disabled={!activeTab()?.canGoForward || !!activeCrashed() || !capability("appDockCommand")}
                onClick={() => command("forward")}
              >
                <Icon name="arrow-right" size="small" />
              </button>
              <button
                class={`zen-nav-button zen-nav-extra ${bookmarked() ? "is-active" : ""}`}
                type="button"
                aria-label={t(bookmarked() ? "appDock.browser.bookmark.remove" : "appDock.browser.bookmark.add")}
                title={t(bookmarked() ? "appDock.browser.bookmark.remove" : "appDock.browser.bookmark.add")}
                disabled={!!activeCrashed()}
                onClick={dock.toggleBookmark}
              >
                &#9733;
              </button>
            </div>
            <input
              ref={addressInput}
              value={address()}
              dir="ltr"
              placeholder={t("appDock.browser.address.placeholder")}
              onInput={(event) => {
                const value = event.currentTarget.value
                setView("addressEdited", true)
                if (props.onDraftChange) props.onDraftChange({ owner: state.owner, tab: state.active, value })
                dock.setURL(value)
              }}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return
                event.preventDefault()
                props.onDraftChange?.(undefined)
                dock.setURL(activeTab()?.url ?? "")
              }}
              aria-label={t("appDock.browser.address")}
              disabled={!!activeCrashed()}
            />
            <div class="zen-tool-group">
              <button
                class="zen-nav-button zen-nav-extra"
                type="button"
                aria-label={t("appDock.browser.bookmarks")}
                title={t("appDock.browser.bookmarks")}
                onClick={() => toggleLibrary("bookmarks")}
              >
                &#9734;
              </button>
              <button
                class="zen-nav-button zen-nav-extra"
                type="button"
                aria-label={t("appDock.browser.history")}
                title={t("appDock.browser.history")}
                onClick={() => toggleLibrary("history")}
              >
                <Icon name="reset" size="small" />
              </button>
              <button
                class="zen-nav-button zen-nav-extra"
                type="button"
                aria-label={t("appDock.browser.find.label")}
                title={t("appDock.browser.find.label")}
                disabled={!!activeCrashed()}
                onClick={() => setView("findOpen", true)}
              >
                <Icon name="magnifying-glass" size="small" />
              </button>
              <button
                class="zen-nav-button zen-nav-extra"
                type="button"
                aria-label={t("appDock.browser.zoomOut")}
                title={t("appDock.browser.zoomOut")}
                disabled={!!activeCrashed()}
                onClick={() => zoom(-0.1)}
              >
                A-
              </button>
              <button
                class="zen-nav-button zen-nav-extra"
                type="button"
                aria-label={t("appDock.browser.zoomIn")}
                title={t("appDock.browser.zoomIn")}
                disabled={!!activeCrashed()}
                onClick={() => zoom(0.1)}
              >
                A+
              </button>
              <button
                class="zen-nav-button zen-nav-extra"
                type="button"
                aria-label={t("appDock.browser.downloads")}
                title={t("appDock.browser.downloads")}
                onClick={() => toggleLibrary("downloads")}
              >
                <Icon name="download" size="small" />
              </button>
              <button
                class="zen-nav-button zen-nav-extra"
                type="button"
                aria-label={t(state.fullscreen ? "appDock.browser.fullscreen.exit" : "appDock.browser.fullscreen.enter")}
                title={t(state.fullscreen ? "appDock.browser.fullscreen.exit" : "appDock.browser.fullscreen.enter")}
                disabled={!!activeCrashed()}
                onClick={toggleFullscreen}
              >
                {t(state.fullscreen ? "appDock.browser.fullscreen.exitShort" : "appDock.browser.fullscreen.enterShort")}
              </button>
            </div>
            <div class="zen-tool-group">
              <button
                class="zen-open-button"
                type="button"
                title={t("appDock.browser.reload")}
                disabled={!state.active || !!activeCrashed() || !capability("appDockCommand")}
                onClick={() => command("reload")}
              >
                {activeTab()?.loading ? t("common.loading") : t("appDock.browser.reload")}
              </button>
              <button class="zen-open-button" type="submit" disabled={!api || !ready() || !!activeCrashed()}>
                {activeTab()?.loading ? t("common.loading") : t("common.open")}
              </button>
              {state.active && (
                <button
                  class="zen-nav-button"
                  type="button"
                  onClick={() => void dock.close()}
                  aria-label={t("appDock.browser.closeTab")}
                  title={t("appDock.browser.closeTab")}
                >
                  x
                </button>
              )}
            </div>
          </form>
          {state.error && (
            <div class="zen-error" role="alert" aria-live="assertive">
              {state.error}
            </div>
          )}
          {state.permission && (
            <div class="zen-error warn" role="status" aria-live="polite">
              {t("appDock.browser.permission.denied", { permission: state.permission.permission })}
            </div>
          )}
          {activeCrashed() && (
            <div class="zen-tab-crash" role="alert" aria-live="assertive">
              <span>
                {t("appDock.browser.crash.message", {
                  reason: t(`appDock.browser.crash.reason.${activeCrashed()!.reason}`),
                })}
              </span>
              <button
                class="zen-open-button"
                type="button"
                disabled={
                  !(activeLinux() ? capability("appDockLinuxOpen") : capability("appDockRecoverTab")) ||
                  !!state.recovering
                }
                onClick={recover}
              >
                {state.recovering ? t("appDock.browser.recovering") : t("appDock.browser.recover")}
              </button>
            </div>
          )}
          {activeLinux() && state.windowError && !linuxMenu.store.busy && (
            <div class="zen-error" role="status">
              {t("common.requestFailed")}
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
          <div
            class="zen-browser-host"
            id={tabPanelID}
            role={state.active && !activeLinux() ? "tabpanel" : undefined}
            aria-labelledby={state.active && !activeLinux() ? tabButtonID(state.active) : undefined}
          >
            <div ref={host} class="zen-browser-view" />
            {api ? (
              props.placeholder
            ) : (
              <div class="mx-empty">
                <strong>{t("appDock.browser.unavailable.title")}</strong>
                <p>{t("appDock.browser.unavailable.description")}</p>
              </div>
            )}
            {/* The browser side with no page. Views that already report an empty Dock (the cockpit card,
                a placeholder) only need it while the Linux workspace is the sole tab. */}
            {api &&
              ready() &&
              !state.active &&
              !activeLinux() &&
              (state.tabs.length > 0 || !(props.compact || "placeholder" in props)) && (
                <div class="mx-empty">
                  <strong>{t("appDock.browser.title")}</strong>
                  <p>{t("appDock.browser.empty")}</p>
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
              canDuplicate={capability("appDockOpen") && !view.menu.tab.crashed && !isLinux(view.menu.tab.url)}
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
