import { describe, expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityPolicy } from "@orchestra/core/capability/policy"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import type { Tool } from "@orchestra/core/tool/tool"
import { Capability } from "@orchestra/schema/capability"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq } from "drizzle-orm"
import { Cause, DateTime, Deferred, Effect, Fiber, Layer, Ref, Schema } from "effect"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"

const placement = location({ directory: AbsolutePath.make("/project") })
const it = testEffect(AppNodeBuilder.build(LayerNode.group([
  Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node, AgentV2.node, Location.node,
]), [[Location.node, Layer.succeed(Location.Service, Location.Service.of(placement))]]))
const allow: PermissionV2.Ruleset = [{ action: "read", resource: "*", effect: "allow" }]
const deny: PermissionV2.Ruleset = [{ action: "read", resource: "*", effect: "deny" }]
const input = { action: "read", resources: ["src/index.ts"] }
const timestamp = DateTime.makeUnsafe(1)

function setRules(rules: PermissionV2.Ruleset, id = AgentV2.ID.make("test")) {
  return Effect.gen(function* () {
    const agents = yield* AgentV2.Service
    yield* agents.transform((editor) => editor.update(id, (agent) => { agent.permissions = [...rules] }))
  })
}

function fixture(options: { message?: boolean; part?: boolean; agent?: string; name?: string } = {}) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const permissions = yield* PermissionV2.Service
    const context: Tool.Context = {
      sessionID: SessionV2.ID.create(), agent: AgentV2.ID.make("test"),
      assistantMessageID: SessionMessage.ID.create(), toolCallID: "root-call",
    }
    yield* database.db.insert(ProjectTable).values({
      id: Project.ID.global, worktree: placement.directory, sandboxes: [],
    }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* database.db.insert(SessionTable).values({
      id: context.sessionID, project_id: Project.ID.global, directory: placement.directory,
      slug: "policy", title: "policy", version: "test", agent: "test",
    }).run().pipe(Effect.orDie)
    if (options.message !== false) {
      yield* events.publish(SessionEvent.Step.Started, {
        ...context, timestamp, agent: options.agent ?? "test",
        model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") },
      })
      if (options.part !== false) yield* events.publish(SessionEvent.Tool.Input.Started, {
        sessionID: context.sessionID, assistantMessageID: context.assistantMessageID,
        callID: context.toolCallID, name: options.name ?? "service_call", timestamp,
      })
    }
    yield* setRules(allow)
    const binding: CapabilityInvocation.HostInput = {
      issuer: "core", owner: {
        projectID: placement.project.id, location: { directory: placement.directory },
        sessionID: context.sessionID, agentID: context.agent,
      }, invocation: {
        sessionID: context.sessionID, agentID: context.agent,
        assistantMessageID: context.assistantMessageID, callID: context.toolCallID,
      }, rootToolName: "service_call", effectiveRules: allow, nativeDenyFloor: [],
    }
    const policy = yield* CapabilityPolicy.make
    const effects = yield* Ref.make(0)
    const run = (host = binding, supplied = context, request = input) => CapabilityInvocation.withContext(
      host, policy.assert(supplied, request).pipe(Effect.andThen(Ref.update(effects, (n) => n + 1))),
    )
    return { context, binding, policy, run, events, permissions, database, effects }
  })
}

function queued(effect: Effect.Effect<void, Capability.Failure>) {
  return Effect.gen(function* () {
    const events = yield* EventV2.Service
    const asked = yield* Deferred.make<PermissionV2.Request>()
    const unsubscribe = yield* events.listen((event) => event.type === PermissionV2.Event.Asked.type
      ? Deferred.succeed(asked, Schema.decodeUnknownSync(PermissionV2.Request)(event.data)).pipe(Effect.asVoid)
      : Effect.void)
    yield* Effect.addFinalizer(() => unsubscribe)
    const fiber = yield* effect.pipe(Effect.result, Effect.forkChild)
    const request = yield* Effect.raceFirst(Deferred.await(asked), Fiber.join(fiber).pipe(
      Effect.andThen(Effect.fail(new Error("POLICY_BYPASSED_PERMISSION_QUEUE"))),
    ))
    return { fiber, request }
  })
}

describe("CapabilityPolicy", () => {
  it.effect("allows real pending/running roots; captured denies and invalid inputs stop target before queue", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.run()
    yield* f.events.publish(SessionEvent.Tool.Called, {
      sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
      callID: f.context.toolCallID, tool: "service_call", input: {}, provider: { executed: false }, timestamp,
    })
    yield* f.run()
    yield* Effect.forEach([
      { ...f.binding, effectiveRules: deny },
      { ...f.binding, nativeDenyFloor: [...deny, ...allow] },
      { ...f.binding, nativeDenyFloor: deny, effectiveRules: [] },
    ], (host) => f.run(host).pipe(Effect.result, Effect.map((result) => expect(result).toMatchObject({
      _tag: "Failure", failure: { code: "target_denied" },
    }))))
    yield* Effect.forEach([
      { action: "", resources: ["x"] }, { action: " read", resources: ["x"] },
      { action: "read", resources: [] }, { action: "read", resources: [""] },
      { action: "read", resources: ["src/index.ts", "private/key"] },
    ], (request) => f.run({ ...f.binding, effectiveRules: [...allow, {
      action: "read", resource: "private/*", effect: "deny",
    }] }, f.context, request).pipe(Effect.flip, Effect.map((error) => expect(error.code).toBe("target_denied"))))
    expect(yield* Ref.get(f.effects)).toBe(2)
    expect(yield* f.permissions.list()).toEqual([])
    yield* f.run({ ...f.binding, nativeDenyFloor: [{ action: "read", resource: "*", effect: "ask" }] })
    expect(yield* Ref.get(f.effects)).toBe(3)
  }))

  it.live("captured ask really queues despite configured allow; once/reject/correction use kernel reply", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.forEach(["once", "reject", "correct"] as const, (reply) => Effect.gen(function* () {
      const q = yield* queued(f.run({ ...f.binding, effectiveRules: [] }))
      expect(q.request).toMatchObject({ sessionID: f.context.sessionID, ...input, source: {
        type: "tool", messageID: f.context.assistantMessageID, callID: f.context.toolCallID,
      } })
      expect(yield* Ref.get(f.effects)).toBe(reply === "once" ? 0 : 1)
      expect(yield* f.permissions.list()).toEqual([q.request])
      yield* f.permissions.reply({ requestID: q.request.id, reply: reply === "once" ? "once" : "reject",
        ...(reply === "correct" ? { message: "secret provider feedback" } : {}),
      })
      expect(yield* Fiber.join(q.fiber)).toMatchObject(reply === "once" ? { _tag: "Success" } : {
        _tag: "Failure", failure: { code: "target_denied", message: "Capability action is not authorized" },
      })
      expect(yield* Ref.get(f.effects)).toBe(1)
      expect(yield* f.permissions.list()).toEqual([])
    }))
  }).pipe(Effect.timeout("10 seconds")))

  it.live("same-Location overlapping opposite frames retain isolated authorization", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ready = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const blocked = yield* CapabilityInvocation.withContext({ ...f.binding, effectiveRules: deny },
      Effect.gen(function* () {
        yield* Deferred.succeed(ready, undefined)
        yield* Deferred.await(release)
        return yield* f.policy.assert(f.context, input).pipe(Effect.result)
      }),
    ).pipe(Effect.forkChild)
    yield* Deferred.await(ready)
    yield* f.run()
    yield* Deferred.succeed(release, undefined)
    expect(yield* Fiber.join(blocked)).toMatchObject({ _tag: "Failure", failure: { code: "target_denied" } })
    expect(yield* Ref.get(f.effects)).toBe(1)
  }).pipe(Effect.timeout("10 seconds")))

  it.live("Session agent switches never retarget issuer; revocation during approval still blocks", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* setRules(deny, AgentV2.ID.make("reviewer"))
    yield* f.events.publish(SessionEvent.AgentSwitched, {
      sessionID: f.context.sessionID, messageID: SessionMessage.ID.create(), agent: "reviewer", timestamp,
    })
    yield* f.run()
    const q = yield* queued(f.run({ ...f.binding, effectiveRules: [] }))
    yield* setRules(allow, AgentV2.ID.make("reviewer"))
    yield* setRules(deny)
    yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
    expect(yield* Fiber.join(q.fiber)).toMatchObject({ _tag: "Failure", failure: { code: "target_denied" } })
    expect((yield* f.run().pipe(Effect.flip)).code).toBe("target_denied")
    expect((yield* f.run({ ...f.binding, effectiveRules: [] }).pipe(Effect.flip)).code).toBe("target_denied")
    expect(yield* Ref.get(f.effects)).toBe(1)
    expect(yield* f.permissions.list()).toEqual([])
  }).pipe(Effect.timeout("10 seconds")))

  const invalid = [
    ["missing message", { message: false }], ["missing part", { part: false }],
    ["wrong actor", { agent: "reviewer" }], ["wrong tool", { name: "other_tool" }],
  ] as const
  invalid.forEach(([name, options]) => it.effect(`rejects host claims with stored ${name}`, () => Effect.gen(function* () {
    const f = yield* fixture(options)
    const error = yield* f.run().pipe(Effect.flip)
    expect(error).toBeInstanceOf(Capability.Failure)
    expect(error.code).toBe("invocation_binding_mismatch")
    expect(Object.keys(yield* Schema.encodeEffect(Capability.Failure)(error)).sort()).toEqual(["_tag", "code", "message"])
    expect(yield* Ref.get(f.effects)).toBe(0)
    expect(yield* f.permissions.list()).toEqual([])
  })))

  it.effect("rejects fake context, child calls, wrong message Session, placement and missing Session", () => Effect.gen(function* () {
    const f = yield* fixture()
    const forged = { ...f.context, binding: f.binding }
    expect((yield* f.policy.assert(forged, input).pipe(Effect.flip)).code)
      .toBe("invocation_binding_missing")
    const child = { ...f.binding, invocation: { ...f.binding.invocation, callID: "root-call:child:0" } }
    expect((yield* f.run(child, { ...f.context, toolCallID: child.invocation.callID }).pipe(Effect.flip)).code)
      .toBe("invocation_binding_mismatch")
    const other = yield* fixture()
    expect((yield* f.run({ ...f.binding, invocation: {
      ...f.binding.invocation, assistantMessageID: other.context.assistantMessageID,
    } }, { ...f.context, assistantMessageID: other.context.assistantMessageID }).pipe(Effect.flip)).code)
      .toBe("invocation_binding_mismatch")
    const systemMessageID = SessionMessage.ID.create()
    yield* f.events.publish(SessionEvent.ContextUpdated, {
      sessionID: f.context.sessionID, messageID: systemMessageID, text: "system context", timestamp,
    })
    expect((yield* f.run({ ...f.binding, invocation: {
      ...f.binding.invocation, assistantMessageID: systemMessageID,
    } }, { ...f.context, assistantMessageID: systemMessageID }).pipe(Effect.flip)).code)
      .toBe("invocation_binding_mismatch")
    yield* Effect.forEach([
      { ...f.binding.owner, projectID: Project.ID.make("wrong-project") },
      { ...f.binding.owner, location: { directory: AbsolutePath.make("/elsewhere") } },
      { ...f.binding.owner, location: { directory: placement.directory, workspaceID: WorkspaceID.make("wrk_other") } },
    ], (owner) => f.run({ ...f.binding, owner }).pipe(Effect.flip,
      Effect.map((error) => expect(error.code).toBe("invocation_binding_mismatch"))))
    yield* f.events.publish(SessionEvent.Moved, {
      sessionID: f.context.sessionID, location: { directory: AbsolutePath.make("/elsewhere") }, timestamp,
    })
    expect((yield* f.run().pipe(Effect.flip)).code).toBe("invocation_binding_mismatch")
    yield* f.database.db.delete(SessionTable).where(eq(SessionTable.id, f.context.sessionID)).run().pipe(Effect.orDie)
    expect((yield* f.run().pipe(Effect.flip)).code).toBe("invocation_binding_mismatch")
    expect(yield* Ref.get(f.effects)).toBe(0)
    expect(yield* f.permissions.list()).toEqual([])
  }))

  it.effect("stored project and workspace must match captured placement", () => Effect.gen(function* () {
    const f = yield* fixture()
    const projectID = Project.ID.make("other-project")
    yield* f.database.db.insert(ProjectTable).values({
      id: projectID, worktree: AbsolutePath.make("/other"), sandboxes: [],
    }).run().pipe(Effect.orDie)
    yield* f.database.db.update(SessionTable).set({ project_id: projectID })
      .where(eq(SessionTable.id, f.context.sessionID)).run().pipe(Effect.orDie)
    expect((yield* f.run().pipe(Effect.flip)).code).toBe("invocation_binding_mismatch")
    const explicit = { ...placement, workspaceID: WorkspaceID.make("wrk_explicit") }
    const policy = yield* CapabilityPolicy.make.pipe(Effect.provideService(Location.Service, explicit))
    const binding = { ...f.binding, owner: { ...f.binding.owner,
      location: { directory: explicit.directory, workspaceID: explicit.workspaceID },
    } }
    // Restore project so only persisted implicit workspace differs from the issued explicit placement.
    yield* f.database.db.update(SessionTable).set({ project_id: placement.project.id })
      .where(eq(SessionTable.id, f.context.sessionID)).run().pipe(Effect.orDie)
    expect((yield* CapabilityInvocation.withContext(binding, policy.assert(f.context, input)).pipe(Effect.flip)).code)
      .toBe("invocation_binding_mismatch")
    expect(yield* Ref.get(f.effects)).toBe(0)
    expect(yield* f.permissions.list()).toEqual([])
  }))

  it.live("settled root before/during approval cannot authorize; interruption survives and clears queue", () => Effect.gen(function* () {
    const f = yield* fixture()
    const q = yield* queued(f.run({ ...f.binding, effectiveRules: [] }))
    yield* f.events.publish(SessionEvent.Tool.Failed, {
      sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
      callID: f.context.toolCallID, error: { type: "unknown", message: "done" }, provider: { executed: false }, timestamp,
    })
    yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
    expect(yield* Fiber.join(q.fiber)).toMatchObject({ _tag: "Failure", failure: { code: "invocation_binding_mismatch" } })
    expect((yield* f.run().pipe(Effect.flip)).code).toBe("invocation_binding_mismatch")
    const active = yield* fixture()
    const waiting = yield* queued(active.run({ ...active.binding, effectiveRules: [] }))
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
