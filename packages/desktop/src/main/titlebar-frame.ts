import type { NativeTitlebarFrame } from "@opencode-ai/app/native-titlebar"

export function requireTitlebarFrame(value: unknown, bounds: { width: number; height: number }, zoom: number) {
  if (value === undefined) return undefined
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid titlebar frame")
  const frame = value as Record<string, unknown>
  if (
    typeof frame.left !== "number" ||
    typeof frame.top !== "number" ||
    typeof frame.height !== "number" ||
    ![frame.left, frame.top, frame.height, bounds.width, bounds.height, zoom].every(Number.isFinite) ||
    zoom <= 0 ||
    frame.left < 0 ||
    frame.top < 0 ||
    frame.height <= 0 ||
    frame.left >= bounds.width / zoom ||
    frame.top + frame.height > bounds.height / zoom
  )
    throw new Error("Invalid titlebar frame")
  return { left: frame.left, top: frame.top, height: frame.height } satisfies NativeTitlebarFrame
}

export function titlebarFramePosition(frame: NativeTitlebarFrame | undefined, zoom: number) {
  if (!frame) return { x: 14, y: 14 }
  return {
    x: Math.round((frame.left + 13) * zoom),
    // AppKit buttons are 16pt high and do not scale with the renderer.
    y: Math.round((frame.top + frame.height / 2) * zoom - 8),
  }
}
