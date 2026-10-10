import { expect, test } from "bun:test"
import { CapabilitySetupHttpFixture } from "../../server/test/capability-setup-http-fixture"

const markers = ["sdk-effect", "sdk-promise", "sdk-effect-local", "sdk-promise-local"]
if (!CapabilitySetupHttpFixture.worker) {
  test("isolated generated setup clients reach real Server routes", () =>
    CapabilitySetupHttpFixture.isolated(import.meta.path, markers), 100_000)
}
if (CapabilitySetupHttpFixture.worker) {
  const { Effect, Layer, Schema } = await import("effect")
  const { FetchHttpClient } = await import("effect/unstable/http")
  const { CapabilitySetup } = await import("../../schema/src/capability-setup")
  const { Capability } = await import("../../schema/src/capability")
  const { AbsolutePath } = await import("../../schema/src/schema")
  const { WorkspaceID } = await import("../../schema/src/workspace-id")
  const { SessionID } = await import("../../schema/src/session-id")
  const { Project } = await import("../../schema/src/project")
  const { SessionTable } = await import("@orchestra/core/session/sql")
  const { it } = await import("../../core/test/lib/effect")
  const { makeOperatorTransport } = await import("../src/operator-transport")
  const targetFrom = (data: unknown) => Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }))(data).target

  it.live("generated Effect connect getTarget bindings and existing mutations use default owning auth", () => Effect.gen(function* () {
    const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client/effect"))
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const transport = yield* makeOperatorTransport(f.handler, f.operators)
    const client = yield* Orchestra.make({ baseUrl: "http://orchestra.local", headers: transport.headers }).pipe(
      Effect.provide(Layer.fresh(FetchHttpClient.layer)), Effect.provideService(FetchHttpClient.Fetch, transport.fetch))
    const location = { directory: AbsolutePath.make(f.directory), workspace: WorkspaceID.make("wrk_sdk-effect") }
    const sessionID = SessionID.create()
    yield* f.database.db.insert(SessionTable).values({ id: sessionID, project_id: Project.ID.global,
      directory: location.directory, workspace_id: location.workspace, slug: "sdk", title: "sdk", version: "test", agent: "sdk-current" }).run()
    const input = { location, "idempotency-key": "effect-connect", provider: "slack" as const,
      key: CapabilitySetupHttpFixture.keys[0], label: "Effect account" }
    const connected = yield* client.connections.connect(input)
    const connection = Schema.decodeUnknownSync(CapabilitySetup.Result)(connected.data).connection
    expect(connected.reused).toBe(false)
    expect(yield* client.connections.connect(input)).toEqual({ ...connected, reused: true })
    expect(f.seen).toHaveLength(1)
    expect((yield* client.connections.list({ location })).items).toEqual([
      { connection, label: input.label, state: "active", credential: "present" },
    ])
    expect((yield* client.connections.get({ location, connectionID: connection.id })).label).toBe(input.label)
    const target = targetFrom((yield* client.connections.createTarget({ location, "idempotency-key": "effect-target",
      connection, input: { environment: "test", resource: {} } })).data)
    expect(yield* client.connections.getTarget({ location, targetID: target.id })).toEqual({ target })
    expect((yield* client.connections.targets({ location, connectionID: connection.id })).items).toEqual([{ target }])
    yield* client.connections.bind({ location, "idempotency-key": "effect-bind", target, input: { sessionID, actions: ["read"] } })
    expect(yield* client.connections.bindings({ location, targetID: target.id, limit: 1 })).toEqual({
      items: [{ sessionID, actions: ["read"] }], coverage: "current-actor",
    })
    yield* client.connections.unbind({ location, "idempotency-key": "effect-unbind", target, sessionID })
    expect((yield* client.connections.bindings({ location, targetID: target.id })).items).toEqual([])
    const current = targetFrom((yield* client.connections.retargetTarget({ location, "idempotency-key": "effect-retarget",
      target, input: { environment: "next", resource: {} } })).data)
    yield* client.connections.removeTarget({ location, "idempotency-key": "effect-remove", target: current })
    yield* client.connections.disconnect({ location, "idempotency-key": "effect-disconnect", connection })
    const anonymous = yield* Orchestra.make({ baseUrl: "http://orchestra.local" }).pipe(
      Effect.provide(Layer.fresh(FetchHttpClient.layer)), Effect.provideService(FetchHttpClient.Fetch, transport.fetch))
    expect(yield* anonymous.connections.connect({ ...input, "idempotency-key": "anonymous" }).pipe(Effect.flip))
      .toMatchObject({ _tag: "UnauthorizedError", message: "Authentication required" })
    yield* Effect.forEach([anonymous.connections.getTarget({ location, targetID: target.id }).pipe(Effect.asVoid),
      anonymous.connections.bindings({ location, targetID: target.id }).pipe(Effect.asVoid)], (request) => request.pipe(Effect.flip,
        Effect.tap((error) => Effect.sync(() => expect(error).toMatchObject({ _tag: "UnauthorizedError",
          message: "Authentication required" })))))
    console.log(`SETUP_PROOF ${markers[0]}`)
  }), 30_000)

  it.live("generated Promise connect getTarget bindings and existing mutations use default owning auth", () => Effect.gen(function* () {
    const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client"))
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const transport = yield* makeOperatorTransport(f.handler, f.operators)
    const client = Orchestra.make({ baseUrl: "http://orchestra.local", fetch: transport.fetch, headers: transport.headers })
    const location = { directory: AbsolutePath.make(f.directory), workspace: WorkspaceID.make("wrk_sdk-promise") }
    const sessionID = SessionID.create()
    yield* f.database.db.insert(SessionTable).values({ id: sessionID, project_id: Project.ID.global,
      directory: location.directory, workspace_id: location.workspace, slug: "sdk", title: "sdk", version: "test", agent: "sdk-current" }).run()
    const input = { location, "idempotency-key": "promise-connect", provider: "discord" as const,
      key: CapabilitySetupHttpFixture.keys[2], label: "Promise account" }
    const connected = yield* Effect.promise(() => client.connections.connect(input))
    const connection = Schema.decodeUnknownSync(CapabilitySetup.Result)(connected.data).connection
    expect(connected.reused).toBe(false)
    expect(yield* Effect.promise(() => client.connections.connect(input))).toEqual({ ...connected, reused: true })
    expect(f.seen).toHaveLength(1)
    expect((yield* Effect.promise(() => client.connections.list({ location }))).items).toEqual([
      { connection, label: input.label, state: "active", credential: "present" },
    ])
    expect((yield* Effect.promise(() => client.connections.get({ location, connectionID: connection.id }))).label).toBe(input.label)
    const target = targetFrom((yield* Effect.promise(() => client.connections.createTarget({ location,
      "idempotency-key": "promise-target", connection, input: { environment: "test", resource: {} } }))).data)
    expect(yield* Effect.promise(() => client.connections.getTarget({ location, targetID: target.id }))).toEqual({ target })
    expect((yield* Effect.promise(() => client.connections.targets({ location, connectionID: connection.id }))).items).toEqual([{ target }])
    yield* Effect.promise(() => client.connections.bind({ location, "idempotency-key": "promise-bind", target,
      input: { sessionID, actions: ["read"] } }))
    expect(yield* Effect.promise(() => client.connections.bindings({ location, targetID: target.id, limit: 1 }))).toEqual({
      items: [{ sessionID, actions: ["read"] }], coverage: "current-actor",
    })
    yield* Effect.promise(() => client.connections.unbind({ location, "idempotency-key": "promise-unbind", target, sessionID }))
    expect((yield* Effect.promise(() => client.connections.bindings({ location, targetID: target.id }))).items).toEqual([])
    const current = targetFrom((yield* Effect.promise(() => client.connections.retargetTarget({ location,
      "idempotency-key": "promise-retarget", target, input: { environment: "next", resource: {} } }))).data)
    yield* Effect.promise(() => client.connections.removeTarget({ location, "idempotency-key": "promise-remove", target: current }))
    yield* Effect.promise(() => client.connections.disconnect({ location, "idempotency-key": "promise-disconnect", connection }))
    const anonymous = Orchestra.make({ baseUrl: "http://orchestra.local", fetch: transport.fetch })
    expect(yield* Effect.tryPromise({ try: () => anonymous.connections.connect({ ...input, "idempotency-key": "anonymous" }),
      catch: (error) => error }).pipe(Effect.flip)).toEqual({ _tag: "UnauthorizedError", message: "Authentication required" })
    yield* Effect.forEach([() => anonymous.connections.getTarget({ location, targetID: target.id }),
      () => anonymous.connections.bindings({ location, targetID: target.id })], (request) => Effect.tryPromise({
        try: async () => { await request() }, catch: (error) => error,
      }).pipe(Effect.flip, Effect.tap((error) => Effect.sync(() => expect(error).toEqual({
        _tag: "UnauthorizedError", message: "Authentication required",
      })))))
    console.log(`SETUP_PROOF ${markers[1]}`)
  }), 30_000)

  it.live("generated Effect implicit-local setup replay and all new methods reach native handlers", () => Effect.gen(function* () {
    const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client/effect"))
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const transport = yield* makeOperatorTransport(f.handler, f.operators)
    const client = yield* Orchestra.make({ baseUrl: "http://orchestra.local", headers: transport.headers }).pipe(
      Effect.provide(Layer.fresh(FetchHttpClient.layer)), Effect.provideService(FetchHttpClient.Fetch, transport.fetch))
    const location = { directory: AbsolutePath.make(f.directory) }
    const input = { location, "idempotency-key": "effect-local", provider: "slack" as const,
      key: CapabilitySetupHttpFixture.keys[0], label: "Implicit Effect account" }
    const receipt = yield* client.connections.connect(input)
    const connection = Schema.decodeUnknownSync(CapabilitySetup.Result)(receipt.data).connection
    f.state.mode = "http"
    expect(yield* client.connections.connect(input)).toEqual({ ...receipt, reused: true })
    expect(f.seen).toHaveLength(1)
    const target = targetFrom((yield* client.connections.createTarget({ location, "idempotency-key": "effect-local-target",
      connection, input: { environment: "test", resource: null } })).data)
    expect(yield* client.connections.getTarget({ location, targetID: target.id })).toEqual({ target })
    expect(yield* client.connections.bindings({ location, targetID: target.id })).toEqual({ items: [], coverage: "current-actor" })
    console.log(`SETUP_PROOF ${markers[2]}`)
  }), 30_000)

  it.live("generated Promise implicit-local setup replay and all new methods reach native handlers", () => Effect.gen(function* () {
    const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client"))
    const fixture = yield* Effect.promise(() => CapabilitySetupHttpFixture.make())
    const f = yield* fixture
    const transport = yield* makeOperatorTransport(f.handler, f.operators)
    const client = Orchestra.make({ baseUrl: "http://orchestra.local", fetch: transport.fetch, headers: transport.headers })
    const location = { directory: AbsolutePath.make(f.directory) }
    const input = { location, "idempotency-key": "promise-local", provider: "discord" as const,
      key: CapabilitySetupHttpFixture.keys[2], label: "Implicit Promise account" }
    const receipt = yield* Effect.promise(() => client.connections.connect(input))
    const connection = Schema.decodeUnknownSync(CapabilitySetup.Result)(receipt.data).connection
    f.state.mode = "http"
    expect(yield* Effect.promise(() => client.connections.connect(input))).toEqual({ ...receipt, reused: true })
    expect(f.seen).toHaveLength(1)
    const target = targetFrom((yield* Effect.promise(() => client.connections.createTarget({ location,
      "idempotency-key": "promise-local-target", connection, input: { environment: "test", resource: null } }))).data)
    expect(yield* Effect.promise(() => client.connections.getTarget({ location, targetID: target.id }))).toEqual({ target })
    expect(yield* Effect.promise(() => client.connections.bindings({ location, targetID: target.id })))
      .toEqual({ items: [], coverage: "current-actor" })
    console.log(`SETUP_PROOF ${markers[3]}`)
  }), 30_000)
}
