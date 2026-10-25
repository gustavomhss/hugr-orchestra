import { expect } from "bun:test"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { SessionID } from "@orchestra/schema/session-id"
import { eq, sql } from "drizzle-orm"
import { Cause, Context, Effect } from "effect"
import { CapabilityConnectionBindings } from "../src/capability/connection/bindings"
import { CapabilityOperator } from "../src/capability/operator/index"
import { CapabilityBindingTable } from "../src/capability/sql"
import { SessionTable } from "../src/session/sql"
import { CapabilityConnectionManagementFixture } from "./fixture/capability-connection-management"
import { CapabilityConnectionSetupFixture } from "./fixture/capability-connection-setup"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionManagementFixture.layer)
const whitespace = [0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff].map((point) => String.fromCodePoint(point))

it.live("every ECMAScript trim character rejects whitespace-only and padded actors before LIMIT; valid controls retain page slots", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  const bindings = yield* CapabilityConnectionBindings.make({ operators: f.operators })
  const invalid = whitespace.flatMap((char) => [char, char + "actor", "actor" + char, char + "actor" + char])
  const valid = ["actor", "\u0085", "\u180e", "\u200b", "\u2060", "\u0000", "\u0008", ...whitespace.map((char) => "actor" + char + "inside")]
  invalid.forEach((actor) => expect(actor.trim()).not.toBe(actor))
  valid.forEach((actor) => expect(actor.trim()).toBe(actor))
  const ids = yield* Effect.forEach([...invalid, ...valid], (actor, index) => Effect.gen(function* () {
    // Invalid actors sort first; a post-LIMIT filter would lose every valid limit=1 result.
    const sessionID = SessionID.descending(`ses_trim_${String(index).padStart(3, "0")}`)
    yield* f.database.db.insert(SessionTable).values({ id: sessionID,
      project_id: CapabilityConnectionManagementFixture.placement.projectID,
      directory: CapabilityConnectionManagementFixture.placement.location.directory,
      // Bun's ordinary text binding strips a leading BOM; preserve exact persisted UTF-8 bytes.
      slug: "trim", title: "private trim control", version: "test", agent: sql`CAST(${Buffer.from(actor)} AS TEXT)` }).run()
    yield* f.database.db.insert(CapabilityBindingTable).values({ target_id: f.child.id, session_id: sessionID,
      agent_id: sql`CAST(${Buffer.from(Agent.ID.make(actor))} AS TEXT)`, actions: ["read"] }).run()
    const stored = yield* f.database.db.select({ hex: sql<string>`hex(${SessionTable.agent})` }).from(SessionTable)
      .where(eq(SessionTable.id, sessionID)).get()
    expect(stored?.hex).toBe(Buffer.from(actor).toString("hex").toUpperCase())
    return sessionID
  }))
  const expected = ids.slice(invalid.length)
  const first = yield* f.run(bindings.list(f.child.id, { limit: 1 }))
  expect(first.items.map((item) => item.sessionID)).toEqual(expected.slice(0, 1))
  expect(first.after).toBe(expected[0])
  const next = yield* f.run(bindings.list(f.child.id, { limit: 1, after: first.after }))
  expect(next.items.map((item) => item.sessionID)).toEqual(expected.slice(1, 2))
  const defaults = yield* f.run(bindings.list(f.child.id, {}))
  expect(defaults.items.map((item) => item.sessionID)).toEqual(expected.slice(0, 16))
  const maximum = yield* f.run(bindings.list(f.child.id, { limit: 32 }))
  expect(maximum.items.map((item) => item.sessionID)).toEqual(expected)
  expect(maximum.after).toBeUndefined()
}))

it.live("direct target.get refreshes selected refs outside first page and returns frozen metadata only under private target grant", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  const bindings = yield* CapabilityConnectionBindings.make({ operators: f.operators })
  const targets = yield* Effect.forEach(Array.from({ length: 35 }), () => f.target(f.parent))
  const selected = targets[targets.length - 1]
  const first = yield* f.run(f.management.targets(f.parent.id, {}))
  expect(first.items).toHaveLength(16)
  expect(first.items.some((item) => item.target.id === selected.id)).toBe(false)
  const grant = yield* f.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["target.get"],
    resources: [{ kind: "target", id: selected.id }] } })
  const read = yield* f.run(bindings.get(selected.id), "selected", grant.authority)
  expect(read).toEqual({ target: selected })
  expect(Object.isFrozen(read)).toBe(true)
  expect(Object.isFrozen(read.target)).toBe(true)
  expect(Object.keys(read.target).sort()).toEqual(["connectionID", "environment", "generation", "id"])
  expect(JSON.stringify(read)).not.toContain(CapabilityConnectionManagementFixture.secret)
  expect(JSON.stringify(read)).not.toContain(f.credentialID)
  yield* f.run(f.management.retargetTarget({ target: selected, input: { environment: "new environment", resource: { secret: "private-resource" } } }))
  expect(yield* f.run(bindings.get(selected.id), "refreshed", grant.authority)).toEqual({ target: {
    ...selected, generation: selected.generation + 1, environment: "new environment" } })
  CapabilityConnectionManagementFixture.expectCode(yield* f.run(bindings.get(f.child.id), "other", grant.authority).pipe(Effect.exit), "connection_unavailable")
}))

it.live("target.get resolves stored placement; missing/known targets normalize absent, foreign, revoked and denied frames identically", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  const bindings = yield* CapabilityConnectionBindings.make({ operators: f.operators })
  const missing = Capability.TargetID.create()
  const compare = Effect.gen(function* () {
    const exits = yield* Effect.forEach([f.child.id, missing], (id) => bindings.get(id).pipe(Effect.exit))
    exits.forEach((exit) => CapabilityConnectionManagementFixture.expectCode(exit, "connection_unavailable"))
    expect(CapabilityConnectionManagementFixture.publicFailures(exits[0])).toEqual(CapabilityConnectionManagementFixture.publicFailures(exits[1]))
  })
  yield* compare
  const denied = yield* f.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["binding.list"] } })
  yield* f.run(compare, "denied", denied.authority)
  const revoked = yield* f.operators.issue({ origin: "sdk" })
  yield* f.run(f.operators.revoke(revoked.authority).pipe(Effect.andThen(compare)), "revoked", revoked.authority)
  const other = yield* CapabilityOperator.make({ principal: "other-target-owner", scope: { placements: "instance", actions: ["*"] } })
  yield* other.withRequest(other.configured, { requestID: "foreign-frame" }, compare)
  const parent = yield* f.connection(CapabilityConnectionManagementFixture.foreign)
  const child = yield* f.target(parent)
  const local = yield* f.operators.issue({ origin: "sdk", scope: { placements: [CapabilityConnectionManagementFixture.placement], actions: ["target.get"] } })
  CapabilityConnectionManagementFixture.expectCode(yield* f.run(bindings.get(child.id), "foreign", local.authority).pipe(Effect.exit), "connection_unavailable")
  const foreign = yield* f.operators.issue({ origin: "sdk", scope: { placements: [CapabilityConnectionManagementFixture.foreign], actions: ["target.get"],
    resources: [{ kind: "target", id: child.id }] } })
  expect(yield* f.run(bindings.get(child.id), "foreign-allowed", foreign.authority)).toEqual({ target: child })
}))

it.live("target.get preserves complete mixed authority Cause and rejects invalid private authority at final validation", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  const Marker = Context.Service<{ target: string }>("binding-refresh-test/Cause")
  const sql = CapabilityConnectionManagementFixture.failed(yield* f.database.db.run("SELECT * FROM target_get_nonexistent_table").pipe(Effect.exit))
  const fault = sql.reasons.find((reason) => reason._tag === "Fail")
  if (!fault) return yield* Effect.die("Missing real SQL failure")
  const mixed = Cause.annotate(Cause.combine(Cause.die(fault.error), Cause.combine(
    Cause.fail(new Capability.Failure({ code: "target_denied", message: "denied" })), Cause.interrupt(123))),
    Context.make(Marker, { target: f.child.id }))
  const bindings = yield* CapabilityConnectionBindings.make({ operators: { ...f.operators,
    validate: (binding, target) => f.operators.validate(binding, target).pipe(Effect.andThen(Effect.failCause(mixed))) } })
  CapabilityConnectionSetupFixture.expectCause(CapabilityConnectionManagementFixture.failed(
    yield* f.run(bindings.get(f.child.id)).pipe(Effect.exit)), mixed)
  const issued = yield* f.operators.issue({ origin: "sdk" })
  const revoked = yield* CapabilityConnectionBindings.make({ operators: { ...f.operators,
    validate: (binding, target) => f.operators.revoke(issued.authority).pipe(Effect.andThen(f.operators.validate(binding, target))) } })
  CapabilityConnectionManagementFixture.expectCode(yield* f.run(revoked.get(f.child.id), "final-validation", issued.authority).pipe(Effect.exit), "connection_unavailable")
}))
