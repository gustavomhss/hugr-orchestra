import { expect, test } from "bun:test"
import { CapabilitySetupHttpFixture } from "./capability-setup-http-fixture"

if (!CapabilitySetupHttpFixture.worker) {
  test("isolated implicit-local HTTP regression", () => CapabilitySetupHttpFixture.isolated(import.meta.path,
    ["implicit-local"]), 100_000)
}
if (CapabilitySetupHttpFixture.worker) {
  const { Effect, Result } = await import("effect")
  const { capture } = await import("@orchestra/core/capability/operator/request-data")
  const { Project } = await import("@orchestra/schema/project")
  const { AbsolutePath } = await import("@orchestra/schema/schema")
  const { it } = await import("../../core/test/lib/effect")
  it.live("implicit-local setup must admit creation without caller-supplied workspace identity", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const auth = yield* f.issue()
    const payload = { provider: "slack", key: CapabilitySetupHttpFixture.keys[0], label: "Local account" }
    const target = { action: "connection.connect", resource: { kind: "provider", id: "slack" },
      placement: { projectID: Project.ID.global, location: { directory: AbsolutePath.make(f.directory) } } }
    // Same ledger parser and same data. Omission is a measured positive control.
    expect(Result.isSuccess(capture(target, payload))).toBe(true)
    const response = yield* f.request("/api/capability/connections/connect", { auth, key: "implicit-local", payload })
    expect(response.status).toBe(200)
    expect(f.seen).toHaveLength(1)
    console.log("SETUP_PROOF implicit-local")
  }), 30_000)
}
