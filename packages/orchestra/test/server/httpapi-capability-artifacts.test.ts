import { expect, test, setDefaultTimeout } from "bun:test"
import { CapabilitySetupHttpFixture } from "../../../server/test/capability-setup-http-fixture"

// The package preload's async runtime disposal also needs a live-host timeout.
setDefaultTimeout(30_000)
if (!CapabilitySetupHttpFixture.worker) {
  test("isolated full Orchestra host artifact routes", () => CapabilitySetupHttpFixture.isolated(import.meta.path,
    ["host-artifact-routes"]), 100_000)
}
if (CapabilitySetupHttpFixture.worker) {
  const { Effect } = await import("effect")
  const { Capability } = await import("@orchestra/schema/capability")
  const { SessionID } = await import("@orchestra/schema/session-id")
  const { CapabilitySetupHostFixture } = await import("./httpapi-capability-setup-fixture")
  const { it } = await import("../../../core/test/lib/effect")
  it.live("full host serves operator artifact routes behind Basic authority", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHostFixture.make({ password: "host-secret:colon" }))
    const f = yield* fixture
    const item = `/api/capability/sessions/${SessionID.create()}/artifacts/${Capability.ArtifactID.create()}/0`
    expect((yield* f.request(`${item}/content`)).status).toBe(401)
    const responses = yield* Effect.forEach([
      f.request(`/api/capability/sessions/${SessionID.create()}/artifacts`, { auth: CapabilitySetupHostFixture.basic() }),
      f.request(`${item}/content`, { auth: CapabilitySetupHostFixture.basic() }),
    ], (response) => response)
    expect(responses.map((response) => response.status)).toEqual([403, 403])
    console.log("SETUP_PROOF host-artifact-routes")
  }), 30_000)
}
