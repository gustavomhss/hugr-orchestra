import { describe, expect } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { join } from "node:path"
import { CapabilityRequest } from "../src/capability/operator/request"
import { capture, payloadBudget, resultBudget, snapshot, stored } from "../src/capability/operator/request-data"
import type { CapabilityOperatorContract } from "../src/capability/operator/contract"
import type { CapabilityRequestContract } from "../src/capability/operator/request-contract"
import { CapabilityRequestTable } from "../src/capability/sql"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq, sql } from "drizzle-orm"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Ref, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node])))
const DomainTable = sqliteTable("capability_request_fixture", {
  id: text().primaryKey(), owner: text().notNull(), allowed: integer().notNull(), writes: integer().notNull(),
})
const resource = { kind: "project", id: "fixture" }
const target: CapabilityOperatorContract.Target = {
  action: "project.write", placement: { projectID: Project.ID.global, location: { directory: AbsolutePath.make("/project") } },
  resource,
}
const scope: CapabilityOperatorContract.GrantScope = { placements: "instance", actions: ["*"] }

// Late loading lets the frozen-contract checkpoint compile before Agent A's real factory is merged.
// Missing implementation is a hard test failure, never a skip or a substitute authority.
const operatorFactory = Effect.promise(async () => {
  const { CapabilityOperator }: { CapabilityOperator: { make: CapabilityOperatorContract.Factory } } =
    await import(new URL("../src/capability/operator/index.ts", import.meta.url).href)
  return CapabilityOperator.make
})

function fixture(options: { principal?: string; maxReceipts?: number; now?: () => number } = {}) {
  return Effect.gen(function* () {
    const makeOperator = yield* operatorFactory
    const database = yield* Database.Service
    const operators = yield* makeOperator({ principal: options.principal ?? "operator", scope,
      ...(options.now ? { now: options.now } : {}) })
    const store = yield* CapabilityRequest.make({ operators, maxReceipts: options.maxReceipts })
    const id = randomUUID()
    yield* database.db.run("CREATE TABLE IF NOT EXISTS capability_request_fixture (id TEXT PRIMARY KEY, owner TEXT NOT NULL, allowed INTEGER NOT NULL, writes INTEGER NOT NULL)")
    yield* database.db.insert(DomainTable).values({ id, owner: options.principal ?? "operator", allowed: 1, writes: 0 }).run()
    const write = (tx: CapabilityRequestContract.Transaction) => Effect.gen(function* () {
      const binding = yield* operators.require(target)
      const row = yield* tx.select().from(DomainTable).where(eq(DomainTable.id, id)).get()
      if (!row || row.owner !== binding.principal || !row.allowed) return yield* Effect.fail("DOMAIN_DENIED")
      yield* tx.update(DomainTable).set({ writes: row.writes + 1 }).where(eq(DomainTable.id, id)).run()
      return { reference: id, metadata: { changed: true } }
    })
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>, key = "key", authority = operators.configured) =>
      operators.withRequest(authority, { requestID: randomUUID(), idempotencyKey: key }, effect)
    const writes = database.db.select({ writes: DomainTable.writes }).from(DomainTable)
      .where(eq(DomainTable.id, id)).get().pipe(Effect.map((row) => row?.writes))
    return { operators, store, database, id, write, run, writes }
  })
}

function expectCode(error: unknown, code: Capability.ErrorCode) {
  expect(error).toBeInstanceOf(Capability.Failure)
  if (!(error instanceof Capability.Failure)) throw new Error("Expected Capability.Failure")
  expect(error.code).toBe(code)
  expect(error.detail).toBeUndefined()
  expect(JSON.stringify(error)).not.toContain("secret")
}

function expectCause<A, E>(exit: Exit.Exit<A, E>) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) throw new Error("Expected failed Exit")
  return exit.cause
}

function empty(f: Effect.Success<ReturnType<typeof fixture>>) {
  return Effect.gen(function* () {
    expect(yield* f.writes).toBe(0)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(0)
  })
}

describe("CapabilityRequest atomic local SQL ledger", () => {
  it.live("concurrent exact retries canonicalize full payload and return original immutable receipt", () => Effect.gen(function* () {
    const f = yield* fixture()
    const second = yield* CapabilityRequest.make({ operators: f.operators })
    const receipts = yield* Effect.all([
      f.run(f.store.commit(target, { secret: "private argument", nested: { b: 2, a: 1 } }, f.write)),
      f.run(second.commit(target, { nested: { a: 1, b: 2 }, secret: "private argument" }, f.write)),
    ], { concurrency: "unbounded" })
    expect(receipts.map((r) => r.requestID)).toEqual([receipts[0].requestID, receipts[0].requestID])
    expect(receipts.map((r) => r.reused).sort()).toEqual([false, true])
    expect(yield* f.writes).toBe(1)
    expect(receipts[0].data).toEqual({ reference: f.id, metadata: { changed: true } })
    expect(JSON.stringify(receipts)).not.toContain("secret")
    expect(Object.isFrozen(receipts[0])).toBe(true)
    expect(Object.isFrozen(receipts[0].data)).toBe(true)
    if (!receipts[0].data || typeof receipts[0].data !== "object" || Array.isArray(receipts[0].data))
      throw new Error("Expected object receipt")
    expect(Object.isFrozen(Object.getOwnPropertyDescriptor(receipts[0].data, "metadata")?.value)).toBe(true)
    expect(Reflect.set(receipts[0].data, "reference", "changed")).toBe(false)
    const rows = yield* f.database.db.select().from(CapabilityRequestTable)
    expect(rows).toHaveLength(1)
    expect(rows[0].idempotency_hash).toBe(createHash("sha256").update(JSON.stringify(["operator", "key"])).digest("hex"))
    expect(rows[0].id).toBe(receipts[0].requestID)
    expect(rows[0].origin).toBe("configured-auth")
    expect(rows[0].result).toEqual(receipts[0].data)
    expect((yield* f.run(second.commit(target, { nested: { b: 2, a: 1 }, secret: "private argument" }, f.write))).data)
      .toEqual(receipts[0].data)
    expect(yield* f.writes).toBe(1)
  }))

  it.live("same key with changed payload, action, full placement or resource always conflicts", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.run(f.store.commit(target, { secret: "original" }, f.write))
    const changes: CapabilityOperatorContract.Target[] = [
      { ...target, action: "project.read" },
      { ...target, placement: { ...target.placement, projectID: Project.ID.make("different") } },
      { ...target, placement: { ...target.placement, location: { directory: AbsolutePath.make("/other") } } },
      { ...target, placement: { ...target.placement, location: { ...target.placement.location, workspaceID: WorkspaceID.make("wrk_different") } } },
      { ...target, resource: { kind: "session", id: "fixture" } },
      { ...target, resource: { kind: "project", id: "other" } },
      { action: target.action, placement: target.placement },
    ]
    expectCode(yield* f.run(f.store.commit(target, { secret: "different" }, f.write)).pipe(Effect.flip), "outcome_unknown")
    yield* Effect.forEach(changes, (changed) => f.run(f.store.commit(changed, { secret: "original" }, f.write))
      .pipe(Effect.flip, Effect.tap((error) => Effect.sync(() => expectCode(error, "outcome_unknown")))))
    expect(yield* f.writes).toBe(1)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(1)
  }))

  it.live("caller payload, target and factory options snapshot before effects execute", () => Effect.gen(function* () {
    const f = yield* fixture()
    const options = { operators: f.operators, maxReceipts: 1 }
    const pendingStore = CapabilityRequest.make(options)
    options.maxReceipts = 20
    const store = yield* pendingStore
    const supplied = { action: target.action, placement: { projectID: target.placement.projectID,
      location: { ...target.placement.location } }, resource: { kind: "project", id: "fixture" } }
    const payload = { nested: { secret: "original" } }
    const pending = store.commit(supplied, payload, f.write)
    supplied.action = "project.read"
    supplied.resource.id = "changed"
    supplied.placement.location.directory = AbsolutePath.make("/changed")
    payload.nested.secret = "changed"
    const first = yield* f.run(pending)
    expect((yield* f.run(store.commit(target, { nested: { secret: "original" } }, f.write))).requestID).toBe(first.requestID)
    expectCode(yield* f.run(store.commit(target, {}, () => Effect.die("QUOTA_CALLBACK_RAN")), "second")
      .pipe(Effect.flip), "quota_exceeded")
    expect(yield* f.writes).toBe(1)
  }))

  it.live("quota persists per principal across handles and token generations; exact retries remain available", () => Effect.gen(function* () {
    const f = yield* fixture({ maxReceipts: 1 })
    const first = yield* f.run(f.store.commit(target, {}, f.write))
    const next = yield* f.operators.issue({ origin: "sdk" })
    const second = yield* CapabilityRequest.make({ operators: f.operators, maxReceipts: 1 })
    expectCode(yield* f.run(second.commit(target, {}, () => Effect.die("QUOTA_CALLBACK_RAN")), "second", next.authority)
      .pipe(Effect.flip), "quota_exceeded")
    expect((yield* f.run(second.commit(target, {}, f.write), "key", next.authority)).requestID).toBe(first.requestID)
    const other = yield* fixture({ principal: "other", maxReceipts: 1 })
    expect((yield* other.run(other.store.commit(target, {}, other.write))).reused).toBe(false)
    expect(yield* f.writes).toBe(1)
    expect(yield* other.writes).toBe(1)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(2)
    yield* Effect.forEach([0, -1, 0.5, Infinity, NaN], (maxReceipts) => CapabilityRequest.make({ operators: f.operators, maxReceipts })
      .pipe(Effect.flip, Effect.tap((error) => Effect.sync(() => expectCode(error, "quota_exceeded")))))
  }))

  it.live("token rotation and narrowed current grants may retry allowed target without stale creation grants", () => Effect.gen(function* () {
    const f = yield* fixture()
    const original = yield* f.operators.issue({ origin: "desktop" })
    const first = yield* f.run(f.store.commit(target, {}, f.write), "key", original.authority)
    yield* f.operators.revoke(original.authority)
    const narrow = yield* f.operators.issue({ origin: "cli", scope: {
      placements: [target.placement], actions: [target.action], resources: [resource],
    } })
    const replay = yield* f.run(f.store.commit(target, {}, f.write), "key", narrow.authority)
    expect(replay).toEqual({ ...first, reused: true })
    const creation = yield* f.database.db.select().from(CapabilityRequestTable).get()
    const current = yield* f.run(f.operators.require(target), "key", narrow.authority)
    expect(creation?.scope_hash).not.toBe(current.scopeHash)
    expect(creation?.origin).toBe("desktop")
    expectCode(yield* f.run(f.store.commit(target, {}, f.write), "key", original.authority).pipe(Effect.flip), "authentication_required")
    const denied = yield* f.operators.issue({ origin: "sdk", scope: {
      placements: [target.placement], actions: ["project.read"], resources: [resource],
    } })
    expectCode(yield* f.run(f.store.commit(target, {}, f.write), "key", denied.authority).pipe(Effect.flip), "target_denied")
    expect(yield* f.writes).toBe(1)
  }))

  it.live("missing frames, forged and foreign authorities, missing request IDs or keys cannot write", () => Effect.gen(function* () {
    const f = yield* fixture()
    expectCode(yield* f.store.commit(target, {}, f.write).pipe(Effect.flip), "invocation_binding_missing")
    const foreign = yield* fixture()
    yield* Effect.forEach([Object.freeze({}) as CapabilityOperatorContract.Authority, foreign.operators.configured], (authority) =>
      f.run(f.store.commit(target, {}, f.write), "key", authority).pipe(Effect.flip,
        Effect.tap((error) => Effect.sync(() => expectCode(error, "authentication_required")))))
    yield* Effect.forEach(["", "x".repeat(129)], (requestID) => f.operators.withRequest(f.operators.configured,
      { requestID, idempotencyKey: "key" }, f.store.commit(target, {}, f.write)).pipe(Effect.flip,
        Effect.tap((error) => Effect.sync(() => expectCode(error, "invocation_binding_mismatch")))))
    expectCode(yield* f.operators.withRequest(f.operators.configured, { requestID: randomUUID() },
      f.store.commit(target, {}, f.write)).pipe(Effect.flip), "unsupported_operation")
    yield* empty(f)
  }))

  it.live("ambient transaction rejects before callback; missing SQL identity is a named defect", () => Effect.gen(function* () {
    const f = yield* fixture()
    expectCode(yield* f.run(f.database.db.transaction(() => f.store.commit(target, {}, () => Effect.die("AMBIENT_CALLBACK_RAN")), { behavior: "immediate" }))
      .pipe(Effect.flip), "invocation_binding_mismatch")
    const store = yield* CapabilityRequest.make({ operators: f.operators }).pipe(
      Effect.provideService(Database.Service, { db: f.database.db }))
    const cause = expectCause(yield* f.run(store.commit(target, {}, () => Effect.die("MISSING_IDENTITY_CALLBACK_RAN"))).pipe(Effect.exit))
    expect(cause.reasons).toContainEqual(expect.objectContaining({ _tag: "Die", defect: "Capability request requires SQL transaction identity" }))
    yield* empty(f)
  }))

  it.live("current stored domain owner and policy reject mutation atomically", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.database.db.update(DomainTable).set({ owner: "other" }).where(eq(DomainTable.id, f.id)).run()
    expect(yield* f.run(f.store.commit(target, {}, f.write)).pipe(Effect.flip)).toBe("DOMAIN_DENIED")
    yield* f.database.db.update(DomainTable).set({ owner: "operator", allowed: 0 }).where(eq(DomainTable.id, f.id)).run()
    expect(yield* f.run(f.store.commit(target, {}, f.write)).pipe(Effect.flip)).toBe("DOMAIN_DENIED")
    yield* empty(f)
  }))

  it.live("revocation or expiry while writer waits never reaches domain callback", () => Effect.gen(function* () {
    yield* Effect.forEach(["revoke", "expire"], (mode) => Effect.gen(function* () {
      const clock = { now: 100 }
      const f = yield* fixture({ now: () => clock.now })
      const token = yield* f.operators.issue({ origin: "cli", ttlMillis: 10 })
      const authorized = yield* Deferred.make<CapabilityOperatorContract.Binding>()
      const required = yield* Ref.make(0)
      // Observe only successful real authority checks; the private frame and returned binding stay untouched.
      const operators: CapabilityOperatorContract.Interface = Object.freeze({
        ...f.operators,
        require: (requested) => f.operators.require(requested).pipe(Effect.tap((binding) => Effect.gen(function* () {
          if ((yield* Ref.updateAndGet(required, (n) => n + 1)) === 1) yield* Deferred.succeed(authorized, binding)
        }))),
      })
      const store = yield* CapabilityRequest.make({ operators })
      const locked = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const writer = yield* f.database.db.transaction(() => Effect.gen(function* () {
        yield* Deferred.succeed(locked, undefined)
        yield* Deferred.await(release)
      }), { behavior: "immediate" }).pipe(Effect.forkChild)
      yield* Deferred.await(locked)
      const pending = yield* f.run(store.commit(target, {}, () => Effect.die("REVOKED_CALLBACK_RAN")), "key", token.authority)
        .pipe(Effect.exit, Effect.forkChild)
      const binding = yield* Effect.raceFirst(Deferred.await(authorized), Fiber.join(pending).pipe(
        Effect.andThen(Effect.fail(new Error("INITIAL_REQUIRE_DID_NOT_SUCCEED"))),
      ))
      expect(binding.authority).toBe(token.authority)
      expect(binding.principal).toBe("operator")
      expect(yield* Ref.get(required)).toBe(1)
      if (mode === "revoke") yield* f.operators.revoke(token.authority)
      if (mode === "expire") clock.now = 110
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(writer)
      const cause = expectCause(yield* Fiber.join(pending))
      expect(cause.reasons).not.toContainEqual(expect.objectContaining({ _tag: "Die", defect: "REVOKED_CALLBACK_RAN" }))
      expect(cause.reasons.some((r) => r._tag === "Fail" && r.error instanceof Capability.Failure &&
        r.error.code === "authentication_required")).toBe(true)
      expect(yield* Ref.get(required)).toBe(1)
      expect(yield* f.writes).toBe(0)
      expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(0)
    }))
  }).pipe(Effect.timeout("10 seconds")))

  it.live("revocation or expiry during yielded callback rolls back domain and ledger", () => Effect.gen(function* () {
    yield* Effect.forEach(["revoke", "expire"], (mode) => Effect.gen(function* () {
      const clock = { now: 100 }
      const f = yield* fixture({ now: () => clock.now })
      const token = yield* f.operators.issue({ origin: "sdk", ttlMillis: 10 })
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const pending = yield* f.run(f.store.commit(target, {}, (tx) => Effect.gen(function* () {
        const data = yield* f.write(tx)
        yield* Deferred.succeed(entered, undefined)
        yield* Deferred.await(release)
        return data
      })), "key", token.authority).pipe(Effect.exit, Effect.forkChild)
      yield* Deferred.await(entered)
      if (mode === "revoke") yield* f.operators.revoke(token.authority)
      if (mode === "expire") clock.now = 110
      yield* Deferred.succeed(release, undefined)
      const cause = expectCause(yield* Fiber.join(pending))
      expect(cause.reasons.some((r) => r._tag === "Fail" && r.error instanceof Capability.Failure &&
        r.error.code === "authentication_required")).toBe(true)
      expect(yield* f.writes).toBe(0)
      expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(0)
    }))
  }).pipe(Effect.timeout("10 seconds")))

  it.live("callback failure, defect and interruption retain original Cause and roll back", () => Effect.gen(function* () {
    const f = yield* fixture()
    const defect = new Error("host defect")
    yield* Effect.forEach([Cause.fail("DOMAIN_FAILURE"), Cause.die(defect), Cause.interrupt(123)], (cause) =>
      Effect.gen(function* () {
        const exit = yield* f.run(f.store.commit(target, {}, (tx) => f.write(tx)
          .pipe(Effect.andThen(Effect.failCause(cause))))).pipe(Effect.exit)
        expect(expectCause(exit).reasons).toEqual(cause.reasons)
        yield* empty(f)
      }))
  }))

  it.live("only pure SQL Causes translate; mixed SQL faults retain every reason", () => Effect.gen(function* () {
    const f = yield* fixture()
    const pure = yield* f.run(f.store.commit(target, {}, (tx) => f.write(tx).pipe(
      Effect.andThen(tx.run("INSERT INTO missing_secret_table VALUES (1)")), Effect.as(null),
    ))).pipe(Effect.flip)
    expectCode(pure, "outcome_unknown")
    yield* empty(f)
    yield* Effect.forEach([Cause.fail("DOMAIN_FAILURE"), Cause.die(new Error("host defect")), Cause.interrupt(123)], (other) =>
      Effect.gen(function* () {
        const captured = { cause: Cause.empty as Cause.Cause<unknown> }
        const exit = yield* f.run(f.store.commit(target, {}, (tx) => Effect.gen(function* () {
          yield* f.write(tx)
          const sqlExit = yield* tx.run("INSERT INTO missing_secret_table VALUES (1)").pipe(Effect.exit)
          const cause = Cause.combine(expectCause(sqlExit), other)
          captured.cause = cause
          return yield* Effect.failCause(cause)
        }))).pipe(Effect.exit)
        const actual: Cause.Cause<unknown> = expectCause(exit)
        expect(actual.reasons).toEqual(captured.cause.reasons)
        expect(captured.cause.reasons).toHaveLength(2)
        yield* empty(f)
      }))
  }))

  it.live("real INSERT OR ROLLBACK preserves mixed body Cause and failed cleanup without partial receipt", () => Effect.gen(function* () {
    const f = yield* fixture()
    const Annotation = Context.Service<{ readonly phase: string }>("test/capability-request/rollback")
    const domain = { _tag: "DomainError", phase: "body" }
    const defect = new Error("host rollback defect")
    const originals: Cause.Cause<unknown>[] = []
    const exit = yield* f.run(f.store.commit(target, {}, (tx) => Effect.gen(function* () {
      yield* f.write(tx)
      // The duplicate key really rolls SQLite's transaction back before the driver's cleanup runs.
      const sqlExit = yield* tx.run(sql`INSERT OR ROLLBACK INTO capability_request_fixture
        (id, owner, allowed, writes) VALUES (${f.id}, 'operator', 1, 0)`).pipe(Effect.exit)
      const original = Cause.annotate(Cause.combine(expectCause(sqlExit),
        Cause.combine(Cause.fail(domain), Cause.combine(Cause.die(defect), Cause.interrupt(123)))),
      Context.make(Annotation, { phase: "body" }))
      originals.push(original)
      return yield* Effect.failCause(original)
    }))).pipe(Effect.exit)
    const actual: Cause.Cause<unknown> = expectCause(exit)
    const original = originals[0]
    expect(original.reasons.map((reason) => reason._tag)).toEqual(["Fail", "Fail", "Die", "Interrupt"])
    expect(actual.reasons.slice(0, original.reasons.length)).toEqual(Array.from(original.reasons))
    original.reasons.forEach((reason, index) => expect(
      Context.getOrUndefined(Cause.reasonAnnotations(actual.reasons[index]), Annotation),
    ).toBe(Context.getOrUndefined(Cause.reasonAnnotations(reason), Annotation)))
    expect(actual.reasons).toHaveLength(original.reasons.length + 1)
    const cleanup = actual.reasons[original.reasons.length]
    expect(cleanup._tag).toBe("Fail")
    if (cleanup._tag !== "Fail" || !(cleanup.error instanceof SqlError)) throw new Error("Expected cleanup SqlError")
    expect(String(cleanup.error.reason.cause)).toContain("no transaction is active")
    yield* empty(f)
    if (!f.database.inTransaction) throw new Error("Expected SQL transaction identity")
    expect(yield* f.database.inTransaction).toBe(false)
    expect((yield* f.run(f.store.commit(target, {}, f.write))).reused).toBe(false)
    expect(yield* f.writes).toBe(1)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(1)
  }))

  it.live("full payload budgets and hostile descriptors reject before write without invoking code", () => Effect.gen(function* () {
    const f = yield* fixture()
    const invoked = { getters: 0, serializers: 0, proxies: 0 }
    const cycle: { self?: unknown } = {}
    cycle.self = cycle
    const deep = Array.from({ length: 65 }).reduce<Schema.Json>((value) => [value], null)
    const hostile: unknown[] = [
      Object.defineProperty({}, "secret", { enumerable: true, get() { invoked.getters++; return 1 } }),
      { toJSON() { invoked.serializers++; return {} } },
      new Proxy({}, { ownKeys() { invoked.proxies++; return [] } }),
      new Array(2), Object.assign([1], { extra: 1 }), Object.create({ inherited: 1 }), new Date(),
      { hidden: undefined }, { nan: NaN }, { inf: Infinity }, { bigint: 1n }, { fn: () => 1 }, { symbol: Symbol() },
      Object.defineProperty({}, "hidden", { value: 1 }), { [Symbol()]: 1 }, cycle,
    ]
    yield* Effect.forEach(hostile, (payload) => f.run(f.store.commit(target, payload as Schema.Json, () => Effect.die("INVALID_PAYLOAD_CALLBACK_RAN"))).pipe(Effect.flip,
      Effect.tap((error) => Effect.sync(() => expectCode(error, "unsupported_operation")))))
    yield* Effect.forEach(["secret".repeat(50_000), Array.from({ length: 4096 }, () => null), deep], (payload) =>
      f.run(f.store.commit(target, payload, () => Effect.die("OVERSIZED_PAYLOAD_CALLBACK_RAN"))).pipe(Effect.flip,
        Effect.tap((error) => Effect.sync(() => expectCode(error, "quota_exceeded")))))
    const getterTarget = Object.defineProperty({ ...target }, "action", {
      enumerable: true, get() { invoked.getters++; return target.action },
    })
    expectCode(yield* f.run(f.store.commit(getterTarget, {}, () => Effect.die("INVALID_TARGET_CALLBACK_RAN")))
      .pipe(Effect.flip), "unsupported_operation")
    expect(invoked).toEqual({ getters: 0, serializers: 0, proxies: 0 })
    yield* empty(f)
  }))

  it.live("full result budgets and hostile JSON roll back, then immutable detached result survives retry", () => Effect.gen(function* () {
    const f = yield* fixture()
    const invoked = { getters: 0 }
    const results: unknown[] = ["secret".repeat(3000), Array.from({ length: 1024 }, () => null), new Array(1),
      { toJSON: () => ({}) }, Object.defineProperty({}, "secret", { enumerable: true, get() { invoked.getters++; return 1 } })]
    yield* Effect.forEach(results, (result, index) => Effect.gen(function* () {
      expectCode(yield* f.run(f.store.commit(target, {}, (tx) => f.write(tx).pipe(Effect.as(result as Schema.Json))))
        .pipe(Effect.flip), index < 2 ? "quota_exceeded" : "unsupported_operation")
      yield* empty(f)
    }))
    expect(invoked.getters).toBe(0)
    const result = { metadata: { name: "original" }, refs: ["opaque"] }
    const first = yield* f.run(f.store.commit(target, {}, (tx) => f.write(tx).pipe(Effect.as(result))))
    result.metadata.name = "changed"
    result.refs.push("changed")
    expect(first.data).toEqual({ metadata: { name: "original" }, refs: ["opaque"] })
    expect((yield* f.run(f.store.commit(target, {}, f.write))).data).toEqual(first.data)
    const zero = yield* f.run(f.store.commit(target, {}, (tx) => f.write(tx).pipe(Effect.as(-0))), "zero")
    const replay = yield* f.run(f.store.commit(target, {}, () => Effect.die("ZERO_REPLAY_EXECUTED_CALLBACK")), "zero")
    expect(Object.is(zero.data, 0)).toBe(true)
    expect(Object.is(zero.data, replay.data)).toBe(true)
    const nested = yield* f.run(f.store.commit(target, {}, (tx) => f.write(tx).pipe(
      Effect.as({ value: -0, values: [-0] }),
    )), "nested-zero")
    const nestedReplay = yield* f.run(f.store.commit(target, {}, () => Effect.die("ZERO_REPLAY_EXECUTED_CALLBACK")), "nested-zero")
    const decode = Schema.decodeUnknownSync(Schema.Struct({ value: Schema.Number, values: Schema.Array(Schema.Number) }))
    expect(Object.is(decode(nested.data).value, decode(nestedReplay.data).value)).toBe(true)
    expect(Object.is(decode(nested.data).values[0], decode(nestedReplay.data).values[0])).toBe(true)
  }))

  it.live("malformed or oversized stored result is a named defect, never success or execution", () => Effect.gen(function* () {
    const f = yield* fixture()
    const first = yield* f.run(f.store.commit(target, {}, f.write))
    yield* Effect.forEach(["{broken", JSON.stringify("x".repeat(16 * 1024)), JSON.stringify(Array.from({ length: 1024 }, () => null))],
      (result) => Effect.gen(function* () {
        yield* f.database.db.update(CapabilityRequestTable).set({ result: sql`${result}` })
          .where(eq(CapabilityRequestTable.id, first.requestID)).run()
        const cause = expectCause(yield* f.run(f.store.commit(target, {}, f.write)).pipe(Effect.exit))
        expect(cause.reasons.some((reason) => reason._tag === "Die" && reason.defect instanceof Error &&
          reason.defect.message === "Capability request stored result is invalid")).toBe(true)
        expect(yield* f.writes).toBe(1)
      }))
  }))

  it.live("JSON null persists as text and reopened SQLite replays original receipt without callback", () => Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
    const filename = join(tmp.path, "requests.sqlite")
    const makeOperator = yield* operatorFactory
    const first = yield* Effect.gen(function* () {
      const f = yield* fixture()
      const receipt = yield* f.run(f.store.commit(target, {}, (tx) => f.write(tx).pipe(Effect.as(null))))
      expect(receipt.data).toBeNull()
      const raw = yield* f.database.db.get<{ result: string; kind: string }>(sql`SELECT result, typeof(result) AS kind FROM capability_request`)
      expect(raw).toEqual({ result: "null", kind: "text" })
      return receipt
    }).pipe(Effect.provide(Layer.fresh(Database.layerFromPath(filename))))
    yield* Effect.gen(function* () {
      const operators = yield* makeOperator({ principal: "operator", scope })
      const store = yield* CapabilityRequest.make({ operators, maxReceipts: 1 })
      const replay = yield* operators.withRequest(operators.configured, { requestID: randomUUID(), idempotencyKey: "key" },
        store.commit(target, {}, () => Effect.die("REPLAY_EXECUTED_CALLBACK")))
      expect(replay).toEqual({ ...first, reused: true })
      const database = yield* Database.Service
      expect(yield* database.db.select().from(CapabilityRequestTable)).toHaveLength(1)
      expect((yield* database.db.select().from(DomainTable).get())?.writes).toBe(1)
    }).pipe(Effect.provide(Layer.fresh(Database.layerFromPath(filename))))
  }), 30_000)
})

describe("CapabilityRequest JSON boundary", () => {
  it.live("canonical hash captures full detached arguments and target tuple", () => Effect.sync(() => {
    const original = capture(target, { b: [1, { secret: "value" }], a: true })
    const reordered = capture(target, { a: true, b: [1, { secret: "value" }] })
    const changed = capture(target, { a: true, b: [1, { secret: "different" }] })
    if (original._tag !== "Success" || reordered._tag !== "Success" || changed._tag !== "Success")
      throw new Error("Expected snapshots")
    expect(original.success.payloadHash).toBe(reordered.success.payloadHash)
    expect(original.success.payloadHash).not.toBe(changed.success.payloadHash)
    expect(original.success.targetHash).toBe(createHash("sha256").update(JSON.stringify([
      target.action, target.placement.projectID, target.placement.location.directory, null, [resource.kind, resource.id],
    ])).digest("hex"))
  }))

  it.live("UTF-8 bytes, node count and depth enforce exact boundaries without serializers", () => Effect.sync(() => {
    expect(snapshot("x".repeat(resultBudget.bytes - 2), resultBudget).json.length).toBe(resultBudget.bytes)
    expect(() => snapshot("x".repeat(resultBudget.bytes - 1), resultBudget)).toThrow(Capability.Failure)
    expect(snapshot(Array.from({ length: resultBudget.nodes - 1 }, () => null), resultBudget).data)
      .toHaveLength(resultBudget.nodes - 1)
    expect(() => snapshot(Array.from({ length: resultBudget.nodes }, () => null), resultBudget)).toThrow(Capability.Failure)
    expect(() => snapshot("✓".repeat(resultBudget.bytes / 3), resultBudget)).toThrow(Capability.Failure)
    const accepted = Array.from({ length: 64 }).reduce<Schema.Json>((value) => [value], null)
    expect(snapshot(accepted, payloadBudget).json).toHaveLength(132)
    expect(() => snapshot([accepted], payloadBudget)).toThrow(Capability.Failure)
    const invoked = { getters: 0, serializers: 0, proxy: 0 }
    expect(() => snapshot(Object.defineProperty({}, "field", { enumerable: true,
      get() { invoked.getters++; return 1 },
    }), payloadBudget)).toThrow(Capability.Failure)
    expect(() => snapshot({ toJSON() { invoked.serializers++; return {} } }, payloadBudget)).toThrow(Capability.Failure)
    expect(() => snapshot(new Proxy({}, { ownKeys() { invoked.proxy++; return [] } }), payloadBudget)).toThrow(Capability.Failure)
    expect(() => snapshot(new Array(2), payloadBudget)).toThrow(Capability.Failure)
    expect(() => snapshot(Object.assign([1], { extra: 1 }), payloadBudget)).toThrow(Capability.Failure)
    expect(() => snapshot(Object.create({ inherited: 1 }), payloadBudget)).toThrow(Capability.Failure)
    expect(invoked).toEqual({ getters: 0, serializers: 0, proxy: 0 })
  }))

  it.live("stored results parse once, reject corrupt values and detach special keys", () => Effect.sync(() => {
    const data = stored('{"__proto__":{"safe":true},"refs":[null]}')
    expect(data).toEqual({ ["__proto__"]: { safe: true }, refs: [null] })
    expect(Object.getPrototypeOf(data)).toBeNull()
    expect(Object.isFrozen(data)).toBe(true)
    expect(stored("null")).toBeNull()
    expect(() => stored("{broken")).toThrow("Capability request stored result is invalid")
    expect(() => stored(JSON.stringify("x".repeat(resultBudget.bytes)))).toThrow("Capability request stored result is invalid")
  }))

  it.live("negative zero normalizes in primitive and nested fresh snapshots exactly as durable replay", () => Effect.sync(() => {
    const zero = snapshot(-0, resultBudget)
    expect(Object.is(zero.data, 0)).toBe(true)
    expect(Object.is(zero.data, stored(zero.json))).toBe(true)
    const nested = snapshot({ value: -0, values: [-0] }, resultBudget)
    const decode = Schema.decodeUnknownSync(Schema.Struct({ value: Schema.Number, values: Schema.Array(Schema.Number) }))
    const first = decode(nested.data)
    const replay = decode(stored(nested.json))
    expect(Object.is(first.value, 0)).toBe(true)
    expect(Object.is(first.value, replay.value)).toBe(true)
    expect(Object.is(first.values[0], 0)).toBe(true)
    expect(Object.is(first.values[0], replay.values[0])).toBe(true)
  }))
})
