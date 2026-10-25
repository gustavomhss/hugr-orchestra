import { describe, expect, test } from "bun:test"
import { detectServerProtocol, ServerProtocolUnresolvedError } from "./server-protocol"
import { rejection } from "../testing/rejection"

const listen = (fetch: (request: Request) => Response | Promise<Response>) =>
  Bun.serve({ port: 0, hostname: "127.0.0.1", fetch })

describe("detectServerProtocol", () => {
  test("recognizes API health v2", async () => {
    const body = { healthy: true, version: "2.0.0", pid: 123 }
    const listener = listen(() => Response.json(body))
    try {
      expect(await detectServerProtocol({ url: listener.url.origin }, fetch)).toBe("v2")
    } finally {
      listener.stop(true)
    }
  })

  test("retries real 503 probes until v2 is ready", async () => {
    let current = 0
    const listener = listen((request) => {
      current++
      return current < 3 ? Response.json({}, { status: 503 }) : Response.json({ pid: 123 })
    })
    try {
      expect(await detectServerProtocol({ url: listener.url.origin }, fetch, { retryDelayMs: 10 })).toBe("v2")
      expect(current).toBe(3)
    } finally {
      listener.stop(true)
    }
  })

  test("a timed out health probe can recover on the next actual probe", async () => {
    let probes = 0
    const listener = listen(async (request) => {
      probes++
      if (probes === 1) await Bun.sleep(200)
      return Response.json({ pid: 123 })
    })
    try {
      expect(await detectServerProtocol({ url: listener.url.origin }, fetch, {
        probeTimeoutMs: 50, retryDelayMs: 10, timeoutMs: 1_000,
      })).toBe("v2")
      expect(probes).toBe(2)
    } finally {
      listener.stop(true)
    }
  })

  test("does not invent a protocol when real endpoints stay unavailable", async () => {
    let probes = 0
    const listener = listen(() => {
      probes++
      return Response.json({ error: "unavailable" }, { status: 503 })
    })
    try {
      expect(await rejection(detectServerProtocol({ url: listener.url.origin }, fetch, {
        attempts: 2, retryDelayMs: 10,
      }))).toBeInstanceOf(ServerProtocolUnresolvedError)
      expect(probes).toBe(6)
    } finally {
      listener.stop(true)
    }
  })

  test("the startup deadline bounds a slow actual health request", async () => {
    const listener = listen(async () => {
      await Bun.sleep(500)
      return Response.json({ healthy: true })
    })
    try {
      const start = Date.now()
      expect(await rejection(detectServerProtocol({ url: listener.url.origin }, fetch, { timeoutMs: 50 })))
        .toMatchObject({ name: "ServerProtocolUnresolvedError" })
      expect(Date.now() - start).toBeLessThan(400)
    } finally {
      listener.stop(true)
    }
  })

  test("connection cancellation stops detection without a second endpoint probe", async () => {
    const reached = Promise.withResolvers<void>()
    const paths: string[] = []
    const listener = listen(async (request) => {
      paths.push(new URL(request.url).pathname)
      reached.resolve()
      await Bun.sleep(500)
      return Response.json({ healthy: true })
    })
    const abort = new AbortController()
    const reason = new DOMException("Connection disposed", "AbortError")
    try {
      const protocol = detectServerProtocol({ url: listener.url.origin }, fetch, { signal: abort.signal })
      const rejected = rejection(protocol)
      await reached.promise
      abort.abort(reason)
      expect(await rejected).toBe(reason)
      await Bun.sleep(20)
      expect(paths).toEqual(["/api/health"])
      expect(await rejection(detectServerProtocol({ url: listener.url.origin }, fetch, { signal: abort.signal })))
        .toBe(reason)
      expect(paths).toHaveLength(1)
    } finally {
      listener.stop(true)
    }
  })

  test("an injected unanswered probe retries the same endpoint before advancing", async () => {
    const calls: string[] = []
    const listener = listen((request) => {
      expect(request.headers.get("X-Protocol-Probe")).toBe("injected")
      return Response.json({ healthy: true })
    })
    const fetcher = Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push(new URL(input instanceof Request ? input.url : String(input)).pathname)
      if (calls.length === 1) return Promise.reject(new TypeError("Failed to fetch"))
      const headers = new Headers(init?.headers)
      headers.set("X-Protocol-Probe", "injected")
      return fetch(input, { ...init, headers })
    }, { preconnect: fetch.preconnect })
    try {
      expect(await detectServerProtocol({ url: listener.url.origin }, fetcher, { attempts: 1 })).toBe("v2")
      expect(calls).toEqual(["/api/health", "/api/health"])
    } finally {
      listener.stop(true)
    }
  })

  test("exhausted unanswered probes reject as unknown and a later detection recovers", async () => {
    const calls: string[] = []
    const state = { ready: false }
    const listener = listen(() => Response.json({ healthy: true }))
    const fetcher = Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push(new URL(input instanceof Request ? input.url : String(input)).pathname)
      return state.ready ? fetch(input, init) : Promise.reject(new TypeError("Failed to fetch"))
    }, { preconnect: fetch.preconnect })
    try {
      const server = { url: listener.url.origin }
      expect(await rejection(detectServerProtocol(server, fetcher, { attempts: 1 })))
        .toBeInstanceOf(ServerProtocolUnresolvedError)
      expect(calls).toEqual([...Array(3).fill("/api/health")])
      state.ready = true
      expect(await detectServerProtocol(server, fetcher, { attempts: 1 })).toBe("v2")
      expect(calls).toHaveLength(4)
    } finally {
      listener.stop(true)
    }
  })

})
