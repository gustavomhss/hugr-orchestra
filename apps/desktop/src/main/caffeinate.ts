import { BrowserWindow, powerSaveBlocker } from "electron"

// Keeps the Mac (or PC) from sleeping while long agent runs work, like `caffeinate -i`. The display may still sleep.
// It lives only as long as the app: a quit or crash ends it, so it never outlasts Orchestra.
let blocker: number | undefined

export function getCaffeinate() {
  return blocker !== undefined && powerSaveBlocker.isStarted(blocker)
}

export function setCaffeinate(enabled: boolean) {
  if (enabled && !getCaffeinate()) blocker = powerSaveBlocker.start("prevent-app-suspension")
  if (!enabled && blocker !== undefined) {
    powerSaveBlocker.stop(blocker)
    blocker = undefined
  }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send("caffeinate-changed", getCaffeinate())
}
