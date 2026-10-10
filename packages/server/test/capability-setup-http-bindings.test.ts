import { expect, test } from "bun:test"
import type { CapabilityConnectionStoreContract } from "@orchestra/core/capability/connection/store-contract"
import { CapabilitySetupHttpFixture } from "./capability-setup-http-fixture"

const markers = ["bindings-keyset", "mixed-boundary"]
if (!CapabilitySetupHttpFixture.worker) {
  test("isolated real binding inspection and HTTP Cause boundary", () =>
    CapabilitySetupHttpFixture.isolated(import.meta.path, markers), 100_000)
}
if (CapabilitySetupHttpFixture.worker) {
  const { Cause, Context, Effect, Exit, Schema } = await import("effect")
  const { Capability } = await import("@orchestra/schema/capability")
  const { Agent } = await import("@orchestra/schema/agent")
  const { CapabilitySetup } = await import("@orchestra/schema/capability-setup")
  const { CapabilityManagement } = await import("@orchestra/schema/capability-management")
  const { SessionID } = await import("@orchestra/schema/session-id")
  const { WorkspaceID } = await import("@orchestra/schema/workspace-id")
  const { Project } = await import("@orchestra/schema/project")
  const { AbsolutePath } = await import("@orchestra/schema/schema")
  const { SessionTable } = await import("@orchestra/core/session/sql")
  const { CapabilityBindingTable, CapabilityTargetTable, CapabilityConnectionTable } = await import("@orchestra/core/capability/sql")
  const { SqlError, ConnectionError } = await import("effect/unstable/sql/SqlError")
  const { EffectDrizzleQueryError } = await import("drizzle-orm/effect-core/errors")
  const { connectionResponse } = await import("../src/handlers/capability-connections")
  const { it } = await import("../../core/test/lib/effect")
  const { eq, sql } = await import("drizzle-orm")
  const query = { "location[workspace]": "wrk_binding-proof" }
  const json = (response: Response) => Effect.gen(function* () {
    expect(response.status).toBe(200)
    return yield* Effect.promise(() => response.json())
  })

  it.live("nullable resource stays JSON SQL text; getTarget is metadata-only; current actor keysets filter before LIMIT", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const auth = yield* f.issue()
    const created = Schema.decodeUnknownSync(CapabilityManagement.Receipt)(yield* json(yield* f.request(
      "/api/capability/connections/connect", { auth, key: "binding-connect", query,
        payload: { provider: "slack", key: CapabilitySetupHttpFixture.keys[0] } })))
    const connection = Schema.decodeUnknownSync(CapabilitySetup.Result)(created.data).connection
    const receipt = Schema.decodeUnknownSync(CapabilityManagement.Receipt)(yield* json(yield* f.request(
      "/api/capability/targets", { auth, key: "nullable-target", query,
        payload: { connection, input: { environment: "test", resource: null } } })))
    const target = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }))(receipt.data).target
    expect(yield* f.database.db.all(sql`SELECT resource, typeof(resource) AS kind FROM capability_target WHERE id = ${target.id}`))
      .toEqual([{ resource: "null", kind: "text" }])
    const read = `/api/capability/targets/${target.id}`
    expect(yield* json(yield* f.request(read, { auth, directory: f.directory + "/foreign" }))).toEqual({ target })
    yield* f.database.db.update(CapabilityTargetTable).set({ resource: { private: CapabilitySetupHttpFixture.keys[0] } })
      .where(eq(CapabilityTargetTable.id, target.id)).run()
    expect(yield* json(yield* f.request(read, { auth, query }))).toEqual({ target })
    const placement = { projectID: Project.ID.global, location: { directory: AbsolutePath.make(f.directory),
      workspaceID: WorkspaceID.make(query["location[workspace]"]) } }
    const rows = [
      { suffix: "00", agent: "\u00a0actor", binding: "\u00a0actor" },
      { suffix: "01", agent: "actor\ufeff", binding: "actor\ufeff" },
      { suffix: "02", agent: "actor", binding: "old-actor" },
      { suffix: "03", agent: "", binding: "" },
      { suffix: "04", agent: "actor", binding: "actor", foreign: true },
      { suffix: "10", agent: "actor", binding: "actor" },
      { suffix: "20", agent: "actor", binding: "actor" },
      { suffix: "30", agent: "actor", binding: "actor" },
    ]
    yield* Effect.forEach(rows, (row) => Effect.gen(function* () {
      const sessionID = SessionID.make(`ses_binding_${row.suffix}`)
      yield* f.database.db.insert(SessionTable).values({ id: sessionID, project_id: placement.projectID,
        directory: AbsolutePath.make(row.foreign ? f.directory + "/foreign" : f.directory), workspace_id: placement.location.workspaceID,
        agent: row.agent, slug: "binding", title: "binding", version: "test" }).run()
      yield* f.database.db.insert(CapabilityBindingTable).values({ target_id: target.id, session_id: sessionID,
        agent_id: Agent.ID.make(row.binding), actions: ["read"] }).run()
    }))
    const first = Schema.decodeUnknownSync(CapabilityManagement.BindingPage)(yield* json(yield* f.request(`${read}/bindings`,
      { auth, query: { limit: "1" } })))
    expect(first).toEqual({ items: [{ sessionID: SessionID.make("ses_binding_10"), actions: ["read"] }],
      coverage: "current-actor", after: SessionID.make("ses_binding_10") })
    const next = Schema.decodeUnknownSync(CapabilityManagement.BindingPage)(yield* json(yield* f.request(`${read}/bindings`,
      { auth, query: { limit: "2", after: first.after ?? "" } })))
    expect(next).toEqual({ items: ["ses_binding_20", "ses_binding_30"].map((id) => ({ sessionID: SessionID.make(id), actions: ["read"] })),
      coverage: "current-actor" })
    yield* f.database.db.update(SessionTable).set({ agent: "changed" }).where(eq(SessionTable.id, SessionID.make("ses_binding_20"))).run()
    expect(Schema.decodeUnknownSync(CapabilityManagement.BindingPage)(yield* json(yield* f.request(`${read}/bindings`,
      { auth, query: { limit: "2", after: first.after ?? "" } }))).items).toEqual([{ sessionID: SessionID.make("ses_binding_30"), actions: ["read"] }])
    const denied = yield* f.issue({ placements: [placement], actions: ["target.get"], resources: [{ kind: "target", id: target.id }] })
    expect((yield* f.request(`${read}/bindings`, { auth: denied, query })).status).toBe(403)
    expect(yield* json(yield* f.request(read, { auth: denied, query }))).toEqual({ target })
    const wrongPlacement = yield* f.issue({ placements: [{ ...placement, location: {
      ...placement.location, directory: AbsolutePath.make(f.directory + "/foreign") } }], actions: ["*"] })
    expect((yield* f.request(read, { auth: wrongPlacement, query })).status).toBe(403)
    expect((yield* f.request(`${read}/bindings`, { auth, query: { limit: "33" } })).status).toBe(400)
    yield* f.database.db.update(CapabilityConnectionTable).set({ state: "revoked" }).where(eq(CapabilityConnectionTable.id, connection.id)).run()
    const revoked = yield* f.request(`${read}/bindings`, { auth, query })
    const missing = yield* f.request(`/api/capability/targets/${Capability.TargetID.create()}/bindings`, { auth, query })
    expect(revoked.status).toBe(403)
    expect(missing.status).toBe(403)
    expect(yield* Effect.promise(() => revoked.json())).toEqual(yield* Effect.promise(() => missing.json()))
    console.log(`SETUP_PROOF ${markers[0]}`)
  }), 30_000)

  it.live("actual connectionResponse preserves mixed SQL authority defect interrupt reasons and annotations", () => Effect.gen(function* () {
    const defect = new Error("owned-lifecycle-defect")
    const original = Cause.fromReasons<CapabilityConnectionStoreContract.Error>([
      ...Cause.fail(new Capability.Failure({ code: "authentication_required", message: CapabilitySetupHttpFixture.keys[0] })).reasons,
      ...Cause.fail(new Capability.Failure({ code: "target_denied", message: CapabilitySetupHttpFixture.keys[1] })).reasons,
      ...Cause.fail(new SqlError({ reason: new ConnectionError({ cause: CapabilitySetupHttpFixture.keys[0] }) })).reasons,
      ...Cause.fail(new EffectDrizzleQueryError({ query: "private-query", params: CapabilitySetupHttpFixture.keys, cause: "private-driver" })).reasons,
      ...Cause.die(defect).reasons, ...Cause.interrupt(821).reasons,
    ].map((reason, index) => reason.annotate(Context.makeUnsafe(new Map([["proof", index]])))))
    const exit = yield* connectionResponse(Effect.failCause(original)).pipe(Effect.exit)
    if (Exit.isSuccess(exit)) return yield* Effect.die("Expected failed mixed Cause")
    expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(["Fail", "Fail", "Fail", "Fail", "Die", "Interrupt"])
    expect(exit.cause.reasons.map((reason) => Object.fromEntries(reason.annotations))).toEqual(
      original.reasons.map((reason) => Object.fromEntries(reason.annotations)))
    exit.cause.reasons.slice(0, 4).forEach((reason, index) => {
      if (reason._tag !== "Fail") throw new Error("Expected mapped failure")
      expect(reason.error).toMatchObject(index === 0 ? { _tag: "UnauthorizedError", message: "Authentication required" }
        : { _tag: "ForbiddenError", message: "Request denied" })
      CapabilitySetupHttpFixture.keys.forEach((key) => expect(JSON.stringify(reason.error)).not.toContain(key))
    })
    expect(exit.cause.reasons[4] === original.reasons[4]).toBe(true)
    expect(exit.cause.reasons[5] === original.reasons[5]).toBe(true)
    console.log(`SETUP_PROOF ${markers[1]}`)
  }), 30_000)
}
