import { describe, expect } from "bun:test"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionTable } from "@orchestra/core/session/sql"
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
      const q = yield* CapabilityPolicyFixture.queued(f.run({ ...f.binding,
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
      const q = yield* CapabilityPolicyFixture.queued(f.run({ ...f.binding,
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
    const observation = yield* CapabilityPolicyFixture.observeAsked()
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
    const q = yield* CapabilityPolicyFixture.queued(f.run({ ...f.binding, effectiveRules: [] }))
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
      const ready = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
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
        yield* Deferred.succeed(ready, undefined)
        yield* Deferred.await(release)
        yield* check(allowedFirst)
      })).pipe(Effect.forkChild)
      yield* Deferred.await(ready)
      expect(yield* Ref.get(f.effects)).toBe(allowedFirst ? 1 : 0)
      const sibling = yield* CapabilityInvocation.withContext({ ...f.binding,
        effectiveRules: allowedFirst ? CapabilityPolicyFixture.deny : CapabilityPolicyFixture.allow,
      }, check(!allowedFirst)).pipe(Effect.forkChild)
      yield* Fiber.join(sibling)
      expect(yield* Ref.get(f.effects)).toBe(1)
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(held)
      expect(yield* Ref.get(f.effects)).toBe(allowedFirst ? 2 : 1)
      // Parent has no authority after either sibling frame exits.
      yield* CapabilityPolicyFixture.expectFailure(yield* f.policy.assert(f.context, CapabilityPolicyFixture.input)
        .pipe(Effect.flip), "invocation_binding_missing")
      expect(yield* f.permissions.list()).toEqual([])
    }).pipe(Effect.timeout("10 seconds")),
  ))

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
    const q = yield* CapabilityPolicyFixture.queued(f.run({ ...f.binding, effectiveRules: [] }))
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
