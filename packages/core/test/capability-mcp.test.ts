import { describe, expect } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { Credential } from "@orchestra/schema/credential"
import { CapabilityMcp } from "../src/capability/mcp/index"
import type { CapabilityDiscovery } from "../src/capability/catalog/discovery"
import { Cause, Deferred, Effect, Exit, Fiber, Schema, Scope } from "effect"
import { it } from "./lib/effect"

const token = "fixture-selected-secret"
const endpoint = "https://mcp.cloudflare.com/approved/mcp?account=one&codemode=false"
const owner = Schema.decodeUnknownSync(Capability.Owner)({ projectID: "project-fixture", location: { directory: "/fixture" },
  sessionID: "ses_fixture", agentID: "backend" })
const base: CapabilityDiscovery.Selection = {
  connection: { id: Capability.ConnectionID.create(), provider: "cloudflare", generation: 1 },
  target: { id: Capability.TargetID.create(), connectionID: Capability.ConnectionID.create(), generation: 2, environment: "fixture" },
  resource: { account: "one", endpoint: "https://untrusted.invalid" }, endpoint, owner,
  credentialID: Credential.ID.create(), credential: { type: "key", key: token, metadata: { authorization: "ignored" } },
}
const selected = { ...base, target: { ...base.target, connectionID: base.connection.id } }
const tool = { name: "mutate", description: "Preserve description €", inputSchema: {
  type: "object", properties: { value: { type: "string" } }, additionalProperties: false,
}, outputSchema: { type: "object", properties: { changed: { type: "boolean" } } } } satisfies Schema.JsonObject
const result = { content: [{ type: "text", text: "done €" }], structuredContent: { changed: true } } satisfies Schema.JsonObject
type RecordRequest = { method: string; url: string; headers: Headers; body: Schema.JsonObject }
type Fixture = {
  requests: RecordRequest[]; bytes: number; initializeCount: number; closed: number; cancelled: number
  mode: "json" | "sse"; chunks: boolean; version: string; tools: Schema.Json[]; paginate: boolean; traffic: Schema.Json[]
  override?: (request: RecordRequest) => Response | undefined | Promise<Response | undefined>
  origin: string
  transport: (options?: CapabilityMcp.Options) => CapabilityMcp.Interface
  send: (body: unknown, session?: string) => Response
}

/** Real loopback server: requests pass through native fetch, never a mocked transport. */
function fixture(mode: "json" | "sse" = "json") {
  return Effect.acquireRelease(Effect.sync(() => {
    const state: Fixture = { requests: [], bytes: 0, initializeCount: 0, closed: 0, cancelled: 0,
      mode, chunks: false, version: "2025-11-25", tools: [tool], paginate: false, traffic: [], origin: "",
      transport: (options = {}) => CapabilityMcp.make({ fixtureOrigin: state.origin, ...options }),
      send: (body, session) => {
        const text = state.mode === "json" ? JSON.stringify(body) : "\uFEFF: keepalive\r\nid: prime\r\ndata:\r\n\r\n" +
          [...state.traffic, body].map((value) => "event: message\r\n" + JSON.stringify(value, null, 2)
            .split("\n").map((line) => `data: ${line}\r\n`).join("") + "\r\n").join("")
        const bytes = new TextEncoder().encode(text)
        state.bytes += bytes.byteLength
        const headers = { "content-type": state.mode === "json" ? "application/json" : "text/event-stream",
          ...(session === undefined ? {} : { "mcp-session-id": session }) }
        if (!state.chunks) return new Response(bytes, { headers })
        const position = { offset: 0, cancelled: false }
        return new Response(new ReadableStream<Uint8Array>({
          async pull(controller) {
            await Bun.sleep(1)
            if (position.cancelled) return
            if (position.offset === bytes.length) { controller.close(); return }
            // Splits CRLF, BOM, UTF-8 characters and JSON field names across actual HTTP chunks.
            controller.enqueue(bytes.subarray(position.offset, position.offset + 7))
            position.offset = Math.min(bytes.length, position.offset + 7)
          }, cancel() { position.cancelled = true; state.cancelled++ },
        }), { headers })
      },
    }
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      const recorded: RecordRequest = { method: request.method, url: request.url, headers: request.headers,
        body: request.method === "DELETE" ? {} : Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(await request.json()) }
      state.requests.push(recorded)
      const overridden = await state.override?.(recorded)
      if (overridden !== undefined) return overridden
      if (request.method === "DELETE") { state.closed++; return new Response(null, { status: 204 }) }
      const body = recorded.body
      if (body.method === "initialize") {
        state.initializeCount++
        return state.send({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: state.version, capabilities: { tools: { listChanged: true } },
          serverInfo: { name: "fixture", version: "1" } } }, `session-${state.initializeCount}`)
      }
      if (body.method === "notifications/initialized" || body.method === undefined) return new Response(null, { status: 202 })
      if (body.method === "tools/list") {
        const next = body.params !== null && typeof body.params === "object" && "cursor" in body.params
        return state.send({ jsonrpc: "2.0", id: body.id, result: { tools: state.paginate ? state.tools.slice(next ? 1 : 0, next ? undefined : 1) : state.tools,
          ...(state.paginate && !next ? { nextCursor: "opaque +/?=cursor" } : {}) } })
      }
      if (body.method === "tools/call") return state.send({ jsonrpc: "2.0", id: body.id, result })
      return new Response(null, { status: 400 })
    } })
    state.origin = server.url.origin
    return { state, server }
  }), (value) => Effect.promise(() => value.server.stop(true))).pipe(Effect.map((value) => value.state))
}

function fails<A, R>(effect: Effect.Effect<A, Capability.Failure, R>, code: Capability.ErrorCode, reason?: string) {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(effect)
    expect(Exit.isFailure(exit)).toBe(true)
    const error = yield* Effect.flip(exit)
    expect(error).toBeInstanceOf(Capability.Failure)
    expect(error.code).toBe(code)
    if (reason) expect(error.message).toContain(reason)
    const encoded = JSON.stringify(error)
    ;[token, endpoint, "session-", "vendor-private", "mcp.cloudflare.com"].forEach((secret) => expect(encoded).not.toContain(secret))
  })
}

describe("native MCP Streamable HTTP", () => {
  for (const mode of ["json", "sse"] as const) {
    it.live(`${mode}: negotiates, lists and calls on the approved endpoint with scoped headers`, () => Effect.gen(function* () {
      const f = yield* fixture(mode)
      const transport = f.transport()
      yield* Effect.scoped(Effect.gen(function* () {
        const session = yield* transport.open(selected)
        const listed = yield* session.listTools
        expect(listed.tools).toEqual([{ name: "mutate", summary: tool.description, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema }])
        expect(listed.coverage).toBe("complete")
        expect(listed.byteLength).toBe(f.bytes)
        expect(yield* session.callTool("mutate", { value: "x" })).toEqual({ ...result, isError: false })
        expect(f.closed).toBe(0)
      }))
      expect(f.closed).toBe(1)
      expect(f.requests.map((r) => r.body.method ?? r.method)).toEqual(["initialize", "notifications/initialized", "tools/list", "tools/call", "DELETE"])
      f.requests.forEach((r, index) => {
        expect(r.url).toBe(`${f.origin}/approved/mcp?account=one&codemode=false`)
        expect(r.headers.get("authorization")).toBe(`Bearer ${token}`)
        expect(r.headers.get("accept")).toBe("application/json, text/event-stream")
        expect(r.headers.get("mcp-session-id")).toBe(index === 0 ? null : "session-1")
        expect(r.headers.get("mcp-protocol-version")).toBe(index === 0 ? null : "2025-11-25")
      })
      expect(f.requests[0]?.body.params).toEqual({ protocolVersion: "2025-11-25", capabilities: {},
        clientInfo: { name: "orchestra-capability", version: "1" } })
      expect(f.requests[3]?.body.params).toEqual({ name: "mutate", arguments: { value: "x" } })
    }))
  }

  for (const version of ["2025-03-26", "2025-06-18", "2025-11-25"]) {
    it.live(`uses negotiated ${version} headers`, () => Effect.gen(function* () {
      const f = yield* fixture()
      f.version = version
      yield* f.transport().listTools(selected)
      expect(f.requests.slice(1).every((r) => r.headers.get("mcp-protocol-version") === version)).toBe(true)
    }))
  }

  it.live("SSE handles byte-split BOM, CRLF, multiline JSON and UTF-8 through init/list/call", () => Effect.gen(function* () {
    const f = yield* fixture("sse")
    f.chunks = true
    const session = yield* f.transport().open(selected)
    expect((yield* session.listTools).tools[0]?.summary).toBe(tool.description)
    expect((yield* session.callTool("mutate", {})).content).toEqual(result.content)
  }))

  it.live("SSE ignores bounded notifications, answers ping and rejects sampling/elicitation without execution", () => Effect.gen(function* () {
    const f = yield* fixture("sse")
    const session = yield* f.transport().open(selected)
    f.traffic = [{ jsonrpc: "2.0", method: "notifications/tools/list_changed" },
      { jsonrpc: "2.0", id: "sampling-id", method: "sampling/createMessage", params: {} },
      { jsonrpc: "2.0", id: "elicitation-id", method: "elicitation/create", params: {} },
      { jsonrpc: "2.0", id: "ping-id", method: "ping" }]
    yield* session.listTools
    expect(f.requests.filter((r) => r.body.error !== undefined).map((r) => r.body)).toEqual([
      { jsonrpc: "2.0", id: "sampling-id", error: { code: -32601, message: "Method not found" } },
      { jsonrpc: "2.0", id: "elicitation-id", error: { code: -32601, message: "Method not found" } },
    ])
    expect(f.requests.find((r) => r.body.id === "ping-id")?.body).toEqual({ jsonrpc: "2.0", id: "ping-id", result: {} })
    expect(f.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(0)
    f.requests.slice(1).forEach((r) => expect(r.headers.get("mcp-session-id")).toBe("session-1"))
  }))

  it.live("pagination counts full envelopes; canonical generations track schema/description/metadata, not order", () => Effect.gen(function* () {
    const f = yield* fixture()
    f.paginate = true
    f.tools = [tool, { name: "boolean", inputSchema: true, outputSchema: false }]
    const transport = f.transport()
    const first = yield* transport.listTools(selected)
    expect(first.tools[1]).toEqual({ name: "boolean", summary: "", inputSchema: true, outputSchema: false })
    expect(first.byteLength).toBe(f.bytes)
    const second = yield* transport.listTools(selected)
    expect(second.catalogGeneration).toBe(first.catalogGeneration)
    f.tools.reverse()
    expect((yield* transport.listTools(selected)).catalogGeneration).toBe(first.catalogGeneration)
    f.tools = [{ ...tool, inputSchema: { type: "object", properties: { other: { type: "number" } } } }]
    const changed = yield* transport.listTools(selected)
    expect(changed.catalogGeneration).toBeGreaterThan(first.catalogGeneration)
    f.tools = [{ ...tool, description: "Changed description" }]
    const description = yield* transport.listTools(selected)
    expect(description.catalogGeneration).toBeGreaterThan(changed.catalogGeneration)
    f.tools = [{ ...tool, description: "Changed description", title: "Changed metadata" }]
    const metadata = yield* transport.listTools(selected)
    expect(metadata.catalogGeneration).toBeGreaterThan(description.catalogGeneration)
    f.tools = [{ ...tool, outputSchema: false }]
    const output = yield* transport.listTools(selected)
    expect(output.catalogGeneration).toBeGreaterThan(metadata.catalogGeneration)
    expect(output.tools[0]?.outputSchema).toBe(false)
  }))

  it.live("generation identities include connection, target, endpoint and owner; capacity fails closed", () => Effect.gen(function* () {
    const f = yield* fixture()
    const transport = f.transport({ maxGenerations: 8 })
    const other = { ...selected.connection, id: Capability.ConnectionID.create() }
    const inputs = [selected, { ...selected, connection: { ...selected.connection, generation: 2 } },
      { ...selected, target: { ...selected.target, generation: 3 } }, { ...selected, endpoint: endpoint + "&scoped=yes" },
      { ...selected, owner: { ...owner, agentID: Schema.decodeUnknownSync(Capability.Owner)({ ...owner, agentID: "other" }).agentID } },
      { ...selected, connection: other, target: { ...selected.target, connectionID: other.id } },
      { ...selected, target: { ...selected.target, id: Capability.TargetID.create() } },
      { ...selected, endpoint: "https://mcp.cloudflare.com:443/approved/mcp?account=one&codemode=false" }]
    const generations = yield* Effect.forEach(inputs, (input) => transport.listTools(input))
    expect(new Set(generations.map((value) => value.catalogGeneration)).size).toBe(8)
    yield* fails(transport.listTools({ ...selected, connection: { ...selected.connection, generation: 99 } }), "quota_exceeded", "generation capacity")
    expect((yield* transport.listTools(selected)).catalogGeneration).toBe(generations[0]?.catalogGeneration)
  }))

  for (const entry of [
    { name: "wrong numeric ID", envelope: { jsonrpc: "2.0", id: 999, result: { tools: [] } }, reason: "correlation" },
    { name: "string ID", envelope: { jsonrpc: "2.0", id: "2", result: { tools: [] } }, reason: "correlation" },
    { name: "JSON-RPC version", envelope: { jsonrpc: "1.0", id: 2, result: { tools: [] } }, reason: "envelope" },
    { name: "batch", envelope: [{ jsonrpc: "2.0", id: 2, result: { tools: [] } }], reason: "envelope" },
    { name: "both result/error", envelope: { jsonrpc: "2.0", id: 2, result: { tools: [] }, error: { code: 1, message: "vendor-private" } }, reason: "correlation" },
    { name: "missing result/error", envelope: { jsonrpc: "2.0", id: 2 }, reason: "correlation" },
    { name: "remote error redaction", envelope: { jsonrpc: "2.0", id: 2, error: { code: -32603, message: token + endpoint + "vendor-private" } }, reason: "remote error" },
  ] satisfies { name: string; envelope: Schema.Json; reason: string }[]) {
    it.live(`rejects ${entry.name}`, () => Effect.gen(function* () {
      const f = yield* fixture()
      f.override = (r) => r.body.method === "tools/list" ? f.send(entry.envelope) : undefined
      yield* fails(f.transport().listTools(selected), "acquisition_failed", entry.reason)
      expect(f.closed).toBe(1)
    }))
  }

  for (const value of [null, { content: "bad" }, { content: [null] }, { content: [{ type: "text", text: 42 }] },
    { content: [], isError: "true" }, { content: [], structuredContent: [] }, { content: [{ type: "unknown" }] }]) {
    it.live(`rejects malformed call result ${JSON.stringify(value)}`, () => Effect.gen(function* () {
      const f = yield* fixture()
      f.override = (r) => r.body.method === "tools/call" ? f.send({ jsonrpc: "2.0", id: r.body.id, result: value }) : undefined
      const session = yield* f.transport().open(selected)
      yield* fails(session.callTool("mutate", {}), "acquisition_failed", value === null ? "result envelope" : "call result")
    }))
  }

  it.live("preserves tool execution errors, structured results and all MCP content kinds", () => Effect.gen(function* () {
    const f = yield* fixture()
    const content: Schema.Json[] = [{ type: "text", text: "failed", annotations: { audience: ["user", "assistant"], priority: 0.7,
      lastModified: "2025-01-12T15:00:58Z" }, _meta: { "fixture/opaque": [1, true] } }, { type: "image", data: "AA==", mimeType: "image/png" },
      { type: "audio", data: "AA==", mimeType: "audio/wav" }, { type: "resource_link", name: "file", uri: "file:///fixture" },
      { type: "resource", resource: { uri: "file:///fixture", text: "text" } },
      { type: "resource", resource: { uri: "file:///blob", blob: "AA==", mimeType: "application/octet-stream", _meta: {} } },
      { type: "resource_link", name: "rich", title: "Rich", description: "Read only", uri: "file:///rich", size: 10,
        icons: [{ src: "https://untrusted.invalid/icon.svg", sizes: ["any"], theme: "dark" }], annotations: { priority: 1 } }]
    f.override = (r) => r.body.method === "tools/call" ? f.send({ jsonrpc: "2.0", id: r.body.id,
      result: { content, isError: true, structuredContent: { failed: true } } }) : undefined
    const session = yield* f.transport().open(selected)
    expect(yield* session.callTool("mutate", {})).toEqual({ content, isError: true, structuredContent: { failed: true } })
  }))

  it.live("rejects unsupported versions, missing tools capability and invalid init types; cleans partial opens", () => Effect.gen(function* () {
    const f = yield* fixture()
    for (const value of [{ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "x", version: "1" } },
      { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "x", version: "1" } }]) {
      f.override = (r) => r.body.method === "initialize" ? f.send({ jsonrpc: "2.0", id: r.body.id, result: value }, "partial-session") : undefined
      yield* fails(f.transport().listTools(selected), "unsupported_operation")
    }
    f.override = (r) => r.body.method === "initialize" ? f.send({ jsonrpc: "2.0", id: r.body.id,
      result: { protocolVersion: "2025-11-25", capabilities: { tools: { listChanged: "bad" } }, serverInfo: { name: "x", version: "1" } } }, "partial-session") : undefined
    yield* fails(f.transport().listTools(selected), "acquisition_failed")
    expect(f.closed).toBe(3)
  }))

  it.live("content metadata validates MCP field shapes while preserving opaque extension data", () => Effect.gen(function* () {
    const f = yield* fixture()
    for (const content of [{ type: "text", text: "x", annotations: [] },
      { type: "image", data: "AA==", mimeType: "image/png", annotations: { audience: ["system"] } },
      { type: "audio", data: "AA==", mimeType: "audio/wav", annotations: { priority: 2 } },
      { type: "text", text: "x", annotations: { lastModified: 3 } }, { type: "text", text: "x", _meta: "bad" },
      { type: "resource_link", name: "x", uri: "file:///x", size: "10" },
      { type: "resource_link", name: "x", uri: "file:///x", icons: [{ src: "data:image/png;base64,AA==", theme: "wrong" }] },
      { type: "resource", resource: { uri: "file:///x", blob: "AA==", _meta: [] } }]) {
      f.override = (r) => r.body.method === "tools/call" ? f.send({ jsonrpc: "2.0", id: r.body.id, result: { content: [content] } }) : undefined
      yield* Effect.scoped(Effect.gen(function* () {
        const session = yield* f.transport().open(selected)
        yield* fails(session.callTool("mutate", {}), "acquisition_failed", "call result")
      }))
    }
    f.override = (r) => r.body.method === "tools/call" ? f.send({ jsonrpc: "2.0", id: r.body.id,
      result: { content: [], _meta: "bad" } }) : undefined
    const session = yield* f.transport().open(selected)
    yield* fails(session.callTool("mutate", {}), "acquisition_failed", "result envelope")
  }))

  for (const status of [401, 403, 302, 307]) {
    it.live(`HTTP ${status}: sanitized failure, no redirects or retries`, () => Effect.gen(function* () {
      const f = yield* fixture()
      f.override = () => new Response(`vendor-private ${token} ${endpoint}`, { status, headers: { location: f.origin + "/leak" } })
      yield* fails(f.transport().listTools(selected), status === 401 ? "authentication_required" : status === 403 ? "target_denied" : "acquisition_failed")
      expect(f.requests).toHaveLength(1)
    }))
  }

  it.live("404 invalidates the session; a new explicit operation opens a new session without replay", () => Effect.gen(function* () {
    const f = yield* fixture()
    const transport = f.transport()
    const session = yield* transport.open(selected)
    f.override = (r) => r.body.method === "tools/call" ? new Response(null, { status: 404 }) : undefined
    yield* fails(session.callTool("mutate", {}), "connection_unavailable")
    yield* fails(session.callTool("mutate", {}), "connection_unavailable")
    yield* fails(session.listTools, "connection_unavailable")
    expect(f.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(1)
    f.override = undefined
    yield* transport.listTools(selected)
    expect(f.initializeCount).toBe(2)
  }))

  it.live("expired/empty/header-injected credentials, bad endpoints and unknown providers fail before I/O", () => Effect.gen(function* () {
    const f = yield* fixture()
    const transport = f.transport()
    for (const key of ["", "x\r\ny", " x", "x\n", "x\u0000"]) {
      yield* fails(transport.listTools({ ...selected, credential: { type: "key", key } }), "authentication_required")
    }
    yield* fails(transport.listTools({ ...selected, credential: Schema.decodeUnknownSync(Credential.OAuth)({ type: "oauth", methodID: "fixture",
      access: token, refresh: "refresh", expires: Date.now() - 1 }) }), "authentication_required")
    for (const url of ["http://mcp.cloudflare.com/mcp", "https://mcp.cloudflare.com.evil/mcp", "https://user@mcp.cloudflare.com/mcp",
      "https://@mcp.cloudflare.com/mcp", "https:////mcp.cloudflare.com/mcp",
      endpoint + "\n", endpoint + "\r\n",
      endpoint + "#", "https://mcp.cloudflare.com:444/mcp", "https://mcp.cloudflare.com/has space", "https://mcp.cloudflare.com\\evil/mcp", "https:/mcp.cloudflare.com/mcp"]) {
      yield* fails(transport.listTools({ ...selected, endpoint: url }), "target_denied")
    }
    yield* fails(transport.listTools({ ...selected, connection: { ...selected.connection, provider: "unknown" } }), "unsupported_operation")
    expect(f.requests).toHaveLength(0)
  }))

  it.live("selected credentials and scoped sessions stay isolated across accounts and rotations", () => Effect.gen(function* () {
    const f = yield* fixture()
    const transport = f.transport()
    const first = yield* transport.open(selected)
    const other = { ...selected, credential: { type: "key" as const, key: "fixture-second-secret" }, credentialID: Credential.ID.create(),
      connection: { ...selected.connection, id: Capability.ConnectionID.create() } }
    const second = yield* transport.open({ ...other, target: { ...other.target, connectionID: other.connection.id } })
    yield* first.callTool("mutate", {})
    yield* second.callTool("mutate", {})
    const calls = f.requests.filter((r) => r.body.method === "tools/call")
    expect(calls.map((r) => [r.headers.get("authorization"), r.headers.get("mcp-session-id")])).toEqual([
      [`Bearer ${token}`, "session-1"], ["Bearer fixture-second-secret", "session-2"],
    ])
    yield* transport.listTools({ ...selected, credential: { type: "key", key: "rotated-secret" } })
    expect(f.initializeCount).toBe(3)
    expect(f.requests.find((r) => r.body.method === "initialize" && r.headers.get("authorization") === "Bearer rotated-secret")?.headers.get("mcp-session-id")).toBeNull()
  }))

  it.live("credential expiry after open blocks calls and DELETE; expiry during pagination blocks the next POST", () => Effect.gen(function* () {
    const f = yield* fixture()
    const credential = Schema.decodeUnknownSync(Credential.OAuth)({ type: "oauth", methodID: "fixture", access: token,
      refresh: "fixture-refresh", expires: Date.now() + 2000 })
    yield* Effect.scoped(Effect.gen(function* () {
      const session = yield* f.transport().open({ ...selected, credential })
      yield* Effect.sleep(Math.max(1, credential.expires - Date.now() + 20))
      const before = f.requests.length
      yield* fails(session.callTool("mutate", {}), "authentication_required", "credential expiry")
      expect(f.requests).toHaveLength(before)
    }))
    expect(f.requests.some((r) => r.method === "DELETE")).toBe(false)
    const next = Schema.decodeUnknownSync(Credential.OAuth)({ ...credential, expires: Date.now() + 2000 })
    f.override = async (r) => {
      if (r.body.method !== "tools/list") return undefined
      await Bun.sleep(Math.max(1, next.expires - Date.now() + 20))
      return f.send({ jsonrpc: "2.0", id: r.body.id, result: { tools: [tool], nextCursor: "after-expiry" } })
    }
    yield* fails(f.transport().listTools({ ...selected, credential: next }), "authentication_required", "credential expiry")
    expect(f.requests.filter((r) => r.body.method === "tools/list")).toHaveLength(1)
    expect(f.requests.some((r) => r.method === "DELETE")).toBe(false)
  }), 10000)

  it.live("byte cap precedes JSON/UTF-8 parsing; full init and page envelopes share one quota", () => Effect.gen(function* () {
    const f = yield* fixture()
    const transport = f.transport()
    const baseline = yield* transport.listTools(selected)
    yield* fails(f.transport({ maxCatalogBytes: baseline.byteLength - 1 }).listTools(selected), "quota_exceeded", "response bytes")
    expect((yield* f.transport({ maxCatalogBytes: baseline.byteLength }).listTools(selected)).byteLength).toBe(baseline.byteLength)
    f.override = (r) => r.body.method === "tools/list" ? new Response(new Uint8Array(1024).fill(255), { headers: { "content-type": "application/json" } }) : undefined
    yield* fails(f.transport({ maxCatalogBytes: 512 }).listTools(selected), "quota_exceeded", "response bytes")
    f.override = (r) => r.body.method === "initialize" ? new Response("{bad".repeat(1000), { headers: { "content-type": "application/json" } }) : undefined
    yield* fails(f.transport({ maxCatalogBytes: 512 }).listTools(selected), "quota_exceeded", "response bytes")
  }))

  it.live("SSE counts comments and unrelated events, caps before decoding; invalid split UTF-8 fails", () => Effect.gen(function* () {
    const f = yield* fixture("sse")
    const session = yield* f.transport({ maxResultBytes: 128 }).open(selected)
    f.override = (r) => r.body.method === "tools/call" ? new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(256).fill(255)); controller.close()
    } }), { headers: { "content-type": "text/event-stream" } }) : undefined
    yield* fails(session.callTool("mutate", {}), "quota_exceeded", "response bytes")
    f.override = (r) => r.body.method === "tools/list" ? new Response(": " + "comment".repeat(200), { headers: { "content-type": "text/event-stream" } }) : undefined
    yield* fails(f.transport({ maxCatalogBytes: 1024 }).listTools(selected), "quota_exceeded", "response bytes")
    f.override = (r) => r.body.method === "tools/list" ? new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array([0x64, 0x61, 0x74, 0x61, 0x3a, 0x20, 0xe2]));
      controller.enqueue(new Uint8Array([0x28, 0xa1])); controller.close()
    } }), { headers: { "content-type": "text/event-stream" } }) : undefined
    yield* fails(f.transport().listTools(selected), "acquisition_failed", "UTF-8")
  }))

  it.live("result/request byte limits bound calls before parsing/sending, including multibyte arguments", () => Effect.gen(function* () {
    const f = yield* fixture()
    const session = yield* f.transport({ requestBytes: 256, maxResultBytes: 128 }).open(selected)
    yield* fails(session.callTool("mutate", { value: "€".repeat(256) }), "quota_exceeded", "request bytes")
    expect(f.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(0)
    const next = yield* f.transport({ maxResultBytes: 128 }).open(selected)
    f.override = (r) => r.body.method === "tools/call" ? new Response("bad".repeat(256), { headers: { "content-type": "application/json" } }) : undefined
    yield* fails(next.callTool("mutate", {}), "quota_exceeded", "response bytes")
  }))

  it.live("cursor cycles, duplicate names, page/tool/message bounds fail rather than return partial catalogs", () => Effect.gen(function* () {
    const f = yield* fixture()
    f.override = (r) => r.body.method === "tools/list" ? f.send({ jsonrpc: "2.0", id: r.body.id, result: { tools: [], nextCursor: "cycle" } }) : undefined
    yield* fails(f.transport().listTools(selected), "acquisition_failed", "cursor cycle")
    f.override = undefined
    f.tools = [tool, tool]
    f.paginate = true
    yield* fails(f.transport().listTools(selected), "acquisition_failed", "duplicate tool")
    yield* fails(f.transport({ maxPages: 1 }).listTools(selected), "quota_exceeded", "pages")
    f.paginate = false
    yield* fails(f.transport({ maxTools: 1 }).listTools(selected), "quota_exceeded", "tools")
    f.tools = [tool]
    f.mode = "sse"
    f.traffic = Array.from({ length: 3 }, () => ({ jsonrpc: "2.0", method: "notifications/message" }))
    yield* fails(f.transport({ maxMessages: 2 }).listTools(selected), "quota_exceeded", "messages")
  }))

  for (const mode of ["disconnect", "timeout", "interrupt"] as const) {
    it.live(`mutation ${mode}: exactly one POST; permits release after scoped cancellation`, () => Effect.gen(function* () {
      const f = yield* fixture()
      const entered = yield* Deferred.make<void>()
      const transport = f.transport({ maxConcurrentSessions: 1, timeoutMs: mode === "timeout" ? 2000 : 10000 })
      f.override = (r) => {
        if (r.body.method !== "tools/call") return undefined
        Effect.runSync(Deferred.succeed(entered, undefined))
        return new Response(new ReadableStream({ start(controller) {
          controller.enqueue(new TextEncoder().encode(": received\n\n"))
          if (mode === "disconnect") controller.close()
        }, cancel() { f.cancelled++ } }), { headers: { "content-type": "text/event-stream" } })
      }
      const operation = Effect.scoped(Effect.gen(function* () {
        const session = yield* transport.open(selected)
        return yield* session.callTool("mutate", {})
      }))
      if (mode === "interrupt") {
        const fiber = yield* operation.pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.join(fiber).pipe(Effect.exit)
        expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
      }
      if (mode !== "interrupt") yield* fails(operation, mode === "timeout" ? "outcome_unknown" : "acquisition_failed")
      expect(f.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(1)
      expect(f.closed).toBe(1)
      f.override = undefined
      yield* transport.listTools(selected)
      expect(f.closed).toBe(2)
    }), 15000)
  }

  it.live("concurrency holds permits for session scopes; waiting interruption and failed initialization release permits", () => Effect.gen(function* () {
    const f = yield* fixture()
    const transport = f.transport({ maxConcurrentSessions: 1, timeoutMs: 1000 })
    const scope = yield* Scope.make()
    const session = yield* transport.open(selected).pipe(Effect.provideService(Scope.Scope, scope))
    const waiter = yield* transport.listTools(selected).pipe(Effect.forkChild)
    yield* Effect.sleep(20)
    expect(f.initializeCount).toBe(1)
    yield* Fiber.interrupt(waiter)
    expect(Exit.hasInterrupts(yield* Fiber.join(waiter).pipe(Effect.exit))).toBe(true)
    yield* Scope.close(scope, Exit.void)
    yield* fails(session.callTool("mutate", {}), "connection_unavailable")
    f.version = "invalid"
    yield* fails(transport.open(selected), "unsupported_operation")
    f.version = "2025-11-25"
    yield* transport.listTools(selected)
    expect(f.closed).toBe(3)
  }))

  it.live("total acquisition timeout covers all pages, not each request independently", () => Effect.gen(function* () {
    const f = yield* fixture()
    f.override = async (r) => {
      if (r.body.method !== "tools/list") return new Response(null, { status: 202 })
      await Bun.sleep(800)
      return f.send({ jsonrpc: "2.0", id: r.body.id, result: { tools: [], nextCursor: String(r.body.id) } })
    }
    // Keep normal initialization; delay only each list page.
    const delayed = f.override
    f.override = (r) => r.body.method === "tools/list" ? delayed(r) : undefined
    yield* fails(f.transport({ timeoutMs: 1400 }).listTools(selected), "acquisition_failed", "timeout")
    expect(f.requests.filter((r) => r.body.method === "tools/list")).toHaveLength(2)
  }))

  it.live("an already exhausted acquisition deadline sends no first list POST; a permit-wait timeout sends no initialize", () => Effect.gen(function* () {
    const f = yield* fixture()
    const transport = f.transport({ maxConcurrentSessions: 1, timeoutMs: 2000 })
    const scope = yield* Effect.acquireRelease(Scope.make(), (scope, exit) => Scope.close(scope, exit))
    const session = yield* transport.open(selected).pipe(Effect.provideService(Scope.Scope, scope))
    yield* fails(transport.open(selected), "acquisition_failed", "timeout")
    expect(f.initializeCount).toBe(1)
    // Permit wait has exhausted this session's original acquisition deadline too.
    yield* fails(session.listTools, "acquisition_failed", "timeout")
    expect(f.requests.filter((r) => r.body.method === "tools/list")).toHaveLength(0)
    yield* Scope.close(scope, Exit.void)
    yield* transport.listTools(selected)
    expect(f.initializeCount).toBe(2)
  }), 10000)

  it.live("DELETE is bounded/best effort; host defects remain defects", () => Effect.gen(function* () {
    const f = yield* fixture()
    f.override = (r) => r.method === "DELETE" ? new Response(new ReadableStream({ start() {} })) : undefined
    yield* f.transport().listTools(selected)
    f.override = undefined
    const session = yield* f.transport().open(selected)
    const input = new Proxy({}, { ownKeys() { throw new Error("sentinel defect") } })
    const exit = yield* session.callTool("mutate", input).pipe(Effect.exit)
    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
  }))

  it.live("malformed tools and opaque cursor types fail transport shape checks without schema compilation", () => Effect.gen(function* () {
    const f = yield* fixture()
    for (const value of [{ tools: "bad" }, { tools: [{ ...tool, name: 3 }] }, { tools: [{ ...tool, inputSchema: null }] },
      { tools: [{ ...tool, inputSchema: [] }] }, { tools: [{ ...tool, outputSchema: "bad" }] },
      { tools: [{ ...tool, description: 42 }] }, { tools: [{ ...tool, annotations: { readOnlyHint: "true" } }] },
      { tools: [tool], nextCursor: 1 }, { tools: [tool], nextCursor: "" }, { tools: [tool], nextCursor: "€".repeat(1400) }]) {
      f.override = (r) => r.body.method === "tools/list" ? f.send({ jsonrpc: "2.0", id: r.body.id, result: value }) : undefined
      yield* fails(f.transport().listTools(selected), "acquisition_failed")
    }
    // A valid schema container with unsupported keywords remains unchanged for the caller's validator.
    f.override = undefined
    f.tools = [{ ...tool, inputSchema: { externalKeyword: "preserved", $ref: "https://example.invalid/schema" } }]
    expect((yield* f.transport().listTools(selected)).tools[0]?.inputSchema).toEqual({ externalKeyword: "preserved", $ref: "https://example.invalid/schema" })
  }))

  it.live("invalid session headers fail; changed sessions cannot replace the initialized connection", () => Effect.gen(function* () {
    const f = yield* fixture()
    for (const header of ["has space", "s".repeat(257)]) {
      f.override = (r) => r.body.method === "initialize" ? f.send({ jsonrpc: "2.0", id: r.body.id, result: {
        protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" },
      } }, header) : undefined
      yield* fails(f.transport().listTools(selected), "acquisition_failed", "session header")
    }
    f.override = (r) => r.body.method === "tools/list" ? f.send({ jsonrpc: "2.0", id: r.body.id, result: { tools: [] } }, "foreign-session") : undefined
    yield* fails(f.transport().listTools(selected), "acquisition_failed", "session changed")
    expect(f.requests.find((r) => r.method === "DELETE")?.headers.get("mcp-session-id")).toBe("session-1")
  }))

  it.live("SSE server-request acknowledgements cannot replace session headers or carry response bodies", () => Effect.gen(function* () {
    const f = yield* fixture("sse")
    const transport = f.transport()
    for (const changed of [true, false]) {
      yield* Effect.scoped(Effect.gen(function* () {
        f.traffic = []
        f.override = undefined
        const session = yield* transport.open(selected)
        f.traffic = [{ jsonrpc: "2.0", id: "unsupported", method: "roots/list" }]
        f.override = (r) => r.body.error !== undefined ? new Response(changed ? null : "vendor-private", {
          status: 202, headers: changed ? { "mcp-session-id": "foreign-session" } : {},
        }) : undefined
        yield* fails(session.listTools, "acquisition_failed", changed ? "session changed" : "response acknowledgement")
      }))
    }
    expect(f.requests.filter((r) => r.body.error !== undefined)).toHaveLength(2)
    expect(f.requests.filter((r) => r.method === "DELETE").map((r) => r.headers.get("mcp-session-id"))).toEqual(["session-1", "session-2"])
  }))

  it.live("strict framing rejects malformed JSON, truncated/duplicate SSE and nonempty initialized acknowledgements", () => Effect.gen(function* () {
    const f = yield* fixture()
    for (const entry of [
      { text: "{bad", type: "application/json", reason: "JSON" },
      { text: JSON.stringify({ jsonrpc: "2.0", method: "notifications/message" }), type: "application/json", reason: "response required" },
      { text: "data: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"tools\":[]}}\n", type: "text/event-stream", reason: "disconnected" },
      { text: "data: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"tools\":[]}}\n\n".repeat(2), type: "text/event-stream", reason: "duplicate response" },
      { text: "{}", type: "text/html", reason: "content type" },
    ]) {
      f.override = (r) => r.body.method === "tools/list" ? new Response(entry.text, { headers: { "content-type": entry.type } }) : undefined
      yield* fails(f.transport().listTools(selected), "acquisition_failed", entry.reason)
    }
    f.override = (r) => r.body.method === "notifications/initialized" ? new Response("{}", { status: 202 }) : undefined
    yield* fails(f.transport().listTools(selected), "acquisition_failed", "notification acknowledgement")
  }))

  it.live("SSE completes at the correlated response even when the server keeps the stream open", () => Effect.gen(function* () {
    const f = yield* fixture()
    f.override = (r) => r.body.method === "tools/list" ? new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ jsonrpc: "2.0", id: r.body.id, result: { tools: [tool] } })}\n\n`))
    }, cancel() { f.cancelled++ } }), { headers: { "content-type": "text/event-stream" } }) : undefined
    expect((yield* f.transport({ timeoutMs: 2000 }).listTools(selected)).tools[0]?.name).toBe(tool.name)
    expect(f.requests.filter((r) => r.body.method === "tools/list")).toHaveLength(1)
    expect(f.closed).toBe(1)
  }))

  it.live("initialization interruption releases its partial session and permit inside a long-lived caller scope", () => Effect.gen(function* () {
    const f = yield* fixture()
    const entered = yield* Deferred.make<void>()
    const transport = f.transport({ maxConcurrentSessions: 1 })
    f.override = (r) => {
      if (r.body.id === "initial-ping") {
        expect(r.headers.get("mcp-session-id")).toBe("partial-session")
        Effect.runSync(Deferred.succeed(entered, undefined))
        return new Response(null, { status: 202 })
      }
      if (r.body.method !== "initialize") return undefined
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"jsonrpc":"2.0","id":"initial-ping","method":"ping"}\n\n'))
      } }),
        { headers: { "content-type": "text/event-stream", "mcp-session-id": "partial-session" } })
    }
    const opening = yield* transport.open(selected).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    yield* Fiber.interrupt(opening)
    expect(Exit.hasInterrupts(yield* Fiber.join(opening).pipe(Effect.exit))).toBe(true)
    expect(f.requests.filter((r) => r.body.method === "initialize")).toHaveLength(1)
    f.override = undefined
    yield* transport.listTools(selected)
    expect(f.requests.filter((r) => r.body.method === "initialize")).toHaveLength(2)
    expect(f.closed).toBe(2)
  }))

  it.live("failed opens detach child finalizers from the long-lived parent scope", () => Effect.gen(function* () {
    const f = yield* fixture()
    const transport = f.transport({ maxConcurrentSessions: 1 })
    const parent = yield* Effect.acquireRelease(Scope.make(), (scope, exit) => Scope.close(scope, exit))
    f.version = "unsupported"
    yield* fails(transport.open(selected).pipe(Effect.provideService(Scope.Scope, parent)), "unsupported_operation")
    expect(parent.state._tag === "Open" ? parent.state.finalizers.size : 0).toBe(0)
    f.version = "2025-11-25"
    yield* transport.open(selected).pipe(Effect.provideService(Scope.Scope, parent))
    expect(parent.state._tag === "Open" ? parent.state.finalizers.size : 0).toBe(1)
    yield* Scope.close(parent, Exit.void)
    expect(f.closed).toBe(2)
  }))

  it.live("SSE correlation is exact for initialization and mutation responses, including CR-only frames", () => Effect.gen(function* () {
    const f = yield* fixture("sse")
    f.override = (r) => r.body.method === "initialize" ? f.send({ jsonrpc: "2.0", id: 999, result: {} }) : undefined
    yield* fails(f.transport().listTools(selected), "acquisition_failed", "correlation")
    f.override = undefined
    const session = yield* f.transport().open(selected)
    f.override = (r) => r.body.method === "tools/call" ? new Response(
      `: comment\r\rdata: ${JSON.stringify({ jsonrpc: "2.0", id: String(r.body.id), result })}\r\r`,
      { headers: { "content-type": "text/event-stream" } }) : undefined
    yield* fails(session.callTool("mutate", {}), "acquisition_failed", "correlation")
    expect(f.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(1)
  }))

  it.live("JSON fatal UTF-8, notification envelope bytes and stateless sessions use strict protocol paths", () => Effect.gen(function* () {
    const f = yield* fixture()
    f.override = (r) => r.body.method === "tools/list" ? new Response(new Uint8Array([255]), { headers: { "content-type": "application/json" } }) : undefined
    yield* fails(f.transport().listTools(selected), "acquisition_failed", "UTF-8")
    f.override = (r) => r.body.method === "notifications/initialized" ? new Response("{".repeat(1024), { status: 202 }) : undefined
    yield* fails(f.transport({ maxCatalogBytes: 512 }).listTools(selected), "quota_exceeded", "response bytes")
    f.override = (r) => r.body.method === "initialize" ? f.send({ jsonrpc: "2.0", id: r.body.id, result: {
      protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "stateless", version: "1" },
    } }) : undefined
    const before = f.requests.length
    yield* f.transport().listTools(selected)
    expect(f.requests.slice(before).every((r) => r.headers.get("mcp-session-id") === null)).toBe(true)
    expect(f.requests.slice(before).some((r) => r.method === "DELETE")).toBe(false)
  }))

  it.live("default four-session ceiling blocks a fifth open until a scope closes", () => Effect.gen(function* () {
    const f = yield* fixture()
    const transport = f.transport()
    const scopes = yield* Effect.forEach([1, 2, 3, 4], () => Effect.acquireRelease(Scope.make(), (scope, exit) => Scope.close(scope, exit)))
    yield* Effect.forEach(scopes, (scope) => transport.open(selected).pipe(Effect.provideService(Scope.Scope, scope)), { concurrency: 4 })
    const fifth = yield* transport.listTools(selected).pipe(Effect.forkChild)
    yield* Effect.sleep(20)
    expect(f.initializeCount).toBe(4)
    const first = scopes[0]
    if (!first) throw new Error("Expected scope")
    yield* Scope.close(first, Exit.void)
    yield* Fiber.join(fifth)
    expect(f.initializeCount).toBe(5)
    yield* Effect.forEach(scopes, (scope) => Scope.close(scope, Exit.void))
    expect(f.closed).toBe(5)
  }))

  it.live("closing a session scope aborts an active external call and frees its permit without reposting", () => Effect.gen(function* () {
    const f = yield* fixture()
    const entered = yield* Deferred.make<void>()
    const transport = f.transport({ maxConcurrentSessions: 1 })
    const scope = yield* Effect.acquireRelease(Scope.make(), (scope, exit) => Scope.close(scope, exit))
    const session = yield* transport.open(selected).pipe(Effect.provideService(Scope.Scope, scope))
    f.override = (r) => {
      if (r.body.method !== "tools/call") return undefined
      Effect.runSync(Deferred.succeed(entered, undefined))
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(": active\n\n")) } }),
        { headers: { "content-type": "text/event-stream" } })
    }
    const call = yield* session.callTool("mutate", {}).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    yield* Scope.close(scope, Exit.void)
    yield* fails(Fiber.join(call), "acquisition_failed")
    expect(f.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(1)
    f.override = undefined
    yield* transport.listTools(selected)
    expect(f.closed).toBe(2)
  }))

  it.live("rejects invalid positive bounds and non-exact localhost fixture origins", () => Effect.sync(() => {
    for (const options of [{ maxPages: 0 }, { maxTools: -1 }, { timeoutMs: NaN }, { maxConcurrentSessions: 1.5 },
      { fixtureOrigin: "http://127.0.0.1:1234/" }, { fixtureOrigin: "http://user@localhost:1234" },
      { fixtureOrigin: "https://localhost:1234" }, { fixtureOrigin: "http://example.com" }, { fixtureOrigin: "http://localhost:1234?x" }]) {
      expect(() => CapabilityMcp.make(options)).toThrow("Invalid MCP transport options")
    }
  }))
})
