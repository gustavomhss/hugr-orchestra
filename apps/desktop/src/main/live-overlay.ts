import { BrowserWindow, clipboard, globalShortcut, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from "electron"
import { getStore } from "./store"
import {
  LIVE_OVERLAY_CONTENT_PROTECTION_KEY,
  LIVE_OVERLAY_HOTKEYS_KEY,
  LIVE_OVERLAY_POSITION_KEY,
} from "./store-keys"
import { createLiveOverlayWindow } from "./windows"
import {
  clampPosition,
  defaultPosition,
  initialState,
  LIVE_OVERLAY_BAR_HEIGHT,
  LIVE_OVERLAY_HOTKEYS,
  LIVE_OVERLAY_MOVE_STEP,
  pageAnswers,
  pushAnswer,
  windowHeight,
  windowWidth,
  type LiveOverlayAction,
  type LiveOverlayAnswer,
  type LiveOverlayError,
  type LiveOverlayHotkey,
  type LiveOverlayState,
  type LiveOverlayView,
} from "./live-overlay-state"

const actionKinds = new Set<LiveOverlayAction["kind"]>([
  "ask",
  "look",
  "quick",
  "page",
  "suggestion",
  "toggle-suggestions",
  "toggle-captions",
  "stop",
  "send-open-items",
  "copy",
  "close",
  "open-settings",
  "retry",
  "change-shortcut",
])
const moveKeys = [
  ["Alt+Left", -1, 0],
  ["Alt+Right", 1, 0],
  ["Alt+Up", 0, -1],
  ["Alt+Down", 0, 1],
] as const

export type LiveOverlay = ReturnType<typeof registerLiveOverlay>

// Main owns the overlay's state and window. The live seat drives it through this controller; the renderer only draws
// the state it is sent and reports actions and pointer, size and focus changes. Call once: it registers IPC handlers.
export function registerLiveOverlay() {
  let state = initialState(getStore().get(LIVE_OVERLAY_CONTENT_PROTECTION_KEY) !== false)
  let win: BrowserWindow | undefined
  let height = windowHeight(LIVE_OVERLAY_BAR_HEIGHT)
  let drag: ReturnType<typeof setInterval> | undefined
  let hotkeys: string[] = []
  const listeners = new Set<(action: LiveOverlayAction) => void>()

  const alive = () => (win && !win.isDestroyed() ? win : undefined)
  const update = (next: LiveOverlayState) => {
    state = next
    alive()?.webContents.send("live-overlay-state", state)
  }
  const emit = (action: LiveOverlayAction) => listeners.forEach((listener) => listener(action))
  const fromOverlay = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    !!alive() && event.sender === win?.webContents && event.senderFrame === event.sender.mainFrame
  // macOS drops the protection and the level on some show and space transitions, so they are set again on each.
  const reassert = (target: BrowserWindow) => {
    target.setContentProtection(state.contentProtection)
    target.setAlwaysOnTop(true, "screen-saver")
  }
  const place = (target: BrowserWindow, position: { x: number; y: number }) => {
    const area = screen.getDisplayNearestPoint(position).workArea
    target.setBounds({ ...clampPosition(position, height, area), width: windowWidth(), height })
  }
  const persist = (target: BrowserWindow) => {
    const bounds = target.getBounds()
    getStore().set(LIVE_OVERLAY_POSITION_KEY, { x: bounds.x, y: bounds.y })
  }
  const window = () => {
    const existing = alive()
    if (existing) return existing
    const saved = readPosition()
    const area = (saved ? screen.getDisplayNearestPoint(saved) : screen.getPrimaryDisplay()).workArea
    const next = createLiveOverlayWindow({
      ...clampPosition(saved ?? defaultPosition(area), height, area),
      width: windowWidth(),
      height,
    })
    // Without skipTransformProcessType macOS briefly turns the whole app into a UI element, hiding its Dock icon.
    next.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    if (process.platform === "darwin") next.setHiddenInMissionControl(true)
    next.setIgnoreMouseEvents(true, { forward: true })
    reassert(next)
    next.on("show", () => reassert(next))
    next.on("closed", () => {
      win = undefined
      endDrag()
      setMoveKeys(false)
    })
    win = next
    return next
  }
  const show = () => {
    const target = window()
    target.showInactive()
    reassert(target)
  }
  const hide = () => {
    endDrag()
    setMoveKeys(false)
    alive()?.hide()
  }
  const releaseFocus = () => {
    const target = alive()
    if (!target) return
    target.setFocusable(false)
    target.blur()
  }
  const endDrag = () => {
    if (!drag) return
    clearInterval(drag)
    drag = undefined
    const target = alive()
    if (target) persist(target)
    update({ ...state, moving: false })
  }
  const setMoveKeys = (on: boolean) => {
    moveKeys.forEach((key) => {
      if (!on) return globalShortcut.unregister(key[0])
      if (globalShortcut.isRegistered(key[0])) return
      globalShortcut.register(key[0], () => {
        const target = alive()
        if (!target) return
        const bounds = target.getBounds()
        place(target, { x: bounds.x + key[1] * LIVE_OVERLAY_MOVE_STEP, y: bounds.y + key[2] * LIVE_OVERLAY_MOVE_STEP })
        persist(target)
      })
    })
  }
  const registerHotkeys = () => {
    const accelerators = { ...LIVE_OVERLAY_HOTKEYS, ...readHotkeys() }
    const run: Record<LiveOverlayHotkey, () => void> = {
      ask: () => emit({ kind: "ask" }),
      look: () => emit({ kind: "look" }),
      toggle: () => (alive()?.isVisible() ? hide() : show()),
      stop: () => emit({ kind: "stop" }),
      previous: () => update(pageAnswers(state, -1)),
      next: () => update(pageAnswers(state, 1)),
    }
    const failed = (Object.keys(run) as LiveOverlayHotkey[]).filter(
      (hotkey) => !registerShortcut(accelerators[hotkey], run[hotkey]),
    )
    hotkeys = (Object.keys(run) as LiveOverlayHotkey[])
      .filter((hotkey) => !failed.includes(hotkey))
      .map((hotkey) => accelerators[hotkey])
    const first = failed[0]
    update({
      ...state,
      accelerators,
      failedHotkeys: failed,
      error: first ? { kind: "hotkey", accelerator: accelerators[first] } : state.error,
    })
  }
  const unregisterHotkeys = () => {
    hotkeys.forEach((accelerator) => globalShortcut.unregister(accelerator))
    hotkeys = []
  }

  ipcMain.handle("live-overlay-state", (event: IpcMainInvokeEvent) => (fromOverlay(event) ? state : undefined))
  ipcMain.on("live-overlay-action", (event: IpcMainEvent, action: unknown) => {
    if (!fromOverlay(event) || !isAction(action)) return
    if (action.kind === "copy") return typeof action.text === "string" && clipboard.writeText(action.text)
    if (action.kind === "page") return update(pageAnswers(state, action.step === -1 ? -1 : 1))
    // After a meeting the window goes away, so on Windows and Linux it cannot keep the app alive past its last main window.
    if (action.kind === "close") return state.startedAt ? hide() : alive()?.destroy()
    if (action.kind === "toggle-suggestions") update({ ...state, suggestions: !state.suggestions })
    if (action.kind === "ask") releaseFocus()
    emit(action)
  })
  ipcMain.on("live-overlay-interactive", (event: IpcMainEvent, interactive: unknown) => {
    if (!fromOverlay(event) || typeof interactive !== "boolean") return
    // forward keeps mousemove flowing while the window ignores clicks, so the renderer can tell when the pointer is back.
    alive()?.setIgnoreMouseEvents(!interactive, { forward: true })
    setMoveKeys(interactive)
  })
  ipcMain.on("live-overlay-resize", (event: IpcMainEvent, contentHeight: unknown) => {
    const target = alive()
    if (!fromOverlay(event) || !target || typeof contentHeight !== "number" || !Number.isFinite(contentHeight)) return
    height = windowHeight(contentHeight)
    place(target, target.getBounds())
  })
  ipcMain.on("live-overlay-request-focus", (event: IpcMainEvent) => {
    const target = alive()
    if (!fromOverlay(event) || !target) return
    target.setFocusable(true)
    target.focus()
  })
  ipcMain.on("live-overlay-release-focus", (event: IpcMainEvent) => {
    if (fromOverlay(event)) releaseFocus()
  })
  // Drag by polling the cursor: -webkit-app-region would make the bar a native drag area that swallows its clicks.
  ipcMain.on("live-overlay-move-begin", (event: IpcMainEvent) => {
    const target = alive()
    if (!fromOverlay(event) || !target || drag) return
    const bounds = target.getBounds()
    const cursor = screen.getCursorScreenPoint()
    const offset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y }
    update({ ...state, moving: true })
    drag = setInterval(() => {
      const point = screen.getCursorScreenPoint()
      place(target, { x: point.x - offset.x, y: point.y - offset.y })
    }, 16)
  })
  ipcMain.on("live-overlay-move-end", (event: IpcMainEvent) => {
    if (fromOverlay(event)) endDrag()
  })
  ipcMain.handle("get-live-overlay-content-protection", () => state.contentProtection)
  ipcMain.handle("set-live-overlay-content-protection", (_event: IpcMainInvokeEvent, enabled: unknown) => {
    if (typeof enabled === "boolean") setContentProtection(enabled)
  })

  function setContentProtection(enabled: boolean) {
    getStore().set(LIVE_OVERLAY_CONTENT_PROTECTION_KEY, enabled)
    update({ ...state, contentProtection: enabled })
    const target = alive()
    if (target) reassert(target)
  }

  return {
    state: () => state,
    start: (startedAt = Date.now()) => {
      update({ ...initialState(state.contentProtection), startedAt })
      registerHotkeys()
      show()
    },
    stop: () => {
      unregisterHotkeys()
      setMoveKeys(false)
      update({ ...state, startedAt: undefined, failedHotkeys: [] })
    },
    show,
    hide,
    pushAnswer: (answer: LiveOverlayAnswer) => update(pushAnswer(state, answer)),
    setView: (view: LiveOverlayView) => update({ ...state, view }),
    setError: (error?: LiveOverlayError) => update({ ...state, error }),
    setContentProtection,
    onAction: (listener: (action: LiveOverlayAction) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    destroy: () => {
      unregisterHotkeys()
      endDrag()
      setMoveKeys(false)
      alive()?.destroy()
    },
  }
}

// An accelerator the user rebound to something Electron cannot parse throws instead of returning false.
function registerShortcut(accelerator: string, run: () => void) {
  try {
    return globalShortcut.register(accelerator, run)
  } catch {
    return false
  }
}

function readPosition() {
  const value = getStore().get(LIVE_OVERLAY_POSITION_KEY)
  if (typeof value !== "object" || value === null || !("x" in value) || !("y" in value)) return
  if (typeof value.x !== "number" || typeof value.y !== "number") return
  return { x: value.x, y: value.y }
}

function readHotkeys() {
  const value = getStore().get(LIVE_OVERLAY_HOTKEYS_KEY)
  if (typeof value !== "object" || value === null) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [LiveOverlayHotkey, string] => entry[0] in LIVE_OVERLAY_HOTKEYS && typeof entry[1] === "string",
    ),
  )
}

function isAction(value: unknown): value is LiveOverlayAction {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    actionKinds.has(value.kind as LiveOverlayAction["kind"])
  )
}
