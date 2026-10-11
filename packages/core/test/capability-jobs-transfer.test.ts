import { describe, expect } from "bun:test"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityJobs } from "@orchestra/core/capability/job/index"
import { CapabilityJobTable } from "@orchestra/core/capability/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { Capability } from "@orchestra/schema/capability"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityPolicyFixture.layer)
const rules: PermissionRules = [
  { action: "read", resource: "*", effect: "allow" }, { action: "effect", resource: "*", effect: "allow" },
]
type PermissionRules = Parameters<typeof CapabilityPolicyFixture.setRules>[0]

function fixture() {
  return Effect.gen(function* () {
    const child = yield* CapabilityPolicyFixture.fixture()
    const parent = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules(rules)
    const binding = { ...child.binding, effectiveRules: rules }
    const jobs = yield* CapabilityJobs.make
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => CapabilityInvocation.withContext(binding, effect)
    const proof: CapabilityJobs.ProducerProof = {
      owner: binding.owner, producer: binding.invocation, rootToolName: binding.rootToolName,
    }
    const started = (kind: Capability.JobKind, key: string, states: Capability.JobState[]) => Effect.gen(function* () {
      const ref = yield* run(jobs.create(child.context, { kind, operation: "render", creationKey: key }))
      yield* Effect.forEach(states, (state, generation) => run(jobs.transition(child.context, ref, {
        expectedGeneration: generation, state, observation: {}, ...(kind === "provider" ? { providerID: "remote-1" } : {}),
      })))
      return ref
    })
    const row = (ref: Capability.JobRef) => child.database.db.select().from(CapabilityJobTable)
      .where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie)
    return { child, parent, binding, jobs, run, proof, started, row }
  })
}

function rejected<A, R>(effect: Effect.Effect<A, Capability.Failure, R>, code: Capability.ErrorCode) {
  return Effect.gen(function* () {
    const error = yield* effect.pipe(Effect.flip)
    expect(error).toBeInstanceOf(Capability.Failure)
    expect(error.code).toBe(code)
    expect(Object.keys(yield* Schema.encodeEffect(Capability.Failure)(error)).sort()).toEqual(["_tag", "code", "message"])
  })
}

describe("CapabilityJobs.transferHost", () => {
  it.live("moves a running local process to another Session; only the new owner proof works afterwards", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = yield* f.started("local-process", "primary", ["submitting", "running"])
    const before = yield* f.row(ref)
    const owner = f.parent.binding.owner
    expect(yield* f.jobs.transferHost(f.proof, ref, { expectedGeneration: 2, owner }))
      .toEqual({ ref, generation: 3, kind: "local-process", state: "running", observation: {} })
    const after = yield* f.row(ref)
    expect(after).toMatchObject({ owner, invocation: before?.invocation, state: "running", generation: 3 })
    const moved = { ...f.proof, owner }
    expect((yield* f.jobs.readHost(moved, ref)).receipt).toMatchObject({ state: "running", generation: 3 })
    expect(yield* f.jobs.observeHost(moved, ref, { expectedGeneration: 3, state: "running", observation: { progress: 0.5 } }))
      .toMatchObject({ generation: 4, observation: { progress: 0.5 } })
    // A fresh service reload keeps the producer provenance across the owner change.
    const restored = yield* CapabilityJobs.make
    expect((yield* restored.readHost(moved, ref)).receipt.generation).toBe(4)
    yield* rejected(f.jobs.readHost(f.proof, ref), "target_denied")
    yield* rejected(f.jobs.observeHost(f.proof, ref, { expectedGeneration: 4, state: "running", observation: {} }),
      "target_denied")
    yield* rejected(f.jobs.markLostHost(f.proof, ref, { expectedGeneration: 4, evidence: "startup-owner-absent" }),
      "target_denied")
    yield* rejected(f.jobs.transferHost(f.proof, ref, { expectedGeneration: 4, owner: f.proof.owner }), "target_denied")
    yield* rejected(f.run(f.jobs.read(f.child.context, ref)), "target_denied")
    // The startup sweep builds its proof from the stored current owner, so the moved proof still marks lost.
    expect(yield* f.jobs.markLostHost(moved, ref, { expectedGeneration: 4, evidence: "startup-owner-absent" }))
      .toMatchObject({ state: "lost", generation: 5 })
  }))

  it.live("repeated transfer keeps original producer provenance; only the latest owner proof works", () => Effect.gen(function* () {
    const f = yield* fixture()
    const grandparent = yield* CapabilityPolicyFixture.fixture()
    // Each fixture resets the agent rules to read-only; restore effect permission for job creation.
    yield* CapabilityPolicyFixture.setRules(rules)
    const ref = yield* f.started("local-process", "primary", ["submitting", "running"])
    const owners = [f.proof.owner, f.parent.binding.owner, grandparent.binding.owner]
    yield* f.jobs.transferHost(f.proof, ref, { expectedGeneration: 2, owner: owners[1] })
    expect(yield* f.jobs.transferHost({ ...f.proof, owner: owners[1] }, ref, { expectedGeneration: 3, owner: owners[2] }))
      .toMatchObject({ state: "running", generation: 4 })
    expect((yield* f.jobs.readHost({ ...f.proof, owner: owners[2] }, ref)).receipt.generation).toBe(4)
    yield* Effect.forEach(owners.slice(0, 2), (owner) => rejected(f.jobs.readHost({ ...f.proof, owner }, ref), "target_denied"))
    expect(yield* f.jobs.observeHost({ ...f.proof, owner: owners[2] }, ref,
      { expectedGeneration: 4, state: "running", observation: { progress: 0.5 } })).toMatchObject({ generation: 5 })
  }))

  it.live("wrong kind, state, placement, Session, generation or proof fail without writes", () => Effect.gen(function* () {
    const f = yield* fixture()
    const owner = f.parent.binding.owner
    const running = yield* f.started("local-process", "primary", ["submitting", "running"])
    const submitting = yield* f.started("local-process", "early", ["submitting"])
    const provider = yield* f.started("provider", "remote", ["submitting", "running"])
    const snapshot = yield* Effect.forEach([running, submitting, provider], f.row)
    yield* rejected(f.jobs.transferHost(f.proof, provider, { expectedGeneration: 2, owner }), "unsupported_operation")
    yield* rejected(f.jobs.transferHost(f.proof, submitting, { expectedGeneration: 1, owner }), "unsupported_operation")
    yield* rejected(f.jobs.transferHost(f.proof, running, { expectedGeneration: 2,
      owner: { ...owner, location: { directory: AbsolutePath.make("/elsewhere") } } }), "target_denied")
    yield* rejected(f.jobs.transferHost(f.proof, running, { expectedGeneration: 2, owner: f.proof.owner }), "target_denied")
    yield* rejected(f.jobs.transferHost(f.proof, running, { expectedGeneration: 2,
      owner: { ...owner, sessionID: SessionV2.ID.create() } }), "target_denied")
    yield* rejected(f.jobs.transferHost(f.proof, running, { expectedGeneration: 1, owner }), "stale_descriptor")
    yield* rejected(f.jobs.transferHost(f.proof, running, { expectedGeneration: -1, owner }), "stale_descriptor")
    yield* rejected(f.jobs.transferHost({ ...f.proof, producer: { ...f.proof.producer, callID: "forged" } }, running,
      { expectedGeneration: 2, owner }), "target_denied")
    yield* rejected(f.jobs.transferHost({ ...f.proof, owner }, running, { expectedGeneration: 2, owner }), "target_denied")
    expect(yield* Effect.forEach([running, submitting, provider], f.row)).toEqual(snapshot)
  }))

})
