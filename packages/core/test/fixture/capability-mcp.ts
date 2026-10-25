import { expect } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { Credential } from "@orchestra/schema/credential"
import { CapabilityMcp } from "../../src/capability/mcp/index"
import { close, request } from "../../src/capability/mcp/http"
import type { Connection } from "../../src/capability/mcp/http"
import { encode } from "../../src/capability/mcp/protocol"
import type { CapabilityDiscovery } from "../../src/capability/catalog/discovery"
import { Effect, Exit, Schema } from "effect"

export const token = "fixture-selected-secret"
export const endpoint = "https://mcp.cloudflare.com/approved/mcp?account=one&codemode=false"
export const owner = Schema.decodeUnknownSync(Capability.Owner)({ projectID: "project-fixture", location: { directory: "/fixture" },
  sessionID: "ses_fixture", agentID: "backend" })
export const base: CapabilityDiscovery.Selection = {
  connection: { id: Capability.ConnectionID.create(), provider: "cloudflare", generation: 1 },
  target: { id: Capability.TargetID.create(), connectionID: Capability.ConnectionID.create(), generation: 2, environment: "fixture" },
  resource: { account: "one", endpoint: "https://untrusted.invalid" }, endpoint, owner,
  credentialID: Credential.ID.create(), credential: { type: "key", key: token, metadata: { authorization: "ignored" } },
}
export const selected = { ...base, target: { ...base.target, connectionID: base.connection.id } }
export const tool = { name: "mutate", description: "Preserve description €", inputSchema: {
  type: "object", properties: { value: { type: "string" } }, additionalProperties: false,
}, outputSchema: { type: "object", properties: { changed: { type: "boolean" } } } } satisfies Schema.JsonObject
export const result = { content: [{ type: "text", text: "done €" }], structuredContent: { changed: true } } satisfies Schema.JsonObject
export type RecordRequest = { method: string; url: string; headers: Headers; body: Schema.JsonObject }
export type Fixture = {
  requests: RecordRequest[]; bytes: number; initializeCount: number; closed: number; cancelled: number; commits: number
  mode: "json" | "sse"; chunks: boolean; version: string; tools: Schema.Json[]; paginate: boolean; traffic: Schema.Json[]
  override?: (request: RecordRequest) => Response | undefined | Promise<Response | undefined>
  origin: string
  transport: (options?: CapabilityMcp.Options) => CapabilityMcp.Interface
  send: (body: unknown, session?: string) => Response
  disconnect: () => Promise<void>
}

/** Real loopback server: requests pass through native fetch, never a mocked transport. */
export function fixture(mode: "json" | "sse" = "json") {
  return Effect.acquireRelease(Effect.sync(() => {
    const state: Fixture = { requests: [], bytes: 0, initializeCount: 0, closed: 0, cancelled: 0, commits: 0,
      mode, chunks: false, version: "2025-11-25", tools: [tool], paginate: false, traffic: [], origin: "",
      transport: (options = {}) => CapabilityMcp.make({ fixtureOrigin: state.origin, ...options }),
      disconnect: () => server.stop(true),
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
      if (body.method === "tools/call") { state.commits++; return state.send({ jsonrpc: "2.0", id: body.id, result }) }
      return new Response(null, { status: 400 })
    } })
    state.origin = server.url.origin
    return { state, server }
  }), (value) => Effect.promise(() => value.server.stop(true))).pipe(Effect.map((value) => value.state))
}

export function connection(f: Fixture): Connection {
  return { endpoint: f.origin + "/approved/mcp?account=one&codemode=false", authorization: `Bearer ${token}`,
    lifetime: new AbortController(), tasks: new Set(), closed: false, dead: false }
}

export function fails<A, R>(effect: Effect.Effect<A, Capability.Failure, R>, code: Capability.ErrorCode, reason?: string) {
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
