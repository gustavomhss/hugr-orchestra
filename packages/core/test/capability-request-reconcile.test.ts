import { describe, expect } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq, sql } from "drizzle-orm"
import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Ref } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { CapabilityOperator } from "../src/capability/operator"
import type { CapabilityOperatorContract } from "../src/capability/operator/contract"
import { CapabilityRequest } from "../src/capability/operator/request"
import type { CapabilityRequestContract } from "../src/capability/operator/request-contract"
import type { CapabilityConnectionSetupContract } from "../src/capability/connection/setup-contract"
import { CapabilityRequestTable } from "../src/capability/sql"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node])))
const DomainTable = sqliteTable("capability_reconcile_fixture", { id: text().primaryKey(), owner: text().notNull() })
const target: CapabilityOperatorContract.Target = { action: "connection.connect",
  placement: { projectID: Project.ID.global, location: { directory: AbsolutePath.make("/project") } },
  resource: { kind: "provider", id: "slack" } }

function fixture(now?: () => number, principal = "operator") {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* CapabilityOperator.make({ principal,
      scope: { placements: "instance", actions: ["*"] }, ...(now ? { now } : {}) })
    const store = yield* CapabilityRequest.make({ operators, maxReceipts: 1 })
    // Actual inference must satisfy the setup seam without widening the existing commit contract.
    const ledger: CapabilityRequestContract.Interface & CapabilityConnectionSetupContract.Reconciliation = store
    const id = randomUUID()
    yield* database.db.run("CREATE TABLE IF NOT EXISTS capability_reconcile_fixture (id TEXT PRIMARY KEY, owner TEXT NOT NULL)")
    const write = (tx: CapabilityRequestContract.Transaction) => tx.insert(DomainTable)
      .values({ id, owner: principal }).run().pipe(Effect.as({ reference: id, metadata: { verified: true } }))
    const verify = (tx: CapabilityRequestContract.Transaction) => Effect.gen(function* () {
      const row = yield* tx.select().from(DomainTable).where(eq(DomainTable.id, id)).get()
      if (row && row.owner !== principal) return yield* Effect.fail("OWNER_CHANGED")
    })
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>, key = "intent", authority = operators.configured) =>
      operators.withRequest(authority, { requestID: randomUUID(), idempotencyKey: key }, effect)
    const rows = database.db.select().from(DomainTable).where(eq(DomainTable.id, id))
    return { database, operators, store, ledger, id, principal, write, verify, run, rows }
  })
}

function expectCode(error: unknown, code: Capability.ErrorCode) {
  expect(error).toBeInstanceOf(Capability.Failure)
  if (!(error instanceof Capability.Failure)) throw new Error("Expected Capability.Failure")
  expect(error.code).toBe(code)
  expect(error.detail).toBeUndefined()
}

function failed<A, E>(exit: Exit.Exit<A, E>) {
  if (!Exit.isFailure(exit)) throw new Error("Expected failed Exit")
  return exit.cause
}

describe("CapabilityRequest reconcile under the SQL writer", () => {
  it.live("decoded implicit-local placement reconciles omitted and own undefined workspace identity", () => Effect.gen(function* () {
    const f = yield* fixture()
    const local = { ...target, placement: { ...target.placement,
      location: { ...target.placement.location, workspaceID: undefined } } }
    expect(yield* f.run(f.store.reconcile(local, { key: "private" }))).toBeUndefined()
    const receipt = yield* f.run(f.store.commit(local, { key: "private" }, f.write))
    expect(yield* f.run(f.store.reconcile(target, { key: "private" }))).toEqual({ ...receipt, reused: true })
    expect(yield* f.run(f.store.reconcile(local, { key: "private" }))).toEqual({ ...receipt, reused: true })
  }))

  it.live("missing receipts leave no domain or ledger rows and consume no quota", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.forEach(["intent", "other", "intent"], (key) => Effect.gen(function* () {
      expect(yield* f.run(f.ledger.reconcile(target, { key: "private" }, f.verify), key)).toBeUndefined()
      expect(yield* f.rows).toHaveLength(0)
      expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(0)
    }))
    const first = yield* f.run(f.store.commit(target, { key: "private" }, f.write, f.verify))
    expect(first.reused).toBe(false)
    expect(yield* f.run(f.store.reconcile(target, { key: "private" }, f.verify))).toEqual({ ...first, reused: true })
    expect(yield* f.run(f.store.reconcile(target, {}, f.verify), "missing-at-quota")).toBeUndefined()
    expectCode(yield* f.run(f.store.commit(target, {}, () => Effect.die("QUOTA_WRITE_RAN")), "new")
      .pipe(Effect.flip), "quota_exceeded")
    expect(yield* f.rows).toHaveLength(1)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(1)
  }))

  it.live("exact replay preserves original immutable receipt; full payload and target changes conflict", () => Effect.gen(function* () {
    const f = yield* fixture()
    const first = yield* f.run(f.store.commit(target, { key: "secret-original", nested: { a: 1, b: 2 } }, f.write))
    const next = yield* f.operators.issue({ origin: "sdk", scope: {
      placements: [target.placement], actions: [target.action], resources: [{ kind: "provider", id: "slack" }],
    } })
    const replay = yield* f.run(f.store.reconcile(target, { nested: { b: 2, a: 1 }, key: "secret-original" }), "intent", next.authority)
    expect(replay).toEqual({ ...first, reused: true })
    expect(Object.isFrozen(replay)).toBe(true)
    expect(Object.isFrozen(replay?.data)).toBe(true)
    expect(Object.isFrozen(Object.getOwnPropertyDescriptor(replay?.data, "metadata")?.value)).toBe(true)
    const changes: CapabilityOperatorContract.Target[] = [
      { ...target, action: "connection.disconnect" },
      { ...target, placement: { ...target.placement, projectID: Project.ID.make("other") } },
      { ...target, placement: { ...target.placement, location: { directory: AbsolutePath.make("/other") } } },
      { ...target, placement: { ...target.placement, location: { ...target.placement.location, workspaceID: WorkspaceID.make("wrk_other") } } },
      { ...target, resource: { kind: "target", id: "slack" } },
      { ...target, resource: { kind: "provider", id: "discord" } },
      { action: target.action, placement: target.placement },
    ]
    expectCode(yield* f.run(f.store.reconcile(target, { key: "secret-changed", nested: { a: 1, b: 2 } }))
      .pipe(Effect.flip), "outcome_unknown")
    yield* Effect.forEach(changes, (changed) => f.run(f.store.reconcile(changed, { key: "secret-original", nested: { a: 1, b: 2 } }))
      .pipe(Effect.flip, Effect.tap((error) => Effect.sync(() => expectCode(error, "outcome_unknown")))))
    expect(yield* f.rows).toHaveLength(1)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(1)
  }))

  it.live("call-time snapshot detaches payload and full target; ledger stores hashes, never raw key", () => Effect.gen(function* () {
    const f = yield* fixture()
    const supplied = { action: target.action, placement: { projectID: target.placement.projectID,
      location: { ...target.placement.location } }, resource: { kind: "provider", id: "slack" } }
    const payload = { nested: { key: "secret-captured" } }
    const first = yield* f.run(f.store.commit(target, payload, f.write), "secret-idempotency-key")
    const pending = f.store.reconcile(supplied, payload)
    payload.nested.key = "secret-changed"
    supplied.action = "connection.disconnect"
    supplied.placement.location.directory = AbsolutePath.make("/changed")
    supplied.resource.id = "discord"
    expect(yield* f.run(pending, "secret-idempotency-key")).toEqual({ ...first, reused: true })
    const rows = yield* f.database.db.all(sql`SELECT * FROM capability_request`)
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain("secret-")
    const row = yield* f.database.db.select().from(CapabilityRequestTable).get()
    expect(row?.payload_hash).toBe(createHash("sha256").update(JSON.stringify({ nested: { key: "secret-captured" } })).digest("hex"))
    expect(row?.idempotency_hash).toBe(createHash("sha256").update(JSON.stringify(["operator", "secret-idempotency-key"])).digest("hex"))
  }))

  it.live("private authority, mandatory idempotency and top-level transaction identity fence reconciliation", () => Effect.gen(function* () {
    const f = yield* fixture()
    expectCode(yield* f.store.reconcile(target, {}).pipe(Effect.flip), "invocation_binding_missing")
    const foreign = yield* fixture()
    expectCode(yield* f.run(f.store.reconcile(target, {}), "intent", foreign.operators.configured)
      .pipe(Effect.flip), "authentication_required")
    expectCode(yield* f.operators.withRequest(f.operators.configured, { requestID: randomUUID() }, f.store.reconcile(target, {}))
      .pipe(Effect.flip), "unsupported_operation")
    expectCode(yield* f.run(f.database.db.transaction(() => f.store.reconcile(target, {}, () => Effect.die("AMBIENT_VERIFY_RAN")),
      { behavior: "immediate" })).pipe(Effect.flip), "invocation_binding_mismatch")
    const store = yield* CapabilityRequest.make({ operators: f.operators }).pipe(
      Effect.provideService(Database.Service, { db: f.database.db }))
    expect(failed(yield* f.run(store.reconcile(target, {})).pipe(Effect.exit)).reasons)
      .toContainEqual(expect.objectContaining({ _tag: "Die", defect: "Capability request requires SQL transaction identity" }))
    expect(yield* f.rows).toHaveLength(0)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(0)
  }))

  it.live("verification runs inside writer before missing or replay, and owner changes reject both", () => Effect.gen(function* () {
    const f = yield* fixture()
    const inTransaction = f.database.inTransaction
    if (!inTransaction) throw new Error("Expected real SQL transaction identity")
    const checked = { count: 0 }
    const verify = (tx: CapabilityRequestContract.Transaction) => Effect.gen(function* () {
      expect(yield* inTransaction).toBe(true)
      checked.count++
      yield* f.verify(tx)
    })
    expect(yield* f.run(f.store.reconcile(target, {}, verify))).toBeUndefined()
    yield* f.run(f.store.commit(target, {}, f.write, verify))
    expect((yield* f.run(f.store.reconcile(target, {}, verify)))?.reused).toBe(true)
    expect(checked.count).toBe(3)
    yield* f.database.db.update(DomainTable).set({ owner: "foreign" }).where(eq(DomainTable.id, f.id)).run()
    yield* Effect.forEach(["intent", "fresh"], (key) => Effect.gen(function* () {
      expect(yield* f.run(f.store.reconcile(target, {}, verify), key).pipe(Effect.flip)).toBe("OWNER_CHANGED")
      expectCode(yield* f.run(f.store.reconcile(target, {}, (tx) => tx.update(DomainTable).set({ owner: "changed" })
        .where(eq(DomainTable.id, f.id)).run().pipe(Effect.andThen(tx.run("INSERT INTO missing_secret_table VALUES (1)")), Effect.asVoid)), key)
        .pipe(Effect.flip), "outcome_unknown")
      expect((yield* f.rows)[0].owner).toBe("foreign")
    }))
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(1)
  }))

  it.live("revocation or expiry while waiting for writer rejects missing and replay before verification", () => Effect.gen(function* () {
    yield* Effect.forEach([false, true], (replay) => Effect.forEach(["revoke", "expire"], (mode) => Effect.gen(function* () {
      const clock = { now: 100 }
      const f = yield* fixture(() => clock.now, `operator-${mode}-${replay}`)
      if (replay) yield* f.run(f.store.commit(target, {}, f.write))
      const token = yield* f.operators.issue({ origin: "cli", ttlMillis: 10 })
      const authorized = yield* Deferred.make<void>()
      const required = yield* Ref.make(0)
      const store = yield* CapabilityRequest.make({ operators: { ...f.operators,
        require: (requested) => f.operators.require(requested).pipe(Effect.tap(() => Effect.gen(function* () {
          if ((yield* Ref.updateAndGet(required, (n) => n + 1)) === 1) yield* Deferred.succeed(authorized, undefined)
        }))),
      } })
      const locked = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const writer = yield* f.database.db.transaction(() => Deferred.succeed(locked, undefined)
        .pipe(Effect.andThen(Deferred.await(release))), { behavior: "immediate" }).pipe(Effect.forkChild)
      yield* Deferred.await(locked)
      const pending = yield* f.run(store.reconcile(target, {}, () => Effect.die("REVOKED_VERIFY_RAN")), "intent", token.authority)
        .pipe(Effect.exit, Effect.forkChild)
      yield* Effect.raceFirst(Deferred.await(authorized), Fiber.join(pending).pipe(Effect.andThen(Effect.die("INITIAL_REQUIRE_FAILED"))))
      if (mode === "revoke") yield* f.operators.revoke(token.authority)
      if (mode === "expire") clock.now = 110
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(writer)
      const cause = failed(yield* Fiber.join(pending))
      expect(cause.reasons.map((reason) => reason._tag)).toEqual(["Fail"])
      expectCode(cause.reasons[0]._tag === "Fail" ? cause.reasons[0].error : undefined, "authentication_required")
      expect(yield* Ref.get(required)).toBe(1)
      expect(yield* f.rows).toHaveLength(replay ? 1 : 0)
      expect(yield* f.database.db.select().from(CapabilityRequestTable)
        .where(eq(CapabilityRequestTable.principal, f.principal))).toHaveLength(replay ? 1 : 0)
    })))
  }).pipe(Effect.timeout("10 seconds")))

  it.live("authority revalidates after yielded verification on both missing and replay", () => Effect.gen(function* () {
    yield* Effect.forEach([false, true], (replay) => Effect.forEach(["revoke", "expire"], (mode) => Effect.gen(function* () {
      const clock = { now: 100 }
      const f = yield* fixture(() => clock.now, `operator-${mode}-${replay}`)
      if (replay) yield* f.run(f.store.commit(target, {}, f.write))
      const token = yield* f.operators.issue({ origin: "sdk", ttlMillis: 10 })
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const pending = yield* f.run(f.store.reconcile(target, {}, () => Deferred.succeed(entered, undefined)
        .pipe(Effect.andThen(Deferred.await(release)), Effect.asVoid)), "intent", token.authority).pipe(Effect.exit, Effect.forkChild)
      yield* Deferred.await(entered)
      if (mode === "revoke") yield* f.operators.revoke(token.authority)
      if (mode === "expire") clock.now = 110
      yield* Deferred.succeed(release, undefined)
      expect(failed(yield* Fiber.join(pending)).reasons).toContainEqual(expect.objectContaining({ _tag: "Fail",
        error: expect.objectContaining({ code: "authentication_required" }) }))
      expect(yield* f.rows).toHaveLength(replay ? 1 : 0)
    })))
  }).pipe(Effect.timeout("10 seconds")))

  it.live("real rollback fault retains full annotated mixed Cause and failed cleanup", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.run(f.store.commit(target, {}, f.write))
    const Annotation = Context.Service<{ phase: string }>("test/reconcile/rollback")
    const originals: Cause.Cause<unknown>[] = []
    const exit = yield* f.run(f.store.reconcile(target, {}, (tx) => Effect.gen(function* () {
      yield* tx.update(DomainTable).set({ owner: "changed" }).where(eq(DomainTable.id, f.id)).run()
      const sqlExit = yield* tx.run(sql`INSERT OR ROLLBACK INTO capability_reconcile_fixture (id, owner) VALUES (${f.id}, 'operator')`)
        .pipe(Effect.exit)
      const original = Cause.annotate(Cause.combine(failed(sqlExit), Cause.combine(Cause.fail("DOMAIN_FAILURE"),
        Cause.combine(Cause.die(new Error("host defect")), Cause.interrupt(123)))), Context.make(Annotation, { phase: "verify" }))
      originals.push(original)
      return yield* Effect.failCause(original)
    }))).pipe(Effect.exit)
    const actual: Cause.Cause<unknown> = failed(exit)
    const original = originals[0]
    expect(original.reasons.map((reason) => reason._tag)).toEqual(["Fail", "Fail", "Die", "Interrupt"])
    expect(actual.reasons.slice(0, 4)).toEqual(Array.from(original.reasons))
    original.reasons.forEach((reason, index) => expect(Context.getOrUndefined(Cause.reasonAnnotations(actual.reasons[index]), Annotation))
      .toBe(Context.getOrUndefined(Cause.reasonAnnotations(reason), Annotation)))
    expect(actual.reasons).toHaveLength(5)
    const cleanup = actual.reasons[4]
    if (cleanup._tag !== "Fail" || !(cleanup.error instanceof SqlError)) throw new Error("Expected cleanup SqlError")
    expect(String(cleanup.error.reason.cause)).toContain("no transaction is active")
    expect((yield* f.rows)[0].owner).toBe("operator")
    expect((yield* f.run(f.store.reconcile(target, {})))?.reused).toBe(true)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(1)
  }))

  it.live("corrupt stored results hit bounded defect boundary without mutating receipt", () => Effect.gen(function* () {
    const f = yield* fixture()
    const first = yield* f.run(f.store.commit(target, {}, f.write))
    yield* Effect.forEach(["{broken", JSON.stringify("x".repeat(16 * 1024)), JSON.stringify(Array.from({ length: 1024 }, () => null))],
      (result) => Effect.gen(function* () {
        yield* f.database.db.update(CapabilityRequestTable).set({ result: sql`${result}` })
          .where(eq(CapabilityRequestTable.id, first.requestID)).run()
        expect(failed(yield* f.run(f.store.reconcile(target, {})).pipe(Effect.exit)).reasons)
          .toContainEqual(expect.objectContaining({ _tag: "Die", defect: expect.objectContaining({ message: "Capability request stored result is invalid" }) }))
        expect(yield* f.rows).toHaveLength(1)
        expect(yield* f.database.db.all(sql`SELECT result FROM capability_request`)).toEqual([{ result }])
      }))
  }))
})
