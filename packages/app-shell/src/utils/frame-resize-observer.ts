import { createResizeObserver } from "@solid-primitives/resize-observer"
import { onCleanup } from "solid-js"

/**
 * Runs `callback` once on the next animation frame however many times `schedule` is called before it.
 * `frames` is the frame source; it defaults to the window's.
 */
export function coalesceToFrame(
  callback: () => void,
  frames: { request(run: () => void): number; cancel(id: number): void } = {
    request: (run) => requestAnimationFrame(run),
    cancel: (id) => cancelAnimationFrame(id),
  },
) {
  let pending: number | undefined
  return {
    schedule() {
      if (pending !== undefined) return
      pending = frames.request(() => {
        pending = undefined
        callback()
      })
    },
    cancel() {
      if (pending === undefined) return
      frames.cancel(pending)
      pending = undefined
    },
  }
}

/**
 * A resize observer whose callback runs on the next animation frame, not inside the observer's delivery.
 * A callback that writes state which resizes the observed element's ancestors (a dock whose height follows its
 * content, for one) makes the browser report "ResizeObserver loop completed with undelivered notifications" when it
 * runs inside the delivery. Use it where the callback changes layout; a callback that only reads needs no frame.
 */
export function createFrameResizeObserver(targets: Parameters<typeof createResizeObserver>[0], callback: () => void) {
  const frame = coalesceToFrame(callback)
  createResizeObserver(targets, frame.schedule)
  onCleanup(frame.cancel)
}
