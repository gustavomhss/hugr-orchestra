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
      let stalls = 0
      const stop = watchStreamStall({ url, attempt, stallMs: 150, checkMs: 20, onStall: () => stalls++ })
      const response = await tapStreamActivity(fetch, url)(url, { signal: attempt.signal })
      const reader = response.body!.getReader()
      await reader.read()
      await reader.read().catch(() => undefined)
      stop()

      expect(attempt.signal.aborted).toBe(true)
      expect(stalls).toBe(1)
    } finally {
      listener.stop(true)
    }
  })

  test("a stream that keeps sending heartbeats is left alone", async () => {
    const listener = sse(30)
    try {
      const url = listener.url.origin
      const attempt = new AbortController()
      let stalls = 0
      const stop = watchStreamStall({ url, attempt, stallMs: 150, checkMs: 20, onStall: () => stalls++ })
      const response = await tapStreamActivity(fetch, url)(url, { signal: attempt.signal })
      const reader = response.body!.getReader()
      const until = Date.now() + 500
      while (Date.now() < until) await reader.read()
      stop()
      await reader.cancel()

      expect(attempt.signal.aborted).toBe(false)
      expect(stalls).toBe(0)
    } finally {
      listener.stop(true)
    }
  })
})
