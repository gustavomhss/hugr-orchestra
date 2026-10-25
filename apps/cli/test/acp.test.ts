import { describe, expect, test } from "bun:test"
import { ClientSideConnection, ndJsonStream, type SessionNotification } from "@agentclientprotocol/sdk"
import { Orchestra } from "@orchestra/client"
import { serveAcp } from "../src/acp/serve"
import { mcpConfig, promptContent } from "../src/acp/agent"

const location = { directory: "/work", project: { id: "p", directory: "/work" } }
const session = { id: "ses_1", projectID: "p", title: "t", cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: 1, updated: 2 }, location: { directory: "/work" } }
const event = (seq: number, type: string, data: Record<string, unknown>) => ({
  id: `evt_${seq}`,
  type,
  data: { timestamp: 1, sessionID: "ses_1", ...data },
  durable: { aggregateID: "ses_1", seq, version: 1 },
})

function stub(options: { stream: unknown[]; permissions?: unknown[] }) {
  const calls: Array<{ route: string; body: unknown }> = []
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const route = `${request.method} ${new URL(request.url).pathname.replace(/^\/api/, "")}`
      calls.push({ route, body: request.method === "GET" ? undefined : await request.json().catch(() => undefined) })
      if (route === "GET /model")
        return Response.json({ location, data: [{ id: "m1", providerID: "p1", name: "M1", enabled: true, variants: [] }] })
      if (route === "GET /model/default") return Response.json({ location, data: { id: "m1", providerID: "p1", name: "M1" } })
      if (route === "GET /agent") return Response.json({ location, data: [{ id: "build", name: "Build", mode: "primary", hidden: false, permissions: [] }] })
      if (route === "POST /session") return Response.json({ data: session })
      if (route === "GET /session/ses_1/history") return Response.json({ data: [], hasMore: false })
      if (route === "POST /session/ses_1/prompt")
        return Response.json({ data: { id: "msg_1", sessionID: "ses_1", admittedSeq: 1, prompt: { text: "" }, delivery: "steer", timeCreated: 1 } })
      if (route === "POST /session/ses_1/wait") return new Response(null, { status: 204 })
      if (route === "GET /session/ses_1/event")
        return new Response(options.stream.map((item) => `data: ${JSON.stringify(item)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } })
      if (route === "GET /permission/request") return Response.json({ location, data: options.permissions ?? [] })
      if (route.endsWith("/reply")) return new Response(null, { status: 204 })
      return new Response("not found", { status: 404 })
    },
  })
  return { server, calls, client: Orchestra.make({ baseUrl: server.url.toString().replace(/\/$/, "") }) }
}

// An in-memory ACP peer: the test plays the editor.
function editor(client: ReturnType<typeof Orchestra.make>, allow = "once") {
  const toAgent = new TransformStream<Uint8Array, Uint8Array>()
  const fromAgent = new TransformStream<Uint8Array, Uint8Array>()
  void serveAcp(client, { input: toAgent.readable, output: fromAgent.writable })
  const updates: SessionNotification["update"][] = []
  const asked: string[] = []
  const connection = new ClientSideConnection(
    () => ({
      sessionUpdate: async (params) => void updates.push(params.update),
      requestPermission: async (params) => {
        asked.push(params.toolCall.title ?? "")
        return { outcome: { outcome: "selected", optionId: allow } }
      },
    }),
    ndJsonStream(toAgent.writable, fromAgent.readable),
  )
  return { connection, updates, asked }
}

describe("acp", () => {
  test("creates a session with the default model and mode, then streams a turn as updates", async () => {
    const s = stub({
      stream: [
        event(1, "session.next.prompted", { messageID: "msg_1" }),
        event(2, "session.next.tool.called", { callID: "c1", tool: "bash", input: { cmd: "ls" } }),
        event(3, "session.next.tool.success", { callID: "c1", content: [{ type: "text", text: "file" }], structured: {} }),
        event(4, "session.next.text.ended", { text: "done" }),
      ],
    })
    try {
      const peer = editor(s.client)
      await peer.connection.initialize({ protocolVersion: 1, clientCapabilities: {} })
      const created = await peer.connection.newSession({ cwd: "/work", mcpServers: [] })
      expect(created.sessionId).toBe("ses_1")
      expect(s.calls.find((call) => call.route === "POST /session")?.body).toMatchObject({ agent: "build", model: { providerID: "p1", id: "m1" } })
      const result = await peer.connection.prompt({ sessionId: "ses_1", prompt: [{ type: "text", text: "hi" }] })
      expect(result.stopReason).toBe("end_turn")
      expect(peer.updates.map((update) => update.sessionUpdate)).toEqual(["tool_call", "tool_call_update", "agent_message_chunk"])
      expect(s.calls.find((call) => call.route === "POST /session/ses_1/prompt")?.body).toMatchObject({ prompt: { text: "hi" } })
    } finally {
      s.server.stop(true)
    }
  })

  test("asks the editor for permission and relays its answer to the server", async () => {
    const request = { id: "per_1", sessionID: "ses_1", action: "bash", resources: ["ls"] }
    const s = stub({ stream: [event(1, "session.next.prompted", { messageID: "msg_1" })], permissions: [request] })
    try {
      const peer = editor(s.client, "reject")
      await peer.connection.newSession({ cwd: "/work", mcpServers: [] })
      await peer.connection.prompt({ sessionId: "ses_1", prompt: [{ type: "text", text: "hi" }] })
      expect(peer.asked).toEqual(["bash"])
      expect(s.calls.find((call) => call.route.endsWith("/permission/per_1/reply"))?.body).toEqual({ reply: "reject" })
    } finally {
      s.server.stop(true)
    }
  })

  test("maps MCP servers and prompt blocks to the Orchestra shapes", () => {
    expect(mcpConfig({ name: "fs", command: "npx", args: ["fs"], env: [{ name: "A", value: "1" }] })).toEqual({
      type: "local",
      command: ["npx", "fs"],
      environment: { A: "1" },
    })
    expect(mcpConfig({ type: "http", name: "r", url: "https://x", headers: [{ name: "H", value: "v" }] })).toEqual({
      type: "remote",
      url: "https://x",
      headers: { H: "v" },
    })
    expect(
      promptContent([
        { type: "text", text: "a" },
        { type: "resource_link", name: "f", uri: "file:///f" },
        { type: "resource", resource: { uri: "file:///g", text: "body" } },
      ]),
    ).toEqual({ text: 'a\n<context uri="file:///g">\nbody\n</context>', files: [{ uri: "file:///f", name: "f" }] })
  })
})
