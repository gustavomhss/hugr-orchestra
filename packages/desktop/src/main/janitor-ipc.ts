import type { IpcMainInvokeEvent } from "electron"

import {
  JanitorReportChannel,
  createState as createJanitorState,
  dismiss as dismissJanitor,
  getReport as getJanitorReport,
  getReportEnvelope as getJanitorReportEnvelope,
  isDismissed as isJanitorDismissed,
  isSnoozed as isJanitorSnoozed,
  setReport as setJanitorReport,
  snooze as snoozeJanitor,
} from "./janitor"

type Store = {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
  delete: (key: string) => void
}

type WindowLike = {
  isDestroyed: () => boolean
  webContents: { send: (channel: string, ...args: unknown[]) => void }
}

type Deps = {
  ipcMain: typeof import("electron").ipcMain
  app: typeof import("electron").app
  BrowserWindow: typeof import("electron").BrowserWindow
  getStore: (name: string) => Store
}

function readStoredState(store: Store) {
  const report = store.get("reportJson")
  const snoozedUntil = store.get("snoozedUntil")
  const source = store.get("source")
  const dismissedReportJson = store.get("dismissedReportJson")
  const dismissedSource = store.get("dismissedSource")
  return createJanitorState({
    reportJson: typeof report === "string" ? report : null,
    snoozedUntil: typeof snoozedUntil === "number" ? snoozedUntil : 0,
    source: typeof source === "string" ? source : null,
    notify: store.get("notify") !== false,
    dismissedReportJson: typeof dismissedReportJson === "string" ? dismissedReportJson : null,
    dismissedSource: typeof dismissedSource === "string" ? dismissedSource : null,
  })
}

export function registerJanitorIpcHandlers(deps: Deps) {
  const store = deps.getStore("opencode.janitor")
  const janitor = readStoredState(store)
  const persist = () => {
    if (janitor.reportJson === null) store.delete("reportJson")
    else store.set("reportJson", janitor.reportJson)
    store.set("snoozedUntil", janitor.snoozedUntil)
    if (janitor.source === null) store.delete("source")
    else store.set("source", janitor.source)
    store.set("notify", janitor.notify)
    if (janitor.dismissedReportJson === null) store.delete("dismissedReportJson")
    else store.set("dismissedReportJson", janitor.dismissedReportJson)
    if (janitor.dismissedSource === null) store.delete("dismissedSource")
    else store.set("dismissedSource", janitor.dismissedSource)
  }
  const assertSender = (event: IpcMainInvokeEvent) => {
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || win.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("Invalid Janitor sender")
    }
  }
  const windows = () => deps.BrowserWindow.getAllWindows() as WindowLike[]
  const broadcast = (clear = false, source = janitor.source) => {
    const report = getJanitorReport(janitor)
    if (report === null && !clear) return
    const payload = report ?? JSON.stringify({ createdAt: new Date().toISOString(), findings: [] })
    for (const win of windows()) {
      if (win.isDestroyed()) continue
      win.webContents.send(JanitorReportChannel, payload, clear ? false : janitor.notify, source)
    }
  }
  let wakeTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleWake = () => {
    if (wakeTimer) clearTimeout(wakeTimer)
    const delay = janitor.snoozedUntil - Date.now()
    if (delay <= 0) {
      if (janitor.snoozedUntil !== 0) {
        janitor.snoozedUntil = 0
        persist()
      }
      broadcast()
      return
    }
    wakeTimer = setTimeout(scheduleWake, Math.min(delay, 2_147_483_647))
  }
  deps.app.once("will-quit", () => {
    if (wakeTimer) clearTimeout(wakeTimer)
  })
  scheduleWake()

  deps.ipcMain.handle("janitor-get-report", (event) => {
    assertSender(event)
    return getJanitorReportEnvelope(janitor)
  })
  deps.ipcMain.handle("janitor-publish", (event, report: unknown, notify = true, source: unknown = null) => {
    assertSender(event)
    const normalizedSource = typeof source === "string" ? source : null
    if (isJanitorDismissed(janitor, report, normalizedSource)) return true
    if (!setJanitorReport(janitor, report, normalizedSource, notify !== false)) return false
    persist()
    if (isJanitorSnoozed(janitor)) {
      scheduleWake()
      return true
    }
    broadcast()
    return true
  })
  deps.ipcMain.handle("janitor-snooze", (event, minutes: number, source: unknown = null) => {
    assertSender(event)
    const expectedSource = typeof source === "string" ? source : null
    if (expectedSource !== janitor.source) return false
    snoozeJanitor(janitor, minutes)
    persist()
    scheduleWake()
    broadcast(true, expectedSource)
    return true
  })
  deps.ipcMain.handle("janitor-dismiss", (event, source: unknown = null) => {
    assertSender(event)
    const expectedSource = typeof source === "string" ? source : null
    if (expectedSource !== janitor.source) return false
    dismissJanitor(janitor)
    persist()
    broadcast(true, expectedSource)
    return true
  })
}
