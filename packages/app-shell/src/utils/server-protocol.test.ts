import { describe, expect, test } from "bun:test"
import { detectServerProtocol, ServerProtocolUnresolvedError } from "./server-protocol"
import { rejection } from "../testing/rejection"

const listen = (fetch: (request: Request) => Response | Promise<Response>) =>
  Bun.serve({ port: 0, hostname: "127.0.0.1", fetch })

describe("detectServerProtocol", () => {
  test("prefers the legacy health endpoint when both API generations exist", async () => {
    const paths: string[] = []
    const listener = listen((request) => {
      paths.push(new URL(request.url).pathname)
      return Response.json({ healthy: true, version: "2.0.0", pid: 123 })
    })
    try {
      expect(await detectServerProtocol({ url: listener.url.origin }, fetch)).toBe("v1")
      expect(paths).toEqual(["/global/health"])
    } finally {
      listener.stop(true)
    }
  })

  test.each([
    { body: { healthy: true, version: "2.0.0", pid: 123 }, kind: "v2" },
    { body: { healthy: true }, kind: "v1" },
  ])("recognizes API health $kind", async ({ body, kind }) => {
    const listener = listen((request) => new URL(request.url).pathname === "/global/health"
      ? Response.json({}, { status: 404 }) : Response.json(body))
    try {
      expect(await detectServerProtocol({ url: listener.url.origin }, fetch)).toBe(kind)
    } finally {
      listener.stop(true)
    }
  })

  test.each(["v1", "v2"] as const)("retries real 503 probes until %s is ready", async (kind) => {
    const counts = { legacy: 0, current: 0 }
    const listener = listen((request) => {
      if (new URL(request.url).pathname === "/global/health") {
        counts.legacy++
        if (kind === "v2") return Response.json({}, { status: 404 })
        return counts.legacy < 3 ? Response.json({}, { status: 503 }) : Response.json({ healthy: true })
      }
      counts.current++
      if (kind === "v1") return Response.json({}, { status: 503 })
      return counts.current < 3 ? Response.json({}, { status: 503 }) : Response.json({ pid: 123 })
    })
    try {
      expect(await detectServerProtocol({ url: listener.url.origin }, fetch, { retryDelayMs: 10 })).toBe(kind)
      expect(counts.legacy).toBe(kind === "v1" ? 3 : 1)
      expect(counts.current).toBe(kind === "v1" ? 0 : 3)
    } finally {
      listener.stop(true)
    }
  })

  test("a timed out health probe can recover on the next actual probe", async () => {
    let probes = 0
    const listener = listen(async (request) => {
      if (new URL(request.url).pathname !== "/global/health") return Response.json({}, { status: 404 })
      probes++
      if (probes === 1) await Bun.sleep(200)
      return Response.json({ healthy: true })
    })
    try {
      expect(await detectServerProtocol({ url: listener.url.origin }, fetch, {
        probeTimeoutMs: 50, retryDelayMs: 10, timeoutMs: 1_000,
      })).toBe("v1")
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
      expect(probes).toBe(12)
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
      expect(paths).toEqual(["/global/health"])
      expect(await rejection(detectServerProtocol({ url: listener.url.origin }, fetch, { signal: abort.signal })))
        .toBe(reason)
      expect(paths).toHaveLength(1)
    } finally {
      listener.stop(true)
    }
  })

  test("a cold legacy health response is not replaced with an invented V2 selection", async () => {
    const listener = listen(async (request) => {
      if (new URL(request.url).pathname !== "/global/health") return Response.json({}, { status: 404 })
      await Bun.sleep(5_100)
      return Response.json({ healthy: true })
    })
    try {
      expect(await detectServerProtocol({ url: listener.url.origin }, fetch)).toBe("v1")
    } finally {
      listener.stop(true)
    }
  }, 10_000)
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
      expect(await detectServerProtocol({ url: listener.url.origin }, fetcher, { attempts: 1 })).toBe("v1")
      expect(calls).toEqual(["/global/health", "/global/health"])
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
      expect(calls).toEqual([...Array(3).fill("/global/health"), ...Array(3).fill("/api/health")])
      state.ready = true
      expect(await detectServerProtocol(server, fetcher, { attempts: 1 })).toBe("v1")
      expect(calls).toHaveLength(7)
    } finally {
      listener.stop(true)
    }
  })

  test("an answered non-V1 legacy probe advances without retry", async () => {
    const paths: string[] = []
    const listener = listen((request) => {
      const path = new URL(request.url).pathname
      paths.push(path)
      return path === "/global/health"
        ? Response.json({}, { status: 404 })
        : Response.json({ healthy: true, version: "2.0.0", pid: 123 })
    })
    try {
      expect(await detectServerProtocol({ url: listener.url.origin }, fetch)).toBe("v2")
      expect(paths).toEqual(["/global/health", "/api/health"])
    } finally {
      listener.stop(true)
    }
  })
})
