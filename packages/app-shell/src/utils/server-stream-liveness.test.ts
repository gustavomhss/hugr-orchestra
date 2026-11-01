import { describe, expect, test } from "bun:test"
import {
  clearStreamActivity,
  streamAlive,
  tapStreamActivity,
  watchStreamStall,
} from "./server-stream-liveness"

// A real SSE endpoint. `every` is the gap between comment frames; without it the stream sends one frame and goes silent.
function sse(every?: number) {
  const encoder = new TextEncoder()
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => {
      let timer: ReturnType<typeof setInterval> | undefined
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(": heartbeat\n\n"))
            if (every) timer = setInterval(() => controller.enqueue(encoder.encode(": heartbeat\n\n")), every)
          },
          cancel() {
            clearInterval(timer)
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      )
    },
  })
}

// The stall check runs on a clock and a timer the test steps by hand, so no assertion depends on real elapsed time:
// a loaded runner that delays a heartbeat or a timer by 100 ms must not look like a stalled stream.
function manual() {
  let t = 1_000
  let tick: (() => void) | undefined
  return {
    now: () => t,
    advance: (ms: number) => void (t += ms),
    every: (run: () => void) => {
      tick = run
      return () => void (tick = undefined)
    },
    tick: () => tick?.(),
    watching: () => tick !== undefined,
  }
}

describe("stream liveness", () => {
  test("a heartbeat comment frame counts as activity", async () => {
    const listener = sse()
    try {
      const url = listener.url.origin
      expect(streamAlive(url)).toBe(false)
      const response = await tapStreamActivity(fetch, url)(url)
      await response.body!.getReader().read()
      expect(streamAlive(url)).toBe(true)
      // The window closes when the stream goes quiet, and a dead stream is cleared outright.
      expect(streamAlive(url, Date.now() + 60_000)).toBe(false)
      clearStreamActivity(url)
      expect(streamAlive(url)).toBe(false)
    } finally {
      listener.stop(true)
    }
  })

  test("a stream that goes silent is cut so it can reconnect", async () => {
    const listener = sse()
    try {
      const url = listener.url.origin
      const attempt = new AbortController()
      const clock = manual()
      let stalls = 0
      const stop = watchStreamStall({
        url,
        attempt,
        stallMs: 150,
        onStall: () => stalls++,
        now: clock.now,
        every: clock.every,
      })
      const response = await tapStreamActivity(fetch, url, clock.now)(url, { signal: attempt.signal })
      const reader = response.body!.getReader()
      await reader.read()

      // One millisecond short of the window the stream is still alive; the tick that closes it cuts the attempt.
      clock.advance(149)
      clock.tick()
      expect(attempt.signal.aborted).toBe(false)
      clock.advance(1)
      clock.tick()
      expect(attempt.signal.aborted).toBe(true)
      expect(stalls).toBe(1)
      expect(clock.watching()).toBe(false)

      // The cut ends the body, so a reader waiting on it is released instead of hanging.
      await reader.read().catch(() => undefined)
      clock.tick()
      stop()
      expect(stalls).toBe(1)
    } finally {
      listener.stop(true)
    }
  })

  test("a stream that keeps sending heartbeats is left alone", async () => {
    const listener = sse(10)
    try {
      const url = listener.url.origin
      const attempt = new AbortController()
      const clock = manual()
      let stalls = 0
      const stop = watchStreamStall({
        url,
        attempt,
        stallMs: 150,
        onStall: () => stalls++,
        now: clock.now,
        every: clock.every,
      })
      const response = await tapStreamActivity(fetch, url, clock.now)(url, { signal: attempt.signal })
      const reader = response.body!.getReader()
      // Each round moves the clock to just inside the window, waits for a heartbeat to be stamped at the new time,
      // then checks. Five rounds pass 745 ms of clock, far past the window the heartbeats keep renewing.
      for (const _ of Array.from({ length: 5 })) {
        clock.advance(149)
        await reader.read()
        // Bounded in real time, so a regression where heartbeats stop stamping fails here instead of hanging the file.
        const deadline = Date.now() + 5_000
        while (!streamAlive(url, clock.now(), 1)) {
          if (Date.now() > deadline) throw new Error("no heartbeat was stamped at the advanced clock within 5 s")
          await Bun.sleep(5)
        }
        clock.tick()
        expect(attempt.signal.aborted).toBe(false)
      }
      stop()
      await reader.cancel()

      expect(stalls).toBe(0)
    } finally {
      listener.stop(true)
    }
  })
})
