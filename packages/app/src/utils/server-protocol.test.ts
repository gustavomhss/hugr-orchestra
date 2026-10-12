import { describe, expect, test } from "bun:test"
import { detectServerProtocol } from "./server-protocol"

const server = { url: "http://localhost:4096" }
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })
const mockFetch = (run: (input: string | URL | Request) => Promise<Response>) =>
  Object.assign(run, { preconnect: globalThis.fetch.preconnect })

describe("detectServerProtocol", () => {
  test("prefers the legacy health endpoint when both API generations exist", async () => {
    const fetcher = mockFetch((input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname
      if (path === "/global/health") return Promise.resolve(json({ healthy: true, version: "1.18.4" }))
      return Promise.resolve(json({ healthy: true, version: "2.0.0", pid: 123 }))
    })

    expect(await detectServerProtocol(server, fetcher)).toBe("v1")
  })

  test("recognizes V2 health by its process identifier", async () => {
    const fetcher = mockFetch((input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname
      if (path === "/global/health") return Promise.resolve(json({}, 404))
      return Promise.resolve(json({ healthy: true, version: "2.0.0", pid: 123 }))
    })

    expect(await detectServerProtocol(server, fetcher)).toBe("v2")
  })

  test("recognizes the transitional V1 API health response", async () => {
    const fetcher = mockFetch((input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname
      if (path === "/global/health") return Promise.resolve(json({}, 404))
      return Promise.resolve(json({ healthy: true }))
    })

    expect(await detectServerProtocol(server, fetcher)).toBe("v1")
  })

  test("a legacy health answer that follows a timed-out attempt still selects V1", async () => {
    const calls: string[] = []
    const fetcher = mockFetch((input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname
      calls.push(path)
      if (calls.length === 1) return Promise.reject(new DOMException("The operation timed out.", "TimeoutError"))
      if (path === "/global/health") return Promise.resolve(json({ healthy: true, version: "1.18.4" }))
      return Promise.resolve(json({ healthy: true, version: "2.0.0", pid: 123 }))
    })

    expect(await detectServerProtocol(server, fetcher)).toBe("v1")
    expect(calls).toEqual(["/global/health", "/global/health"])
  })

  test("a server that never answers keeps the V2 fallback after three attempts per probe", async () => {
    const calls: string[] = []
    const fetcher = mockFetch((input) => {
      calls.push(new URL(input instanceof Request ? input.url : input).pathname)
      return Promise.reject(new TypeError("Failed to fetch"))
    })

    expect(await detectServerProtocol(server, fetcher)).toBe("v2")
    expect(calls).toEqual([...Array(3).fill("/global/health"), ...Array(3).fill("/api/health")])
  })

  test("an answered non-V1 legacy probe is not retried", async () => {
    const calls: string[] = []
    const fetcher = mockFetch((input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname
      calls.push(path)
      if (path === "/global/health") return Promise.resolve(json({}, 404))
      return Promise.resolve(json({ healthy: true, version: "2.0.0", pid: 123 }))
    })

    expect(await detectServerProtocol(server, fetcher)).toBe("v2")
    expect(calls).toEqual(["/global/health", "/api/health"])
  })
})
