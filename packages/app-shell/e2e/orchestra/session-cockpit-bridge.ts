export type DockCall = {
  type: string
  url?: string
  tabID?: string
  generation?: number
  bounds?: { x: number; y: number; width: number; height: number }
}

// A preload-boundary fixture, not an Electron emulation. The app's real controller owns the state.
export function installDockBridge() {
  const calls: DockCall[] = []
  const listeners = new Set<(event: unknown) => void>()
  let manifest = {
    version: 1,
    revision: 0,
    profiles: [{ id: "default", name: "Personal" }],
    activeProfileID: "default",
    tabs: {} as Record<string, { url: string; pinned: boolean }[]>,
    bookmarks: [] as string[],
    history: [] as string[],
  }
  let next = 0
  const emit = (event: unknown) => setTimeout(() => listeners.forEach((listener) => listener(event)), 0)
  type Identity = { tabID: string; generation: number }
  type Bounds = { x: number; y: number; width: number; height: number }
  const api = {
    appDockOpen: async (url: string, _bounds: Bounds, profile = "default") => {
      calls.push({ type: "open", url })
      const opened = { tabID: `tab-${++next}`, generation: next, url }
      if (!manifest.profiles.some((item) => item.id === profile))
        manifest = {
          ...manifest,
          revision: manifest.revision + 1,
          profiles: [...manifest.profiles, { id: profile, name: profile }],
          tabs: { ...manifest.tabs, [profile]: [] },
        }
      emit({
        type: "state",
        payload: { ...opened, title: `Page ${new URL(url).pathname}`, loading: false, audible: false },
      })
      return opened
    },
    appDockSelect: async (tab: Identity, bounds: Bounds) => {
      calls.push({ type: "select", tabID: tab.tabID, generation: tab.generation, bounds })
    },
    appDockHide: async (tab: Identity) => {
      calls.push({ type: "hide", tabID: tab.tabID, generation: tab.generation })
    },
    appDockResize: async (tab: Identity, bounds: Bounds) => {
      calls.push({ type: "resize", tabID: tab.tabID, generation: tab.generation, bounds })
    },
    appDockOcclude: async () => undefined,
    appDockClose: async () => {
      calls.push({ type: "close" })
    },
    appDockCloseTab: async (tabID: string) => {
      calls.push({ type: "close-tab", tabID })
    },
    appDockNavigate: async (tabID: string, url: string) => {
      calls.push({ type: "navigate", tabID, url })
    },
    appDockCommand: async () => undefined,
    appDockFindResult: () => () => undefined,
    appDockEvent: (listener: (event: unknown) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    appDockGetManifest: async () => structuredClone(manifest),
    appDockUpdateManifest: async (revision: number, value: typeof manifest) => {
      if (revision !== manifest.revision) return { status: "conflict", manifest: structuredClone(manifest) }
      manifest = { ...structuredClone(value), revision: revision + 1 }
      return { status: "updated", manifest: structuredClone(manifest) }
    },
  }
  Object.assign(window, { api, __dock: calls, __dockEmit: emit })
  Object.defineProperty(window, "__dockSubscriptions", { get: () => listeners.size })
}
