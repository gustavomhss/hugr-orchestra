import { describe, expect } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq } from "drizzle-orm"
import { Cause, Context, Effect } from "effect"
import { CapabilityConnectionManagement } from "../src/capability/connection/management"
import type { CapabilityConnectionStoreContract } from "../src/capability/connection/store-contract"
import { CapabilityOperator } from "../src/capability/operator/index"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityRequestTable, CapabilityTargetTable } from "../src/capability/sql"
import { CredentialTable } from "../src/credential/sql"
import { ProjectTable } from "../src/project/sql"
import { SessionTable } from "../src/session/sql"
import { CapabilityConnectionManagementFixture } from "./fixture/capability-connection-management"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionManagementFixture.layer)

describe("CapabilityConnectionManagement authority and bounded reads", () => {
  it.live("known/missing get, targets and every mutation expose identical public failures without frame or with revoked/mismatched/denied frames", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const missingParent: Capability.ConnectionRef = { ...f.parent, id: Capability.ConnectionID.create() }
    const missingTarget: Capability.TargetRef = { ...f.child, id: Capability.TargetID.create() }
    const baseline = CapabilityConnectionManagementFixture.publicFailures(yield* f.run(f.management.get(missingParent.id)).pipe(Effect.exit))
    expect(baseline).toEqual([{ _tag: "Capability.Failure", code: "connection_unavailable", message: "Capability connection is unavailable" }])
    const methods = (parent: Capability.ConnectionRef, child: Capability.TargetRef): readonly Effect.Effect<unknown, CapabilityConnectionStoreContract.Error>[] => [
      f.management.get(parent.id), f.management.targets(parent.id, {}),
      f.management.disconnect({ connection: parent }),
      f.management.createTarget({ connection: parent, input: { environment: "test", resource: {} } }),
      f.management.retargetTarget({ target: child, input: { environment: "test", resource: {} } }),
      f.management.removeTarget({ target: child }),
      f.management.bind({ target: child, input: { sessionID: f.sessionID, actions: ["read"] } }),
      f.management.unbind({ target: child, sessionID: f.sessionID }),
    ]
    const compare = () => Effect.gen(function* () {
      const exits = yield* Effect.forEach([...methods(f.parent, f.child), ...methods(missingParent, missingTarget)],
        (effect) => effect.pipe(Effect.exit))
      exits.forEach((exit) => {
        CapabilityConnectionManagementFixture.expectCode(exit, "connection_unavailable")
        expect(CapabilityConnectionManagementFixture.publicFailures(exit)).toEqual(baseline)
      })
    })
    yield* compare()
    const revoked = yield* f.operators.issue({ origin: "sdk" })
    yield* f.run(Effect.gen(function* () {
      yield* f.operators.revoke(revoked.authority)
      yield* compare()
    }), "revoked-frame", revoked.authority)
    const other = yield* CapabilityOperator.make({ principal: "different-owner", scope: { placements: "instance", actions: ["*"] } })
    yield* other.withRequest(other.configured, { requestID: "foreign-frame", idempotencyKey: "foreign" }, compare())
    const denied = yield* f.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["connection.list"] } })
    yield* f.run(compare(), "denied", denied.authority)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toEqual([])
  }))

  it.live("pure authority Fail lists normalize, mixed Fail/Die/Interrupt Causes keep every reason and annotation", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const Annotation = Context.Service<{ boundary: string }>("management-test/Cause")
    yield* Effect.forEach(["invocation_binding_missing", "invocation_binding_mismatch", "target_denied", "authentication_required", "authentication_revoked"] as const,
      (code) => Effect.gen(function* () {
        const failure = new Capability.Failure({ code, message: "authority rejected" })
        const pure = Cause.fail(failure)
        const mixed = Cause.annotate(Cause.combine(pure, Cause.combine(Cause.die("boundary-defect"), Cause.interrupt(123))),
          Context.make(Annotation, { boundary: code }))
        const fault = (cause: Cause.Cause<Capability.Failure>) => CapabilityConnectionManagement.make({ store: f.store, operators: {
          ...f.operators, require: (target) => f.operators.require(target).pipe(Effect.andThen(Effect.failCause(cause))),
        } })
        const normalized = yield* fault(pure)
        CapabilityConnectionManagementFixture.expectCode(yield* f.run(normalized.get(f.parent.id)).pipe(Effect.exit), "connection_unavailable")
        const management = yield* fault(mixed)
        const actual = CapabilityConnectionManagementFixture.failed(yield* f.run(management.get(f.parent.id)).pipe(Effect.exit))
        expect(actual.reasons).toEqual(mixed.reasons)
        actual.reasons.forEach((reason) => expect(Context.getOrUndefined(Cause.reasonAnnotations(reason), Annotation)).toEqual({ boundary: code }))
      }))
  }))

  it.live("target scan is exactly limit+1 once; max32/default16 are live bounds even when every scanned target denied", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    yield* Effect.forEach(Array.from({ length: 35 }), () => f.target(f.parent))
    const denied = yield* f.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["connection.targets"],
      resources: [{ kind: "connection", id: f.parent.id }] } })
    const bounded = CapabilityConnectionManagementFixture.targetScans()
    const short = yield* f.run(f.management.targets(f.parent.id, { limit: 32 }), "short", denied.authority).pipe(Effect.withTracer(bounded.tracer))
    expect(short.items).toEqual([])
    expect(short.after).toBeDefined()
    expect(bounded.scans).toHaveLength(1)
    expect(bounded.scans[0].rows).toBe(33)
    const defaults = CapabilityConnectionManagementFixture.targetScans()
    const page = yield* f.run(f.management.targets(f.parent.id, {})).pipe(Effect.withTracer(defaults.tracer))
    expect(page.items).toHaveLength(16)
    expect(defaults.scans).toHaveLength(1)
    expect(defaults.scans[0].rows).toBe(17)
    const control = yield* f.run(f.management.targets(f.parent.id, { limit: 32 }))
    expect(control.items).toHaveLength(32)
    const remaining = yield* f.run(f.management.targets(f.parent.id, { after: control.after, limit: 32 }))
    expect(remaining.items).toHaveLength(4)
    expect(remaining.after).toBeUndefined()
    yield* Effect.forEach(Array.from({ length: 34 }), () => f.connection())
    expect((yield* f.run(f.management.list(CapabilityConnectionManagementFixture.placement, { limit: 32 }))).items).toHaveLength(32)
  }))

  it.live("Session project/workspace/null/empty actor reject binding; credential deletion remains redacted missing metadata", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const project = Project.ID.make("other-session-project")
    yield* f.database.db.insert(ProjectTable).values({ id: project, worktree: CapabilityConnectionManagementFixture.foreign.location.directory,
      sandboxes: [] }).run()
    yield* Effect.forEach([{ project_id: project }, { workspace_id: WorkspaceID.make("wrk_other") }, { agent: null }, { agent: "" }, { agent: " " }],
      (change) => Effect.gen(function* () {
        yield* f.database.db.update(SessionTable).set({ project_id: CapabilityConnectionManagementFixture.placement.projectID,
          workspace_id: null, agent: "persisted-actor", ...change }).where(eq(SessionTable.id, f.sessionID)).run()
        CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.bind({ target: f.child,
          input: { sessionID: f.sessionID, actions: ["read"] } })).pipe(Effect.exit), "connection_unavailable")
        CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.unbind({ target: f.child, sessionID: f.sessionID }))
          .pipe(Effect.exit), "connection_unavailable")
      }))
    expect((yield* f.run(f.management.get(f.parent.id))).credential).toBe("present")
    yield* f.database.db.delete(CredentialTable).where(eq(CredentialTable.id, f.credentialID)).run()
    const result = yield* f.run(f.management.get(f.parent.id))
    expect(result).toEqual({ connection: f.parent, state: "active", credential: "missing" })
    expect(JSON.stringify(result)).not.toContain(f.credentialID)
    expect(JSON.stringify(result)).not.toContain(CapabilityConnectionManagementFixture.secret)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toEqual([])
  }))

  it.live("actual explicit workspace cannot be adopted by implicit grants or Session placement", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const placement = { ...CapabilityConnectionManagementFixture.placement, location: {
      ...CapabilityConnectionManagementFixture.placement.location, workspaceID: WorkspaceID.make("wrk_actual") } }
    yield* f.database.db.update(CapabilityConnectionTable).set({ workspace_id: placement.location.workspaceID })
      .where(eq(CapabilityConnectionTable.id, f.parent.id)).run()
    const implicit = yield* f.operators.issue({ origin: "sdk", scope: { placements: [CapabilityConnectionManagementFixture.placement], actions: ["*"] } })
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.get(f.parent.id), "get", implicit.authority).pipe(Effect.exit), "connection_unavailable")
    const explicit = yield* f.operators.issue({ origin: "sdk", scope: { placements: [placement], actions: ["*"] } })
    expect((yield* f.run(f.management.get(f.parent.id), "get", explicit.authority)).connection).toEqual(f.parent)
    expect((yield* f.run(f.management.list(placement, {}), "list", explicit.authority)).items.map((item) => item.connection)).toEqual([f.parent])
    expect((yield* f.run(f.management.list(CapabilityConnectionManagementFixture.placement, {}))).items).toEqual([])
    const input = { target: f.child, input: { sessionID: f.sessionID, actions: ["read"] } }
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.bind(input), "bind", explicit.authority).pipe(Effect.exit), "connection_unavailable")
    yield* f.database.db.update(SessionTable).set({ workspace_id: placement.location.workspaceID }).where(eq(SessionTable.id, f.sessionID)).run()
    expect((yield* f.run(f.management.bind(input), "bind", explicit.authority)).reused).toBe(false)
  }))

  it.live("generation exhaustion rejects atomically; real SQL body fault preserves target/bindings and writes no receipt", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    yield* f.run(f.management.bind({ target: f.child, input: { sessionID: f.sessionID, actions: ["read"] } }), "setup")
    const bindings = yield* f.database.db.select().from(CapabilityBindingTable)
    const receipts = yield* f.database.db.select().from(CapabilityRequestTable)
    // This real SQL fault occurs after binding invalidation; finalization always removes the trigger.
    yield* f.database.db.run("CREATE TRIGGER management_sql_fault BEFORE UPDATE OF resource ON capability_target BEGIN SELECT RAISE(ABORT, 'MANAGEMENT_SQL_FAULT'); END")
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.retargetTarget({ target: f.child,
      input: { environment: "sql-abort", resource: {} } }), "sql").pipe(
        Effect.ensuring(f.database.db.run("DROP TRIGGER management_sql_fault").pipe(Effect.orDie)), Effect.exit), "outcome_unknown")
    expect((yield* f.database.db.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, f.child.id)).get())?.generation).toBe(0)
    expect(yield* f.database.db.select().from(CapabilityBindingTable)).toEqual(bindings)
    yield* f.database.db.update(CapabilityTargetTable).set({ generation: Number.MAX_SAFE_INTEGER }).where(eq(CapabilityTargetTable.id, f.child.id)).run()
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.retargetTarget({ target: { ...f.child, generation: Number.MAX_SAFE_INTEGER },
      input: { environment: "exhausted", resource: {} } }), "target-max").pipe(Effect.exit), "stale_descriptor")
    yield* f.database.db.update(CapabilityConnectionTable).set({ generation: Number.MAX_SAFE_INTEGER }).where(eq(CapabilityConnectionTable.id, f.parent.id)).run()
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.disconnect({ connection: { ...f.parent, generation: Number.MAX_SAFE_INTEGER } }), "connection-max")
      .pipe(Effect.exit), "stale_descriptor")
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toEqual(receipts)
    expect(yield* f.database.db.select().from(CapabilityBindingTable)).toEqual(bindings)
    expect((yield* f.database.db.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, f.parent.id)).get())?.state).toBe("active")
  }))
})
