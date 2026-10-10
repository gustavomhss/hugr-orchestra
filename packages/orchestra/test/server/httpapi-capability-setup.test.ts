import { expect, test, setDefaultTimeout } from "bun:test"
import { CapabilitySetupHttpFixture } from "../../../server/test/capability-setup-http-fixture"

const markers = ["host-basic", "host-bearer", "host-implicit-local"]
// The package preload's async runtime disposal also needs a live-host timeout.
setDefaultTimeout(30_000)
if (!CapabilitySetupHttpFixture.worker) {
  test("isolated full Orchestra host setup routes", () => CapabilitySetupHttpFixture.isolated(import.meta.path, markers), 100_000)
}
if (CapabilitySetupHttpFixture.worker) {
  const { Flag } = await import("@orchestra/core/flag/flag")
  expect(Flag.ORCHESTRA_DISABLE_MODELS_FETCH).toBe(true)
  const { Effect, Schema } = await import("effect")
  const { CapabilitySetup } = await import("@orchestra/schema/capability-setup")
  const { CapabilityManagement } = await import("@orchestra/schema/capability-management")
  const { CredentialTable } = await import("@orchestra/core/credential/sql")
  const { Capability } = await import("@orchestra/schema/capability")
  const { SessionID } = await import("@orchestra/schema/session-id")
  const { SessionTable } = await import("@orchestra/core/session/sql")
  const { Project } = await import("@orchestra/schema/project")
  const { AbsolutePath } = await import("@orchestra/schema/schema")
  const { WorkspaceID } = await import("@orchestra/schema/workspace-id")
  const { CapabilitySetupHostFixture } = await import("./httpapi-capability-setup-fixture")
  const { it } = await import("../../../core/test/lib/effect")
  const connect = "/api/capability/connections/connect"
  const query = { "location[workspace]": "wrk_host-proof" }
  const payload = { provider: "slack", key: CapabilitySetupHttpFixture.keys[0], label: "Host account" }

  it.live("full host Basic protects setup before Location and ignores injected bearer", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHostFixture.make({ password: "host-secret:colon" }))
    const f = yield* fixture
    const bearer = yield* f.issue()
    yield* Effect.forEach([undefined, bearer, CapabilitySetupHostFixture.basic("wrong")], (auth) => f.request(connect,
      { auth, key: "basic", payload, directory: "\u0000" }).pipe(Effect.tap((res) => Effect.sync(() => expect(res.status).toBe(401)))))
    expect(f.seen).toEqual([])
    const auth = CapabilitySetupHostFixture.basic()
    const response = yield* f.request(connect, { auth, key: "basic", payload, query })
    expect(response.status).toBe(200)
    const receipt = Schema.decodeUnknownSync(CapabilityManagement.Receipt)(yield* Effect.promise(() => response.json()))
    const connection = Schema.decodeUnknownSync(CapabilitySetup.Result)(receipt.data).connection
    expect((yield* f.request(`/api/capability/connections/${connection.id}`, { auth, query })).status).toBe(200)
    expect(f.seen).toHaveLength(1)
    expect((yield* f.database.db.select().from(CredentialTable).all())[0]).toMatchObject({ value: { type: "key", key: payload.key } })
    const { Orchestra } = yield* Effect.promise(() => import("../../../client/src/index"))
    const fetch = Object.assign((input: RequestInfo | URL, init?: RequestInit) => f.handler(new Request(input, init)),
      { preconnect: () => undefined })
    const client = Orchestra.make({ baseUrl: "http://orchestra.local", fetch, headers: { Authorization: auth } })
    const location = { directory: AbsolutePath.make(f.directory), workspace: WorkspaceID.make(query["location[workspace]"]) }
    expect(yield* Effect.promise(() => client.connections.connect({ location, "idempotency-key": "basic",
      provider: "slack", key: payload.key, label: payload.label }))).toEqual({ ...receipt, reused: true })
    const target = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }))(
      (yield* Effect.promise(() => client.connections.createTarget({ location, connection, "idempotency-key": "host-target",
        input: { environment: "test", resource: null } }))).data).target
    const sessionID = SessionID.create()
    yield* f.database.db.insert(SessionTable).values({ id: sessionID, project_id: Project.ID.global,
      directory: location.directory, workspace_id: location.workspace, agent: "host-current-actor",
      slug: "host", title: "host", version: "test" }).run()
    yield* Effect.promise(() => client.connections.bind({ location, "idempotency-key": "host-bind", target,
      input: { sessionID, actions: ["read"] } }))
    expect(yield* Effect.promise(() => client.connections.getTarget({ location, targetID: target.id }))).toEqual({ target })
    expect(yield* Effect.promise(() => client.connections.bindings({ location, targetID: target.id, limit: 1 }))).toEqual({
      items: [{ sessionID, actions: ["read"] }], coverage: "current-actor",
    })
    expect(f.seen).toHaveLength(1)
    console.log(`SETUP_PROOF ${markers[0]}`)
  }), 30_000)

  it.live("full auth-disabled host requires issued bearer; replay and closed Scope preserve authority", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHostFixture.make())
    const f = yield* fixture
    const auth = yield* f.issue()
    expect((yield* f.request(connect, { key: "bearer", payload, directory: "\u0000" })).status).toBe(401)
    expect((yield* f.request(connect, { auth: CapabilitySetupHostFixture.basic(), key: "bearer", payload, query })).status).toBe(401)
    expect((yield* f.request(connect, { key: "bearer", payload, query: { ...query, token: auth.slice(7) },
      headers: { cookie: `authorization=${auth}` } })).status).toBe(401)
    const response = yield* f.request(connect, { auth, key: "bearer", payload, query })
    expect(response.status).toBe(200)
    const receipt = Schema.decodeUnknownSync(CapabilityManagement.Receipt)(yield* Effect.promise(() => response.json()))
    f.state.mode = "expired"
    const retry = yield* f.request(connect, { auth, key: "bearer", payload, query })
    expect(retry.status).toBe(200)
    expect(yield* Effect.promise(() => retry.json())).toEqual({ ...receipt, reused: true })
    expect(f.seen).toHaveLength(1)
    yield* f.closeAuthority
    expect((yield* f.request(connect, { auth, key: "bearer", payload, query, directory: "\u0000" })).status).toBe(401)
    expect(f.seen).toHaveLength(1)
    console.log(`SETUP_PROOF ${markers[1]}`)
  }), 30_000)

  it.live("full Orchestra host must support implicit-local setup without explicit workspace identity", () => Effect.gen(function* () {
    const fixture = yield* Effect.promise(() => CapabilitySetupHostFixture.make())
    const f = yield* fixture
    const response = yield* f.request(connect, { auth: yield* f.issue(), key: "host-implicit-local", payload })
    expect(response.status).toBe(200)
    expect(f.seen).toHaveLength(1)
    console.log(`SETUP_PROOF ${markers[2]}`)
  }), 30_000)
}
