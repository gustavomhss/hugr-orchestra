export * as AppDockSocket from "./socket-transport"

import type { Transport } from "./transport"

// The desktop-owned V2 `serve` child has no utility port. Electron main hands it a loopback WebSocket and a per-launch
// token instead; messages keep the utility port's shapes, one JSON value per text frame.

export const URL_ENV = "ORCHESTRA_DOCK_URL"
export const TOKEN_ENV = "ORCHESTRA_DOCK_TOKEN"

/** The Dock channel this process was given, or undefined when it runs outside the desktop. */
export function fromEnv(env: Record<string, string | undefined> = process.env): Transport | undefined {
  const url = env[URL_ENV]
  const token = env[TOKEN_ENV]
  if (!url || !token) return undefined
  return connect(url, token)
}

export function connect(url: string, token: string): Transport {
  const listeners: Array<(event: { data: unknown }) => void> = []
  // Requests made before the socket opens are sent once it does.
  const queue: string[] = []
  const socket = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } })
  socket.addEventListener("open", () => queue.splice(0).forEach((text) => socket.send(text)))
  socket.addEventListener("message", (event) => {
    const data: unknown = JSON.parse(String(event.data))
    listeners.forEach((listener) => listener({ data }))
  })
  return {
    postMessage(message) {
      const text = JSON.stringify(message)
      if (socket.readyState === WebSocket.OPEN) return socket.send(text)
      queue.push(text)
    },
    on(_event, listener) {
      listeners.push(listener)
    },
  }
}
