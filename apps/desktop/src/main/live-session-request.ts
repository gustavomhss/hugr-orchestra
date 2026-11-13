import type { liveRequest } from "./live-meeting-client"

// The consumer stays inside the deadline: receiving headers is not completion of a JSON/body request.
export function liveSessionRequest<A>(transport: ReturnType<typeof liveRequest>, path: string, init: RequestInit, signal: AbortSignal | undefined, consume: (response: Response) => Promise<A>) {
  return request(transport, path, init, signal, consume, false)
}

// A successful SSE handshake hands the body to the caller; only its owner's signal lives on.
export function liveSessionHeaders(transport: ReturnType<typeof liveRequest>, path: string, signal: AbortSignal) {
  return request(transport, path, { headers: { accept: "text/event-stream" } }, signal, async (response) => response, true)
}

async function request<A>(transport: ReturnType<typeof liveRequest>, path: string, init: RequestInit, owner: AbortSignal | undefined, consume: (response: Response) => Promise<A>, keepBody: boolean) {
  const deadline = new AbortController()
  const signal = owner ? AbortSignal.any([owner, deadline.signal]) : deadline.signal
  const timer = setTimeout(() => deadline.abort(new Error(`${path} exceeded its 10s deadline`)), 10_000)
  const headers = new Headers(transport.headers)
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  const state = { response: undefined as Response | undefined, handedOff: false }
  try {
    signal.throwIfAborted()
    const response = await fetch(transport.endpoint(path), { ...init, headers, signal })
    state.response = response
    if (!response.ok) throw new Error(`${path} answered ${response.status}: ${await response.text()}`)
    const value = await consume(response)
    signal.throwIfAborted()
    state.handedOff = keepBody
    return value
  } finally {
    clearTimeout(timer)
    if (!state.handedOff) {
      deadline.abort()
      // Fetch abort may already have errored the stream. Cancellation rejection is expected in that case.
      if (state.response?.body && !state.response.body.locked) await state.response.body.cancel().catch(() => undefined)
    }
  }
}
