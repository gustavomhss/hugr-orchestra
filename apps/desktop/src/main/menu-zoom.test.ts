import { expect, test } from "bun:test"
import { DESKTOP_MENU } from "@orchestra/app/desktop-menu"
import { macZoomItem, rendererHandlesZoomKey } from "./menu-zoom"
import { setWindowZoom } from "./window-zoom"

test("cold review: native macOS zoom entries retain Cmd accelerators and one authoritative zoom application", () => {
  const entries = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).filter((entry) => entry.action?.startsWith("view.zoom") || entry.action === "view.resetZoom")
  const events: unknown[] = []
  const state = { factor: 1.4, applies: 0 }
  const win = { isDestroyed: () => false, webContents: {
    isDestroyed: () => false,
    getZoomFactor: () => state.factor,
    setZoomFactor: (factor: number) => { state.applies++; state.factor = factor },
    send: (channel: string, factor: number) => events.push([channel, factor]),
  } }
  const items = entries.map((entry) => macZoomItem(entry, (action) => {
    const factor = action === "view.resetZoom" ? 1 : state.factor + (action === "view.zoomIn" ? 0.2 : -0.2)
    setWindowZoom(win, factor, () => {})
  }))
  expect(items.map((item) => item?.accelerator)).toEqual(["Cmd+0", "Cmd+Plus", "Cmd+-"])
  expect(items.every((item) => item && !("role" in item))).toBe(true)
  items.forEach((item) => item?.click())
  expect(state.applies).toBe(3)
  expect(events).toEqual([["zoom-factor-changed", 1], ["zoom-factor-changed", 1.2], ["zoom-factor-changed", 1]])
  expect(rendererHandlesZoomKey("macos")).toBe(false)
  expect(rendererHandlesZoomKey("windows")).toBe(true)
  expect(rendererHandlesZoomKey("linux")).toBe(true)
})
