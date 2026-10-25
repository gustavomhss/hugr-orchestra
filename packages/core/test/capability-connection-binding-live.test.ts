import { expect } from "bun:test"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { SessionID } from "@orchestra/schema/session-id"
import { eq } from "drizzle-orm"
import { Cause, Context, Effect } from "effect"
import { CapabilityConnectionBindings } from "../src/capability/connection/bindings"
import type { CapabilityConnectionStoreContract } from "../src/capability/connection/store-contract"
import type { CapabilityOperatorContract } from "../src/capability/operator/contract"
import { CapabilityBindingTable } from "../src/capability/sql"
import { SessionTable } from "../src/session/sql"
import { CapabilityConnectionManagementFixture } from "./fixture/capability-connection-management"
import { CapabilityConnectionSetupFixture } from "./fixture/capability-connection-setup"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionManagementFixture.layer)

it.live("binding keysets observe current actors/placement between pages and include only new rows after cursor", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  const bindings = yield* CapabilityConnectionBindings.make({ operators: f.operators })
  const add = (ordinal: number, actor = "stable") => Effect.gen(function* () {
    const sessionID = SessionID.descending(`ses_live_${ordinal}`)
    yield* f.database.db.insert(SessionTable).values({ id: sessionID, project_id: CapabilityConnectionManagementFixture.placement.projectID,
      directory: CapabilityConnectionManagementFixture.placement.location.directory, slug: "live", title: "live", version: "test", agent: actor }).run()
    yield* f.database.db.insert(CapabilityBindingTable).values({ target_id: f.child.id, session_id: sessionID,
      agent_id: Agent.ID.make("stable"), actions: ["read"] }).run()
    return sessionID
  })
  const original = yield* Effect.forEach([200, 300, 400, 500, 600], (id) => add(id))
  const hidden = yield* add(700, "previous-actor")
  const first = yield* f.run(bindings.list(f.child.id, { limit: 2 }))
  expect(first.items.map((item) => item.sessionID)).toEqual(original.slice(0, 2))
  expect(first.after).toBe(original[1])
  yield* f.database.db.update(SessionTable).set({ agent: "replacement-actor" }).where(eq(SessionTable.id, original[2])).run()
  yield* f.database.db.update(SessionTable).set({ directory: CapabilityConnectionManagementFixture.foreign.location.directory })
    .where(eq(SessionTable.id, original[3])).run()
  yield* f.database.db.update(SessionTable).set({ agent: "stable" }).where(eq(SessionTable.id, hidden)).run()
  const before = yield* add(250)
  const after = yield* add(350)
  const next = yield* f.run(bindings.list(f.child.id, { limit: 2, after: first.after }))
  expect(next.items.map((item) => item.sessionID)).toEqual([after, original[4]])
  expect(next.after).toBe(original[4])
  const last = yield* f.run(bindings.list(f.child.id, { limit: 2, after: next.after }))
  expect(last.items.map((item) => item.sessionID)).toEqual([hidden])
  expect(last.after).toBeUndefined()
  const visited = [...first.items, ...next.items, ...last.items].map((item) => item.sessionID)
  expect(new Set(visited).size).toBe(visited.length)
  expect(visited).not.toContain(before)
  expect(visited).not.toContain(original[2])
  expect(visited).not.toContain(original[3])
}))

it.live("get/list retain heterogeneous all-Fail SQL+authority Causes in both orders with exact error identities/annotations", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  const sql = CapabilityConnectionSetupFixture.failed(yield* f.database.db.run("SELECT * FROM binding_allfail_missing_table").pipe(Effect.exit))
  expect(sql.reasons.length).toBeGreaterThan(0)
  expect(sql.reasons.every((reason) => reason._tag === "Fail")).toBe(true)
  const denied = Cause.fail(new Capability.Failure({ code: "target_denied", message: "authority rejected" }))
  const Marker = Context.Service<{ order: string }>("binding-live-test/Cause")
  yield* Effect.forEach(["sql-first", "authority-first"] as const, (order) => Effect.gen(function* () {
    const mixed = Cause.annotate(Cause.fromReasons<CapabilityConnectionStoreContract.Error>(order === "sql-first" ? [...sql.reasons, ...denied.reasons]
      : [...denied.reasons, ...sql.reasons]), Context.make(Marker, { order }))
    // Fault boundary calls genuine require first; inject the actual SQL failure beyond its narrow declared channel.
    const operators = Object.defineProperty({ ...f.operators }, "require", {
      value: (target: CapabilityOperatorContract.Target) => f.operators.require(target).pipe(Effect.andThen(Effect.failCause(mixed))),
    })
    const bindings = yield* CapabilityConnectionBindings.make({ operators })
    yield* Effect.forEach([bindings.get(f.child.id).pipe(Effect.asVoid), bindings.list(f.child.id, {}).pipe(Effect.asVoid)], (effect) => Effect.gen(function* () {
      const cause = CapabilityConnectionSetupFixture.failed(yield* f.run(effect).pipe(Effect.exit))
      expect(cause.reasons.every((reason) => reason._tag === "Fail")).toBe(true)
      CapabilityConnectionSetupFixture.expectCause(cause, mixed)
    }))
  }))
}))
