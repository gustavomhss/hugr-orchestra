import { BrowserWindow } from "electron"
import type { IpcMainInvokeEvent } from "electron"
import type { LiveHotkeyAction, LiveRecoveryAction, LiveSource } from "@orchestra/app/live"

import { hasTranscriptionKey, saveTranscriptionKey } from "./live-key"
import type { LiveLoop } from "./live-loop"
import type { LiveIpcOptions } from "./live-ipc-contract"
import { deliveryReason } from "./live-delivery-error"
import { isLocalID } from "./live-delivery-values"
import { readiness, requestPermission } from "./live-readiness"

// Every IPC handler of the live seat. Run state and input levels are broadcast to all windows, so each renderer
// window shows the same meeting. Arguments come from a renderer, so each handler checks its own.

const SOURCES: LiveSource[] = ["microphone", "system-audio"]
const ACTIONS: LiveHotkeyAction[] = ["start-stop", "ask", "toggle-overlay", "toggle-captions"]

export function registerLiveIpc(loop: LiveLoop, options: LiveIpcOptions) {
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

  options.handle("start-live-meeting", (_event: IpcMainInvokeEvent, title: unknown) =>
    loop.start(typeof title === "string" ? title : undefined),
  )
  options.handle("stop-live-meeting", () => loop.stop())
  options.handle("get-live-meeting-running", () => loop.running())
  // The key itself never goes back to a renderer; it can only be replaced or cleared.
  options.handle("has-live-transcription-key", () => hasTranscriptionKey())
  options.handle("set-live-transcription-key", (_event: IpcMainInvokeEvent, key: unknown) => {
    if (typeof key === "string") saveTranscriptionKey(key)
  })
  options.handle("get-live-readiness", () => readiness(loop.settings.get().answerModel))
  options.handle("request-live-permission", (_event: IpcMainInvokeEvent, source: unknown) => {
    if (!SOURCES.includes(source as LiveSource)) throw new Error("Unknown live source")
    return requestPermission(source as LiveSource)
  })
  options.handle("get-live-run-state", () => loop.runState())
  options.handle("rename-live-meeting", (_event: IpcMainInvokeEvent, meetingID: unknown, title: unknown) => {
    if (typeof meetingID !== "string" || typeof title !== "string") throw new Error("Invalid rename")
    return loop.rename(meetingID, title)
  })
  options.handle("get-live-settings", () => loop.settings.get())
  options.handle("set-live-settings", (_event: IpcMainInvokeEvent, patch: unknown) => loop.settings.set(patch))
  options.handle("get-live-hotkeys", () => loop.settings.hotkeys())
  options.handle("set-live-hotkey", (_event: IpcMainInvokeEvent, action: unknown, accelerator: unknown) => {
    if (!ACTIONS.includes(action as LiveHotkeyAction) || typeof accelerator !== "string")
      return { ok: false, reason: "invalid" }
    return loop.settings.setHotkey(action as LiveHotkeyAction, accelerator)
  })
  options.handle("reset-live-hotkeys", () => loop.settings.resetHotkeys())

  options.handle("get-live-recovery", async () => {
    try { return await options.recovery.snapshot() }
    catch { throw new Error("Live recovery is unavailable") }
  })
  for (const action of ["retry", "finish", "export", "discard"] as const)
    options.handle(`${action}-live-recovery`, async (_event, id: unknown): Promise<LiveRecoveryAction> => {
      if (!isLocalID(id)) return { ok: false, reason: "conflict" }
      try { return await options.recovery[action](id) }
      catch (error) { return { ok: false, reason: deliveryReason(error) } }
    })
}
