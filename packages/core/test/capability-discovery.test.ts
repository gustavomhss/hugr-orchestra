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
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionStore } from "@orchestra/core/session/store"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { Cause, Deferred, Effect, Fiber, Layer, Ref, Schema, Scope, Tracer } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.unwrap(Effect.gen(function* () {
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
const allow: PermissionV2.Ruleset = [{ action: CapabilityDiscovery.disclosureAction, resource: "*", effect: "allow" }]
const request = { provider: "example", query: "", limit: 1 }
const secret = "selected-provider-secret"
const leaf = () => Tool.make({
  description: "Canonical platform dispatch fixture", input: Schema.Json, output: Schema.Json,
  execute: (input) => Effect.succeed(input),
})
const tools: CapabilityDiscovery.VendorTool[] = [
  { name: "list_projects", summary: "List projects", inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "array", items: { type: "string" } } },
  { name: "get_project", summary: "Get project", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "create_project", summary: "Create project", inputSchema: { type: "object" } },
]

function fixture(options: Omit<CapabilityDiscovery.Options, "source"> = {}) {
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

function expectCode<A, R>(effect: Effect.Effect<A, Capability.Failure, R>, code: Capability.ErrorCode) {
  return effect.pipe(Effect.flip, Effect.map((error) => {
    expect(error).toBeInstanceOf(Capability.Failure)
    expect(error.code).toBe(code)
    expect(JSON.stringify(error)).not.toContain(secret)
    return error
  }))
}

function ref(page: CapabilityDiscovery.Page) {
  const value = page.operations[0]?.ref
  if (!value) throw new Error("DISCOVERY_DID_NOT_ISSUE_DESCRIPTOR")
  return value
}

function cursor(page: CapabilityDiscovery.Page) {
  if (!page.cursor) throw new Error("DISCOVERY_DID_NOT_ISSUE_CURSOR")
  return page.cursor
}

describe("CapabilityDiscovery host metadata backbone", () => {
  it.live("lazy selected acquisition, bounded pages and exact schemas; no account tool registration or secret projection", () => Effect.gen(function* () {
    const f = yield* fixture()
    expect(yield* Ref.get(f.calls)).toEqual([])
    expect(f.materialization.definitions).toEqual([])
    const first = yield* f.find({ ...request, provider: "Example" })
    expect(first.operations.map((operation) => operation.name)).toEqual(["list_projects"])
    expect(first.operations[0]?.readiness).toBe("ready")
    expect(first.coverage).toBe("complete")
    const calls = yield* Ref.get(f.calls)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ connection: f.connection, target: f.target,
      credentialID: f.credential.id, credential: f.credential.value, resource: { project: "selected" } })
    const second = yield* f.find({ ...request, cursor: cursor(first) })
    expect(second.operations.map((operation) => operation.name)).toEqual(["get_project"])
    expect(second.operations[0]?.coverage.output).toBe("unvalidated")
    const third = yield* f.find({ ...request, cursor: cursor(second) })
    expect(third.operations.map((operation) => operation.name)).toEqual(["create_project"])
    expect(third.cursor).toBeUndefined()
    const exact = yield* f.describe(ref(first))
    expect(exact.inputSchema).toEqual(tools[0]?.inputSchema)
    expect(exact.outputSchema).toEqual(tools[0]?.outputSchema)
    expect(exact.ref).toEqual(ref(first))
    const current = yield* f.registry.materialize()
    expect(current.definitions.map((definition) => definition.name)).toEqual(["platform_example"])
    expect(current.registrationIdentity("platform_example")).toBe(f.materialization.registrationIdentity("platform_example"))
    expect(f.applications.entries().size).toBe(0)
    ;[first, second, third, exact].forEach((output) => {
      expect(JSON.stringify(output)).not.toContain(secret)
      expect(JSON.stringify(output)).not.toContain("api.example.test")
      expect(JSON.stringify(output)).not.toContain("canonicalIdentity")
    })
  }))

  it.live("private binding and persisted root required before acquisition; denied operations absent and describe remains denied", () => Effect.gen(function* () {
    const f = yield* fixture()
    const first = yield* f.find()
    const acquired = (yield* Ref.get(f.calls)).length
    yield* expectCode(f.discovery.find(f.context, request, f.materialization), "invocation_binding_missing")
    const invalid = yield* CapabilityPolicyFixture.fixture({ part: false })
    yield* CapabilityPolicyFixture.setRules(allow)
    yield* expectCode(CapabilityInvocation.withContext({ ...invalid.binding, effectiveRules: allow },
      f.discovery.find(invalid.context, request, f.materialization)), "invocation_binding_mismatch")
    expect(yield* Ref.get(f.calls)).toHaveLength(acquired)
    const rules = [...allow, { action: CapabilityDiscovery.disclosureAction, resource: "example:list_projects", effect: "deny" as const }]
    yield* CapabilityPolicyFixture.setRules(rules)
    const filtered = yield* f.find({ ...request, limit: 3 })
    expect(filtered.operations.map((operation) => operation.name)).toEqual(["get_project", "create_project"])
    const after = (yield* Ref.get(f.calls)).length
    yield* expectCode(f.describe(ref(first)), "target_denied")
    expect(yield* Ref.get(f.calls)).toHaveLength(after)
    yield* CapabilityPolicyFixture.setRules([{ action: CapabilityDiscovery.disclosureAction, resource: "*", effect: "deny" }])
    yield* expectCode(f.find(), "target_denied")
    yield* expectCode(f.describe({ ...ref(first), id: Capability.DescriptorID.create() }), "stale_descriptor")
    expect(yield* Ref.get(f.calls)).toHaveLength(after)
  }))

  it.live("cursor rejects altered/query/limit/owner/session/generation/hash drift and expiry; descriptor follows current identity", () => Effect.gen(function* () {
    const f = yield* fixture()
    const first = yield* f.find()
    const next = { ...request, cursor: cursor(first) }
    yield* expectCode(f.find({ ...next, cursor: next.cursor + "x" }), "stale_descriptor")
    yield* expectCode(f.find({ ...next, query: "projects" }), "stale_descriptor")
    yield* expectCode(f.find({ ...next, limit: 2 }), "stale_descriptor")
    yield* Ref.set(f.list, { tools, catalogGeneration: 2, coverage: "complete" })
    yield* expectCode(f.find(next), "stale_descriptor")
    yield* expectCode(f.describe(ref(first)), "stale_descriptor")
    yield* Ref.set(f.list, { tools: [{ ...tools[0], name: "list_projects", summary: "Changed", inputSchema: { type: "string" } }, ...tools.slice(1)],
      catalogGeneration: 1, coverage: "complete" })
    yield* expectCode(f.find(next), "stale_descriptor")
    yield* expectCode(f.describe(ref(first)), "stale_descriptor")
    yield* Ref.set(f.list, { tools, catalogGeneration: 1, coverage: "complete" })
    const other = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules(allow)
    yield* f.connections.bind({ ...f.bind, sessionID: other.context.sessionID })
    yield* expectCode(CapabilityInvocation.withContext({ ...other.binding, effectiveRules: allow },
      f.discovery.find(other.context, next, f.materialization)), "stale_descriptor")
    yield* expectCode(CapabilityInvocation.withContext({ ...other.binding, effectiveRules: allow },
      f.discovery.describe(other.context, ref(first), f.materialization)), "stale_descriptor")
    const actor = AgentV2.ID.make("other")
    yield* CapabilityPolicyFixture.setRules(allow, actor)
    const context = { ...f.context, agent: actor, assistantMessageID: SessionMessage.ID.create() }
    yield* f.events.publish(SessionEvent.Step.Started, { ...context, timestamp: CapabilityPolicyFixture.timestamp,
      model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") } })
    yield* f.events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID,
      assistantMessageID: context.assistantMessageID, callID: context.toolCallID, name: "service_call", timestamp: CapabilityPolicyFixture.timestamp })
    const host = { ...f.binding, owner: { ...f.binding.owner, agentID: actor },
      invocation: { ...f.binding.invocation, agentID: actor, assistantMessageID: context.assistantMessageID } }
    yield* f.connections.bind({ ...f.bind, agentID: actor })
    yield* expectCode(CapabilityInvocation.withContext(host,
      f.discovery.find(context, next, f.materialization)), "stale_descriptor")
    yield* f.registry.register({ platform_example: leaf() })
    const fresh = yield* f.registry.materialize(allow)
    expect(fresh.definition("platform_example")).toEqual(f.materialization.definition("platform_example"))
    expect(fresh.registrationIdentity("platform_example")).not.toBe(f.materialization.registrationIdentity("platform_example"))
    yield* expectCode(f.find(next), "stale_descriptor")
    yield* expectCode(f.describe(ref(first), fresh), "stale_descriptor")
    yield* expectCode(f.find(next, fresh), "stale_descriptor")
    const live = yield* f.find(request, fresh)
    f.clock.time += 100
    yield* expectCode(f.find({ ...request, cursor: cursor(live) }, fresh), "stale_descriptor")
    yield* expectCode(f.describe(ref(live), fresh), "stale_descriptor")
  }))

  it.live("explicit target/connection selection and retarget generation are authority; preset provider names grant nothing", () => Effect.gen(function* () {
    const f = yield* fixture()
    const first = yield* f.find()
    const second = yield* f.connections.createTarget(f.connection, { environment: "other", resource: { project: "other" } })
    yield* f.connections.bind({ ...f.bind, target: second })
    yield* expectCode(f.find(), "ambiguous_target")
    const selected = yield* f.find({ ...request, connectionID: f.connection.id, targetID: second.id })
    expect(ref(selected).targetID).toBe(second.id)
    yield* expectCode(f.find({ ...request, cursor: cursor(first), targetID: second.id }), "stale_descriptor")
    const next = yield* f.connections.retargetTarget(f.target, { environment: "new", resource: {} })
    yield* f.connections.bind({ ...f.bind, target: next })
    yield* expectCode(f.find({ ...request, cursor: cursor(first), targetID: next.id }), "stale_descriptor")
    yield* expectCode(f.describe(ref(first)), "stale_descriptor")
    const calls = (yield* Ref.get(f.calls)).length
    yield* expectCode(f.find({ ...request, provider: "stripe" }), "stale_descriptor")
    yield* expectCode(f.find({ ...request, targetID: Capability.TargetID.create() }), "connection_unavailable")
    const disabled = yield* f.registry.materialize([{ action: "platform_example", resource: "*", effect: "deny" }])
    yield* expectCode(f.find(request, disabled), "stale_descriptor")
    expect(yield* Ref.get(f.calls)).toHaveLength(calls)
  }))

  it.live("failed/partial acquisition stays distinct; unsupported schema not ready; malformed/oversize lists fail bounded", () => Effect.gen(function* () {
    const f = yield* fixture({ maxTools: 4, maxCatalogBytes: 1000 })
    yield* Ref.set(f.transport, Effect.fail(new Capability.Failure({ code: "acquisition_failed", message: secret })))
    yield* expectCode(f.find(), "acquisition_failed")
    yield* Ref.set(f.transport, Effect.void)
    yield* Ref.set(f.list, { tools: [], catalogGeneration: 1, coverage: "partial" })
    expect(yield* f.find()).toEqual({ operations: [], catalogGeneration: 1, coverage: "partial" })
    yield* Ref.set(f.list, { tools: [{ name: "unsafe", summary: "Unsupported", inputSchema: { $ref: "https://vendor.test/schema" } }],
      catalogGeneration: 2, coverage: "partial" })
    const partial = yield* f.find()
    expect(partial.coverage).toBe("partial")
    expect(partial.operations[0]).toEqual({ name: "unsafe", summary: "Unsupported", readiness: "unsupported",
      coverage: { input: "unsupported", output: "unsupported" } })
    yield* Ref.set(f.list, { tools: Array.from({ length: 5 }, (_, n) => ({ name: String(n), summary: "", inputSchema: true })),
      catalogGeneration: 3, coverage: "complete" })
    yield* expectCode(f.find(), "acquisition_failed")
    yield* Ref.set(f.list, { tools: [tools[0], tools[0]].filter((tool): tool is CapabilityDiscovery.VendorTool => tool !== undefined),
      catalogGeneration: 3, coverage: "complete" })
    yield* expectCode(f.find(), "acquisition_failed")
    yield* Ref.set(f.list, { tools: [{ name: "large", summary: "x".repeat(1500), inputSchema: true }], catalogGeneration: 3, coverage: "complete" })
    yield* expectCode(f.find(), "quota_exceeded")
    yield* Ref.set(f.transport, Effect.die("transport-defect"))
    const exit = yield* f.find().pipe(Effect.exit)
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") expect(Cause.hasDies(exit.cause)).toBe(true)
  }))

  it.live("quota and expiry bound metadata storage; source interruption and target drift cannot disclose", () => Effect.gen(function* () {
    const f = yield* fixture({ maxEntries: 1 })
    const first = yield* f.find()
    yield* expectCode(f.find(), "quota_exceeded")
    f.clock.time += 101
    expect((yield* f.find()).operations).toHaveLength(1)
    const reached = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    yield* Ref.set(f.transport, Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release))))
    const pending = yield* f.find().pipe(Effect.result, Effect.forkChild)
    yield* Deferred.await(reached)
    const next = yield* f.connections.retargetTarget(f.target, { environment: "new", resource: {} })
    yield* f.connections.bind({ ...f.bind, target: next })
    yield* Deferred.succeed(release, undefined)
    const result = yield* Fiber.join(pending)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.code).toBe("stale_descriptor")
    yield* Ref.set(f.transport, Effect.never)
    const interrupted = yield* f.find().pipe(Effect.forkChild)
    yield* Effect.yieldNow
    yield* Fiber.interrupt(interrupted)
    const exit = yield* Fiber.await(interrupted)
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") expect(Cause.hasInterrupts(exit.cause)).toBe(true)
    yield* expectCode(f.describe(ref(first)), "stale_descriptor")
  }).pipe(Effect.timeout("15 seconds")))

  it.live("concurrent unsupported schema compilation cannot exceed cache quota", () => Effect.gen(function* () {
    const f = yield* fixture({ maxEntries: 1 })
    yield* Ref.set(f.list, { tools: [
      { name: "first", summary: "First", inputSchema: { $ref: "https://unsupported.test/schema" } },
      { name: "second", summary: "Second", inputSchema: { type: "string", format: "unknown-format" } },
    ], catalogGeneration: 1, coverage: "complete" })
    const results = yield* Effect.forEach(["first", "second"], (query) => f.find({ ...request, query }).pipe(Effect.result),
      { concurrency: "unbounded" })
    expect(results.filter((result) => result._tag === "Success")).toHaveLength(1)
    const failures = results.filter((result) => result._tag === "Failure")
    expect(failures).toHaveLength(1)
    expect(failures[0]?.failure.code).toBe("quota_exceeded")
  }))

  it.live("root settlement, policy revoke and identical registry replacement during acquisition prevent disclosure", () => Effect.gen(function* () {
    yield* Effect.forEach(["root", "policy", "registration"] as const, (change) => Effect.gen(function* () {
      const f = yield* fixture()
      const reached = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* Ref.set(f.transport, Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release))))
      const pending = yield* f.find().pipe(Effect.result, Effect.forkChild)
      yield* Deferred.await(reached)
      if (change === "root") {
        yield* f.events.publish(SessionEvent.Tool.Called, { sessionID: f.context.sessionID,
          assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID, tool: "service_call",
          input: {}, provider: { executed: false }, timestamp: CapabilityPolicyFixture.timestamp })
        yield* f.events.publish(SessionEvent.Tool.Success, { sessionID: f.context.sessionID,
          assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID,
          structured: {}, content: [], provider: { executed: false }, timestamp: CapabilityPolicyFixture.timestamp })
      }
      if (change === "policy") yield* CapabilityPolicyFixture.setRules([
        { action: CapabilityDiscovery.disclosureAction, resource: "*", effect: "deny" },
      ])
      if (change === "registration") yield* f.registry.register({ platform_example: leaf() })
      yield* Deferred.succeed(release, undefined)
      const result = yield* Fiber.join(pending)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(result.failure.code).toBe(change === "root" ? "invocation_binding_mismatch"
        : change === "policy" ? "target_denied" : "stale_descriptor")
      expect(yield* Ref.get(f.calls)).toHaveLength(1)
    }))
  }).pipe(Effect.timeout("15 seconds")))

  it.live("canonical leaf wiring example validates before dispatch and raw output before canonical Result projection", () => Effect.gen(function* () {
    const f = yield* fixture()
    const validator = yield* CapabilityVendorSchema.compile({ type: "string", minLength: 1 }, { type: "integer", minimum: 0 })
    const dispatches = yield* Ref.make(0)
    const projections = yield* Ref.make(0)
    const response = yield* Ref.make<Schema.Json>(1)
    yield* f.registry.register({ platform_validation_example: Tool.make({
      description: "Validation-boundary example only", input: Schema.Json, output: Capability.Result,
      execute: Effect.fnUntraced(function* (input) {
        const checked = validator.validateInput(input)
        if (!checked.valid) return yield* new Tool.Failure({ message: checked.failure.message })
        yield* Ref.update(dispatches, (n) => n + 1)
        const output = validator.validateOutput(yield* Ref.get(response))
        if (!output.valid) return yield* new Tool.Failure({ message: output.failure.message })
        yield* Ref.update(projections, (n) => n + 1)
        return { status: "completed" as const, receipt: "validation-example", summary: String(output.value),
          verification: "acknowledged" as const, artifactRefs: [] }
      }),
    }) })
    const materialization = yield* f.registry.materialize()
    const settle = (input: Schema.Json) => materialization.settle({ ...f.context,
      call: { type: "tool-call", id: f.context.toolCallID, name: "platform_validation_example", input } })
    expect((yield* settle(1)).result.type).toBe("error")
    expect(yield* Ref.get(dispatches)).toBe(0)
    expect(yield* Ref.get(projections)).toBe(0)
    yield* Ref.set(response, "wrong-output")
    expect((yield* settle("valid-input")).result.type).toBe("error")
    expect(yield* Ref.get(dispatches)).toBe(1)
    expect(yield* Ref.get(projections)).toBe(0)
    yield* Ref.set(response, 2)
    const valid = yield* settle("valid-input")
    expect(valid.result.type).not.toBe("error")
    expect(valid.output?.structured).toMatchObject({ status: "completed", summary: "2" })
    expect(yield* Ref.get(dispatches)).toBe(2)
    expect(yield* Ref.get(projections)).toBe(1)
  }))

  it.live("forged refs and cross-owner descriptors/cursors fail with zero credential and source acquisition", () => Effect.gen(function* () {
    const f = yield* fixture()
    const reads = { credentials: 0 }
    const tracer = Tracer.make({ span: (options) => {
      if (options.name === "Credential.get") reads.credentials++
      return new Tracer.NativeSpan(options)
    } })
    const first = yield* f.find().pipe(Effect.withTracer(tracer))
    expect(reads.credentials).toBeGreaterThan(0)
    expect(yield* Ref.get(f.calls)).toHaveLength(1)
    reads.credentials = 0
    const issued = ref(first)
    const forged = [
      { ...issued, id: Capability.DescriptorID.create() }, { ...issued, schemaHash: "b".repeat(64) },
      { ...issued, catalogGeneration: issued.catalogGeneration + 1 },
      { ...issued, connectionID: Capability.ConnectionID.create() }, { ...issued, targetID: Capability.TargetID.create() },
      { ...issued, schemaHash: "invalid" }, { ...issued, unexpected: true },
    ]
    yield* Effect.forEach(forged, (value) => expectCode(f.describe(value).pipe(Effect.withTracer(tracer)), "stale_descriptor"))
    const next = { ...request, cursor: cursor(first) }
    yield* Effect.forEach([
      { ...next, cursor: next.cursor + "x" }, { ...next, query: "changed" }, { ...next, provider: "other" },
      { ...next, limit: 2 }, { ...next, connectionID: f.connection.id }, { ...next, targetID: f.target.id },
    ], (value) => expectCode(f.find(value).pipe(Effect.withTracer(tracer)), "stale_descriptor"))
    const other = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules(allow)
    const owner = { ...other.binding, effectiveRules: allow }
    yield* expectCode(CapabilityInvocation.withContext(owner,
      f.discovery.find(other.context, next, f.materialization)).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    yield* expectCode(CapabilityInvocation.withContext(owner,
      f.discovery.describe(other.context, issued, f.materialization)).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    const actor = AgentV2.ID.make("cross_actor")
    yield* CapabilityPolicyFixture.setRules(allow, actor)
    const context = { ...f.context, agent: actor, assistantMessageID: SessionMessage.ID.create() }
    yield* f.events.publish(SessionEvent.Step.Started, { ...context, timestamp: CapabilityPolicyFixture.timestamp,
      model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") } })
    yield* f.events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID,
      assistantMessageID: context.assistantMessageID, callID: context.toolCallID, name: "service_call", timestamp: CapabilityPolicyFixture.timestamp })
    const host = { ...f.binding, owner: { ...f.binding.owner, agentID: actor },
      invocation: { ...f.binding.invocation, agentID: actor, assistantMessageID: context.assistantMessageID } }
    yield* expectCode(CapabilityInvocation.withContext(host,
      f.discovery.find(context, next, f.materialization)).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    yield* expectCode(CapabilityInvocation.withContext(host,
      f.discovery.describe(context, issued, f.materialization)).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    f.clock.time += 100
    yield* expectCode(f.find(next).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    yield* expectCode(f.describe(issued).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    expect(reads.credentials).toBe(0)
    expect(yield* Ref.get(f.calls)).toHaveLength(1)
  }))

  it.live("ordered visibility and captured/current policy bind cursors before old offsets can skip or return false complete", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* Ref.set(f.list, { tools: tools.slice(0, 2), catalogGeneration: 1, coverage: "complete" })
    const first = yield* f.find()
    const next = { ...request, cursor: cursor(first) }
    const denyA = [...allow, { action: CapabilityDiscovery.disclosureAction, resource: "example:list_projects", effect: "deny" as const }]
    yield* CapabilityPolicyFixture.setRules(denyA)
    yield* expectCode(f.find(next), "stale_descriptor")
    const restart = yield* f.find()
    expect(restart.operations.map((operation) => operation.name)).toEqual(["get_project"])
    expect(restart.cursor).toBeUndefined()
    expect(restart.coverage).toBe("complete")
    yield* CapabilityPolicyFixture.setRules(allow)
    yield* expectCode(CapabilityInvocation.withContext({ ...f.binding, effectiveRules: denyA },
      f.discovery.find(f.context, next, f.materialization)), "stale_descriptor")
    yield* expectCode(CapabilityInvocation.withContext({ ...f.binding, nativeDenyFloor: denyA },
      f.discovery.find(f.context, next, f.materialization)), "stale_descriptor")
    yield* CapabilityPolicyFixture.setRules([...allow,
      { action: CapabilityDiscovery.disclosureAction, resource: "example:get_project", effect: "ask" },
    ])
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const pending = yield* f.find(next).pipe(Effect.result, Effect.forkChild)
    const asked = yield* Deferred.await(observation.first)
    expect(asked.resources).toContain("example:get_project")
    yield* f.permissions.reply({ requestID: asked.id, reply: "once" })
    const result = yield* Fiber.join(pending)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.code).toBe("stale_descriptor")
  }).pipe(Effect.timeout("15 seconds")))

  it.live("denied malformed/deep/oversize schemas cannot fail permitted pages or alter visible catalog hashes", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* CapabilityPolicyFixture.setRules([...allow,
      { action: CapabilityDiscovery.disclosureAction, resource: "example:hidden", effect: "deny" },
    ])
    const hidden = { name: "hidden", summary: "Hidden schema", inputSchema: 17 }
    yield* Ref.set(f.list, { tools: [hidden, ...tools.slice(1)], catalogGeneration: 1, coverage: "complete" })
    const first = yield* f.find()
    expect(first.operations.map((operation) => operation.name)).toEqual(["get_project"])
    yield* Effect.forEach([
      { description: "x".repeat(CapabilityVendorSchema.bounds.maxBytes + 1) },
      { enum: Array.from({ length: 5000 }, (_, n) => n) },
      Array.from({ length: 70 }).reduce<Schema.Json>((child) => ({ allOf: [child] }), true),
    ], (inputSchema) => Effect.gen(function* () {
      yield* Ref.set(f.list, { tools: [{ ...hidden, inputSchema }, ...tools.slice(1)], catalogGeneration: 1, coverage: "complete" })
      const next = yield* f.find({ ...request, cursor: cursor(first) })
      expect(next.operations.map((operation) => operation.name)).toEqual(["create_project"])
      expect(next.operations[0]?.readiness).toBe("ready")
    }))
    yield* CapabilityPolicyFixture.setRules(allow)
    yield* expectCode(f.find({ ...request, query: "hidden" }), "unsupported_schema")
    yield* Ref.set(f.list, { tools: [hidden], catalogGeneration: 1, coverage: "complete" })
    expect((yield* f.find()).operations[0]?.readiness).toBe("unsupported")
    const bounded = yield* CapabilityDiscovery.make({ source: f.source, maxCatalogBytes: 200 })
    yield* Ref.set(f.list, { tools: [{ ...hidden, inputSchema: { description: "x".repeat(1000) } }], catalogGeneration: 1, coverage: "complete" })
    yield* expectCode(f.run(bounded.find(f.context, request, f.materialization)), "quota_exceeded")
  }))

  it.live("page local capacity check precedes issuance and preserves remaining descriptor capacity", () => Effect.gen(function* () {
    const f = yield* fixture({ maxEntries: 2 })
    const sameSchema = tools.map((tool) => ({ name: tool.name, summary: tool.summary, inputSchema: true }))
    yield* Ref.set(f.list, { tools: sameSchema, catalogGeneration: 1, coverage: "complete" })
    const first = yield* f.find()
    yield* expectCode(f.find({ ...request, limit: 2 }), "quota_exceeded")
    const second = yield* f.find({ ...request, query: "get_project" })
    expect(second.operations[0]?.name).toBe("get_project")
    expect((yield* f.describe(ref(first))).name).toBe("list_projects")
    expect((yield* f.describe(ref(second))).name).toBe("get_project")
  }))

  it.live("asynchronous descriptor read replacement cannot return stale schema metadata", () => Effect.gen(function* () {
    const f = yield* fixture()
    const scope = yield* Scope.Scope
    const store = yield* CapabilityDescriptors.make({ maxEntries: 4, ttlMillis: 100, now: () => f.clock.time })
    const injected: CapabilityDescriptors.Store = { ...store, read: (ref, owner) => store.read(ref, owner).pipe(
      Effect.tap(() => f.registry.register({ platform_example: leaf() }).pipe(
        Effect.orDie, Effect.provideService(Scope.Scope, scope), Effect.andThen(Effect.yieldNow))),
    ) }
    const discovery = yield* CapabilityDiscovery.make({ source: f.source, descriptors: injected, now: () => f.clock.time, ttlMillis: 100 })
    const first = yield* f.run(discovery.find(f.context, request, f.materialization))
    yield* expectCode(f.run(discovery.describe(f.context, ref(first), f.materialization)), "stale_descriptor")
    const fresh = yield* f.registry.materialize(allow)
    expect(fresh.definition("platform_example")).toEqual(f.materialization.definition("platform_example"))
    expect(fresh.registrationIdentity("platform_example")).not.toBe(f.materialization.registrationIdentity("platform_example"))
  }))
})
