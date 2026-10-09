import { describe, expect } from "bun:test"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { CapabilityArtifacts } from "../src/capability/artifact/index"
import { CapabilityConnections } from "../src/capability/connection/index"
import { CapabilityInvocation } from "../src/capability/invocation"
import { CapabilityArtifactTable, CapabilityBindingTable, CapabilityConnectionTable, CapabilityTargetTable } from "../src/capability/sql"
import { Credential } from "../src/credential"
import { CredentialTable } from "../src/credential/sql"
import { FSUtil } from "../src/fs-util"
import { Global } from "../src/global"
import { PermissionV2 } from "../src/permission"
import { AbsolutePath } from "../src/schema"
import { Tool } from "../src/tool/tool"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { Context, Effect, Exit, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { CapabilityChildrenFixture } from "./fixture/capability-children"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(Credential.layerFrom(undefined).pipe(Layer.provideMerge(CapabilityChildrenFixture.layer)))
const rules: PermissionV2.Ruleset = [
  { action: "artifact.*", resource: "*", effect: "allow" }, { action: "service_*", resource: "*", effect: "allow" },
]
const secret = "selected-artifact-fixture-secret"
const input: CapabilityArtifacts.Input = { data: new TextEncoder().encode("verified selected bytes ✓"),
  mime: "text/plain", kind: "service-result", verification: "verified", metadata: { fixture: true } }

function fixture(oauth = false) {
  return Effect.gen(function* () {
    const f = yield* CapabilityChildrenFixture.fixture
    yield* CapabilityPolicyFixture.setRules(rules)
    const credentials = yield* Credential.Service
    const connections = yield* CapabilityConnections.make
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const integrationID = Integration.ID.make("artifact-selection-fixture")
    const selected = yield* credentials.create({ integrationID, value: oauth
      ? Schema.decodeUnknownSync(Credential.Value)({ type: "oauth", methodID: "selected", access: secret,
        refresh: "selected-fixture-refresh", expires: Date.now() + 60000 })
      : { type: "key", key: secret, metadata: { ignored: "metadata" } } })
    const newer = yield* credentials.create({ integrationID, value: { type: "key", key: "newer-fixture-secret" } })
    const connection = yield* connections.create({ provider: "fixture", integrationID, credentialID: selected.id,
      subjectID: "selected-account", endpoint: "https://fixture.example/mcp?codemode=false", scopeHash: "a".repeat(64) })
    const target = yield* connections.createTarget(connection, { environment: "production",
      resource: { account: "one", nested: { repository: "selected" } } })
    yield* connections.bind({ target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: ["service_read"] })
    const binding = { ...f.binding, effectiveRules: rules }
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => CapabilityInvocation.withContext(binding, effect)
    const resolution = yield* run(connections.resolve(f.context, { provider: "fixture", connectionID: connection.id,
      targetID: target.id, action: "service_read" }))
    const requirement = { action: "service_read", resources: [connection.provider, connection.id, target.id],
      selection: { resolution, credentialHash: CapabilityArtifacts.selectionCredentialHash(selected.value) } }
    const root = join(global.data, "artifact-selection-" + f.context.sessionID)
    const artifacts = yield* CapabilityArtifacts.make({ root })
    return { ...f, binding, run, credentials, connections, fs, selected, newer, connection, target, resolution, requirement, root, artifacts }
  })
}

function expectCode<A, E, R>(effect: Effect.Effect<A, E, R>, code: Capability.ErrorCode | CapabilityArtifacts.Failure["code"]) {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(effect)
    expect(Exit.isFailure(exit)).toBe(true)
    const error = yield* Effect.flip(exit)
    if (!(error instanceof Capability.Failure) && !(error instanceof CapabilityArtifacts.Failure)) throw new Error("Expected typed artifact failure")
    expect(error.code).toBe(code)
    expect(JSON.stringify(error)).not.toContain(secret)
  })
}

function queued(f: Effect.Success<ReturnType<typeof fixture>>, effect: Effect.Effect<unknown, Capability.Failure | CapabilityArtifacts.Failure>) {
  return Effect.gen(function* () {
    yield* CapabilityPolicyFixture.setRules([...rules, { action: "artifact.write", resource: "*", effect: "ask" }])
    return yield* CapabilityPolicyFixture.queued(f.context, f.run(effect).pipe(Effect.asVoid,
      Effect.catchTag("CapabilityArtifacts.Failure", Effect.die)))
  })
}

describe("selected artifact publication", () => {
  it.live("real selected credential and canonical child publish verified bytes without persisting selection material", () => Effect.gen(function* () {
    const f = yield* fixture()
    // Canonical resource fingerprint ignores object-key order, but retains nested values exactly.
    yield* f.database.db.update(CapabilityTargetTable).set({ resource: { nested: { repository: "selected" }, account: "one" } })
      .where(eq(CapabilityTargetTable.id, f.target.id)).run()
    yield* f.connections.bind({ target: f.target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: ["*"] })
    yield* f.registry.register({ selected_publish: Tool.make({ description: "Selected child publication", input: Schema.Json,
      output: Capability.ArtifactRef, execute: (_, context) => f.artifacts.publish(context, input, [f.requirement]).pipe(
        Effect.mapError((error) => new Tool.Failure({ message: "Selected artifact denied", error }))),
    }) })
    const materialization = yield* f.registry.materialize(undefined, { advertisedNames: [] })
    yield* f.run(Effect.gen(function* () {
      const dispatcher = yield* f.children.dispatcher(f.context, materialization)
      expect((yield* dispatcher.settle("selected_publish", {})).result.type).not.toBe("error")
    }))
    const rows = yield* f.database.db.select().from(CapabilityArtifactTable)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    if (!row) throw new Error("Missing selected artifact")
    expect(row.producer.callID).toBe(CapabilityInvocation.childID(f.binding.invocation, 1))
    const ref = { id: row.id, revision: row.revision }
    expect((yield* f.run(f.artifacts.read(f.context, ref))).data).toEqual(input.data)
    expect(yield* f.fs.readFile(join(f.root, row.hash))).toEqual(input.data)
    const projected = JSON.stringify({ rows, ref, description: yield* f.run(f.artifacts.describe(f.context, ref)) })
    expect(JSON.stringify(yield* f.credentials.get(f.selected.id))).toContain(secret) // Positive secret-scanner control.
    ;[secret, f.requirement.selection.credentialHash, f.resolution.endpoint, "credentialHash", "selection"].forEach((value) =>
      expect(projected).not.toContain(value))
    expect(yield* f.fs.exists(f.root)).toBe(true)
  }))

  for (const mode of ["retarget", "disconnect", "binding", "rotation", "expiry", "revoke"] as const) {
    it.live(`selected artifact approval ${mode} rejects before publication`, () => Effect.gen(function* () {
      const f = yield* fixture(mode === "expiry")
      const waiting = yield* queued(f, f.artifacts.publish(f.context, input, [f.requirement]))
      expect(waiting.request.action).toBe("artifact.write")
      if (mode === "retarget") yield* f.connections.retargetTarget(f.target, { environment: "staging", resource: { account: "two" } })
      if (mode === "disconnect") yield* f.connections.disconnect(f.connection)
      if (mode === "binding") yield* f.database.db.delete(CapabilityBindingTable).where(eq(CapabilityBindingTable.target_id, f.target.id)).run()
      if (mode === "rotation") yield* f.credentials.update(f.selected.id, { value: { type: "key", key: "rotated-fixture-secret" } })
      if (mode === "expiry" && f.selected.value.type === "oauth") yield* f.credentials.update(f.selected.id,
        { value: { ...f.selected.value, expires: Date.now() - 1 } })
      if (mode === "revoke") yield* CapabilityPolicyFixture.setRules([...rules,
        { action: "service_read", resource: f.connection.id, effect: "deny" }])
      yield* f.permissions.reply({ requestID: waiting.request.id, reply: "once" })
      const result = yield* waiting.join
      expect(result._tag).toBe("Failure")
      if (result._tag !== "Failure") throw new Error("Selected artifact condition bypassed")
      expect(result.failure.code).toBe(mode === "retarget" || mode === "disconnect" ? "stale_descriptor"
        : mode === "rotation" ? "authentication_revoked" : mode === "expiry" ? "authentication_required" : "target_denied")
      expect(JSON.stringify(result.failure)).not.toContain(f.requirement.selection.credentialHash)
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(0)
      expect(yield* f.fs.exists(f.root)).toBe(false)
      expect(yield* f.permissions.list()).toHaveLength(0)
    }).pipe(Effect.timeout("15 seconds")), 20000)
  }

  it.live("all requirements and nested selection snapshot before approval; caller mutations cannot change the captured condition", () => Effect.gen(function* () {
    const f = yield* fixture()
    const resource = { account: "one", nested: { repository: "selected" } }
    const resolution = { ...f.resolution, connection: { ...f.connection }, target: { ...f.target }, resource }
    const requirements = [{ ...f.requirement, resources: [...f.requirement.resources],
      selection: { ...f.requirement.selection, resolution } }]
    const waiting = yield* queued(f, f.artifacts.publish(f.context, input, requirements))
    resource.nested.repository = "mutated"
    resolution.connection.generation++
    requirements[0].selection.credentialHash = "0".repeat(64)
    requirements[0].action = "service_write"
    requirements[0].resources.splice(0)
    requirements.splice(0)
    yield* f.permissions.reply({ requestID: waiting.request.id, reply: "once" })
    expect((yield* waiting.join)._tag).toBe("Success")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
  }))

  it.live("mutating selection to the newly retargeted row cannot adopt it during approval", () => Effect.gen(function* () {
    const f = yield* fixture()
    const resolution = structuredClone(f.resolution)
    const requirements = [{ ...f.requirement, selection: { ...f.requirement.selection, resolution } }]
    const waiting = yield* queued(f, f.artifacts.publish(f.context, input, requirements))
    const next = yield* f.connections.retargetTarget(f.target, { environment: "staging", resource: { account: "two" } })
    yield* f.connections.bind({ target: next, sessionID: f.context.sessionID, agentID: f.context.agent, actions: ["service_read"] })
    Object.assign(resolution.target, next)
    Object.assign(resolution, { resource: { account: "two" } })
    yield* f.permissions.reply({ requestID: waiting.request.id, reply: "once" })
    const result = yield* waiting.join
    expect(result._tag === "Failure" && result.failure.code).toBe("stale_descriptor")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(0)
    expect(yield* f.fs.exists(f.root)).toBe(false)
  }))

  it.live("selected update checks the same condition before new blobs and preserves revision CAS", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.run(f.artifacts.publish(f.context, input))
    const before = yield* f.fs.readDirectory(f.root)
    const changed = { ...input, data: new TextEncoder().encode("new selected revision") }
    const waiting = yield* queued(f, f.artifacts.update(f.context, ref, changed, [f.requirement]))
    yield* f.credentials.update(f.selected.id, { value: { type: "key", key: "rotated-fixture-secret" } })
    yield* f.permissions.reply({ requestID: waiting.request.id, reply: "once" })
    const result = yield* waiting.join
    expect(result._tag === "Failure" && result.failure.code).toBe("authentication_revoked")
    expect(yield* f.fs.readDirectory(f.root)).toEqual(before)
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
    yield* f.credentials.update(f.selected.id, { value: f.selected.value })
    yield* CapabilityPolicyFixture.setRules(rules)
    expect(yield* f.run(f.artifacts.update(f.context, ref, changed, [f.requirement]))).toEqual({ id: ref.id, revision: 1 })
    yield* expectCode(f.run(f.artifacts.update(f.context, ref, input, [f.requirement])), "revision_conflict")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(2)
  }))

  it.live("same-owner wrong IDs, resources, action, placement, integration and credential fail closed", () => Effect.gen(function* () {
    const f = yield* fixture()
    for (const requirement of [
      { ...f.requirement, resources: [f.connection.provider, f.connection.id] },
      { ...f.requirement, action: "service_write" },
      { ...f.requirement, selection: { ...f.requirement.selection, credentialHash: "0".repeat(64) } },
      { ...f.requirement, selection: { ...f.requirement.selection, resolution: { ...f.resolution, credentialID: f.newer.id } } },
      { ...f.requirement, selection: { ...f.requirement.selection, resolution: { ...f.resolution, endpoint: "https://other.example/mcp" } } },
    ]) yield* expectCode(f.run(f.artifacts.publish(f.context, input, [requirement])),
      requirement.selection.credentialHash === "0".repeat(64) ? "authentication_revoked" : "target_denied")
    const connection = yield* f.database.db.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, f.connection.id)).get()
    if (!connection) throw new Error("Missing real connection")
    for (const change of [{ directory: AbsolutePath.make("/foreign") }, { workspace_id: WorkspaceID.make("wrk_foreign") },
      { provider: "other" }, { integration_id: Integration.ID.make("foreign-integration") }, { state: "revoked" as const }]) {
      yield* f.database.db.update(CapabilityConnectionTable).set({ ...connection, ...change }).where(eq(CapabilityConnectionTable.id, f.connection.id)).run()
      yield* expectCode(f.run(f.artifacts.publish(f.context, input, [f.requirement])),
        "integration_id" in change || "state" in change ? "authentication_revoked" : "target_denied")
    }
    yield* f.database.db.update(CapabilityConnectionTable).set(connection).where(eq(CapabilityConnectionTable.id, f.connection.id)).run()
    yield* f.database.db.update(CredentialTable).set({ integration_id: Integration.ID.make("foreign-integration") })
      .where(eq(CredentialTable.id, f.selected.id)).run()
    yield* expectCode(f.run(f.artifacts.publish(f.context, input, [f.requirement])), "authentication_revoked")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(0)
    expect(yield* f.fs.exists(f.root)).toBe(false)
  }))

  it.live("missing captured Credential service blocks selected publication; normal publication remains compatible", () => Effect.gen(function* () {
    const f = yield* fixture()
    const absent = yield* CapabilityArtifacts.make({ root: f.root }).pipe(Effect.updateContext(
      (services: Context.Context<Effect.Services<ReturnType<typeof CapabilityArtifacts.make>>>) => Context.omit(Credential.Service)(services)))
    yield* expectCode(f.run(absent.publish(f.context, input, [f.requirement])), "connection_unavailable")
    expect(yield* f.fs.exists(f.root)).toBe(false)
    const ref = yield* f.run(absent.publish(f.context, input))
    expect((yield* f.run(absent.read(f.context, ref))).data).toEqual(input.data)
  }))

  it.live("bounded descriptor-checked selected snapshots never execute getters or custom serializers", () => Effect.gen(function* () {
    const f = yield* fixture()
    const state = { executed: 0 }
    const accessor = Object.defineProperty({}, "unsafe", { enumerable: true, get: () => { state.executed++; return "bad" } })
    const serializer = Object.defineProperty({}, "toJSON", { value: () => { state.executed++; return {} } })
    const deep = Array.from({ length: 65 }).reduce<Schema.Json>((value) => ({ value }), null)
    const invalid: Schema.Json[] = ["x".repeat(16385), Array.from({ length: 1025 }, () => null), deep]
    for (const resource of invalid) yield* expectCode(f.run(f.artifacts.publish(f.context, input,
      [{ ...f.requirement, selection: { ...f.requirement.selection, resolution: { ...f.resolution, resource } } }])), "quota_exceeded")
    for (const resource of [accessor, serializer]) yield* expectCode(f.run(f.artifacts.publish(f.context, input,
      [{ ...f.requirement, selection: { ...f.requirement.selection, resolution: { ...f.resolution, resource } } }])), "target_denied")
    expect(state.executed).toBe(0)
    expect(yield* f.fs.exists(f.root)).toBe(false)
  }))

  it.live("credential hash follows the primitive key/OAuth ABI and ignores metadata and label-only rotation", () => Effect.gen(function* () {
    const f = yield* fixture()
    const state = { read: 0 }
    const value = { type: "key" as const, key: secret }
    Object.defineProperty(value, "metadata", { get: () => { state.read++; throw new Error("metadata getter") } })
    expect(CapabilityArtifacts.selectionCredentialHash(value)).toBe(createHash("sha256").update(JSON.stringify(["key", secret])).digest("hex"))
    expect(state.read).toBe(0)
    const oauth = Schema.decodeUnknownSync(Credential.Value)({ type: "oauth", methodID: "selected", access: secret,
      refresh: "refresh", expires: 1234, metadata: { ignored: true } })
    expect(CapabilityArtifacts.selectionCredentialHash(oauth)).toBe(createHash("sha256").update(
      JSON.stringify(["oauth", "selected", secret, "refresh", 1234])).digest("hex"))
    yield* f.credentials.update(f.selected.id, { label: "new label", value: { type: "key", key: secret, metadata: { changed: true } } })
    yield* f.run(f.artifacts.publish(f.context, input, [f.requirement]))
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
  }))
})
