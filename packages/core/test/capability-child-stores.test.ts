import { expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityJobs } from "@orchestra/core/capability/job/index"
import { CapabilityArtifactTable, CapabilityChildTable, CapabilityJobTable } from "@orchestra/core/capability/sql"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionMessageTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Capability } from "@orchestra/schema/capability"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { eq, sql } from "drizzle-orm"
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
  const jobRows = () => f.database.db.select().from(CapabilityJobTable)
    .where(sql`json_extract(${CapabilityJobTable.owner}, '$.sessionID') = ${f.context.sessionID}`).all().pipe(Effect.orDie)
  const artifactRows = () => f.database.db.select().from(CapabilityArtifactTable)
    .where(sql`json_extract(${CapabilityArtifactTable.owner}, '$.sessionID') = ${f.context.sessionID}`).all().pipe(Effect.orDie)
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
  yield* endRoot(f)
  const context = { ...f.context, assistantMessageID: SessionMessage.ID.create(), toolCallID: "reader" }
  yield* f.events.publish(SessionEvent.Step.Started, { ...context, timestamp: CapabilityPolicyFixture.timestamp,
    model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") },
  })
  yield* f.events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID,
    assistantMessageID: context.assistantMessageID, callID: context.toolCallID, name: "service_call",
    timestamp: CapabilityPolicyFixture.timestamp,
  })
  yield* CapabilityInvocation.withContext({ ...f.binding, invocation: { ...f.binding.invocation,
    assistantMessageID: context.assistantMessageID, callID: context.toolCallID,
  } }, Effect.gen(function* () {
    yield* Effect.forEach(records, (row) => Effect.gen(function* () {
      const ref = { id: row.id, revision: row.revision }
      const found = yield* f.artifacts.read(context, ref)
      const input = inputs.find((input) => input.mime === row.mime)
      if (!input) return yield* Effect.die("Unexpected child artifact MIME")
      expect(new TextDecoder().decode(found.data)).toBe(input.text)
      expect(found.metadata.producer.callID).toBe(row.producer.callID)
      expect(found.metadata.metadata).toEqual({ hostPrivate: "metadata" })
      expect(JSON.stringify(yield* f.artifacts.describe(context, ref))).not.toContain("hostPrivate")
    }))
  }))
}).pipe(Effect.timeout("10 seconds")), 15000)

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

it.live("child artifact write deny survives parent allow; completion and revocation during approval prevent publication", () =>
  Effect.gen(function* () {
    const denied = yield* fixture
    yield* CapabilityInvocation.withContext({ ...denied.binding, effectiveRules: [
      ...rules, { action: "service_call", resource: "*", effect: "allow" },
      { action: "artifact.write", resource: "*", effect: "deny" },
    ] }, Effect.gen(function* () {
      const dispatcher = yield* denied.children.dispatcher(denied.context, denied.materialization)
      expect((yield* dispatcher.settle("publish", { text: "blocked", mime: "text/plain" })).result.type).toBe("error")
    }))
    expect(yield* denied.artifactRows()).toEqual([])
    yield* Effect.forEach(["allow", "root", "revoke"] as const, (change) => Effect.gen(function* () {
      const f = yield* fixture
      yield* CapabilityPolicyFixture.setRules([])
      yield* f.run(Effect.gen(function* () {
        const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
        const child = { ...f.context, toolCallID: CapabilityInvocation.childID(f.binding.invocation, 1) }
        const asked = yield* CapabilityPolicyFixture.observeAsked(child)
        const fiber = yield* dispatcher.settle("publish", { text: "queued", mime: "text/plain" }).pipe(Effect.forkChild)
        const request = yield* Effect.raceFirst(Deferred.await(asked.first), Fiber.join(fiber).pipe(
          Effect.andThen(Effect.die("ARTIFACT_CHILD_BYPASSED_APPROVAL")),
        ))
        expect(request.action).toBe("artifact.write")
        expect(request.source).toEqual({ type: "tool", messageID: child.assistantMessageID, callID: child.toolCallID })
        expect(yield* f.artifactRows()).toEqual([])
        if (change === "root") yield* endRoot(f)
        yield* CapabilityPolicyFixture.setRules(change === "revoke" ? [...rules,
          { action: "artifact.write", resource: "*", effect: "deny" },
        ] : rules)
        yield* f.permissions.reply({ requestID: request.id, reply: "once" })
        expect((yield* Fiber.join(fiber)).result.type === "error").toBe(change !== "allow")
        expect(yield* f.artifactRows()).toHaveLength(change === "allow" ? 1 : 0)
        expect((yield* f.rows()).map((row) => row.state)).toEqual([change === "allow" ? "completed" : "failed"])
      }))
    }))
  }).pipe(Effect.timeout("15 seconds")), 20000,
)

it.live("host child facts require exact proof, root and every persisted child field in all terminal states", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const job = yield* submit(f)
    const child = (yield* f.rows())[0]
    if (!child) return yield* Effect.die("Missing persisted child")
    yield* endRoot(f)
    yield* Effect.forEach(["running", "completed", "failed", "interrupted"] as const, (state) => Effect.gen(function* () {
      yield* f.database.db.update(CapabilityChildTable).set({ state }).where(eq(CapabilityChildTable.id, child.id)).run()
      expect((yield* f.jobs.readHost(job.proof, job.ref)).receipt.state).toBe("submitting")
    }))
    yield* f.database.db.update(CapabilityChildTable).set(child).where(eq(CapabilityChildTable.id, child.id)).run()
    yield* Effect.forEach([
      { ...job.proof, producer: { ...job.proof.producer, callID: "forged" } },
      { ...job.proof, producer: f.binding.invocation }, { ...job.proof, rootToolName: "wrong" },
      { ...job.proof, owner: { ...job.proof.owner, agentID: AgentV2.ID.make("other") } },
      { ...job.proof, owner: { ...job.proof.owner, location: { directory: AbsolutePath.make("/other") } } },
    ], (proof) => expectDenied(f.jobs.readHost(proof, job.ref)))
    const other = yield* CapabilityPolicyFixture.fixture()
    const mutations: Partial<typeof child>[] = [
      { session_id: other.context.sessionID }, { agent_id: AgentV2.ID.make("other") },
      { assistant_message_id: "other" }, { root_call_id: "other" }, { root_tool_name: "other" },
      { parent_call_id: "other" }, { ordinal: 2 }, { depth: 2 }, { tool_name: "other" }, { request_hash: "0".repeat(64) },
    ]
    yield* Effect.forEach(mutations, (mutation) => Effect.gen(function* () {
      yield* f.database.db.update(CapabilityChildTable).set(mutation).where(eq(CapabilityChildTable.id, child.id)).run()
      yield* expectDenied(f.jobs.readHost(job.proof, job.ref))
      yield* expectDenied(f.jobs.observeHost(job.proof, job.ref, completion))
      yield* f.database.db.update(CapabilityChildTable).set(child).where(eq(CapabilityChildTable.id, child.id)).run()
    }))
    yield* f.database.db.run(sql`UPDATE capability_child SET state = 'unknown' WHERE id = ${child.id}`)
    yield* expectDenied(f.jobs.readHost(job.proof, job.ref))
    yield* f.database.db.update(CapabilityChildTable).set(child).where(eq(CapabilityChildTable.id, child.id)).run()
    yield* f.database.db.delete(CapabilityChildTable).where(eq(CapabilityChildTable.id, child.id)).run()
    yield* expectDenied(f.jobs.readHost(job.proof, job.ref))
    yield* f.database.db.insert(CapabilityChildTable).values(child).run()
    expect((yield* f.jobs.readHost(job.proof, job.ref)).receipt.generation).toBe(1)
    const message = yield* f.database.db.select().from(SessionMessageTable)
      .where(eq(SessionMessageTable.id, f.context.assistantMessageID)).get()
    if (!message) return yield* Effect.die("Missing original root message")
    const sessions = yield* SessionStore.Service
    const projected = yield* sessions.message(f.context.assistantMessageID)
    if (!projected || projected.message.type !== "assistant") return yield* Effect.die("Missing original root assistant")
    const index = projected.message.content.findIndex((part) => part.type === "tool" && part.id === f.context.toolCallID)
    expect(index).toBeGreaterThanOrEqual(0)
    yield* Effect.forEach(["id", "name"], (key) => Effect.gen(function* () {
      yield* f.database.db.run(sql`UPDATE session_message SET data = json_set(data, ${`$.content[${index}].${key}`}, 'wrong') WHERE id = ${message.id}`)
      yield* expectDenied(f.jobs.readHost(job.proof, job.ref))
      yield* f.database.db.update(SessionMessageTable).set({ data: message.data }).where(eq(SessionMessageTable.id, message.id)).run()
    }))
    yield* f.database.db.run(sql`UPDATE session_message SET data = json_set(data, '$.content', json('[]')) WHERE id = ${message.id}`)
    yield* expectDenied(f.jobs.observeHost(job.proof, job.ref, completion))
    yield* f.database.db.update(SessionMessageTable).set({ data: message.data }).where(eq(SessionMessageTable.id, message.id)).run()
    expect((yield* f.jobs.readHost(job.proof, job.ref)).receipt.generation).toBe(1)
  }).pipe(Effect.timeout("15 seconds")), 20000,
)

it.live("child READ checks captured rules, current rules and native floor; acquired facts survive deny", () => Effect.gen(function* () {
  yield* Effect.forEach(["captured", "current", "floor"] as const, (mode) => Effect.gen(function* () {
    const f = yield* fixture
    const binding = { ...f.binding,
      effectiveRules: mode === "captured" ? [...rules, { action: "read", resource: "*", effect: "deny" as const }] : rules,
      nativeDenyFloor: mode === "floor" ? [{ action: "read", resource: "*", effect: "deny" as const }] : [],
    }
    const job = yield* submit(f, binding)
    yield* endRoot(f)
    if (mode === "current") yield* CapabilityPolicyFixture.setRules([
      { action: "read", resource: "*", effect: "deny" }, { action: "effect", resource: "*", effect: "deny" },
    ])
    yield* expectDenied(f.jobs.readHost(job.proof, job.ref))
    expect(yield* f.jobs.observeHost(job.proof, job.ref, completion)).toMatchObject({ generation: 2, state: "completed" })
    yield* CapabilityPolicyFixture.setRules(rules)
    if (mode === "current") expect((yield* f.jobs.readHost(job.proof, job.ref)).receipt.state).toBe("completed")
    if (mode !== "current") yield* expectDenied(f.jobs.readHost(job.proof, job.ref))
  }))
}).pipe(Effect.timeout("10 seconds")), 15000)

it.live("live child exact retry verifies root and full lineage; legacy direct jobs retain missing-provenance fallback", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* f.registry.register({ retry: Tool.make({ description: "Retry captured child job", input: Schema.Json, output: Capability.JobRef,
      execute: (_, context) => Effect.gen(function* () {
        const input: CapabilityJobs.CreateInput = { kind: "provider", operation: "render", requestHash: "a".repeat(64) }
        const admitted = yield* f.jobs.admit(context, input)
        const row = yield* f.database.db.select().from(CapabilityJobTable).where(eq(CapabilityJobTable.id, admitted.ref.id)).get()
        if (!row) return yield* Effect.die("Missing retry job")
        const stored = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(row.observation)
        const binding = yield* f.policy.binding(context)
        yield* Effect.forEach([
          { ...stored, rootInvocation: { ...binding.rootInvocation, callID: "wrong" } },
          ...binding.lineage.map((proof) => ({ ...stored, lineage: [{ ...proof, requestHash: "0".repeat(64) }] })),
          { rootToolName: binding.rootToolName, effectiveRules: rules, nativeDenyFloor: [], data: {} },
        ], (observation) => Effect.gen(function* () {
          yield* f.database.db.update(CapabilityJobTable).set({ observation: Schema.decodeUnknownSync(Schema.Json)(observation) })
            .where(eq(CapabilityJobTable.id, row.id)).run()
          expect(yield* f.jobs.admit(context, input).pipe(Effect.flip)).toMatchObject({ code: "outcome_unknown" })
          yield* f.database.db.update(CapabilityJobTable).set({ observation: row.observation })
            .where(eq(CapabilityJobTable.id, row.id)).run()
        }))
        expect(yield* f.jobs.admit(context, input)).toEqual({ ref: admitted.ref, reused: true })
        return admitted.ref
      }).pipe(Effect.mapError((error) => new Tool.Failure({ message: "Retry failed", error }))),
    }) })
    const materialization = yield* f.registry.materialize()
    yield* f.run(Effect.gen(function* () {
      const dispatcher = yield* f.children.dispatcher(f.context, materialization)
      expect((yield* dispatcher.settle("retry", {})).result.type).not.toBe("error")
      const input: CapabilityJobs.CreateInput = { kind: "provider", operation: "legacy", requestHash: "b".repeat(64) }
      const admitted = yield* f.jobs.admit(f.context, input)
      const legacy = { rootToolName: f.binding.rootToolName, effectiveRules: rules, nativeDenyFloor: [], data: {} }
      yield* f.database.db.update(CapabilityJobTable).set({ observation: legacy }).where(eq(CapabilityJobTable.id, admitted.ref.id)).run()
      expect(yield* f.jobs.admit(f.context, input)).toEqual({ ref: admitted.ref, reused: true })
      const proof = { owner: f.binding.owner, producer: f.binding.invocation, rootToolName: f.binding.rootToolName }
      expect((yield* f.jobs.readHost(proof, admitted.ref)).receipt.state).toBe("intent")
      yield* f.jobs.transition(f.context, admitted.ref, { expectedGeneration: 0, state: "submitting", observation: {} })
      yield* endRoot(f)
      expect(yield* f.jobs.observeHost(proof, admitted.ref, completion)).toMatchObject({ state: "completed" })
    }))
    expect(yield* f.jobRows()).toHaveLength(2)
  }),
)

it.live("depth-eight child provenance fits budget, requires ancestors and cannot omit lineage byte cost", () =>
  Effect.gen(function* () {
    yield* Effect.forEach([0, 15000], (padding) => Effect.gen(function* () {
      const f = yield* fixture
      const binding = { ...f.binding, effectiveRules: padding ? [...rules,
        { action: "unused", resource: "x".repeat(padding), effect: "allow" as const },
      ] : rules }
      yield* f.registry.register({ nest: Tool.make({ description: "Depth-eight job", input: Schema.Struct({ remaining: Schema.Number }),
        output: Capability.JobRef,
        execute: (input, context) => Effect.gen(function* () {
          if (input.remaining === 0) {
            const binding = yield* f.policy.binding(context)
            expect(binding.lineage).toHaveLength(8)
            const ref = yield* f.jobs.create(context, { kind: "worker", operation: "nested" })
            yield* f.jobs.transition(context, ref, { expectedGeneration: 0, state: "submitting", observation: {} })
            return ref
          }
          const materialization = yield* ToolRegistry.captured
          if (!materialization) return yield* Effect.die("Missing issuing materialization")
          const dispatcher = yield* f.children.dispatcher(context, materialization)
          const settlement = yield* dispatcher.settle("nest", { remaining: input.remaining - 1 })
          if (settlement.result.type === "error") return yield* new Tool.Failure({ message: "Nested job denied" })
          return yield* Schema.decodeUnknownEffect(Capability.JobRef)(settlement.output?.structured).pipe(Effect.orDie)
        }).pipe(Effect.mapError((error) => error instanceof Tool.Failure ? error : new Tool.Failure({ message: "Nested job denied", error }))),
      }) })
      const materialization = yield* f.registry.materialize(undefined, { advertisedNames: [] })
      yield* CapabilityInvocation.withContext(binding, Effect.gen(function* () {
        if (padding) yield* f.jobs.create(f.context, { kind: "worker", operation: "direct" })
        const dispatcher = yield* f.children.dispatcher(f.context, materialization)
        expect((yield* dispatcher.settle("nest", { remaining: 7 })).result.type === "error").toBe(padding > 0)
      }))
      const rows = yield* f.jobRows()
      expect(rows).toHaveLength(1)
      if (padding) {
        expect(rows[0]?.operation).toBe("direct")
        expect(Buffer.byteLength(JSON.stringify(rows[0]?.observation))).toBeLessThanOrEqual(16384)
        expect((yield* f.rows()).map((row) => row.state)).toEqual(Array.from({ length: 8 }, () => "failed"))
        return
      }
      const row = rows[0]
      if (!row) return yield* Effect.die("Missing deep job")
      const stored = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(row.observation)
      expect(stored.rootInvocation).toEqual(f.binding.invocation)
      expect(stored.lineage).toHaveLength(8)
      expect(Buffer.byteLength(JSON.stringify(row.observation))).toBeLessThanOrEqual(16384)
      const childRows = (yield* f.rows()).sort((a, b) => a.depth - b.depth)
      const ancestor = childRows[0]
      if (!ancestor) return yield* Effect.die("Missing deep ancestor")
      const proof = { owner: row.owner, producer: row.invocation, rootToolName: f.binding.rootToolName }
      yield* endRoot(f)
      expect((yield* f.jobs.readHost(proof, { id: row.id })).receipt.state).toBe("submitting")
      yield* f.database.db.delete(CapabilityChildTable).where(eq(CapabilityChildTable.id, ancestor.id)).run()
      yield* expectDenied(f.jobs.readHost(proof, { id: row.id }))
      yield* expectDenied(f.jobs.observeHost(proof, { id: row.id }, { ...completion, providerID: undefined }))
      yield* f.database.db.insert(CapabilityChildTable).values(ancestor).run()
      const lineage = childRows.map((child) => ({ callID: child.id, parentCallID: child.parent_call_id,
        ordinal: child.ordinal, toolName: child.tool_name, requestHash: child.request_hash }))
      // Even matching persisted ordinal evidence must derive the same host ID from its actual parent.
      yield* f.database.db.update(CapabilityChildTable).set({ ordinal: 2 }).where(eq(CapabilityChildTable.id, ancestor.id)).run()
      yield* f.database.db.update(CapabilityJobTable).set({ observation: Schema.decodeUnknownSync(Schema.Json)({ ...stored,
        lineage: lineage.map((child, index) => index === 0 ? { ...child, ordinal: 2 } : child),
      }) }).where(eq(CapabilityJobTable.id, row.id)).run()
      yield* expectDenied(f.jobs.readHost(proof, { id: row.id }))
      yield* f.database.db.update(CapabilityChildTable).set(ancestor).where(eq(CapabilityChildTable.id, ancestor.id)).run()
      yield* f.database.db.update(CapabilityJobTable).set({ observation: row.observation }).where(eq(CapabilityJobTable.id, row.id)).run()
      expect((yield* f.jobs.readHost(proof, { id: row.id })).receipt.generation).toBe(1)
    }))
  }).pipe(Effect.timeout("20 seconds")), 25000,
)

it.live("job admission snapshots child root, lineage, rules and request before permission wait", () => Effect.gen(function* () {
  const f = yield* fixture
  const captured: { context?: Tool.Context; input?: CapabilityJobs.CreateInput } = {}
  const claimed = { ...f.binding, invocation: { ...f.binding.invocation }, effectiveRules: rules.map((rule) => ({ ...rule })) }
  yield* f.registry.register({ snapshot: Tool.make({ description: "Captured child admission", input: Schema.Json, output: Capability.JobRef,
    execute: (_, context) => {
      const input: CapabilityJobs.CreateInput = { kind: "worker", operation: "original", requestHash: "a".repeat(64) }
      const supplied = { ...context }
      captured.input = input
      captured.context = supplied
      return f.jobs.admit(supplied, input).pipe(Effect.map((admitted) => admitted.ref),
        Effect.mapError((error) => new Tool.Failure({ message: "Snapshot job denied", error })))
    },
  }) })
  const materialization = yield* f.registry.materialize()
  yield* CapabilityPolicyFixture.setRules([])
  yield* CapabilityInvocation.withContext(claimed, Effect.gen(function* () {
    const dispatcher = yield* f.children.dispatcher(f.context, materialization)
    const child = { ...f.context, toolCallID: CapabilityInvocation.childID(f.binding.invocation, 1) }
    const asked = yield* CapabilityPolicyFixture.observeAsked(child)
    const fiber = yield* dispatcher.settle("snapshot", {}).pipe(Effect.forkChild)
    const request = yield* Effect.raceFirst(Deferred.await(asked.first), Fiber.join(fiber).pipe(
      Effect.andThen(Effect.die("JOB_CHILD_BYPASSED_APPROVAL")),
    ))
    Object.assign(captured.input ?? {}, { kind: "provider", operation: "mutated", requestHash: "b".repeat(64) })
    Object.assign(captured.context ?? {}, { toolCallID: "mutated" })
    claimed.invocation.callID = "mutated-root"
    claimed.effectiveRules.splice(0)
    yield* CapabilityPolicyFixture.setRules(rules)
    yield* f.permissions.reply({ requestID: request.id, reply: "once" })
    expect((yield* Fiber.join(fiber)).result.type).not.toBe("error")
  }))
  const row = (yield* f.jobRows())[0]
  if (!row) return yield* Effect.die("Missing snapshotted job")
  expect(row).toMatchObject({ operation: "original", kind: "worker", request_hash: "a".repeat(64) })
  expect(row.observation).toMatchObject({ rootInvocation: f.binding.invocation, effectiveRules: rules, lineage: [{
    callID: CapabilityInvocation.childID(f.binding.invocation, 1), parentCallID: f.context.toolCallID, toolName: "snapshot",
  }] })
}).pipe(Effect.timeout("10 seconds")), 15000)

it.live("child job observation rejects accessors without execution and copies arrays without caller hooks", () => Effect.gen(function* () {
  const f = yield* fixture
  const calls = { value: 0 }
  yield* f.registry.register({ safe: Tool.make({ description: "Closed child observation", input: Schema.Json, output: Capability.JobRef,
    execute: (_, context) => Effect.gen(function* () {
      const ref = yield* f.jobs.create(context, { kind: "worker", operation: "safe" })
      const observation = {}
      Object.defineProperty(observation, "progress", { enumerable: true, get() {
        calls.value++
        throw new Error("OBSERVATION_ACCESSOR_EXECUTED")
      } })
      expect(yield* f.jobs.transition(context, ref, { expectedGeneration: 0, state: "submitting", observation }).pipe(Effect.flip))
        .toMatchObject({ code: "quota_exceeded" })
      expect(calls.value).toBe(0)
      yield* f.jobs.transition(context, ref, { expectedGeneration: 0, state: "submitting", observation: {} })
      const refs: Capability.ArtifactRef[] = []
      Object.defineProperty(refs, "map", { get() { calls.value++; throw new Error("ARRAY_MAP_EXECUTED") } })
      Object.defineProperty(refs, "constructor", { get() { calls.value++; throw new Error("ARRAY_CONSTRUCTOR_EXECUTED") } })
      const receipt = yield* f.jobs.transition(context, ref, { expectedGeneration: 1, state: "running", observation: { artifactRefs: refs } })
      expect(receipt.observation.artifactRefs).toEqual([])
      expect(receipt.observation.artifactRefs).not.toBe(refs)
      expect(calls.value).toBe(0)
      return ref
    }).pipe(Effect.mapError((error) => new Tool.Failure({ message: "Safe observation failed", error }))),
  }) })
  const materialization = yield* f.registry.materialize()
  yield* f.run(Effect.gen(function* () {
    const dispatcher = yield* f.children.dispatcher(f.context, materialization)
    expect((yield* dispatcher.settle("safe", {})).result.type).not.toBe("error")
  }))
  expect(calls.value).toBe(0)
  expect((yield* f.jobRows())[0]?.generation).toBe(2)
}))

const completion: CapabilityJobs.TransitionInput = { expectedGeneration: 1, state: "completed",
  providerID: "acquired-id", observation: { remoteOutcome: "completed", materialization: "failed" } }

function submit(f: Effect.Success<typeof fixture>, binding = f.binding) {
  return Effect.gen(function* () {
    yield* CapabilityInvocation.withContext(binding, Effect.gen(function* () {
      const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
      expect((yield* dispatcher.settle("job", {})).result.type).not.toBe("error")
    }))
    const row = (yield* f.jobRows())[0]
    if (!row) return yield* Effect.die("Missing child job")
    return { ref: { id: row.id }, row,
      proof: { owner: row.owner, producer: row.invocation, rootToolName: f.binding.rootToolName } }
  })
}

function expectDenied<A, R>(effect: Effect.Effect<A, Capability.Failure, R>) {
  return effect.pipe(Effect.flip, Effect.tap((error) => Effect.sync(() => {
    expect(error).toBeInstanceOf(Capability.Failure)
    expect(error.code).toBe("target_denied")
  })))
}

function endRoot(f: Effect.Success<typeof fixture>) {
  return f.events.publish(SessionEvent.Tool.Success, {
    sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID,
    timestamp: CapabilityPolicyFixture.timestamp, structured: {}, content: [], provider: { executed: false },
  })
}
