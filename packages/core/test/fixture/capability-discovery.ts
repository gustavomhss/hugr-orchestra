import { describe, expect } from "bun:test"
import path from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityDiscovery } from "@orchestra/core/capability/catalog/discovery"
import { CapabilityDescriptors } from "@orchestra/core/capability/catalog/descriptors"
import { CapabilityVendorSchema } from "@orchestra/core/capability/catalog/schema"
import { CapabilityConnections } from "@orchestra/core/capability/connection/index"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { Credential } from "@orchestra/core/credential"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionStore } from "@orchestra/core/session/store"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Layer, Ref, Schema } from "effect"
import { CapabilityPolicyFixture } from "../fixture/capability-policy"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

export const it = testEffect(Layer.unwrap(Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  return AppNodeBuilder.build(LayerNode.group([
    Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node, PermissionSaved.node,
    AgentV2.node, Location.node, Credential.node, ToolRegistry.nativeNode, ApplicationTools.node,
  ]), [
    [Location.node, Layer.succeed(Location.Service, Location.Service.of(CapabilityPolicyFixture.placement))],
    [Credential.node, Credential.layerFrom(undefined)],
    [Global.node, Global.layerWith({ data: path.join(tmp.path, "data"), home: tmp.path })],
    [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ])
})))
export const allow: PermissionV2.Ruleset = [{ action: CapabilityDiscovery.disclosureAction, resource: "*", effect: "allow" }]
export const request = { provider: "example", query: "", limit: 1 }
export const secret = "selected-provider-secret"
export const leaf = () => Tool.make({
  description: "Canonical platform dispatch fixture", input: Schema.Json, output: Schema.Json,
  execute: (input) => Effect.succeed(input),
})
export const tools: CapabilityDiscovery.VendorTool[] = [
  { name: "list_projects", summary: "List projects", inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "array", items: { type: "string" } } },
  { name: "get_project", summary: "Get project", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "create_project", summary: "Create project", inputSchema: { type: "object" } },
]

export function fixture(options: Omit<CapabilityDiscovery.Options, "source"> = {}) {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules(allow)
    const binding = { ...f.binding, effectiveRules: allow }
    const connections = yield* CapabilityConnections.make
    const credentials = yield* Credential.Service
    const registry = yield* ToolRegistry.Service
    const applications = yield* ApplicationTools.Service
    yield* registry.register({ platform_example: leaf() })
    const materialization = yield* registry.materialize(allow, { advertisedNames: [] })
    const integrationID = Integration.ID.make("discovery-test")
    const credential = yield* credentials.create({ integrationID, value: { type: "key", key: secret } })
    const connection = yield* connections.create({ provider: "example", integrationID, credentialID: credential.id,
      endpoint: "https://api.example.test/mcp", scopeHash: "a".repeat(64), subjectID: "selected-subject" })
    const target = yield* connections.createTarget(connection, { environment: "test", resource: { project: "selected" } })
    const bind = { target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: [CapabilityDiscovery.disclosureAction] }
    yield* connections.bind(bind)
    const list = yield* Ref.make<Omit<CapabilityDiscovery.VendorList, "byteLength">>({ tools, catalogGeneration: 1, coverage: "complete" })
    const calls = yield* Ref.make<CapabilityDiscovery.Selection[]>([])
    const transport = yield* Ref.make<Effect.Effect<void, Capability.Failure>>(Effect.void)
    // Deterministic host transport boundary only. Real policy, Connection, root and registry remain live.
    const source: CapabilityDiscovery.CatalogSource = { listTools: (selection) => Effect.gen(function* () {
      yield* Ref.update(calls, (calls) => [...calls, selection])
      yield* Ref.get(transport).pipe(Effect.flatten)
      const value = yield* Ref.get(list)
      return { ...value, byteLength: Buffer.byteLength(JSON.stringify(value)) }
    }) }
    const clock = { time: 1000 }
    const discovery = yield* CapabilityDiscovery.make({ source, now: () => clock.time, ttlMillis: 100, ...options })
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => CapabilityInvocation.withContext(binding, effect)
    const find = (input: CapabilityDiscovery.FindInput = request, m = materialization) => run(discovery.find(f.context, input, m))
    const describe = (ref: Capability.DescriptorRef, m = materialization) => run(discovery.describe(f.context, ref, m))
    return { ...f, binding, connections, credentials, credential, connection, target, bind, registry, applications,
      materialization, list, calls, transport, source, clock, discovery, run, find, describe }
  })
}

export function expectCode<A, R>(effect: Effect.Effect<A, CapabilityConnections.Error, R>, code: Capability.ErrorCode) {
  return Effect.gen(function* () {
    const error = yield* Effect.flip(effect)
    expect(error).toBeInstanceOf(Capability.Failure)
    if (!(error instanceof Capability.Failure)) return yield* Effect.die(error)
    expect(error.code).toBe(code)
    expect(JSON.stringify(error)).not.toContain(secret)
    return error
  })
}

export function ref(page: CapabilityDiscovery.Page) {
  const value = page.operations[0]?.ref
  if (!value) throw new Error("DISCOVERY_DID_NOT_ISSUE_DESCRIPTOR")
  return value
}

export function cursor(page: CapabilityDiscovery.Page) {
  if (!page.cursor) throw new Error("DISCOVERY_DID_NOT_ISSUE_CURSOR")
  return page.cursor
}

export function publicationFixture(options: { maxEntries?: number; storeEntries?: number } = {}) {
  return Effect.gen(function* () {
    const f = yield* fixture()
    const real = yield* CapabilityDescriptors.make({ maxEntries: options.storeEntries ?? 8, ttlMillis: 100, now: () => f.clock.time })
    const batches = yield* Ref.make(0)
    const issued = yield* Ref.make<readonly CapabilityDescriptors.DescriptorRecord[]>([])
    const removed = yield* Ref.make<readonly Capability.DescriptorRef[]>([])
    const afterBatch = yield* Ref.make<Effect.Effect<void>>(Effect.void)
    // Fault scheduling at the host Store boundary; admission/removal/read all use the real shared store.
    const store: CapabilityDescriptors.Store = { ...real,
      issueBatch: (inputs) => Effect.gen(function* () {
        yield* Ref.update(batches, (n) => n + 1)
        const records = yield* real.issueBatch(inputs)
        yield* Ref.update(issued, (previous) => [...previous, ...records])
        yield* Ref.get(afterBatch).pipe(Effect.flatten)
        return records
      }),
      remove: (ref) => real.remove(ref).pipe(Effect.andThen(Ref.update(removed, (previous) => [...previous, ref]))),
    }
    const discovery = yield* CapabilityDiscovery.make({ source: f.source, descriptors: store,
      maxEntries: options.maxEntries ?? 8, now: () => f.clock.time, ttlMillis: 100 })
    const find = (input: CapabilityDiscovery.FindInput = { ...request, limit: 2 }, materialization = f.materialization) =>
      f.run(discovery.find(f.context, input, materialization))
    const canonicalIdentity = f.registry.currentRegistrationIdentity("platform_example")
    if (!canonicalIdentity) return yield* Effect.die("PUBLICATION_CANONICAL_REGISTRATION_MISSING")
    const validator = yield* CapabilityVendorSchema.compile(true)
    const input: CapabilityDescriptors.IssueInput = { owner: f.binding.owner,
      connectionID: f.connection.id, targetID: f.target.id, connectionGeneration: f.connection.generation,
      targetGeneration: f.target.generation, canonicalName: "platform_example", canonicalIdentity,
      inputSchema: true, schemaHash: validator.schemaHash, catalogGeneration: 1, operationID: "unrelated" }
    return { ...f, real, store, discovery, find, batches, issued, removed, afterBatch, input }
  })
}

export function readScope(record: CapabilityDescriptors.DescriptorRecord): CapabilityDescriptors.ReadScope {
  return { owner: record.owner, connectionGeneration: record.connectionGeneration, targetGeneration: record.targetGeneration,
    canonicalIdentity: record.canonicalIdentity, catalogGeneration: record.ref.catalogGeneration, schemaHash: record.ref.schemaHash }
}
