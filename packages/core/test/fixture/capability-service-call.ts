export * as CapabilityServiceCallFixture from "./capability-service-call"

import { expect } from "bun:test"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { CapabilityChildren } from "@orchestra/core/capability/children"
import { CapabilityDiscovery } from "@orchestra/core/capability/catalog/discovery"
import { CapabilityConnections } from "@orchestra/core/capability/connection/index"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityJobs } from "@orchestra/core/capability/job/index"
import { CapabilityMcp } from "@orchestra/core/capability/mcp/index"
import { CapabilityServiceExecution } from "@orchestra/core/capability/service/execute"
import { CapabilityServiceSchema } from "@orchestra/core/capability/service/schema"
import { CapabilityArtifactTable, CapabilityJobTable } from "@orchestra/core/capability/sql"
import { Credential } from "@orchestra/core/credential"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionEvent } from "@orchestra/core/session/event"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Deferred, Effect, Layer, Schema } from "effect"
import { sql } from "drizzle-orm"
import { CapabilityChildrenFixture } from "./capability-children"
import { CapabilityPolicyFixture } from "./capability-policy"

export const layer = Credential.layerFrom(undefined).pipe(Layer.provideMerge(CapabilityChildrenFixture.layer))
export const rules: PermissionV2.Ruleset = [{ action: "*", resource: "*", effect: "allow" }]
export const secret = "selected-service-key"
export const inputSchema: Schema.Json = { type: "object", properties: {
  account: { type: "string" }, zero: { type: "number" }, flag: { type: "boolean" }, nil: { type: "null" }, value: { type: "string" },
}, required: ["account", "zero", "flag", "nil", "value"], additionalProperties: false }
export const outputSchema: Schema.Json = { type: "object", properties: {
  changed: { type: "boolean" }, value: { type: "string" },
}, required: ["changed"], additionalProperties: true }
type Request = { body: Schema.JsonObject; headers: Headers; method: string }
export type State = {
  mode: "json" | "sse"; tools: Schema.Json[]; result: Schema.Json; time: number; excluded: boolean
  lists: number; calls: Request[]; requests: Request[]; release?: () => void
  beforeList?: (number: number) => void; beforeCall?: () => void
  response: "normal" | "loss" | "hold"; called: Deferred.Deferred<void>; supplied?: CapabilityServiceSchema.CallInput
  context?: Tool.Context; provider?: string
  errors: (Capability.Failure | CapabilityArtifacts.Failure)[]
}

export const fixture = (options: { rootName?: string; resource?: Schema.Json; oauth?: boolean; timeout?: number;
  tool?: Schema.JsonObject } = {}) =>
  Effect.gen(function* () {
    const rootName = options.rootName ?? "platform_cloudflare"
    const f = yield* CapabilityPolicyFixture.fixture({ name: rootName })
    yield* CapabilityPolicyFixture.setRules(rules)
    const binding = { ...f.binding, rootToolName: rootName, effectiveRules: rules }
    yield* f.events.publish(SessionEvent.Tool.Called, { sessionID: f.context.sessionID,
      assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID, tool: rootName, input: {},
      timestamp: CapabilityPolicyFixture.timestamp, provider: { executed: false } })
    const called = yield* Deferred.make<void>()
    const state: State = { mode: "json", tools: [options.tool ?? { name: "mutate", description: "Selected mutation", inputSchema, outputSchema }],
      result: { content: [{ type: "text", text: "done" }], structuredContent: { changed: true } },
      time: 1000, excluded: false, lists: 0, calls: [], requests: [], response: "normal", called, errors: [] }
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
      async fetch(request) {
        const body = request.method === "DELETE" ? {} : Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(await request.json())
        const recorded = { body, headers: request.headers, method: request.method }
        state.requests.push(recorded)
        const send = (result: Schema.Json, session?: string) => {
          const envelope = JSON.stringify({ jsonrpc: "2.0", id: body.id, result })
          return new Response(state.mode === "json" ? envelope : `: prime\r\n\r\ndata: ${envelope}\r\n\r\n`, { headers: {
            "content-type": state.mode === "json" ? "application/json" : "text/event-stream",
            ...(session ? { "mcp-session-id": session } : {}),
          } })
        }
        if (request.method === "DELETE") return new Response(null, { status: 204 })
        if (body.method === "initialize") return send({ protocolVersion: "2025-11-25", capabilities: { tools: {} },
          serverInfo: { name: "fixture", version: "1" } }, `private-session-${state.requests.length}`)
        if (body.method === "notifications/initialized") return new Response(null, { status: 202 })
        if (body.method === "tools/list") { state.lists++; state.beforeList?.(state.lists); return send({ tools: state.tools }) }
        if (body.method !== "tools/call") return new Response(null, { status: 400 })
        state.calls.push(recorded)
        state.beforeCall?.()
        if (state.response !== "hold") {
          const response = state.response === "loss" ? new Response("lost", { status: 503 }) : send(state.result)
          Deferred.doneUnsafe(called, Effect.void)
          return response
        }
        const closed = { value: false }
        const response = new Response(new ReadableStream<Uint8Array>({ start(controller) {
          controller.enqueue(new TextEncoder().encode(": waiting\n\n"))
          state.release = () => {
            if (closed.value) return
            closed.value = true
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: state.result })}\n\n`))
            controller.close()
          }
        }, cancel() { closed.value = true } }), { headers: { "content-type": "text/event-stream" } })
        Deferred.doneUnsafe(called, Effect.void)
        return response
      },
    })), (server) => Effect.promise(() => { state.release?.(); return server.stop(true) }))
    const credentials = yield* Credential.Service
    const integrationID = Integration.ID.make("service-fixture")
    const selected = yield* credentials.create({ integrationID, value: options.oauth ? {
      type: "oauth", methodID: Integration.MethodID.make("oauth"), access: secret, refresh: "selected-refresh-secret", expires: Date.now() + 60000,
    } : { type: "key", key: secret } })
    yield* credentials.create({ integrationID, value: { type: "key", key: "newer-unselected-key" } })
    const connections = yield* CapabilityConnections.make
    const connection = yield* connections.create({ provider: "cloudflare", integrationID, credentialID: selected.id,
      subjectID: "authenticated-account", endpoint: "https://mcp.cloudflare.com/mcp?codemode=false", scopeHash: "a".repeat(64) })
    const target = yield* connections.createTarget(connection, { environment: "fixture",
      resource: options.resource ?? { arguments: { account: "bound-account", zero: 0, flag: false, nil: null } } })
    yield* connections.bind({ target, sessionID: f.context.sessionID, agentID: f.context.agent,
      actions: ["service_discover", "service_call"] })
    const transport = CapabilityMcp.make({ fixtureOrigin: server.url.origin, timeoutMs: options.timeout ?? 2000 })
    const filterCatalog = (_: string, list: CapabilityDiscovery.VendorList): CapabilityDiscovery.VendorList => ({ ...list,
      tools: state.excluded ? list.tools.filter((tool) => tool.name !== "mutate") : list.tools })
    const discovery = yield* CapabilityDiscovery.make({ source: { listTools: (selection) => transport.listTools(selection).pipe(
      Effect.map((list) => filterCatalog(selection.connection.provider, list))) }, now: () => state.time })
    const jobs = yield* CapabilityJobs.make
    const artifacts = yield* CapabilityArtifacts.make()
    const execute = yield* CapabilityServiceExecution.make({ transport, discovery, connections, jobs, artifacts, filterCatalog })
    const registry = yield* ToolRegistry.Service
    const platform = Tool.make({ description: "Actual canonical platform fixture", input: CapabilityServiceSchema.CallInput,
      output: CapabilityServiceSchema.CallOutput,
      execute: (input, context) => execute(state.provider ?? "cloudflare", state.supplied ?? input, state.context ?? context)
        .pipe(Effect.mapError((error) => { state.errors.push(error); return new Tool.Failure({ message: "Service denied", error }) })),
    })
    yield* registry.register({ platform_cloudflare: platform })
    const materialization = yield* registry.materialize(undefined, { advertisedNames: [] })
    const children = yield* CapabilityChildren.make
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>, host = binding) => CapabilityInvocation.withContext(host, effect)
    const page = yield* run(discovery.find(f.context, { provider: "cloudflare", query: "", connectionID: connection.id, targetID: target.id }, materialization))
    const descriptor = page.operations[0]?.ref
    if (!descriptor) return yield* Effect.die("Actual MCP discovery did not issue descriptor")
    const input = { descriptor, input: { value: "requested" } }
    const call = (supplied: CapabilityServiceSchema.CallInput = input, host = binding) => run(materialization.settle({
      sessionID: f.context.sessionID, agent: f.context.agent, assistantMessageID: f.context.assistantMessageID,
      call: { type: "tool-call", id: f.context.toolCallID, name: "platform_cloudflare", input: supplied },
    }), host)
    const output = (settlement: ToolRegistry.Settlement) => {
      expect(settlement.result.type).not.toBe("error")
      return Schema.decodeUnknownSync(CapabilityServiceSchema.CallOutput)(settlement.output?.structured)
    }
    const rows = () => f.database.db.select().from(CapabilityJobTable)
      .where(sql`json_extract(${CapabilityJobTable.owner}, '$.sessionID') = ${f.context.sessionID}`).all().pipe(Effect.orDie)
    const artifactRows = () => f.database.db.select().from(CapabilityArtifactTable)
      .where(sql`json_extract(${CapabilityArtifactTable.owner}, '$.sessionID') = ${f.context.sessionID}`).all().pipe(Effect.orDie)
    return { ...f, binding, state, credentials, selected, connections, connection, target, jobs, artifacts, discovery,
      execute, platform, registry, materialization, children, descriptor, input, call, run, output, rows, artifactRows }
  })
