import { expect, test } from "bun:test"
import { CapabilitySetupHttpFixture } from "./capability-setup-http-fixture"

const markers = ["neon-verified", "openai-credential-only"]
if (!CapabilitySetupHttpFixture.worker) {
  test("isolated real Server setup routes for registry providers", () =>
    CapabilitySetupHttpFixture.isolated(import.meta.path, markers), 100_000)
}
if (CapabilitySetupHttpFixture.worker) {
  const { Effect, Schema } = await import("effect")
  const { CapabilitySetup } = await import("@orchestra/schema/capability-setup")
  const { CapabilityManagement } = await import("@orchestra/schema/capability-management")
  const { CredentialTable } = await import("@orchestra/core/credential/sql")
  const { CapabilityConnectionTable } = await import("@orchestra/core/capability/sql")
  const { createHash } = await import("node:crypto")
  const { it } = await import("../../core/test/lib/effect")
  const base = "/api/capability/connections"
  const cases = [
    { marker: markers[0], provider: "neon", key: CapabilitySetupHttpFixture.keys[3], verification: "verified",
      endpoint: "https://mcp.neon.tech/mcp", subject: "acct-neon-1", path: "/api/v2/auth" },
    { marker: markers[1], provider: "openai", key: CapabilitySetupHttpFixture.keys[4], verification: "credential-only",
      endpoint: "https://api.openai.com/v1", path: "/v1/models",
      subject: `key:${createHash("sha256").update(CapabilitySetupHttpFixture.keys[4]).digest("hex").slice(0, 16)}` },
  ]
  cases.forEach((item) => it.live(`${item.provider} setup through real routes stores descriptor proof; retry and 401 make no row`,
    () => Effect.gen(function* () {
      const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
      const f = yield* fixture
      const auth = yield* f.issue()
      const payload = { provider: item.provider, key: item.key }
      f.state.mode = "http"
      const denied = yield* f.request(`${base}/connect`, { auth, key: "rejected", payload })
      expect(denied.status).toBe(401)
      expect(yield* f.database.db.select().from(CapabilityConnectionTable).all()).toEqual([])
      f.state.mode = "valid"
      const response = yield* f.request(`${base}/connect`, { auth, key: "first", payload })
      expect(response.status).toBe(200)
      const receipt = Schema.decodeUnknownSync(CapabilityManagement.Receipt)(yield* Effect.promise(() => response.json()))
      expect<string>(Schema.decodeUnknownSync(CapabilitySetup.Result)(receipt.data).verification).toBe(item.verification)
      const rows = yield* f.database.db.select().from(CapabilityConnectionTable).all()
      expect(rows.map((row) => [row.provider, row.endpoint, row.subject_id, row.integration_id])).toEqual([
        [item.provider, item.endpoint, item.subject, `capability.${item.provider}`]])
      expect((yield* f.database.db.select().from(CredentialTable).all()).map((row) => row.value)).toEqual([
        { type: "key", key: item.key }])
      f.state.mode = "http"
      const retry = yield* f.request(`${base}/connect`, { auth, key: "first", payload })
      expect(yield* Effect.promise(() => retry.json())).toEqual({ ...receipt, reused: true })
      expect(f.seen).toEqual([item, item].map((value) => ({ path: value.path, method: "GET",
        authorization: `Bearer ${value.key}` })))
      console.log(`SETUP_PROOF ${item.marker}`)
    }), 30_000))
}
