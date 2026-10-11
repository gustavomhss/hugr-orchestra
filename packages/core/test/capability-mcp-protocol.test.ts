import { describe, expect } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { Credential } from "@orchestra/schema/credential"
import { Effect, Schema } from "effect"
import { it } from "./lib/effect"
import { token, endpoint, owner, selected, tool, result, fixture, connection, fails } from "./fixture/capability-mcp"

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
      { jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: 1.25, progress: 0, total: 2, message: "working" } },
      { jsonrpc: "2.0", method: "notifications/message", params: { level: "info", logger: "fixture", data: null, _meta: {} } },
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
      yield* fails(session.callTool("mutate", {}), "outcome_unknown", value === null ? "result envelope" : "call result")
    }))
  }

  it.live("preserves tool execution errors, structured results and all MCP content kinds", () => Effect.gen(function* () {
    const f = yield* fixture()
    const content: Schema.Json[] = [{ type: "text", text: "failed", annotations: { audience: ["user", "assistant"], priority: 0.7,
      lastModified: "2025-01-12T15:00:58Z" }, _meta: { "fixture/opaque": [1, true] } }, { type: "image", data: "AA==", mimeType: "image/png" },
      { type: "audio", data: "AA==", mimeType: "audio/wav" }, { type: "resource_link", name: "file", uri: "file:///fixture" },
      { type: "resource", resource: { uri: "file:///fixture", text: "text" } },
      { type: "resource", resource: { uri: "file:///blob", blob: "AA==", mimeType: "application/octet-stream", _meta: {} } },
      { type: "resource", resource: { uri: "file:///both", text: "text", blob: "AA==" } },
      { type: "resource", resource: { uri: "file:///extension", text: "text", blob: 7 } },
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
        yield* fails(session.callTool("mutate", {}), "outcome_unknown", "call result")
      }))
    }
    f.override = (r) => r.body.method === "tools/call" ? f.send({ jsonrpc: "2.0", id: r.body.id,
      result: { content: [], _meta: "bad" } }) : undefined
    const session = yield* f.transport().open(selected)
    yield* fails(session.callTool("mutate", {}), "outcome_unknown", "result envelope")
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
      connection: { ...selected.connection, id: Capability.ConnectionID.create() },
      endpoint: "https://mcp.cloudflare.com/approved/mcp?account=two&codemode=false" }
    const second = yield* transport.open({ ...other, target: { ...other.target, connectionID: other.connection.id } })
    yield* first.callTool("mutate", {})
    yield* second.callTool("mutate", {})
    const calls = f.requests.filter((r) => r.body.method === "tools/call")
    expect(calls.map((r) => [r.headers.get("authorization"), r.headers.get("mcp-session-id"), r.url])).toEqual([
      [`Bearer ${token}`, "session-1", f.origin + "/approved/mcp?account=one&codemode=false"],
      ["Bearer fixture-second-secret", "session-2", f.origin + "/approved/mcp?account=two&codemode=false"],
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

})
