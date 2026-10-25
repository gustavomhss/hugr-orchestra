import { expect, test } from "bun:test"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { Schema } from "effect"
import type { Model } from "./integrations-contract"
import { Response, binding, browser, connection, deferred, fixture, json, reads, target } from "./integrations-model.fixture"

test("reactive refetch refs stay detached through bind/unbind/retarget/retry/remove/disconnect", async () => {
  let account = connection()
  let selected = target()
  let exists = true
  let bound = false
  const snapshots: string[] = []
  const receipts = new Map<string, typeof CapabilityManagement.Receipt.Type>()
  const f = fixture(async (request) => {
    const path = new URL(request.url).pathname
    if (request.method === "GET") {
      if (path.endsWith(account.connection.id)) return json(account)
      if (path.endsWith(selected.target.id)) return json(selected)
      if (path.endsWith("/bindings")) return json(CapabilityManagement.BindingPage.make({
        items: bound ? [binding()] : [], coverage: "current-actor",
      }))
      if (path.endsWith("/targets")) return json(CapabilityManagement.TargetPage.make({
        items: exists ? [selected] : [], coverage: "live",
      }))
      return json(CapabilityManagement.ConnectionPage.make({ items: [account], coverage: "live" }))
    }
    const key = request.headers.get("idempotency-key")!
    const previous = receipts.get(key)
    if (previous) return json({ ...previous, reused: true })
    const body: unknown = await request.json()
    const receipt = { requestID: `receipt-${receipts.size + 1}`, reused: false, data: null as Schema.Json }
    if (path === "/api/capability/bindings") {
      Schema.decodeUnknownSync(CapabilityManagement.PutBindingInput)(body)
      bound = true
    }
    if (path.endsWith("/bindings/remove")) {
      Schema.decodeUnknownSync(CapabilityManagement.RemoveBindingInput)(body)
      bound = false
      account = { ...account, connection: { ...account.connection, generation: 2 } }
      selected = { target: { ...selected.target, generation: 1 } }
    }
    if (path.endsWith("/retarget")) {
      const input = Schema.decodeUnknownSync(CapabilityManagement.RetargetInput)(body)
      selected = { target: { ...selected.target, generation: 2, environment: input.input.environment } }
      receipt.data = selected
    }
    if (path.endsWith("/targets/remove")) {
      Schema.decodeUnknownSync(CapabilityManagement.RemoveTargetInput)(body)
      exists = false
    }
    if (path.endsWith("/disconnect")) {
      Schema.decodeUnknownSync(CapabilityManagement.DisconnectInput)(body)
      if (account.state === "disconnected") return json({ _tag: "InvalidRequestError", message: "unavailable" }, 400)
      account = { ...account, state: "disconnected", connection: { ...account.connection, generation: 3 } }
    }
    receipts.set(key, CapabilityManagement.Receipt.make(receipt))
    if (path.endsWith("/retarget")) return new Response('{"requestID":', { headers: { "content-type": "application/json" } })
    return json(receipt)
  }, false, (state) => snapshots.push(JSON.stringify(state)))
  if (!(await browser(f, import.meta.path, "reactive refetch refs stay detached"))) return
  await f.model.load()
  await f.model.select(f.model.state.connections[0])
  await f.model.selectTarget(f.model.state.targets[0])
  await f.model.bind({ sessionID: binding().sessionID, actions: ["send"] })
  expect(f.model.state.failure).toBeUndefined()
  expect(f.model.state.bindings).toEqual([binding()])
  await f.model.unbind(binding().sessionID)
  expect(f.model.state.failure).toBeUndefined()
  expect(f.model.state.bindings).toEqual([])
  expect(f.model.state.connections[0].connection.generation).toBe(2)
  expect(f.model.state.targets[0].target.generation).toBe(1)
  const input = { environment: "next", resource: { room: "original" } }
  const pending = f.model.retargetTarget(input)
  input.resource.room = "edited"
  await pending
  expect(f.model.state.failure).toBe("unknown")
  expect(JSON.stringify(f.model.state)).not.toContain("private-intent")
  await f.model.retry()
  expect(f.model.state.receipt?.reused).toBe(true)
  expect(f.model.state.targets[0].target.generation).toBe(2)
  await f.model.removeTarget()
  expect(f.model.state.failure).toBeUndefined()
  expect(f.model.state.targets).toEqual([])
  expect(f.model.state.targetID).toBeUndefined()
  await f.model.disconnect()
  expect(f.model.state.failure).toBeUndefined()
  expect(f.model.state.connections[0].connection.generation).toBe(3)
  expect(f.model.state.connectionID).toBe(connection().connection.id)
  await f.model.retry()
  await f.model.disconnect()
  expect(f.model.state.failure).toBe("invalid")
  const posts = f.requests.filter((row) => row.method === "POST")
  expect(posts.map((row) => row.key)).toEqual([
    "private-intent-1", "private-intent-2", "private-intent-3", "private-intent-3",
    "private-intent-4", "private-intent-5", "private-intent-6",
  ])
  expect(posts.map((row) => row.body)).toEqual([
    { target: target().target, input: { sessionID: binding().sessionID, actions: ["send"] } },
    { target: target().target, sessionID: binding().sessionID },
    { target: { ...target().target, generation: 1 }, input: { environment: "next", resource: { room: "original" } } },
    { target: { ...target().target, generation: 1 }, input: { environment: "next", resource: { room: "original" } } },
    { target: { ...target().target, generation: 2, environment: "next" } },
    { connection: { ...connection().connection, generation: 2 } },
    { connection: { ...connection().connection, generation: 3 } },
  ])
  expect(snapshots.length).toBeGreaterThan(1)
  expect(snapshots.every((snapshot) => !snapshot.includes("private-intent"))).toBe(true)
})

test.each(["select", "dispose"] as const)("post ACK observer %s invalidates old refresh before any old reads", async (action) => {
  let active: Model | undefined
  let next: Promise<void> | undefined
  let fired = false
  const f = fixture((request) => {
    const path = new URL(request.url).pathname
    if (request.method === "POST") return json({ requestID: "ack", reused: false, data: null })
    if (path.includes(connection(2).connection.id)) return json({ items: [target(2, 2)], coverage: "live" })
    return reads(request)
  }, false, (state) => {
    if (state.receipt?.requestID !== "ack" || !active || fired) return
    fired = true
    if (action === "dispose") { active.dispose(); return }
    active.cancel()
    next = active.select(connection(2))
  })
  active = f.model
  if (!(await browser(f, import.meta.path, `post ACK observer ${action}`))) return
  await f.model.load(); await f.model.select(connection()); await f.model.selectTarget(target())
  const before = f.requests.length
  await f.model.bind({ sessionID: binding().sessionID, actions: ["send"] })
  await next
  expect(fired).toBe(true)
  const after = f.requests.slice(before)
  expect(after.filter((row) => row.method === "GET").map((row) => new URL(row.url).pathname)).toEqual(
    action === "select" ? [`/api/capability/connections/${connection(2).connection.id}/targets`] : [],
  )
  if (action === "dispose") {
    expect(f.model.state.connections).toEqual([])
    expect(f.model.state.receipt).toBeUndefined()
    return
  }
  expect(f.model.state.connectionID).toBe(connection(2).connection.id)
  expect(f.model.state.targets).toEqual([target(2, 2)])
  expect(f.model.state.status).toBe("ready")
  expect(f.model.state.busy).toBe(false)
})

test.each(["connection", "target", "bindings"] as const)("cancel during direct %s refresh cannot populate changed selection or start old next read", async (kind) => {
  let committed = false
  const held = deferred<Response>()
  const started = deferred<void>()
  const f = fixture((request) => {
    const path = new URL(request.url).pathname
    if (request.method === "POST") { committed = true; return json({ requestID: "ack", reused: false, data: null }) }
    if (path.includes(connection(2).connection.id)) return json({ items: [target(2, 2)], coverage: "live" })
    if (committed && (kind === "connection" ? path.endsWith(connection().connection.id)
      : kind === "target" ? path.endsWith(target().target.id) : path.endsWith("/bindings"))) {
      started.resolve()
      return held.promise
    }
    return reads(request)
  }, true)
  await f.model.load(); await f.model.select(connection()); await f.model.selectTarget(target())
  const pending = f.model.bind({ sessionID: binding().sessionID, actions: ["send"] })
  await started.promise
  const before = f.requests.length
  f.model.cancel()
  await f.model.select(connection(2))
  held.resolve(kind === "connection" ? json(connection()) : kind === "target" ? json(target())
    : json({ items: [binding()], coverage: "current-actor" }))
  await pending
  expect(f.model.state.connectionID).toBe(connection(2).connection.id)
  expect(f.model.state.targets).toEqual([target(2, 2)])
  expect(f.model.state.bindings).toEqual([])
  expect(f.model.state.status).toBe("ready")
  expect(f.requests.slice(before).map((row) => new URL(row.url).pathname)).toEqual([
    `/api/capability/connections/${connection(2).connection.id}/targets`,
  ])
})
