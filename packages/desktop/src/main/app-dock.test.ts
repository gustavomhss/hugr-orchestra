import { describe, expect, mock, test } from "bun:test"
import type { BrowserWindow } from "electron"
import { EventEmitter } from "node:events"

// app-dock.ts drives Electron's native views, which only exist inside Electron. These stand-ins keep
// just the state the Dock changes on them: bounds, visibility and which views a window holds.
let contentsIDs = 0
class View {
  bounds = { x: 0, y: 0, width: 0, height: 0 }
  visible = true
  url = ""
  webContents = Object.assign(new EventEmitter(), {
    id: ++contentsIDs,
    setBackgroundThrottling: () => undefined,
    setWindowOpenHandler: () => undefined,
    loadURL: async (url: string) => {
      this.url = url
    },
    getURL: () => this.url,
    close: () => undefined,
  })
  setBounds(bounds: View["bounds"]) {
    this.bounds = bounds
  }
  getBounds() {
    return this.bounds
  }
  setVisible(visible: boolean) {
    this.visible = visible
  }
}
const browserSession = {
  setPermissionRequestHandler: () => undefined,
  setPermissionCheckHandler: () => undefined,
  on: () => undefined,
}
mock.module("electron", () => ({
  app: { isPackaged: true },
  session: { fromPartition: () => browserSession },
  shell: { openPath: async () => "" },
  WebContentsView: View,
}))
const { createAppDock } = await import("./app-dock")

const placed = { x: 0, y: 0, width: 400, height: 300 }
const moved = { x: 10, y: 20, width: 300, height: 200 }
const storage = { storageKey: "dock-binding-profile" }

describe("App Dock attachment binding", () => {
  test("Resize and Hide for a tab that is no longer attached leave the attached view alone", async () => {
    const harness = setup()
    const first = await harness.open()
    const second = await harness.open()
    expect(harness.attached()).toEqual([harness.view(second)])

    harness.dock.resize(1, first, moved)
    harness.dock.hide(1, harness.win, first)
    expect(harness.attached()).toEqual([harness.view(second)])
    expect(harness.view(second).bounds).toEqual(placed)
    expect(harness.view(first).bounds).toEqual(placed)

    harness.dock.resize(1, second, moved)
    expect(harness.view(second).bounds).toEqual(moved)
    harness.dock.hide(1, harness.win, second)
    expect(harness.attached()).toEqual([])
  })

  test("Resize, Hide and Show for an earlier generation of a recovered tab are ignored", async () => {
    const harness = setup()
    const crashed = await harness.open()
    const recovered = await harness.dock.recover(1, crashed.tabID)
    expect(recovered.tabID).toBe(crashed.tabID)
    expect(recovered.generation).toBeGreaterThan(crashed.generation)
    // Recovery replaces the view in place, under the same tab ID.
    const view = harness.attached()[0]!
    expect(view).not.toBe(harness.view(crashed))
    expect(harness.attached()).toEqual([view])

    harness.dock.resize(1, crashed, moved)
    harness.dock.select(1, harness.win, crashed, moved)
    harness.dock.hide(1, harness.win, crashed)
    expect(view.bounds).toEqual(placed)
    expect(harness.attached()).toEqual([view])

    harness.dock.select(1, harness.win, recovered, moved)
    expect(view.bounds).toEqual(moved)
    harness.dock.hide(1, harness.win, recovered)
    expect(harness.attached()).toEqual([])
  })

  test("a closed tab, another window's tab and a hidden Dock take no Resize or Hide", async () => {
    const harness = setup()
    const closed = await harness.open()
    harness.dock.close(1, harness.win, closed.tabID)
    const current = await harness.open()
    const other = await harness.open(2)

    harness.dock.resize(1, closed, moved)
    harness.dock.resize(1, other, moved)
    harness.dock.hide(1, harness.win, closed)
    harness.dock.hide(1, harness.win, other)
    expect(harness.view(current).bounds).toEqual(placed)
    expect(harness.attached()).toEqual([harness.view(current), harness.view(other)])

    harness.dock.hide(1, harness.win, current)
    harness.dock.resize(1, current, moved)
    harness.dock.hide(1, harness.win, current)
    expect(harness.view(current).bounds).toEqual(placed)
    expect(harness.attached()).toEqual([harness.view(other)])
  })
})

function setup() {
  const children: View[] = []
  const views = new Map<string, View>()
  const win = {
    isDestroyed: () => false,
    contentView: {
      addChildView: (view: View) => {
        if (!children.includes(view)) children.push(view)
      },
      removeChildView: (view: View) => {
        if (children.includes(view)) children.splice(children.indexOf(view), 1)
      },
    },
  } as unknown as BrowserWindow
  const dock = createAppDock({ developmentMode: () => false })
  return {
    dock,
    win,
    // One window may hold views of several senders here; each sender is its own renderer.
    attached: () => [...children],
    view: (tab: { tabID: string; generation: number }) => views.get(`${tab.tabID}:${tab.generation}`)!,
    async open(sender = 1) {
      const before = new Set(children)
      const tab = await dock.open(sender, win, "https://example.com/", placed, () => undefined, storage)
      const view = children.find((item) => !before.has(item))
      if (view) views.set(`${tab.tabID}:${tab.generation}`, view)
      return tab
    },
  }
}
