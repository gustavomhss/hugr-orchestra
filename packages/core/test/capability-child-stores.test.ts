import { expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityJobs } from "@orchestra/core/capability/job/index"
import { CapabilityArtifactTable, CapabilityChildTable, CapabilityJobTable } from "@orchestra/core/capability/sql"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionEvent } from "@orchestra/core/session/event"
import { Tool } from "@orchestra/core/tool/tool"
import { Capability } from "@orchestra/schema/capability"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { CapabilityChildrenFixture } from "./fixture/capability-children"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityChildrenFixture.layer)
const rules: PermissionV2.Ruleset = [
  { action: "artifact.*", resource: "*", effect: "allow" },
  { action: "effect", resource: "*", effect: "allow" }, { action: "read", resource: "*", effect: "allow" },
]

const fixture = Effect.gen(function* () {
  const f = yield* CapabilityChildrenFixture.fixture
  yield* CapabilityPolicyFixture.setRules(rules)
  const binding = { ...f.binding, effectiveRules: rules }
  const artifacts = yield* CapabilityArtifacts.make()
  const jobs = yield* CapabilityJobs.make
  yield* f.registry.register({
    publish: Tool.make({
      description: "Child artifact publication", input: Schema.Struct({ text: Schema.String,
        mime: Schema.Literals(["text/plain", "application/json"]) }), output: Capability.ArtifactRef,
      execute: (input, context) => artifacts.publish(context, {
        data: new TextEncoder().encode(input.text), mime: input.mime, kind: "document", verification: "observed",
        metadata: { hostPrivate: "metadata" },
      }).pipe(Effect.mapError((error) => new Tool.Failure({ message: "Artifact denied", error }))),
    }),
    job: Tool.make({ description: "Child job intent", input: Schema.Json, output: Capability.JobRef,
      execute: (_, context) => Effect.gen(function* () {
        const input: CapabilityJobs.CreateInput = { kind: "provider", operation: "render", requestHash: "a".repeat(64) }
        const admitted = yield* jobs.admit(context, input)
        expect(admitted.reused).toBe(false)
        expect(yield* jobs.admit(context, input)).toEqual({ ref: admitted.ref, reused: true })
        yield* jobs.transition(context, admitted.ref, { expectedGeneration: 0, state: "submitting", observation: {} })
        return admitted.ref
      }).pipe(Effect.mapError((error) => new Tool.Failure({ message: "Job denied", error }))),
    }),
  })
  const materialization = yield* f.registry.materialize(undefined, { advertisedNames: [] })
  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => CapabilityInvocation.withContext(binding, effect)
  const jobRows = () => f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
  const artifactRows = () => f.database.db.select().from(CapabilityArtifactTable).all().pipe(Effect.orDie)
  return { ...f, binding, artifacts, jobs, materialization, run, jobRows, artifactRows }
})

it.live("genuine hidden canonical children publish text and JSON with actual child producer", () => Effect.gen(function* () {
  const f = yield* fixture
  const inputs = [{ text: "child text", mime: "text/plain" }, { text: '{"child":true}', mime: "application/json" }]
  yield* f.run(Effect.gen(function* () {
    const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
    yield* Effect.forEach(inputs, (input) => Effect.gen(function* () {
      expect((yield* dispatcher.settle("publish", input)).result.type).not.toBe("error")
    }))
  }))
  const records = yield* f.artifactRows()
  expect(records).toHaveLength(2)
  expect(records.map((row) => row.producer.callID).sort()).toEqual([1, 2]
    .map((ordinal) => CapabilityInvocation.childID(f.binding.invocation, ordinal)).sort())
  records.forEach((row) => {
    expect(row.owner).toEqual(f.binding.owner)
    expect(row.producer).toEqual({ ...f.binding.invocation, callID: row.producer.callID })
  })
  expect((yield* f.rows()).map((row) => row.state)).toEqual(["completed", "completed"])
}))

it.live("completed child job keeps original root lineage for acquired host completion after root ends", () => Effect.gen(function* () {
  const f = yield* fixture
  yield* f.run(Effect.gen(function* () {
    const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
    expect((yield* dispatcher.settle("job", {})).result.type).not.toBe("error")
  }))
  const row = (yield* f.jobRows())[0]
  if (!row) return yield* Effect.die("Missing canonical child job")
  const proof = { owner: row.owner, producer: row.invocation, rootToolName: f.binding.rootToolName }
  expect(row.invocation.callID).toBe(CapabilityInvocation.childID(f.binding.invocation, 1))
  expect(row.observation).toMatchObject({ rootInvocation: f.binding.invocation, lineage: [{ callID: row.invocation.callID,
    parentCallID: f.context.toolCallID, ordinal: 1, toolName: "job",
  }] })
  yield* endRoot(f)
  const restored = yield* CapabilityJobs.make
  expect((yield* restored.readHost(proof, { id: row.id })).receipt).toMatchObject({ state: "submitting", generation: 1 })
  expect(yield* restored.observeHost(proof, { id: row.id }, { expectedGeneration: 1, state: "completed",
    providerID: "acquired-id", observation: { remoteOutcome: "completed", materialization: "failed" },
  })).toMatchObject({ state: "completed", generation: 2 })
  expect((yield* restored.readHost(proof, { id: row.id })).providerID).toBe("acquired-id")
  expect((yield* f.rows()).map((row) => row.state)).toEqual(["completed"])
}))

function endRoot(f: Effect.Success<typeof fixture>) {
  return f.events.publish(SessionEvent.Tool.Success, {
    sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID,
    timestamp: CapabilityPolicyFixture.timestamp, structured: {}, content: [], provider: { executed: false },
  })
}
