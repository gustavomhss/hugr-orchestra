import { expect } from "bun:test"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { SessionID } from "@orchestra/schema/session-id"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq } from "drizzle-orm"
import { Cause, Context, Effect, Exit, Tracer } from "effect"
import { CapabilityConnectionBindings } from "../src/capability/connection/bindings"
import { CapabilityOperator } from "../src/capability/operator/index"
import { CapabilityBindingTable, CapabilityRequestTable } from "../src/capability/sql"
import { ProjectTable } from "../src/project/sql"
import { SessionTable } from "../src/session/sql"
import { CapabilityConnectionManagementFixture } from "./fixture/capability-connection-management"
import { CapabilityConnectionSetupFixture } from "./fixture/capability-connection-setup"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionManagementFixture.layer)

it.live("only current Session actor in actual parent placement survives SQL join; pages bounded and keyset ordered", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  const bindings = yield* CapabilityConnectionBindings.make({ operators: f.operators })
  const foreignProject = Project.ID.make("binding-foreign-project")
  yield* f.database.db.insert(ProjectTable).values({ id: foreignProject,
    worktree: CapabilityConnectionManagementFixture.foreign.location.directory, sandboxes: [] }).run()
  const add = (change: Partial<typeof SessionTable.$inferInsert> = {}, actor = "current-actor") => Effect.gen(function* () {
    const sessionID = SessionID.create()
    yield* f.database.db.insert(SessionTable).values({ id: sessionID, project_id: CapabilityConnectionManagementFixture.placement.projectID,
      directory: CapabilityConnectionManagementFixture.placement.location.directory, slug: "binding", title: "private-session-title",
      version: "test", agent: actor, ...change }).run()
    yield* f.database.db.insert(CapabilityBindingTable).values({ target_id: f.child.id, session_id: sessionID,
      agent_id: Agent.ID.make(actor), actions: ["read", "send"] }).run()
    return sessionID
  })
  const sessions = (yield* Effect.forEach(Array.from({ length: 36 }), () => add())).sort()
  yield* add({ directory: CapabilityConnectionManagementFixture.foreign.location.directory })
  yield* add({ project_id: foreignProject })
  yield* add({ workspace_id: WorkspaceID.make("wrk_foreign") })
  yield* add({ agent: null })
  yield* add({ agent: "" })
  yield* add({ agent: " " })
  const stale = yield* add()
  yield* f.database.db.update(SessionTable).set({ agent: "new-actor" }).where(eq(SessionTable.id, stale)).run()
  yield* f.database.db.insert(CapabilityBindingTable).values({ target_id: f.child.id, session_id: sessions[0],
    agent_id: Agent.ID.make("stale-actor"), actions: ["admin"] }).run()
  const scans: { query: string; rows?: number }[] = []
  const tracer = Tracer.make({ span: (options) => new class extends Tracer.NativeSpan {
    query = ""
    override attribute(key: string, value: unknown) {
      super.attribute(key, value)
      if (key === "db.query.text" && typeof value === "string") this.query = value
    }
    override end(time: bigint, exit: Exit.Exit<unknown, unknown>) {
      super.end(time, exit)
      if (this.query.includes('from "capability_binding"')) scans.push({ query: this.query,
        ...(Exit.isSuccess(exit) && Array.isArray(exit.value) ? { rows: exit.value.length } : {}) })
    }
  }(options) })
  const first = yield* f.run(bindings.list(f.child.id, {})).pipe(Effect.withTracer(tracer))
  expect(first.items.map((item) => item.sessionID)).toEqual(sessions.slice(0, 16))
  expect(first.after).toBe(sessions[15])
  expect(first.coverage).toBe("current-actor")
  expect(scans).toHaveLength(1)
  expect(scans[0].rows).toBe(17)
  expect(scans[0].query).toContain('inner join "session"')
  scans.length = 0
  const max = yield* f.run(bindings.list(f.child.id, { limit: 32 })).pipe(Effect.withTracer(tracer))
  expect(max.items.map((item) => item.sessionID)).toEqual(sessions.slice(0, 32))
  expect(scans).toHaveLength(1)
  expect(scans[0].rows).toBe(33)
  const rest = yield* f.run(bindings.list(f.child.id, { limit: 32, after: max.after }))
  expect(rest.items.map((item) => item.sessionID)).toEqual(sessions.slice(32))
  expect(rest.after).toBeUndefined()
  first.items.forEach((item) => {
    expect(Object.keys(item).sort()).toEqual(["actions", "sessionID"])
    expect(item.actions).toEqual(["read", "send"])
    expect(Object.isFrozen(item.actions)).toBe(true)
  })
  expect(JSON.stringify(first)).not.toContain("private-session-title")
  expect(yield* f.database.db.select().from(CapabilityRequestTable)).toEqual([])
}))

it.live("known/missing/bad frame are constant unavailable; target-specific grants use stored foreign placement", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  const bindings = yield* CapabilityConnectionBindings.make({ operators: f.operators })
  const missing = Capability.TargetID.create()
  const compare = Effect.gen(function* () {
    const exits = yield* Effect.forEach([f.child.id, missing], (id) => bindings.list(id, {}).pipe(Effect.exit))
    exits.forEach((exit) => CapabilityConnectionManagementFixture.expectCode(exit, "connection_unavailable"))
    expect(CapabilityConnectionManagementFixture.publicFailures(exits[0])).toEqual(CapabilityConnectionManagementFixture.publicFailures(exits[1]))
  })
  yield* compare
  const denied = yield* f.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["connection.list"] } })
  yield* f.run(compare, "denied", denied.authority)
  const revoked = yield* f.operators.issue({ origin: "sdk" })
  yield* f.run(f.operators.revoke(revoked.authority).pipe(Effect.andThen(compare)), "revoked", revoked.authority)
  const other = yield* CapabilityOperator.make({ principal: "wrong-owner", scope: { placements: "instance", actions: ["*"] } })
  yield* other.withRequest(other.configured, { requestID: "wrong-frame" }, compare)
  const parent = yield* f.connection(CapabilityConnectionManagementFixture.foreign)
  const child = yield* f.target(parent)
  const local = yield* f.operators.issue({ origin: "sdk", scope: { placements: [CapabilityConnectionManagementFixture.placement], actions: ["binding.list"] } })
  CapabilityConnectionManagementFixture.expectCode(yield* f.run(bindings.list(child.id, {}), "foreign", local.authority).pipe(Effect.exit), "connection_unavailable")
  const target = yield* f.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["binding.list"],
    resources: [{ kind: "target", id: child.id }] } })
  expect((yield* f.run(bindings.list(child.id, {}), "target", target.authority)).items).toEqual([])
  CapabilityConnectionManagementFixture.expectCode(yield* f.run(bindings.list(f.child.id, {}), "wrong-target", target.authority).pipe(Effect.exit), "connection_unavailable")
}))

it.live("binding query snapshots at call time; excess authority fields and invalid bounds reject", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  const bindings = yield* CapabilityConnectionBindings.make({ operators: f.operators })
  yield* f.run(f.management.bind({ target: f.child, input: { sessionID: f.sessionID, actions: ["read"] } }))
  const query = { limit: 1 }
  const effect = bindings.list(f.child.id, query)
  query.limit = 33
  expect((yield* f.run(effect)).items).toEqual([{ sessionID: f.sessionID, actions: ["read"] }])
  yield* Effect.forEach([{ limit: 0 }, { limit: 33 }, { limit: 1.1 }, { agentID: "persisted-actor" }, { body: "authority" }], (input) => {
    const invalid = { limit: 1, ...input }
    return f.run(bindings.list(f.child.id, invalid)).pipe(Effect.exit,
      Effect.tap((exit) => Effect.sync(() => CapabilityConnectionManagementFixture.expectCode(exit, "connection_unavailable"))))
  })
  const traps = { getter: 0, proxy: 0 }
  yield* Effect.forEach([
    Object.defineProperty({}, "limit", { enumerable: true, get() { traps.getter++; return 1 } }),
    new Proxy({}, { ownKeys() { traps.proxy++; return [] } }),
  ], (value) => f.run(bindings.list(f.child.id, value)).pipe(Effect.exit, Effect.tap((exit) => Effect.sync(() =>
    CapabilityConnectionManagementFixture.expectCode(exit, "connection_unavailable")))))
  expect(traps).toEqual({ getter: 0, proxy: 0 })
}))

it.live("binding authority normalization preserves mixed auth/SQL defect/Interrupt Causes", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  const Marker = Context.Service<{ boundary: string }>("binding-test/Cause")
  const sql = CapabilityConnectionManagementFixture.failed(yield* f.database.db.run("SELECT * FROM binding_nonexistent_table").pipe(Effect.exit))
  const fault = sql.reasons.find((reason) => reason._tag === "Fail")
  if (!fault) return yield* Effect.die("Missing real SQL failure")
  const mixed = Cause.annotate(Cause.combine(Cause.die(fault.error), Cause.combine(
    Cause.fail(new Capability.Failure({ code: "authentication_required", message: "auth rejected" })),
    Cause.combine(Cause.die("binding-defect"), Cause.interrupt(123)))), Context.make(Marker, { boundary: "binding" }))
  const bindings = yield* CapabilityConnectionBindings.make({ operators: { ...f.operators,
    require: (target) => f.operators.require(target).pipe(Effect.andThen(Effect.failCause(mixed))) } })
  const cause = CapabilityConnectionManagementFixture.failed(yield* f.run(bindings.list(f.child.id, {})).pipe(Effect.exit))
  CapabilityConnectionSetupFixture.expectCause(cause, mixed)
  cause.reasons.forEach((reason) => expect(Context.getOrUndefined(Cause.reasonAnnotations(reason), Marker)).toEqual({ boundary: "binding" }))
}))
