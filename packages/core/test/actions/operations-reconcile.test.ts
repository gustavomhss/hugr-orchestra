import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber } from "effect"
import { ActionsError } from "../../src/actions/error"
import { ActionsOperationTable } from "../../src/actions/operations/sql"
import { it } from "../lib/effect"
import { fault, fixture, intent, open } from "./operations-fixture"

it.live("reconcile confirms exact native acknowledgement with immutable intent and never performs another provider write", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const command = intent(service.binding)
  const lease = yield* service.operations.prepare(service.binding, command)
  const writes: number[] = []
  const accepted = yield* service.operations.execute(service.binding, { id: lease.id, input: { secret: "execute-only" } }, () => Effect.sync(() => {
    writes.push(1)
    return { runID: "exact-native-run", attempt: 4 }
  }))
  const reads: number[] = []
  const confirmed = yield* service.operations.reconcile(service.binding, lease.id, (admitted, acknowledgement) => Effect.sync(() => {
    reads.push(1)
    expect(admitted).toEqual(command)
    expect(acknowledgement).toEqual(accepted.result)
    return { state: "confirmed" as const, acknowledgement: { runID: "exact-native-run", attempt: 4, jobID: "exact-native-job" } }
  }))
  expect(confirmed.state).toBe("confirmed")
  expect(confirmed.result).toEqual({ runID: "exact-native-run", attempt: 4, jobID: "exact-native-job" })
  expect(yield* service.operations.reconcile(service.binding, lease.id, () => Effect.die("completed receipt must not observe again"))).toEqual(confirmed)
  expect(yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.sync(() => { writes.push(1); return {} }))).toEqual(confirmed)
  expect(yield* service.operations.prepare(service.binding, command)).toEqual(confirmed)
  expect(writes).toHaveLength(1)
  expect(reads).toHaveLength(1)
  expect((yield* f.database.db.select().from(ActionsOperationTable).get())?.expected).toEqual(command.expected)
}))

it.live("unknown observations stay unknown while pending; terminal observations require native attribution", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
  yield* fault(service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.fail(new ActionsError({
    kind: "transport_failed", message: "Unknown send", disposition: "unknown",
  }))), "outcome_unknown")
  const pending = yield* service.operations.reconcile(service.binding, lease.id, () => Effect.succeed({ state: "confirmed" }))
  expect(pending.state).toBe("outcome_unknown")
  expect(pending.result).toBeUndefined()
  const unattributed = yield* service.operations.reconcile(service.binding, lease.id, () => Effect.succeed({
    state: "confirmed", acknowledgement: { unattributed: true },
  }))
  expect(unattributed.state).toBe("outcome_unknown")
  const identified = yield* service.operations.reconcile(service.binding, lease.id, () => Effect.succeed({
    state: "pending", acknowledgement: { runID: "proven-native-run", unattributed: false },
  }))
  expect(identified.state).toBe("outcome_unknown")
  expect(identified.updatedAt).toBe(pending.updatedAt)
  expect(identified.result).toEqual({ runID: "proven-native-run", unattributed: false })
  expect((yield* service.operations.reconcile(service.binding, lease.id, () => Effect.succeed({ state: "confirmed" }))).state).toBe("confirmed")

  const unattributedLease = yield* service.operations.prepare(service.binding, intent(service.binding))
  yield* service.operations.execute(service.binding, { id: unattributedLease.id, input: {} }, () => Effect.succeed({ unattributed: true }))
  expect((yield* service.operations.reconcile(service.binding, unattributedLease.id, () => Effect.succeed({ state: "confirmed" }))).state).toBe("accepted")
  expect((yield* service.operations.reconcile(service.binding, unattributedLease.id, () => Effect.succeed({
    state: "rejected", acknowledgement: { resourceID: "native-proof", unattributed: false },
  }))).state).toBe("rejected")
}))

it.live("prepared, sending and rejected receipts never observe; wrong binding, revision, actor and Location never gain readback access", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
  const observe = () => Effect.die("ineligible receipt must not call observation")
  expect((yield* service.operations.reconcile(service.binding, lease.id, observe)).state).toBe("prepared")
  const started = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const owner = yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.gen(function* () {
    yield* Deferred.succeed(started, undefined)
    yield* Deferred.await(release)
    return { runID: "exact-native-run" }
  })).pipe(Effect.forkScoped)
  yield* Deferred.await(started)
  expect((yield* service.operations.reconcile(service.binding, lease.id, observe)).state).toBe("sending")
  yield* Deferred.succeed(release, undefined)
  yield* Fiber.join(owner)
  yield* Effect.forEach([
    [{ ...service.binding, id: Actions.BindingID.make("ab_other") }, "operation_missing"],
    [{ ...service.binding, revision: 2 }, "binding_stale"],
    [{ ...service.binding, account: "other-actor" }, "not_authenticated"],
    [{ ...service.binding, projectID: "other-native-project" }, "host_mismatch"],
  ] satisfies ReadonlyArray<readonly [Actions.Binding, Actions.ErrorKind]>, ([binding, kind]) =>
    fault(service.operations.reconcile(binding, lease.id, observe), kind),
  )
  const workspace = yield* open(f.database, f.directory, { workspaceID: "other-workspace" })
  yield* fault(workspace.operations.reconcile(workspace.binding, lease.id, observe), "operation_missing")
  const rejected = yield* service.operations.prepare(service.binding, intent(service.binding))
  yield* fault(service.operations.execute(service.binding, { id: rejected.id, input: {} }, () => Effect.fail(new ActionsError({
    kind: "permission_denied", message: "Safe rejection", disposition: "definitely_rejected",
  }))), "permission_denied")
  expect((yield* service.operations.reconcile(service.binding, rejected.id, observe)).state).toBe("rejected")
}))

it.live("observation extras and changed native IDs reject without changing durable receipt", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
  const accepted = yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.succeed({ runID: "exact-native-run", attempt: 4 }))
  const extra = { state: "confirmed" as const, acknowledgement: { runID: "exact-native-run", secret: "observation-secret" } }
  yield* fault(service.operations.reconcile(service.binding, lease.id, () => Effect.succeed(extra)), "invalid_input")
  const outerExtra = { state: "confirmed" as const, source: "observation-source" }
  yield* fault(service.operations.reconcile(service.binding, lease.id, () => Effect.succeed(outerExtra)), "invalid_input")
  yield* fault(service.operations.reconcile(service.binding, lease.id, () => Effect.succeed({ state: "confirmed", acknowledgement: { runID: "nearby-run" } })), "intent_conflict")
  yield* fault(service.operations.reconcile(service.binding, lease.id, () => Effect.succeed({ state: "confirmed", acknowledgement: { attempt: 5 } })), "intent_conflict")
  expect(yield* service.operations.get(service.binding, lease.id)).toEqual(accepted)
  const pending = yield* service.operations.reconcile(service.binding, lease.id, () => Effect.succeed({
    state: "pending", acknowledgement: { runID: undefined },
  }))
  expect(pending.result).toEqual(accepted.result)
  const stored = yield* f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, lease.id)).get()
  expect(JSON.stringify(stored)).not.toContain("observation-secret")
  expect(JSON.stringify(stored)).not.toContain("observation-source")
}))

it.live("concurrent terminal observations use optimistic receipt guard; stale rejection cannot overwrite confirmation", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
  yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.succeed({ runID: "exact-native-run" }))
  const both = yield* Deferred.make<void>()
  const confirm = yield* Deferred.make<void>()
  const reject = yield* Deferred.make<void>()
  const reads: string[] = []
  const observer = (state: "confirmed" | "rejected", release: Deferred.Deferred<void>) => () => Effect.gen(function* () {
    reads.push(state)
    if (reads.length === 2) yield* Deferred.succeed(both, undefined)
    yield* Deferred.await(release)
    return { state, acknowledgement: { runID: "exact-native-run" } }
  })
  const first = yield* service.operations.reconcile(service.binding, lease.id, observer("confirmed", confirm)).pipe(Effect.forkScoped)
  const second = yield* service.operations.reconcile(service.binding, lease.id, observer("rejected", reject)).pipe(Effect.forkScoped)
  yield* Deferred.await(both)
  yield* Deferred.succeed(confirm, undefined)
  const winner = yield* Fiber.join(first)
  expect(winner.state).toBe("confirmed")
  yield* Deferred.succeed(reject, undefined)
  expect(yield* Fiber.join(second)).toEqual(winner)
  expect(yield* service.operations.get(service.binding, lease.id)).toEqual(winner)
  expect(reads).toHaveLength(2)
}))
