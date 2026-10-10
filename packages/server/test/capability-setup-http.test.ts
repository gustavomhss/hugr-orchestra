import { expect, test } from "bun:test"
import { CapabilitySetupHttpFixture } from "./capability-setup-http-fixture"

const markers = ["setup-replay", "atomic-accounts", "provider-failures", "auth-schema"]
if (!CapabilitySetupHttpFixture.worker) {
  test("isolated real Server setup routes", () => CapabilitySetupHttpFixture.isolated(import.meta.path, markers), 100_000)
}
if (CapabilitySetupHttpFixture.worker) {
  const { Effect, Schema } = await import("effect")
  const { CapabilitySetup } = await import("@orchestra/schema/capability-setup")
  const { CapabilityManagement } = await import("@orchestra/schema/capability-management")
  const { CredentialTable } = await import("@orchestra/core/credential/sql")
  const { CapabilityConnectionTable, CapabilityRequestTable } = await import("@orchestra/core/capability/sql")
  const { createHash } = await import("node:crypto")
  const { it } = await import("../../core/test/lib/effect")
  const base = "/api/capability/connections"
  // Explicit placement is a positive control. Implicit-local regression has its own proof file.
  const query = { "location[workspace]": "wrk_setup-proof" }
  const json = (response: Response) => Effect.gen(function* () {
    expect(response.status).toBe(200)
    return yield* Effect.promise(() => response.json())
  })
  it.live("real verified setup and historical replay bypass expired remote identity", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const auth = yield* f.issue()
    const payload = { provider: "slack", key: CapabilitySetupHttpFixture.keys[0], label: "First account" }
    const response = yield* f.request(`${base}/connect`, { auth, key: "historical", payload, query })
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
    const retry = yield* f.request(`${base}/connect`, { auth, key: "historical", payload, query })
    expect(f.seen).toHaveLength(1)
    expect(yield* json(retry)).toEqual({ ...receipt, reused: true })
    expect(yield* f.database.db.select().from(CapabilityRequestTable).all()).toHaveLength(1)
    yield* Effect.forEach([{ ...payload, key: CapabilitySetupHttpFixture.keys[1] }, { ...payload, provider: "discord" },
      { ...payload, label: "Changed" }], (changed) => f.request(`${base}/connect`, {
        auth, key: "historical", payload: changed, query,
      }).pipe(Effect.tap((res) => Effect.sync(() => expect(res.status).toBe(403)))))
    expect((yield* f.request(`${base}/connect`, { auth, key: "historical", payload, query,
      directory: f.directory + "/foreign" })).status).toBe(403)
    expect(f.seen).toHaveLength(1)
    expect(yield* json(yield* f.request(`${base}/${result.connection.id}`, { auth, query }))).toEqual({
      connection: result.connection, label: payload.label, state: "active", credential: "present",
    })
    console.log(`SETUP_PROOF ${markers[0]}`)
  }), 30_000)

  it.live("real INSERT abort rolls back credential connection and receipt; explicit accounts keep exact keys", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const auth = yield* f.issue()
    const payload = { provider: "slack", key: CapabilitySetupHttpFixture.keys[0], label: "Primary" }
    yield* Effect.forEach(["capability_connection", "capability_request"], (table) => Effect.gen(function* () {
      yield* f.database.db.run(`CREATE TRIGGER setup_http_abort BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'SETUP_HTTP_ABORT'); END`)
      const response = yield* f.request(`${base}/connect`, { auth, key: table, payload, query }).pipe(Effect.ensuring(
        f.database.db.run("DROP TRIGGER setup_http_abort").pipe(Effect.orDie)))
      expect(response.status).toBe(403)
      expect(yield* Effect.promise(() => response.json())).toEqual({ _tag: "ForbiddenError", message: "Request denied" })
      expect(yield* f.database.db.select().from(CredentialTable).all()).toEqual([])
      expect(yield* f.database.db.select().from(CapabilityConnectionTable).all()).toEqual([])
      expect(yield* f.database.db.select().from(CapabilityRequestTable).all()).toEqual([])
    }))
    expect(f.seen).toHaveLength(2)
    const receipts = yield* Effect.forEach(CapabilitySetupHttpFixture.keys.slice(0, 2), (key, index) =>
      f.request(`${base}/connect`, { auth, key: `account-${index}`, query,
        payload: { ...payload, key, label: `Account ${index}` } }).pipe(Effect.flatMap(json),
          Effect.map(Schema.decodeUnknownSync(CapabilityManagement.Receipt))))
    const results = receipts.map((receipt) => Schema.decodeUnknownSync(CapabilitySetup.Result)(receipt.data))
    expect(new Set(results.map((result) => result.connection.id)).size).toBe(2)
    const rows = yield* f.database.db.select().from(CapabilityConnectionTable).all()
    const credentials = yield* f.database.db.select().from(CredentialTable).all()
    expect(credentials).toHaveLength(2)
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.credential_id)).size).toBe(2)
    rows.forEach((row) => {
      const index = results.findIndex((result) => result.connection.id === row.id)
      const key = CapabilitySetupHttpFixture.keys[index]
      expect(credentials.find((credential) => credential.id === row.credential_id)).toMatchObject({
        integration_id: "capability.slack", label: `Account ${index}`, value: { type: "key", key },
      })
      expect(row.subject_id).toBe(index === 0 ? '["T123","U456","B789"]' : '["T999","U456","B789"]')
      expect(row.scope_hash).toBe(createHash("sha256").update(JSON.stringify(["slack", row.endpoint, row.subject_id,
        createHash("sha256").update(key).digest("hex")])).digest("hex"))
    })
    const page = Schema.decodeUnknownSync(CapabilityManagement.ConnectionPage)(yield* json(yield* f.request(base,
      { auth, query: { ...query, limit: "1" } })))
    expect(page.items).toHaveLength(1)
    expect(page.after).toBeDefined()
    const next = Schema.decodeUnknownSync(CapabilityManagement.ConnectionPage)(yield* json(yield* f.request(base,
      { auth, query: { ...query, limit: "1", after: page.after ?? "" } })))
    expect([...page.items, ...next.items].map((item) => item.label).sort()).toEqual(["Account 0", "Account 1"])
    expect(f.seen).toHaveLength(4)
    console.log(`SETUP_PROOF ${markers[1]}`)
  }), 30_000)

  it.live("real identity rejects malformed Slack redirects HTTP failures and non-bot Discord; valid Discord uses Bot", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const auth = yield* f.issue()
    yield* Effect.forEach(["expired", "malformed", "redirect", "http", "not-bot"], (mode) => Effect.gen(function* () {
      f.state.mode = mode
      const response = yield* f.request(`${base}/connect`, { auth, key: mode, query,
        payload: { provider: mode === "not-bot" ? "discord" : "slack", key: CapabilitySetupHttpFixture.keys[2] } })
      expect(response.status).toBe(mode === "expired" || mode === "http" ? 401 : 403)
    }))
    expect(f.seen).toHaveLength(5)
    expect(yield* f.database.db.select().from(CredentialTable).all()).toEqual([])
    f.state.mode = "valid"
    const receipt = Schema.decodeUnknownSync(CapabilityManagement.Receipt)(yield* json(yield* f.request(`${base}/connect`,
      { auth, key: "discord-valid", query, payload: { provider: "discord", key: CapabilitySetupHttpFixture.keys[2] } })))
    expect(Schema.decodeUnknownSync(CapabilitySetup.Result)(receipt.data).connection.provider).toBe("discord")
    expect(f.seen.at(-1)).toEqual({ path: "/api/v10/users/@me", method: "GET",
      authorization: `Bot ${CapabilitySetupHttpFixture.keys[2]}` })
    expect((yield* f.database.db.select().from(CredentialTable).all())[0]).toMatchObject({
      integration_id: "capability.discord", label: "discord", value: { type: "key", key: CapabilitySetupHttpFixture.keys[2] },
    })
    console.log(`SETUP_PROOF ${markers[2]}`)
  }), 30_000)

  it.live("operator auth precedes poisoned Location and network; strict JSON schema never echoes actual key", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const auth = yield* f.issue()
    const payload = { provider: "slack", key: CapabilitySetupHttpFixture.keys[0] }
    expect((yield* f.request(`${base}/connect`, { key: "unauth", payload, directory: "\u0000" })).status).toBe(401)
    expect((yield* f.request(base, { auth, directory: "\u0000" })).status).toBe(500)
    expect(f.seen).toEqual([])
    const denied = yield* f.issue({ placements: "instance", actions: ["connection.connect"],
      resources: [{ kind: "provider", id: "discord" }] })
    expect((yield* f.request(`${base}/connect`, { auth: denied, key: "denied", payload, query })).status).toBe(403)
    yield* Effect.forEach(["endpoint", "subject", "subjectID", "credential", "credentialID", "agent", "agentID", "invocation", "fixtureOrigin"], (field) =>
      f.request(`${base}/connect`, { auth, key: field, query, payload: { ...payload, [field]: payload.key } }).pipe(
        Effect.tap((response) => Effect.sync(() => expect(response.status).toBe(400)))))
    yield* Effect.forEach([{ ...payload, provider: payload.key }, { ...payload, key: { private: payload.key } },
      { ...payload, label: payload.key.repeat(10) }], (invalid) => f.request(`${base}/connect`, {
        auth, key: "invalid-schema", payload: invalid, query,
      }).pipe(Effect.tap((response) => Effect.sync(() => expect(response.status).toBe(400)))))
    yield* Effect.forEach([`{"key":"${payload.key}",`, `{"key":${payload.key}}`, JSON.stringify(payload) + "!"],
      (raw) => f.request(`${base}/connect`, { auth, key: "invalid-json", query, raw }).pipe(
        Effect.tap((response) => Effect.sync(() => expect(response.status).toBe(500)))))
    expect((yield* f.request(`${base}/connect`, { auth, payload, query })).status).toBe(400)
    expect(f.seen).toEqual([])
    expect(yield* f.database.db.select().from(CredentialTable).all()).toEqual([])
    console.log(`SETUP_PROOF ${markers[3]}`)
  }), 30_000)
}
