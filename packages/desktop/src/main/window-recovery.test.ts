import { expect, test } from "bun:test"
import type { Session, WebContents } from "electron"
import { registerRendererPermissions } from "./window-permissions"
import { setWindowZoom } from "./window-zoom"
import { appDockShortcut } from "./app-dock-shortcuts"
import { toCloneableAppDockEvent } from "./ipc-app-dock-validate"

test("desktop recovery: Dock shortcuts accept only scoped supported chords and clone exact identities", () => {
  const input = { type: "keyDown", key: "l", meta: true, control: false, shift: false, alt: false }
  expect(appDockShortcut(input, "darwin")).toBe("address")
  expect(appDockShortcut({ ...input, key: "t" }, "darwin")).toBe("new-tab")
  expect(appDockShortcut({ ...input, key: "w" }, "darwin")).toBe("close-tab")
  expect(appDockShortcut({ ...input, shift: true }, "darwin")).toBeUndefined()
  expect(appDockShortcut({ ...input, type: "keyUp" }, "darwin")).toBeUndefined()
  expect(appDockShortcut({ ...input, isAutoRepeat: true }, "darwin")).toBeUndefined()
  expect(appDockShortcut(input, "linux")).toBeUndefined()
  expect(appDockShortcut({ ...input, meta: false, control: true }, "linux")).toBe("address")
  const event = { type: "shortcut", payload: { identity: { tabID: "tab", generation: 7 }, command: "close-tab" } }
  expect(toCloneableAppDockEvent(event)).toEqual(event)
  expect(() => toCloneableAppDockEvent({ ...event, payload: { ...event.payload, command: "host-shell" } })).toThrow()
})

test("desktop recovery: shared Session accepts all registered renderers and rejects child views", () => {
  let request!: NonNullable<Parameters<Session["setPermissionRequestHandler"]>[0]>
  let check!: NonNullable<Parameters<Session["setPermissionCheckHandler"]>[0]>
  const installed: string[] = []
  const session = {
    setPermissionRequestHandler(callback: typeof request | null) { if (callback) request = callback; installed.push("request") },
    setPermissionCheckHandler(callback: typeof check | null) { if (callback) check = callback; installed.push("check") },
  }
  const destroyed: (() => void)[] = []
  const renderer = () => ({ isDestroyed: () => false, once: (_event: "destroyed", callback: () => void) => destroyed.push(callback) })
  const first = renderer()
  const second = renderer()
  const child = renderer()
  const trusted = (url?: string) => url === "oc://renderer/index.html"
  registerRendererPermissions(session, first, trusted)
  registerRendererPermissions(session, second, trusted)
  expect(installed).toEqual(["request", "check"])
  const allows = (contents: ReturnType<typeof renderer> | null, url = "oc://renderer/index.html") =>
    check(contents as WebContents | null, "notifications", "oc://renderer", { requestingUrl: url, isMainFrame: true })
  expect(allows(first)).toBe(true)
  expect(allows(second)).toBe(true)
  expect(allows(child)).toBe(false)
  expect(allows(null)).toBe(false)
  expect(allows(first, "https://untrusted.test")).toBe(false)
  const granted: boolean[] = []
  request(first as WebContents, "notifications", (value) => granted.push(value), { requestingUrl: "oc://renderer/index.html", isMainFrame: true })
  request(child as WebContents, "notifications", (value) => granted.push(value), { requestingUrl: "oc://renderer/index.html", isMainFrame: true })
  expect(granted).toEqual([true, false])
  destroyed[0]?.()
  expect(allows(first)).toBe(false)
  expect(allows(second)).toBe(true)
})

test("desktop recovery: native zoom setter broadcasts actual clamped factor and refreshes titlebar", () => {
  const changes: unknown[] = []
  const state = { zoom: 1 }
  const win = { isDestroyed: () => false, webContents: {
    isDestroyed: () => false,
    getZoomFactor: () => state.zoom,
    setZoomFactor: (value: number) => { state.zoom = value },
    send: (channel: string, factor: number) => changes.push([channel, factor]),
  } }
  setWindowZoom(win, 1.4, () => changes.push("titlebar"))
  setWindowZoom(win, 0.01, () => changes.push("titlebar"))
  expect(changes).toEqual(["titlebar", ["zoom-factor-changed", 1.4], "titlebar", ["zoom-factor-changed", 0.2]])
  expect(() => setWindowZoom(win, Number.NaN, () => changes.push("invalid"))).toThrow("Invalid zoom factor")
})
