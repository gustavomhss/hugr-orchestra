import { describe, expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityDiscovery } from "@orchestra/core/capability/catalog/discovery"
import { CapabilityVendorSchema } from "@orchestra/core/capability/catalog/schema"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { Tool } from "@orchestra/core/tool/tool"
import { Capability } from "@orchestra/schema/capability"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { Cause, Deferred, Effect, Fiber, Ref, Schema } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { it, allow, request, secret, leaf, tools, fixture, expectCode, ref, cursor } from "./fixture/capability-discovery"

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
    yield* expectCode(f.describe({ ...ref(first), id: Capability.DescriptorID.create() }), "target_denied")
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
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(Capability.Failure)
      if (!(result.failure instanceof Capability.Failure)) return yield* Effect.die(result.failure)
      expect(result.failure.code).toBe("stale_descriptor")
    }
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
    const error = failures[0]?.failure
    expect(error).toBeInstanceOf(Capability.Failure)
    if (!(error instanceof Capability.Failure)) return yield* Effect.die(error)
    expect(error.code).toBe("quota_exceeded")
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
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(Capability.Failure)
        if (!(result.failure instanceof Capability.Failure)) return yield* Effect.die(result.failure)
        expect(result.failure.code).toBe(change === "root" ? "invocation_binding_mismatch"
          : change === "policy" ? "target_denied" : "stale_descriptor")
      }
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

})
