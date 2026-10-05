import { afterEach, describe, expect, test } from "bun:test"
import { appDockProfile, createAppDockController, type AppDockAPI, type TabIdentity } from "./apps-panel-controller"

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

    expect(dock.calls.slice(before)).toEqual([
      ["hide", tab("tab-1", 1)],
      ["select", tab("tab-1", 1)],
      ["hide", tab("tab-1", 1)],
      ["select", tab("tab-1", 1)],
    ])
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
    controller.setURL("https://example.com/a")
    await controller.launch()
    const apps = element()
    const detachApps = controller.attach(apps, profileA)
    expect(controller.owns(apps)).toBe(true)
    expect(controller.owns(page)).toBe(false)
    const before = dock.calls.length
    detachPage()
    expect(dock.calls.slice(before)).toEqual([])
    detachApps()
    expect(dock.calls.slice(before)).toEqual([["hide", tab("tab-1", 1)]])
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

  test("an overlay over the Dock occludes the browser; closing it releases whichever tab is current", async () => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    controller.attach(placed(), profileA)
    await until(() => controller.state.status === "ready")
    controller.setURL("https://example.com/a")
    await controller.launch()
    expect(dock.calls.filter((call) => call[0] === "occlude")).toEqual([["occlude", false]])
    const before = dock.calls.length

    const dialog = overlay()
    await until(() => dock.calls.some((call) => call[0] === "occlude" && call[1] === true))
    await controller.openNewTab()
    controller.select(controller.state.tabs[0])
    dialog.remove()
    await until(() => dock.calls.at(-1)?.[0] === "occlude")

    // The renderer never hides or re-selects a remembered tab: the desktop keeps every view hidden
    // while occluded and shows its active tab on release, so no stale tab can come back.
    expect(dock.calls.slice(before)).toEqual([
      ["occlude", true],
      ["open", "https://opencode.ai", profileA],
      ["select", tab("tab-2", 2)],
      ["select", tab("tab-1", 1)],
      ["occlude", false],
    ])
  })

  test("a popover registered inside the Dock occludes the browser only while it covers the page", async () => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    const host = placed()
    controller.attach(host, profileA)
    await until(() => controller.state.status === "ready")
    const before = dock.calls.length

    // Drawn in the Dock's own tree, so the body watch alone would never see it.
    const popover = sized(element(), { x: 960, y: 140, width: 230, height: 200 })
    host.parentElement!.append(popover)
    const release = controller.registerOverlay(popover)
    await until(() => dock.calls.at(-1)?.[0] === "occlude")
    release()
    popover.remove()
    await until(() => dock.calls.length > before + 1)
    // Outside the page area a registered element does not occlude.
    const aside = sized(element(), { x: 0, y: 0, width: 200, height: 80 })
    host.parentElement!.append(aside)
    const releaseAside = controller.registerOverlay(aside)
    await settle()
    releaseAside()
    await settle()
    expect(dock.calls.slice(before)).toEqual([
      ["occlude", true],
      ["occlude", false],
    ])
  })

  test("a view attached while an overlay is open is occluded before its tab is shown", async () => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    const detachPage = controller.attach(placed(), profileA)
    await until(() => controller.state.status === "ready")
    controller.setURL("https://example.com/a")
    await controller.launch()
    detachPage()
    overlay()
    await settle()
    const before = dock.calls.length

    controller.attach(placed(), profileA)
    await settle()
    expect(dock.calls.slice(before)).toEqual([
      ["occlude", true],
      ["select", tab("tab-1", 1)],
    ])
  })

  test("Resize, Hide and Show name exactly the tab and generation they target", async () => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    const detach = controller.attach(element(), profileA)
    await until(() => controller.state.status === "ready")
    controller.setURL("https://example.com/a")
    await controller.launch()
    await controller.openNewTab()
    const [first, second] = controller.state.tabs
    const before = dock.calls.length

    await controller.resize(second!, { x: 600, y: 100, width: 600, height: 500 })
    controller.select(first!)
    await settle()
    detach()
    expect(dock.calls.slice(before)).toEqual([
      ["resize", tab("tab-2", 2), { x: 600, y: 100, width: 600, height: 500 }],
      ["select", tab("tab-1", 1)],
      ["hide", tab("tab-1", 1)],
    ])
  })

  test("a tab the desktop attaches while no view shows the Dock is hidden by name", async () => {
    const dock = fakeDock()
    dock.seed({
      profiles: [{ id: "default", name: "default" }],
      tabs: {
        default: [],
        [profileA]: [
          { url: "https://example.com/a", pinned: false },
          { url: "https://example.com/b", pinned: false },
        ],
      },
    })
    const controller = createAppDockController(dock.api)
    // Restoring attaches each saved tab in turn, so the last one restored is the one on screen.
    controller.attach(element(), profileA)()
    await until(() => controller.state.status === "ready")
    await settle()
    expect(dock.calls.filter((call) => call[0] === "hide" || call[0] === "select")).toEqual([["hide", tab("tab-2", 2)]])

    // A tab opened while the view goes away lands after the Hide for the view's tab.
    const detach = controller.attach(element(), profileA)
    await settle()
    const gate = Promise.withResolvers<void>()
    dock.gate(gate.promise)
    const opening = controller.openNewTab()
    detach()
    gate.resolve()
    await opening
    // A popup the desktop attached from the tab on screen as the view went away is hidden as well.
    dock.emit({ type: "tab-opened", payload: { tabID: "popup", generation: 9, url: "https://example.com/popup" } })
    expect(dock.calls.filter((call) => call[0] === "hide").slice(1)).toEqual([
      ["hide", tab("tab-1", 1)],
      ["hide", tab("tab-3", 3)],
      ["hide", tab("popup", 9)],
    ])
  })

  test("a popup from a background tab joins the tabs without being selected or shown", async () => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    controller.attach(element(), profileA)
    await until(() => controller.state.status === "ready")
    controller.setURL("https://example.com/a")
    await controller.launch()
    await controller.openNewTab()
    await until(() => dock.manifest().tabs[profileA]?.length === 2)
    const before = dock.calls.length

    const popup = { tabID: "popup", generation: 9, url: "https://example.com/popup" }
    dock.emit({ type: "tab-opened-background", payload: popup })
    dock.emit({ type: "tab-opened-background", payload: popup })
    await until(() => dock.manifest().tabs[profileA]?.length === 3)
    expect(controller.state.tabs.map((item) => item.tabID)).toEqual(["tab-1", "tab-2", "popup"])
    expect(controller.state.active).toEqual(tab("tab-2", 2))
    expect(controller.state.url).toBe("https://opencode.ai")
    expect(dock.calls.slice(before)).toEqual([])

    // Selecting it is what shows it.
    controller.select(controller.state.tabs[2]!)
    await settle()
    expect(dock.calls.slice(before)).toEqual([["select", tab("popup", 9)]])
  })

  test("a crashed tab is not shown, so selecting it hides the tab shown before it", async () => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    controller.attach(element(), profileA)
    await until(() => controller.state.status === "ready")
    controller.setURL("https://example.com/a")
    await controller.launch()
    await controller.openNewTab()
    dock.emit({ type: "tab-crashed", payload: { identity: tab("tab-1", 1), reason: "crashed" } })
    const before = dock.calls.length

    controller.select(controller.state.tabs[0]!)
    // The desktop attaches a recovered tab only if it was attached when it crashed, so show it again.
    dock.emit({ type: "tab-recovered", payload: { tabID: "tab-1", generation: 3, url: "https://example.com/a" } })
    await settle()
    expect(dock.calls.slice(before)).toEqual([
      ["hide", tab("tab-2", 2)],
      ["select", tab("tab-1", 3)],
    ])
  })

  test("a late open reply preserves the newer selection and its detach identity", async () => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    const detach = controller.attach(element(), profileA)
    await until(() => controller.state.status === "ready")
    controller.setURL("https://example.com/a")
    await controller.launch()
    const gate = Promise.withResolvers<void>()
    void dock.gate(gate.promise)
    const opening = controller.openNewTab()
    // The native open attaches tab-2 before replying; the later Select attaches tab-1 again.
    controller.select(controller.state.tabs[0])
    const before = dock.calls.length
    gate.resolve()
    await opening
    expect(controller.state.active).toEqual(tab("tab-1", 1))
    expect(controller.state.url).toBe("https://example.com/a")
    expect(controller.state.tabs.map((item) => item.tabID)).toEqual(["tab-1", "tab-2"])
    detach()
    expect(dock.calls.slice(before)).toEqual([
      ["select", tab("tab-1", 1)],
      ["hide", tab("tab-1", 1)],
    ])
  })

  test.each([
    ["absent host", false, true],
    ["newer crashed selection", true, false],
    ["newer crashed selection after detach", true, true],
    ["newer live selection", false, false],
  ] as const)("a late recovery reconciles its native identity with %s", async (_name, crashed, detached) => {
    const dock = fakeDock()
    const controller = createAppDockController(dock.api)
    const detach = controller.attach(element(), profileA)
    await until(() => controller.state.status === "ready")
    controller.setURL("https://example.com/a")
    await controller.launch()
    await controller.openNewTab()
    controller.select(controller.state.tabs[0])
    dock.emit({ type: "tab-crashed", payload: { identity: tab("tab-1", 1), reason: "crashed" } })
    if (crashed) dock.emit({ type: "tab-crashed", payload: { identity: tab("tab-2", 2), reason: "crashed" } })
    const gate = Promise.withResolvers<void>()
    const recovered = { tabID: "tab-1", generation: 3, url: "https://example.com/a" }
    dock.api.appDockRecoverTab = async () => {
      await gate.promise
      return recovered
    }
    const recovering = controller.recover()
    // Native recovery attaches generation 3 before the renderer learns its identity. Hides for
    // generation 1 or tab-2 cannot conceal it, so the recovery event must reconcile it by name.
    controller.select(controller.state.tabs[1])
    if (detached) detach()
    const before = dock.calls.length
    dock.emit({ type: "tab-recovered", payload: recovered })
    gate.resolve()
    await recovering
    expect(controller.state.active).toEqual(tab("tab-2", 2))
    expect(controller.state.tabs[0]?.generation).toBe(3)
    expect(controller.state.tabs[0]?.crashed).toBeUndefined()
    expect(dock.calls.slice(before)).toEqual(crashed || detached ? [["hide", tab("tab-1", 3)]] : [])
    if (!detached) detach()
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

function tab(tabID: string, generation: number) {
  return { tabID, generation }
}

const mounted: Element[] = []
afterEach(() => mounted.splice(0).forEach((item) => item.remove()))

// A Dock host laid out in the document beside the sidebar; happy-dom has no layout of its own.
function placed() {
  const root = document.createElement("div")
  const host = sized(element(), { x: 600, y: 100, width: 600, height: 500 })
  root.append(host)
  document.body.append(root)
  mounted.push(root)
  return host
}

// A portal like a Kobalte dialog's: its fixed-position overlay fills the window.
function overlay() {
  const portal = document.createElement("div")
  portal.append(sized(element(), { x: 0, y: 0, width: 1400, height: 900 }))
  document.body.append(portal)
  mounted.push(portal)
  return portal
}

function sized<T extends Element>(item: T, area: { x: number; y: number; width: number; height: number }) {
  Object.defineProperty(item, "getBoundingClientRect", {
    value: () => new DOMRect(area.x, area.y, area.width, area.height),
  })
  return item
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
    // The desktop accepts exactly a tab's ID and generation, so the raw argument is recorded.
    appDockSelect: async (target: TabIdentity) => {
      calls.push(["select", target])
    },
    appDockHide: async (target: TabIdentity) => {
      calls.push(["hide", target])
    },
    appDockOcclude: async (occluded: boolean) => {
      calls.push(["occlude", occluded])
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
    appDockResize: async (target: TabIdentity, bounds: unknown) => {
      calls.push(["resize", target, bounds])
    },
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
    emit: (event: Parameters<Parameters<AppDockAPI["appDockEvent"]>[0]>[0]) =>
      listeners.forEach((listener) => listener(event)),
    gate: (promise: Promise<void>) => (state.gate = promise),
    seed: (manifest: Pick<Manifest, "profiles" | "tabs">) => (state.manifest = { ...state.manifest, ...manifest }),
    failManifest: (value: boolean) => (state.failManifest = value),
  }
}
