import { expect, mock, test } from "bun:test"
import type { BrowserWindow } from "electron"
import { EventEmitter } from "node:events"
import type { AppDockEvent } from "./app-dock"

// The Electron module only resolves inside the Electron runtime. These fakes stand at its boundary: the
// window's child views, a view's visibility, and a page's window-open request. The Dock under test is real.
// Bun keeps a module mock for the rest of the test process, so the default export serves later files too.
type OpenHandler = (details: { url: string }) => { action: "allow" | "deny" }
const views: FakeView[] = []
let contentsIDs = 0
let senderIDs = 0
class FakeContents extends EventEmitter {
  id = ++contentsIDs
  url = ""
  throttled = true
  open: OpenHandler | undefined
  navigationHistory = { canGoBack: () => false, canGoForward: () => false }
  setWindowOpenHandler(handler: OpenHandler) {
    this.open = handler
  }
  async loadURL(url: string) {
    this.url = url
  }
  getURL() {
    return this.url
  }
  getTitle() {
    return ""
  }
  getBackgroundThrottling() {
    return this.throttled
  }
  setBackgroundThrottling(value: boolean) {
    this.throttled = value
  }
  isDestroyed() {
    return false
  }
  close() {}
  closeDevTools() {}
}
class FakeView {
  webContents = new FakeContents()
  visible = true
  bounds = { x: 0, y: 0, width: 0, height: 0 }
  constructor() {
    views.push(this)
  }
  setBounds(bounds: FakeView["bounds"]) {
    this.bounds = bounds
  }
  getBounds() {
    return this.bounds
  }
  setVisible(visible: boolean) {
    this.visible = visible
  }
}
const electron = {
  app: { isPackaged: true },
  shell: {},
  session: {
    fromPartition: () => ({
      setPermissionRequestHandler: () => undefined,
      setPermissionCheckHandler: () => undefined,
      on: () => undefined,
    }),
  },
  WebContentsView: FakeView,
}
mock.module("electron", () => ({ ...electron, default: electron }))

const { createAppDock } = await import("./app-dock")

const bounds = { x: 0, y: 40, width: 800, height: 600 }
const profile = { storageKey: "popup-profile-key-0001" }

test("only the tab on screen raises popups; a background tab or a hidden Dock is refused as blocked", async () => {
  const f = fixture()
  const opener = await f.open("https://example.com/opener")
  await f.open("https://example.com/front")
  expect(f.attached()).toEqual(["https://example.com/front"])

  // A background page asks for a popup: it is denied, no view is created, and the tab on screen stays.
  const before = views.length
  expect(f.request("https://example.com/opener", "https://example.com/from-background")).toEqual({ action: "deny" })
  await Bun.sleep(0)
  expect(views.length).toBe(before)
  expect(f.attached()).toEqual(["https://example.com/front"])
  expect(f.events.at(-1)).toEqual({
    type: "navigation-error",
    payload: { identity: identity(opener), code: "blocked", url: "https://example.com/from-background" },
  })
  expect(f.events.some((event) => event.type === "tab-opened" || event.type === "tab-opened-background")).toBe(false)

  // The tab on screen keeps its behaviour: its popup opens as the new selected tab.
  expect(f.request("https://example.com/front", "https://example.com/from-front")).toEqual({ action: "deny" })
  await Bun.sleep(0)
  expect(views.length).toBe(before + 1)
  expect(f.attached()).toEqual(["https://example.com/from-front"])
  expect(f.events).toContainEqual({
    type: "tab-opened",
    payload: expect.objectContaining({ url: "https://example.com/from-front" }),
  })
  const popup = f.dock.list(f.sender).find((tab) => tab.url === "https://example.com/from-front")!
  expect(popup.active).toBe(true)

  // With the Dock hidden no tab is on screen, so even the last selected one cannot raise a popup.
  f.dock.hide(f.sender, f.win, identity(popup))
  expect(f.attached()).toEqual([])
  const count = f.events.length
  expect(f.request("https://example.com/from-front", "https://example.com/while-hidden")).toEqual({ action: "deny" })
  await Bun.sleep(0)
  expect(views.length).toBe(before + 1)
  expect(f.attached()).toEqual([])
  expect(f.events.slice(count)).toEqual([
    {
      type: "navigation-error",
      payload: { identity: identity(popup), code: "blocked", url: "https://example.com/while-hidden" },
    },
  ])
  expect(f.dock.list(f.sender).map((tab) => tab.url)).toEqual([
    "https://example.com/opener",
    "https://example.com/front",
    "https://example.com/from-front",
  ])
  f.dock.closeAll(f.sender, f.win)
})

test("a background tab's popup never reaches the Linux workspace's popup policy", async () => {
  const asked: string[] = []
  const f = fixture({
    allowPopup: (_sender, _identity, url) => {
      asked.push(url)
      return true
    },
  })
  await f.open("https://example.com/opener")
  await f.open("https://example.com/front")
  f.request("https://example.com/opener", "https://example.com/from-background")
  f.request("https://example.com/front", "https://example.com/from-front")
  await Bun.sleep(0)
  expect(asked).toEqual(["https://example.com/from-front"])
  f.dock.closeAll(f.sender, f.win)
})

function fixture(options: Parameters<typeof createAppDock>[0] = {}) {
  const sender = ++senderIDs
  const children: FakeView[] = []
  const window = {
    isDestroyed: () => false,
    isFullScreen: () => false,
    getContentBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
    on: () => undefined,
    removeListener: () => undefined,
    contentView: {
      children,
      addChildView: (view: FakeView) => {
        if (!children.includes(view)) children.push(view)
      },
      removeChildView: (view: FakeView) => {
        const index = children.indexOf(view)
        if (index >= 0) children.splice(index, 1)
      },
    },
  }
  const win = window as unknown as BrowserWindow
  const events: AppDockEvent[] = []
  const dock = createAppDock({ developmentMode: () => false, ...options })
  // The newest view showing `url`: each fixture opens its own tabs after any earlier test's.
  const contents = (url: string) => views.findLast((view) => view.webContents.url === url)!.webContents
  return {
    sender,
    win,
    events,
    dock,
    open: (url: string) => dock.open(sender, win, url, bounds, (event) => events.push(event), profile),
    // The page in the tab showing `from` calls window.open(url).
    request: (from: string, url: string) => contents(from).open!({ url }),
    attached: () => children.filter((view) => view.visible).map((view) => view.webContents.url),
  }
}

function identity(tab: { tabID: string; generation: number }) {
  return { tabID: tab.tabID, generation: tab.generation }
}
