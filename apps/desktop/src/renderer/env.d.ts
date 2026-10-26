import type { LiveOverlayAPI } from "../preload/live"
import type { ElectronAPI } from "../preload/types"

declare global {
  interface Window {
    api: ElectronAPI
    // Only in the live overlay window (src/renderer/live), whose preload exposes nothing else.
    live: LiveOverlayAPI
    __ORCHESTRA__?: {
      deepLinks?: string[]
    }
  }
}
