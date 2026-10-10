import { expect } from "bun:test"
import { CapabilityBindingTable, CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Capability } from "@orchestra/schema/capability"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { Effect, Schema } from "effect"
import { it } from "../../core/test/lib/effect"
import { CapabilityConnectionsFixture } from "./capability-connections-fixture"

const base = "/api/capability/connections"
const json = <S extends Schema.Top>(response: Response, schema: S) => Effect.gen(function* () {
  expect(response.status).toBe(200)
  const text = yield* Effect.promise(() => response.text())
  expect(text).not.toContain(CapabilityConnectionsFixture.secret)
  return yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(schema)))(text)
})
const denied = (response: Response, status = 403) => Effect.gen(function* () {
  expect(response.status).toBe(status)
  expect(yield* Effect.promise(() => response.json())).toEqual(status === 401
    ? { _tag: "UnauthorizedError", message: "Authentication required" }
    : { _tag: "ForbiddenError", message: "Request denied" })
})

it.live("HTTP authentication precedes real Location; Basic config remains independent", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionsFixture.make()
  yield* denied(yield* f.request(base, { directory: "/invalid/private/location" }), 401)
  expect(f.entered.location).toBe(0)
  const auth = yield* f.issue()
  yield* json(yield* f.request(base, { auth }), CapabilityManagement.ConnectionPage)
  expect(f.entered.location).toBe(1)
  const basic = yield* CapabilityConnectionsFixture.make({ password: "secret:colon" })
  yield* denied(yield* basic.request(base, { auth: yield* basic.issue() }), 401)
  yield* denied(yield* basic.request(base, { query: { auth_token: Buffer.from("http-basic:secret:colon").toString("base64") } }), 401)
  expect(basic.entered.location).toBe(0)
  yield* json(yield* basic.request(base, { auth: `Basic ${Buffer.from("http-basic:secret:colon").toString("base64")}` }),
    CapabilityManagement.ConnectionPage)
}), 20_000)

it.live("HTTP list uses resolved placement; ID reads and writes use stored owner and grants", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionsFixture.make()
  const auth = yield* f.issue({ placements: [f.placement], actions: ["*"] })
  const page = yield* json(yield* f.request(base, { auth }), CapabilityManagement.ConnectionPage)
  expect(page.items.map((item) => item.connection.id)).toEqual([f.parent.id])
  expect(page.items[0]).toEqual({ connection: f.parent, state: "active", credential: "present" })
  yield* denied(yield* f.request(base, { auth, directory: f.foreign.location.directory }))
  yield* json(yield* f.request(`${base}/${f.parent.id}`, { auth, directory: f.foreign.location.directory }), CapabilityManagement.Connection)
  yield* Effect.forEach([f.foreignParent.id, Capability.ConnectionID.create()], (id) =>
    f.request(`${base}/${id}`, { auth }).pipe(Effect.flatMap((response) => denied(response))))
  yield* denied(yield* f.request(`${base}/disconnect`, { auth, key: "foreign", payload: { connection: f.foreignParent } }))
  yield* denied(yield* f.request(`${base}/${f.foreignParent.id}/targets`, { auth }))
  yield* denied(yield* f.request("/api/capability/targets/remove", { auth, key: "foreign-target",
    payload: { target: yield* f.target(f.foreignParent) } }))
  const resource = yield* f.issue({ placements: [f.placement], actions: ["*"], resources: [{ kind: "connection", id: f.parent.id }] })
  yield* denied(yield* f.request(base, { auth: resource }))
  yield* json(yield* f.request(`${base}/${f.parent.id}`, { auth: resource }), CapabilityManagement.Connection)
  yield* denied(yield* f.request(`${base}/${f.foreignParent.id}`, { auth: resource }))
  yield* json(yield* f.request(`${base}/disconnect`, { auth, directory: f.foreign.location.directory,
    key: "owner-disconnect", payload: { connection: f.parent } }), CapabilityManagement.Receipt)
}), 20_000)

it.live("HTTP opaque target pages survive requests, filter scoped rows and reject changed grants", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionsFixture.make()
  const children = [f.child, yield* f.target(f.parent), yield* f.target(f.parent)].sort((left, right) => left.id.localeCompare(right.id))
  const auth = yield* f.issue()
  const path = `${base}/${f.parent.id}/targets`
  const first = yield* json(yield* f.request(path, { auth, query: { limit: "1" } }), CapabilityManagement.TargetPage)
  expect(first.items).toEqual([{ target: children[0] }])
  expect(first.coverage).toBe("live")
  expect(first.after).toMatch(/^[A-Za-z0-9_-]{32,2048}$/)
  if (!first.after) return yield* Effect.die("Expected target continuation")
  expect(children.some((child) => first.after?.includes(child.id))).toBe(false)
  const next = yield* json(yield* f.request(path, { auth, query: { limit: "2", after: first.after } }), CapabilityManagement.TargetPage)
  expect(next.items).toEqual(children.slice(1).map((target) => ({ target })))
  const scoped = yield* f.issue({ placements: [f.placement], actions: ["connection.targets"], resources: [
    { kind: "connection", id: f.parent.id }, { kind: "target", id: children[2].id },
  ] })
  yield* denied(yield* f.request(path, { auth: scoped, query: { after: first.after } }))
  const filtered = yield* json(yield* f.request(path, { auth: scoped, query: { limit: "1" } }), CapabilityManagement.TargetPage)
  expect(filtered.items).toEqual([])
  expect(filtered.after).toBeDefined()
  if (!filtered.after) return yield* Effect.die("Expected filtered continuation")
  expect(children.some((child) => filtered.after?.includes(child.id))).toBe(false)
  const middle = yield* json(yield* f.request(path, { auth: scoped,
    query: { limit: "1", after: filtered.after } }), CapabilityManagement.TargetPage)
  expect(middle.items).toEqual([])
  if (!middle.after) return yield* Effect.die("Expected continuation to authorized tail")
  const tail = yield* json(yield* f.request(path, { auth: scoped,
    query: { limit: "1", after: middle.after } }), CapabilityManagement.TargetPage)
  expect(tail).toEqual({ items: [{ target: children[2] }], coverage: "live" })
  const tampered = first.after.slice(0, -2) + (first.after.endsWith("AA") ? "BB" : "AA")
  yield* denied(yield* f.request(path, { auth, query: { after: tampered } }))
}), 20_000)

it.live("HTTP mutations require header, preserve exact replay, generate fresh IDs and JSON null receipts", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionsFixture.make()
  const auth = yield* f.issue()
  const create = { connection: f.parent, input: { environment: "test", resource: { secret: CapabilityConnectionsFixture.secret } } }
  expect((yield* f.request("/api/capability/targets", { auth, payload: create })).status).toBe(400)
  const first = yield* json(yield* f.request("/api/capability/targets", { auth, key: "create", payload: create,
    headers: { "x-request-id": "caller-request", "x-principal": "caller-principal" } }), CapabilityManagement.Receipt)
  expect(first.reused).toBe(false)
  const ref = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }), { onExcessProperty: "error" })(first.data).target
  expect(first.data).toEqual({ target: ref })
  const retry = yield* json(yield* f.request("/api/capability/targets", { auth, key: "create", payload: create }), CapabilityManagement.Receipt)
  expect(retry).toEqual({ ...first, reused: true })
  expect(ref.id).not.toBe(f.child.id)
  const retarget = { target: ref, input: { environment: "next", resource: {} } }
  const moved = yield* json(yield* f.request("/api/capability/targets/retarget", { auth, key: "retarget", payload: retarget }), CapabilityManagement.Receipt)
  expect(moved.reused).toBe(false)
  expect(yield* json(yield* f.request("/api/capability/targets/retarget", { auth, key: "retarget", payload: retarget }),
    CapabilityManagement.Receipt)).toEqual({ ...moved, reused: true })
  const current = Schema.decodeUnknownSync(Schema.Struct({ target: Capability.TargetRef }), { onExcessProperty: "error" })(moved.data).target
  expect(moved.data).toEqual({ target: current })
  expect(current.generation).toBe(ref.generation + 1)
  const remove = { target: current }
  const removed = yield* json(yield* f.request("/api/capability/targets/remove", { auth, key: "remove", payload: remove }), CapabilityManagement.Receipt)
  expect(removed.reused).toBe(false)
  expect(removed.data).toBeNull()
  expect(yield* json(yield* f.request("/api/capability/targets/remove", { auth, key: "remove", payload: remove }),
    CapabilityManagement.Receipt)).toEqual({ ...removed, reused: true })
  yield* denied(yield* f.request("/api/capability/targets/remove", { auth, key: "fresh-remove", payload: remove }))
  const disconnected = yield* json(yield* f.request(`${base}/disconnect`, { auth, key: "disconnect", payload: { connection: f.parent } }), CapabilityManagement.Receipt)
  expect(disconnected.reused).toBe(false)
  expect(disconnected.data).toBeNull()
  expect(yield* json(yield* f.request(`${base}/disconnect`, { auth, key: "disconnect", payload: { connection: f.parent } }),
    CapabilityManagement.Receipt)).toEqual({ ...disconnected, reused: true })
  expect(new Set([first.requestID, moved.requestID, removed.requestID, disconnected.requestID]).size).toBe(4)
  const rows = yield* f.database.db.select().from(CapabilityRequestTable).all()
  expect(rows.map((row) => row.id).sort()).toEqual([first.requestID, moved.requestID, removed.requestID, disconnected.requestID].sort())
  rows.forEach((row) => expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/))
  yield* denied(yield* f.request("/api/capability/targets", { auth, key: "create", payload: { ...create, input: { environment: "changed", resource: {} } } }))
}), 20_000)

it.live("HTTP binding derives actual Session actor; strict DTO rejects public agentID", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionsFixture.make()
  const auth = yield* f.issue()
  const payload = { target: f.child, input: { sessionID: f.sessionID, actions: ["read"] } }
  expect((yield* f.request("/api/capability/bindings", { auth, key: "attack", payload: {
    ...payload, input: { ...payload.input, agentID: "attacker" },
  } })).status).toBe(400)
  expect((yield* f.request("/api/capability/bindings", { auth, key: "attack-root", payload: {
    ...payload, agentID: "attacker",
  } })).status).toBe(400)
  const bound = yield* json(yield* f.request("/api/capability/bindings", { auth, key: "bind", payload }), CapabilityManagement.Receipt)
  expect(bound.reused).toBe(false)
  expect(bound.data).toBeNull()
  expect(yield* json(yield* f.request("/api/capability/bindings", { auth, key: "bind", payload }),
    CapabilityManagement.Receipt)).toEqual({ ...bound, reused: true })
  expect(yield* f.database.db.select().from(CapabilityBindingTable).all()).toMatchObject([
    { target_id: f.child.id, session_id: f.sessionID, agent_id: "persisted-http-actor", actions: ["read"] },
  ])
  const unbound = yield* json(yield* f.request("/api/capability/bindings/remove", { auth, key: "unbind",
    payload: { target: f.child, sessionID: f.sessionID } }), CapabilityManagement.Receipt)
  expect(unbound.reused).toBe(false)
  expect(unbound.data).toBeNull()
  expect(yield* json(yield* f.request("/api/capability/bindings/remove", { auth, key: "unbind",
    payload: { target: f.child, sessionID: f.sessionID } }), CapabilityManagement.Receipt)).toEqual({ ...unbound, reused: true })
  expect(yield* f.database.db.select().from(CapabilityBindingTable).all()).toEqual([])
}), 20_000)
