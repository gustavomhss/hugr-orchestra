import { describe, expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityPolicy } from "@orchestra/core/capability/policy"
import { Location } from "@orchestra/core/location"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq } from "drizzle-orm"
import { Cause, Effect, Fiber, Ref } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityPolicyFixture.layer)

describe("CapabilityPolicy", () => {
  it.live("allows real pending/running roots; captured denies and invalid inputs stop target before queue", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    yield* f.run()
    yield* f.events.publish(SessionEvent.Tool.Called, {
      sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
      callID: f.context.toolCallID, tool: "service_call", input: {}, provider: { executed: false },
      timestamp: CapabilityPolicyFixture.timestamp,
    })
    yield* f.run()
    yield* Effect.forEach([
      { ...f.binding, effectiveRules: CapabilityPolicyFixture.deny },
      { ...f.binding, nativeDenyFloor: [...CapabilityPolicyFixture.deny, ...CapabilityPolicyFixture.allow] },
      { ...f.binding, nativeDenyFloor: CapabilityPolicyFixture.deny, effectiveRules: [] },
    ], (host) => f.run(host).pipe(Effect.flip, Effect.flatMap((error) => CapabilityPolicyFixture.expectFailure(error))))
    yield* Effect.forEach([
      { action: "", resources: ["x"] }, { action: " read", resources: ["x"] },
      { action: "read", resources: [] }, { action: "read", resources: [""] },
      { action: "read", resources: ["src/index.ts", "secret-resource/key"] },
    ], (request) => f.run({ ...f.binding, effectiveRules: [...CapabilityPolicyFixture.allow, {
      action: "read", resource: "secret-resource/*", effect: "deny",
    }] }, f.context, request).pipe(Effect.flip, Effect.flatMap((error) => CapabilityPolicyFixture.expectFailure(error))))
    expect(yield* Ref.get(f.effects)).toBe(2)
    expect(yield* f.permissions.list()).toEqual([])
    expect(yield* Ref.get(observation.count)).toBe(0)
    yield* f.run({ ...f.binding, nativeDenyFloor: [{ action: "read", resource: "*", effect: "ask" }] })
    expect(yield* Ref.get(f.effects)).toBe(3)
    // Positive control proves the same listener sees a real queue event.
    const q = yield* CapabilityPolicyFixture.queued(f.context, f.run({ ...f.binding, effectiveRules: [] }))
    expect(yield* Ref.get(observation.count)).toBe(1)
    yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
    expect((yield* q.join)._tag).toBe("Success")
    expect(yield* f.permissions.list()).toEqual([])
  }).pipe(Effect.timeout("10 seconds")))

  it.live("captured ask really queues despite configured allow; once/reject/correction use kernel reply", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    yield* Effect.forEach(["once", "reject", "correct"] as const, (reply) => Effect.gen(function* () {
      const q = yield* CapabilityPolicyFixture.queued(f.context, f.run({ ...f.binding, effectiveRules: [] }))
      expect(q.request).toMatchObject({ sessionID: f.context.sessionID, ...CapabilityPolicyFixture.input, source: {
        type: "tool", messageID: f.context.assistantMessageID, callID: f.context.toolCallID,
      } })
      expect(yield* Ref.get(f.effects)).toBe(reply === "once" ? 0 : 1)
      expect(yield* f.permissions.list()).toEqual([q.request])
      yield* f.permissions.reply({ requestID: q.request.id, reply: reply === "once" ? "once" : "reject",
        ...(reply === "correct" ? { message: "secret provider feedback" } : {}),
      })
      const result = yield* q.join
      expect(result._tag).toBe(reply === "once" ? "Success" : "Failure")
      if (result._tag === "Failure") yield* CapabilityPolicyFixture.expectFailure(result.failure)
      expect(yield* Ref.get(q.observation.count)).toBe(1)
      expect(yield* Ref.get(f.effects)).toBe(1)
      expect(yield* f.permissions.list()).toEqual([])
      yield* q.observation.unsubscribe
    }))
  }).pipe(Effect.timeout("10 seconds")))

  it.live("captured allow still waits for current kernel ask approval", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules([])
    const q = yield* CapabilityPolicyFixture.queued(f.context, f.run())
    expect(yield* Ref.get(f.effects)).toBe(0)
    expect(yield* f.permissions.list()).toEqual([q.request])
    yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
    expect((yield* q.join)._tag).toBe("Success")
    expect(yield* Ref.get(q.observation.count)).toBe(1)
    expect(yield* Ref.get(f.effects)).toBe(1)
    expect(yield* f.permissions.list()).toEqual([])
  }).pipe(Effect.timeout("10 seconds")))

  it.live("fresh captured asks with current ask need one approval each and write no saved grant", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    const saved = yield* PermissionSaved.Service
    yield* CapabilityPolicyFixture.setRules([])
    yield* Effect.forEach([1, 2], (executed) => Effect.gen(function* () {
      const q = yield* CapabilityPolicyFixture.queued(f.context, f.run({ ...f.binding, effectiveRules: [] }))
      expect(yield* Ref.get(f.effects)).toBe(executed - 1)
      expect(yield* f.permissions.list()).toEqual([q.request])
      yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
      expect((yield* q.join)._tag).toBe("Success")
      expect(yield* Ref.get(q.observation.count)).toBe(1)
      expect(yield* Ref.get(f.effects)).toBe(executed)
      expect(yield* f.permissions.list()).toEqual([])
      expect(yield* saved.list()).toEqual([])
      expect(yield* f.permissions.evaluate({ ...CapabilityPolicyFixture.input,
        sessionID: f.context.sessionID, agent: f.context.agent })).toBe("ask")
      yield* q.observation.unsubscribe
    }))
  }).pipe(Effect.timeout("10 seconds")))

  it.live("Session agent switches never retarget issuer; revocation during approval still blocks", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.deny, AgentV2.ID.make("reviewer"))
    yield* f.events.publish(SessionEvent.AgentSwitched, {
      sessionID: f.context.sessionID, messageID: SessionMessage.ID.create(), agent: "reviewer",
      timestamp: CapabilityPolicyFixture.timestamp,
    })
    yield* f.run()
    const q = yield* CapabilityPolicyFixture.queued(f.context, f.run({ ...f.binding, effectiveRules: [] }))
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.allow, AgentV2.ID.make("reviewer"))
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.deny)
    yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
    const result = yield* q.join
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") yield* CapabilityPolicyFixture.expectFailure(result.failure)
    yield* CapabilityPolicyFixture.expectFailure(yield* f.run().pipe(Effect.flip))
    yield* CapabilityPolicyFixture.expectFailure(yield* f.run({ ...f.binding, effectiveRules: [] }).pipe(Effect.flip))
    expect(yield* Ref.get(f.effects)).toBe(1)
    expect(yield* Ref.get(q.observation.count)).toBe(1)
    expect(yield* f.permissions.list()).toEqual([])
  }).pipe(Effect.timeout("10 seconds")))

  const invalid = [
    ["missing message", { message: false }], ["missing part", { part: false }],
    ["wrong actor", { agent: "secret-agent" }], ["wrong tool", { name: "secret-call" }],
  ] as const
  invalid.forEach(([name, options]) => it.effect(`rejects host claims with stored ${name}`, () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture(options)
    yield* CapabilityPolicyFixture.expectFailure(yield* f.run().pipe(Effect.flip), "invocation_binding_mismatch")
    expect(yield* Ref.get(f.effects)).toBe(0)
    expect(yield* f.permissions.list()).toEqual([])
  })))

  it.effect("rejects fake context, child calls, wrong message Session, placement and missing Session", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    const forged = { ...f.context, binding: f.binding }
    yield* CapabilityPolicyFixture.expectFailure(yield* f.policy.assert(forged,
      CapabilityPolicyFixture.input).pipe(Effect.flip), "invocation_binding_missing")
    const child = { ...f.binding, invocation: { ...f.binding.invocation, callID: "secret-call:child:0" } }
    yield* CapabilityPolicyFixture.expectFailure(yield* f.run(child,
      { ...f.context, toolCallID: child.invocation.callID }).pipe(Effect.flip), "invocation_binding_mismatch")
    const other = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.expectFailure(yield* f.run({ ...f.binding, invocation: {
      ...f.binding.invocation, assistantMessageID: other.context.assistantMessageID,
    } }, { ...f.context, assistantMessageID: other.context.assistantMessageID }).pipe(Effect.flip), "invocation_binding_mismatch")
    const systemMessageID = SessionMessage.ID.create()
    yield* f.events.publish(SessionEvent.ContextUpdated, {
      sessionID: f.context.sessionID, messageID: systemMessageID, text: "system context",
      timestamp: CapabilityPolicyFixture.timestamp,
    })
    yield* CapabilityPolicyFixture.expectFailure(yield* f.run({ ...f.binding, invocation: {
      ...f.binding.invocation, assistantMessageID: systemMessageID,
    } }, { ...f.context, assistantMessageID: systemMessageID }).pipe(Effect.flip), "invocation_binding_mismatch")
    yield* Effect.forEach([
      { ...f.binding.owner, projectID: Project.ID.make("wrong-project") },
      { ...f.binding.owner, location: { directory: AbsolutePath.make("/secret-resource") } },
      { ...f.binding.owner, location: { directory: CapabilityPolicyFixture.placement.directory,
        workspaceID: WorkspaceID.make("wrk_other") } },
    ], (owner) => f.run({ ...f.binding, owner }).pipe(Effect.flip,
      Effect.flatMap((error) => CapabilityPolicyFixture.expectFailure(error, "invocation_binding_mismatch"))))
    yield* f.events.publish(SessionEvent.Moved, {
      sessionID: f.context.sessionID, location: { directory: AbsolutePath.make("/elsewhere") },
      timestamp: CapabilityPolicyFixture.timestamp,
    })
    yield* CapabilityPolicyFixture.expectFailure(yield* f.run().pipe(Effect.flip), "invocation_binding_mismatch")
    yield* f.database.db.delete(SessionTable).where(eq(SessionTable.id, f.context.sessionID)).run().pipe(Effect.orDie)
    yield* CapabilityPolicyFixture.expectFailure(yield* f.run().pipe(Effect.flip), "invocation_binding_mismatch")
    expect(yield* Ref.get(f.effects)).toBe(0)
    expect(yield* f.permissions.list()).toEqual([])
  }))

  it.effect("stored project and workspace must match captured placement", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    const projectID = Project.ID.make("other-project")
    yield* f.database.db.insert(ProjectTable).values({
      id: projectID, worktree: AbsolutePath.make("/other"), sandboxes: [],
    }).run().pipe(Effect.orDie)
    yield* f.database.db.update(SessionTable).set({ project_id: projectID })
      .where(eq(SessionTable.id, f.context.sessionID)).run().pipe(Effect.orDie)
    yield* CapabilityPolicyFixture.expectFailure(yield* f.run().pipe(Effect.flip), "invocation_binding_mismatch")
    const explicit = { ...CapabilityPolicyFixture.placement, workspaceID: WorkspaceID.make("wrk_explicit") }
    const policy = yield* CapabilityPolicy.make.pipe(Effect.provideService(Location.Service, explicit))
    const binding = { ...f.binding, owner: { ...f.binding.owner,
      location: { directory: explicit.directory, workspaceID: explicit.workspaceID },
    } }
    // Restore project so only persisted implicit workspace differs from the issued explicit placement.
    yield* f.database.db.update(SessionTable).set({ project_id: CapabilityPolicyFixture.placement.project.id })
      .where(eq(SessionTable.id, f.context.sessionID)).run().pipe(Effect.orDie)
    yield* CapabilityPolicyFixture.expectFailure(yield* CapabilityInvocation.withContext(binding,
      policy.assert(f.context, CapabilityPolicyFixture.input)).pipe(Effect.flip), "invocation_binding_mismatch")
    expect(yield* Ref.get(f.effects)).toBe(0)
    expect(yield* f.permissions.list()).toEqual([])
  }))

  it.live("settled root before/during approval cannot authorize; interruption survives and clears queue", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    const q = yield* CapabilityPolicyFixture.queued(f.context, f.run({ ...f.binding, effectiveRules: [] }))
    yield* f.events.publish(SessionEvent.Tool.Failed, {
      sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
      callID: f.context.toolCallID, error: { type: "unknown", message: "done" }, provider: { executed: false },
      timestamp: CapabilityPolicyFixture.timestamp,
    })
    yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
    const result = yield* q.join
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") yield* CapabilityPolicyFixture.expectFailure(result.failure, "invocation_binding_mismatch")
    yield* CapabilityPolicyFixture.expectFailure(yield* f.run().pipe(Effect.flip), "invocation_binding_mismatch")
    expect(yield* Ref.get(f.effects)).toBe(0)
    expect(yield* f.permissions.list()).toEqual([])
    yield* q.observation.unsubscribe
    const active = yield* CapabilityPolicyFixture.fixture()
    const waiting = yield* CapabilityPolicyFixture.queued(active.context, active.run({ ...active.binding, effectiveRules: [] }))
    yield* Fiber.interrupt(waiting.fiber)
    const exit = yield* Fiber.await(waiting.fiber)
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") expect(exit.cause.reasons.some(Cause.isInterruptReason)).toBe(true)
    expect(yield* active.permissions.list()).toEqual([])
    expect(yield* Ref.get(active.effects)).toBe(0)
    // Corrupt persisted projection must remain a defect, never become a policy wire failure.
    yield* active.database.db.update(SessionMessageTable).set({ data: { time: { created: 1 } } })
      .where(eq(SessionMessageTable.id, active.context.assistantMessageID)).run().pipe(Effect.orDie)
    const corrupt = yield* active.run().pipe(Effect.exit)
    expect(corrupt._tag).toBe("Failure")
    if (corrupt._tag === "Failure") expect(corrupt.cause.reasons.some(Cause.isDieReason)).toBe(true)
  }).pipe(Effect.timeout("10 seconds")))
})
