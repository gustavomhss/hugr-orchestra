import { describe, expect } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { CapabilityMcp } from "../src/capability/mcp/index"
import { close, request } from "../src/capability/mcp/http"
import { encode } from "../src/capability/mcp/protocol"
import { Deferred, Effect, Exit, Fiber, Schema, Scope } from "effect"
import { it } from "./lib/effect"
import { selected, tool, result, fixture, connection, fails } from "./fixture/capability-mcp"

describe("native MCP Streamable HTTP", () => {
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
    yield* fails(Fiber.join(call), "outcome_unknown")
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

  it.live("committed mutations with 5xx, malformed JSON, wrong correlation or body loss report unknown without repost", () => Effect.gen(function* () {
    const f = yield* fixture()
    for (const loss of ["5xx", "JSON", "correlation", "body"] as const) {
      f.override = (r) => {
        if (r.body.method !== "tools/call") return undefined
        f.commits++
        if (loss === "5xx") return new Response("vendor-private", { status: 503 })
        if (loss === "JSON") return new Response("{bad", { headers: { "content-type": "application/json" } })
        if (loss === "correlation") return f.send({ jsonrpc: "2.0", id: 999, result })
        return new Response(new ReadableStream({ start(controller) {
          controller.enqueue(new TextEncoder().encode('{"jsonrpc":"2.0","id":'))
          controller.close()
        } }), { headers: { "content-type": "application/json" } })
      }
      const session = yield* f.transport().open(selected)
      yield* fails(session.callTool("mutate", {}), "outcome_unknown")
      yield* fails(session.callTool("mutate", {}), "connection_unavailable")
    }
    expect(f.commits).toBe(4)
    expect(f.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(4)
    f.override = (r) => r.body.method === "tools/call" ? new Response(null, { status: 401 }) : undefined
    const session = yield* f.transport().open(selected)
    yield* fails(session.callTool("mutate", {}), "authentication_required")
    expect(f.commits).toBe(4)
    f.override = (r) => r.body.method === "tools/call" ? f.send({ jsonrpc: "2.0", id: r.body.id,
      error: { code: -32602, message: "vendor-private" } }) : undefined
    const rejected = yield* f.transport().open(selected)
    yield* fails(rejected.callTool("mutate", {}), "acquisition_failed", "remote error")
  }))

  it.live("queued call arguments snapshot per execution, before serial wait; inert toJSON survives", () => Effect.gen(function* () {
    const f = yield* fixture()
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
    f.override = async (r) => {
      if (r.body.method !== "tools/call" || !r.body.params || typeof r.body.params !== "object" ||
        !("arguments" in r.body.params) || JSON.stringify(r.body.params.arguments) !== '{"hold":true}') return undefined
      Effect.runSync(Deferred.succeed(entered, undefined))
      await Effect.runPromise(Deferred.await(release))
      return f.send({ jsonrpc: "2.0", id: r.body.id, result })
    }
    const session = yield* f.transport().open(selected)
    const held = yield* session.callTool("mutate", { hold: true }).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const input = { nested: { value: "construction" }, toJSON: "data" }
    const operation = session.callTool("mutate", input)
    input.nested.value = "first execution"
    const queued = yield* operation.pipe(Effect.forkChild)
    yield* Effect.sleep(20)
    expect(f.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(1)
    input.nested.value = "changed while queued"
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(held)
    yield* Fiber.join(queued)
    input.nested.value = "second execution"
    yield* operation
    expect(f.requests.filter((r) => r.body.method === "tools/call").slice(1).map((r) => r.body.params)).toEqual([
      { name: "mutate", arguments: { nested: { value: "first execution" }, toJSON: "data" } },
      { name: "mutate", arguments: { nested: { value: "second execution" }, toJSON: "data" } },
    ])
    expect(f.closed).toBe(0)
    expect(encode({ toJSON: "data" }, 100)).toBe('{"toJSON":"data"}')
  }))

  it.live("native connection loss after server commit stays outcome_unknown and never reposts", () => Effect.gen(function* () {
    const f = yield* fixture()
    const session = yield* f.transport().open(selected)
    f.override = (r) => {
      if (r.body.method !== "tools/call") return undefined
      f.commits++
      void f.disconnect() // End only this loopback fixture, after committing, before returning a response.
      return new Response(null, { status: 202 })
    }
    yield* fails(session.callTool("mutate", {}), "outcome_unknown")
    yield* fails(session.callTool("mutate", {}), "connection_unavailable")
    expect(f.commits).toBe(1)
    expect(f.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(1)
  }))

  it.live("callable serializers and accessors never execute; prevalidation leaves the healthy session usable", () => Effect.gen(function* () {
    const f = yield* fixture()
    const session = yield* f.transport().open(selected)
    const state = { executions: 0 }
    for (const descriptor of [
      { value: () => { state.executions++; return {} } },
      { get: () => { state.executions++; return "data" } },
    ]) {
      const input = Object.defineProperty({}, "toJSON", descriptor)
      expect(() => encode(input, 100)).toThrow(Capability.Failure)
      yield* fails(session.callTool("mutate", input), "unsupported_operation", "serializer")
    }
    const input = Object.defineProperty({}, "value", { enumerable: true, get: () => { state.executions++; return "data" } })
    yield* fails(session.callTool("mutate", input), "unsupported_operation", "property")
    expect(state.executions).toBe(0)
    expect(f.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(0)
    expect(f.closed).toBe(0)
    yield* session.callTool("mutate", { valid: true })
    expect(f.commits).toBe(1)
  }))

  it.live("a timed-out session closes and detaches before failure returns, freeing permits in a live parent scope", () => Effect.gen(function* () {
    const f = yield* fixture()
    const transport = f.transport({ timeoutMs: 1000, maxConcurrentSessions: 1 })
    const parent = yield* Effect.acquireRelease(Scope.make(), (scope, exit) => Scope.close(scope, exit))
    const session = yield* transport.open(selected).pipe(Effect.provideService(Scope.Scope, parent))
    expect(parent.state._tag === "Open" ? parent.state.finalizers.size : 0).toBe(1)
    f.override = (r) => r.body.method === "tools/call" ? new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(": pending\n\n"))
    } }), { headers: { "content-type": "text/event-stream" } }) : undefined
    yield* fails(session.callTool("mutate", {}), "outcome_unknown", "timeout")
    expect(f.closed).toBe(1)
    expect(parent.state._tag === "Open" ? parent.state.finalizers.size : 0).toBe(0)
    f.override = undefined
    const healthy = yield* transport.open(selected).pipe(Effect.provideService(Scope.Scope, parent))
    yield* healthy.callTool("mutate", {})
    expect(f.closed).toBe(1)
    expect(parent.state._tag === "Open" ? parent.state.finalizers.size : 0).toBe(1)
    yield* Scope.close(parent, Exit.void)
    expect(f.closed).toBe(2)
  }))

  it.live("object-form schemas require MCP root and standard field shapes; task-required tools fail discovery", () => Effect.gen(function* () {
    const f = yield* fixture()
    const schemas: Schema.Json[] = [{}, { type: "array" }, { type: "object", $schema: 7 }, { type: "object", properties: 7 },
      { type: "object", required: "value" }, { type: "object", required: [7] }]
    for (const schema of schemas) {
      f.tools = [{ ...tool, inputSchema: schema }]
      yield* fails(f.transport().listTools(selected), "acquisition_failed", "tool entry")
    }
    f.tools = [{ ...tool, outputSchema: { type: "array" } }]
    yield* fails(f.transport().listTools(selected), "acquisition_failed", "tool entry")
    f.override = (r) => r.body.method === "initialize" ? f.send({ jsonrpc: "2.0", id: r.body.id, result: {
      protocolVersion: "2025-11-25", serverInfo: { name: "tasks", version: "1" },
      capabilities: { tools: {}, tasks: { requests: { tools: { call: {} } } } },
    } }, "tasks-session") : undefined
    const transport = f.transport()
    f.tools = [{ ...tool, execution: { taskSupport: "forbidden" } }]
    const ordinary = yield* transport.listTools(selected)
    f.tools = [{ ...tool, execution: { taskSupport: "optional" } }]
    const optional = yield* transport.listTools(selected)
    expect(optional.catalogGeneration).toBeGreaterThan(ordinary.catalogGeneration)
    yield* Effect.scoped(Effect.gen(function* () {
      const session = yield* transport.open(selected)
      yield* session.callTool("mutate", {})
      expect(f.requests.find((r) => r.body.method === "tools/call")?.body.params).toEqual({ name: "mutate", arguments: {} })
    }))
    f.tools = [{ ...tool, execution: { taskSupport: "required" } }]
    yield* fails(transport.listTools(selected), "unsupported_operation", "task-required tool")
    f.tools = [{ ...tool, execution: { taskSupport: ["optional"] } }]
    yield* fails(transport.listTools(selected), "acquisition_failed", "tool entry")
    expect(f.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(1)
  }))

  it.live("known server traffic rejects malformed params without acknowledging bad ping or accepting bad notifications", () => Effect.gen(function* () {
    const f = yield* fixture("sse")
    const malformed: Schema.Json[] = [
      { jsonrpc: "2.0", id: "bad-ping", method: "ping", params: { _meta: "bad" } },
      { jsonrpc: "2.0", id: "bad-ping", method: "ping", params: [] },
      { jsonrpc: "2.0", id: "bad-ping", method: "ping", params: { _meta: { progressToken: {} } } },
      { jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: [], progress: 0 } },
      { jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: "x" } },
      { jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: 0, progress: 1, total: "2" } },
      { jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: 0, progress: 1, message: 2 } },
      { jsonrpc: "2.0", method: "notifications/message" },
      { jsonrpc: "2.0", method: "notifications/message", params: { level: "verbose", data: "bad" } },
      { jsonrpc: "2.0", method: "notifications/message", params: { level: "info", logger: 3, data: null } },
      { jsonrpc: "2.0", id: "bad-notification", method: "notifications/tools/list_changed", params: {} },
      { jsonrpc: "2.0", method: "notifications/tools/list_changed", params: { _meta: [] } },
    ]
    for (const traffic of malformed) {
      f.traffic = []
      const session = yield* f.transport().open(selected)
      f.traffic = [traffic]
      yield* fails(session.listTools, "acquisition_failed")
    }
    expect(f.requests.some((r) => r.body.id === "bad-ping")).toBe(false)
    f.traffic = []
    const session = yield* f.transport().open(selected)
    f.traffic = [{ jsonrpc: "2.0", method: "notifications/tools/list_changed", params: { _meta: { opaque: [1] } } },
      { jsonrpc: "2.0", method: "notifications/tools/list_changed", params: { tools: [], vendorExtension: true } },
      { jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: "x", progress: 0.5 } },
      { jsonrpc: "2.0", method: "notifications/message", params: { level: "debug", data: [1, null] } },
      { jsonrpc: "2.0", id: "valid-ping", method: "ping", params: { _meta: { progressToken: 0 } } }]
    yield* session.listTools
    expect(f.requests.find((r) => r.body.id === "valid-ping")?.body.result).toEqual({})
  }))

  it.live("HTTP interruption joins native reader finally before returning and before DELETE", () => Effect.gen(function* () {
    const f = yield* fixture()
    const c = connection(f)
    const entered = yield* Deferred.make<void>()
    f.override = (r) => {
      if (r.body.method === "initialize") return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"jsonrpc":"2.0","id":"reader-ping","method":"ping"}\n\n'))
      } }), { headers: { "content-type": "text/event-stream", "mcp-session-id": "reader-session" } })
      if (r.body.id === "reader-ping") { Effect.runSync(Deferred.succeed(entered, undefined)); return new Response(null, { status: 202 }) }
      if (r.method === "DELETE") expect(c.tasks.size).toBe(1) // Only DELETE's own tracked task remains.
      return undefined
    }
    const fiber = yield* request(c, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, 1,
      { bytes: 0, limit: 4096, messages: 0 }, { requestBytes: 4096, maxMessages: 10 }).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    expect(c.tasks.size).toBe(1)
    yield* Fiber.interrupt(fiber)
    expect(Exit.hasInterrupts(yield* Fiber.join(fiber).pipe(Effect.exit))).toBe(true)
    expect(c.tasks.size).toBe(0)
    yield* close(c, { requestBytes: 4096, maxMessages: 10 }, 1000)
    expect(f.requests.find((r) => r.method === "DELETE")?.headers.get("mcp-session-id")).toBe("reader-session")
    expect(c.tasks.size).toBe(0)
  }))

  it.live("close waits pending async cleanup before late session-ID inspection, DELETE and scoped permit release", () => Effect.gen(function* () {
    const f = yield* fixture()
    const c = connection(f)
    const cleanup = Promise.withResolvers<void>()
    const events: string[] = []
    // Controlled pending JS-finally boundary; network requests below still use native fetch.
    const settled = cleanup.promise.then(() => { c.sessionID = "late-session"; c.tasks.delete(settled); events.push("cleanup") })
    c.tasks.add(settled)
    const scope = yield* Effect.acquireRelease(Scope.make(), (scope, exit) => Scope.close(scope, exit))
    yield* Scope.addFinalizer(scope, Effect.sync(() => { events.push("release") }))
    yield* Scope.addFinalizer(scope, close(c, { requestBytes: 4096, maxMessages: 10 }, 1000))
    f.override = (r) => {
      if (r.method === "DELETE") { expect(c.tasks.has(settled)).toBe(false); events.push("DELETE") }
      return undefined
    }
    const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild)
    yield* Effect.addFinalizer(() => Effect.sync(() => cleanup.resolve()))
    yield* Effect.sleep(20)
    expect(c.closed).toBe(true)
    expect(events).toEqual([])
    cleanup.resolve()
    yield* Fiber.join(closing)
    expect(events).toEqual(["cleanup", "DELETE", "release"])
    expect(f.requests[0]?.headers.get("mcp-session-id")).toBe("late-session")
  }))

  it.live("initialization response races scope close without late header capture or pending reader tasks", () => Effect.gen(function* () {
    const f = yield* fixture()
    const c = connection(f)
    const entered = yield* Deferred.make<void>()
    const response = Promise.withResolvers<Response>()
    f.override = (r) => {
      if (r.body.method !== "initialize") return undefined
      Effect.runSync(Deferred.succeed(entered, undefined))
      return response.promise
    }
    const opening = yield* request(c, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, 1,
      { bytes: 0, limit: 4096, messages: 0 }, { requestBytes: 4096, maxMessages: 10 }).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    expect(c.tasks.size).toBe(1)
    response.resolve(new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(": initialization pending\n\n"))
    } }), { headers: { "content-type": "text/event-stream", "mcp-session-id": "racing-session" } }))
    yield* close(c, { requestBytes: 4096, maxMessages: 10 }, 1000)
    expect(Exit.isFailure(yield* Fiber.join(opening).pipe(Effect.exit))).toBe(true)
    expect(c.tasks.size).toBe(0)
    const captured = c.sessionID
    yield* Effect.sleep(20)
    expect(c.sessionID).toBe(captured)
    expect(f.requests.filter((r) => r.method === "DELETE")).toHaveLength(captured === undefined ? 0 : 1)
  }))

  it.live("list-changed notification extensions stay valid through real SSE discovery", () => Effect.gen(function* () {
    const f = yield* fixture("sse")
    const session = yield* f.transport().open(selected)
    f.traffic = [{ jsonrpc: "2.0", method: "notifications/tools/list_changed", params: { vendorExtension: true } },
      { jsonrpc: "2.0", method: "notifications/tools/list_changed", params: { tools: [], _meta: { vendor: "opaque" } } }]
    expect((yield* session.listTools).tools[0]?.inputSchema).toEqual(tool.inputSchema)
    expect(f.closed).toBe(0)
  }))

  it.live("input and output property-map values reject malformed wire shapes, preserve schema objects and boolean extensions", () => Effect.gen(function* () {
    const f = yield* fixture()
    for (const field of ["inputSchema", "outputSchema"] as const) {
      for (const value of [7, null, []]) {
        f.tools = [{ ...tool, [field]: { type: "object", properties: { value } } }]
        yield* fails(f.transport().listTools(selected), "acquisition_failed", "tool entry")
      }
    }
    const inputSchema = { type: "object", properties: { value: { type: "string", vendorKeyword: [1, null] }, yes: true, no: false } }
    const outputSchema = { type: "object", properties: { changed: { type: "boolean" }, impossible: false } }
    f.tools = [{ ...tool, inputSchema, outputSchema }]
    const listed = yield* f.transport().listTools(selected)
    expect(listed.tools[0]?.inputSchema).toEqual(inputSchema)
    expect(listed.tools[0]?.outputSchema).toEqual(outputSchema)
  }))

  for (const mode of ["failure", "interrupt-first"] as const) {
    it.live(`joinable disposal ${mode}: second failure and parent close wait for the single held DELETE`, () => Effect.gen(function* () {
      const f = yield* fixture()
      const transport = f.transport({ maxConcurrentSessions: 1 })
      const parent = yield* Effect.acquireRelease(Scope.make(), (scope, exit) => Scope.close(scope, exit))
      const session = yield* transport.open(selected).pipe(Effect.provideService(Scope.Scope, parent))
      const callEntered = yield* Deferred.make<void>()
      const deleteEntered = yield* Deferred.make<void>()
      const secondStarted = yield* Deferred.make<void>()
      const parentStarted = yield* Deferred.make<void>()
      const firstReturned = yield* Deferred.make<boolean>()
      const secondReturned = yield* Deferred.make<boolean>()
      const parentReturned = yield* Deferred.make<boolean>()
      const release = Promise.withResolvers<void>()
      const state = { deleted: false }
      yield* Scope.addFinalizer(parent, Deferred.succeed(parentStarted, undefined))
      f.override = (r) => {
        if (r.body.method === "tools/call") {
          f.commits++
          if (mode === "failure") return new Response(null, { status: 503 })
          return new Response(new ReadableStream({ start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"jsonrpc":"2.0","id":"active-call-ping","method":"ping"}\n\n'))
          } }), { headers: { "content-type": "text/event-stream" } })
        }
        if (r.body.id === "active-call-ping") {
          Effect.runSync(Deferred.succeed(callEntered, undefined))
          return new Response(null, { status: 202 })
        }
        if (r.method !== "DELETE" || r.headers.get("mcp-session-id") !== "session-1") return undefined
        Effect.runSync(Deferred.succeed(deleteEntered, undefined))
        return release.promise.then(() => { state.deleted = true; f.closed++; return new Response(null, { status: 204 }) })
      }
      const first = yield* session.callTool("mutate", {}).pipe(
        Effect.onExit(() => Deferred.succeed(firstReturned, state.deleted)), Effect.forkChild)
      const interrupting = mode === "interrupt-first" ? yield* Effect.gen(function* () {
        yield* Deferred.await(callEntered)
        return yield* Fiber.interrupt(first).pipe(Effect.forkChild)
      }) : undefined
      yield* Deferred.await(deleteEntered)
      const second = yield* Effect.gen(function* () {
        yield* Deferred.succeed(secondStarted, undefined)
        return yield* session.callTool("mutate", {})
      }).pipe(Effect.onExit(() => Deferred.succeed(secondReturned, state.deleted)), Effect.forkChild)
      const closing = yield* Scope.close(parent, Exit.void).pipe(
        Effect.onExit(() => Deferred.succeed(parentReturned, state.deleted)), Effect.forkChild)
      // Registered after the closing fibers so a failed assertion releases DELETE before joining their cleanup.
      yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
      yield* Deferred.await(secondStarted)
      yield* Deferred.await(parentStarted)
      yield* Effect.yieldNow
      yield* Effect.promise(() => Bun.sleep(0)) // Drain already-started native rejection microtasks, not a network delay.
      expect(yield* Deferred.isDone(secondReturned)).toBe(false)
      expect(yield* Deferred.isDone(parentReturned)).toBe(false)
      expect(yield* Deferred.isDone(firstReturned)).toBe(false)
      expect(f.requests.filter((r) => r.method === "DELETE")).toHaveLength(1)
      release.resolve()
      if (interrupting) {
        yield* Fiber.join(interrupting)
        expect(Exit.hasInterrupts(yield* Fiber.join(first).pipe(Effect.exit))).toBe(true)
      }
      if (!interrupting) yield* fails(Fiber.join(first), "outcome_unknown")
      yield* fails(Fiber.join(second), "connection_unavailable")
      yield* Fiber.join(closing)
      expect(yield* Deferred.await(firstReturned)).toBe(true)
      expect(yield* Deferred.await(secondReturned)).toBe(true)
      expect(yield* Deferred.await(parentReturned)).toBe(true)
      expect(f.commits).toBe(1)
      f.override = undefined
      const next = yield* Effect.acquireRelease(Scope.make(), (scope, exit) => Scope.close(scope, exit))
      const healthy = yield* transport.open(selected).pipe(Effect.provideService(Scope.Scope, next))
      yield* healthy.listTools
      expect(next.state._tag === "Open" ? next.state.finalizers.size : 0).toBe(1)
      yield* Scope.close(next, Exit.void)
      yield* Scope.close(next, Exit.void)
      expect(f.requests.filter((r) => r.method === "DELETE")).toHaveLength(2)
      expect(f.closed).toBe(2)
    }), 10000)
  }
})
