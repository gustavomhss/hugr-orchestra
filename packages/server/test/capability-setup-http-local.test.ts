import { expect, test } from "bun:test"
import { CapabilitySetupHttpFixture } from "./capability-setup-http-fixture"

if (!CapabilitySetupHttpFixture.worker) {
  test("isolated implicit-local HTTP regression", () => CapabilitySetupHttpFixture.isolated(import.meta.path,
    ["implicit-local"]), 100_000)
}
if (CapabilitySetupHttpFixture.worker) {
  const { Effect, Result, Schema } = await import("effect")
  const { capture } = await import("@orchestra/core/capability/operator/request-data")
  const { Project } = await import("@orchestra/schema/project")
  const { AbsolutePath } = await import("@orchestra/schema/schema")
  const { Database } = await import("@orchestra/core/database/database")
  const { CapabilityRequest } = await import("@orchestra/core/capability/operator/request")
  const { CapabilityManagement } = await import("@orchestra/schema/capability-management")
  const { CapabilitySetup } = await import("@orchestra/schema/capability-setup")
  const { CapabilityRequestTable } = await import("@orchestra/core/capability/sql")
  const { it } = await import("../../core/test/lib/effect")
  it.live("implicit-local setup must admit creation without caller-supplied workspace identity", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const auth = yield* f.issue()
    const payload = { provider: "slack", key: CapabilitySetupHttpFixture.keys[0], label: "Local account" }
    const target = { action: "connection.connect", resource: { kind: "provider", id: "slack" },
      placement: { projectID: Project.ID.global, location: { directory: AbsolutePath.make(f.directory) } } }
    const explicit = { ...target, placement: { ...target.placement,
      location: { ...target.placement.location, workspaceID: undefined } } }
    expect(Object.hasOwn(target.placement.location, "workspaceID")).toBe(false)
    expect(Object.hasOwn(explicit.placement.location, "workspaceID")).toBe(true)
    // Run native HTTP first so an encoded-schema mutation fails at the real handler boundary.
    const response = yield* f.request("/api/capability/connections/connect", { auth, key: "implicit-local", payload })
    expect(response.status).toBe(200)
    expect(f.seen).toHaveLength(1)
    const omittedFrame = capture(target, payload)
    const explicitFrame = capture(explicit, payload)
    expect(Result.isSuccess(omittedFrame)).toBe(true)
    expect(Result.isSuccess(explicitFrame)).toBe(true)
    if (Result.isFailure(omittedFrame) || Result.isFailure(explicitFrame)) return yield* Effect.die("Expected decoded target frames")
    expect(explicitFrame.success.targetHash).toBe(omittedFrame.success.targetHash)
    expect(explicitFrame.success.payloadHash).toBe(omittedFrame.success.payloadHash)
    const receipt = Schema.decodeUnknownSync(CapabilityManagement.Receipt)(yield* Effect.promise(() => response.json()))
    expect(Schema.decodeUnknownSync(CapabilitySetup.Result)(receipt.data).verification).toBe("verified")
    const ledger = yield* CapabilityRequest.make({ operators: f.operators }).pipe(Effect.provideService(Database.Service, f.database))
    const authority = yield* f.operators.authenticate(auth.slice(7))
    yield* f.operators.withRequest(authority, { requestID: "decoded-local-replay", idempotencyKey: "implicit-local" },
      Effect.gen(function* () {
        const binding = yield* f.operators.require(target)
        expect((yield* f.operators.require(explicit)) === binding).toBe(true)
        expect(yield* ledger.reconcile(target, payload)).toEqual({ ...receipt, reused: true })
        expect(yield* ledger.reconcile(explicit, payload)).toEqual({ ...receipt, reused: true })
      }))
    f.state.mode = "expired"
    const retry = yield* f.request("/api/capability/connections/connect", { auth, key: "implicit-local", payload })
    expect(f.seen).toHaveLength(1)
    expect(retry.status).toBe(200)
    expect(yield* Effect.promise(() => retry.json())).toEqual({ ...receipt, reused: true })
    expect(yield* f.database.db.select().from(CapabilityRequestTable).all()).toHaveLength(1)
    console.log("SETUP_PROOF implicit-local")
  }), 30_000)
}
