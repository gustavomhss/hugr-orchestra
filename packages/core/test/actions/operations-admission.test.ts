import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { count, eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ActionsOperationTable } from "../../src/actions/operations/sql"
import { LEASE } from "../../src/actions/operations/storage"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { testEffect } from "../lib/effect"
import { fault, fixture, intent, open } from "./operations-fixture"

const it = testEffect(LayerNode.compile(AppProcess.node))

it.live("admission snapshots canonical intent before caller edits target and preconditions", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const target = { runID: "9876", ref: undefined }
  const expected = { attempt: 3, commit: undefined }
  const command = intent(service.binding, { target, expected })
  const lease = yield* service.operations.prepare(service.binding, command)
  target.runID = "edited-run"
  expected.attempt = 4
  expect(lease.target).toEqual({ runID: "9876" })
  const processService = yield* AppProcess.Service
  const accepted = yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, (admitted) => Effect.gen(function* () {
    expect(admitted.clientID).toBe(command.clientID)
    expect(admitted.target).toEqual({ runID: "9876" })
    expect(admitted.expected).toEqual({ attempt: 3 })
    const native = yield* processService.run(ChildProcess.make(process.execPath, [
      "-e", 'process.stdout.write(JSON.stringify({ runID: "native-returned-run" }))',
    ]), { timeout: "10 seconds", maxOutputBytes: 4096, maxErrorBytes: 4096 }).pipe(Effect.orDie)
    expect(native.exitCode).toBe(0)
    return Schema.decodeUnknownSync(Schema.fromJsonString(Actions.OperationAcknowledgement))(native.stdout.toString())
  }))
  expect(accepted.state).toBe("accepted")
  const stored = yield* f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, lease.id)).get()
  expect(stored?.target).toEqual({ runID: "9876" })
  expect(stored?.expected).toEqual({ attempt: 3 })
}))

it.live("exact typed prepare retry with top-level, target and expected optional undefined returns same durable lease", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  yield* Effect.forEach([
    { target: { runID: "9876" }, expected: undefined },
    { target: { runID: "9876", ref: undefined }, expected: undefined },
    { target: { runID: "9876", ref: undefined }, expected: { attempt: 3, sourceVersion: undefined, commit: undefined, resourceVersion: undefined } },
    { target: { runID: "9876" }, expected: { attempt: undefined, sourceVersion: undefined, commit: undefined, resourceVersion: undefined } },
  ] satisfies ReadonlyArray<Pick<Actions.OperationIntent, "target" | "expected">>, (optional) => Effect.gen(function* () {
    const command = intent(service.binding, optional)
    const lease = yield* service.operations.prepare(service.binding, command)
    expect(yield* service.operations.prepare(service.binding, command)).toEqual(lease)
    expect(yield* service.operations.prepare(service.binding, command)).toEqual(lease)
    const stored = yield* f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, lease.id)).get()
    expect(stored?.target).toEqual({ runID: "9876" })
    expect(stored?.expected).toEqual(optional.expected === undefined ? null : optional.expected.attempt === undefined ? {} : { attempt: 3 })
  }))
  expect((yield* f.database.db.select({ total: count() }).from(ActionsOperationTable).get())?.total).toBe(4)
}))

it.live("prepare retries share one 24-hour lease; edited intent, actor and revision conflict", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const command = intent(service.binding)
  const leases = yield* Effect.all([
    service.operations.prepare(service.binding, command), service.operations.prepare(service.binding, command),
  ], { concurrency: "unbounded" })
  expect(leases[1]).toEqual(leases[0])
  expect(leases[0].expiresAt - leases[0].createdAt).toBe(LEASE)
  expect((yield* f.database.db.select({ total: count() }).from(ActionsOperationTable).get())?.total).toBe(1)
  const reordered = { ...command, target: { ref: command.target.ref, runID: command.target.runID } }
  expect(yield* service.operations.prepare(service.binding, reordered)).toEqual(leases[0])
  yield* Effect.forEach([
    { ...command, kind: "run.cancel" as const },
    { ...command, target: { runID: "other-run" } },
    { ...command, expected: { ...command.expected, attempt: 4 } },
    { ...command, expected: { ...command.expected, sourceVersion: "edited-blob" } },
    { ...command, expected: undefined },
  ], (changed) => fault(service.operations.prepare(service.binding, changed), "intent_conflict"))
  yield* fault(service.operations.prepare({ ...service.binding, account: "other-actor" }, command), "intent_conflict")
  const revised = { ...service.binding, revision: 2 }
  yield* fault(service.operations.prepare(revised, { ...command, binding: { id: revised.id, revision: 2 } }), "intent_conflict")
  expect((yield* f.database.db.select().from(ActionsOperationTable).get())?.expected).toEqual(command.expected)
}))

it.live("admission rejects missing account, stale binding and undeclared sensitive DTO fields", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const command = intent(service.binding)
  yield* fault(service.operations.prepare({ ...service.binding, account: undefined }, command), "not_authenticated")
  yield* fault(service.operations.prepare({ ...service.binding, account: " " }, command), "not_authenticated")
  yield* fault(service.operations.prepare(service.binding, { ...command, binding: { ...command.binding, revision: 2 } }), "binding_stale")
  const extra = { ...command, target: { ...command.target, value: "admission-secret" } }
  yield* fault(service.operations.prepare(service.binding, extra), "invalid_input")
  const extraExpected = { ...command, expected: { ...command.expected, source: "sensitive-source" } }
  yield* fault(service.operations.prepare(service.binding, extraExpected), "invalid_input")
  const extraTopUndefined = { ...command, extra: undefined }
  yield* fault(service.operations.prepare(service.binding, extraTopUndefined), "invalid_input")
  const extraTargetUndefined = { ...command, target: { ...command.target, extra: undefined } }
  yield* fault(service.operations.prepare(service.binding, extraTargetUndefined), "invalid_input")
  const extraExpectedUndefined = { ...command, expected: { ...command.expected, extra: undefined } }
  yield* fault(service.operations.prepare(service.binding, extraExpectedUndefined), "invalid_input")
  expect(yield* f.database.db.select().from(ActionsOperationTable).all()).toEqual([])
}))

it.live("receipt access is isolated by canonical Location, workspace, core project, binding, native host and actor", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const prepared = yield* service.operations.prepare(service.binding, intent(service.binding))
  const calls: number[] = []
  const perform = () => Effect.sync(() => { calls.push(1); return {} })
  yield* Effect.forEach([
    [{ ...service.binding, id: Actions.BindingID.make("ab_other") }, "operation_missing"],
    [{ ...service.binding, account: "other-actor" }, "not_authenticated"],
    [{ ...service.binding, revision: 2 }, "binding_stale"],
    [{ ...service.binding, projectID: "other-native-project" }, "host_mismatch"],
    [{ ...service.binding, provider: { ...service.binding.provider, hostname: "other.example" } }, "host_mismatch"],
    [{ ...service.binding, provider: { ...service.binding.provider, apiOrigin: "https://other.example/api" } }, "host_mismatch"],
    [{ ...service.binding, provider: { ...service.binding.provider, kind: "gitlab" } }, "host_mismatch"],
    [{ ...service.binding, directory: `${f.directory}/other` }, "host_mismatch"],
    [{ ...service.binding, workspaceID: "explicit-workspace" }, "host_mismatch"],
  ] satisfies ReadonlyArray<readonly [Actions.Binding, Actions.ErrorKind]>, ([changed, kind]) => Effect.gen(function* () {
    yield* fault(service.operations.get(changed, prepared.id), kind)
    yield* fault(service.operations.execute(changed, { id: prepared.id, input: {} }, perform), kind)
  }))
  const workspace = yield* open(f.database, f.directory, { workspaceID: "explicit-workspace" })
  yield* fault(workspace.operations.get(workspace.binding, prepared.id), "operation_missing")
  const project = yield* open(f.database, f.directory, { projectID: "other-core-project" })
  yield* fault(project.operations.get(project.binding, prepared.id), "operation_missing")
  expect(calls).toEqual([])
  expect((yield* service.operations.get(service.binding, prepared.id)).state).toBe("prepared")
  expect(yield* service.operations.prepare(service.binding, intent(service.binding))).toMatchObject({ state: "prepared" })
}))

it.live("missing, purged and exactly expired execute fail closed without remote callback", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const calls: number[] = []
  const perform = () => Effect.sync(() => { calls.push(1); return {} })
  yield* fault(service.operations.execute(service.binding, { id: Actions.OperationID.make("aop_missing"), input: {} }, perform), "operation_missing")
  const expired = yield* service.operations.prepare(service.binding, intent(service.binding))
  yield* f.database.db.update(ActionsOperationTable).set({ time_expires: expired.createdAt }).where(eq(ActionsOperationTable.id, expired.id)).run()
  yield* fault(service.operations.execute(service.binding, { id: expired.id, input: {} }, perform), "operation_expired")
  const purged = yield* service.operations.prepare(service.binding, intent(service.binding))
  yield* f.database.db.delete(ActionsOperationTable).where(eq(ActionsOperationTable.id, purged.id)).run()
  yield* fault(service.operations.execute(service.binding, { id: purged.id, input: {} }, perform), "operation_missing")
  expect(calls).toEqual([])
  expect((yield* f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, expired.id)).get())?.state).toBe("expired")
}))

it.live("database write failure becomes named safe error and never invokes provider", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const prepared = yield* service.operations.prepare(service.binding, intent(service.binding))
  yield* f.database.db.run("PRAGMA query_only = ON")
  yield* fault(service.operations.prepare(service.binding, intent(service.binding)), "maintenance_required")
  yield* fault(service.operations.execute(service.binding, { id: prepared.id, input: { secret: "execute-secret" } }, () => Effect.die("provider must not run")), "maintenance_required")
  yield* f.database.db.run("PRAGMA query_only = OFF")
  expect((yield* service.operations.get(service.binding, prepared.id)).state).toBe("prepared")
}))
