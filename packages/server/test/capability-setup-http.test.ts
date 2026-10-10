import { expect, test } from "bun:test"
import { CapabilitySetupHttpFixture } from "./capability-setup-http-fixture"

const markers = ["setup-replay"]
if (!CapabilitySetupHttpFixture.worker) {
  test("isolated real Server setup routes", () => CapabilitySetupHttpFixture.isolated(import.meta.path, markers), 100_000)
}
if (CapabilitySetupHttpFixture.worker) {
  const { Effect, Schema } = await import("effect")
  const { CapabilitySetup } = await import("@orchestra/schema/capability-setup")
  const { CapabilityManagement } = await import("@orchestra/schema/capability-management")
  const { CredentialTable } = await import("@orchestra/core/credential/sql")
  const { CapabilityConnectionTable, CapabilityRequestTable } = await import("@orchestra/core/capability/sql")
  const { it } = await import("../../core/test/lib/effect")
  const base = "/api/capability/connections"
  const json = (response: Response) => Effect.gen(function* () {
    expect(response.status).toBe(200)
    return yield* Effect.promise(() => response.json())
  })
  it.live("real verified setup and historical replay bypass expired remote identity", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const auth = yield* f.issue()
    const payload = { provider: "slack", key: CapabilitySetupHttpFixture.keys[0], label: "First account" }
    const response = yield* f.request(`${base}/connect`, { auth, key: "historical", payload })
    const receipt = Schema.decodeUnknownSync(CapabilityManagement.Receipt)(yield* json(response))
    const result = Schema.decodeUnknownSync(CapabilitySetup.Result)(receipt.data)
    expect(receipt.reused).toBe(false)
    expect(result.verification).toBe("verified")
    const rows = yield* f.database.db.select().from(CapabilityConnectionTable).all()
    const credentials = yield* f.database.db.select().from(CredentialTable).all()
    expect(rows).toHaveLength(1)
    expect(credentials).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: result.connection.id, credential_id: credentials[0].id,
      endpoint: "https://slack.com/api", subject_id: '["T123","U456","B789"]', label: payload.label })
    expect(credentials[0]).toMatchObject({ integration_id: "capability.slack", label: payload.label,
      value: { type: "key", key: payload.key } })
    expect(f.seen).toEqual([{ path: "/api/auth.test", method: "POST", authorization: `Bearer ${payload.key}` }])
    f.state.mode = "expired"
    expect(yield* json(yield* f.request(`${base}/connect`, { auth, key: "historical", payload })))
      .toEqual({ ...receipt, reused: true })
    expect(f.seen).toHaveLength(1)
    expect(yield* f.database.db.select().from(CapabilityRequestTable).all()).toHaveLength(1)
    expect((yield* f.request(`${base}/connect`, { auth, key: "historical",
      payload: { ...payload, key: CapabilitySetupHttpFixture.keys[1] } })).status).toBe(403)
    expect(f.seen).toHaveLength(1)
    expect(yield* json(yield* f.request(`${base}/${result.connection.id}`, { auth }))).toEqual({
      connection: result.connection, label: payload.label, state: "active", credential: "present",
    })
    console.log(`SETUP_PROOF ${markers[0]}`)
  }), 30_000)
}
