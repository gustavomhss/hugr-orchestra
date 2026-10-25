import { describe, expect } from "bun:test"
import { close, request } from "../src/capability/mcp/http"
import { encode } from "../src/capability/mcp/protocol"
import { Cause, Deferred, Effect, Exit, Fiber, Scope } from "effect"
import { it } from "./lib/effect"
import { selected, tool, result, fixture, connection, fails } from "./fixture/capability-mcp"

describe("native MCP Streamable HTTP", () => {
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
    yield* fails(session.callTool("mutate", {}), "outcome_unknown", "response bytes")
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
    yield* fails(next.callTool("mutate", {}), "outcome_unknown", "response bytes")
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
    f.traffic = Array.from({ length: 3 }, () => ({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info", data: "bounded" } }))
    yield* fails(f.transport({ maxMessages: 2 }).listTools(selected), "quota_exceeded", "messages")
  }))

  for (const mode of ["disconnect", "timeout", "interrupt"] as const) {
    it.live(`mutation ${mode}: exactly one POST; permits release after scoped cancellation`, () => Effect.gen(function* () {
      const f = yield* fixture()
      const entered = yield* Deferred.make<void>()
      const transport = f.transport({ maxConcurrentSessions: 1, timeoutMs: mode === "timeout" ? 2000 : 10000 })
      f.override = (r) => {
        if (r.body.method !== "tools/call") return undefined
        f.commits++ // The server applied the mutation before losing its response.
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
      if (mode !== "interrupt") yield* fails(operation, "outcome_unknown")
      expect(f.commits).toBe(1)
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
    f.tools = [{ ...tool, inputSchema: { type: "object", externalKeyword: "preserved", $ref: "https://example.invalid/schema" } }]
    expect((yield* f.transport().listTools(selected)).tools[0]?.inputSchema).toEqual({ type: "object", externalKeyword: "preserved", $ref: "https://example.invalid/schema" })
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
      { text: JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info", data: null } }), type: "application/json", reason: "response required" },
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
    yield* fails(session.callTool("mutate", {}), "outcome_unknown", "correlation")
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

})
