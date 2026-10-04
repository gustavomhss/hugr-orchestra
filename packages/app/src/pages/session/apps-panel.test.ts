import { expect, test } from "bun:test"
import {
  createSourceFile,
  forEachChild,
  isArrowFunction,
  isCallExpression,
  isIdentifier,
  isPropertyAccessExpression,
  isVariableDeclaration,
  ScriptKind,
  ScriptTarget,
} from "typescript"
import type { LinuxOpenResult } from "../../app-dock-linux"

type Identity = { tabID: string; generation: number }
type Tab = Identity & { url: string }

// Exercise the private production closures, not copied state-transition logic.
const source = createSourceFile(
  "apps-panel.tsx",
  await Bun.file(`${import.meta.dir}/apps-panel.tsx`).text(),
  ScriptTarget.Latest,
  true,
  ScriptKind.TSX,
)
const expressions = new Map<string, string>()
const visit = (node: import("typescript").Node) => {
  if (
    isVariableDeclaration(node) &&
    isIdentifier(node.name) &&
    node.initializer &&
    ["sameTab", "isLinux", "bounds", "openLinux", "resize", "admitBrowserTab", "close"].includes(node.name.text)
  ) {
    expressions.set(node.name.text, node.initializer.getText(source))
  }
  if (
    isCallExpression(node) &&
    isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "appDockEvent" &&
    node.arguments[0] &&
    isArrowFunction(node.arguments[0])
  ) {
    expressions.set("event", node.arguments[0].getText(source))
  }
  forEachChild(node, visit)
}
visit(source)

function bind<T>(name: string, bindings: Record<string, unknown>) {
  const text = expressions.get(name)
  if (!text) throw new Error(`Missing production closure: ${name}`)
  if (process.env.APP_DOCK_PANEL_RESIZE_MUTATION === "1" && name === "openLinux")
    expect(text.split("resize()")).toHaveLength(2)
  const expression = process.env.APP_DOCK_PANEL_RESIZE_MUTATION === "1" && name === "openLinux"
    ? text.replace("resize()", "")
    : text
  const mutated = process.env.APP_DOCK_PANEL_ADMISSION_MUTATION === "1" && name === "admitBrowserTab"
  if (mutated) expect(expression.split("items.some(item => sameTab(item, tab)) ? items : [...items, tab]")).toHaveLength(2)
  return new Function(
    ...Object.keys(bindings),
    `${new Bun.Transpiler({ loader: "ts" }).transformSync(`const callback = ${mutated ? expression.replace("items.some(item => sameTab(item, tab)) ? items : [...items, tab]", "[...items, tab]") : expression}`)}\nreturn callback;`,
  )(...Object.values(bindings)) as T
}

function setup(tabs: Tab[]) {
  const opening = Promise.withResolvers<LinuxOpenResult>()
  const state = { tabs, active: tabs[0] as Identity, url: tabs[0]!.url, generation: 0, resized: [] as Identity[] }
  const bindings = {
    api: () => ({ appDockLinuxOpen: () => opening.promise, appDockHide: async () => undefined }),
    disposed: false,
    switching: () => false,
    host: document.createElement("div"),
    bounds: bind<(element: HTMLElement) => unknown>("bounds", {}),
    linuxGeneration: () => state.generation,
    profile: () => "default",
    tabs: () => state.tabs,
    active: () => state.active,
    isLinux: bind<(url: string) => boolean>("isLinux", {}),
    sameTab: bind<(left: Identity, right: Identity) => boolean>("sameTab", {}),
    setTabs: (change: (items: Tab[]) => Tab[]) => {
      state.tabs = change(state.tabs)
    },
    setActive: (identity: Identity) => {
      state.active = identity
    },
    setURL: (url: string) => {
      state.url = url
    },
    setLinuxIntent: (_key: string, change: (generation: number) => number) => {
      state.generation = change(state.generation)
    },
    closeFind: () => undefined,
    closeMenu: () => undefined,
    setLibraryOpen: () => undefined,
    setDownloadsOpen: () => undefined,
    setError: () => undefined,
    setNavigationError: () => undefined,
    setPermission: () => undefined,
    setNavigation: () => undefined,
    setProfileCreating: () => undefined,
    activeTab: () => state.tabs.find(tab => tab.tabID === state.active.tabID),
    refreshWindows: async () => undefined,
    resize: () => state.resized.push(state.active),
  }
  return {
    state,
    opening,
    open: bind<() => Promise<LinuxOpenResult | undefined>>("openLinux", bindings),
    event: bind<(event: { type: "tab-selected"; payload: Identity }) => void>("event", bindings),
  }
}

const web: Tab = { tabID: "web", generation: 1, url: "https://example.com" }
const linux = { tabID: "linux", generation: 2, url: "appdock://linux" as const }

test("replacing an evicted Linux view keeps one logical Linux tab and preserves web tabs", async () => {
  const panel = setup([web, linux])
  const pending = panel.open()
  const replacement = { ...linux, tabID: "replacement", generation: 3 }
  panel.opening.resolve({ status: "opened", tab: replacement })
  await pending
  expect(panel.state.tabs.map((tab) => tab.tabID)).toEqual(["web", "replacement"])
  expect(panel.state.active).toEqual(replacement)
  expect(panel.state.resized).toEqual([replacement])
})

test("external web selection cancels a pending Linux admission in the renderer", async () => {
  const panel = setup([linux, web])
  const pending = panel.open()
  panel.event({ type: "tab-selected", payload: web })
  panel.opening.resolve({ status: "opened", tab: linux })
  expect(await pending).toBeUndefined()
  expect(panel.state.active).toEqual(web)
  expect(panel.state.url).toBe(web.url)
  expect(panel.state.resized).toEqual([web])
})

test("an owned Linux selection event does not invalidate its own open result", async () => {
  const panel = setup([web, linux])
  const pending = panel.open()
  panel.event({ type: "tab-selected", payload: linux })
  panel.opening.resolve({ status: "opened", tab: linux })
  expect(await pending).toEqual({ status: "opened", tab: linux })
  expect(panel.state.active).toEqual(linux)
  expect(panel.state.generation).toBe(0)
  expect(panel.state.resized).toEqual([linux, linux])
})

test("unknown or retired selection generations cannot steal renderer selection", () => {
  const panel = setup([web, linux])
  panel.event({ type: "tab-selected", payload: { ...linux, generation: 99 } })
  panel.event({ type: "tab-selected", payload: { tabID: "unknown", generation: 1 } })
  expect(panel.state.active).toEqual(web)
  expect(panel.state.generation).toBe(0)
})

test("native geometry updates coalesce even when the renderer animation clock is suspended", async () => {
  const calls: unknown[] = []
  const host = document.createElement("div")
  const resize = bind<() => void>("resize", {
    resizeFrame: undefined,
    resizing: { pending: false },
    disposed: false,
    host,
    active: () => linux,
    bounds: bind<(element: HTMLElement) => unknown>("bounds", {}),
    api: () => ({ appDockResize: (value: unknown) => { calls.push(value); return Promise.resolve() } }),
    requestAnimationFrame: () => 1,
  })
  resize()
  resize()
  await Promise.resolve()
  expect(calls).toEqual([{ x: 0, y: 0, width: 1, height: 1 }])
})

test("browser invoke and admission event keep one tab and preserve newer navigation state", () => {
  const loaded = { ...web, url: "https://example.com/loaded", title: "Loaded", loading: false }
  const state = { tabs: [loaded], active: undefined as Identity | undefined, url: "", writes: 0 }
  const admit = bind<(tab: Tab) => void>("admitBrowserTab", {
    sameTab: bind<(left: Identity | undefined, right: Identity | undefined) => boolean>("sameTab", {}),
    tabs: () => state.tabs,
    setTabs: (change: (items: typeof state.tabs) => typeof state.tabs) => { state.tabs = change(state.tabs) },
    setNavigation: () => undefined,
    setActive: (tab: Identity) => { state.active = tab },
    setURL: (url: string) => { state.url = url },
    saveTabs: () => { state.writes++ },
    resize: () => undefined,
  })
  admit(web)
  admit(web)
  expect(state.tabs).toEqual([loaded])
  expect(state.active).toEqual(web)
  expect(state.url).toBe(loaded.url)
  expect(state.writes).toBe(2)
})

test("closing last browser tab stays in Browser even when main selects Linux as its neighbor", async () => {
  const state = { tabs: [web, linux] as Tab[], active: web as Identity | undefined, mode: "browser", hidden: 0 }
  const close = bind<() => Promise<void>>("close", {
    tabs: () => state.tabs,
    active: () => state.active,
    sameTab: bind<(left: Identity | undefined, right: Identity | undefined) => boolean>("sameTab", {}),
    isLinux: bind<(url: string) => boolean>("isLinux", {}),
    setLinuxIntent: () => undefined,
    api: () => ({ appDockCloseTab: async () => { state.active = linux }, appDockHide: async () => { state.hidden++ } }),
    setTabs: (tabs: Tab[]) => { state.tabs = tabs },
    saveTabs: () => undefined,
    setNavigation: (key: string, value: string) => { if (key === "mode") state.mode = value },
    setActive: (tab: Identity | undefined) => { state.active = tab },
    setURL: () => undefined,
    resize: () => undefined,
    host: document.createElement("div"),
  })
  await close()
  expect(state.tabs).toEqual([linux])
  expect(state.mode).toBe("browser")
  expect(state.active).toBeUndefined()
  expect(state.hidden).toBe(1)
})
