import { expect, test } from "bun:test"
import { rm } from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Effect, Exit, Cause, Schema } from "effect"
import { ToolFailure } from "@orchestra/llm"
import { EventV2 } from "@orchestra/core/event"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { GovernanceRecordsV2 } from "../src/v2/governance/records"
import {
  withApproval, mutate, memoryOnly, removeContext, reservationType, consumedType,
  type CurrencyFixture, type Mutation,
} from "./fixture/governed-currency"

const counts = (fixture: CurrencyFixture) => fixture.rows().pipe(Effect.map((rows) => ({
  reservations: rows.filter((row) => row.type === reservationType),
  consumed: rows.filter((row) => row.type === consumedType),
})))

const denied = Effect.fn("CurrencyTest.denied")(function* (operation: Effect.Effect<unknown, unknown>) {
  const result = yield* Effect.exit(operation)
  expect(Exit.isFailure(result)).toBe(true)
  if (Exit.isSuccess(result)) return yield* Effect.die("new execution authority unexpectedly succeeded")
  const error = Cause.squash(result.cause)
  expect(error).toBeInstanceOf(ToolFailure)
  if (!(error instanceof ToolFailure)) return yield* Effect.die("currency refusal was not a ToolFailure")
  expect(error.message).toMatch(/^Governed Task denied: .*?(context|evidence|binding)/)
})

test("currency control: real grounded approval reserves and first beforeTurn consumes unchanged evidence", () => {
  expectSpawn(import.meta.path)
  return withApproval((fixture) => Effect.gen(function* () {
    expect(fixture.context.mode).toBe("GROUNDED")
    expect(yield* fixture.isCurrent()).toBe(true)
    expect(fixture.approved.decision.approvalMessageID).toBe("msg_reply")
    expect(fixture.context.contextHash).toMatch(/^[a-f0-9]{64}$/)
    expect(fixture.validation.contextRecordID).toBe(fixture.context.id)
    const plan = yield* GovernanceRecordsV2.readPlanRevision(fixture.services.db, fixture.governed.planRevisionID)
    expect(plan?.revisionHash).toBe(fixture.governed.revisionHash)
    const durable = yield* fixture.rows()
    expect(durable.find((row) => row.id === fixture.validation.id)?.type)
      .toBe(EventV2.versionedType(MaestroEvent.Validation.RecordedV3.type, 3))
    expect(durable.find((row) => row.id === fixture.context.id)?.type)
      .toBe(EventV2.versionedType(MaestroEvent.Context.RecordedV2.type, 2))
    expect(durable.filter((row) => row.type === EventV2.versionedType(MaestroEvent.Approval.Decided.type, 1)))
      .toHaveLength(1)
    const reserved = yield* fixture.reserve()
    yield* fixture.child(reserved.childSessionID)
    yield* fixture.beforeTurn(reserved.childSessionID)
    const rows = yield* counts(fixture)
    expect(rows.reservations).toHaveLength(1)
    expect(rows.consumed).toHaveLength(1)
    expect(rows.consumed[0].data).toMatchObject({
      sessionID: fixture.sessionID, childSessionID: reserved.childSessionID,
      taskHash: fixture.governed.taskHash, approvalMessageID: "msg_reply",
    })
  }))
})

test("currency control: exact consumed receipt and reservation replay survive legitimate tracked edits", () => {
  expectSpawn(import.meta.path)
  return withApproval((fixture) => Effect.gen(function* () {
    const reserved = yield* fixture.reserve()
    yield* fixture.child(reserved.childSessionID)
    yield* fixture.consume(reserved.childSessionID)
    const before = yield* counts(fixture)
    yield* mutate(fixture, "tracked")
    expect(yield* fixture.isCurrent()).toBe(false)
    yield* fixture.consume(reserved.childSessionID)
    yield* fixture.beforeTurn(reserved.childSessionID)
    expect(yield* fixture.reserve()).toMatchObject({ ...reserved, replayReserved: true })
    expect(yield* counts(fixture)).toEqual(before)
  }))
})

test("currency control: excluded Memory append leaves real evidence current through reserve and consume", () => {
  expectSpawn(import.meta.path)
  return withApproval((fixture) => Effect.gen(function* () {
    const before = yield* fixture.current()
    yield* memoryOnly(fixture)
    expect(yield* fixture.current()).toEqual(before)
    expect(yield* fixture.isCurrent()).toBe(true)
    const reserved = yield* fixture.reserve()
    yield* fixture.child(reserved.childSessionID)
    yield* fixture.beforeTurn(reserved.childSessionID)
    expect((yield* counts(fixture)).consumed).toHaveLength(1)
  }))
})

test("currency control: existing dispatch refuses the real approval after an untracked mutation", () => {
  expectSpawn(import.meta.path)
  return withApproval((fixture) => Effect.gen(function* () {
    yield* mutate(fixture, "untracked")
    expect(yield* fixture.isCurrent()).toBe(false)
    const error = yield* Effect.flip(fixture.dispatch())
    expect(error.message).toStartWith("MaestroDispatchRejected: context-not-current")
    expect(yield* counts(fixture)).toEqual({ reservations: [], consumed: [] })
  }))
})

for (const mutation of ["tracked", "untracked", "head", "grounding"] satisfies Mutation[]) {
  test(`currency fault: ${mutation} mutation before reserve publishes no new reservation`, () => {
    expectSpawn(import.meta.path)
    return withApproval((fixture) => Effect.gen(function* () {
      const before = yield* fixture.current()
      yield* mutate(fixture, mutation)
      if (mutation === "grounding") expect(yield* fixture.current()).toEqual(before)
      expect(yield* fixture.isCurrent()).toBe(false)
      yield* denied(fixture.reserve())
      expect(yield* counts(fixture)).toEqual({ reservations: [], consumed: [] })
    }))
  })

  test(`currency fault: ${mutation} mutation after reserve refuses actual first beforeTurn without a receipt`, () => {
    expectSpawn(import.meta.path)
    return withApproval((fixture) => Effect.gen(function* () {
      const reserved = yield* fixture.reserve()
      yield* fixture.child(reserved.childSessionID)
      const before = yield* fixture.current()
      yield* mutate(fixture, mutation)
      if (mutation === "grounding") expect(yield* fixture.current()).toEqual(before)
      expect(yield* fixture.isCurrent()).toBe(false)
      // This is the actual pre-provider hook, not an observed provider execution or a synthetic counter.
      yield* denied(fixture.beforeTurn(reserved.childSessionID))
      expect((yield* counts(fixture)).reservations).toHaveLength(1)
      expect((yield* counts(fixture)).consumed).toHaveLength(0)
    }))
  })
}

test("currency fault: an unconsumed reservation may reconcile after mutation but cannot first consume", () => {
  expectSpawn(import.meta.path)
  return withApproval((fixture) => Effect.gen(function* () {
    const reserved = yield* fixture.reserve()
    yield* fixture.child(reserved.childSessionID)
    yield* mutate(fixture, "tracked")
    expect(yield* fixture.reserve()).toEqual(reserved)
    yield* denied(fixture.consume(reserved.childSessionID))
    expect((yield* counts(fixture)).reservations).toHaveLength(1)
    expect((yield* counts(fixture)).consumed).toHaveLength(0)
  }))
})

for (const stage of ["reserve", "consume"] as const) {
  test(`currency fault: missing bound context refuses ${stage} without a consumed receipt`, () => {
    expectSpawn(import.meta.path)
    return withApproval((fixture) => Effect.gen(function* () {
      const reserved = stage === "consume" ? yield* fixture.reserve() : undefined
      if (reserved) yield* fixture.child(reserved.childSessionID)
      yield* removeContext(fixture)
      expect(yield* GovernanceRecordsV2.readContext(fixture.services.db, fixture.context.id)).toBeUndefined()
      yield* denied(reserved ? fixture.consume(reserved.childSessionID) : fixture.reserve())
      const rows = yield* counts(fixture)
      expect(rows.reservations).toHaveLength(reserved ? 1 : 0)
      expect(rows.consumed).toHaveLength(0)
    }))
  })

  for (const binding of ["session", "project", "plan", "hash"] as const) {
    test(`currency fault: validation ${binding} binding mismatch refuses ${stage}`, () => {
      expectSpawn(import.meta.path)
      return withApproval((fixture) => Effect.gen(function* () {
        const reserved = stage === "consume" ? yield* fixture.reserve() : undefined
        if (reserved) yield* fixture.child(reserved.childSessionID)
        const { id, ...validation } = fixture.validation
        const changed = binding === "session" ? { ...validation, sessionID: "ses_other_currency" }
          : binding === "project" ? { ...validation, projectID: "prj_other_currency" }
          : binding === "plan" ? { ...validation, planRevisionID: fixture.context.id }
          : { ...validation, contextHash: GovernanceRecordsV2.hash(["different-binding"]) }
        yield* fixture.services.db.update(EventV2.EventTable).set({ data: changed })
          .where(eq(EventV2.EventTable.id, EventV2.ID.make(id))).run().pipe(Effect.orDie)
        expect(yield* GovernanceRecordsV2.readValidation(fixture.services.db, id)).toMatchObject(changed)
        expect(yield* fixture.isCurrent()).toBe(true)
        yield* denied(reserved ? fixture.consume(reserved.childSessionID) : fixture.reserve())
        expect((yield* counts(fixture)).reservations).toHaveLength(reserved ? 1 : 0)
        expect((yield* counts(fixture)).consumed).toHaveLength(0)
      }))
    })
  }

  test(`currency fault: unreadable actual grounded skill refuses ${stage}`, () => {
    expectSpawn(import.meta.path)
    return withApproval((fixture) => Effect.gen(function* () {
      const reserved = stage === "consume" ? yield* fixture.reserve() : undefined
      if (reserved) yield* fixture.child(reserved.childSessionID)
      const file = fixture.context.toolPlan.actions.at(0)?.path
      if (!file) return yield* Effect.die("grounded context has no skill")
      yield* fixture.git(["update-index", "--assume-unchanged", file])
      yield* Effect.promise(() => rm(path.join(fixture.directory, file)))
      expect(yield* fixture.isCurrent()).toBe(false)
      yield* denied(reserved ? fixture.consume(reserved.childSessionID) : fixture.reserve())
      expect((yield* counts(fixture)).reservations).toHaveLength(reserved ? 1 : 0)
      expect((yield* counts(fixture)).consumed).toHaveLength(0)
    }))
  })
}

test("currency control: concurrent exact first consumes publish one immutable receipt", () => {
  expectSpawn(import.meta.path)
  return withApproval((fixture) => Effect.gen(function* () {
    const reserved = yield* fixture.reserve()
    yield* fixture.child(reserved.childSessionID)
    yield* Effect.all([fixture.consume(reserved.childSessionID), fixture.consume(reserved.childSessionID)], { concurrency: 2 })
    const before = yield* counts(fixture)
    expect(before.reservations).toHaveLength(1)
    expect(before.consumed).toHaveLength(1)
    yield* fixture.consume(reserved.childSessionID)
    expect(yield* counts(fixture)).toEqual(before)
  }))
})

test("currency control: a conflicting existing receipt is refused and never cleared or overwritten", () => {
  expectSpawn(import.meta.path)
  return withApproval((fixture) => Effect.gen(function* () {
    const reserved = yield* fixture.reserve()
    yield* fixture.child(reserved.childSessionID)
    yield* fixture.consume(reserved.childSessionID)
    const original = (yield* counts(fixture)).consumed[0]
    const data = Schema.decodeUnknownSync(MaestroEvent.Approval.ConsumedV2.data)(original.data)
    yield* fixture.services.db.update(EventV2.EventTable).set({ data: { ...data, callID: "another-call" } })
      .where(eq(EventV2.EventTable.id, original.id)).run().pipe(Effect.orDie)
    const held = yield* counts(fixture)
    yield* denied(fixture.consume(reserved.childSessionID))
    yield* denied(fixture.reserve())
    expect(yield* counts(fixture)).toEqual(held)
  }))
})
