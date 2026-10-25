import { expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { Capability } from "@orchestra/schema/capability"
import { SessionTable } from "@orchestra/core/session/sql"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber, Ref } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityPolicyFixture.layer)

it.live("authorized commits hold actor policy stable through SQLite commit", () => Effect.gen(function* () {
  const f = yield* CapabilityPolicyFixture.fixture()
  const agents = yield* AgentV2.Service
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const attempted = yield* Deferred.make<void>()
  const changed = yield* Ref.make(false)
  yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
    const permit = yield* f.policy.authorize(f.context, CapabilityPolicyFixture.input)
    const commit = yield* f.policy.commit(permit, (tx) => Effect.gen(function* () {
      yield* Deferred.succeed(entered, undefined)
      yield* Deferred.await(release)
      yield* tx.update(SessionTable).set({ title: "committed" }).where(eq(SessionTable.id, f.context.sessionID)).run()
    })).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const revocation = yield* Effect.gen(function* () {
      yield* Deferred.succeed(attempted, undefined)
      yield* agents.transform((editor) => editor.update(f.context.agent, (agent) => {
        agent.permissions = [...CapabilityPolicyFixture.deny]
      }))
      yield* Ref.set(changed, true)
    }).pipe(Effect.forkChild)
    yield* Deferred.await(attempted)
    expect(yield* Ref.get(changed)).toBe(false)
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(commit)
    yield* Fiber.join(revocation)
    expect(yield* Ref.get(changed)).toBe(true)
    expect(yield* f.database.db.select().from(SessionTable).where(eq(SessionTable.id, f.context.sessionID)).get())
      .toMatchObject({ title: "committed" })
    const error = yield* f.policy.commit(permit, () => f.target).pipe(Effect.flip)
    expect(error).toBeInstanceOf(Capability.Failure)
    if (error instanceof Capability.Failure) yield* CapabilityPolicyFixture.expectFailure(error)
    expect(yield* Ref.get(f.effects)).toBe(0)
  }))
}).pipe(Effect.timeout("10 seconds")))

it.effect("permits cannot cross root scope or be minted from public claims", () => Effect.gen(function* () {
  const f = yield* CapabilityPolicyFixture.fixture()
  const permit = yield* CapabilityInvocation.withContext(f.binding,
    f.policy.authorize(f.context, CapabilityPolicyFixture.input))
  const absent = yield* f.policy.commit(permit, () => f.target).pipe(Effect.flip)
  expect(absent).toBeInstanceOf(Capability.Failure)
  if (absent instanceof Capability.Failure) yield* CapabilityPolicyFixture.expectFailure(absent, "invocation_binding_missing")
  yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
    const issued = yield* f.policy.authorize(f.context, CapabilityPolicyFixture.input)
    const fake = { ...issued }
    const cloned = yield* f.policy.commit(fake, () => f.target).pipe(Effect.flip)
    expect(cloned).toBeInstanceOf(Capability.Failure)
    if (cloned instanceof Capability.Failure) yield* CapabilityPolicyFixture.expectFailure(cloned, "invocation_binding_mismatch")
    Object.getOwnPropertySymbols(fake).forEach((key) => Reflect.deleteProperty(fake, key))
    const forged = yield* f.policy.commit(fake, () => f.target).pipe(Effect.flip)
    expect(forged).toBeInstanceOf(Capability.Failure)
    if (forged instanceof Capability.Failure) yield* CapabilityPolicyFixture.expectFailure(forged, "invocation_binding_mismatch")
  }))
  expect(yield* Ref.get(f.effects)).toBe(0)
}))

it.effect("capability commits reject ambient SQLite transactions before acquiring actor state", () => Effect.gen(function* () {
  const f = yield* CapabilityPolicyFixture.fixture()
  yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
    const permit = yield* f.policy.authorize(f.context, CapabilityPolicyFixture.input)
    const error = yield* f.database.db.transaction(() => f.policy.commit(permit, () => f.target)).pipe(Effect.flip)
    expect(error).toBeInstanceOf(Capability.Failure)
    if (error instanceof Capability.Failure) yield* CapabilityPolicyFixture.expectFailure(error, "invocation_binding_mismatch")
    expect(yield* Ref.get(f.effects)).toBe(0)
  }))
}))
