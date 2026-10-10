import { describe, expect } from "bun:test"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { eq, sql } from "drizzle-orm"
import { Cause, Effect, Schema } from "effect"
import { CapabilityConnectionManagement } from "../src/capability/connection/management"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityRequestTable, CapabilityTargetTable } from "../src/capability/sql"
import { SessionTable } from "../src/session/sql"
import { CapabilityConnectionManagementFixture } from "./fixture/capability-connection-management"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionManagementFixture.layer)

describe("CapabilityConnectionManagement real Store and private operator requests", () => {
  it.live("redacted ascending live keysets default to 16, cap at 32 and snapshot query/placement at call time", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const extra = yield* Effect.forEach(Array.from({ length: 17 }), () => f.connection())
    yield* f.connection(CapabilityConnectionManagementFixture.foreign)
    const placement = { ...CapabilityConnectionManagementFixture.placement,
      location: { ...CapabilityConnectionManagementFixture.placement.location } }
    const query = { limit: 2 }
    const pending = f.management.list(placement, query)
    placement.location = { ...CapabilityConnectionManagementFixture.foreign.location }
    query.limit = 32
    const sorted = [f.parent, ...extra].sort((left, right) => left.id < right.id ? -1 : 1)
    const small = yield* f.run(pending)
    expect(small.items.map((item) => item.connection)).toEqual(sorted.slice(0, 2))
    expect(small.after).toBe(sorted[1].id)
    expect(small.coverage).toBe("live")
    const page = yield* f.run(f.management.list(CapabilityConnectionManagementFixture.placement, {}))
    expect(page.items).toHaveLength(16)
    expect(page.after).toBe(sorted[15].id)
    const next = yield* f.run(f.management.list(CapabilityConnectionManagementFixture.placement, { after: page.after, limit: 32 }))
    expect(next.items.map((item) => item.connection)).toEqual(sorted.slice(16))
    expect(next.after).toBeUndefined()
    expect(page.items[0].credential).toBe("present")
    expect(Object.isFrozen(f.management)).toBe(true)
    expect(Object.isFrozen(page.items)).toBe(true)
    expect(JSON.stringify(page)).not.toContain(CapabilityConnectionManagementFixture.secret)
    expect(Object.keys(page.items[0]).sort()).toEqual(["connection", "credential", "state"])
    yield* Effect.forEach([0, 33, 1.5, NaN, Infinity], (limit) => f.run(f.management.list(
      CapabilityConnectionManagementFixture.placement, { limit })).pipe(Effect.exit,
      Effect.tap((exit) => Effect.sync(() => CapabilityConnectionManagementFixture.expectCode(exit, "connection_unavailable")))))
  }))

  it.live("actual stored placement governs get/targets; absent and foreign unauthorized IDs share unavailable shape", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const outside = yield* f.connection(CapabilityConnectionManagementFixture.foreign)
    const token = yield* f.operators.issue({ origin: "sdk", scope: {
      placements: [CapabilityConnectionManagementFixture.placement], actions: ["connection.get", "connection.targets"],
    } })
    const found = yield* f.run(f.management.get(f.parent.id), "get", token.authority)
    expect(found).toEqual({ connection: f.parent, state: "active", credential: "present" })
    const missing = CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.get(Capability.ConnectionID.create()),
      "missing", token.authority).pipe(Effect.exit), "connection_unavailable")
    const denied = CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.get(outside.id),
      "foreign", token.authority).pipe(Effect.exit), "connection_unavailable")
    expect(denied.reasons.map((reason) => reason._tag === "Fail" ? reason.error : undefined))
      .toEqual(missing.reasons.map((reason) => reason._tag === "Fail" ? reason.error : undefined))
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.targets(outside.id, {}),
      "targets", token.authority).pipe(Effect.exit), "connection_unavailable")
  }))

  it.live("collection requires unrestricted resources; target keysets authorize parent and each target without unbounded fill", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const second = yield* f.target(f.parent)
    const third = yield* f.target(f.parent)
    const sorted = [f.child, second, third].sort((left, right) => left.id < right.id ? -1 : 1)
    const scoped = yield* f.operators.issue({ origin: "cli", scope: { placements: "instance",
      actions: ["connection.list", "connection.targets"], resources: [
        { kind: "connection", id: f.parent.id }, { kind: "target", id: sorted[2].id },
      ] } })
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.list(CapabilityConnectionManagementFixture.placement, {}),
      "list", scoped.authority).pipe(Effect.exit), "target_denied")
    const short = yield* f.run(f.management.targets(f.parent.id, { limit: 2 }), "targets", scoped.authority)
    expect(short.items).toEqual([])
    expect(short.coverage).toBe("live")
    expect(short.after).toMatch(/^[A-Za-z0-9_-]{32,2048}$/)
    expect(JSON.stringify(short)).not.toContain(sorted[1].id)
    expect(Buffer.from(short.after ?? "", "base64url").toString("utf8")).not.toContain(sorted[1].id)
    const tail = yield* f.run(f.management.targets(f.parent.id, { after: short.after, limit: 2 }), "targets", scoped.authority)
    expect(tail).toEqual({ items: [{ target: sorted[2] }], coverage: "live" })
    const childOnly = yield* f.operators.issue({ origin: "sdk", scope: { placements: "instance",
      actions: ["connection.targets"], resources: [{ kind: "target", id: sorted[2].id }] } })
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.targets(f.parent.id, {}),
      "targets", childOnly.authority).pipe(Effect.exit), "connection_unavailable")
    // Management must not decode or inspect raw host-only resources, even corrupt stored JSON.
    yield* f.database.db.update(CapabilityTargetTable).set({ resource: sql`'{invalid-json'` })
      .where(eq(CapabilityTargetTable.id, sorted[2].id)).run()
    expect((yield* f.run(f.management.targets(f.parent.id, { after: short.after }), "targets", scoped.authority)).items)
      .toEqual([{ target: sorted[2] }])
  }))

  it.live("JSON null resources roundtrip through actual management create/retarget receipts and exact retries", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const create = { connection: f.parent, input: { environment: "null-created", resource: null } }
    const created = yield* f.run(f.management.createTarget(create), "null-create")
    const createdRef = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }), { onExcessProperty: "error" })(created.data).target
    expect(created.reused).toBe(false)
    expect(createdRef).toEqual({ id: createdRef.id, connectionID: f.parent.id, environment: "null-created", generation: 0 })
    expect(yield* f.run(f.management.createTarget(create), "null-create")).toEqual({ ...created, reused: true })
    yield* f.run(f.management.bind({ target: f.child, input: { sessionID: f.sessionID, actions: ["read"] } }), "null-binding")
    expect(yield* f.database.db.select().from(CapabilityBindingTable)).toHaveLength(1)
    const retarget = { target: f.child, input: { environment: "null-retargeted", resource: null } }
    const retargeted = yield* f.run(f.management.retargetTarget(retarget), "null-retarget")
    const retargetedRef = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }), { onExcessProperty: "error" })(retargeted.data).target
    expect(retargeted.reused).toBe(false)
    expect(retargetedRef).toEqual({ ...f.child, environment: "null-retargeted", generation: 1 })
    expect(yield* f.run(f.management.retargetTarget(retarget), "null-retarget")).toEqual({ ...retargeted, reused: true })
    expect(yield* f.database.db.select().from(CapabilityBindingTable)).toHaveLength(0)
    yield* Effect.forEach([createdRef, retargetedRef], (ref) => Effect.gen(function* () {
      const row = yield* f.database.db.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, ref.id)).get()
      expect(row?.resource).toBeNull()
      expect(row?.environment).toBe(ref.environment)
      expect(row?.generation).toBe(ref.generation)
      expect(yield* f.database.db.select({ resource: sql<string>`${CapabilityTargetTable.resource}`,
        storage: sql<string>`typeof(${CapabilityTargetTable.resource})`, kind: sql<string>`json_type(${CapabilityTargetTable.resource})` })
        .from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, ref.id)).get())
        .toEqual({ resource: "null", storage: "text", kind: "null" })
    }))
    yield* Effect.forEach([created, retargeted], (receipt) => Effect.gen(function* () {
      expect((yield* f.database.db.select().from(CapabilityRequestTable).where(eq(CapabilityRequestTable.id, receipt.requestID)).get())?.result)
        .toEqual(receipt.data)
      expect(JSON.stringify(receipt)).not.toContain(CapabilityConnectionManagementFixture.secret)
    }))
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.createTarget({ ...create,
      input: { ...create.input, resource: "null" } }), "null-create").pipe(Effect.exit), "outcome_unknown")
    expect(yield* f.database.db.select().from(CapabilityTargetTable)).toHaveLength(2)
  }))

  it.live("concurrent creation canonicalizes payload, receipts expose only target refs and changed input conflicts", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const input = { connection: f.parent, input: { environment: "production", resource: {
      secret: CapabilityConnectionManagementFixture.secret, nested: { a: 1, b: { x: true, y: [null, "value"] } } } } }
    const reordered = { connection: f.parent, input: { environment: "production", resource: {
      nested: { b: { y: [null, "value"], x: true }, a: 1 }, secret: CapabilityConnectionManagementFixture.secret } } }
    expect(input.input.resource).toEqual(reordered.input.resource)
    expect(JSON.stringify(input.input.resource)).not.toBe(JSON.stringify(reordered.input.resource))
    const receipts = yield* Effect.all([f.run(f.management.createTarget(input)), f.run(f.management.createTarget(reordered))], { concurrency: "unbounded" })
    expect(receipts.map((receipt) => receipt.reused).sort()).toEqual([false, true])
    expect(receipts[0].requestID).toBe(receipts[1].requestID)
    const data = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }))(receipts[0].data)
    expect(data.target.connectionID).toBe(f.parent.id)
    expect(data.target.environment).toBe("production")
    expect(JSON.stringify(receipts)).not.toContain(CapabilityConnectionManagementFixture.secret)
    expect(yield* f.database.db.select().from(CapabilityTargetTable)).toHaveLength(2)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(1)
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.createTarget({ ...input,
      input: { ...input.input, environment: "changed" } })).pipe(Effect.exit), "outcome_unknown")
  }))

  it.live("disconnect exact retry survives state/generation change; fresh stale requests cannot bypass Store", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const first = yield* f.run(f.management.disconnect({ connection: f.parent }))
    expect(first.data).toBeNull()
    expect(yield* f.run(f.management.disconnect({ connection: f.parent }))).toEqual({ ...first, reused: true })
    expect((yield* f.run(f.management.get(f.parent.id))).state).toBe("disconnected")
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.disconnect({ connection: f.parent }), "fresh")
      .pipe(Effect.exit), "stale_descriptor")
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.disconnect({ connection: { ...f.parent, generation: 1 } }))
      .pipe(Effect.exit), "outcome_unknown")
    expect((yield* f.database.db.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, f.parent.id)).get())?.generation).toBe(1)
  }))

  it.live("retarget and removed-target exact retries reconcile original full refs; fresh missing target fails", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const input = { target: f.child, input: { environment: "changed", resource: { private: CapabilityConnectionManagementFixture.secret } } }
    const changed = yield* f.run(f.management.retargetTarget(input), "retarget")
    const current = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }))(changed.data).target
    expect(current.generation).toBe(1)
    expect(yield* f.run(f.management.retargetTarget(input), "retarget")).toEqual({ ...changed, reused: true })
    const removed = yield* f.run(f.management.removeTarget({ target: current }), "remove")
    expect(yield* f.run(f.management.removeTarget({ target: current }), "remove")).toEqual({ ...removed, reused: true })
    expect(yield* f.run(f.management.retargetTarget(input), "retarget")).toEqual({ ...changed, reused: true })
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.removeTarget({ target: current }), "fresh")
      .pipe(Effect.exit), "connection_unavailable")
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.removeTarget({ target: { ...current, environment: "forged" } }), "remove")
      .pipe(Effect.exit), "outcome_unknown")
  }))

  it.live("replay rechecks current parent placement and target-parent association", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const input = { target: f.child, input: { environment: "changed", resource: {} } }
    yield* f.run(f.management.retargetTarget(input))
    const other = yield* f.connection()
    yield* f.database.db.update(CapabilityTargetTable).set({ connection_id: other.id }).where(eq(CapabilityTargetTable.id, f.child.id)).run()
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.retargetTarget(input)).pipe(Effect.exit), "connection_unavailable")
    yield* f.database.db.update(CapabilityTargetTable).set({ connection_id: f.parent.id }).where(eq(CapabilityTargetTable.id, f.child.id)).run()
    yield* f.database.db.update(CapabilityConnectionTable).set({ directory: CapabilityConnectionManagementFixture.foreign.location.directory })
      .where(eq(CapabilityConnectionTable.id, f.parent.id)).run()
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.retargetTarget(input)).pipe(Effect.exit), "outcome_unknown")
  }))

  it.live("binding derives persisted Session actor, normalizes actions and conflicts on actor switch", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const input = { target: f.child, input: { sessionID: f.sessionID, actions: ["write", "read", "write"] } }
    const first = yield* f.run(f.management.bind(input), "bind")
    expect((yield* f.database.db.select().from(CapabilityBindingTable).get())?.agent_id).toBe(Agent.ID.make("persisted-actor"))
    expect((yield* f.database.db.select().from(CapabilityBindingTable).get())?.actions).toEqual(["read", "write"])
    expect(yield* f.run(f.management.bind({ ...input, input: { ...input.input, actions: ["read", "write"] } }), "bind"))
      .toEqual({ ...first, reused: true })
    const removed = yield* f.run(f.management.unbind({ target: f.child, sessionID: f.sessionID }), "unbind")
    expect(yield* f.run(f.management.unbind({ target: f.child, sessionID: f.sessionID }), "unbind"))
      .toEqual({ ...removed, reused: true })
    expect(yield* f.database.db.select().from(CapabilityBindingTable)).toHaveLength(0)
    yield* f.database.db.update(SessionTable).set({ agent: "other-actor" }).where(eq(SessionTable.id, f.sessionID)).run()
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.bind(input), "bind").pipe(Effect.exit), "outcome_unknown")
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.unbind({ target: f.child, sessionID: f.sessionID }), "unbind")
      .pipe(Effect.exit), "outcome_unknown")
    yield* f.database.db.update(SessionTable).set({ agent: null }).where(eq(SessionTable.id, f.sessionID)).run()
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.bind(input), "fresh").pipe(Effect.exit), "connection_unavailable")
    yield* f.database.db.update(SessionTable).set({ agent: "persisted-actor", directory: CapabilityConnectionManagementFixture.foreign.location.directory })
      .where(eq(SessionTable.id, f.sessionID)).run()
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.bind(input), "fresh").pipe(Effect.exit), "connection_unavailable")
  }))

  it.live("call-time DTO capture rejects descriptors, serializers, proxies, extras and budgets without running caller code", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const invoked = { getter: 0, serializer: 0, proxy: 0 }
    const input = { connection: { ...f.parent }, input: { environment: "original", resource: { value: "original" } } }
    const pending = f.management.createTarget(input)
    input.connection.generation = 10
    input.input.environment = "mutated"
    input.input.resource.value = "mutated"
    const receipt = yield* f.run(pending)
    const created = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }))(receipt.data).target
    expect(created.environment).toBe("original")
    expect((yield* f.database.db.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, created.id)).get())?.resource)
      .toEqual({ value: "original" })
    const hostile: unknown[] = [
      Object.defineProperty({}, "connection", { enumerable: true, get() { invoked.getter++; return f.parent } }),
      { connection: f.parent, input: { environment: "test", resource: { toJSON() { invoked.serializer++; return {} } } } },
      new Proxy({}, { ownKeys() { invoked.proxy++; return [] } }),
      { connection: f.parent, extra: true },
      { connection: f.parent, input: { environment: "test", resource: "x".repeat(65536) } },
    ]
    yield* Effect.forEach(hostile, (value) => f.run(f.management.createTarget(value as typeof CapabilityManagement.CreateTargetInput.Type), "bad")
      .pipe(Effect.exit, Effect.tap((exit) => Effect.sync(() => CapabilityConnectionManagementFixture.expectCode(exit, "connection_unavailable")))))
    expect(invoked).toEqual({ getter: 0, serializer: 0, proxy: 0 })
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.bind({ target: f.child,
      input: { sessionID: f.sessionID, actions: ["read"], agentID: "caller-actor" } } as typeof CapabilityManagement.PutBindingInput.Type), "forged")
      .pipe(Effect.exit), "connection_unavailable")
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toHaveLength(1)
  }))

  it.live("missing/revoked private frames fail; mixed target-denial Causes propagate whole", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const missing = Capability.ConnectionID.create()
    const baseline = CapabilityConnectionManagementFixture.publicFailures(yield* f.run(f.management.get(missing)).pipe(Effect.exit))
    expect(baseline).toEqual([{ _tag: "Capability.Failure", code: "connection_unavailable", message: "Capability connection is unavailable" }])
    const compare = () => Effect.forEach([f.management.get(f.parent.id).pipe(Effect.asVoid), f.management.get(missing).pipe(Effect.asVoid),
      f.management.targets(f.parent.id, {}).pipe(Effect.asVoid), f.management.targets(missing, {}).pipe(Effect.asVoid)],
      (effect) => effect.pipe(Effect.exit, Effect.tap((exit) => Effect.sync(() => {
        CapabilityConnectionManagementFixture.expectCode(exit, "connection_unavailable")
        expect(CapabilityConnectionManagementFixture.publicFailures(exit)).toEqual(baseline)
      }))))
    yield* compare()
    const token = yield* f.operators.issue({ origin: "sdk" })
    yield* f.run(Effect.gen(function* () {
      expect((yield* f.management.get(f.parent.id)).connection).toEqual(f.parent)
      yield* f.operators.revoke(token.authority)
      yield* compare()
    }), "read", token.authority)
    const mixed = Cause.combine(Cause.fail(new Capability.Failure({ code: "target_denied", message: "expected denial" })),
      Cause.die("TARGET_CHECK_DEFECT"))
    const management = yield* CapabilityConnectionManagement.make({ store: f.store, operators: {
      ...f.operators, require: (target) => f.operators.require(target).pipe(Effect.andThen((binding) =>
        target.resource?.kind === "target" ? Effect.failCause(mixed) : Effect.succeed(binding))),
    } })
    const cause = CapabilityConnectionManagementFixture.failed(yield* f.run(management.targets(f.parent.id, {})).pipe(Effect.exit))
    expect(cause.reasons).toEqual(mixed.reasons)
  }))
})
