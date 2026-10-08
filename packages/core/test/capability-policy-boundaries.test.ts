import { describe, expect } from "bun:test"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber, Ref } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityPolicyFixture.layer)

describe("CapabilityPolicy boundaries", () => {
  Array.of("allow", "ask").forEach((captured) => {
    it.live(`revoked captured-${captured} approval rechecks issuer deny after current ask queues`, () => Effect.gen(function* () {
      const f = yield* CapabilityPolicyFixture.fixture()
      yield* CapabilityPolicyFixture.setRules([])
      const q = yield* CapabilityPolicyFixture.queued(f.context, f.run({ ...f.binding,
        effectiveRules: captured === "allow" ? CapabilityPolicyFixture.allow : [],
      }, f.context, { action: "read", resources: ["secret-resource/key"] }))
      expect(yield* Ref.get(f.effects)).toBe(0)
      expect(yield* f.permissions.list()).toEqual([q.request])
      expect(yield* Ref.get(q.observation.count)).toBe(1)
      yield* CapabilityPolicyFixture.setRules([{ action: "read", resource: "secret-resource/*", effect: "deny" }])
      yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
      const result = yield* q.join
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") yield* CapabilityPolicyFixture.expectFailure(result.failure)
      expect(yield* Ref.get(f.effects)).toBe(0)
      expect(yield* Ref.get(q.observation.count)).toBe(1)
      expect(yield* f.permissions.list()).toEqual([])
    }).pipe(Effect.timeout("10 seconds")))

    it.live(`deleted Session during captured-${captured} approval invalidates live binding`, () => Effect.gen(function* () {
      const f = yield* CapabilityPolicyFixture.fixture()
      yield* CapabilityPolicyFixture.setRules([])
      const q = yield* CapabilityPolicyFixture.queued(f.context, f.run({ ...f.binding,
        effectiveRules: captured === "allow" ? CapabilityPolicyFixture.allow : [],
      }))
      yield* f.database.db.delete(SessionTable).where(eq(SessionTable.id, f.context.sessionID)).run().pipe(Effect.orDie)
      yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
      const result = yield* q.join
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") yield* CapabilityPolicyFixture.expectFailure(result.failure, "invocation_binding_mismatch")
      expect(yield* Ref.get(f.effects)).toBe(0)
      expect(yield* Ref.get(q.observation.count)).toBe(1)
      expect(yield* f.permissions.list()).toEqual([])
    }).pipe(Effect.timeout("10 seconds")))
  })

  it.live("configured deny redacts both captured paths before queue; listener has positive queue control", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    yield* CapabilityPolicyFixture.setRules([{ action: "read", resource: "secret-resource/*", effect: "deny" },
      { action: "secret-rule", resource: "*", effect: "deny" }])
    yield* Effect.forEach([CapabilityPolicyFixture.allow, []], (effectiveRules) => f.run({ ...f.binding, effectiveRules },
      f.context, { action: "read", resources: ["secret-resource/key"] }).pipe(
      Effect.flip, Effect.flatMap((error) => CapabilityPolicyFixture.expectFailure(error)),
    ))
    expect(yield* Ref.get(f.effects)).toBe(0)
    expect(yield* Ref.get(observation.count)).toBe(0)
    expect(yield* f.permissions.list()).toEqual([])
    yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.allow)
    const q = yield* CapabilityPolicyFixture.queued(f.context, f.run({ ...f.binding, effectiveRules: [] }))
    expect(yield* Ref.get(observation.count)).toBe(1)
    expect(yield* f.permissions.list()).toEqual([q.request])
    yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
    expect((yield* q.join)._tag).toBe("Success")
    expect(yield* Ref.get(f.effects)).toBe(1)
    expect(yield* f.permissions.list()).toEqual([])
  }).pipe(Effect.timeout("10 seconds")))

  Array.of(true, false).forEach((allowedFirst) => it.live(
    `same-Location opposite frames stay isolated while ${allowedFirst ? "allowed" : "denied"} frame remains live`,
    () => Effect.gen(function* () {
      const f = yield* CapabilityPolicyFixture.fixture()
      const heldReady = yield* Deferred.make<void>()
      const checkHeld = yield* Deferred.make<void>()
      const heldChecked = yield* Deferred.make<void>()
      const releaseHeld = yield* Deferred.make<void>()
      const siblingReady = yield* Deferred.make<void>()
      const releaseSibling = yield* Deferred.make<void>()
      const check = (allowed: boolean) => Effect.gen(function* () {
        const result = yield* f.policy.assert(f.context, CapabilityPolicyFixture.input)
          .pipe(Effect.andThen(f.target), Effect.result)
        expect(result._tag).toBe(allowed ? "Success" : "Failure")
        if (result._tag === "Failure") yield* CapabilityPolicyFixture.expectFailure(result.failure)
      })
      const held = yield* CapabilityInvocation.withContext({ ...f.binding,
        effectiveRules: allowedFirst ? CapabilityPolicyFixture.allow : CapabilityPolicyFixture.deny,
      }, Effect.gen(function* () {
        yield* check(allowedFirst)
        yield* Deferred.succeed(heldReady, undefined)
        yield* Deferred.await(checkHeld)
        yield* check(allowedFirst)
        yield* Deferred.succeed(heldChecked, undefined)
        yield* Deferred.await(releaseHeld)
      })).pipe(Effect.forkChild)
      yield* Deferred.await(heldReady)
      expect(yield* Ref.get(f.effects)).toBe(allowedFirst ? 1 : 0)
      const sibling = yield* CapabilityInvocation.withContext({ ...f.binding,
        effectiveRules: allowedFirst ? CapabilityPolicyFixture.deny : CapabilityPolicyFixture.allow,
      }, Effect.gen(function* () {
        yield* check(!allowedFirst)
        yield* Deferred.succeed(siblingReady, undefined)
        yield* Deferred.await(releaseSibling)
      })).pipe(Effect.forkChild)
      yield* Deferred.await(siblingReady)
      expect(yield* Ref.get(f.effects)).toBe(1)
      // Parent must remain unbound while both opposite child frames are still active.
      yield* CapabilityPolicyFixture.expectFailure(yield* f.policy.assert(f.context, CapabilityPolicyFixture.input)
        .pipe(Effect.flip), "invocation_binding_missing")
      yield* Deferred.succeed(checkHeld, undefined)
      yield* Deferred.await(heldChecked)
      expect(yield* Ref.get(f.effects)).toBe(allowedFirst ? 2 : 1)
      yield* Deferred.succeed(releaseSibling, undefined)
      yield* Fiber.join(sibling)
      yield* Deferred.succeed(releaseHeld, undefined)
      yield* Fiber.join(held)
      expect(yield* Ref.get(f.effects)).toBe(allowedFirst ? 2 : 1)
      expect(yield* f.permissions.list()).toEqual([])
    }).pipe(Effect.timeout("10 seconds")),
  ))

  it.live("captured allow rejects current ask with or without feedback as an exact redacted failure", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules([])
    yield* Effect.forEach([undefined, "secret provider feedback"], (message) => Effect.gen(function* () {
      const q = yield* CapabilityPolicyFixture.queued(f.context, f.run())
      expect(yield* f.permissions.list()).toEqual([q.request])
      expect(yield* Ref.get(f.effects)).toBe(0)
      yield* f.permissions.reply({ requestID: q.request.id, reply: "reject", ...(message ? { message } : {}) })
      const result = yield* q.join
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") yield* CapabilityPolicyFixture.expectFailure(result.failure)
      expect(yield* Ref.get(f.effects)).toBe(0)
      expect(yield* Ref.get(q.observation.count)).toBe(1)
      expect(yield* f.permissions.list()).toEqual([])
      yield* q.observation.unsubscribe
    }))
  }).pipe(Effect.timeout("10 seconds")))

  Array.of("before", "during").forEach((timing) => it.live(
    `completed projected root ${timing} authorization cannot authorize a target`,
    () => Effect.gen(function* () {
      const f = yield* CapabilityPolicyFixture.fixture()
      const sessions = yield* SessionStore.Service
      if (timing === "during") yield* CapabilityPolicyFixture.setRules([])
      const q = timing === "during" ? yield* CapabilityPolicyFixture.queued(f.context, f.run()) : undefined
      expect(yield* Ref.get(f.effects)).toBe(0)
      yield* f.events.publish(SessionEvent.Tool.Called, {
        sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
        callID: f.context.toolCallID, tool: "service_call", input: {}, provider: { executed: false },
        timestamp: CapabilityPolicyFixture.timestamp,
      })
      yield* f.events.publish(SessionEvent.Tool.Success, {
        sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
        callID: f.context.toolCallID, timestamp: CapabilityPolicyFixture.timestamp,
        structured: {}, content: [], provider: { executed: false },
      })
      const stored = yield* sessions.message(f.context.assistantMessageID)
      expect(stored?.message.type).toBe("assistant")
      if (stored?.message.type === "assistant") expect(stored.message.content.some((part) =>
        part.type === "tool" && part.id === f.context.toolCallID && part.state.status === "completed")).toBe(true)
      if (q) yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
      const result = yield* q ? q.join : f.run().pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") yield* CapabilityPolicyFixture.expectFailure(result.failure, "invocation_binding_mismatch")
      expect(yield* Ref.get(f.effects)).toBe(0)
      if (q) expect(yield* Ref.get(q.observation.count)).toBe(1)
      expect(yield* f.permissions.list()).toEqual([])
    }).pipe(Effect.timeout("10 seconds")),
  ))

  it.live("Asked observation ignores other Sessions, messages and calls but sees its exact root", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    const other = yield* CapabilityPolicyFixture.fixture()
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    yield* CapabilityPolicyFixture.setRules([])
    yield* Effect.forEach([other.context, { ...f.context, assistantMessageID: other.context.assistantMessageID },
      { ...f.context, toolCallID: "other-call" }], (context) => Effect.gen(function* () {
      const asked = yield* f.permissions.ask({ ...CapabilityPolicyFixture.input,
        sessionID: context.sessionID, agent: context.agent,
        source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
      })
      expect(asked.effect).toBe("ask")
      expect((yield* f.permissions.list()).map((request) => request.id)).toEqual([asked.id])
      yield* f.permissions.reply({ requestID: asked.id, reply: "once" })
    }))
    expect(yield* Ref.get(observation.count)).toBe(0)
    const q = yield* CapabilityPolicyFixture.queued(f.context, f.run())
    expect(yield* Ref.get(observation.count)).toBe(1)
    yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
    expect((yield* q.join)._tag).toBe("Success")
    expect(yield* f.permissions.list()).toEqual([])
  }).pipe(Effect.timeout("10 seconds")))

  it.effect("issued effective rules and native floor resist caller mutation and require-based widening", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    yield* Effect.forEach(["effectiveRules", "nativeDenyFloor"] as const, (field) => Effect.gen(function* () {
      const rules = CapabilityPolicyFixture.deny.map((rule) => ({ ...rule }))
      yield* CapabilityInvocation.withContext({ ...f.binding, [field]: rules }, Effect.gen(function* () {
        // This body starts only after withContext has issued its immutable capture.
        rules.forEach((rule) => { rule.effect = "allow"; rule.resource = "secret-rule" })
        rules.push(...CapabilityPolicyFixture.allow.map((rule) => ({ ...rule })))
        const binding = yield* CapabilityInvocation.require(f.context, {
          projectID: CapabilityPolicyFixture.placement.project.id,
          location: { directory: CapabilityPolicyFixture.placement.directory },
        })
        expect(Reflect.set(binding, field, CapabilityPolicyFixture.allow.map((rule) => ({ ...rule })))).toBe(false)
        expect(Reflect.set(binding[field], binding[field].length, { action: "read", resource: "*", effect: "allow" })).toBe(false)
        binding[field].forEach((rule) => expect(Reflect.set(rule, "effect", "allow")).toBe(false))
        yield* CapabilityPolicyFixture.expectFailure(yield* f.policy.assert(f.context, CapabilityPolicyFixture.input)
          .pipe(Effect.andThen(f.target), Effect.flip))
      }))
    }))
    expect(yield* Ref.get(f.effects)).toBe(0)
    expect(yield* f.permissions.list()).toEqual([])
    yield* f.run()
    expect(yield* Ref.get(f.effects)).toBe(1)
  }))

  it.live("saved grant really allows kernel but captured ask still queues; once preserves baseline grants", () => Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    const saved = yield* PermissionSaved.Service
    yield* CapabilityPolicyFixture.setRules([])
    const request = { ...CapabilityPolicyFixture.input, sessionID: f.context.sessionID, agent: f.context.agent }
    expect(yield* f.permissions.evaluate(request)).toBe("ask")
    yield* saved.add({ projectID: f.binding.owner.projectID, action: "read", resources: ["src/*"] })
    const baseline = yield* saved.list({ projectID: f.binding.owner.projectID })
    expect(baseline).toEqual([{ id: expect.any(String), projectID: f.binding.owner.projectID, action: "read", resource: "src/*" }])
    expect(yield* f.permissions.evaluate(request)).toBe("allow")
    yield* f.run()
    expect(yield* Ref.get(f.effects)).toBe(1)
    const q = yield* CapabilityPolicyFixture.queued(f.context, f.run({ ...f.binding, effectiveRules: [] }))
    expect(q.request.save).toBeUndefined()
    expect(yield* Ref.get(f.effects)).toBe(1)
    expect(yield* f.permissions.list()).toEqual([q.request])
    yield* f.permissions.reply({ requestID: q.request.id, reply: "once" })
    expect((yield* q.join)._tag).toBe("Success")
    expect(yield* Ref.get(q.observation.count)).toBe(1)
    expect(yield* Ref.get(f.effects)).toBe(2)
    expect(yield* f.permissions.list()).toEqual([])
    expect(yield* saved.list({ projectID: f.binding.owner.projectID })).toEqual(baseline)
    expect(yield* f.permissions.evaluate(request)).toBe("allow")
  }).pipe(Effect.timeout("10 seconds")))
})
