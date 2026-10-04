import { createEffect, createSignal, onCleanup, onMount, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import type { AppDockLinuxAPI, LinuxOpenResult, LinuxWindow } from "../../app-dock-linux"
import { useLanguage } from "../../context/language"
import { createLinuxMenuController, LinuxMenu } from "./linux-menu"
import "./apps-panel.css"

type Bounds = { x: number; y: number; width: number; height: number }
type AppDockAPI = {
  appDockOpen: (
    url: string,
    bounds: Bounds,
    profile?: string,
  ) => Promise<{ tabID: string; generation: number; url: string }>
  appDockResize: (bounds: Bounds) => Promise<void>
  appDockHide: () => Promise<void>
  appDockClose: () => Promise<void>
  appDockCloseTab: (tabID: string) => Promise<void>
  appDockRecoverTab: (tabID: string) => Promise<{ tabID: string; generation: number; url: string }>
  appDockCloseTabs: (tabID: string, scope: "others" | "right", order?: string[]) => Promise<void>
  appDockSelect: (tabID: string, bounds: Bounds) => Promise<void>
  appDockNavigate: (tabID: string, url: string) => Promise<void>
  appDockCommand: (tabID: string, command: "back" | "forward" | "reload") => Promise<void>
  appDockEvent: (callback: (event: AppDockEvent) => void) => () => void
  appDockFind: (tabID: string, text: string, forward: boolean) => Promise<number>
  appDockStopFind: (tabID: string) => Promise<void>
  appDockFindResult: (
    callback: (result: {
      tabID: string
      generation: number
      requestID: number
      activeMatchOrdinal: number
      matches: number
      finalUpdate: boolean
    }) => void,
  ) => () => void
  appDockZoom: (tabID: string, factor?: number) => Promise<number>
  appDockCancelDownload: (downloadID: string) => Promise<void>
  appDockOpenDownload: (downloadID: string) => Promise<void>
  appDockFullscreen: (tabID: string, enabled: boolean) => Promise<void>
  appDockGetManifest: () => Promise<AppDockManifest>
  appDockUpdateManifest: (expectedRevision: number, manifest: AppDockManifest) => Promise<AppDockManifestUpdate>
} & Partial<AppDockLinuxAPI>
type AppDockEvent =
  | {
      type: "state"
      payload: {
        tabID: string
        generation: number
        url: string
        title: string
        favicon?: string
        loading: boolean
        audible: boolean
        canGoBack: boolean
        canGoForward: boolean
      }
    }
  | { type: "tab-opened"; payload: { tabID: string; generation: number; url: string } }
  | { type: "tab-selected"; payload: TabIdentity }
  | { type: "tab-crashed"; payload: { identity: TabIdentity; reason: "crashed" | "killed" | "oom" } }
  | { type: "tab-recovered"; payload: { tabID: string; generation: number; url: string } }
  | { type: "download"; payload: Download }
  | { type: "permission"; payload: { identity: TabIdentity; permission: string; state: "denied" } }
  | { type: "fullscreen"; payload: { identity: TabIdentity; enabled: boolean } }
  | {
      type: "navigation-error"
      payload: { identity: { tabID: string; generation: number }; code: "blocked" | "failed"; url: string }
    }
type TabIdentity = { tabID: string; generation: number }
type Tab = TabIdentity & {
  url: string
  title?: string
  favicon?: string
  loading?: boolean
  audible?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  pinned?: boolean
  crashed?: { identity: TabIdentity; reason: "crashed" | "killed" | "oom" }
}
type Profile = { id: string; name: string }
type Bookmark = { url: string; title: string }
type HistoryEntry = Bookmark & { visitedAt: number }
type AppDockManifest = {
  version: 1
  revision: number
  profiles: Profile[]
  activeProfileID: string
  tabs: Record<string, { url: string; pinned: boolean }[]>
  bookmarks: string[]
  history: string[]
}
type AppDockManifestUpdate = { status: "updated" | "conflict"; manifest: AppDockManifest }
type Download = TabIdentity & {
  id: string
  filename: string
  receivedBytes: number
  totalBytes: number
  state: "progressing" | "paused" | "completed" | "cancelled" | "interrupted"
}

const sidebarCollapsedKey = "opencode.app-dock.sidebar-collapsed"
const defaultProfiles: Profile[] = [{ id: "default", name: "Personal" }]

const tabLabel = (tab: Tab) => tab.title || new URL(tab.url).hostname
const sameTab = (left: TabIdentity | undefined, right: TabIdentity | undefined) =>
  !!left && !!right && left.tabID === right.tabID && left.generation === right.generation

const isHTTPS = (url: string) => URL.canParse(url) && new URL(url).protocol === "https:"
const isLinux = (url: string) => url === "appdock://linux"
const libraryEntries = (urls: string[]): Bookmark[] =>
  urls.filter(isHTTPS).map((url) => ({ url, title: new URL(url).hostname }))

const bounds = (element: HTMLElement): Bounds => {
  const rect = element.getBoundingClientRect()
  // Inactive side-panel tabs can mount at 0x0 before layout settles. Native view
  // needs valid bounds now; ResizeObserver supplies real dimensions afterward.
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  }
}

export function AppsPanel() {
  const language = useLanguage()
  const [profiles, setProfiles] = createSignal<Profile[]>(defaultProfiles)
  const [profile, setProfile] = createSignal("default")
  const [profileCreating, setProfileCreating] = createSignal(false)
  const [profileDraft, setProfileDraft] = createSignal("")
  const [url, setURL] = createSignal("")
  const [tabs, setTabs] = createSignal<Tab[]>([])
  const [active, setActive] = createSignal<TabIdentity>()
  const [error, setError] = createSignal<string>()
  const [navigationError, setNavigationError] = createSignal<{ tabID: string; generation: number; url: string }>()
  const [bookmarks, setBookmarks] = createSignal<Bookmark[]>([])
  const [history, setHistory] = createSignal<HistoryEntry[]>([])
  const [libraryOpen, setLibraryOpen] = createSignal<"bookmarks" | "history">()
  const [findOpen, setFindOpen] = createSignal(false)
  const [findText, setFindText] = createSignal("")
  const [findResult, setFindResult] = createSignal<{ requestID: number; activeMatchOrdinal: number; matches: number }>()
  const [downloads, setDownloads] = createSignal<Download[]>([])
  const [downloadsOpen, setDownloadsOpen] = createSignal(false)
  const [permission, setPermission] = createSignal<{ identity: TabIdentity; permission: string; state: "denied" }>()
  const [fullscreen, setFullscreen] = createSignal<{ identity: TabIdentity; enabled: boolean }>()
  const activeFullscreen = () => !!fullscreen()?.enabled && sameTab(fullscreen()?.identity, active())
  const [recovering, setRecovering] = createSignal<TabIdentity>()
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(localStorage.getItem(sidebarCollapsedKey) === "true")
  const [menu, setMenu] = createSignal<{ tab: Tab; x: number; y: number; invoker: HTMLButtonElement }>()
  const [linuxIntent, setLinuxIntent] = createStore({ generation: 0 })
  const [navigation, setNavigation] = createStore({
    mode: "browser" as "browser" | "linux",
    lastBrowser: undefined as TabIdentity | undefined,
    more: false,
    windows: [] as LinuxWindow[],
    windowError: false,
    focusing: false,
  })
  let findRequestID: number | undefined
  let root: HTMLDivElement | undefined
  let host: HTMLDivElement | undefined
  let menuElement: HTMLDivElement | undefined
  let addressInput: HTMLInputElement | undefined
  const resizing = { pending: false }
  const [switching, setSwitching] = createSignal(false)
  let restoreGeneration = 0
  let disposed = false
  let manifest: AppDockManifest | undefined
  let manifestWrite = Promise.resolve()
  const api = () => window.api as AppDockAPI | undefined
  const capability = (name: keyof AppDockAPI) => typeof api()?.[name] === "function"
  const linuxGeneration = () => restoreGeneration + linuxIntent.generation
  const closeMenu = (restoreFocus = true) => {
    const invoker = menu()?.invoker
    setMenu(undefined)
    if (restoreFocus) queueMicrotask(() => invoker?.focus())
  }
  const applyManifest = (next: AppDockManifest) => {
    manifest = next
    setProfiles(next.profiles)
    setProfile(next.activeProfileID)
    setBookmarks(libraryEntries(next.bookmarks))
    setHistory(libraryEntries(next.history).map((entry) => ({ ...entry, visitedAt: Date.now() })))
  }
  const updateManifest = (change: (current: AppDockManifest) => AppDockManifest) => {
    const run = async () => {
      const dock = api()
      if (!dock || !manifest) return
      let current = manifest
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await dock.appDockUpdateManifest(current.revision, change(current))
        if (result.status === "updated") {
          applyManifest(result.manifest)
          return result.manifest
        }
        current = await dock.appDockGetManifest()
        applyManifest(current)
      }
      setError("App Dock changed in another window")
    }
    const pending = manifestWrite.then(run, run)
    manifestWrite = pending.then(
      () => undefined,
      () => undefined,
    )
    return pending
  }
  const saveTabs = (items = tabs(), profileID = profile()) =>
    updateManifest((current) => ({
      ...current,
      tabs: {
        ...current.tabs,
        [profileID]: items.filter((tab) => isHTTPS(tab.url)).map((tab) => ({ url: tab.url, pinned: !!tab.pinned })),
      },
    }))
  const saveHistory = (url: string) => {
    if (!isHTTPS(url)) return
    void updateManifest((current) => ({
      ...current,
      history: [url, ...current.history.filter((item) => item !== url)].slice(0, 100),
    }))
  }
  const resize = () => {
    if (resizing.pending || disposed) return
    resizing.pending = true
    // A visible native view can leave its owner document hidden and suspend RAF.
    queueMicrotask(() => {
      resizing.pending = false
      if (!disposed && active() && host) void api()?.appDockResize(bounds(host))
    })
  }
  const admitBrowserTab = (tab: Tab) => {
    // Main emits admission before invoke resolves. Both paths admit one identity.
    setTabs(items => items.some(item => sameTab(item, tab)) ? items : [...items, tab])
    setNavigation({ mode: "browser", lastBrowser: tab })
    setActive(tab)
    setURL(tabs().find(item => sameTab(item, tab))?.url ?? tab.url)
    void saveTabs()
    resize()
  }
  const restoreProfile = async (profileID: string, generation: number, snapshot: AppDockManifest) => {
    const saved = (snapshot.tabs[profileID] ?? []).filter((tab) => isHTTPS(tab.url))
    setTabs([])
    setActive(undefined)
    setURL("")
    const restored: Tab[] = []
    for (const tab of saved) {
      if (disposed || generation !== restoreGeneration) return
      try {
        const opened = await api()?.appDockOpen(tab.url, bounds(host!), profileID)
        if (disposed || generation !== restoreGeneration) {
          if (opened) await api()?.appDockCloseTab(opened.tabID)
          return
        }
        if (opened) restored.push({ ...tab, ...opened })
      } catch {
        // Skip stale or unavailable URLs during startup restore.
      }
    }
    if (disposed || generation !== restoreGeneration) return
    setTabs(items => restored.map(tab => ({ ...tab, ...items.find(item => sameTab(item, tab)) })))
    const first = restored[0]
    if (first) {
      setActive(first)
      setURL(first.url)
      await api()?.appDockSelect(first.tabID, bounds(host!))
    }
  }
  onMount(() => {
    const applyState = (state: Tab & { error?: string }) => {
      const known = tabs().find((tab) => sameTab(tab, state))
      if (!known) return
      if (isLinux(known.url) && !isLinux(state.url)) return
      const next = tabs().map((tab) => (sameTab(tab, state) ? { ...tab, ...state } : tab))
      setTabs(next)
      if (known.url !== state.url && !switching()) void saveTabs(next)
      if (sameTab(state, active()) && document.activeElement !== addressInput) setURL(state.url)
      if (sameTab(state, active()) && state.error) setError(state.error)
      const failed = navigationError()
      if (
        sameTab(state, active()) &&
        !state.loading &&
        failed?.tabID === state.tabID &&
        failed.generation === state.generation &&
        failed.url === state.url
      ) {
        setError(undefined)
        setNavigationError(undefined)
      }
      if (!state.error && !state.loading && isHTTPS(state.url)) {
        const entry = { url: state.url, title: state.title || new URL(state.url).hostname, visitedAt: Date.now() }
        setHistory((items) => {
          const next = [entry, ...items.filter((item) => item.url !== entry.url)].slice(0, 100)
          if (!switching()) saveHistory(entry.url)
          return next
        })
      }
    }
    const unsubscribeEvent = api()?.appDockEvent((event) => {
      if (event.type === "state") applyState(event.payload)
      if (event.type === "tab-selected") {
        const tab = tabs().find((item) => sameTab(item, event.payload))
        if (!tab || switching()) return
        // A Linux admission emits selection before its promise resolves.
        if (!isLinux(tab.url)) setLinuxIntent("generation", (value) => value + 1)
        setActive(tab)
        setURL(tab.url)
        setNavigation("mode", isLinux(tab.url) ? "linux" : "browser")
        if (!isLinux(tab.url)) setNavigation("lastBrowser", tab)
        resize()
      }
      if (event.type === "tab-opened") {
        const tab = event.payload
        // LinuxOpen's result admits the logical tab under its captured profile.
        // Its event can arrive before the promise, including during a profile switch.
        if (isLinux(tab.url)) return
        setLinuxIntent("generation", (value) => value + 1)
        admitBrowserTab(tab)
      }
      if (event.type === "tab-crashed") {
        const { identity, reason } = event.payload
        if (!tabs().some((tab) => sameTab(tab, identity))) return
        setTabs((items) =>
          items.map((tab) => (sameTab(tab, identity) ? { ...tab, crashed: { identity, reason } } : tab)),
        )
      } else if (event.type === "tab-recovered") {
        const recovered = event.payload
        const crashed = tabs().find(
          (tab) => tab.tabID === recovered.tabID && tab.crashed && sameTab(tab, tab.crashed.identity),
        )
        if (!crashed) return
        setTabs((items) =>
          items.map((tab) => (sameTab(tab, crashed) ? { ...tab, ...recovered, crashed: undefined } : tab)),
        )
        if (sameTab(crashed, active())) {
          setActive(recovered)
          setURL(recovered.url)
        }
        if (sameTab(recovering(), crashed)) setRecovering(undefined)
      } else if (event.type === "navigation-error") {
        const { tabID, generation } = event.payload.identity
        if (!tabs().some((tab) => sameTab(tab, { tabID, generation }))) return
        if (sameTab({ tabID, generation }, active())) {
          setError(event.payload.code === "blocked" ? "Navigation blocked" : "Navigation failed")
          setNavigationError({ tabID, generation, url: event.payload.url })
        }
      } else if (event.type === "download") {
        if (!tabs().some((tab) => sameTab(tab, event.payload))) return
        setDownloads((items) => [event.payload, ...items.filter((item) => item.id !== event.payload.id)].slice(0, 20))
      } else if (event.type === "permission" && sameTab(event.payload.identity, active())) {
        setPermission(event.payload)
      } else if (event.type === "fullscreen" && sameTab(event.payload.identity, active())) {
        setFullscreen(event.payload)
      }
    })
    const unsubscribeFind = api()?.appDockFindResult?.((result) => {
      if (!activeLinux() && sameTab(result, active()) && result.requestID === findRequestID) setFindResult(result)
    })
    const observer = new ResizeObserver(resize)
    if (host) observer.observe(host)
    // Direction changes can move the native host without changing its dimensions.
    const direction = new MutationObserver(resize)
    direction.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] })
    window.addEventListener("resize", resize)
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || !root?.contains(target)) return
      const editable = !!target.closest("input, textarea, select, [contenteditable]")
      if (event.key === "Escape") {
        if (menu()) closeMenu()
        else if (findOpen()) closeFind()
        else if (libraryOpen() || downloadsOpen() || navigation.more || profileCreating()) {
          setLibraryOpen(undefined)
          setDownloadsOpen(false)
          setNavigation("more", false)
          setProfileCreating(false)
        }
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
        void openNewTab()
      } else if (event.key.toLowerCase() === "w" && active()) {
        event.preventDefault()
        void close()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    const insideMenu = (target: EventTarget | null) => target instanceof Node && menuElement?.contains(target)
    const onPointerDown = (event: PointerEvent) => {
      if (menu() && !insideMenu(event.target)) closeMenu(false)
    }
    const onFocusIn = (event: FocusEvent) => {
      if (menu() && !insideMenu(event.target)) closeMenu(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("focusin", onFocusIn)
    void (async () => {
      if (!api()) return
      try {
        const snapshot = await api()!.appDockGetManifest()
        if (disposed) return
        applyManifest(snapshot)
        const generation = ++restoreGeneration
        setSwitching(true)
        await restoreProfile(snapshot.activeProfileID, generation, snapshot)
        if (generation === restoreGeneration) setSwitching(false)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load App Dock")
      }
    })()
    onCleanup(() => {
      disposed = true
      observer.disconnect()
      direction.disconnect()
      window.removeEventListener("resize", resize)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("focusin", onFocusIn)
      unsubscribeEvent?.()
      unsubscribeFind?.()
      void api()?.appDockClose()
    })
  })
  const launch = async () => {
    if (!host || !api() || activeLinux()) return
    setLinuxIntent("generation", (value) => value + 1)
    try {
      const current = active()
      if (current) {
        await api()!.appDockNavigate(current.tabID, url())
        const next = tabs().map((tab) => (sameTab(tab, current) ? { ...tab, url: url() } : tab))
        setTabs(next)
        void saveTabs(next)
        return
      }
      const tab = await api()!.appDockOpen(url(), bounds(host), profile())
      admitBrowserTab(tab)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open App Dock")
    }
  }
  const openLinux = async (): Promise<LinuxOpenResult | undefined> => {
    const dock = api()
    if (disposed || switching() || !host || typeof dock?.appDockLinuxOpen !== "function") return
    const generation = linuxGeneration()
    const profileID = profile()
    setNavigation({ mode: "linux", more: false, windowError: false })
    setProfileCreating(false)
    setLibraryOpen(undefined)
    setDownloadsOpen(false)
    if (!isLinux(activeTab()?.url ?? "")) await dock.appDockHide()
    const result = await dock
      .appDockLinuxOpen(bounds(host), profileID)
      .catch(() => ({ status: "failed", code: "failed" }) as const)
    if (disposed || switching() || generation !== linuxGeneration() || profileID !== profile()) return
    if (result.status === "failed") return result
    closeFind()
    closeMenu(false)
    setLibraryOpen(undefined)
    setDownloadsOpen(false)
    setError(undefined)
    setNavigationError(undefined)
    setPermission(undefined)
    setTabs((items) => {
      const current = items.filter((tab) => !isLinux(tab.url) || tab.tabID === result.tab.tabID)
      return current.some((tab) => tab.tabID === result.tab.tabID)
        ? current.map((tab) => (tab.tabID === result.tab.tabID ? { ...tab, ...result.tab, crashed: undefined } : tab))
        : [...current, result.tab]
    })
    setActive(result.tab)
    setURL(result.tab.url)
    // Logical admission can change the toolbar height after native selection.
    resize()
    void refreshWindows()
    return result
  }
  const openNewTab = async () => {
    if (!host || !api()) return
    setLinuxIntent("generation", (value) => value + 1)
    try {
      setNavigation({ mode: "browser", lastBrowser: undefined, more: false })
      setActive(undefined)
      setURL("")
      closeFind()
      setLibraryOpen(undefined)
      setDownloadsOpen(false)
      setError(undefined)
      await api()!.appDockHide()
      addressInput?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open App Dock")
    }
  }
  const showBrowser = () => {
    setLinuxIntent("generation", value => value + 1)
    const tab = tabs().find(tab => sameTab(tab, navigation.lastBrowser) && !isLinux(tab.url)) ?? tabs().find(tab => !isLinux(tab.url))
    closeFind()
    closeMenu(false)
    setLibraryOpen(undefined)
    setDownloadsOpen(false)
    if (tab) {
      selectTab(tab)
      return
    }
    void openNewTab()
  }
  const close = async (requested = active()) => {
    if (!requested) return
    const items = tabs()
    const wasActive = sameTab(requested, active())
    const index = items.findIndex((tab) => sameTab(tab, requested))
    if (index < 0) return
    if (sameTab(requested, active()) || isLinux(items[index].url)) {
      setLinuxIntent("generation", (value) => value + 1)
    }
    const candidates = items.filter(tab => !sameTab(tab, requested) && isLinux(tab.url) === isLinux(items[index].url))
    const next = candidates.at(-1)
    await api()?.appDockCloseTab(requested.tabID)
    const remaining = tabs().filter((tab) => !sameTab(tab, requested))
    setTabs(remaining)
    void saveTabs(remaining)
    if (!wasActive) return
    setNavigation("mode", isLinux(items[index].url) ? "linux" : "browser")
    if (isLinux(items[index].url)) setNavigation("windows", [])
    setActive(next)
    setURL(next?.url ?? "")
    if (next && host) await api()?.appDockSelect(next.tabID, bounds(host))
    if (!next) await api()?.appDockHide()
    resize()
  }
  const closeTabs = async (tab: Tab, scope: "others" | "right") => {
    const items = tabs()
    const visual = [...items.filter((item) => item.pinned), ...items.filter((item) => !item.pinned)]
    const index = visual.findIndex((item) => sameTab(item, tab))
    if (index < 0 || (scope === "others" ? items.length < 2 : index === visual.length - 1)) return
    setLinuxIntent("generation", (value) => value + 1)
    await api()?.appDockCloseTabs(tab.tabID, scope, scope === "right" ? visual.map((item) => item.tabID) : undefined)
    const closed = scope === "others" ? items.filter((item) => !sameTab(item, tab)) : visual.slice(index + 1)
    const remaining = items.filter((item) => !closed.some((item) => sameTab(item, tab)))
    setTabs(remaining)
    void saveTabs(remaining)
    if (!remaining.some((item) => sameTab(item, active()))) {
      const next = remaining.at(-1)
      setActive(next)
      setURL(next?.url ?? "")
      if (next && host) await api()?.appDockSelect(next.tabID, bounds(host))
    }
  }
  const selectTab = (tab: Tab) => {
    if (isLinux(tab.url)) {
      void linuxMenu.run({ type: "open" })
      return
    }
    setLinuxIntent("generation", (value) => value + 1)
    setActive(tab)
    setURL(tab.url)
    setNavigation({ mode: "browser", lastBrowser: tab, more: false })
    if (!tab.crashed && host) void api()?.appDockSelect(tab.tabID, bounds(host))
    resize()
  }
  const duplicateTab = async (tab: Tab) => {
    if (!host || !isHTTPS(tab.url) || !capability("appDockOpen")) return
    try {
      const copy = await api()!.appDockOpen(tab.url, bounds(host), profile())
      admitBrowserTab(copy)
      selectTab(copy)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not duplicate tab")
    }
  }
  const toggleSidebar = () => {
    const next = !sidebarCollapsed()
    setSidebarCollapsed(next)
    localStorage.setItem(sidebarCollapsedKey, String(next))
    // ResizeObserver can stop with the occluded owner document as well as RAF.
    resize()
  }
  const createProfile = (event: SubmitEvent) => {
    event.preventDefault()
    const name = profileDraft().trim()
    if (!name) return
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32)
    if (!id || profiles().some((item) => item.id === id)) return
    void updateManifest((current) => ({
      ...current,
      profiles: [...current.profiles, { id, name }],
      tabs: { ...current.tabs, [id]: [] },
    }))
    setProfileDraft("")
    setProfileCreating(false)
  }
  const switchProfile = (next: string) => {
    if (next === profile() || switching()) return
    setSwitching(true)
    const generation = ++restoreGeneration
    setLibraryOpen(undefined)
    void (async () => {
      await api()?.appDockHide()
      if (disposed || generation !== restoreGeneration) return
      const snapshot = await updateManifest((current) => ({ ...current, activeProfileID: next }))
      if (!snapshot || disposed || generation !== restoreGeneration) return
      setProfile(snapshot.activeProfileID)
      await restoreProfile(snapshot.activeProfileID, generation, snapshot)
      if (generation === restoreGeneration) setSwitching(false)
    })()
  }
  const activeTab = () => tabs().find((tab) => sameTab(tab, active()))
  const activeLinux = () => navigation.mode === "linux"
  const activeCrashed = () => activeTab()?.crashed
  const recover = async () => {
    const tab = activeTab()
    if (!tab?.crashed || recovering()) return
    if (isLinux(tab.url)) {
      setRecovering(tab)
      await linuxMenu.run({ type: "open" })
      if (!disposed && sameTab(recovering(), tab)) setRecovering(undefined)
      return
    }
    if (!capability("appDockRecoverTab")) return
    setRecovering(tab)
    try {
      await api()!.appDockRecoverTab(tab.tabID)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not recover tab")
    } finally {
      setRecovering(undefined)
    }
  }
  const bookmarked = () => !activeLinux() && !!activeTab() && bookmarks().some((item) => item.url === activeTab()!.url)
  const toggleBookmark = () => {
    const tab = activeTab()
    if (!tab || !isHTTPS(tab.url)) return
    const current = bookmarks()
    const next = current.some((item) => item.url === tab.url)
      ? current.filter((item) => item.url !== tab.url)
      : [{ url: tab.url, title: tabLabel(tab) }, ...current]
    setBookmarks(next)
    void updateManifest((current) => ({ ...current, bookmarks: next.map((item) => item.url) }))
  }
  const find = async (forward: boolean) => {
    const tab = active()
    if (!tab || activeLinux() || !findText().trim()) return
    setFindResult(undefined)
    findRequestID = await api()?.appDockFind(tab.tabID, findText(), forward)
  }
  const closeFind = () => {
    const tab = active()
    if (tab && !activeLinux()) void api()?.appDockStopFind(tab.tabID)
    findRequestID = undefined
    setFindOpen(false)
    setFindResult(undefined)
  }
  const zoom = (delta: number) => {
    const tab = active()
    if (!tab || activeLinux()) return
    void api()
      ?.appDockZoom(tab.tabID)
      .then((factor) => api()?.appDockZoom(tab.tabID, factor + delta))
  }
  const toggleFullscreen = () => {
    const tab = active()
    if (tab) void api()?.appDockFullscreen(tab.tabID, !activeFullscreen())
  }
  const openLibraryItem = async (entry: Bookmark) => {
    setLinuxIntent("generation", (value) => value + 1)
    setLibraryOpen(undefined)
    setURL(entry.url)
    if (!host || !api()) return
    const tab = await api()!.appDockOpen(entry.url, bounds(host), profile())
    admitBrowserTab(tab)
  }
  const refreshWindows = async () => {
    const tab = active()
    const dock = api()
    if (disposed || !activeLinux() || !isLinux(activeTab()?.url ?? "") || !tab || !dock?.appDockLinuxWindows) return
    const result = await dock.appDockLinuxWindows(tab.tabID, tab.generation).catch(() => ({ status: "failed" }) as const)
    if (disposed || !activeLinux() || !sameTab(active(), tab)) return
    if (result.status === "ready") setNavigation({ windows: result.windows, windowError: false })
    if (result.status === "failed") setNavigation("windowError", true)
  }
  const focusWindow = async (windowID: number) => {
    const tab = active()
    if (!tab || navigation.focusing || !api()?.appDockLinuxFocus) return
    setNavigation("focusing", true)
    const result = await api()!.appDockLinuxFocus!(tab.tabID, tab.generation, windowID).catch(() => ({ status: "failed" }) as const)
    if (!disposed && activeLinux() && sameTab(active(), tab)) {
      if (result.status === "failed") setNavigation("windowError", true)
      if (result.status === "focused") await refreshWindows()
    }
    setNavigation("focusing", false)
  }
  const linuxMenu = createLinuxMenuController({
    get api() {
      return api()
    },
    get profile() {
      return profile()
    },
    generation: linuxGeneration,
    get disabled() {
      return switching()
    },
    open: openLinux,
    onLaunched: refreshWindows,
  })
  const surface = { hidden: false }
  createEffect(() => {
    const hidden = !!menu() || profileCreating() || navigation.more || !!libraryOpen() || downloadsOpen()
    const tab = active()
    const mode = navigation.mode
    findOpen()
    error()
    permission()
    activeCrashed()
    navigation.windowError
    untrack(() => {
      resize()
      if (disposed || !api() || !host) return
      if (hidden) {
        surface.hidden = true
        void api()!.appDockHide()
        return
      }
      if (!surface.hidden) return
      surface.hidden = false
      if (tab && (mode === "linux") === isLinux(activeTab()?.url ?? ""))
        void api()!.appDockSelect(tab.tabID, bounds(host))
    })
  })
  onMount(() => {
    const timer = setInterval(() => {
      if (activeLinux() && !linuxMenu.store.busy && !surface.hidden) void refreshWindows()
    }, 2000)
    onCleanup(() => clearInterval(timer))
  })
  return (
    <div ref={root} class="zen-browser-frame">
      <div class="zen-dock-modes" role="tablist" aria-label={language.t("appDock.contexts")}>
        <button type="button" role="tab" aria-selected={!activeLinux()} class={!activeLinux() ? "is-active" : ""} onClick={showBrowser}>
          <span aria-hidden="true">◎</span>{language.t("appDock.browser.title")}
        </button>
        <button type="button" role="tab" aria-selected={activeLinux()} disabled={linuxMenu.blocked()} class={activeLinux() ? "is-active" : ""} onClick={() => void linuxMenu.run({ type: "open" })}>
          <span aria-hidden="true">▣</span>{language.t("appDock.linux.workspace")}
        </button>
      </div>
      <div class={`zen-browser-shell ${sidebarCollapsed() ? "is-sidebar-collapsed" : ""}`}>
        <aside class="zen-browser-sidebar" aria-label="Browser workspaces">
          <div class="zen-workspace-indicator" aria-label="Current workspace">
            <button
              class="zen-sidebar-toggle"
              type="button"
              aria-label={sidebarCollapsed() ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={sidebarCollapsed()}
              onClick={toggleSidebar}
            >
              ||
            </button>
            {!activeLinux() && <span class="zen-workspace-indicator-dot" aria-hidden="true" />}
            {!activeLinux() && <>
            <select
              class="zen-workspace-indicator-name"
              value={profile()}
              aria-label="Browser profile"
              disabled={switching()}
              onChange={(event) => switchProfile(event.currentTarget.value)}
            >
              {profiles().map((item) => (
                <option value={item.id}>{item.name}</option>
              ))}
            </select>
            <button
              class="zen-profile-add"
              type="button"
              aria-label="Create browser profile"
              onClick={() => setProfileCreating(true)}
            >
              +
            </button>
            </>}
            {activeLinux() && !sidebarCollapsed() && <strong class="zen-workspace-kind"><bdi dir="ltr">{language.t("appDock.linux.title")}</bdi></strong>}
          </div>
          {profileCreating() && (
            <form class="zen-profile-form" onSubmit={createProfile}>
              <input
                autofocus
                value={profileDraft()}
                onInput={(event) => setProfileDraft(event.currentTarget.value)}
                placeholder="Profile name"
                aria-label="New profile name"
              />
              <button type="submit" aria-label="Save profile">
                +
              </button>
              <button type="button" aria-label="Cancel profile creation" onClick={() => setProfileCreating(false)}>
                x
              </button>
            </form>
          )}
          {activeLinux() && <LinuxMenu controller={linuxMenu} collapsed={sidebarCollapsed()} />}
          {!activeLinux() && <div class="zen-tabs" role="tablist" aria-label="Tabs">
            {tabs().filter((tab) => tab.pinned).length > 0 && <div class="zen-tab-section-label">Pinned</div>}
            {tabs()
              .filter((tab) => tab.pinned && !isLinux(tab.url))
              .map((tab) => (
                <TabButton tab={tab} active={active} select={selectTab} setMenu={setMenu} />
              ))}
            {tabs()
              .filter((tab) => !tab.pinned && !isLinux(tab.url))
              .map((tab) => (
                <TabButton tab={tab} active={active} select={selectTab} setMenu={setMenu} />
              ))}
            <button class="zen-new-tab" type="button" onClick={() => void openNewTab()}>
              + New tab
            </button>
          </div>}
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
                disabled={navigation.focusing || navigation.windows.length === 0}
                value={navigation.windows.find(window => window.focused)?.id ?? ""}
                onChange={event => void focusWindow(Number(event.currentTarget.value))}
              >
                {navigation.windows.length === 0 && <option value="">{language.t(linuxMenu.store.busy ? "common.loading" : "appDock.linux.noWindows")}</option>}
                {navigation.windows.map(window => <option value={window.id}>{window.title}</option>)}
              </select>
              <button class="zen-nav-button" type="button" title={language.t("appDock.linux.reconnect")} aria-label={language.t("appDock.linux.reconnect")} disabled={linuxMenu.blocked()} onClick={() => void linuxMenu.run({ type: "open" })}>↻</button>
              <button
                class="zen-nav-button"
                type="button"
                aria-label={language.t("appDock.linux.closeWorkspace")}
                title={language.t("appDock.linux.closeWorkspace")}
                onClick={() => void close()}
              >
                ×
              </button>
            </div>
          )}
          {!activeLinux() && (
            <form
              class="zen-urlbar"
              onSubmit={(event) => {
                event.preventDefault()
                void launch()
              }}
            >
              <button
                class="zen-nav-button"
                type="button"
                aria-label="Back"
                disabled={!activeTab()?.canGoBack || !!activeCrashed() || !capability("appDockCommand")}
                onClick={() => {
                  const tab = active()
                  if (tab && !activeLinux()) void api()?.appDockCommand(tab.tabID, "back")
                }}
              >
                &#8592;
              </button>
              <button
                class="zen-nav-button"
                type="button"
                aria-label="Forward"
                disabled={!activeTab()?.canGoForward || !!activeCrashed() || !capability("appDockCommand")}
                onClick={() => {
                  const tab = active()
                  if (tab && !activeLinux()) void api()?.appDockCommand(tab.tabID, "forward")
                }}
              >
                &#8594;
              </button>
              {navigation.more && <button
                class={`zen-nav-button ${bookmarked() ? "is-active" : ""}`}
                type="button"
                aria-label={bookmarked() ? "Remove bookmark" : "Add bookmark"}
                disabled={!active() || activeLinux() || !!activeCrashed()}
                onClick={toggleBookmark}
              >
                &#9733;
              </button>}
              <input
                ref={addressInput}
                value={url()}
                onInput={(event) => setURL(event.currentTarget.value)}
                aria-label="Address"
                disabled={activeLinux() || !!activeCrashed()}
              />
              {navigation.more && <div class="zen-browser-tools">
              <button
                class="zen-nav-button"
                type="button"
                aria-label="Bookmarks"
                onClick={() => { setLibraryOpen(libraryOpen() === "bookmarks" ? undefined : "bookmarks"); setNavigation("more", false) }}
              >
                &#9734;
              </button>
              <button
                class="zen-nav-button"
                type="button"
                aria-label="History"
                onClick={() => { setLibraryOpen(libraryOpen() === "history" ? undefined : "history"); setNavigation("more", false) }}
              >
                &#8986;
              </button>
              <button
                class="zen-nav-button"
                type="button"
                aria-label="Find in page"
                disabled={activeLinux() || !!activeCrashed()}
                onClick={() => { setFindOpen(true); setNavigation("more", false) }}
              >
                &#8981;
              </button>
              <button
                class="zen-nav-button"
                type="button"
                aria-label="Zoom out"
                disabled={activeLinux() || !!activeCrashed()}
                onClick={() => zoom(-0.1)}
              >
                A-
              </button>
              <button
                class="zen-nav-button"
                type="button"
                aria-label="Zoom in"
                disabled={activeLinux() || !!activeCrashed()}
                onClick={() => zoom(0.1)}
              >
                A+
              </button>
              <button
                class="zen-nav-button"
                type="button"
                aria-label="Downloads"
                onClick={() => { setDownloadsOpen(!downloadsOpen()); setNavigation("more", false) }}
              >
                &#8595;
              </button>
              <button
                class="zen-nav-button"
                type="button"
                aria-label={activeFullscreen() ? "Exit fullscreen" : "Enter fullscreen"}
                disabled={!!activeCrashed()}
                onClick={toggleFullscreen}
              >
                {activeFullscreen() ? "Exit" : "Full"}
              </button>
              </div>}
              <button
                class="zen-open-button"
                type="button"
                disabled={!active() || activeLinux() || !!activeCrashed() || !capability("appDockCommand")}
                onClick={() => {
                  const tab = active()
                  if (tab && !activeLinux()) void api()?.appDockCommand(tab.tabID, "reload")
                }}
              >
                {activeTab()?.loading ? "Loading" : "Reload"}
              </button>
              <button class="zen-open-button" type="submit" disabled={!api() || activeLinux() || !!activeCrashed()}>
                {activeTab()?.loading ? "Loading" : "Open"}
              </button>
              <button class="zen-nav-button" type="button" aria-label={language.t("appDock.browser.actions")} aria-expanded={navigation.more} onClick={() => setNavigation("more", value => !value)}>⋯</button>
              {active() && (
                <button class="zen-nav-button" type="button" onClick={() => void close()} aria-label="Close tab">
                  x
                </button>
              )}
            </form>
          )}
          {error() && (
            <div class="zen-error" role="alert" aria-live="assertive">
              {error()}
            </div>
          )}
          {permission() && sameTab(permission()?.identity, active()) && (
            <div class="zen-error" role="status" aria-live="polite">
              {`${permission()!.permission} permission ${permission()!.state}`}
              <button class="zen-nav-button" type="button" aria-label={language.t("common.close")} onClick={() => setPermission(undefined)}>×</button>
            </div>
          )}
          {activeCrashed() && (
            <div class="zen-tab-crash" role="alert" aria-live="assertive">
              <span>Tab crashed ({activeCrashed()!.reason}).</span>
              <button
                type="button"
                disabled={
                  !(activeLinux() ? capability("appDockLinuxOpen") : capability("appDockRecoverTab")) || !!recovering()
                }
                onClick={() => void recover()}
              >
                {recovering() ? "Recovering" : "Recover"}
              </button>
            </div>
          )}
          {activeLinux() && navigation.windowError && !linuxMenu.store.busy && <div class="zen-error" role="status">{language.t("common.requestFailed")}</div>}
          {api() && !active() && !activeLinux() && <div class="zen-empty-state">
            <strong>{language.t("appDock.browser.title")}</strong>
            <span>{language.t("appDock.browser.empty")}</span>
          </div>}
          {libraryOpen() && (
            <div class="zen-library" role="dialog" aria-label={libraryOpen() === "bookmarks" ? "Bookmarks" : "History"}>
              <div class="zen-library-title">{libraryOpen() === "bookmarks" ? "Bookmarks" : "History"}</div>
              <button type="button" aria-label={language.t("common.close")} onClick={() => setLibraryOpen(undefined)}>×</button>
              {(libraryOpen() === "bookmarks" ? bookmarks() : history()).map((entry) => (
                <button type="button" onClick={() => void openLibraryItem(entry)}>
                  <span>{entry.title}</span>
                  <small>{new URL(entry.url).hostname}</small>
                </button>
              ))}
              {(libraryOpen() === "bookmarks" ? bookmarks() : history()).length === 0 && <p>Nothing here yet.</p>}
            </div>
          )}
          {findOpen() && !activeLinux() && (
            <form
              class="zen-findbar"
              onSubmit={(event) => {
                event.preventDefault()
                void find(true)
              }}
            >
              <input
                autofocus
                value={findText()}
                onInput={(event) => setFindText(event.currentTarget.value)}
                aria-label="Find in page"
                placeholder="Find in page"
              />
              <span>{findResult() ? `${findResult()!.activeMatchOrdinal}/${findResult()!.matches}` : ""}</span>
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
          {downloadsOpen() && (
            <div class="zen-library" role="dialog" aria-label="Downloads">
              <div class="zen-library-title">Downloads</div>
              <button type="button" aria-label={language.t("common.close")} onClick={() => setDownloadsOpen(false)}>×</button>
              {downloads().map((download) => (
                <div class="zen-download">
                  <span>{download.filename}</span>
                  <small>
                    {download.state === "progressing" && download.totalBytes > 0
                      ? `${Math.round((download.receivedBytes / download.totalBytes) * 100)}%`
                      : download.state}
                  </small>
                  {download.state === "completed" ? (
                    <button type="button" onClick={() => void api()?.appDockOpenDownload(download.id)}>
                      Open
                    </button>
                  ) : download.state === "progressing" || download.state === "paused" ? (
                    <button type="button" onClick={() => void api()?.appDockCancelDownload(download.id)}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              ))}
              {downloads().length === 0 && <p>No downloads yet.</p>}
            </div>
          )}
          {!api() && (
            <div class="zen-empty-state">
              <strong>Browser needs OpenCode Desktop.</strong>
              <span>Native browser tabs are unavailable in web app.</span>
            </div>
          )}
          <div ref={host} class="zen-browser-host" />
          {menu() && (
            <TabMenu
              tab={menu()!.tab}
              x={menu()!.x}
              y={menu()!.y}
              setElement={(element) => (menuElement = element)}
              canDuplicate={capability("appDockOpen") && !isLinux(menu()!.tab.url) && !menu()!.tab.crashed}
              canReload={capability("appDockCommand") && !isLinux(menu()!.tab.url) && !menu()!.tab.crashed}
              canPin={isHTTPS(menu()!.tab.url)}
              canClose={capability("appDockCloseTab")}
              hasOthers={tabs().length > 1}
              hasRight={
                [...tabs().filter((item) => item.pinned), ...tabs().filter((item) => !item.pinned)].findIndex((item) =>
                  sameTab(item, menu()!.tab),
                ) <
                tabs().length - 1
              }
              onDuplicate={() => {
                void duplicateTab(menu()!.tab)
                closeMenu()
              }}
              onTogglePin={() => {
                const tab = menu()!.tab
                if (!isHTTPS(tab.url)) return
                const next = tabs().map((item) => (sameTab(item, tab) ? { ...item, pinned: !item.pinned } : item))
                setTabs(next)
                void saveTabs(next)
                closeMenu()
              }}
              onReload={() => {
                const tab = menu()!.tab
                if (!isLinux(tab.url)) void api()?.appDockCommand(tab.tabID, "reload")
                closeMenu()
              }}
              onClose={() => {
                void close(menu()!.tab)
                closeMenu()
              }}
              onCloseOthers={() => {
                void closeTabs(menu()!.tab, "others")
                closeMenu()
              }}
              onCloseRight={() => {
                void closeTabs(menu()!.tab, "right")
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
  setMenu: (menu: { tab: Tab; x: number; y: number; invoker: HTMLButtonElement }) => void
}) {
  const language = useLanguage()
  const openMenu = (x: number, y: number, invoker: HTMLButtonElement) =>
    props.setMenu({ tab: props.tab, x, y, invoker })
  const keydown = (event: KeyboardEvent) => {
    const current = event.currentTarget
    if (!(current instanceof HTMLButtonElement)) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      props.select(props.tab)
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault()
      const rect = current.getBoundingClientRect()
      openMenu(rect.left + 8, rect.bottom + 4, current)
    } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      const tabs = [...(current.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']") ?? [])]
      const index = tabs.indexOf(current)
      if (index < 0) return
      const nextDirection =
        event.key === "ArrowDown" ||
        (event.key === "ArrowRight" && getComputedStyle(current).direction !== "rtl") ||
        (event.key === "ArrowLeft" && getComputedStyle(current).direction === "rtl")
      const next =
        event.key === "Home"
          ? tabs[0]
          : event.key === "End"
            ? tabs.at(-1)
            : tabs[(index + (nextDirection ? 1 : -1) + tabs.length) % tabs.length]
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
          (isLinux(props.tab.url) ? language.t("appDock.linux.title") : new URL(props.tab.url).hostname)
            .slice(0, 1)
            .toUpperCase()
        )}
      </span>
      <span class="zen-tab-title">
        <bdi dir={isLinux(props.tab.url) ? "ltr" : "auto"}>
          {isLinux(props.tab.url) ? language.t("appDock.linux.title") : tabLabel(props.tab)}
        </bdi>
      </span>
      {props.tab.pinned ? "Pinned" : ""}
      {props.tab.audible && <span class="zen-tab-audio">&#9835;</span>}
    </button>
  )
}

function TabMenu(props: {
  tab: Tab
  x: number
  y: number
  setElement: (element: HTMLDivElement) => void
  canDuplicate: boolean
  canReload: boolean
  canPin: boolean
  canClose: boolean
  hasOthers: boolean
  hasRight: boolean
  onDuplicate: () => void
  onTogglePin: () => void
  onReload: () => void
  onClose: () => void
  onCloseOthers: () => void
  onCloseRight: () => void
}) {
  return (
    <div
      ref={(element) => {
        props.setElement(element)
        queueMicrotask(() =>
          element.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus(),
        )
      }}
      class="zen-tab-menu"
      role="menu"
      aria-label={`Actions for ${tabLabel(props.tab)}`}
      style={{ left: `${props.x}px`, top: `${props.y}px` }}
    >
      <button type="button" role="menuitem" disabled={!props.canDuplicate} onClick={props.onDuplicate}>
        Duplicate
      </button>
      <button type="button" role="menuitem" disabled={!props.canPin} onClick={props.onTogglePin}>
        {props.tab.pinned ? "Unpin" : "Pin"}
      </button>
      <button type="button" role="menuitem" disabled={!props.canReload} onClick={props.onReload}>
        Reload
      </button>
      <button type="button" role="menuitem" disabled={!props.canClose} onClick={props.onClose}>
        Close
      </button>
      <button type="button" role="menuitem" disabled={!props.hasOthers} onClick={props.onCloseOthers}>
        Close others
      </button>
      <button type="button" role="menuitem" disabled={!props.hasRight} onClick={props.onCloseRight}>
        Close right
      </button>
    </div>
  )
}
