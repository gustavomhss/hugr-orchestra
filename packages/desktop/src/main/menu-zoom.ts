import type { DesktopMenuAction, DesktopMenuEntry } from "@orchestra/app/desktop-menu"

export function macZoomItem(entry: DesktopMenuEntry, run: (action: DesktopMenuAction) => void) {
  if (entry.type !== "item") return
  if (entry.action !== "view.resetZoom" && entry.action !== "view.zoomIn" && entry.action !== "view.zoomOut") return
  const action = entry.action
  return {
    accelerator: action === "view.resetZoom" ? "Cmd+0" : action === "view.zoomIn" ? "Cmd+Plus" : "Cmd+-",
    click: () => run(action),
  }
}

// macOS application-menu accelerators own zoom. Renderer shortcuts cover Windows/Linux only,
// otherwise a single physical chord can reach both handlers and apply twice.
export function rendererHandlesZoomKey(os: string) {
  return os !== "macos"
}
