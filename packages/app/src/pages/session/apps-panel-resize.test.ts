import { describe, expect, test } from "bun:test"
import { bounds, createAppDockBoundsSync, type AppDockBoundsSnapshot, type Bounds } from "./apps-panel-resize"

describe("App Dock bounds sync", () => {
  test("coalesces a burst and reads the latest native snapshot at frame delivery", () => {
    const dock = fixture()
    Array.from({ length: 100 }, () => dock.sync.request())
    expect(dock.pending.size).toBe(1)
    expect(dock.state.reads).toBe(0)
    expect(dock.calls).toEqual([])
    const calls: Bounds[] = []
    dock.state.snapshot = {
      tab: { tabID: "dock-2", generation: 2 },
      bounds: { x: 540, y: 66, width: 934, height: 468 },
      resize: async (next) => {
        calls.push(next)
      },
    }
    dock.flush()
    expect(calls).toEqual([{ x: 540, y: 66, width: 934, height: 468 }])
    expect(dock.calls).toEqual([])
    expect(dock.state.reads).toBe(1)
    expect(dock.pending.size).toBe(0)
    Array.from({ length: 100 }, () => dock.sync.request())
    dock.flush()
    expect(calls).toHaveLength(1)
    expect(dock.state.reads).toBe(2)
  })

  test("sends position-only changes and each size change, suppresses equal rectangles", () => {
    const dock = fixture()
    dock.sync.request()
    dock.flush()
    const changes: Bounds[] = [
      { x: 540, y: 66, width: 934, height: 468 },
      { x: 540, y: 76, width: 934, height: 468 },
      { x: 540, y: 76, width: 944, height: 468 },
      { x: 540, y: 76, width: 944, height: 478 },
    ]
    changes.forEach((next, index) => {
      dock.state.snapshot!.bounds = next
      dock.sync.request()
      dock.flush()
      expect(dock.calls).toHaveLength(index + 2)
      expect(dock.calls.at(-1)).toEqual(next)
      dock.sync.request()
      dock.flush()
      expect(dock.calls).toHaveLength(index + 2)
    })
  })

  test("new tab or recovery generation forces an update at equal bounds", () => {
    const dock = fixture()
    dock.sync.request()
    dock.flush()
    dock.state.snapshot!.tab.tabID = "dock-2"
    dock.sync.request()
    dock.flush()
    expect(dock.calls).toHaveLength(2)
    dock.state.snapshot!.tab.generation++
    dock.sync.request()
    dock.flush()
    expect(dock.calls).toHaveLength(3)
    dock.sync.request()
    dock.flush()
    expect(dock.calls).toHaveLength(3)
  })

  test("missing snapshot sends nothing and invalidates cached native identity", () => {
    const dock = fixture()
    dock.sync.request()
    dock.flush()
    const snapshot = dock.state.snapshot
    dock.state.snapshot = undefined
    dock.sync.request()
    dock.flush()
    expect(dock.calls).toHaveLength(1)
    dock.state.snapshot = snapshot
    dock.sync.request()
    dock.flush()
    expect(dock.calls).toHaveLength(2)
  })

  test("dispose cancels frame zero, blocks a late callback and future requests", () => {
    const dock = fixture()
    dock.sync.request()
    const late = dock.pending.get(0)!
    dock.sync.dispose()
    expect(dock.cancelled).toEqual([0])
    expect(dock.pending.size).toBe(0)
    late()
    dock.sync.request()
    dock.sync.dispose()
    expect(dock.pending.size).toBe(0)
    expect(dock.state.reads).toBe(0)
    expect(dock.calls).toEqual([])
    expect(dock.cancelled).toEqual([0])
  })

  test("native promises neither block changed bounds nor schedule hidden retries", async () => {
    const dock = fixture()
    const pending = Promise.withResolvers<void>()
    const failure = new Error("native resize rejected")
    const rejected = pending.promise.catch((cause: unknown) => cause)
    dock.state.snapshot!.resize = (next) => {
      dock.calls.push({ ...next })
      return pending.promise
    }
    dock.sync.request()
    dock.flush()
    dock.state.snapshot!.bounds.x = 540
    dock.sync.request()
    dock.flush()
    expect(dock.calls).toHaveLength(2)
    pending.reject(failure)
    expect(await rejected).toBe(failure)
    expect(dock.pending.size).toBe(0)
    dock.sync.request()
    dock.flush()
    expect(dock.calls).toHaveLength(2)
  })

  test("native synchronous errors escape frame callback", () => {
    const dock = fixture()
    dock.state.snapshot!.resize = () => {
      throw new Error("native resize threw")
    }
    dock.sync.request()
    expect(dock.flush).toThrow("native resize threw")
    expect(dock.pending.size).toBe(0)
  })

  test("DOM bounds preserve physical coordinates, rounding and inactive minimum size", () => {
    const host = document.createElement("div")
    host.getBoundingClientRect = () => new DOMRect(440.49, -1.6, 934.5, 468.49)
    expect(bounds(host)).toEqual({ x: 440, y: -2, width: 935, height: 468 })
    host.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
    expect(bounds(host)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })
})

function fixture() {
  const pending = new Map<number, () => void>()
  const cancelled: number[] = []
  const calls: Bounds[] = []
  const state: { snapshot: AppDockBoundsSnapshot | undefined; reads: number; frame: number } = {
    snapshot: {
      tab: { tabID: "dock-1", generation: 1 },
      bounds: { x: 440, y: 66, width: 934, height: 468 },
      resize: async (next) => {
        calls.push({ ...next })
      },
    },
    reads: 0,
    frame: -1,
  }
  const sync = createAppDockBoundsSync({
    snapshot: () => {
      state.reads++
      return state.snapshot
    },
    requestAnimationFrame: (callback) => {
      pending.set(++state.frame, callback)
      return state.frame
    },
    cancelAnimationFrame: (frame) => {
      cancelled.push(frame)
      pending.delete(frame)
    },
  })
  return {
    sync,
    state,
    pending,
    cancelled,
    calls,
    flush: () => {
      const callbacks = Array.from(pending.values())
      pending.clear()
      callbacks.forEach((callback) => callback())
    },
  }
}
