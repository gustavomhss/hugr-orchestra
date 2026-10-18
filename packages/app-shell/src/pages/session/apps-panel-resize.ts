export type Bounds = { x: number; y: number; width: number; height: number }
export type AppDockBoundsSnapshot = {
  tab: { tabID: string; generation: number }
  bounds: Bounds
  resize: (bounds: Bounds) => Promise<void>
}

export function createAppDockBoundsSync(options: {
  snapshot: () => AppDockBoundsSnapshot | undefined
  requestAnimationFrame: (callback: () => void) => number
  cancelAnimationFrame: (frame: number) => void
}) {
  let frame: number | undefined
  let last: Pick<AppDockBoundsSnapshot, "tab" | "bounds"> | undefined
  let disposed = false
  return {
    request() {
      if (disposed || frame !== undefined) return
      frame = options.requestAnimationFrame(() => {
        frame = undefined
        if (disposed) return
        const next = options.snapshot()
        if (!next) {
          last = undefined
          return
        }
        if (
          last?.tab.tabID === next.tab.tabID &&
          last.tab.generation === next.tab.generation &&
          last.bounds.x === next.bounds.x &&
          last.bounds.y === next.bounds.y &&
          last.bounds.width === next.bounds.width &&
          last.bounds.height === next.bounds.height
        ) {
          return
        }
        last = { tab: { ...next.tab }, bounds: { ...next.bounds } }
        void next.resize(next.bounds)
      })
    },
    dispose() {
      disposed = true
      if (frame !== undefined) options.cancelAnimationFrame(frame)
      frame = undefined
      last = undefined
    },
  }
}

export const bounds = (element: Pick<HTMLElement, "getBoundingClientRect">): Bounds => {
  const rect = element.getBoundingClientRect()
  // Inactive side-panel tabs can mount at 0x0 before layout settles. Native view
  // needs valid bounds now; ResizeObserver supplies real dimensions afterward.
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  }
}
