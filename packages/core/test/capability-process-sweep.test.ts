import { describe, expect } from "bun:test"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityJobs } from "@orchestra/core/capability/job/index"
import { CapabilityProcessSweep } from "@orchestra/core/capability/process-control/sweep"
import { CapabilityJobTable } from "@orchestra/core/capability/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { Capability } from "@orchestra/schema/capability"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityPolicyFixture.layer)
const rules: Parameters<typeof CapabilityPolicyFixture.setRules>[0] = [
  { action: "read", resource: "*", effect: "allow" }, { action: "effect", resource: "*", effect: "allow" },
]
const placement = { projectID: CapabilityPolicyFixture.placement.project.id,
  location: { directory: CapabilityPolicyFixture.placement.directory } }

describe("CapabilityProcessSweep.run", () => {
  it.live("marks lost only absent, older, same-placement, non-terminal local processes", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules(rules)
    const binding = { ...f.binding, effectiveRules: rules }
    const jobs = yield* CapabilityJobs.make
    const db = f.database.db
    const job = (kind: Capability.JobKind, key: string, states: Capability.JobState[]) => Effect.gen(function* () {
      const ref = yield* CapabilityInvocation.withContext(binding,
        jobs.create(f.context, { kind, operation: "render", creationKey: key }))
      yield* Effect.forEach(states, (state, generation) => CapabilityInvocation.withContext(binding,
        jobs.transition(f.context, ref, { expectedGeneration: generation, state,
          observation: state === "cancel-requested" ? { cancellation: "requested" } : {},
          ...(kind === "provider" ? { providerID: "remote-1" } : {}) })))
      return ref
    })
    const row = (ref: Capability.JobRef) => db.select().from(CapabilityJobTable)
      .where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie)
    const startedAt = Date.now() + 60_000
    const eligible = yield* Effect.all([
      job("local-process", "submitting", ["submitting"]),
      job("local-process", "submitted", ["submitting", "submitted"]),
      job("local-process", "running", ["submitting", "running"]),
      job("local-process", "cancel", ["submitting", "running", "cancel-requested"]),
      job("local-process", "unknown", ["submitting", "unknown"]),
    ])
    const live = yield* job("local-process", "live", ["submitting", "running"])
    const newer = yield* job("local-process", "newer", ["submitting", "running"])
    yield* db.update(CapabilityJobTable).set({ time_created: startedAt }).where(eq(CapabilityJobTable.id, newer.id))
      .run().pipe(Effect.orDie)
    const elsewhere = yield* job("local-process", "elsewhere", ["submitting", "running"])
    const workspace = yield* job("local-process", "workspace", ["submitting", "running"])
    const owner = binding.owner
    yield* db.update(CapabilityJobTable).set({ owner: { ...owner, location: { directory: AbsolutePath.make("/other") } } })
      .where(eq(CapabilityJobTable.id, elsewhere.id)).run().pipe(Effect.orDie)
    yield* db.update(CapabilityJobTable).set({ owner: { ...owner,
      location: { ...owner.location, workspaceID: WorkspaceID.make("wrk_other") } } })
      .where(eq(CapabilityJobTable.id, workspace.id)).run().pipe(Effect.orDie)
    const untouched = [live, newer, elsewhere, workspace, ...yield* Effect.all([
      job("local-process", "intent", []),
      job("local-process", "completed", ["submitting", "completed"]),
      job("local-process", "failed", ["submitting", "failed"]),
      job("provider", "remote", ["submitting", "running"]),
    ])]
    const before = yield* Effect.forEach([...eligible, ...untouched], row)

    expect(yield* CapabilityProcessSweep.run({ jobs, live: new Set([live.id]), startedAt, placement }))
      .toEqual({ marked: eligible.length, skipped: 0 })

    const after = yield* Effect.forEach([...eligible, ...untouched], row)
    after.slice(0, eligible.length).forEach((current, index) => {
      const previous = before[index]
      expect(current?.state).toBe("lost")
      expect(current?.generation).toBe((previous?.generation ?? -2) + 1)
      // Only durable state moves (markLostHost resets the model observation): owner, invocation and provenance stay.
      const fixed = (value: typeof current) => ({ ...value, state: undefined, generation: undefined, time_updated: undefined,
        observation: { ...(value?.observation instanceof Object ? value.observation : {}), data: undefined } })
      expect(fixed(current)).toEqual(fixed(previous))
    })
    expect(after.slice(eligible.length)).toEqual(before.slice(eligible.length))
    expect(yield* CapabilityProcessSweep.run({ jobs, live: new Set([live.id]), startedAt, placement }))
      .toEqual({ marked: 0, skipped: 0 })
  }))

  it.live("per-row proof failures are skipped without aborting the rest of the sweep", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    const other = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules(rules)
    const binding = { ...f.binding, effectiveRules: rules }
    const jobs = yield* CapabilityJobs.make
    const job = (key: string) => Effect.gen(function* () {
      const ref = yield* CapabilityInvocation.withContext(binding,
        jobs.create(f.context, { kind: "local-process", operation: "render", creationKey: key }))
      yield* CapabilityInvocation.withContext(binding,
        jobs.transition(f.context, ref, { expectedGeneration: 0, state: "submitting", observation: {} }))
      return ref
    })
    const forged = yield* job("forged")
    const corrupt = yield* job("corrupt")
    const good = yield* job("good")
    // Owner rewritten without provenance: host proof check rejects it.
    yield* f.database.db.update(CapabilityJobTable).set({ owner: other.binding.owner })
      .where(eq(CapabilityJobTable.id, forged.id)).run().pipe(Effect.orDie)
    yield* f.database.db.update(CapabilityJobTable).set({ observation: { data: {} } })
      .where(eq(CapabilityJobTable.id, corrupt.id)).run().pipe(Effect.orDie)
    expect(yield* CapabilityProcessSweep.run({ jobs, live: new Set(), startedAt: Date.now() + 60_000, placement }))
      .toEqual({ marked: 1, skipped: 2 })
    const states = yield* Effect.forEach([forged, corrupt, good], (ref) => f.database.db.select().from(CapabilityJobTable)
      .where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie, Effect.map((row) => row?.state)))
    expect(states).toEqual(["submitting", "submitting", "lost"])
  }))
})
