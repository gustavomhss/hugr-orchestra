import { BrowserWindow, ipcMain } from "electron"
import type { IpcMainInvokeEvent } from "electron"
import type { LiveHotkeyAction, LiveSource } from "@orchestra/app/live"

import { hasTranscriptionKey, saveTranscriptionKey } from "./live-key"
import type { LiveLoop } from "./live-loop"
import { readiness, requestPermission } from "./live-readiness"

// Every IPC handler of the live seat. Run state and input levels are broadcast to all windows, so each renderer
// window shows the same meeting. Arguments come from a renderer, so each handler checks its own.

const SOURCES: LiveSource[] = ["microphone", "system-audio"]
const ACTIONS: LiveHotkeyAction[] = ["start-stop", "ask", "toggle-overlay", "toggle-captions"]

export function registerLiveIpc(loop: LiveLoop) {
  const broadcast = (channel: string, payload: unknown) =>
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    })

  loop.onRunState((state) => {
    broadcast("live-run-state-changed", state)
    // The captions key is global, so it is held only while a meeting runs.
    loop.settings.bind("toggle-captions", state.running ? loop.toggleCaptions : undefined)
  })
  loop.onLevels((levels) => broadcast("live-levels", levels))
  loop.settings.bind("start-stop", () => void (loop.running() ? loop.stop() : loop.start()))

  ipcMain.handle("start-live-meeting", (_event: IpcMainInvokeEvent, title: unknown) =>
    loop.start(typeof title === "string" ? title : undefined),
  )
  ipcMain.handle("stop-live-meeting", () => loop.stop())
  ipcMain.handle("get-live-meeting-running", () => loop.running())
  // The key itself never goes back to a renderer; it can only be replaced or cleared.
  ipcMain.handle("has-live-transcription-key", () => hasTranscriptionKey())
  ipcMain.handle("set-live-transcription-key", (_event: IpcMainInvokeEvent, key: unknown) => {
    if (typeof key === "string") saveTranscriptionKey(key)
  })
  ipcMain.handle("get-live-readiness", () => readiness(loop.settings.get().answerModel))
  ipcMain.handle("request-live-permission", (_event: IpcMainInvokeEvent, source: unknown) => {
    if (!SOURCES.includes(source as LiveSource)) throw new Error("Unknown live source")
    return requestPermission(source as LiveSource)
  })
  ipcMain.handle("get-live-run-state", () => loop.runState())
  ipcMain.handle("rename-live-meeting", (_event: IpcMainInvokeEvent, meetingID: unknown, title: unknown) => {
    if (typeof meetingID !== "string" || typeof title !== "string") throw new Error("Invalid rename")
    return loop.rename(meetingID, title)
  })
  ipcMain.handle("get-live-settings", () => loop.settings.get())
  ipcMain.handle("set-live-settings", (_event: IpcMainInvokeEvent, patch: unknown) => loop.settings.set(patch))
  ipcMain.handle("get-live-hotkeys", () => loop.settings.hotkeys())
  ipcMain.handle("set-live-hotkey", (_event: IpcMainInvokeEvent, action: unknown, accelerator: unknown) => {
    if (!ACTIONS.includes(action as LiveHotkeyAction) || typeof accelerator !== "string")
      return { ok: false, reason: "invalid" }
    return loop.settings.setHotkey(action as LiveHotkeyAction, accelerator)
  })
  ipcMain.handle("reset-live-hotkeys", () => loop.settings.resetHotkeys())
}
