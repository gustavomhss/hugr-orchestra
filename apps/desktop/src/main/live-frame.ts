import { desktopCapturer, screen, type BrowserWindow } from "electron"

// One still of the display under the cursor, taken only on demand (the look hotkey or the seat's request). The given
// windows (the overlay) are made fully transparent for the capture, which keeps focus where it is, unlike hiding them.

const LONG_SIDE = 1280
const MAX_BYTES = 350 * 1024
const QUALITIES = [85, 75, 65, 55, 45, 35, 25]
// Overlapping captures share the first snapshot until the last capture releases the window.
const opacity = new WeakMap<BrowserWindow, { value: number; captures: number }>()

export async function captureFrame(exclude: BrowserWindow[]) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const scale = LONG_SIDE / Math.max(display.size.width, display.size.height)
  const thumbnailSize = { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) }
  const visible = exclude.filter((win) => !win.isDestroyed() && win.isVisible())
  visible.forEach((win) => {
    const held = opacity.get(win) ?? { value: win.getOpacity(), captures: 0 }
    held.captures += 1
    opacity.set(win, held)
    win.setOpacity(0)
  })
  // One compositor frame so the transparent overlay is what gets captured.
  await new Promise((resolve) => setTimeout(resolve, 50))
  const sources = await desktopCapturer
    .getSources({ types: ["screen"], thumbnailSize })
    .finally(() => {
      visible.forEach((win) => {
        const held = opacity.get(win)!
        held.captures -= 1
        if (held.captures) return
        opacity.delete(win)
        if (!win.isDestroyed()) win.setOpacity(held.value)
      })
    })
  const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) throw new Error("No screen frame was captured")
  return { jpeg: encodeJpeg(source.thumbnail), width: thumbnailSize.width, height: thumbnailSize.height }
}

// JPEG at falling quality until it fits the frame budget; the last quality is used even if it does not.
export function encodeJpeg(image: { toJPEG(quality: number): Buffer }) {
  return QUALITIES.reduce<Buffer | undefined>((best, quality) => {
    if (best && best.length < MAX_BYTES) return best
    return image.toJPEG(quality)
  }, undefined)!
}
