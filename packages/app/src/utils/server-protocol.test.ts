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

  test("does not invent a protocol when real endpoints are unavailable", async () => {
    const listener = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => Response.json({ error: "unavailable" }, { status: 503 }),
    })
    try {
      await expect(detectServerProtocol({ url: listener.url.origin }, fetch)).rejects.toThrow(
        "Unable to detect Orchestra server protocol: neither health endpoint reported ready.",
      )
    } finally {
      listener.stop(true)
    }
  })

  test("a cold legacy health response is not replaced with an invented V2 selection", async () => {
    const listener = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: async (request) => {
        if (new URL(request.url).pathname !== "/global/health") return Response.json({}, { status: 404 })
        await Bun.sleep(5_100)
        return Response.json({ healthy: true })
      },
    })
    try {
      expect(await detectServerProtocol({ url: listener.url.origin }, fetch)).toBe("v1")
    } finally {
      listener.stop(true)
    }
  }, 10_000)
})
