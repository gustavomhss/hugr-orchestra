import { expect } from "bun:test"
import { sql } from "drizzle-orm"
import { Effect, Exit, Tracer } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityRequestTable, CapabilityTargetTable } from "../src/capability/sql"
import { CapabilityConnectionManagementFixture } from "./fixture/capability-connection-management"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionManagementFixture.layer)

it.live("receipt INSERT abort occurs after domain mutation and restores full target/ref/bindings/receipt state", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  yield* f.run(f.management.bind({ target: f.child, input: { sessionID: f.sessionID, actions: ["read"] } }), "setup")
  const before = {
    connections: yield* f.database.db.select().from(CapabilityConnectionTable).orderBy(CapabilityConnectionTable.id),
    targets: yield* f.database.db.select().from(CapabilityTargetTable).orderBy(CapabilityTargetTable.id),
    bindings: yield* f.database.db.select().from(CapabilityBindingTable),
    receipts: yield* f.database.db.select().from(CapabilityRequestTable).orderBy(CapabilityRequestTable.id),
    refs: yield* f.run(f.management.targets(f.parent.id, {})),
  }
  expect(before.bindings).toHaveLength(1)
  expect(before.receipts).toHaveLength(1)
  const errors: string[] = []
  const tracer = Tracer.make({ span: (options) => new class extends Tracer.NativeSpan {
    query = ""
    override attribute(key: string, value: unknown) {
      super.attribute(key, value)
      if (key === "db.query.text" && typeof value === "string") this.query = value
    }
    override end(time: bigint, exit: Exit.Exit<unknown, unknown>) {
      super.end(time, exit)
      if (!this.query.startsWith("insert into \"capability_request\"") || !Exit.isFailure(exit)) return
      exit.cause.reasons.forEach((reason) => {
        if (reason._tag !== "Fail" || !(reason.error instanceof SqlError)) throw new Error("Expected real receipt INSERT SqlError")
        errors.push(String(reason.error.reason.cause))
      })
    }
  }(options) })
  const input = { target: f.child, input: { environment: "after-domain", resource: { replaced: true } } }
  // Generated IDs obey Capability.TargetID's closed alphabet. SQLite trigger DDL cannot bind parameters.
  yield* f.database.db.run(sql.raw(`CREATE TRIGGER management_receipt_abort BEFORE INSERT ON capability_request
    WHEN NEW.action = 'target.retarget' BEGIN
      SELECT CASE WHEN (SELECT generation FROM capability_target WHERE id = '${f.child.id}') = 1
        AND (SELECT environment FROM capability_target WHERE id = '${f.child.id}') = 'after-domain'
        AND (SELECT json_extract(resource, '$.replaced') FROM capability_target WHERE id = '${f.child.id}') = 1
        AND NOT EXISTS (SELECT 1 FROM capability_binding WHERE target_id = '${f.child.id}')
        THEN RAISE(ABORT, 'AFTER_DOMAIN_MUTATION') ELSE RAISE(ABORT, 'BEFORE_DOMAIN_MUTATION') END;
    END`))
  yield* Effect.gen(function* () {
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.retargetTarget(input), "receipt-abort")
      .pipe(Effect.withTracer(tracer), Effect.exit), "outcome_unknown")
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("AFTER_DOMAIN_MUTATION")
    expect(errors[0]).not.toContain("BEFORE_DOMAIN_MUTATION")
    expect(yield* f.database.db.select().from(CapabilityConnectionTable).orderBy(CapabilityConnectionTable.id)).toEqual(before.connections)
    expect(yield* f.database.db.select().from(CapabilityTargetTable).orderBy(CapabilityTargetTable.id)).toEqual(before.targets)
    expect(yield* f.database.db.select().from(CapabilityBindingTable)).toEqual(before.bindings)
    expect(yield* f.database.db.select().from(CapabilityRequestTable).orderBy(CapabilityRequestTable.id)).toEqual(before.receipts)
    expect(yield* f.run(f.management.targets(f.parent.id, {}))).toEqual(before.refs)
  }).pipe(Effect.ensuring(f.database.db.run("DROP TRIGGER management_receipt_abort").pipe(Effect.orDie)))
  // The failed INSERT left no receipt: the same key must perform the mutation after trigger cleanup.
  expect((yield* f.run(f.management.retargetTarget(input), "receipt-abort")).reused).toBe(false)
  expect((yield* f.run(f.management.targets(f.parent.id, {}))).items[0].target).toEqual({ ...f.child, generation: 1, environment: "after-domain" })
  expect(yield* f.database.db.select().from(CapabilityBindingTable)).toEqual([])
}))
