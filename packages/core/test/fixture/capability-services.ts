export * as CapabilityServicesFixture from "./capability-services"

import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityDiscovery } from "@orchestra/core/capability/catalog/discovery"
import { CapabilityVendorSchema } from "@orchestra/core/capability/catalog/schema"
import { CapabilityConnections } from "@orchestra/core/capability/connection/index"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityServices } from "@orchestra/core/capability/service/index"
import { CapabilityServiceProviders } from "@orchestra/core/capability/service/providers"
import { CapabilityServiceSchema } from "@orchestra/core/capability/service/schema"
import type { CapabilityServiceContract } from "@orchestra/core/capability/service/contract"
import type { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { CapabilityChildTable } from "@orchestra/core/capability/sql"
import { Config } from "@orchestra/core/config"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionStore } from "@orchestra/core/session/store"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { eq } from "drizzle-orm"
import { Effect, Layer, Ref, Schema } from "effect"
import { join } from "node:path"
import { CapabilityPolicyFixture } from "./capability-policy"
import { tmpdir } from "./tmpdir"

export const layer = Layer.unwrap(Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  return AppNodeBuilder.build(LayerNode.group([
    Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node, AgentV2.node,
    Location.node, PermissionSaved.node, ToolRegistry.nativeNode, Global.node, FSUtil.node, Credential.node,
  ]), [
    [Location.node, Layer.succeed(Location.Service, CapabilityPolicyFixture.placement)],
    [Global.node, Global.layerWith({ data: join(tmp.path, "data"), home: tmp.path })],
    [Credential.node, Credential.layerFrom(undefined)],
    [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ])
}))

export const allow: PermissionV2.Ruleset = [
  { action: "service_discover", resource: "*", effect: "allow" },
  { action: "service_call", resource: "*", effect: "allow" },
]
export const request = { provider: "supabase", query: "", limit: 8 }
export const secret = "service-selected-credential-sentinel"
export const tools: readonly CapabilityDiscovery.VendorTool[] = [
  { name: "list_projects", summary: "List projects", inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "array", items: { type: "string" } } },
  { name: "get_project", summary: "Get project", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "unsupported", summary: "External schema", inputSchema: { $ref: "https://unsupported.test/schema" } },
]
export const output: CapabilityServiceSchema.CallOutput = {
  result: { status: "completed", receipt: "authorized-test-leaf", summary: "Listed", verification: "acknowledged", artifactRefs: [] },
  validation: { input: "validated", output: "validated" }, data: ["project"], redacted: false,
}

export function fixture(options: { name?: string } = {}) {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture(options)
    yield* CapabilityPolicyFixture.setRules(allow)
    const binding = { ...f.binding, rootToolName: options.name ?? "service_call", effectiveRules: allow }
    yield* f.events.publish(SessionEvent.Tool.Called, {
      sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
      callID: f.context.toolCallID, tool: binding.rootToolName, input: {},
      timestamp: CapabilityPolicyFixture.timestamp, provider: { executed: false },
    })
    const registry = yield* ToolRegistry.Service
    const connections = yield* CapabilityConnections.make
    const credentials = yield* Credential.Service
    const integrationID = Integration.ID.make("service-fixture")
    const credential = yield* credentials.create({ integrationID, value: { type: "key", key: secret } })
    const connection = yield* connections.create({ provider: request.provider, integrationID, credentialID: credential.id,
      endpoint: "https://service.example.test/mcp", scopeHash: "a".repeat(64), subjectID: "fixture" })
    const target = yield* connections.createTarget(connection, { environment: "test", resource: { project: "selected" } })
    yield* connections.bind({ target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: ["service_discover", "service_call"] })
    const calls = yield* Ref.make<CapabilityDiscovery.Selection[]>([])
    const list = yield* Ref.make<CapabilityDiscovery.VendorList>({ tools, catalogGeneration: 1, coverage: "complete", byteLength: 1024 })
    const clock = { time: 1000 }
    const discovery = yield* CapabilityDiscovery.make({ ttlMillis: 100, now: () => clock.time,
      source: { listTools: (selection) => Effect.gen(function* () {
        yield* Ref.update(calls, (calls) => [...calls, selection])
        return CapabilityServiceProviders.filterCatalog(selection.connection.provider, yield* Ref.get(list))
      }) },
    })
    const seen = yield* Ref.make<readonly Readonly<{
      provider: string; context: Tool.Context; binding: CapabilityInvocation.Binding; hook?: string; captured?: ToolRegistry.Materialization
    }>[]>([])
    const response = yield* Ref.make(output)
    const behavior = yield* Ref.make<Effect.Effect<void, Capability.Failure | CapabilityArtifacts.Failure>>(Effect.void)
    // Only execution dependency is a fixture leaf. Discovery, SQL child admission, policy and safety remain real.
    const execute: CapabilityServiceContract.Execute = (provider, input, context) => Effect.gen(function* () {
      const binding = yield* f.policy.binding(context)
      const captured = yield* ToolRegistry.captured
      if (!captured) return yield* new Capability.Failure({ code: "invocation_binding_missing", message: "Missing captured fixture" })
      const description = yield* discovery.describe(context, input.descriptor, captured)
      const validator = yield* CapabilityVendorSchema.compile(description.inputSchema, description.outputSchema)
      if (!validator.validateInput(input.input).valid)
        return yield* new Capability.Failure({ code: "unsupported_schema", message: "Invalid fixture input" })
      const permit = yield* f.policy.authorize(context, { action: "service_call", resources: ["service_call", provider,
        input.descriptor.connectionID, input.descriptor.targetID, `${provider}:${description.name}`] })
      yield* Ref.get(behavior).pipe(Effect.flatten)
      yield* f.policy.commit(permit, () => f.target).pipe(Effect.catchTag("SqlError", Effect.die))
      const hook = yield* ToolSafety.HookedCall
      yield* Ref.update(seen, (seen) => [...seen, { provider, context, binding, hook, captured }])
      return yield* Ref.get(response)
    })
    const services = yield* CapabilityServices.make({ discovery, execute })
    yield* registry.register(services.tools)
    const materialization = yield* registry.materialize(undefined, { advertisedNames: ["service_find", "service_describe", "service_call"] })
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>, host = binding) => CapabilityInvocation.withContext(host, effect)
    const find = (m = materialization) => run(discovery.find(f.context, request, m))
    const locate = (ref: Capability.DescriptorRef, m = materialization) => run(discovery.locate(f.context, ref, m))
    const settle = (name: string, input: Schema.Json, host = binding, m = materialization) => run(m.settle({
      sessionID: f.context.sessionID, agent: f.context.agent, assistantMessageID: f.context.assistantMessageID,
      call: { type: "tool-call", id: f.context.toolCallID, name, input },
    }), host)
    const rows = () => f.database.db.select().from(CapabilityChildTable)
      .where(eq(CapabilityChildTable.session_id, f.context.sessionID)).all().pipe(Effect.orDie)
    return { ...f, binding, registry, connections, credentials, credential, connection, target, calls, list, clock,
      discovery, seen, response, behavior, services, materialization, run, find, locate, settle, rows }
  })
}

export function ref(page: { operations: readonly { ref?: Capability.DescriptorRef }[] }) {
  const value = page.operations[0]?.ref
  if (!value) throw new Error("SERVICE_FIXTURE_DESCRIPTOR_MISSING")
  return value
}
