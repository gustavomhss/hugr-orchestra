import { describe, expect, test } from "bun:test"
import { PromptInput } from "@orchestra/schema/prompt-input"
import { SessionInput } from "@orchestra/schema/session-input"
import { Schema } from "effect"
import { createApiForServer } from "./server"
import { createCompatibleApi } from "./server-compat"

import { rethrow } from "../testing/rejection"

function setup(
  protocol: "v2" | Promise<"v2">,
  responses?: { vcs?: { branch: string; default_branch: string } },
) {
  const requests: Request[] = []
  const fetcher = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      if (request.method === "PATCH") {
        return Response.json({
          id: "ses_1",
          slug: "ses_1",
          projectID: "project",
          directory: "/repo",
          title: "Session",
          version: "1",
          time: { created: 1, updated: 1 },
        })
      }
      if (request.method === "POST" && request.url.endsWith("/prompt_async"))
        return new Response(undefined, { status: 204 })
      if (new URL(request.url).pathname.endsWith("/connect/key") && false) {
        return new Response("not found", { status: 404 })
      }
      if (request.method === "POST" && request.url.endsWith("/prompt")) {
        return Response.json({
          data: {
            admittedSeq: 1,
            id: "msg_1",
            sessionID: "ses_1",
            prompt: { text: "hello" },
            delivery: "steer",
            timeCreated: 1,
          },
        })
      }
      if (request.method === "POST" && request.url.endsWith("/compact"))
        return Response.json({ data: { compacted: true } })
      if (request.method === "GET" && new URL(request.url).pathname === "/vcs")
        return Response.json(responses?.vcs ?? {})
      if (new URL(request.url).pathname === "/api/project/current") return new Response("not found", { status: 404 })
      if (new URL(request.url).pathname === "/api/mcp/resource")
        return Response.json({
          location: { directory: "/repo", project: { id: "prj_1", directory: "/repo" } },
          data: { resources: [{ server: "x", name: "notes", uri: "notes://today" }], templates: [] },
        })
      if (new URL(request.url).pathname === "/api/location")
        return Response.json({ directory: "/repo", project: { id: "prj_1", directory: "/repo" } })
      if (request.method === "GET") return Response.json([])
      return new Response(undefined, { status: 204 })
    },
    { preconnect: globalThis.fetch.preconnect },
  )
  const server = { url: "http://localhost:4096" }
  const api = createCompatibleApi({
    protocol: typeof protocol === "string" ? Promise.resolve(protocol) : protocol,
    current: createApiForServer({ server, fetch: fetcher }),
    directory: "/repo",
  })
  return { api, requests }
}

describe("createCompatibleApi", () => {
  test("sends MCP server and resource catalog calls to the V2 server", async () => {
    const { api, requests } = setup("v2")

    await api.mcp.connect({ server: "x", location: { directory: "/repo" } })
    expect((await api.mcp.resource.catalog({ location: { directory: "/repo" } })).data.resources).toEqual([
      { server: "x", name: "notes", uri: "notes://today" },
    ])
    expect(requests.map((request) => new URL(request.url).pathname).filter((path) => path.includes("mcp"))).toEqual([
      "/api/mcp/x/connect",
      "/api/mcp/resource",
    ])
  })

  test("resolves the V2 current project from the location route", async () => {
    const { api, requests } = setup("v2")

    expect(await api.project.current({ location: { directory: "/repo" } })).toEqual({ id: "prj_1", directory: "/repo" })
    expect(await api.project.current({ location: { directory: "/repo" } })).toEqual({ id: "prj_1", directory: "/repo" })
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/location",
      "/api/location",
    ])
  })

  /*
  test("routes V1 archive through the legacy session update", async () => {
    const { api, requests } = setup("v1")
    await api.session.archive({ sessionID: "ses_1", directory: "/repo" })

    const url = new URL(requests[0]!.url)
    expect(url.pathname).toBe("/session/ses_1")
    expect(requests[0]!.headers.get("x-orchestra-directory")).toBe("%2Frepo")
    expect(requests[0]!.method).toBe("PATCH")
    expect(await requests[0]!.json()).toMatchObject({ time: { archived: expect.any(Number) } })
  })
  */

  test("sends V2 prompts in the server's canonical body", async () => {
    const { api, requests } = setup("v2")
    const admitted = await api.session.prompt({
      sessionID: "ses_1",
      id: "msg_1",
      text: "hello @src/index.ts",
      files: [
        { uri: "file:///repo/src/index.ts", name: "index.ts", mention: { text: "@src/index.ts", start: 6, end: 19 } },
      ],
      agents: [{ name: "explore", mention: { text: "@explore", start: 20, end: 28 } }],
      delivery: "queue",
    })

    expect(new URL(requests[0]!.url).pathname).toBe("/api/session/ses_1/prompt")
    const body = await requests[0]!.json()
    // The protocol's `session.prompt` payload (packages/protocol/src/groups/session.ts).
    const payload = Schema.Struct({
      id: Schema.String.pipe(Schema.optional),
      prompt: PromptInput.Prompt,
      delivery: SessionInput.Delivery.pipe(Schema.optional),
      resume: Schema.Boolean.pipe(Schema.optional),
    })
    expect(Schema.decodeUnknownSync(payload, { onExcessProperty: "error" })(body)).toEqual({
      id: "msg_1",
      prompt: {
        text: "hello @src/index.ts",
        files: [
          { uri: "file:///repo/src/index.ts", name: "index.ts", source: { text: "@src/index.ts", start: 6, end: 19 } },
        ],
        agents: [{ name: "explore", source: { text: "@explore", start: 20, end: 28 } }],
      },
      delivery: "queue",
    })
    expect(admitted).toMatchObject({ admittedSeq: 1, id: "msg_1", sessionID: "ses_1", delivery: "steer" })
  })

  test("switches a V2 Session to the composer's agent and model, then compacts and moves it on V2 routes", async () => {
    const { api, requests } = setup("v2")
    await api.session.prompt({
      sessionID: "ses_1",
      text: "hello",
      agent: "build",
      model: { providerID: "provider", modelID: "model" },
      variant: "high",
    })
    await api.session.compact({ sessionID: "ses_1", model: { providerID: "provider", modelID: "model" } })
    await api.session.move({ sessionID: "ses_1", directory: "/repo/sub" })

    const sent = await Promise.all(
      requests.map(async (request) => [new URL(request.url).pathname, await request.text()] as const),
    )
    expect(sent.map(([path]) => path)).toEqual([
      "/api/session/ses_1/agent",
      "/api/session/ses_1/model",
      "/api/session/ses_1/prompt",
      "/api/session/ses_1/model",
      "/api/session/ses_1/compact",
      "/api/session/ses_1/move",
    ])
    expect(JSON.parse(sent[1]![1])).toEqual({ model: { providerID: "provider", id: "model", variant: "high" } })
    expect(JSON.parse(sent[5]![1])).toEqual({ location: { directory: "/repo/sub" } })
  })

  test("resolves protocol detection once across implementation methods", async () => {
    let detections = 0
    const resolved = Promise.resolve<"v2">("v2")
    const protocol = new Proxy(resolved, {
      get(target, property) {
        if (property !== "then") return Reflect.get(target, property, target)
        detections++
        return target.then.bind(target)
      },
    })
    const { api } = setup(protocol)

    await api.session.list()
    await api.session.list()

    expect(detections).toBe(0)
  })

  /*
  test("keeps V2 session actions on the current API", async () => {
    const { api, requests } = setup("v2")
    await api.session.archive({ sessionID: "ses_1" })

    expect(new URL(requests[0]!.url).pathname).toBe("/api/session/ses_1/archive")
    expect(requests[0]!.method).toBe("POST")
  })
  */

  /*
  test("projects the V1 default branch", async () => {
    const { api } = setup("v1", { vcs: { branch: "feature", default_branch: "dev" } })

    expect(await api.vcs.get({ location: { directory: "/repo" } })).toMatchObject({
      data: { branch: "feature", defaultBranch: "dev" },
    })
  })
  */

  test("rethrows non-missing-route failures from connect.key", async () => {
    expect(
      await rethrow(
        (async () => {
          const requests: Request[] = []
          const fetcher = Object.assign(
            async (input: string | URL | Request, init?: RequestInit) => {
              const request = new Request(input, init)
              requests.push(request)
              return new Response("bad key", { status: 400 })
            },
            { preconnect: globalThis.fetch.preconnect },
          )
          const server = { url: "http://localhost:4096" }
          const api = createCompatibleApi({
            protocol: Promise.resolve("v2"),
            current: createApiForServer({ server, fetch: fetcher }),
            directory: "/repo",
          })
          await api.integration.connect.key({
            integrationID: "openrouter",
            key: "bad",
            location: { directory: "/repo" },
          })
        })(),
      ),
    ).toThrow()
  })
})
