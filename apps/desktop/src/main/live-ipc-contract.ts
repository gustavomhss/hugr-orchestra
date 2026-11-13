import type { ipcMain } from "electron"
import type { LiveRecoveryPort } from "@orchestra/app/live"

export type LiveIpcOptions = {
  readonly handle: (channel: string, listener: Parameters<typeof ipcMain.handle>[1]) => void
  readonly recovery: LiveRecoveryPort
}
