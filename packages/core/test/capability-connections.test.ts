import { describe, expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityConnections } from "@orchestra/core/capability/connection/index"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityTargetTable } from "@orchestra/core/capability/sql"
import { Credential } from "@orchestra/core/credential"
import { CredentialTable } from "@orchestra/core/credential/sql"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq, sql } from "drizzle-orm"
import { Cause, Deferred, Effect, Fiber, Layer, Ref, Schema } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(Credential.layerFrom(undefined).pipe(Layer.provideMerge(CapabilityPolicyFixture.layer)))
const integrationID = Integration.ID.make("capability-test")
const endpoint = "https://api.example.test/mcp?codemode=false"
const secrets = ["capability-secret-selected", "capability-secret-newer"]
const request = { provider: "example", action: "read" }

function fixture() {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    const credentials = yield* Credential.Service
    const service = yield* CapabilityConnections.make
    const selected = yield* credentials.create({ integrationID, value: { type: "key", key: secrets[0] }, label: "same label" })
    const newer = yield* credentials.create({ integrationID, value: { type: "key", key: secrets[1] }, label: "same label" })
    const create = { provider: "example", integrationID, endpoint, scopeHash: "a".repeat(64), subjectID: "authenticated-subject-a" }
    const connection = yield* service.create({ ...create, credentialID: selected.id })
    const other = yield* service.create({ ...create, credentialID: newer.id, subjectID: "authenticated-subject-b" })
    const target = yield* service.createTarget(connection, { environment: "production", resource: { project: "resource-a" } })
    const otherTarget = yield* service.createTarget(other, { environment: "production", resource: { project: "resource-b" } })
    const binding = { target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: ["read"] }
    yield* service.bind(binding)
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => CapabilityInvocation.withContext(f.binding, effect)
    const resolve = (input: CapabilityConnections.ResolveInput = request) => run(service.resolve(f.context, input))
    return { ...f, hostBinding: f.binding, credentials, service, selected, newer, create, connection, other, target, otherTarget, binding, run, resolve }
  })
}

function expectCode<A, R>(effect: Effect.Effect<A, Capability.Failure, R>, code: Capability.ErrorCode) {
  return Effect.gen(function* () {
    const error = yield* effect.pipe(Effect.flip)
    expect(error).toBeInstanceOf(Capability.Failure)
    expect(error.code).toBe(code)
    const encoded = yield* Schema.encodeEffect(Capability.Failure)(error)
    expect(new TextEncoder().encode(JSON.stringify(encoded)).byteLength).toBeLessThan(4096)
    secrets.forEach((secret) => expect(JSON.stringify(encoded)).not.toContain(secret))
    return error
  })
}

describe("CapabilityConnections", () => {
  it.live("uses exact selected credential despite newer same-URL account; persists bindings across new service", () => Effect.gen(function* () {
    const f = yield* fixture()
    const resolved = yield* f.resolve()
    expect(resolved).toEqual({ connection: f.connection, target: f.target, endpoint,
      resource: { project: "resource-a" }, credentialID: f.selected.id })
    expect(yield* f.run(f.service.loadCredential(f.context, resolved, "read"))).toEqual(f.selected.value)
    const restarted = yield* CapabilityConnections.make
    expect(yield* f.run(restarted.resolve(f.context, request))).toEqual(resolved)
    expect(yield* f.run(restarted.loadCredential(f.context, resolved, "read"))).toEqual(f.selected.value)
    yield* f.service.bind({ ...f.binding, target: f.otherTarget })
    const other = yield* f.resolve({ ...request, targetID: f.otherTarget.id })
    expect(other.connection.id).toBe(f.other.id)
    expect(yield* f.run(f.service.loadCredential(f.context, other, "read"))).toEqual(f.newer.value)
    const rows = {
      connections: yield* f.database.db.select().from(CapabilityConnectionTable).all().pipe(Effect.orDie),
      targets: yield* f.database.db.select().from(CapabilityTargetTable).all().pipe(Effect.orDie),
      bindings: yield* f.database.db.select().from(CapabilityBindingTable).all().pipe(Effect.orDie),
    }
    expect(rows.connections).toHaveLength(2)
    expect(rows.bindings).toHaveLength(2)
    // Positive control: real credential store contains material; connection storage and host metadata do not.
    const auth = JSON.stringify(yield* f.credentials.all())
    secrets.forEach((secret) => {
      expect(auth).toContain(secret)
      expect(JSON.stringify({ rows, resolved, other })).not.toContain(secret)
    })
  }))

  it.live("ambiguity exposes bounded permitted opaque choices only; exact action and wildcard bindings", () => Effect.gen(function* () {
    const f = yield* fixture()
    const unbound = yield* f.service.createTarget(f.connection, { environment: "private", resource: { secret: "hidden-resource" } })
    yield* f.service.bind({ ...f.binding, target: f.otherTarget, actions: ["write"] })
    expect((yield* f.resolve()).target.id).toBe(f.target.id)
    yield* f.service.bind({ ...f.binding, target: f.otherTarget, actions: ["*"] })
    const error = yield* expectCode(f.resolve(), "ambiguous_target")
    expect(error.detail).toEqual({ choices: [
      { connectionID: f.connection.id, targetID: f.target.id },
      { connectionID: f.other.id, targetID: f.otherTarget.id },
    ] })
    expect(JSON.stringify(error)).not.toContain(unbound.id)
    expect(JSON.stringify(error)).not.toContain("hidden-resource")
    expect(JSON.stringify(error)).not.toContain(endpoint)
    expect((yield* f.resolve({ ...request, connectionID: f.other.id })).target.id).toBe(f.otherTarget.id)
    yield* CapabilityPolicyFixture.setRules([
      ...CapabilityPolicyFixture.allow, { action: "read", resource: f.otherTarget.id, effect: "deny" },
    ])
    expect((yield* f.resolve()).target.id).toBe(f.target.id)
    yield* expectCode(f.resolve({ ...request, targetID: f.otherTarget.id }), "target_denied")
    yield* Effect.forEach(Array.from({ length: 10 }), () => Effect.gen(function* () {
      const next = yield* f.service.createTarget(f.connection, { environment: "production", resource: {} })
      yield* f.service.bind({ ...f.binding, target: next })
    }))
    const bounded = yield* expectCode(f.resolve(), "ambiguous_target")
    const detail = Schema.decodeUnknownSync(Schema.Struct({ choices: Schema.Array(Schema.Struct({
      connectionID: Capability.ConnectionID, targetID: Capability.TargetID,
    })) }))(bounded.detail)
    expect(detail.choices).toHaveLength(8)
  }))

  it.live("requires private frame and persisted active root before discovering even nonexistent selectors", () => Effect.gen(function* () {
    const f = yield* fixture()
    const unknown = { ...request, targetID: Capability.TargetID.create() }
    const forged = { ...f.context, binding: f.hostBinding }
    yield* expectCode(f.service.resolve(forged, unknown), "invocation_binding_missing")
    yield* expectCode(f.run(f.service.resolve({ ...f.context, agent: AgentV2.ID.make("foreign") }, unknown)), "invocation_binding_mismatch")
    yield* expectCode(f.run(f.service.resolve({ ...f.context, toolCallID: "child-call" }, unknown)), "invocation_binding_mismatch")
    const missing = yield* CapabilityPolicyFixture.fixture({ part: false })
    yield* expectCode(CapabilityInvocation.withContext(missing.binding, f.service.resolve(missing.context, unknown)), "invocation_binding_mismatch")
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.deny)
    yield* expectCode(f.resolve(unknown), "target_denied")
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.allow)
    yield* expectCode(f.resolve(unknown), "connection_unavailable")
    yield* f.events.publish(SessionEvent.Tool.Called, {
      sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID,
      tool: "service_call", input: {}, provider: { executed: false }, timestamp: CapabilityPolicyFixture.timestamp,
    })
    yield* f.events.publish(SessionEvent.Tool.Success, {
      sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID,
      structured: {}, content: [], provider: { executed: false }, timestamp: CapabilityPolicyFixture.timestamp,
    })
    yield* expectCode(f.resolve(), "invocation_binding_mismatch")
  }))

  it.live("denies foreign project/Location/workspace/session/actor; no implicit actor inheritance", () => Effect.gen(function* () {
    const f = yield* fixture()
    const second = yield* CapabilityPolicyFixture.fixture()
    yield* expectCode(CapabilityInvocation.withContext(second.binding,
      f.service.resolve(second.context, { ...request, targetID: f.target.id })), "target_denied")
    yield* expectCode(CapabilityInvocation.withContext(second.binding,
      f.service.resolve(second.context, request)), "connection_unavailable")
    yield* expectCode(f.service.bind({ ...f.binding, sessionID: second.context.sessionID,
      target: { ...f.target, connectionID: f.other.id } }), "target_denied")
    yield* f.service.bind({ ...f.binding, target: f.otherTarget, agentID: AgentV2.ID.make("foreign") })
    yield* expectCode(f.resolve({ ...request, targetID: f.otherTarget.id }), "target_denied")
    yield* f.service.bind({ ...f.binding, actions: ["write"] })
    yield* expectCode(f.resolve(), "connection_unavailable")
    yield* f.service.bind(f.binding)
    const foreignProject = Project.ID.make("foreign-project")
    yield* f.database.db.insert(ProjectTable).values({ id: foreignProject,
      worktree: AbsolutePath.make("/foreign"), sandboxes: [] }).run().pipe(Effect.orDie)
    yield* Effect.forEach([
      { ...CapabilityPolicyFixture.placement, project: { id: foreignProject, directory: AbsolutePath.make("/foreign") } },
      { ...CapabilityPolicyFixture.placement, directory: AbsolutePath.make("/foreign") },
      { ...CapabilityPolicyFixture.placement, workspaceID: WorkspaceID.make("wrk_foreign") },
    ], (placement) => Effect.gen(function* () {
      const foreign = yield* CapabilityConnections.make.pipe(Effect.provideService(Location.Service, Location.Service.of(placement)))
      const ref = yield* foreign.create({ ...f.create, credentialID: f.selected.id })
      const t = yield* foreign.createTarget(ref, { environment: "foreign", resource: {} })
      yield* expectCode(f.resolve({ ...request, connectionID: ref.id }), "target_denied")
      yield* expectCode(f.resolve({ ...request, targetID: t.id }), "target_denied")
      yield* expectCode(f.service.bind({ ...f.binding, target: t }), "target_denied")
      yield* expectCode(foreign.bind({ ...f.binding, target: t }), "target_denied")
    }))
    yield* f.events.publish(SessionEvent.Moved, { sessionID: f.context.sessionID,
      location: { directory: CapabilityPolicyFixture.placement.directory, workspaceID: WorkspaceID.make("wrk_moved") },
      timestamp: CapabilityPolicyFixture.timestamp })
    yield* expectCode(f.resolve(), "invocation_binding_mismatch")
  }))

  it.live("retarget/remove and disconnect invalidate refs/bindings atomically without deleting credentials", () => Effect.gen(function* () {
    const f = yield* fixture()
    const old = yield* f.resolve()
    const next = yield* f.service.retargetTarget(f.target, { environment: "staging", resource: { project: "changed" } })
    expect(next.generation).toBe(f.target.generation + 1)
    expect(yield* f.database.db.select().from(CapabilityBindingTable).all().pipe(Effect.orDie)).toEqual([])
    yield* expectCode(f.run(f.service.loadCredential(f.context, old, "read")), "stale_descriptor")
    yield* expectCode(f.service.bind(f.binding), "stale_descriptor")
    yield* expectCode(f.resolve(), "connection_unavailable")
    yield* f.service.bind({ ...f.binding, target: next })
    const current = yield* f.resolve()
    yield* f.service.removeTarget(next)
    yield* expectCode(f.run(f.service.loadCredential(f.context, current, "read")), "connection_unavailable")
    const t = yield* f.service.createTarget(f.connection, { environment: "production", resource: {} })
    yield* f.service.bind({ ...f.binding, target: t })
    const resolved = yield* f.resolve()
    const sibling = yield* f.service.createTarget(f.connection, { environment: "production", resource: {} })
    yield* f.service.bind({ ...f.binding, target: sibling, agentID: AgentV2.ID.make("foreign") })
    yield* f.service.bind({ ...f.binding, target: f.otherTarget })
    yield* f.service.disconnect(f.connection)
    const row = yield* f.database.db.select().from(CapabilityConnectionTable)
      .where(eq(CapabilityConnectionTable.id, f.connection.id)).get().pipe(Effect.orDie)
    expect(row?.generation).toBe(f.connection.generation + 1)
    expect(row?.state).toBe("disconnected")
    const bindings = yield* f.database.db.select().from(CapabilityBindingTable).all().pipe(Effect.orDie)
    expect(bindings.map((row) => ({ targetID: row.target_id, sessionID: row.session_id, agentID: row.agent_id }))).toEqual([
      { targetID: f.otherTarget.id, sessionID: f.context.sessionID, agentID: f.context.agent },
    ])
    yield* expectCode(f.run(f.service.loadCredential(f.context, resolved, "read")), "stale_descriptor")
    yield* expectCode(f.service.createTarget(f.connection, { environment: "x", resource: {} }), "stale_descriptor")
    yield* expectCode(f.resolve({ ...request, connectionID: f.connection.id }), "connection_unavailable")
    expect((yield* f.resolve()).target.id).toBe(f.otherTarget.id)
    expect(yield* f.credentials.get(f.selected.id)).toEqual(f.selected)
    expect(yield* f.credentials.get(f.newer.id)).toEqual(f.newer)
  }))

  it.live("same Session actors receive only their explicit bindings; Session switch never changes root issuer", () => Effect.gen(function* () {
    const f = yield* fixture()
    const actor = AgentV2.ID.make("foreign")
    const context = { ...f.context, agent: actor, assistantMessageID: SessionMessage.ID.create() }
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.allow, actor)
    yield* f.events.publish(SessionEvent.Step.Started, {
      ...context, agent: actor, timestamp: CapabilityPolicyFixture.timestamp,
      model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") },
    })
    yield* f.events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID,
      assistantMessageID: context.assistantMessageID, callID: context.toolCallID,
      name: "service_call", timestamp: CapabilityPolicyFixture.timestamp })
    const host = { ...f.hostBinding, owner: { ...f.hostBinding.owner, agentID: actor },
      invocation: { ...f.hostBinding.invocation, agentID: actor, assistantMessageID: context.assistantMessageID } }
    yield* expectCode(CapabilityInvocation.withContext(host,
      f.service.resolve(context, { ...request, targetID: f.target.id })), "target_denied")
    yield* f.service.bind({ ...f.binding, target: f.otherTarget, agentID: actor })
    const other = yield* CapabilityInvocation.withContext(host, f.service.resolve(context, request))
    expect(other.target.id).toBe(f.otherTarget.id)
    expect(yield* CapabilityInvocation.withContext(host, f.service.loadCredential(context, other, "read"))).toEqual(f.newer.value)
    yield* expectCode(f.run(f.service.loadCredential(f.context, other, "read")), "target_denied")
    yield* f.events.publish(SessionEvent.AgentSwitched, { sessionID: f.context.sessionID,
      messageID: SessionMessage.ID.create(), agent: actor, timestamp: CapabilityPolicyFixture.timestamp })
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.deny, actor)
    expect((yield* f.resolve()).target.id).toBe(f.target.id)
    yield* expectCode(CapabilityInvocation.withContext(host, f.service.loadCredential(context, other, "read")), "target_denied")
  }))

  it.live("preserves defects from actual persisted root decoding", () => Effect.gen(function* () {
    const f = yield* fixture()
    expect((yield* f.resolve()).target.id).toBe(f.target.id)
    yield* f.database.db.run(sql`UPDATE session_message SET data = '{}' WHERE id = ${f.context.assistantMessageID}`).pipe(Effect.orDie)
    const exit = yield* f.resolve().pipe(Effect.exit)
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") expect(Cause.hasDies(exit.cause)).toBe(true)
  }))

  it.live("rechecks binding/actions, credential integration and current policy at material boundary", () => Effect.gen(function* () {
    const f = yield* fixture()
    const resolved = yield* f.resolve()
    yield* f.service.bind({ ...f.binding, actions: ["write"] })
    yield* expectCode(f.run(f.service.loadCredential(f.context, resolved, "read")), "target_denied")
    yield* f.service.bind(f.binding)
    yield* expectCode(f.run(f.service.loadCredential(f.context, { ...resolved, credentialID: f.newer.id }, "read")), "target_denied")
    yield* expectCode(f.run(f.service.loadCredential(f.context, { ...resolved, resource: { project: "other" } }, "read")), "target_denied")
    yield* expectCode(f.run(f.service.loadCredential(f.context, { ...resolved, endpoint: "https://elsewhere.test" }, "read")), "target_denied")
    yield* expectCode(f.run(f.service.loadCredential(f.context, { ...resolved,
      connection: { ...resolved.connection, generation: 99 } }, "read")), "stale_descriptor")
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.deny)
    yield* expectCode(f.run(f.service.loadCredential(f.context, resolved, "read")), "target_denied")
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.allow)
    yield* f.database.db.update(CredentialTable).set({ integration_id: Integration.ID.make("foreign-integration") })
      .where(eq(CredentialTable.id, f.selected.id)).run().pipe(Effect.orDie)
    yield* expectCode(f.run(f.service.loadCredential(f.context, resolved, "read")), "authentication_revoked")
    yield* expectCode(f.service.create({ ...f.create, credentialID: f.selected.id }), "authentication_revoked")
    yield* f.credentials.remove(f.selected.id)
    yield* expectCode(f.run(f.service.loadCredential(f.context, resolved, "read")), "authentication_required")
    yield* expectCode(f.resolve(), "authentication_required")
    yield* expectCode(f.service.create({ ...f.create, credentialID: f.selected.id }), "authentication_required")
    expect(yield* f.credentials.get(f.newer.id)).toEqual(f.newer)
  }))

  it.live("rejects secret-bearing endpoints and invalid SHA256 fingerprints with redacted typed errors", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.forEach([
      "https://user:capability-secret-selected@example.test/mcp",
      "https://example.test/mcp#capability-secret-selected",
      "https://example.test/mcp?token=capability-secret-selected",
      "https://example.test/mcp?arbitrary=capability-secret-selected",
      "https://example.test/mcp?codemode=false&token=capability-secret-selected",
      "https://example.test/mcp?codemode=false&codemode=false", "file:///tmp/provider", "not a URL",
    ], (endpoint) => expectCode(f.service.create({ ...f.create, credentialID: f.selected.id, endpoint }), "target_denied"))
    yield* Effect.forEach(["a".repeat(63), "a".repeat(65), "g".repeat(64), "a".repeat(64) + "\n"],
      (scopeHash) => expectCode(f.service.create({ ...f.create, credentialID: f.selected.id, scopeHash }), "target_denied"))
    expect(yield* f.database.db.select().from(CapabilityConnectionTable).all().pipe(Effect.orDie)).toHaveLength(2)
    const valid = yield* f.service.create({ ...f.create, credentialID: f.selected.id, scopeHash: "A".repeat(64) })
    expect(valid.provider).toBe("example")
  }))

  it.live("approval wait cannot preserve stale target or revoked binding; interruption stays interruption", () => Effect.gen(function* () {
    const f = yield* fixture()
    const resolved = yield* f.resolve()
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    yield* CapabilityPolicyFixture.setRules([])
    const fiber = yield* f.run(f.service.loadCredential(f.context, resolved, "read")).pipe(Effect.result, Effect.forkChild)
    const asked = yield* Deferred.await(observation.first)
    const queued = yield* f.permissions.list()
    expect(queued).toHaveLength(1)
    yield* f.service.bind({ ...f.binding, actions: ["write"] })
    yield* f.permissions.reply({ requestID: asked.id, reply: "once" })
    const result = yield* Fiber.join(fiber)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.code).toBe("target_denied")
    expect(yield* Ref.get(observation.count)).toBe(1)
    yield* f.service.bind(f.binding)
    const drift = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const drifting = yield* f.run(f.service.loadCredential(f.context, resolved, "read")).pipe(Effect.result, Effect.forkChild)
    const driftRequest = yield* Deferred.await(drift.first)
    const next = yield* f.service.retargetTarget(f.target, { environment: "staging", resource: {} })
    yield* f.permissions.reply({ requestID: driftRequest.id, reply: "once" })
    const driftResult = yield* Fiber.join(drifting)
    expect(driftResult._tag).toBe("Failure")
    if (driftResult._tag === "Failure") expect(driftResult.failure.code).toBe("stale_descriptor")
    yield* f.service.bind({ ...f.binding, target: next })
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.allow)
    const current = yield* f.resolve()
    yield* CapabilityPolicyFixture.setRules([])
    const revoked = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const revoking = yield* f.run(f.service.loadCredential(f.context, current, "read")).pipe(Effect.result, Effect.forkChild)
    const revokeRequest = yield* Deferred.await(revoked.first)
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.deny)
    yield* f.permissions.reply({ requestID: revokeRequest.id, reply: "once" })
    const revokedResult = yield* Fiber.join(revoking)
    expect(revokedResult._tag).toBe("Failure")
    if (revokedResult._tag === "Failure") expect(revokedResult.failure.code).toBe("target_denied")
    yield* CapabilityPolicyFixture.setRules([])
    const interrupted = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const waiting = yield* f.run(f.service.loadCredential(f.context, current, "read")).pipe(Effect.forkChild)
    yield* Deferred.await(interrupted.first)
    yield* Fiber.interrupt(waiting)
    const exit = yield* Fiber.await(waiting)
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") expect(Cause.hasInterrupts(exit.cause)).toBe(true)
  }).pipe(Effect.timeout("10 seconds")))
})
