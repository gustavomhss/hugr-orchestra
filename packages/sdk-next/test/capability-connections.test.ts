import { expect } from "bun:test"
import { Orchestra } from "@orchestra/client/effect"
import { CapabilityBindingTable } from "@orchestra/core/capability/sql"
import { Capability } from "../../schema/src/capability"
import { Effect, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { it } from "../../core/test/lib/effect"
import { CapabilityConnectionsFixture } from "../../server/test/capability-connections-fixture"
import { makeOperatorTransport } from "../src/operator-transport"

// Aggregate registration belongs to Lead. Exercise exact production group, middleware,
// handler and SQL Store through the generated client and owning embedded transport.
it.live("embedded generated connections client executes all nine methods against real router and SQL", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionsFixture.make()
  const transport = yield* makeOperatorTransport(f.handler, f.operators)
  const client = yield* Orchestra.make({ baseUrl: "http://orchestra.local", headers: transport.headers }).pipe(
    Effect.provide(FetchHttpClient.layer), Effect.provideService(FetchHttpClient.Fetch, transport.fetch),
  )
  const location = f.placement.location
  const page = yield* client.connections.list({ location, limit: 1 })
  expect(page.items).toEqual([{ connection: f.parent, state: "active", credential: "present" }])
  expect(yield* client.connections.get({ connectionID: f.parent.id, location })).toEqual(page.items[0])
  expect((yield* client.connections.targets({ connectionID: f.parent.id, location })).items).toEqual([{ target: f.child }])
  const create = { location, "idempotency-key": "sdk-create", connection: f.parent,
    input: { environment: "test", resource: { secret: CapabilityConnectionsFixture.secret } } }
  const created = yield* client.connections.createTarget(create)
  expect(yield* client.connections.createTarget(create)).toEqual({ ...created, reused: true })
  const target = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }))(created.data).target
  const binding = { location, "idempotency-key": "sdk-bind", target,
    input: { sessionID: f.sessionID, actions: ["read"] } }
  expect((yield* client.connections.bind(binding)).data).toBeNull()
  expect(yield* f.database.db.select().from(CapabilityBindingTable).all()).toMatchObject([
    { target_id: target.id, session_id: f.sessionID, agent_id: "persisted-http-actor" },
  ])
  expect((yield* client.connections.unbind({ location, "idempotency-key": "sdk-unbind", target, sessionID: f.sessionID })).data).toBeNull()
  expect(yield* f.database.db.select().from(CapabilityBindingTable).all()).toEqual([])
  const retarget = { location, "idempotency-key": "sdk-retarget", target, input: { environment: "next", resource: {} } }
  const moved = yield* client.connections.retargetTarget(retarget)
  expect(yield* client.connections.retargetTarget(retarget)).toEqual({ ...moved, reused: true })
  const current = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }))(moved.data).target
  const remove = { location, "idempotency-key": "sdk-remove", target: current }
  const removed = yield* client.connections.removeTarget(remove)
  expect(removed.data).toBeNull()
  expect(yield* client.connections.removeTarget(remove)).toEqual({ ...removed, reused: true })
  const disconnect = { location, "idempotency-key": "sdk-disconnect", connection: f.parent }
  const disconnected = yield* client.connections.disconnect(disconnect)
  expect(disconnected.data).toBeNull()
  expect(yield* client.connections.disconnect(disconnect)).toEqual({ ...disconnected, reused: true })
  expect(new Set([created.requestID, moved.requestID, removed.requestID, disconnected.requestID]).size).toBe(4)
  expect(JSON.stringify([page, created, moved, removed, disconnected])).not.toContain(CapabilityConnectionsFixture.secret)
}), 20_000)

it.live("embedded generated client preserves opaque pagination across requests and redacted scoped failures", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionsFixture.make()
  const second = yield* f.target(f.parent)
  const transport = yield* makeOperatorTransport(f.handler, f.operators)
  const client = yield* Orchestra.make({ baseUrl: "http://orchestra.local", headers: transport.headers }).pipe(
    Effect.provide(FetchHttpClient.layer), Effect.provideService(FetchHttpClient.Fetch, transport.fetch),
  )
  const location = f.placement.location
  const input = { location, connectionID: f.parent.id, limit: 1 }
  const first = yield* client.connections.targets(input)
  expect(first.after).toBeDefined()
  const next = yield* client.connections.targets({ ...input, after: first.after })
  expect([...first.items, ...next.items].map((item) => item.target.id).sort()).toEqual([f.child.id, second.id].sort())
  const credential = yield* f.operators.issue({ origin: "sdk", scope: { placements: [f.placement], actions: ["*"] } })
  const scoped = yield* Orchestra.make({ baseUrl: "http://orchestra.local", headers: { Authorization: `Bearer ${credential.bearer}` } }).pipe(
    Effect.provide(FetchHttpClient.layer), Effect.provideService(FetchHttpClient.Fetch, transport.fetch),
  )
  const denied = yield* scoped.connections.get({ location, connectionID: f.foreignParent.id }).pipe(Effect.flip)
  expect(denied).toMatchObject({ _tag: "ForbiddenError", message: "Request denied" })
  const wrong = yield* scoped.connections.targets({ ...input, after: first.after }).pipe(Effect.flip)
  expect(wrong).toMatchObject({ _tag: "ForbiddenError", message: "Request denied" })
  const unauthenticated = yield* Orchestra.make({ baseUrl: "http://orchestra.local" }).pipe(
    Effect.provide(FetchHttpClient.layer), Effect.provideService(FetchHttpClient.Fetch, transport.fetch),
  )
  expect(yield* unauthenticated.connections.list({ location }).pipe(Effect.flip)).toMatchObject({
    _tag: "UnauthorizedError", message: "Authentication required",
  })
}), 20_000)

it.live("generated Promise client executes nine HTTP methods through owning SDK transport", () => Effect.gen(function* () {
  const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client"))
  const f = yield* CapabilityConnectionsFixture.make()
  const transport = yield* makeOperatorTransport(f.handler, f.operators)
  const client = Orchestra.make({ baseUrl: "http://orchestra.local", fetch: transport.fetch, headers: transport.headers })
  const location = f.placement.location
  const page = yield* Effect.promise(() => client.connections.list({ location, limit: 1 }))
  expect(page.items).toEqual([{ connection: f.parent, state: "active", credential: "present" }])
  expect(yield* Effect.promise(() => client.connections.get({ connectionID: f.parent.id, location }))).toEqual(page.items[0])
  const restricted = Orchestra.make({ baseUrl: "http://orchestra.local", fetch: transport.fetch,
    headers: { Authorization: yield* f.issue({ placements: [f.placement], actions: ["*"] }) } })
  expect(yield* Effect.tryPromise({ try: () => restricted.connections.get({ location, connectionID: f.foreignParent.id }),
    catch: (error) => error }).pipe(Effect.flip)).toEqual({ _tag: "ForbiddenError", message: "Request denied" })
  const unauthenticated = Orchestra.make({ baseUrl: "http://orchestra.local", fetch: transport.fetch })
  expect(yield* Effect.tryPromise({ try: () => unauthenticated.connections.list({ location }),
    catch: (error) => error }).pipe(Effect.flip)).toEqual({ _tag: "UnauthorizedError", message: "Authentication required" })
  yield* f.target(f.parent)
  const first = yield* Effect.promise(() => client.connections.targets({ location, connectionID: f.parent.id, limit: 1 }))
  expect(first.after).toBeDefined()
  const next = yield* Effect.promise(() => client.connections.targets({ location, connectionID: f.parent.id, after: first.after, limit: 1 }))
  expect(first.items[0].target.id).not.toBe(next.items[0].target.id)
  expect(yield* Effect.tryPromise({ try: () => restricted.connections.targets({ location, connectionID: f.parent.id,
    after: first.after, limit: 1 }), catch: (error) => error }).pipe(Effect.flip)).toEqual({ _tag: "ForbiddenError", message: "Request denied" })
  const create = { location, "idempotency-key": "promise-create", connection: f.parent, input: { environment: "test", resource: {} } }
  const created = yield* Effect.promise(() => client.connections.createTarget(create))
  expect(yield* Effect.promise(() => client.connections.createTarget(create))).toEqual({ ...created, reused: true })
  const target = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }))(created.data).target
  expect((yield* Effect.promise(() => client.connections.bind({ location, "idempotency-key": "promise-bind", target,
    input: { sessionID: f.sessionID, actions: ["read"] } }))).data).toBeNull()
  expect((yield* Effect.promise(() => client.connections.unbind({ location, "idempotency-key": "promise-unbind", target,
    sessionID: f.sessionID }))).data).toBeNull()
  const retarget = { location, "idempotency-key": "promise-retarget", target, input: { environment: "next", resource: {} } }
  const moved = yield* Effect.promise(() => client.connections.retargetTarget(retarget))
  expect(yield* Effect.promise(() => client.connections.retargetTarget(retarget))).toEqual({ ...moved, reused: true })
  const current = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }))(moved.data).target
  const remove = { location, "idempotency-key": "promise-remove", target: current }
  const removed = yield* Effect.promise(() => client.connections.removeTarget(remove))
  expect(removed.data).toBeNull()
  expect(yield* Effect.promise(() => client.connections.removeTarget(remove))).toEqual({ ...removed, reused: true })
  const disconnect = { location, "idempotency-key": "promise-disconnect", connection: f.parent }
  const disconnected = yield* Effect.promise(() => client.connections.disconnect(disconnect))
  expect(disconnected.data).toBeNull()
  expect(yield* Effect.promise(() => client.connections.disconnect(disconnect))).toEqual({ ...disconnected, reused: true })
}), 20_000)
