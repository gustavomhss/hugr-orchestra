import { describe, expect, test, vi } from "bun:test"
import { createWindowFlusher, UNLOAD_TIMEOUT } from "./window-flush"

// A window as flush sees it: it records what main sends to the page, and the test plays the page's answer through
// `settle`, as the `before-unload-done` IPC message does.
function fakeWindow(state: { destroyed?: boolean; contentsDestroyed?: boolean; crashed?: boolean } = {}) {
  const sent: { channel: string; id: string }[] = []
  return {
    sent,
    isDestroyed: () => !!state.destroyed,
    webContents: {
      isDestroyed: () => !!state.contentsDestroyed,
      isCrashed: () => !!state.crashed,
      send: (channel: string, id: string) => void sent.push({ channel, id }),
    },
  }
}

const flusher = () => createWindowFlusher<ReturnType<typeof fakeWindow>>()

// Whether a promise has settled, without waiting for it.
function watch(promise: Promise<void>) {
  const state = { settled: false }
  void promise.then(() => (state.settled = true))
  return state
}

const turn = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe("flushing a window before it closes or the app quits", () => {
  test("the cap on waiting for a page is three seconds", () => {
    expect(UNLOAD_TIMEOUT).toBe(3_000)
  })

  test("asks the page once and resolves as soon as the page answers", async () => {
    vi.useFakeTimers()
    try {
      const flush = flusher()
      const win = fakeWindow()
      const asked = flush.flush(win)
      const state = watch(asked)
      expect(win.sent).toHaveLength(1)
      expect(win.sent[0]!.channel).toBe("before-unload")
      await turn()
      expect(state.settled).toBe(false)
      expect(flush.flushed(win)).toBe(false)

      flush.settle(win.sent[0]!.id)
      await asked
      expect(state.settled).toBe(true)
      expect(flush.flushed(win)).toBe(true)
      // A window that was asked is not asked again.
      await flush.flush(win)
      expect(win.sent).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  test("goes ahead after three seconds when the page never answers", async () => {
    vi.useFakeTimers()
    try {
      const flush = flusher()
      const win = fakeWindow()
      const asked = flush.flush(win)
      const state = watch(asked)
      vi.advanceTimersByTime(UNLOAD_TIMEOUT - 1)
      await turn()
      expect(state.settled).toBe(false)

      vi.advanceTimersByTime(1)
      await asked
      expect(state.settled).toBe(true)
      expect(flush.flushed(win)).toBe(true)
      // The page's answer, if it ever comes, finds nothing waiting for it.
      expect(() => flush.settle(win.sent[0]!.id)).not.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })

  test("a second ask while the first is out joins it instead of asking the page again", async () => {
    vi.useFakeTimers()
    try {
      const flush = flusher()
      const win = fakeWindow()
      const first = flush.flush(win)
      expect(flush.flush(win)).toBe(first)
      expect(win.sent).toHaveLength(1)
      flush.settle(win.sent[0]!.id)
      await first
    } finally {
      vi.useRealTimers()
    }
  })

  test("each window has its own answer, and an unknown answer changes nothing", async () => {
    vi.useFakeTimers()
    try {
      const flush = flusher()
      const [a, b] = [fakeWindow(), fakeWindow()]
      const [first, second] = [flush.flush(a), flush.flush(b)]
      const [waitingA, waitingB] = [watch(first), watch(second)]
      expect(a.sent[0]!.id).not.toBe(b.sent[0]!.id)
      flush.settle("not-an-id")
      flush.settle(42)
      flush.settle(a.sent[0]!.id)
      await first
      await turn()
      expect(waitingA.settled).toBe(true)
      expect(waitingB.settled).toBe(false)
      flush.settle(b.sent[0]!.id)
      await second
    } finally {
      vi.useRealTimers()
    }
  })

  test("a window or page that is already gone is not asked and does not hold anything", async () => {
    const flush = flusher()
    for (const state of [{ destroyed: true }, { contentsDestroyed: true }, { crashed: true }]) {
      const win = fakeWindow(state)
      await flush.flush(win)
      expect(win.sent).toEqual([])
      expect(flush.flushed(win)).toBe(true)
    }
  })

  test("a window that skips the ask closes without it", async () => {
    const flush = flusher()
    const win = fakeWindow()
    flush.skip(win)
    expect(flush.flushed(win)).toBe(true)
    await flush.flush(win)
    expect(win.sent).toEqual([])
  })
})
