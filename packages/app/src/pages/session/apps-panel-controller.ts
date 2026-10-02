import { batch } from "solid-js"
import { createStore } from "solid-js/store"
import { pathKey } from "@/utils/path-key"
import { bounds, type Bounds } from "./apps-panel-resize"

export type AppDockAPI = {
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
}
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
      }
    }
  | { type: "tab-opened"; payload: { tabID: string; generation: number; url: string } }
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
type Download = TabIdentity & {
  id: string
  filename: string
  receivedBytes: number
  totalBytes: number
  state: "progressing" | "paused" | "completed" | "cancelled" | "interrupted"
}

const home = "https://opencode.ai"
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
  })
  // Views come and go (Dock page, Chat's Apps tab); the live tabs stay with this controller. The
  // last attached view owns the native view placement, and only its detach hides the Dock.
  let host: HTMLElement | undefined
  let attachments = 0
  // Every owner change starts a new generation; work started under an older one must not land.
  let generation = 0
  let listening = false
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
    setState({ status: "ready", tabs: result.tabs, active: first && identity(first), url: first?.url ?? home })
    if (first && host) await dock.appDockSelect(first.tabID, bounds(host)).catch(fail(current))
    if (!host) await dock.appDockHide().catch(() => undefined)
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
    const tabs = state.tabs.map((tab) => (sameTab(tab, next) ? { ...tab, ...next } : tab))
    const ready = state.status === "ready"
    setState("tabs", tabs)
    if (known.url !== next.url && ready) void saveTabs(tabs)
    if (sameTab(next, state.active)) setState("url", next.url)
    if (sameTab(next, state.active) && next.error) setState("error", next.error)
    const failed = state.navigationError
    if (sameTab(next, state.active) && !next.loading && sameTab(failed, next) && failed?.url === next.url)
      setState({ error: undefined, navigationError: undefined })
    if (next.error || next.loading) return
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
      if (event.type === "tab-opened") {
        const tab = event.payload
        const tabs = state.tabs.some((item) => sameTab(item, tab)) ? state.tabs : [...state.tabs, tab]
        setState({ tabs, active: identity(tab), url: tab.url })
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

  const open = async (url: string, fallback = "Could not open App Dock") => {
    const profile = state.profile
    if (!dock || !host || !profile || state.status !== "ready") return
    const current = generation
    const tab = await dock.appDockOpen(url, bounds(host), profile).catch(fail(current, fallback))
    if (!tab) return
    if (current !== generation) {
      await dock.appDockCloseTab(tab.tabID).catch(() => undefined)
      return
    }
    const tabs = [...state.tabs, tab]
    setState({ tabs, active: identity(tab), url: tab.url })
    void saveTabs(tabs, profile)
  }
  const show = (tab: TabIdentity | undefined, current: number) => {
    if (!dock || !tab || !host) return
    return dock.appDockSelect(tab.tabID, bounds(host)).catch(fail(current))
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
      if ((profile ?? "") !== state.owner || state.status === "failed") void load(profile ?? "")
      else if (state.status === "ready" && !activeTab()?.crashed) void show(state.active, generation)
      return () => {
        if (token !== attachments) return
        host = undefined
        void dock.appDockHide().catch(() => undefined)
      }
    },
    owns: (element: HTMLElement | undefined) => !!element && element === host,
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
      const next = items[index + 1] ?? items[index - 1]
      const closed = await dock.appDockCloseTab(requested.tabID).then(() => true, fail(current))
      if (!closed || current !== generation) return
      const remaining = state.tabs.filter((tab) => !sameTab(tab, requested))
      setState("tabs", remaining)
      void saveTabs(remaining)
      if (!sameTab(requested, state.active)) return
      setState({ active: next && identity(next), url: next?.url ?? home })
      await show(next, current)
    },
    async closeTabs(tab: Tab, scope: "others" | "right") {
      if (!dock) return
      const items = state.tabs
      const visual = [...items.filter((item) => item.pinned), ...items.filter((item) => !item.pinned)]
      const index = visual.findIndex((item) => sameTab(item, tab))
      if (index < 0 || (scope === "others" ? items.length < 2 : index === visual.length - 1)) return
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
      setState({ active: next && identity(next), url: next?.url ?? home })
      await show(next, current)
    },
    select(tab: Tab) {
      setState({ active: identity(tab), url: tab.url })
      if (!tab.crashed) void show(tab, generation)
    },
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
      if (!tab) return
      const next = state.bookmarks.some((item) => item.url === tab.url)
        ? state.bookmarks.filter((item) => item.url !== tab.url)
        : [{ url: tab.url, title: tabLabel(tab) }, ...state.bookmarks]
      setState("bookmarks", next)
      void updateManifest((current) => ({ ...current, bookmarks: next.map((item) => item.url) }))
    },
  }
}

export type AppDockController = ReturnType<typeof createAppDockController>

let controller: AppDockController | undefined
// One controller per renderer, and so per window: every Dock view attaches to the same live tabs.
export const appDockController = () => (controller ??= createAppDockController(window.api as AppDockAPI | undefined))
