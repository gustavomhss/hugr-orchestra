import { describe, expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { Effect, Ref } from "effect"
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

})
