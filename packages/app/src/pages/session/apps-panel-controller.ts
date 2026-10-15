import { batch } from "solid-js"
import { createStore } from "solid-js/store"
import { pathKey } from "@/utils/path-key"
import type { AppDockLinuxAPI, LinuxOpenResult, LinuxWindow } from "../../app-dock-linux"
import { createAppDockOverlayWatch } from "./apps-panel-overlay"
import { bounds, type Bounds } from "./apps-panel-resize"

export type AppDockAPI = {
  appDockOpen: (
    url: string,
    bounds: Bounds,
    profile?: string,
  ) => Promise<{ tabID: string; generation: number; url: string }>
  // Resize, Hide and Select name the tab and generation they target; the desktop applies one only
  // while that tab is still the one attached to the window and ignores it otherwise.
  appDockResize: (tab: TabIdentity, bounds: Bounds) => Promise<void>
  appDockHide: (tab: TabIdentity) => Promise<void>
  // Older desktop builds lack occlusion; overlays then stay behind the native browser as before.
  appDockOcclude?: (occluded: boolean) => Promise<void>
  appDockClose: () => Promise<void>
  appDockCloseTab: (tabID: string) => Promise<void>
  appDockRecoverTab: (tabID: string) => Promise<{ tabID: string; generation: number; url: string }>
  appDockCloseTabs: (tabID: string, scope: "others" | "right", order?: string[]) => Promise<void>
  appDockSelect: (tab: TabIdentity, bounds: Bounds) => Promise<void>
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
        canGoBack?: boolean
        canGoForward?: boolean
      }
    }
  | { type: "tab-opened" | "tab-opened-background"; payload: { tabID: string; generation: number; url: string } }
  // The desktop selected a tab itself (an agent's dock tool or a Linux admission); the view follows it.
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
export type TabIdentity = { tabID: string; generation: number }
export type Tab = TabIdentity & {
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
export type Profile = { id: string; name: string }
export type Bookmark = { url: string; title: string }
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
export type Download = TabIdentity & {
  id: string
  filename: string
  receivedBytes: number
  totalBytes: number
  state: "progressing" | "paused" | "completed" | "cancelled" | "interrupted"
}

// A new tab opens on the search page the address bar already falls back to (app-dock-utils in the desktop main).
const home = "https://www.google.com"
// Older desktop builds lack the manifest calls; without all of these the Dock is unavailable.
const required = [
  "appDockOpen",
  "appDockSelect",
  "appDockHide",
  "appDockClose",
  "appDockCloseTab",
  "appDockEvent",
  "appDockGetManifest",
  "appDockUpdateManifest",
] as const

export const tabLabel = (tab: Tab) => tab.title || new URL(tab.url).hostname
export const sameTab = (left: TabIdentity | undefined, right: TabIdentity | undefined) =>
  !!left && !!right && left.tabID === right.tabID && left.generation === right.generation
const identity = (tab: TabIdentity): TabIdentity => ({ tabID: tab.tabID, generation: tab.generation })
const isHTTPS = (url: string) => URL.canParse(url) && new URL(url).protocol === "https:"
// The Linux workspace is one Dock tab with this address; it is never saved, bookmarked or listed with browser tabs.
export const isLinux = (url: string) => url === "appdock://linux"
const libraryEntries = (urls: string[]): Bookmark[] =>
  urls.filter(isHTTPS).map((url) => ({ url, title: new URL(url).hostname }))
const message = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback)

// A repository profile (server + project worktree) owns exactly one native App Dock profile, and
// through it one persistent browser partition. The ID must match the desktop profile ID pattern.
export function appDockProfile(server: string, directory: string) {
  const hash = [...new TextEncoder().encode(`${server}\0${pathKey(directory)}`)].reduce(
    (value, byte) => ((value ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn,
    0xcbf29ce484222325n,
  )
  return `repo-${hash.toString(36)}`
}

export function createAppDockController(api: AppDockAPI | undefined) {
  const dock = api && required.every((name) => typeof api[name] === "function") ? api : undefined
  const [state, setState] = createStore({
    // The requested owner: a repository profile ID, or "" to follow the manifest's active profile
    // the way the Apps panel always did outside Orchestra.
    owner: undefined as string | undefined,
    profile: undefined as string | undefined,
    profiles: [{ id: "default", name: "Personal" }] as Profile[],
    status: "idle" as "idle" | "loading" | "ready" | "failed",
    url: home,
    tabs: [] as Tab[],
    active: undefined as TabIdentity | undefined,
    error: undefined as string | undefined,
    navigationError: undefined as (TabIdentity & { url: string }) | undefined,
    bookmarks: [] as Bookmark[],
    history: [] as HistoryEntry[],
    downloads: [] as Download[],
    permission: undefined as { permission: string; state: "denied" } | undefined,
    fullscreen: false,
    recovering: undefined as TabIdentity | undefined,
    // Which side of the Dock the user is on. The Linux side keeps its mode with no tab so it can offer to open one.
    mode: "browser" as "browser" | "linux",
    lastBrowser: undefined as TabIdentity | undefined,
    windows: [] as LinuxWindow[],
    windowError: false,
    focusing: false,
    // Bumped by every browser intent so a Linux open that resolves later does not take the screen back.
    linuxIntent: 0,
  })
  // Views come and go (Dock page, Chat's Apps tab); the live tabs stay with this controller. The
  // last attached view owns the native view placement, and only its detach hides the Dock.
  let host: HTMLElement | undefined
  let attachments = 0
  // Every owner change starts a new generation; work started under an older one must not land.
  let generation = 0
  // An open reply must not replace a selection requested after that open.
  let selection = 0
  let listening = false
  let overlays: ReturnType<typeof createAppDockOverlayWatch> | undefined
  let manifest: AppDockManifest | undefined
  let manifestWrite = Promise.resolve()

  const activeTab = () => state.tabs.find((tab) => sameTab(tab, state.active))
  const frame = () => (host ? bounds(host) : { x: 0, y: 0, width: 1, height: 1 })
  const applyManifest = (next: AppDockManifest) => {
    manifest = next
    setState({
      profiles: next.profiles,
      bookmarks: libraryEntries(next.bookmarks),
      history: libraryEntries(next.history).map((entry) => ({ ...entry, visitedAt: Date.now() })),
    })
  }
  const updateManifest = (change: (current: AppDockManifest) => AppDockManifest) => {
    const run = async () => {
      if (!dock || !manifest) return
      let current = manifest
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await dock.appDockUpdateManifest(current.revision, change(current))
        if (result.status === "updated") return applyManifest(result.manifest)
        current = await dock.appDockGetManifest()
        applyManifest(current)
      }
      setState("error", "App Dock changed in another window")
    }
    manifestWrite = manifestWrite.then(run).catch((cause) => setState("error", message(cause, String(cause))))
    return manifestWrite
  }
  const saveTabs = (items: Tab[], profile = state.profile) =>
    updateManifest((current) =>
      profile && current.profiles.some((item) => item.id === profile)
        ? {
            ...current,
            tabs: {
              ...current.tabs,
              [profile]: items.filter((tab) => isHTTPS(tab.url)).map((tab) => ({ url: tab.url, pinned: !!tab.pinned })),
            },
          }
        : current,
    )
  const saveHistory = (url: string) => {
    if (!isHTTPS(url)) return
    void updateManifest((current) => ({
      ...current,
      history: [url, ...current.history.filter((item) => item !== url)].slice(0, 100),
    }))
  }

  const fail =
    (current: number, fallback = "Could not open App Dock") =>
    (cause: unknown) => {
      if (current === generation) setState("error", message(cause, fallback))
    }
  const load = async (owner: string) => {
    if (!dock) return
    const current = ++generation
    setState({
      owner,
      profile: owner || undefined,
      status: "loading",
      url: home,
      tabs: [],
      active: undefined,
      error: undefined,
      navigationError: undefined,
      downloads: [],
      permission: undefined,
      fullscreen: false,
      recovering: undefined,
      mode: "browser",
      lastBrowser: undefined,
      windows: [],
      windowError: false,
      linuxIntent: state.linuxIntent + 1,
    })
    const result = await restore(dock, owner, current).then(
      (tabs) => ({ tabs }),
      (cause: unknown) => ({ cause }),
    )
    if (current !== generation) return
    if ("cause" in result) {
      setState({ status: "failed", error: message(result.cause, "Could not load App Dock") })
      return
    }
    const first = result.tabs[0]
    setState({
      status: "ready",
      tabs: result.tabs,
      active: first && identity(first),
      lastBrowser: first && identity(first),
      url: first?.url ?? home,
    })
    if (first && host) await dock.appDockSelect(identity(first), bounds(host)).catch(fail(current))
    // Restoring attached each tab it opened in turn, so the last one is on screen until a view shows another.
    await conceal(result.tabs.at(-1))
  }
  const restore = async (dock: AppDockAPI, owner: string, current: number) => {
    // One owner per window: the previous owner's tabs are already saved in the manifest, and a
    // fresh controller may find tabs that a reloaded renderer left behind.
    await dock.appDockClose()
    const snapshot = await dock.appDockGetManifest()
    if (current !== generation) return []
    applyManifest(snapshot)
    const profile = owner || snapshot.activeProfileID
    setState("profile", profile)
    const restored: Tab[] = []
    for (const saved of (snapshot.tabs[profile] ?? []).filter((tab) => isHTTPS(tab.url))) {
      // Skip stale or unavailable URLs during restore.
      const opened = await dock.appDockOpen(saved.url, frame(), profile).catch(() => undefined)
      if (current !== generation) {
        if (opened) await dock.appDockCloseTab(opened.tabID).catch(() => undefined)
        return []
      }
      if (opened) restored.push({ ...saved, ...opened })
    }
    return restored
  }

  const applyTabState = (next: Tab & { error?: string }) => {
    const known = state.tabs.find((tab) => sameTab(tab, next))
    if (!known) return
    if (isLinux(known.url) && !isLinux(next.url)) return
    const tabs = state.tabs.map((tab) => (sameTab(tab, next) ? { ...tab, ...next } : tab))
    const ready = state.status === "ready"
    setState("tabs", tabs)
    if (known.url !== next.url && ready) void saveTabs(tabs)
    if (sameTab(next, state.active)) setState("url", next.url)
    if (sameTab(next, state.active) && next.error) setState("error", next.error)
    const failed = state.navigationError
    if (sameTab(next, state.active) && !next.loading && sameTab(failed, next) && failed?.url === next.url)
      setState({ error: undefined, navigationError: undefined })
    if (next.error || next.loading || !isHTTPS(next.url)) return
    const entry = { url: next.url, title: next.title || new URL(next.url).hostname, visitedAt: Date.now() }
    setState("history", (items) => [entry, ...items.filter((item) => item.url !== entry.url)].slice(0, 100))
    if (ready) saveHistory(entry.url)
  }
  const listen = () => {
    if (!dock || listening) return
    listening = true
    // Native tabs keep running while no view is attached, so this subscription lives with the window.
    dock.appDockEvent((event) => {
      if (event.type === "state") return applyTabState(event.payload)
      if (event.type === "tab-selected") {
        const tab = state.tabs.find((item) => sameTab(item, event.payload))
        if (!tab || state.status !== "ready") return
        if (!isLinux(tab.url)) bumpLinux()
        selection++
        setState({ active: identity(tab), url: tab.url, ...placement(tab) })
        return
      }
      if (event.type === "tab-opened") {
        const tab = event.payload
        // The Linux open's own reply admits the workspace tab under the profile it captured, and a restore
        // admits the tabs it reopens itself.
        if (isLinux(tab.url) || state.status !== "ready") return
        bumpLinux()
        const tabs = state.tabs.some((item) => sameTab(item, tab)) ? state.tabs : [...state.tabs, tab]
        selection++
        setState({ tabs, active: identity(tab), url: tab.url, ...placement(tab) })
        if (state.status === "ready") void saveTabs(tabs)
        void show(tab, generation)
        void conceal(tab)
        return
      }
      // A popup from a tab that was not on screen stays unattached and unselected until the user picks it.
      if (event.type === "tab-opened-background") {
        const tab = event.payload
        if (isLinux(tab.url) || state.tabs.some((item) => sameTab(item, tab))) return
        const tabs = [...state.tabs, tab]
        setState("tabs", tabs)
        if (state.status === "ready") void saveTabs(tabs)
        return
      }
      if (event.type === "tab-crashed") {
        const crashed = event.payload
        if (!state.tabs.some((tab) => sameTab(tab, crashed.identity))) return
        setState("tabs", (tabs) => tabs.map((tab) => (sameTab(tab, crashed.identity) ? { ...tab, crashed } : tab)))
        return
      }
      if (event.type === "tab-recovered") {
        const recovered = event.payload
        const crashed = state.tabs.find(
          (tab) => tab.tabID === recovered.tabID && tab.crashed && sameTab(tab, tab.crashed.identity),
        )
        if (!crashed) return
        const wasActive = sameTab(crashed, state.active)
        batch(() => {
          setState("tabs", (tabs) =>
            tabs.map((tab) => (sameTab(tab, crashed) ? { ...tab, ...recovered, crashed: undefined } : tab)),
          )
          if (wasActive) setState({ active: identity(recovered), url: recovered.url })
          if (sameTab(state.recovering, crashed)) setState("recovering", undefined)
        })
        // Recovery can attach before its event arrives, after a Hide named the old generation.
        if (wasActive) void show(recovered, generation)
        void conceal(recovered)
        return
      }
      if (event.type === "navigation-error") {
        const failed = event.payload.identity
        if (!state.tabs.some((tab) => sameTab(tab, failed)) || !sameTab(failed, state.active)) return
        setState({
          error: event.payload.code === "blocked" ? "Navigation blocked" : "Navigation failed",
          navigationError: { ...identity(failed), url: event.payload.url },
        })
        return
      }
      if (event.type === "download") {
        const download = event.payload
        if (!state.tabs.some((tab) => sameTab(tab, download))) return
        setState("downloads", (items) => [download, ...items.filter((item) => item.id !== download.id)].slice(0, 20))
        return
      }
      if (event.type === "permission" && sameTab(event.payload.identity, state.active))
        setState("permission", { permission: event.payload.permission, state: event.payload.state })
      if (event.type === "fullscreen" && sameTab(event.payload.identity, state.active))
        setState("fullscreen", event.payload.enabled)
    })
  }

  // Occlusion is window state on the desktop side, not a hide of one tab: while it holds, every view
  // the Dock shows stays hidden, and releasing it shows whichever tab is active by then. No older tab,
  // owner or generation can restore a stale view. The first measurement resets a reloaded window.
  const watch = () => {
    if (dock?.appDockOcclude)
      overlays ??= createAppDockOverlayWatch({
        body: document.body,
        target: () => host,
        change: (covered) => void dock.appDockOcclude?.(covered).catch(() => undefined),
        requestAnimationFrame: (callback) => requestAnimationFrame(callback),
        cancelAnimationFrame: (frame) => cancelAnimationFrame(frame),
      })
    return overlays
  }

  const bumpLinux = () => setState("linuxIntent", (value) => value + 1)
  const placement = (tab: Tab | (TabIdentity & { url: string })) =>
    isLinux(tab.url) ? { mode: "linux" as const } : { mode: "browser" as const, lastBrowser: identity(tab) }

  const open = async (url: string, fallback = "Could not open App Dock") => {
    const profile = state.profile
    if (!dock || !host || !profile || state.status !== "ready") return
    bumpLinux()
    const current = generation
    const requested = ++selection
    const tab = await dock.appDockOpen(url, bounds(host), profile).catch(fail(current, fallback))
    if (!tab) return
    if (current !== generation) {
      await dock.appDockCloseTab(tab.tabID).catch(() => undefined)
      return
    }
    // The desktop announces every tab it opens before replying, so the reply may find its tab admitted
    // already, with newer navigation state than this reply carries.
    const known = state.tabs.find((item) => sameTab(item, tab))
    const tabs = known ? state.tabs : [...state.tabs, tab]
    batch(() => {
      setState("tabs", tabs)
      if (requested === selection) setState({ active: identity(tab), url: known?.url ?? tab.url, ...placement(tab) })
    })
    void saveTabs(tabs, profile)
    // Opening attaches before replying; a later selection may already have replaced that view.
    if (!activeTab()?.crashed) void show(state.active, current)
    void conceal(tab)
  }
  const show = (tab: TabIdentity | undefined, current: number) => {
    if (!dock || !tab || !host) return
    return dock.appDockSelect(identity(tab), bounds(host)).catch(fail(current))
  }
  // The desktop attaches every tab it opens (restored, new or a popup from the tab on screen) and each
  // tab it recovers in place. Conceal arrivals while no host or live selection can show them: an earlier
  // Hide named the tab attached then and cannot reach a newer tab or recovery generation.
  const conceal = (tab: TabIdentity | undefined) => {
    if (dock && tab && (!host || !state.active || activeTab()?.crashed))
      return dock.appDockHide(identity(tab)).catch(() => undefined)
  }

  const select = (tab: Tab) => {
    const previous = state.active
    if (!isLinux(tab.url)) bumpLinux()
    selection++
    setState({ active: identity(tab), url: tab.url, ...placement(tab) })
    if (!tab.crashed) return void show(tab, generation)
    // A crashed tab is not shown, so the tab shown before it must not stay on screen in its place.
    if (dock && previous && !sameTab(previous, tab)) void dock.appDockHide(identity(previous)).catch(() => undefined)
  }
  const refreshWindows = async () => {
    const tab = state.active
    if (!dock?.appDockLinuxWindows || state.mode !== "linux" || !tab || !isLinux(activeTab()?.url ?? "")) return
    const result = await dock
      .appDockLinuxWindows(tab.tabID, tab.generation)
      .catch(() => ({ status: "failed" }) as const)
    if (state.mode !== "linux" || !sameTab(state.active, tab)) return
    if (result.status === "ready") setState({ windows: result.windows, windowError: false })
    if (result.status === "failed") setState("windowError", true)
  }

  return {
    api: dock,
    available: !!dock,
    state,
    // Attach a view to the window's Dock. A different repository profile replaces the live tabs
    // with that profile's saved tabs; the same profile shows its live tabs again without reloading.
    // Without a repository profile the Dock follows the manifest's active browser profile.
    attach(element: HTMLElement, profile?: string) {
      if (!dock) return () => undefined
      const token = ++attachments
      host = element
      listen()
      watch()?.sync()
      if ((profile ?? "") !== state.owner || state.status === "failed") void load(profile ?? "")
      else if (state.status === "ready" && !activeTab()?.crashed) void show(state.active, generation)
      return () => {
        if (token !== attachments) return
        host = undefined
        void conceal(state.active)
      }
    },
    owns: (element: HTMLElement | undefined) => !!element && element === host,
    // A popover drawn inside the Dock's own tree over the page area hides the native browser while open.
    registerOverlay: (element: Element) => watch()?.register(element) ?? (() => undefined),
    // Bounds measured for one tab; the desktop drops them once another tab or generation is attached.
    resize: (tab: TabIdentity, next: Bounds) => dock?.appDockResize(identity(tab), next) ?? Promise.resolve(),
    retry() {
      if (state.owner !== undefined && state.status === "failed") void load(state.owner)
    },
    // Manual browser profiles exist only outside Orchestra, where no repository owns the Dock.
    async switchProfile(next: string) {
      if (state.owner !== "" || next === state.profile || state.status !== "ready") return
      const current = ++generation
      setState("status", "loading")
      await updateManifest((manifest) =>
        manifest.profiles.some((item) => item.id === next) ? { ...manifest, activeProfileID: next } : manifest,
      )
      if (current === generation) await load("")
    },
    createProfile(name: string) {
      const id = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32)
      if (!id || state.profiles.some((item) => item.id === id)) return false
      void updateManifest((current) => ({
        ...current,
        profiles: [...current.profiles, { id, name }],
        tabs: { ...current.tabs, [id]: [] },
      }))
      return true
    },
    setURL: (url: string) => setState("url", url),
    async launch() {
      const current = activeTab()
      if (!current) return open(state.url)
      if (!dock || !host) return
      const url = state.url
      const navigated = await dock.appDockNavigate(current.tabID, url).then(() => true, fail(generation))
      if (!navigated || !state.tabs.some((tab) => sameTab(tab, current))) return
      const tabs = state.tabs.map((tab) => (sameTab(tab, current) ? { ...tab, url } : tab))
      setState("tabs", tabs)
      void saveTabs(tabs)
    },
    openNewTab: () => open(home),
    duplicate: (tab: Tab) => open(tab.url, "Could not duplicate tab"),
    openLibraryItem(entry: Bookmark) {
      setState("url", entry.url)
      return open(entry.url)
    },
    async close(requested: TabIdentity | undefined = state.active) {
      if (!dock || !requested) return
      const items = state.tabs
      const index = items.findIndex((tab) => sameTab(tab, requested))
      if (index < 0) return
      const current = generation
      const linux = isLinux(items[index]!.url)
      if (linux || sameTab(requested, state.active)) bumpLinux()
      // Closing stays on its side of the Dock: the next tab is the newest one of the same kind.
      const next = items.filter((tab) => !sameTab(tab, requested) && isLinux(tab.url) === linux).at(-1)
      const wasActive = sameTab(requested, state.active)
      const closed = await dock.appDockCloseTab(requested.tabID).then(() => true, fail(current))
      if (!closed || current !== generation) return
      const remaining = state.tabs.filter((tab) => !sameTab(tab, requested))
      setState("tabs", remaining)
      void saveTabs(remaining)
      if (!wasActive) return
      // The desktop may attach any neighbour, even across sides (the Linux workspace after the last
      // browser tab); the view stays on the closed tab's side and hides what it did not choose.
      const attached = state.active
      selection++
      setState({
        active: next && identity(next),
        url: next?.url ?? home,
        mode: linux ? "linux" : "browser",
        ...(linux ? { windows: [] } : {}),
      })
      if (next) return void (await show(next, current))
      if (attached && !sameTab(attached, requested)) await dock.appDockHide(identity(attached)).catch(() => undefined)
    },
    async closeTabs(tab: Tab, scope: "others" | "right") {
      if (!dock) return
      const items = state.tabs
      const visual = [...items.filter((item) => item.pinned), ...items.filter((item) => !item.pinned)]
      const index = visual.findIndex((item) => sameTab(item, tab))
      if (index < 0 || (scope === "others" ? items.length < 2 : index === visual.length - 1)) return
      bumpLinux()
      const current = generation
      const done = await dock
        .appDockCloseTabs(tab.tabID, scope, scope === "right" ? visual.map((item) => item.tabID) : undefined)
        .then(() => true, fail(current))
      if (!done || current !== generation) return
      const closed = scope === "others" ? items.filter((item) => !sameTab(item, tab)) : visual.slice(index + 1)
      const remaining = state.tabs.filter((item) => !closed.some((other) => sameTab(other, item)))
      setState("tabs", remaining)
      void saveTabs(remaining)
      if (remaining.some((item) => sameTab(item, state.active))) return
      const next = remaining.at(-1)
      selection++
      setState({ active: next && identity(next), url: next?.url ?? home })
      await show(next, current)
    },
    select,
    togglePin(tab: Tab) {
      const tabs = state.tabs.map((item) => (sameTab(item, tab) ? { ...item, pinned: !item.pinned } : item))
      setState("tabs", tabs)
      void saveTabs(tabs)
    },
    async recover() {
      const tab = activeTab()
      if (!dock || !tab?.crashed || state.recovering) return
      setState("recovering", identity(tab))
      await dock.appDockRecoverTab(tab.tabID).catch(fail(generation, "Could not recover tab"))
      setState("recovering", undefined)
    },
    toggleBookmark() {
      const tab = activeTab()
      if (!tab || !isHTTPS(tab.url)) return
      const next = state.bookmarks.some((item) => item.url === tab.url)
        ? state.bookmarks.filter((item) => item.url !== tab.url)
        : [{ url: tab.url, title: tabLabel(tab) }, ...state.bookmarks]
      setState("bookmarks", next)
      void updateManifest((current) => ({ ...current, bookmarks: next.map((item) => item.url) }))
    },
    // Back to the browser side: the last browser tab, or an empty address bar when there is none.
    showBrowser() {
      bumpLinux()
      const tab =
        state.tabs.find((item) => sameTab(item, state.lastBrowser) && !isLinux(item.url)) ??
        state.tabs.find((item) => !isLinux(item.url))
      if (tab) return select(tab)
      const previous = state.active
      selection++
      setState({ mode: "browser", active: undefined, url: home })
      if (dock && previous) void dock.appDockHide(identity(previous)).catch(() => undefined)
    },
    // Opens (or reconnects) the Linux workspace tab. Returns the desktop's result so the Linux menu can
    // report a failure; a result overtaken by a newer intent, owner or profile is dropped.
    async openLinux(): Promise<LinuxOpenResult | undefined> {
      const profile = state.profile
      if (!dock?.appDockLinuxOpen || !host || !profile || state.status !== "ready") return
      const intent = state.linuxIntent
      const current = generation
      setState({ mode: "linux", windowError: false })
      const previous = activeTab()
      if (previous && !isLinux(previous.url)) await dock.appDockHide(identity(previous)).catch(() => undefined)
      const result = await dock
        .appDockLinuxOpen(bounds(host), profile)
        .catch(() => ({ status: "failed", code: "failed" }) as const)
      if (current !== generation || intent !== state.linuxIntent || profile !== state.profile) return
      if (result.status === "failed") return result
      const tab = result.tab
      selection++
      batch(() => {
        setState("tabs", (tabs) => {
          const kept = tabs.filter((item) => !isLinux(item.url) || item.tabID === tab.tabID)
          return kept.some((item) => item.tabID === tab.tabID)
            ? kept.map((item) => (item.tabID === tab.tabID ? { ...item, ...tab, crashed: undefined } : item))
            : [...kept, tab]
        })
        setState({
          active: identity(tab),
          url: tab.url,
          mode: "linux",
          error: undefined,
          navigationError: undefined,
          permission: undefined,
        })
      })
      void refreshWindows()
      return result
    },
    refreshWindows,
    async focusWindow(windowID: number) {
      const tab = state.active
      if (!tab || state.focusing || !dock?.appDockLinuxFocus) return
      setState("focusing", true)
      const result = await dock
        .appDockLinuxFocus(tab.tabID, tab.generation, windowID)
        .catch(() => ({ status: "failed" }) as const)
      if (state.mode === "linux" && sameTab(state.active, tab)) {
        if (result.status === "failed") setState("windowError", true)
        if (result.status === "focused") await refreshWindows()
      }
      setState("focusing", false)
    },
  }
}

export type AppDockController = ReturnType<typeof createAppDockController>

let controller: AppDockController | undefined
// One controller per renderer, and so per window: every Dock view attaches to the same live tabs.
export const appDockController = () => (controller ??= createAppDockController(window.api as AppDockAPI | undefined))
