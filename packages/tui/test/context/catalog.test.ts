import { expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { createCatalog } from "../../src/context/catalog"

const location = { directory: "/repo", project: { id: "proj_1", directory: "/repo" } }

function model(providerID: string, id: string) {
  return {
    id,
    providerID,
    name: id,
    api: { id, type: "aisdk", package: "@ai-sdk/test" },
    capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
    request: { headers: {}, body: {} },
    variants: [{ id: "high", headers: {}, body: { effort: "high" } }],
    time: { released: Date.UTC(2026, 0, 2) },
    cost: [{ input: 1, output: 2, cache: { read: 3, write: 4 } }],
    status: "active",
    enabled: true,
    limit: { context: 1000, output: 100 },
  }
}

function provider(id: string, disabled?: boolean) {
  return { id, name: id, disabled, api: { type: "aisdk", package: "@ai-sdk/test" }, request: { headers: {}, body: {} } }
}

function session(id: string) {
  return {
    id,
    projectID: "proj_1",
    title: id,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 2 },
    location: { directory: "/repo/app", workspaceID: "ws_1" },
    subpath: "app",
  }
}

// The real client builds every request; only the transport is replaced, to answer each route with its declared body.
function serve(routes: Record<string, unknown>) {
  const urls: URL[] = []
  const fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(new Request(input, init).url)
      urls.push(url)
      if (!(url.pathname in routes)) throw new Error(`unexpected request: ${url.pathname}`)
      return Response.json(routes[url.pathname])
    },
    { preconnect: globalThis.fetch.preconnect },
  )
  return { urls, catalog: createCatalog(Orchestra.make({ baseUrl: "http://localhost:1", fetch })) }
}

test("bootstrap maps the V2 catalog into the legacy provider, agent and config stores", async () => {
  const { catalog } = serve({
    "/api/provider": { location, data: [provider("p1"), provider("p2"), provider("off", true)] },
    "/api/model": {
      location,
      data: [model("p1", "a"), model("p1", "b"), model("p2", "c"), model("p2", "d"), model("off", "e")],
    },
    "/api/model/default": { location, data: model("p2", "d") },
    "/api/agent": {
      location,
      data: [
        {
          id: "build",
          name: "Build",
          model: { id: "c", providerID: "p2", variant: "high" },
          request: { headers: {}, body: {} },
          mode: "primary",
          hidden: false,
          permissions: [],
        },
        { id: "scout", request: { headers: {}, body: {} }, mode: "subagent", hidden: true, permissions: [] },
      ],
    },
    "/api/config": { model: "p2/d", shell: "zsh", disabledProviders: ["off"] },
  })
  const result = await catalog.bootstrap({ directory: "/repo" })

  // The default model's provider goes first; disabled providers are listed in `all` only.
  expect(result.provider.map((item) => item.id)).toEqual(["p2", "p1"])
  expect(result.default).toEqual({ p1: "a", p2: "d" })
  expect(result.next.connected).toEqual(["p1", "p2"])
  expect(result.next.all.map((item) => item.id)).toEqual(["p1", "p2", "off"])
  expect(Object.keys(result.provider[0].models)).toEqual(["c", "d"])
  expect(result.provider[0].models.d).toMatchObject({
    id: "d",
    providerID: "p2",
    release_date: "2026-01-02",
    capabilities: { reasoning: true, attachment: true, toolcall: true, input: { text: true, image: true, pdf: false } },
    cost: { input: 1, output: 2, cache: { read: 3, write: 4 } },
    variants: { high: { effort: "high" } },
  })
  expect(result.agent).toEqual([
    {
      id: "build",
      name: "Build",
      mode: "primary",
      hidden: false,
      model: { modelID: "c", providerID: "p2" },
      variant: "high",
    },
    { id: "scout", name: "scout", mode: "subagent", hidden: true },
  ])
  expect(result.config).toEqual({ model: "p2/d", shell: "zsh", disabled_providers: ["off"] })
})

test("bootstrap without a default model ranks no provider first and defaults each to its first model", async () => {
  const { catalog } = serve({
    "/api/provider": { location, data: [provider("p1"), provider("p2")] },
    "/api/model": { location, data: [model("p1", "a"), model("p2", "c")] },
    "/api/model/default": { location, data: null },
    "/api/agent": { location, data: [] },
    "/api/config": { disabledProviders: [] },
  })
  const result = await catalog.bootstrap({})
  expect(result.provider.map((item) => item.id)).toEqual(["p1", "p2"])
  expect(result.default).toEqual({ p1: "a", p2: "c" })
})

test("sessions lists by project and subpath and maps V2 Sessions to the legacy shape", async () => {
  const { urls, catalog } = serve({ "/api/session": { data: [session("ses_b"), session("ses_a")], cursor: {} } })
  const sessions = await catalog.sessions({ workspace: "ws_1", project: "proj_1", subpath: "app" })

  expect(Object.fromEntries(urls[0].searchParams)).toEqual({
    workspace: "ws_1",
    project: "proj_1",
    subpath: "app",
    limit: "100",
    order: "desc",
  })
  expect(sessions.map((item) => item.id)).toEqual(["ses_a", "ses_b"])
  expect(sessions[0]).toMatchObject({
    id: "ses_a",
    projectID: "proj_1",
    location: { directory: "/repo/app", workspaceID: "ws_1" },
    subpath: "app",
  })
})

test("status marks active Sessions busy", async () => {
  const { catalog } = serve({ "/api/session/active": { data: { ses_1: { type: "running" } } } })
  expect(await catalog.status()).toEqual({ ses_1: { type: "busy" } })
})
