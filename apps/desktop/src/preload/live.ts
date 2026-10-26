import { contextBridge, ipcRenderer } from "electron"
import type { LiveOverlayAction, LiveOverlayState } from "../main/live-overlay-state"

// The live overlay window's whole bridge: it draws the state main sends and reports back, nothing else.
const live = {
  state: (): Promise<LiveOverlayState> => ipcRenderer.invoke("live-overlay-state"),
  onState: (callback: (state: LiveOverlayState) => void) => {
    const handler = (_event: unknown, state: LiveOverlayState) => callback(state)
    ipcRenderer.on("live-overlay-state", handler)
    return () => ipcRenderer.removeListener("live-overlay-state", handler)
  },
  act: (action: LiveOverlayAction) => ipcRenderer.send("live-overlay-action", action),
  // True while the pointer is over the glass; otherwise clicks fall through to the app behind.
  interactive: (interactive: boolean) => ipcRenderer.send("live-overlay-interactive", interactive),
  resize: (height: number) => ipcRenderer.send("live-overlay-resize", height),
  requestFocus: () => ipcRenderer.send("live-overlay-request-focus"),
  releaseFocus: () => ipcRenderer.send("live-overlay-release-focus"),
  moveBegin: () => ipcRenderer.send("live-overlay-move-begin"),
  moveEnd: () => ipcRenderer.send("live-overlay-move-end"),
}

export type LiveOverlayAPI = typeof live

contextBridge.exposeInMainWorld("live", live)
