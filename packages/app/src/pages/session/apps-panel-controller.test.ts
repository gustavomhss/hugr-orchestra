import { describe, expect, test } from "bun:test"
import { appDockProfile, createAppDockController, type AppDockAPI } from "./apps-panel-controller"

const profileA = appDockProfile("http://127.0.0.1:4096", "/work/shared repository")
const profileB = appDockProfile("http://127.0.0.1:4097", "/work/shared repository")

describe("App Dock controller", () => {
  test("maps each repository profile to one stable, isolated native profile", () => {
    expect(appDockProfile("http://127.0.0.1:4096", "/work/shared repository")).toBe(profileA)
    expect(appDockProfile("http://127.0.0.1:4096", "/work/shared repository/")).toBe(profileA)
    expect(profileB).not.toBe(profileA)
    expect(appDockProfile("http://127.0.0.1:4096", "/work/other repository")).not.toBe(profileA)
    for (const id of [profileA, profileB]) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,31}$/)
  })

  test("moving between views hides and shows the same live tabs without reopening or closing", async () => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    const page = element()
    const detachPage = controller.attach(page, profileA)
    await until(() => controller.state.status === "ready")
    controller.setURL("https://example.com/a")
    await controller.launch()
    expect(controller.state.tabs.map((tab) => tab.tabID)).toEqual(["tab-1"])
    const before = dock.calls.length

    detachPage()
    const apps = element()
    const detachApps = controller.attach(apps, profileA)
    await settle()
    detachApps()
    const detachReturn = controller.attach(element(), profileA)
    await settle()

    expect(dock.calls.slice(before)).toEqual([["hide"], ["select", "tab-1"], ["hide"], ["select", "tab-1"]])
    expect(controller.state.tabs.map((tab) => [tab.tabID, tab.generation, tab.url])).toEqual([
      ["tab-1", 1, "https://example.com/a"],
    ])
    expect(controller.state.url).toBe("https://example.com/a")
    detachReturn()
  })

  test("keeps one owner: a replaced view's late detach does not hide the current view", async () => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    const page = element()
    const detachPage = controller.attach(page, profileA)
    await until(() => controller.state.status === "ready")
    const apps = element()
    const detachApps = controller.attach(apps, profileA)
    expect(controller.owns(apps)).toBe(true)
    expect(controller.owns(page)).toBe(false)
    const before = dock.calls.length
    detachPage()
    expect(dock.calls.slice(before)).toEqual([])
    detachApps()
    expect(dock.calls.slice(before)).toEqual([["hide"]])
    expect(dock.subscriptions()).toBe(1)
  })

  test("a repository profile switch restores that profile's saved tabs in its own native profile", async () => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    const detachA = controller.attach(element(), profileA)
    await until(() => controller.state.status === "ready")
    controller.setURL("https://example.com/a")
    await controller.launch()
    await until(() => dock.manifest().tabs[profileA]?.length === 1)

    detachA()
    const detachB = controller.attach(element(), profileB)
    await until(() => controller.state.status === "ready")
    expect(controller.state.tabs).toEqual([])
    controller.setURL("https://example.com/b")
    await controller.launch()
    await until(() => dock.manifest().tabs[profileB]?.length === 1)

    detachB()
    controller.attach(element(), profileA)
    await until(() => controller.state.status === "ready" && controller.state.tabs.length === 1)
    expect(controller.state.tabs[0]?.url).toBe("https://example.com/a")
    expect(dock.calls.filter((call) => call[0] === "open")).toEqual([
      ["open", "https://example.com/a", profileA],
      ["open", "https://example.com/b", profileB],
      ["open", "https://example.com/a", profileA],
    ])
    expect(dock.calls.filter((call) => call[0] === "close")).toHaveLength(3)
  })

  test("a tab that opens after the owner changed is closed instead of shown", async () => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    controller.attach(element(), profileA)
    await until(() => controller.state.status === "ready")
    const gate = Promise.withResolvers<void>()
    dock.gate(gate.promise)
    controller.setURL("https://example.com/late")
    const late = controller.launch()
    controller.attach(element(), profileB)
    await until(() => controller.state.status === "ready")
    gate.resolve()
    await late
    expect(controller.state.profile).toBe(profileB)
    expect(controller.state.tabs).toEqual([])
    expect(dock.calls.at(-1)).toEqual(["close-tab", "tab-1"])
  })

  test("a failed load shows its error and retry restores the profile", async () => {
    const dock = fakeDock()
    dock.failManifest(true)
    const controller = createAppDockController(dock.api)
    controller.attach(element(), profileA)
    await until(() => controller.state.status === "failed")
    expect(controller.state.error).toBe("manifest unavailable")
    dock.failManifest(false)
    controller.retry()
    await until(() => controller.state.status === "ready")
    expect(controller.state.error).toBeUndefined()
  })

  test("without a repository profile the Dock keeps following the manifest's browser profiles", async () => {
    const dock = fakeDock()
    dock.seed({
      profiles: [
        { id: "default", name: "Personal" },
        { id: "work", name: "Work" },
      ],
      tabs: {
        default: [{ url: "https://example.com/personal", pinned: false }],
        work: [{ url: "https://example.com/work", pinned: true }],
      },
    })
    const controller = createAppDockController(dock.api)
    controller.attach(element())
    await until(() => controller.state.status === "ready")
    expect(controller.state.profile).toBe("default")
    expect(controller.state.profiles.map((item) => item.name)).toEqual(["Personal", "Work"])
    expect(controller.state.tabs.map((tab) => tab.url)).toEqual(["https://example.com/personal"])
    expect(controller.createProfile("Work")).toBe(false)

    await controller.switchProfile("work")
    await until(() => controller.state.status === "ready")
    expect(controller.state.profile).toBe("work")
    expect(dock.manifest().activeProfileID).toBe("work")
    expect(controller.state.tabs.map((tab) => [tab.url, tab.pinned])).toEqual([["https://example.com/work", true]])
    expect(dock.calls.filter((call) => call[0] === "open")).toEqual([
      ["open", "https://example.com/personal", "default"],
      ["open", "https://example.com/work", "work"],
    ])
  })

  test("without the native bridge the Dock is unavailable and issues no calls", async () => {
    const missing = createAppDockController(undefined)
    expect(missing.available).toBe(false)
    missing.attach(element(), profileA)()
    expect(missing.state.status).toBe("idle")

    const calls: string[] = []
    const partial = createAppDockController({
      appDockOpen: async () => {
        calls.push("open")
        return { tabID: "tab", generation: 1, url: "https://example.com" }
      },
    } as unknown as AppDockAPI)
    expect(partial.available).toBe(false)
    partial.attach(element(), profileA)()
    await settle()
    expect(calls).toEqual([])
    expect(partial.state.status).toBe("idle")
  })
})

function element() {
  return document.createElement("div")
}

async function settle() {
  for (let index = 0; index < 10; index++) await new Promise((resolve) => setTimeout(resolve, 0))
}

async function until(check: () => boolean) {
  for (let index = 0; index < 100 && !check(); index++) await new Promise((resolve) => setTimeout(resolve, 0))
  expect(check()).toBe(true)
}

type Manifest = Awaited<ReturnType<AppDockAPI["appDockGetManifest"]>>

// Mirrors the desktop registry: app-dock-open creates a missing profile and bumps the revision.
function fakeDock() {
  const calls: unknown[][] = []
  const listeners = new Set<Parameters<AppDockAPI["appDockEvent"]>[0]>()
  const state = {
    manifest: {
      version: 1,
      revision: 0,
      profiles: [{ id: "default", name: "default" }],
      activeProfileID: "default",
      tabs: { default: [] },
      bookmarks: [],
      history: [],
    } as Manifest,
    tabs: 0,
    gate: undefined as Promise<void> | undefined,
    failManifest: false,
  }
  const api = {
    appDockOpen: async (url: string, _bounds: unknown, profile = "default") => {
      calls.push(["open", url, profile])
      const gate = state.gate
      state.gate = undefined
      const tabID = `tab-${++state.tabs}`
      const generation = state.tabs
      await gate
      if (!state.manifest.profiles.some((item) => item.id === profile))
        state.manifest = {
          ...state.manifest,
          revision: state.manifest.revision + 1,
          profiles: [...state.manifest.profiles, { id: profile, name: profile }],
          tabs: { ...state.manifest.tabs, [profile]: [] },
        }
      return { tabID, generation, url }
    },
    appDockSelect: async (tabID: string) => {
      calls.push(["select", tabID])
    },
    appDockHide: async () => {
      calls.push(["hide"])
    },
    appDockClose: async () => {
      calls.push(["close"])
    },
    appDockCloseTab: async (tabID: string) => {
      calls.push(["close-tab", tabID])
    },
    appDockNavigate: async (tabID: string, url: string) => {
      calls.push(["navigate", tabID, url])
    },
    appDockResize: async () => undefined,
    appDockEvent: (callback: Parameters<AppDockAPI["appDockEvent"]>[0]) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    appDockGetManifest: async () => {
      if (state.failManifest) throw new Error("manifest unavailable")
      return structuredClone(state.manifest)
    },
    appDockUpdateManifest: async (revision: number, manifest: Manifest) => {
      if (revision !== state.manifest.revision) return { status: "conflict", manifest: structuredClone(state.manifest) }
      const ids = state.manifest.profiles.map((item) => item.id)
      if (manifest.profiles.length !== ids.length || Object.keys(manifest.tabs).some((id) => !ids.includes(id)))
        throw new Error("Invalid App Dock manifest")
      state.manifest = { ...structuredClone(manifest), revision: revision + 1 }
      return { status: "updated", manifest: structuredClone(state.manifest) }
    },
  }
  return {
    api: api as unknown as AppDockAPI,
    calls,
    manifest: () => state.manifest,
    subscriptions: () => listeners.size,
    gate: (promise: Promise<void>) => (state.gate = promise),
    seed: (manifest: Pick<Manifest, "profiles" | "tabs">) => (state.manifest = { ...state.manifest, ...manifest }),
    failManifest: (value: boolean) => (state.failManifest = value),
  }
}
