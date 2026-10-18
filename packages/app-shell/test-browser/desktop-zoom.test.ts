import { expect, test } from "bun:test"

for (const earlyEvent of [false, true]) {
  test(`desktop zoom synchronizes initial state and preserves newer native events (${earlyEvent})`, async () => {
    const initial = Promise.withResolvers<number>()
    const setter = Promise.withResolvers<void>()
    const calls: number[] = []
    let changed!: (factor: number) => void
    const previous = Object.getOwnPropertyDescriptor(window, "api")
    Object.defineProperty(window, "api", { configurable: true, value: {
      getZoomFactor: () => initial.promise,
      setZoomFactor: (factor: number) => { calls.push(factor); return setter.promise },
      onZoomFactorChanged: (callback: typeof changed) => { changed = callback; return () => {} },
      getPinchZoomEnabled: async () => false,
      setPinchZoomEnabled: async () => {},
      onPinchZoomEnabledChanged: () => () => {},
    } })
    try {
      const zoom: typeof import("../../../apps/desktop/src/renderer/webview-zoom") = await import(`../../../apps/desktop/src/renderer/webview-zoom.ts?zoom-${earlyEvent}`)
      if (earlyEvent) changed(2)
      initial.resolve(1.6)
      await initial.promise
      await Promise.resolve()
      expect(zoom.webviewZoom()).toBe(earlyEvent ? 2 : 1.6)
      zoom.zoomIn()
      expect(calls).toEqual([earlyEvent ? 2.2 : 1.8])
      changed(1.2)
      setter.resolve()
      await setter.promise
      await Promise.resolve()
      expect(zoom.webviewZoom()).toBe(1.2)
    } finally {
      if (previous) Object.defineProperty(window, "api", previous)
      if (!previous) Reflect.deleteProperty(window, "api")
    }
  })
}
