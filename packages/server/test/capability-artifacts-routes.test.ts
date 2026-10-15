import { expect, test } from "bun:test"
import { CapabilitySetupHttpFixture } from "./capability-setup-http-fixture"

// Proves the aggregate Api/handlers wiring: the TestApi in capability-artifacts-http-fixture.ts cannot.
if (!CapabilitySetupHttpFixture.worker) {
  test("isolated aggregate artifact routes", () => CapabilitySetupHttpFixture.isolated(import.meta.path,
    ["artifact-routes"]), 100_000)
}
if (CapabilitySetupHttpFixture.worker) {
  const { Effect } = await import("effect")
  const { Capability } = await import("@orchestra/schema/capability")
  const { SessionID } = await import("@orchestra/schema/session-id")
  const { it } = await import("../../core/test/lib/effect")
  it.live("aggregate routes authenticate before resolving artifact selectors", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const item = `/api/capability/sessions/${SessionID.create()}/artifacts/${Capability.ArtifactID.create()}/0`
    const anonymous = yield* f.request(`/api/capability/sessions/${SessionID.create()}/artifacts`)
    expect(anonymous.status).toBe(401)
    const auth = yield* f.issue()
    const responses = yield* Effect.forEach([
      f.request(`/api/capability/sessions/${SessionID.create()}/artifacts`, { auth }),
      f.request(item, { auth }),
      f.request(`${item}/content`, { auth }),
      f.request(`${item}/share`, { auth, key: "share-route", payload: { targetSessionID: SessionID.create() } }),
    ], (response) => response)
    const bodies = yield* Effect.forEach(responses, (response) => Effect.promise(() => response.text()))
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403])
    expect(new Set(bodies).size).toBe(1)
    console.log("SETUP_PROOF artifact-routes")
  }), 30_000)
}
