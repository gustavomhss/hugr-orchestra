// The server sends an SSE comment frame every 15 seconds. The generated client discards comment lines, so the
// app cannot see them as events. Reading the raw response body is the only place a heartbeat is observable.
// Stream activity is the best evidence that the server is up: a loaded machine can delay a health response
// well past its timeout while events and heartbeats keep arriving.
export const STREAM_STALL_MS = 45_000
const STALL_CHECK_MS = 5_000

const lastActivity = new Map<string, number>()

export function markStreamActivity(url: string, now = Date.now()) {
  lastActivity.set(url, now)
}

export function clearStreamActivity(url: string) {
  lastActivity.delete(url)
}

export function streamAlive(url: string, now = Date.now(), windowMs = STREAM_STALL_MS) {
  const at = lastActivity.get(url)
  return at !== undefined && now - at < windowMs
}

/**
 * Wraps a fetch so every chunk of its response body (events and heartbeats alike) counts as activity. `now` is the
 * clock the activity is stamped with; tests pass their own so no assertion depends on real elapsed time.
 */
export function tapStreamActivity(
  fetcher: typeof globalThis.fetch,
  url: string,
  now = Date.now,
): typeof globalThis.fetch {
  return Object.assign(
    async (request: string | URL | Request, init?: RequestInit) => {
      const response = await fetcher(request, init)
      if (!response.body) return response
      markStreamActivity(url, now())
      const reader = response.body.getReader()
      // Built from the body's own constructor: test runners that polyfill DOM globals ship a ReadableStream that
      // a native Response rejects.
      const Readable = response.body.constructor as typeof ReadableStream<Uint8Array>
      return new Response(
        new Readable({
          async pull(controller) {
            const chunk = await reader.read()
            if (chunk.done) return controller.close()
            markStreamActivity(url, now())
            controller.enqueue(chunk.value)
          },
          cancel: (reason) => reader.cancel(reason),
        }),
        { status: response.status, statusText: response.statusText, headers: response.headers },
      )
    },
    { preconnect: fetcher.preconnect },
  )
}

/**
 * Aborts a stream attempt that has gone silent for longer than `stallMs`. A half-open connection delivers no error,
 * so without this a `for await` over the stream can wait forever. Returns a function that stops the watch.
 * `now` and `every` are the clock and the repeating timer; tests replace both to step time by hand.
 */
export function watchStreamStall(input: {
  url: string
  attempt: AbortController
  stallMs?: number
  checkMs?: number
  onStall?: () => void
  now?: () => number
  every?: (tick: () => void, ms: number) => () => void
}) {
  const stallMs = input.stallMs ?? STREAM_STALL_MS
  const now = input.now ?? Date.now
  const every =
    input.every ??
    ((tick, ms) => {
      const id = setInterval(tick, ms)
      return () => clearInterval(id)
    })
  const started = now()
  const stop = every(() => {
    const at = lastActivity.get(input.url) ?? started
    if (now() - Math.max(at, started) < stallMs) return
    stop()
    input.onStall?.()
    input.attempt.abort()
  }, input.checkMs ?? STALL_CHECK_MS)
  return stop
}
