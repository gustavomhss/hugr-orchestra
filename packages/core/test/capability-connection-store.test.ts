import { describe, expect } from "bun:test"
import { CapabilityConnections } from "@orchestra/core/capability/connection/index"
import { CapabilityConnectionStore } from "@orchestra/core/capability/connection/store"
import type { CapabilityConnectionStoreContract } from "@orchestra/core/capability/connection/store-contract"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityTargetTable } from "@orchestra/core/capability/sql"
import { Credential } from "@orchestra/core/credential"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Project } from "@orchestra/schema/project"
import { SessionID } from "@orchestra/schema/session-id"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq, sql } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Cause, Context, Effect, Exit, Layer } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(Credential.layerFrom(undefined).pipe(Layer.provideMerge(CapabilityPolicyFixture.layer)))
const placement: CapabilityConnectionStoreContract.Placement = {
  projectID: CapabilityPolicyFixture.placement.project.id,
  location: { directory: CapabilityPolicyFixture.placement.directory },
}
const input = { environment: "production", resource: { project: "one" } }

function fixture() {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    const credentials = yield* Credential.Service
    const host = yield* CapabilityConnections.make
    const store: CapabilityConnectionStoreContract.Interface = yield* CapabilityConnectionStore.make
    const credential = yield* credentials.create({ integrationID: Integration.ID.make("store-test"),
      value: { type: "key", key: "store-test-secret" } })
    const connection = yield* host.create({ provider: "example", integrationID: credential.integrationID,
      credentialID: credential.id, subjectID: "subject", endpoint: "https://example.test/mcp", scopeHash: "a".repeat(64) })
    const other = yield* host.create({ provider: "example", integrationID: credential.integrationID,
      credentialID: credential.id, subjectID: "other", endpoint: "https://example.test/mcp", scopeHash: "b".repeat(64) })
    const write = <A, E>(run: (tx: CapabilityConnectionStoreContract.Transaction) => Effect.Effect<A, E>) =>
      f.database.db.transaction(run, { behavior: "immediate" })
    const target = yield* write((tx) => store.createTarget(tx, placement, connection, input))
    const otherTarget = yield* write((tx) => store.createTarget(tx, placement, other, input))
    const binding = { target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: ["read"] }
    yield* write((tx) => store.bind(tx, placement, binding))
    const bindings = () => f.database.db.select().from(CapabilityBindingTable).orderBy(CapabilityBindingTable.target_id,
      CapabilityBindingTable.session_id, CapabilityBindingTable.agent_id).all()
    return { ...f, credentials, credential, host, store, connection, other, target, otherTarget, binding, write, bindings }
  })
}

function expectCode<A, E>(effect: Effect.Effect<A, E>, code: Capability.ErrorCode) {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(effect)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) return yield* Effect.die("EXPECTED_STORE_FAILURE")
    expect(exit.cause.reasons).toHaveLength(1)
    const reason = exit.cause.reasons[0]
    expect(reason._tag).toBe("Fail")
    if (reason._tag !== "Fail") return yield* Effect.die("EXPECTED_TYPED_STORE_FAILURE")
    expect(reason.error).toBeInstanceOf(Capability.Failure)
    if (!(reason.error instanceof Capability.Failure)) return yield* Effect.die("EXPECTED_CAPABILITY_FAILURE")
    expect(reason.error.code).toBe(code)
  })
}

describe("CapabilityConnectionStore", () => {
  it.live("owner predicate rejects foreign project, directory and workspace for connection and target", () => Effect.gen(function* () {
    const f = yield* fixture()
    expect(Object.isFrozen(f.store)).toBe(true)
    yield* f.write((tx) => Effect.gen(function* () {
      expect((yield* f.store.connection(tx, placement, f.connection)).id).toBe(f.connection.id)
      expect((yield* f.store.target(tx, placement, f.target)).parent.id).toBe(f.connection.id)
      yield* Effect.forEach([
        { ...placement, projectID: Project.ID.make("foreign") },
        { ...placement, location: { directory: AbsolutePath.make("/foreign") } },
        { ...placement, location: { ...placement.location, workspaceID: WorkspaceID.make("wrk_foreign") } },
      ], (foreign) => Effect.gen(function* () {
        yield* expectCode(f.store.connection(tx, foreign, f.connection), "target_denied")
        yield* expectCode(f.store.target(tx, foreign, f.target), "target_denied")
        yield* expectCode(f.store.createTarget(tx, foreign, f.connection, input), "target_denied")
      }))
      yield* expectCode(f.store.connection(tx, placement, { ...f.connection, id: Capability.ConnectionID.create() }), "connection_unavailable")
      yield* expectCode(f.store.connection(tx, placement, { ...f.connection, provider: "foreign" }), "target_denied")
      yield* expectCode(f.store.target(tx, placement, { ...f.target, connectionID: f.other.id }), "target_denied")
      yield* expectCode(f.store.target(tx, placement, { ...f.target, id: Capability.TargetID.create() }), "connection_unavailable")
    }))
  }))

  it.live("revalidates stale refs, malformed inputs and persisted active-state/generations", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.write((tx) => Effect.gen(function* () {
      yield* expectCode(f.store.connection(tx, placement, { ...f.connection, generation: 1 }), "stale_descriptor")
      yield* expectCode(f.store.target(tx, placement, { ...f.target, generation: 1 }), "stale_descriptor")
      yield* expectCode(f.store.target(tx, placement, { ...f.target, environment: "staging" }), "stale_descriptor")
      yield* expectCode(f.store.connection(tx, placement, { ...f.connection, generation: -1 }), "target_denied")
      yield* expectCode(f.store.createTarget(tx, placement, f.connection, { ...input, environment: "" }), "target_denied")
      yield* expectCode(f.store.retargetTarget(tx, placement, f.target, { ...input, environment: "" }), "target_denied")
      yield* tx.update(CapabilityConnectionTable).set({ state: "revoked" }).where(eq(CapabilityConnectionTable.id, f.connection.id)).run()
      yield* expectCode(f.store.connection(tx, placement, f.connection), "authentication_revoked")
      yield* expectCode(f.store.target(tx, placement, f.target), "authentication_revoked")
      yield* tx.update(CapabilityConnectionTable).set({ state: "active", generation: -1 }).where(eq(CapabilityConnectionTable.id, f.connection.id)).run()
      yield* expectCode(f.store.target(tx, placement, f.target), "stale_descriptor")
      yield* tx.update(CapabilityConnectionTable).set({ generation: 0 }).where(eq(CapabilityConnectionTable.id, f.connection.id)).run()
      yield* tx.update(CapabilityTargetTable).set({ generation: -1 }).where(eq(CapabilityTargetTable.id, f.target.id)).run()
      yield* expectCode(f.store.target(tx, placement, f.target), "stale_descriptor")
    }))
  }))

  it.live("bind checks actual SQL Session placement under supplied writer, accepts supplied actor and deduplicates actions", () => Effect.gen(function* () {
    const f = yield* fixture()
    const actor = Agent.ID.make("trusted-host-actor")
    yield* f.write((tx) => Effect.gen(function* () {
      yield* tx.update(SessionTable).set({ agent: "persisted-other-actor" }).where(eq(SessionTable.id, f.context.sessionID)).run()
      yield* f.store.bind(tx, placement, { ...f.binding, agentID: actor, actions: ["read", "*", "read"] })
      expect((yield* tx.select().from(CapabilityBindingTable).where(eq(CapabilityBindingTable.agent_id, actor)).get())?.actions).toEqual(["read", "*"])
      yield* Effect.forEach([[], [""], ["read "], [" read"], [" "]], (actions) =>
        expectCode(f.store.bind(tx, placement, { ...f.binding, actions }), "target_denied"))
      yield* expectCode(f.store.bind(tx, placement, { ...f.binding, sessionID: SessionID.create() }), "target_denied")
      yield* Effect.forEach([
        { directory: AbsolutePath.make("/foreign") }, { workspace_id: WorkspaceID.make("wrk_foreign") },
      ], (change) => Effect.gen(function* () {
        yield* tx.update(SessionTable).set(change).where(eq(SessionTable.id, f.context.sessionID)).run()
        yield* expectCode(f.store.bind(tx, placement, f.binding), "target_denied")
        yield* expectCode(f.store.unbind(tx, placement, f.target, f.context.sessionID, f.context.agent), "target_denied")
        yield* tx.update(SessionTable).set({ directory: placement.location.directory, workspace_id: null })
          .where(eq(SessionTable.id, f.context.sessionID)).run()
      }))
    }))
    expect(yield* f.bindings()).toHaveLength(2)
  }))

  it.live("binding invalidation covers retarget, remove and disconnect without touching sibling credentials/bindings", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.write((tx) => f.store.bind(tx, placement, { ...f.binding, target: f.otherTarget }))
    expect(yield* f.bindings()).toHaveLength(2)
    const next = yield* f.write((tx) => f.store.retargetTarget(tx, placement, f.target, { environment: "staging", resource: { project: "two" } }))
    expect(next).toEqual({ ...f.target, generation: 1, environment: "staging" })
    expect((yield* f.bindings()).map((row) => row.target_id)).toEqual([f.otherTarget.id])
    yield* expectCode(f.write((tx) => f.store.bind(tx, placement, f.binding)), "stale_descriptor")
    yield* f.write((tx) => f.store.bind(tx, placement, { ...f.binding, target: next }))
    expect(yield* f.bindings()).toHaveLength(2)
    yield* f.write((tx) => f.store.removeTarget(tx, placement, next))
    expect((yield* f.bindings()).map((row) => row.target_id)).toEqual([f.otherTarget.id])
    yield* expectCode(f.write((tx) => f.store.target(tx, placement, next)), "connection_unavailable")
    const fresh = yield* f.write((tx) => f.store.createTarget(tx, placement, f.connection, input))
    const sibling = yield* f.write((tx) => f.store.createTarget(tx, placement, f.connection, input))
    yield* f.write((tx) => Effect.gen(function* () {
      yield* f.store.bind(tx, placement, { ...f.binding, target: fresh })
      yield* f.store.bind(tx, placement, { ...f.binding, target: sibling, agentID: Agent.ID.make("other-actor") })
    }))
    expect(yield* f.bindings()).toHaveLength(3)
    yield* f.write((tx) => f.store.disconnect(tx, placement, f.connection))
    expect((yield* f.bindings()).map((row) => row.target_id)).toEqual([f.otherTarget.id])
    yield* expectCode(f.write((tx) => f.store.connection(tx, placement, f.connection)), "stale_descriptor")
    yield* expectCode(f.write((tx) => f.store.connection(tx, placement, { ...f.connection, generation: 1 })), "authentication_revoked")
    yield* expectCode(f.write((tx) => f.store.target(tx, placement, fresh)), "authentication_revoked")
    expect(yield* f.credentials.get(f.credential.id)).toEqual(f.credential)
  }))

  it.live("unbind removes only exact target/Session/actor and repeats as no-op", () => Effect.gen(function* () {
    const f = yield* fixture()
    const second = yield* CapabilityPolicyFixture.fixture()
    const actor = Agent.ID.make("other-actor")
    yield* f.write((tx) => Effect.gen(function* () {
      yield* f.store.bind(tx, placement, { ...f.binding, agentID: actor })
      yield* f.store.bind(tx, placement, { ...f.binding, sessionID: second.context.sessionID })
      yield* f.store.bind(tx, placement, { ...f.binding, target: f.otherTarget })
    }))
    expect(yield* f.bindings()).toHaveLength(4)
    yield* f.write((tx) => f.store.unbind(tx, placement, f.target, f.context.sessionID, f.context.agent))
    const remaining = yield* f.bindings()
    expect(remaining).toHaveLength(3)
    expect(remaining.some((row) => row.target_id === f.target.id && row.session_id === f.context.sessionID && row.agent_id === actor)).toBe(true)
    expect(remaining.some((row) => row.session_id === second.context.sessionID)).toBe(true)
    expect(remaining.some((row) => row.target_id === f.otherTarget.id)).toBe(true)
    yield* f.write((tx) => f.store.unbind(tx, placement, f.target, f.context.sessionID, f.context.agent))
    expect(yield* f.bindings()).toEqual(remaining)
  }))

  it.live("generation exhaustion preserves rows and bindings before mutation", () => Effect.gen(function* () {
    const f = yield* fixture()
    const before = yield* f.bindings()
    yield* f.write((tx) => Effect.gen(function* () {
      yield* tx.update(CapabilityTargetTable).set({ generation: Number.MAX_SAFE_INTEGER }).where(eq(CapabilityTargetTable.id, f.target.id)).run()
      yield* tx.update(CapabilityConnectionTable).set({ generation: Number.MAX_SAFE_INTEGER }).where(eq(CapabilityConnectionTable.id, f.connection.id)).run()
    }))
    yield* expectCode(f.write((tx) => f.store.retargetTarget(tx, placement, { ...f.target, generation: Number.MAX_SAFE_INTEGER }, input)), "stale_descriptor")
    yield* expectCode(f.write((tx) => f.store.disconnect(tx, placement, { ...f.connection, generation: Number.MAX_SAFE_INTEGER })), "stale_descriptor")
    expect(yield* f.bindings()).toEqual(before)
    expect(yield* f.database.db.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, f.target.id)).get()).toMatchObject({ ...input, generation: Number.MAX_SAFE_INTEGER })
    expect(yield* f.database.db.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, f.connection.id)).get()).toMatchObject({ state: "active", generation: Number.MAX_SAFE_INTEGER })
  }))

  it.live("all Store writes roll back with supplied transaction and retain every annotated Cause reason", () => Effect.gen(function* () {
    const f = yield* fixture()
    const before = {
      bindings: yield* f.bindings(),
      connections: yield* f.database.db.select().from(CapabilityConnectionTable).orderBy(CapabilityConnectionTable.id).all(),
      targets: yield* f.database.db.select().from(CapabilityTargetTable).orderBy(CapabilityTargetTable.id).all(),
    }
    const expected = new Capability.Failure({ code: "target_denied", message: "rollback sentinel" })
    const sqlError = new EffectDrizzleQueryError({ query: "rollback sentinel", params: [], cause: "sql sentinel" })
    const defect = new Error("rollback defect")
    const annotations = Context.makeUnsafe(new Map([["store-probe", "retained"]]))
    const cause = Cause.fromReasons([
      Cause.makeFailReason<CapabilityConnectionStoreContract.Error>(expected).annotate(annotations),
      Cause.makeFailReason<CapabilityConnectionStoreContract.Error>(sqlError).annotate(annotations),
      Cause.makeDieReason(defect).annotate(annotations), Cause.makeInterruptReason(123).annotate(annotations),
    ])
    const exit = yield* f.write((tx) => Effect.gen(function* () {
      const created = yield* f.store.createTarget(tx, placement, f.other, input)
      yield* f.store.bind(tx, placement, { ...f.binding, target: created })
      yield* f.store.unbind(tx, placement, f.target, f.context.sessionID, f.context.agent)
      const next = yield* f.store.retargetTarget(tx, placement, f.target, { environment: "rollback", resource: {} })
      yield* f.store.bind(tx, placement, { ...f.binding, target: next })
      yield* f.store.removeTarget(tx, placement, f.otherTarget)
      yield* f.store.disconnect(tx, placement, f.connection)
      expect(yield* tx.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, created.id)).get()).toBeDefined()
      expect((yield* tx.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, f.connection.id)).get())?.state).toBe("disconnected")
      return yield* Effect.failCause(cause)
    })).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(["Fail", "Fail", "Die", "Interrupt"])
      expect(exit.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)).toEqual([expected, sqlError])
      expect(exit.cause.reasons.filter(Cause.isDieReason)[0].defect).toBe(defect)
      expect(exit.cause.reasons.filter(Cause.isInterruptReason)[0].fiberId).toBe(123)
      exit.cause.reasons.forEach((reason) => expect(reason.annotations.get("store-probe")).toBe("retained"))
    }
    expect(yield* f.bindings()).toEqual(before.bindings)
    expect(yield* f.database.db.select().from(CapabilityConnectionTable).orderBy(CapabilityConnectionTable.id).all()).toEqual(before.connections)
    expect(yield* f.database.db.select().from(CapabilityTargetTable).orderBy(CapabilityTargetTable.id).all()).toEqual(before.targets)
  }))

  it.live("real SQL constraint failures remain typed SQL errors and roll back earlier writes", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.database.db.run(sql`CREATE TRIGGER store_probe BEFORE INSERT ON capability_target WHEN NEW.environment = 'blocked' BEGIN SELECT RAISE(ABORT, 'store constraint sentinel'); END`)
    const exit = yield* f.write((tx) => Effect.gen(function* () {
      yield* f.store.unbind(tx, placement, f.target, f.context.sessionID, f.context.agent)
      return yield* f.store.createTarget(tx, placement, f.connection, { environment: "blocked", resource: {} })
    })).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons).toHaveLength(1)
      const reason = exit.cause.reasons[0]
      expect(reason._tag).toBe("Fail")
      if (reason._tag === "Fail") expect(reason.error).toBeInstanceOf(EffectDrizzleQueryError)
    }
    expect(yield* f.bindings()).toHaveLength(1)
    expect(yield* f.database.db.select().from(CapabilityTargetTable).all()).toHaveLength(2)
  }))
})
