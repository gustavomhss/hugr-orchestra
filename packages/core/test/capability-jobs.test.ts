import { describe, expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityJobs } from "@orchestra/core/capability/job/index"
import {
  CapabilityArtifactReferenceTable, CapabilityArtifactTable, CapabilityBindingTable,
  CapabilityConnectionTable, CapabilityJobTable, CapabilityTargetTable,
} from "@orchestra/core/capability/sql"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionMessageTable } from "@orchestra/core/session/sql"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { and, eq } from "drizzle-orm"
import { Cause, Deferred, Effect, Fiber, Schema } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityPolicyFixture.layer)
const rules: PermissionV2.Ruleset = [
  { action: "read", resource: "*", effect: "allow" }, { action: "effect", resource: "*", effect: "allow" },
]

function fixture() {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules(rules)
    const binding = { ...f.binding, effectiveRules: rules }
    const jobs = yield* CapabilityJobs.make
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => CapabilityInvocation.withContext(binding, effect)
    const proof: CapabilityJobs.ProducerProof = {
      owner: binding.owner, producer: binding.invocation, rootToolName: binding.rootToolName,
    }
    const create = (kind: Capability.JobKind = "provider", creationKey?: string) => run(jobs.create(f.context, {
      kind, operation: "render", ...(creationKey === undefined ? {} : { creationKey }),
    }))
    const change = (ref: Capability.JobRef, expectedGeneration: number, state: Capability.JobState,
      observation: Schema.Json = {}, providerID?: string) => run(jobs.transition(f.context, ref, {
        expectedGeneration, state, observation, ...(providerID === undefined ? {} : { providerID }),
      }))
    return { ...f, binding, jobs, proof, run, create, change }
  })
}

function rejected<A, R>(effect: Effect.Effect<A, Capability.Failure, R>, code?: Capability.ErrorCode) {
  return Effect.gen(function* () {
    const error = yield* effect.pipe(Effect.flip)
    expect(error).toBeInstanceOf(Capability.Failure)
    if (code) expect(error.code).toBe(code)
    const wire = yield* Schema.encodeEffect(Capability.Failure)(error)
    expect(Object.keys(wire).sort()).toEqual(["_tag", "code", "message"])
    expect(JSON.stringify(wire)).not.toContain("secret")
    return error
  })
}

function settle(f: Effect.Success<ReturnType<typeof fixture>>) {
  return f.events.publish(SessionEvent.Tool.Failed, {
    sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
    callID: f.context.toolCallID, error: { type: "unknown", message: "settled" }, provider: { executed: false },
    timestamp: CapabilityPolicyFixture.timestamp,
  })
}

describe("CapabilityJobs durable receipts", () => {
  it.live("admit rejects unhashed reuse and reconciles only exact captured request hashes", () => Effect.gen(function* () {
    const f = yield* fixture()
    const input: CapabilityJobs.CreateInput = { kind: "provider", operation: "render", requestHash: "a".repeat(64) }
    const first = yield* f.run(f.jobs.admit(f.context, input))
    expect(first.reused).toBe(false)
    expect(yield* f.run(f.jobs.admit(f.context, input))).toEqual({ ref: first.ref, reused: true })
    yield* rejected(f.run(f.jobs.admit(f.context, { ...input, requestHash: "b".repeat(64) })), "outcome_unknown")
    yield* rejected(f.run(f.jobs.admit(f.context, { kind: "provider", operation: "render" })), "unsupported_schema")
    yield* f.database.db.update(CapabilityJobTable).set({ request_hash: null })
      .where(eq(CapabilityJobTable.id, first.ref.id)).run().pipe(Effect.orDie)
    yield* rejected(f.run(f.jobs.admit(f.context, input)), "outcome_unknown")
    expect(yield* f.database.db.select().from(CapabilityJobTable)).toHaveLength(1)
  }))

  it.live("persists intent and exact producer before dispatch; receipt is opaque bounded data", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    const stored = yield* f.database.db.select().from(CapabilityJobTable)
      .where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie)
    expect(stored).toMatchObject({ id: ref.id, kind: "provider", operation: "render", state: "intent",
      generation: 0, provider_id: null, owner: f.binding.owner, invocation: f.binding.invocation })
    expect(yield* f.run(f.jobs.read(f.context, ref))).toEqual({
      ref, generation: 0, kind: "provider", state: "intent", observation: {},
    })
    expect(yield* f.jobs.readHost(f.proof, ref)).toMatchObject({ receipt: { state: "intent" }, providerID: undefined })
    yield* rejected(f.jobs.observeHost(f.proof, ref, { expectedGeneration: 0, state: "submitting", observation: {} }),
      "unsupported_operation")
    expect((yield* f.run(f.jobs.read(f.context, ref))).generation).toBe(0)
  }))

  it.live("create reconciles exact/keyed/unknown/cancelled retries; conflicts never mint another intent", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    expect(yield* f.create()).toEqual(ref)
    yield* rejected(f.create("worker"), "outcome_unknown")
    const other = yield* f.create("provider", "secondary")
    expect(other).not.toEqual(ref)
    expect(yield* f.create("provider", "secondary")).toEqual(other)
    yield* f.change(ref, 0, "submitting")
    yield* f.change(ref, 1, "unknown")
    expect(yield* f.create()).toEqual(ref)
    expect((yield* f.jobs.readHost(f.proof, ref)).receipt).toMatchObject({ state: "unknown", generation: 2 })
    yield* f.change(other, 0, "cancelled")
    expect(yield* f.create("provider", "secondary")).toEqual(other)
    expect((yield* f.jobs.readHost(f.proof, other)).receipt).toMatchObject({ state: "cancelled", generation: 1 })
    const race = yield* Effect.all([f.create("worker", "concurrent"), f.create("worker", "concurrent")],
      { concurrency: "unbounded" })
    expect(race[0]).toEqual(race[1])
    yield* Effect.forEach(["bad key", "UPPER", "a".repeat(65)], (key) => rejected(f.create("provider", key), "unsupported_schema"))
    const rows = yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
    expect(rows).toHaveLength(3)
    rows.forEach((row) => expect(row.creation_key).toMatch(/^[a-f0-9]{64}$/))
  }))

  it.live("legacy null key adopts exact primary tuple; invariant conflicts and ambiguous tuples fail", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    yield* f.database.db.update(CapabilityJobTable).set({ creation_key: null })
      .where(eq(CapabilityJobTable.id, ref.id)).run().pipe(Effect.orDie)
    expect(yield* f.create()).toEqual(ref)
    expect(yield* f.database.db.select().from(CapabilityJobTable).where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie))
      .toMatchObject({ generation: 0, creation_key: expect.stringMatching(/^[a-f0-9]{64}$/) })
    yield* f.database.db.update(CapabilityJobTable).set({ creation_key: null, kind: "worker" })
      .where(eq(CapabilityJobTable.id, ref.id)).run().pipe(Effect.orDie)
    yield* rejected(f.create(), "outcome_unknown")
    yield* f.database.db.update(CapabilityJobTable).set({ kind: "provider" })
      .where(eq(CapabilityJobTable.id, ref.id)).run().pipe(Effect.orDie)
    const other = yield* f.create("provider", "secondary")
    yield* f.database.db.update(CapabilityJobTable).set({ creation_key: null })
      .where(eq(CapabilityJobTable.id, other.id)).run().pipe(Effect.orDie)
    yield* rejected(f.create(), "outcome_unknown")
    expect(yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)).toHaveLength(2)
  }))

  it.live("queued create snapshots caller kind/operation/key/refs before first suspension", () => Effect.gen(function* () {
    const f = yield* fixture()
    const input: CapabilityJobs.CreateInput = { kind: "provider", operation: "render", creationKey: "primary" }
    yield* CapabilityPolicyFixture.setRules([])
    const queued = yield* CapabilityPolicyFixture.queued(f.context, f.run(f.jobs.create(f.context, input)).pipe(Effect.asVoid))
    Object.assign(input, { kind: "worker", operation: "delete", creationKey: "mutated",
      connection: { id: Capability.ConnectionID.create(), provider: "secret", generation: 0 },
    })
    expect(queued.request.resources).toEqual(["capability:job:render"])
    yield* CapabilityPolicyFixture.setRules(rules)
    yield* f.permissions.reply({ requestID: queued.request.id, reply: "once" })
    expect((yield* queued.join)._tag).toBe("Success")
    const ref = yield* f.create()
    expect(yield* f.run(f.jobs.read(f.context, ref))).toMatchObject({ kind: "provider", state: "intent", generation: 0 })
    expect(yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)).toHaveLength(1)
  }).pipe(Effect.timeout("10 seconds")))

  it.live("queued transition snapshots state/generation/providerID/observation/ref/context before first suspension", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    yield* f.change(ref, 0, "submitting")
    const observation = { progress: 0.25 }
    const input: CapabilityJobs.TransitionInput = { expectedGeneration: 1, state: "submitted",
      providerID: "remote-original", observation }
    const suppliedRef = { ...ref }
    const context = { ...f.context }
    yield* CapabilityPolicyFixture.setRules([])
    const queued = yield* CapabilityPolicyFixture.queued(f.context,
      f.run(f.jobs.transition(context, suppliedRef, input)).pipe(Effect.asVoid))
    Object.assign(input, { expectedGeneration: 2, state: "completed", providerID: "secret-mutated" })
    observation.progress = 0.75
    Object.assign(suppliedRef, { id: Capability.JobID.create() })
    Object.assign(context, { toolCallID: "secret-mutated" })
    yield* CapabilityPolicyFixture.setRules(rules)
    yield* f.permissions.reply({ requestID: queued.request.id, reply: "once" })
    expect((yield* queued.join)._tag).toBe("Success")
    expect(yield* f.jobs.readHost(f.proof, ref)).toEqual({ providerID: "remote-original", receipt: {
      ref, generation: 2, kind: "provider", state: "submitted", observation: { progress: 0.25 },
    } })
  }).pipe(Effect.timeout("10 seconds")))

  it.live("transition validates current row at final writer, not pre-approval snapshot", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    yield* f.change(ref, 0, "submitting")
    yield* CapabilityPolicyFixture.setRules([])
    const queued = yield* CapabilityPolicyFixture.queued(f.context,
      f.change(ref, 2, "completed", { remoteOutcome: "completed", materialization: "failed" }, "remote-123").pipe(Effect.asVoid))
    expect(yield* f.jobs.observeHost(f.proof, ref, { expectedGeneration: 1, state: "running", providerID: "remote-123",
      observation: { progress: 0.5 } })).toMatchObject({ state: "running", generation: 2 })
    yield* CapabilityPolicyFixture.setRules(rules)
    yield* f.permissions.reply({ requestID: queued.request.id, reply: "once" })
    expect((yield* queued.join)._tag).toBe("Success")
    expect((yield* f.jobs.readHost(f.proof, ref)).receipt).toMatchObject({ state: "completed", generation: 3 })
  }).pipe(Effect.timeout("10 seconds")))

  it.live("host observation snapshots caller data/proof before waiting on actual SQLite writer", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    yield* f.change(ref, 0, "submitting")
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const started = yield* Deferred.make<void>()
    const writer = yield* f.database.db.transaction(() => Effect.gen(function* () {
      yield* Deferred.succeed(entered, undefined)
      yield* Deferred.await(release)
    }), { behavior: "immediate" }).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const observation = { progress: 0.25 }
    const input: CapabilityJobs.TransitionInput = { expectedGeneration: 1, state: "submitted",
      providerID: "remote-original", observation }
    const suppliedRef = { ...ref }
    const proof = { ...f.proof, owner: { ...f.proof.owner, location: { ...f.proof.owner.location } },
      producer: { ...f.proof.producer } }
    const observing = yield* Effect.gen(function* () {
      yield* Deferred.succeed(started, undefined)
      return yield* f.jobs.observeHost(proof, suppliedRef, input)
    }).pipe(Effect.forkChild)
    yield* Deferred.await(started)
    yield* Effect.yieldNow
    Object.assign(input, { expectedGeneration: 99, state: "completed", providerID: "secret-mutated" })
    observation.progress = 0.75
    Object.assign(proof.producer, { callID: "secret-mutated" })
    Object.assign(proof.owner.location, { directory: AbsolutePath.make("/secret-mutated") })
    Object.assign(suppliedRef, { id: Capability.JobID.create() })
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(writer)
    expect(yield* Fiber.join(observing)).toMatchObject({ generation: 2, state: "submitted", observation: { progress: 0.25 } })
    expect((yield* f.jobs.readHost(f.proof, ref)).providerID).toBe("remote-original")
  }).pipe(Effect.timeout("10 seconds")))

  it.live("direct terminal submission replies accepted only with known ID and consistent cross-fields", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    yield* f.change(ref, 0, "submitting")
    yield* rejected(f.change(ref, 1, "completed", { remoteOutcome: "completed", materialization: "failed" }), "outcome_unknown")
    yield* rejected(f.change(ref, 1, "completed", { remoteOutcome: "failed" }, "remote-123"), "unsupported_operation")
    yield* rejected(f.change(ref, 1, "failed", { remoteOutcome: "completed" }, "remote-123"), "unsupported_operation")
    yield* rejected(f.change(ref, 1, "failed", { remoteOutcome: "failed", materialization: "complete" }, "remote-123"),
      "unsupported_operation")
    expect(yield* f.change(ref, 1, "completed", { remoteOutcome: "completed", materialization: "failed" }, "remote-123"))
      .toMatchObject({ generation: 2, state: "completed" })
    yield* rejected(f.change(ref, 2, "completed", { remoteOutcome: "failed" }), "unsupported_operation")
  }))

  it.live("known provider ID reloads in new service after producer settles; replay only observes", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    yield* f.change(ref, 0, "submitting")
    yield* f.change(ref, 1, "submitted", {}, "remote-123")
    expect(JSON.stringify(yield* f.run(f.jobs.read(f.context, ref)))).not.toContain("remote-123")
    yield* settle(f)
    const restored = yield* CapabilityJobs.make
    expect(yield* restored.readHost(f.proof, ref)).toEqual({
      receipt: { ref, generation: 2, kind: "provider", state: "submitted", observation: {} }, providerID: "remote-123",
    })
    yield* restored.observeHost(f.proof, ref, { expectedGeneration: 2, state: "running", observation: { progress: 0.5 } })
    const known = yield* restored.observeHost(f.proof, ref, {
      expectedGeneration: 3, state: "completed", observation: { remoteOutcome: "completed", materialization: "failed" },
    })
    expect(known).toMatchObject({ state: "completed", generation: 4,
      observation: { remoteOutcome: "completed", materialization: "failed" } })
    yield* rejected(restored.observeHost(f.proof, ref, { expectedGeneration: 4, state: "submitting", observation: {} }),
      "unsupported_operation")
    yield* rejected(restored.observeHost(f.proof, ref, { expectedGeneration: 4, state: "failed", observation: {} }),
      "unsupported_operation")
    expect((yield* restored.readHost(f.proof, ref)).providerID).toBe("remote-123")
    yield* rejected(f.run(f.jobs.read(f.context, ref)), "invocation_binding_mismatch")
  }))

  it.live("invalid states fail; unknown submission never becomes dispatch retry; different provider ID conflicts", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    yield* rejected(f.change(ref, 0, "running", {}, "remote-123"), "unsupported_operation")
    yield* f.change(ref, 0, "submitting")
    yield* rejected(f.change(ref, 1, "submitted"), "outcome_unknown")
    yield* f.change(ref, 1, "unknown")
    const restored = yield* CapabilityJobs.make
    expect((yield* restored.readHost(f.proof, ref)).receipt).toMatchObject({ state: "unknown", generation: 2 })
    yield* rejected(f.change(ref, 2, "submitting"), "unsupported_operation")
    yield* rejected(f.change(ref, 2, "intent"), "unsupported_operation")
    yield* rejected(restored.observeHost(f.proof, ref, { expectedGeneration: 2, state: "running", observation: {} }),
      "outcome_unknown")
    yield* restored.observeHost(f.proof, ref, {
      expectedGeneration: 2, state: "submitted", providerID: "remote-123", observation: {},
    })
    yield* rejected(f.change(ref, 3, "running", {}, "secret-other-provider-id"), "outcome_unknown")
    expect(yield* restored.readHost(f.proof, ref)).toMatchObject({ providerID: "remote-123",
      receipt: { state: "submitted", generation: 3 } })
  }))

  it.live("SQLite CAS race admits exactly one generation update; stale writer changes nothing", () => Effect.gen(function* () {
    const f = yield* fixture()
    const otherService = yield* CapabilityJobs.make
    const ref = yield* f.create("worker")
    yield* f.change(ref, 0, "submitting")
    yield* f.change(ref, 1, "running")
    // Real permission queue fences both row reads before either writer reaches SQLite CAS.
    yield* CapabilityPolicyFixture.setRules([])
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const left = yield* f.change(ref, 2, "running", { progress: 0.25 }).pipe(Effect.result, Effect.forkChild)
    const right = yield* f.run(otherService.transition(f.context, ref, { expectedGeneration: 2, state: "running",
      observation: { progress: 0.75 } })).pipe(Effect.result, Effect.forkChild)
    yield* Deferred.await(observation.repeated)
    const pending = yield* f.permissions.list()
    expect(pending).toHaveLength(2)
    yield* CapabilityPolicyFixture.setRules(rules)
    yield* Effect.forEach(pending, (request) => f.permissions.reply({ requestID: request.id, reply: "once" }))
    const results = yield* Effect.all([Fiber.join(left), Fiber.join(right)])
    expect(results.filter((result) => result._tag === "Success")).toHaveLength(1)
    expect(results.filter((result) => result._tag === "Failure")).toHaveLength(1)
    results.forEach((result) => { if (result._tag === "Failure") expect(result.failure.code).toBe("stale_descriptor") })
    const current = yield* f.run(f.jobs.read(f.context, ref))
    expect(current.generation).toBe(3)
    expect(current.observation.progress === 0.25 || current.observation.progress === 0.75).toBe(true)
    yield* rejected(f.change(ref, 2, "completed"), "stale_descriptor")
    expect(yield* f.run(f.jobs.read(f.context, ref))).toEqual(current)
  }).pipe(Effect.timeout("10 seconds")))

  it.live("same project grants no cross-Session or actor authority; host proof and placement must match", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    const other = yield* fixture()
    yield* rejected(other.run(other.jobs.read(other.context, ref)), "target_denied")
    yield* rejected(other.run(other.jobs.transition(other.context, ref, {
      expectedGeneration: 0, state: "submitting", observation: {},
    })), "target_denied")
    yield* rejected(other.jobs.readHost(other.proof, ref), "target_denied")
    yield* rejected(f.jobs.readHost({ ...f.proof, producer: { ...f.proof.producer, callID: "secret-forged" } }, ref),
      "target_denied")
    yield* rejected(f.jobs.readHost({ ...f.proof, owner: { ...f.proof.owner, agentID: other.context.agent,
      sessionID: other.context.sessionID } }, ref), "target_denied")
    const wrong = yield* CapabilityJobs.make.pipe(Effect.provideService(Location.Service, {
      ...CapabilityPolicyFixture.placement, workspaceID: WorkspaceID.make("wrk_other"),
    }))
    yield* rejected(wrong.readHost(f.proof, ref), "target_denied")
    yield* f.events.publish(SessionEvent.Moved, { sessionID: f.context.sessionID,
      location: { directory: AbsolutePath.make("/other") }, timestamp: CapabilityPolicyFixture.timestamp })
    yield* rejected(f.run(f.jobs.read(f.context, ref)), "invocation_binding_mismatch")
    yield* rejected(f.jobs.readHost(f.proof, ref), "target_denied")
  }))

  it.live("current policy revokes disclosure/external execution without discarding already-acquired completion", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    yield* f.change(ref, 0, "submitting")
    yield* f.change(ref, 1, "submitted", {}, "remote-123")
    yield* CapabilityPolicyFixture.setRules([
      { action: "read", resource: "*", effect: "deny" }, { action: "effect", resource: "*", effect: "deny" },
    ])
    yield* rejected(f.run(f.jobs.read(f.context, ref)), "target_denied")
    yield* rejected(f.change(ref, 2, "running"), "target_denied")
    yield* settle(f)
    expect(yield* f.jobs.observeHost(f.proof, ref, { expectedGeneration: 2, state: "completed",
      observation: { remoteOutcome: "completed", materialization: "failed" } })).toMatchObject({ state: "completed" })
    yield* rejected(f.jobs.readHost(f.proof, ref), "target_denied")
    yield* CapabilityPolicyFixture.setRules(rules)
    expect((yield* f.jobs.readHost(f.proof, ref)).receipt).toMatchObject({ generation: 3, state: "completed",
      observation: { remoteOutcome: "completed", materialization: "failed" } })
  }))

  it.live("host receipt read requires captured and current read allow; deny/ask do not become current grants", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.forEach(["deny", "ask", "allow"] as const, (effect) => Effect.gen(function* () {
      const binding = { ...f.binding, effectiveRules: [
        { action: "effect", resource: "*", effect: "allow" as const }, { action: "read", resource: "*", effect },
      ] }
      const ref = yield* CapabilityInvocation.withContext(binding,
        f.jobs.create(f.context, { kind: "provider", operation: "render", creationKey: effect }))
      // Current configuration allows read throughout; persisted root's captured rules still restrict disclosure.
      expect(yield* f.permissions.evaluate({ sessionID: f.context.sessionID, agent: f.context.agent,
        action: "read", resources: ["capability:job:render"] })).toBe("allow")
      if (effect !== "allow") yield* rejected(f.jobs.readHost(f.proof, ref), "target_denied")
      if (effect === "allow") expect((yield* f.jobs.readHost(f.proof, ref)).receipt).toMatchObject({ state: "intent", generation: 0 })
      yield* CapabilityInvocation.withContext(binding, f.jobs.transition(f.context, ref, {
        expectedGeneration: 0, state: "submitting", observation: {},
      }))
      // Acquired-fact recording is provenance-only, including when this producer cannot disclose receipts.
      expect(yield* f.jobs.observeHost(f.proof, ref, { expectedGeneration: 1, state: "completed", providerID: "remote-123",
        observation: { remoteOutcome: "completed", materialization: "failed" } })).toMatchObject({ state: "completed" })
      if (effect !== "allow") yield* rejected(f.jobs.readHost(f.proof, ref), "target_denied")
    }))
  }))

  it.live("fresh real owner root can read; different producer or actor cannot transition", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    yield* settle(f)
    yield* Effect.forEach([f.context.agent, AgentV2.ID.make("reviewer")], (agent) => Effect.gen(function* () {
      const context = { ...f.context, agent, assistantMessageID: SessionMessage.ID.create(), toolCallID: "reader-call" }
      yield* f.events.publish(SessionEvent.Step.Started, { ...context, timestamp: CapabilityPolicyFixture.timestamp,
        model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") },
      })
      yield* f.events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID,
        assistantMessageID: context.assistantMessageID, callID: context.toolCallID, name: "service_call",
        timestamp: CapabilityPolicyFixture.timestamp,
      })
      const binding = { ...f.binding, owner: { ...f.binding.owner, agentID: agent }, invocation: {
        sessionID: context.sessionID, agentID: agent, assistantMessageID: context.assistantMessageID, callID: context.toolCallID,
      } }
      const read = CapabilityInvocation.withContext(binding, f.jobs.read(context, ref))
      if (agent === f.context.agent) expect((yield* read).state).toBe("intent")
      if (agent !== f.context.agent) yield* rejected(read, "target_denied")
      yield* rejected(CapabilityInvocation.withContext(binding, f.jobs.transition(context, ref, {
        expectedGeneration: 0, state: "submitting", observation: {},
      })), "target_denied")
    }))
  }))

  it.live("cancel request never claims remote stop; unsupported stays live until confirmed", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create()
    yield* f.change(ref, 0, "submitting")
    yield* f.change(ref, 1, "running", {}, "remote-123")
    yield* rejected(f.change(ref, 2, "cancelled", { cancellation: "confirmed" }), "unsupported_operation")
    yield* rejected(f.change(ref, 2, "cancel-requested"), "unsupported_operation")
    yield* rejected(f.change(ref, 2, "running", { cancellation: "confirmed" }), "unsupported_operation")
    expect(yield* f.change(ref, 2, "running", { cancellation: "unsupported" })).toMatchObject({ state: "running" })
    expect(yield* f.change(ref, 3, "cancel-requested", { cancellation: "requested" })).toMatchObject({
      state: "cancel-requested", observation: { cancellation: "requested" },
    })
    expect(yield* f.change(ref, 4, "cancel-requested", { cancellation: "unsupported" })).toMatchObject({
      state: "cancel-requested", observation: { cancellation: "unsupported" },
    })
    expect((yield* f.jobs.readHost(f.proof, ref)).providerID).toBe("remote-123")
    yield* rejected(f.change(ref, 5, "cancelled", { cancellation: "requested" }), "unsupported_operation")
    expect(yield* f.change(ref, 5, "cancelled", { cancellation: "confirmed" })).toMatchObject({ state: "cancelled" })
    const undispatched = yield* f.create("script", "undispatched")
    expect(yield* f.change(undispatched, 0, "cancelled")).toMatchObject({ state: "cancelled" })
  }))

  it.live("local process reload never respawns; only explicit startup-owner absence marks lost", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create("local-process")
    yield* f.change(ref, 0, "submitting")
    yield* f.change(ref, 1, "running")
    const restored = yield* CapabilityJobs.make
    expect((yield* restored.readHost(f.proof, ref)).receipt.state).toBe("running")
    yield* rejected(f.change(ref, 2, "lost"), "unsupported_operation")
    yield* rejected(f.change(ref, 2, "running", { processHandle: 123 }), "unsupported_schema")
    expect(yield* restored.markLostHost(f.proof, ref, {
      expectedGeneration: 2, evidence: "startup-owner-absent",
    })).toMatchObject({ state: "lost", generation: 3 })
    yield* rejected(f.change(ref, 3, "submitting"), "unsupported_operation")
    const remote = yield* f.create("provider", "remote")
    yield* f.change(remote, 0, "submitting")
    yield* rejected(restored.markLostHost(f.proof, remote, { expectedGeneration: 1, evidence: "startup-owner-absent" }),
      "unsupported_operation")
  }))

  it.live("JSON finite/depth/node/byte limits and closed schema reject before SQLite update", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create("worker")
    yield* f.change(ref, 0, "submitting")
    const cyclic: { [key: string]: Schema.Json } = {}
    cyclic.self = cyclic
    const deep = Array.from({ length: 10 }).reduce<Schema.Json>((value) => ({ nested: value }), {})
    yield* Effect.forEach([
      { progress: Infinity }, { progress: NaN }, { raw: "x".repeat(4097) },
      { raw: Array.from({ length: 257 }, () => null) }, cyclic, deep,
      { artifactRefs: new Array<Schema.Json>(3) }, { artifactRefs: new Array<Schema.Json>(1_000_000_000) },
      { ["x".repeat(4097)]: null },
      Object.fromEntries(Array.from({ length: 1024 }, (_, index) => [`key${index}`, null])),
    ], (value) => rejected(f.change(ref, 1, "running", value), "quota_exceeded"))
    const invalid: Schema.Json[] = [
      { progress: 2 }, { url: "https://secret.example/file?signature=secret" },
      { token: "secret" }, { artifactRefs: [{ id: "secret", revision: 0 }] },
      { materialization: "retryprovider" },
    ]
    yield* Effect.forEach(invalid, (value) => rejected(f.change(ref, 1, "running", value), "unsupported_schema"))
    yield* rejected(f.run(f.jobs.create(f.context, { kind: "worker", operation: "secret/invalid" })), "unsupported_schema")
    const forged = { kind: "worker" as const, operation: "render", owner: f.binding.owner }
    yield* rejected(f.run(f.jobs.create(f.context, forged)),
      "unsupported_schema")
    yield* rejected(CapabilityInvocation.withContext({ ...f.binding, effectiveRules: [...rules, {
      action: "effect", resource: "secret".repeat(4000), effect: "allow",
    }] }, f.jobs.create(f.context, { kind: "worker", operation: "render" })), "quota_exceeded")
    yield* rejected(f.run(f.jobs.transition(f.context, ref, Object.assign({
      expectedGeneration: 1, state: "running" as const, observation: {},
    }, { state: "partial" }))), "unsupported_operation")
    yield* rejected(f.change(ref, -1, "running"), "stale_descriptor")
    yield* rejected(f.change(ref, 1.5, "running"), "stale_descriptor")
    expect((yield* f.run(f.jobs.read(f.context, ref))).generation).toBe(1)
    expect(yield* f.change(ref, 1, "running", { progress: 1 })).toMatchObject({ observation: { progress: 1 } })
  }))

  it.live("JSON snapshot ignores hidden array map/constructor/species hooks; ordinary arrays still copy", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create("worker")
    yield* f.change(ref, 0, "submitting")
    const artifact: Capability.ArtifactRef = { id: Capability.ArtifactID.create(), revision: 0 }
    yield* f.database.db.insert(CapabilityArtifactTable).values({ ...artifact, owner: f.binding.owner,
      producer: f.binding.invocation, mime: "text/plain", kind: "text", hash: "test", bytes: 0,
      verification: "observed", metadata: {},
    }).run().pipe(Effect.orDie)
    yield* f.database.db.insert(CapabilityArtifactReferenceTable).values({ artifact_id: artifact.id,
      revision: artifact.revision, session_id: f.context.sessionID,
    }).run().pipe(Effect.orDie)
    yield* Effect.forEach(["map-getter", "map-function", "constructor-getter", "species-getter", "ordinary"] as const,
      (hook, index) => Effect.gen(function* () {
        const calls = { value: 0 }
        const refs = [artifact]
        if (hook === "map-getter") Object.defineProperty(refs, "map", { get() {
          calls.value++
          throw new Error("CALLER_MAP_GETTER_EXECUTED")
        } })
        if (hook === "map-function") Object.defineProperty(refs, "map", { value: () => {
          calls.value++
          return [artifact]
        } })
        if (hook === "constructor-getter") Object.defineProperty(refs, "constructor", { get() {
          calls.value++
          throw new Error("CALLER_CONSTRUCTOR_GETTER_EXECUTED")
        } })
        if (hook === "species-getter") Object.defineProperty(refs, "constructor", { value: {
          get [Symbol.species]() {
            calls.value++
            throw new Error("CALLER_SPECIES_GETTER_EXECUTED")
          },
        } })
        const receipt = yield* f.change(ref, index + 1, "running", { artifactRefs: refs })
        expect(calls.value).toBe(0)
        expect(receipt.observation.artifactRefs).toEqual([artifact])
        expect(receipt.observation.artifactRefs).not.toBe(refs)
      }))
    const getter = { calls: 0 }
    const invalid: { [key: string]: Schema.Json } = {}
    Object.defineProperty(invalid, "progress", { enumerable: true, get() {
      getter.calls++
      throw new Error("CALLER_OBJECT_GETTER_EXECUTED")
    } })
    yield* rejected(f.change(ref, 6, "running", invalid), "quota_exceeded")
    expect(getter.calls).toBe(0)
    expect((yield* f.run(f.jobs.read(f.context, ref))).generation).toBe(6)
  }))

  it.live("execution validates wildcard/current refs; receipt and acquired completion survive retarget/removal", () => Effect.gen(function* () {
    const f = yield* fixture()
    const connection: Capability.ConnectionRef = { id: Capability.ConnectionID.create(), provider: "test", generation: 0 }
    const target: Capability.TargetRef = { id: Capability.TargetID.create(), connectionID: connection.id, generation: 0,
      environment: "test" }
    yield* f.database.db.insert(CapabilityConnectionTable).values({ id: connection.id,
      project_id: f.binding.owner.projectID, directory: f.binding.owner.location.directory,
      provider: connection.provider, integration_id: Integration.ID.make("test"), subject_id: "subject",
      endpoint: "https://secret.example", scope_hash: "scope", state: "active",
    }).run().pipe(Effect.orDie)
    yield* f.database.db.insert(CapabilityTargetTable).values({ id: target.id, connection_id: connection.id,
      environment: target.environment, resource: {},
    }).run().pipe(Effect.orDie)
    const input = { kind: "provider" as const, operation: "render", connection, target }
    yield* rejected(f.run(f.jobs.create(f.context, input)), "target_denied")
    yield* f.database.db.insert(CapabilityBindingTable).values({ target_id: target.id,
      session_id: f.context.sessionID, agent_id: f.context.agent, actions: ["*"],
    }).run().pipe(Effect.orDie)
    const ref = yield* f.run(f.jobs.create(f.context, input))
    yield* f.change(ref, 0, "submitting")
    yield* CapabilityPolicyFixture.setRules([])
    const queued = yield* CapabilityPolicyFixture.queued(f.context, f.change(ref, 1, "running", {}, "remote-123").pipe(Effect.asVoid))
    yield* f.database.db.update(CapabilityTargetTable).set({ generation: 1 }).where(eq(CapabilityTargetTable.id, target.id))
      .run().pipe(Effect.orDie)
    yield* CapabilityPolicyFixture.setRules(rules)
    yield* f.permissions.reply({ requestID: queued.request.id, reply: "once" })
    const result = yield* queued.join
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.code).toBe("stale_descriptor")
    expect((yield* f.run(f.jobs.read(f.context, ref))).state).toBe("submitting")
    yield* rejected(f.change(ref, 1, "running", {}, "remote-123"), "stale_descriptor")
    yield* f.database.db.update(CapabilityTargetTable).set({ generation: 0 }).where(eq(CapabilityTargetTable.id, target.id))
      .run().pipe(Effect.orDie)
    yield* f.database.db.update(CapabilityConnectionTable).set({ state: "revoked" }).where(eq(CapabilityConnectionTable.id, connection.id))
      .run().pipe(Effect.orDie)
    expect((yield* f.jobs.readHost(f.proof, ref)).receipt.state).toBe("submitting")
    yield* rejected(f.change(ref, 1, "running", {}, "remote-123"), "connection_unavailable")
    yield* f.database.db.update(CapabilityConnectionTable).set({ state: "active", generation: 1 })
      .where(eq(CapabilityConnectionTable.id, connection.id)).run().pipe(Effect.orDie)
    expect((yield* f.run(f.jobs.read(f.context, ref))).state).toBe("submitting")
    yield* f.database.db.update(CapabilityConnectionTable).set({ generation: 0 })
      .where(eq(CapabilityConnectionTable.id, connection.id)).run().pipe(Effect.orDie)
    yield* f.database.db.delete(CapabilityBindingTable).where(eq(CapabilityBindingTable.target_id, target.id))
      .run().pipe(Effect.orDie)
    expect((yield* f.run(f.jobs.read(f.context, ref))).state).toBe("submitting")
    yield* rejected(f.change(ref, 1, "running", {}, "remote-123"), "target_denied")
    yield* CapabilityPolicyFixture.setRules([{ action: "read", resource: "*", effect: "allow" },
      { action: "effect", resource: "*", effect: "deny" }])
    expect(yield* f.jobs.observeHost(f.proof, ref, { expectedGeneration: 1, state: "completed", providerID: "remote-123",
      observation: { remoteOutcome: "completed", materialization: "failed" } })).toMatchObject({ state: "completed" })
    expect((yield* f.run(f.jobs.read(f.context, ref))).observation.remoteOutcome).toBe("completed")
  }))

  it.live("completed artifacts need real revision/retention and placement; shared Session/actor allowed", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create("worker")
    yield* f.change(ref, 0, "submitting")
    yield* f.change(ref, 1, "running")
    const artifact: Capability.ArtifactRef = { id: Capability.ArtifactID.create(), revision: 0 }
    const complete = { artifactRefs: [artifact], materialization: "complete" }
    yield* rejected(f.change(ref, 2, "completed", complete), "target_denied")
    yield* f.database.db.insert(CapabilityArtifactTable).values({ ...artifact, owner: f.binding.owner,
      producer: f.binding.invocation, mime: "text/plain", kind: "text", hash: "test", bytes: 0,
      verification: "observed", metadata: {},
    }).run().pipe(Effect.orDie)
    yield* rejected(f.change(ref, 2, "completed", complete), "target_denied")
    yield* f.database.db.insert(CapabilityArtifactReferenceTable).values({ artifact_id: artifact.id,
      revision: artifact.revision, session_id: f.context.sessionID,
    }).run().pipe(Effect.orDie)
    const other = yield* fixture()
    yield* f.database.db.update(CapabilityArtifactTable).set({ owner: { ...other.binding.owner,
      location: { directory: AbsolutePath.make("/elsewhere") } } }).where(and(
      eq(CapabilityArtifactTable.id, artifact.id), eq(CapabilityArtifactTable.revision, 0),
    )).run().pipe(Effect.orDie)
    yield* rejected(f.change(ref, 2, "completed", complete), "target_denied")
    yield* f.database.db.update(CapabilityArtifactTable).set({ owner: { ...other.binding.owner,
      agentID: AgentV2.ID.make("reviewer") } }).where(eq(CapabilityArtifactTable.id, artifact.id))
      .run().pipe(Effect.orDie)
    yield* rejected(f.change(ref, 2, "completed", { artifactRefs: [{ ...artifact, revision: 1 }] }), "target_denied")
    expect(yield* f.change(ref, 2, "completed", complete)).toMatchObject({ state: "completed", observation: complete })
  }))

  it.live("real permission queue interruption and corrupt persisted projections remain interruption/defect", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.create("worker")
    const queued = yield* CapabilityPolicyFixture.queued(f.context, CapabilityInvocation.withContext({
      ...f.binding, effectiveRules: [],
    }, f.jobs.read(f.context, ref).pipe(Effect.asVoid)))
    yield* Fiber.interrupt(queued.fiber)
    const exit = yield* Fiber.await(queued.fiber)
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") expect(exit.cause.reasons.some(Cause.isInterruptReason)).toBe(true)
    expect(yield* f.permissions.list()).toEqual([])
    yield* f.database.db.update(SessionMessageTable).set({ data: { time: { created: 1 } } })
      .where(eq(SessionMessageTable.id, f.context.assistantMessageID)).run().pipe(Effect.orDie)
    const corrupt = yield* f.jobs.readHost(f.proof, ref).pipe(Effect.exit)
    expect(corrupt._tag).toBe("Failure")
    if (corrupt._tag === "Failure") expect(corrupt.cause.reasons.some(Cause.isDieReason)).toBe(true)
  }).pipe(Effect.timeout("10 seconds")))
})
