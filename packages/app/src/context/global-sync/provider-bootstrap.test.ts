import { expect, test } from "bun:test"
import { OpenCode } from "@opencode-ai/client/promise"
import { QueryClient } from "@tanstack/solid-query"
import { loadProvidersQuery } from "./bootstrap"
import { ServerScope } from "@/utils/server-scope"

function server(status: Record<string, number> = {}, htmlDefault = false) {
  const requests: URL[] = []
  const api = OpenCode.make({
    baseUrl: "http://catalog.test",
    fetch: Object.assign(
      async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        requests.push(url)
        if (htmlDefault && url.pathname === "/api/model/default")
          return new Response("<!doctype html><title>UI catchall</title>", { headers: { "content-type": "text/html" } })
        if (status[url.pathname]) return Response.json({ message: "endpoint failed" }, { status: status[url.pathname] })
        if (url.pathname === "/api/provider")
          return Response.json({ location: {}, data: [{ id: "opencode", name: "Zen" }] })
        if (url.pathname === "/api/model")
          return Response.json({
            location: {},
            data: [
              {
                id: "free",
                providerID: "opencode",
                modelID: "free",
                name: "Free",
                capabilities: { tools: true, input: ["text"], output: ["text"] },
                cost: [{ input: 0, output: 0, cache: { read: 0, write: 0 } }],
                limit: { context: 1000, output: 100 },
                status: "active",
                time: { released: 0 },
                variants: [],
              },
            ],
          })
        if (url.pathname === "/api/model/default")
          return Response.json({ location: {}, data: { providerID: "opencode", id: "free" } })
        throw new Error(`Unexpected endpoint: ${url.pathname}`)
      },
      { preconnect() {} },
    ),
  })
  return { api, requests }
}

for (const status of [404, 405, 501]) {
  test(`unsupported optional default (${status}) preserves provider/model catalog with real promise client`, async () => {
    const source = server({ "/api/model/default": status })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    try {
      const catalog = await client.fetchQuery(loadProvidersQuery(ServerScope.local, "/repo", source.api))
      expect(catalog.connected).toEqual(["opencode"])
      expect(Object.keys(catalog.all.get("opencode")!.models)).toEqual(["free"])
      expect(catalog.defaultModel).toBeNull()
      expect(source.requests.map((url) => url.pathname)).toEqual(["/api/provider", "/api/model", "/api/model/default"])
      expect(source.requests.map((url) => url.searchParams.get("location[directory]"))).toEqual([
        "/repo",
        "/repo",
        "/repo",
      ])
    } finally {
      client.clear()
    }
  })
}

test("a compatible client without model.default still loads available models", async () => {
  const source = server()
  const client = new QueryClient()
  const api = { ...source.api, model: { list: source.api.model.list } }
  try {
    const catalog = await client.fetchQuery(loadProvidersQuery(ServerScope.local, null, api as typeof source.api))
    expect(catalog.connected).toEqual(["opencode"])
    expect(catalog.all.get("opencode")?.models.free.id).toBe("free")
    expect(source.requests.map((url) => url.pathname)).toEqual(["/api/provider", "/api/model"])
  } finally {
    client.clear()
  }
})

test("supported default is retained", async () => {
  const source = server()
  const client = new QueryClient()
  try {
    const catalog = await client.fetchQuery(loadProvidersQuery(ServerScope.local, null, source.api))
    expect(catalog.defaultModel).toEqual({ providerID: "opencode", modelID: "free" })
  } finally {
    client.clear()
  }
})

test("a malformed 200 HTML default response is not treated as an unsupported optional endpoint", async () => {
  const source = server({}, true)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    await expect(client.fetchQuery(loadProvidersQuery(ServerScope.local, null, source.api))).rejects.toMatchObject({
      reason: "UnsupportedContentType",
    })
    expect(source.requests.map((url) => url.pathname)).toContain("/api/model/default")
  } finally {
    client.clear()
  }
})

for (const [path, status] of [
  ["/api/model/default", 401],
  ["/api/model/default", 403],
  ["/api/model/default", 500],
  ["/api/provider", 404],
  ["/api/provider", 401],
  ["/api/model", 404],
  ["/api/model", 500],
] as const) {
  test(`${path} failure ${status} is not converted into an empty successful catalog`, async () => {
    const source = server({ [path]: status })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    try {
      await expect(client.fetchQuery(loadProvidersQuery(ServerScope.local, null, source.api))).rejects.toBeDefined()
      expect(source.requests.some((url) => url.pathname === path)).toBe(true)
    } finally {
      client.clear()
    }
  })
}
