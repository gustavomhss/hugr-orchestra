import { expect, test } from "bun:test"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { Schema } from "effect"
import { binding, browser, connection, fixture, json, reads, target } from "./integrations-model.fixture"

test("direct refresh retains selected account/target beyond first 32 rows and clears only acknowledged deletion", async () => {
  let account = connection(40)
  let selected = target(40, 40)
  let exists = true
  const f = fixture(async (request) => {
    const path = new URL(request.url).pathname
    if (request.method === "GET") {
      if (path.endsWith(account.connection.id)) return json(account)
      if (path.endsWith(selected.target.id)) return exists ? json(selected) : json({ error: "missing" }, 404)
      if (path.endsWith("/bindings")) return json({ items: [binding()], coverage: "current-actor" })
      if (path.endsWith("/targets")) return json({ items: Array.from({ length: 32 }, (_, index) => target(index + 1, 40)),
        coverage: "live", after: "x".repeat(32) })
      return json({ items: Array.from({ length: 32 }, (_, index) => connection(index + 1)),
        coverage: "live", after: connection(32).connection.id })
    }
    if (path.endsWith("/retarget")) {
      const input = Schema.decodeUnknownSync(CapabilityManagement.RetargetInput)(await request.json())
      selected = { target: { ...selected.target, generation: 1, environment: input.input.environment } }
      return json({ requestID: "retarget", reused: false, data: selected })
    }
    if (path.endsWith("/targets/remove")) exists = false
    if (path.endsWith("/disconnect")) account = { ...account, state: "disconnected",
      connection: { ...account.connection, generation: 1 } }
    return json({ requestID: "committed", reused: false, data: null })
  })
  await f.model.load(); await f.model.select(connection(40)); await f.model.selectTarget(target(40, 40))
  await f.model.bind({ sessionID: binding().sessionID, actions: ["send"] })
  expect(f.model.state.failure).toBeUndefined()
  expect(f.model.state.connectionID).toBe(account.connection.id)
  expect(f.model.state.targetID).toBe(selected.target.id)
  expect(f.model.state.connections.some((row) => row.connection.id === account.connection.id)).toBe(true)
  expect(f.model.state.targets.some((row) => row.target.id === selected.target.id)).toBe(true)
  await f.model.retargetTarget({ environment: "updated", resource: {} })
  expect(f.model.state.targets.find((row) => row.target.id === selected.target.id)?.target).toEqual(selected.target)
  await f.model.removeTarget()
  expect(f.model.state.targetID).toBeUndefined()
  await f.model.disconnect()
  expect(f.model.state.connectionID).toBe(account.connection.id)
  expect(f.model.state.connections.find((row) => row.connection.id === account.connection.id)).toEqual(account)
  const paths = f.requests.filter((row) => row.method === "GET").map((row) => new URL(row.url))
  expect(paths.filter((url) => url.pathname.endsWith(selected.target.id))).toHaveLength(2)
  expect(paths.filter((url) => url.pathname.endsWith(account.connection.id))).toHaveLength(4)
  expect(paths.every((url) => !url.searchParams.has("after"))).toBe(true)
})

test.each(["connection", "target"] as const)("committed receipt survives direct %s refresh 403; selection is not inferred absent", async (kind) => {
  let committed = false
  const f = fixture((request) => {
    const path = new URL(request.url).pathname
    if (request.method === "POST") { committed = true; return json({ requestID: "known-ack", reused: false, data: null }) }
    if (path.endsWith(connection(40).connection.id)) return committed && kind === "connection"
      ? json({ _tag: "ForbiddenError", message: "unavailable" }, 403) : json(connection(40))
    if (path.endsWith(target(40, 40).target.id)) return committed && kind === "target"
      ? json({ _tag: "ForbiddenError", message: "unavailable" }, 403) : json(target(40, 40))
    if (path.endsWith("/bindings")) return json({ items: [], coverage: "current-actor" })
    if (path.endsWith("/targets")) return json({ items: [target(1, 40)], coverage: "live" })
    return json({ items: [connection()], coverage: "live" })
  })
  await f.model.select(connection(40)); await f.model.selectTarget(target(40, 40))
  await f.model.unbind(binding().sessionID)
  expect(f.model.state.receipt?.requestID).toBe("known-ack")
  expect(f.model.state.status).toBe("error")
  expect(f.model.state.failure).toBe("authorization")
  expect(f.model.state.connectionID).toBe(connection(40).connection.id)
  expect(f.model.state.targetID).toBe(target(40, 40).target.id)
  await f.model.retry()
  expect(f.requests.filter((row) => row.method === "POST")).toHaveLength(1)
})

test("full retained target window cannot starve directly refreshed selected account row", async () => {
  const f = fixture((request) => {
    const url = new URL(request.url)
    if (request.method === "POST") return json({ requestID: "ack", reused: false, data: null })
    if (url.pathname.endsWith(connection().connection.id)) return json(connection())
    if (url.pathname.endsWith(target(40).target.id)) return json(target(40))
    if (url.pathname.endsWith("/bindings")) return json({ items: [], coverage: "current-actor" })
    if (url.pathname.endsWith("/targets")) {
      const offset = Number(url.searchParams.get("after") ?? "0")
      return json({ items: Array.from({ length: 32 }, (_, index) => target(offset + index + 1)), coverage: "live",
        after: String(offset + 32).padStart(32, "0") })
    }
    return json({ items: [connection()], coverage: "live" })
  })
  await f.model.load(); await f.model.select(connection())
  for (let index = 1; index < 16; index++) await f.model.moreTargets()
  expect(f.model.state.targets).toHaveLength(511)
  expect(f.model.state.connections).toEqual([connection()])
  await f.model.selectTarget(target(40))
  await f.model.bind({ sessionID: binding().sessionID, actions: ["send"] })
  expect(f.model.state.status).toBe("ready")
  expect(f.model.state.connections).toEqual([connection()])
  expect(f.model.state.targetID).toBe(target(40).target.id)
  expect(f.model.state.targets.some((row) => row.target.id === target(40).target.id)).toBe(true)
  expect(f.model.state.connections.length + f.model.state.targets.length + f.model.state.bindings.length).toBeLessThanOrEqual(512)
})

test("browser retarget ACK generation one must directly refresh generation two before unbind/remove", async () => {
  let committed = false
  let exists = true
  const acknowledged = { target: { ...target().target, generation: 1, environment: "next" } }
  const current = { target: { ...target().target, generation: 2, environment: "next" } }
  const snapshots: string[] = []
  const f = fixture((request) => {
    const path = new URL(request.url).pathname
    if (request.method === "POST") {
      if (path.endsWith("/retarget")) { committed = true; return json({ requestID: "retarget-ack", reused: false, data: acknowledged }) }
      if (path.endsWith("/targets/remove")) exists = false
      return json({ requestID: "ack", reused: false, data: null })
    }
    if (path.endsWith(target().target.id)) return json(committed ? current : target())
    if (path.endsWith("/targets")) return json({ items: exists ? [target()] : [], coverage: "live" })
    return reads(request)
  }, false, (state) => snapshots.push(JSON.stringify(state)))
  if (!(await browser(f, import.meta.path, "browser retarget ACK generation one"))) return
  await f.model.load(); await f.model.select(f.model.state.connections[0]); await f.model.selectTarget(f.model.state.targets[0])
  const before = f.requests.length
  await f.model.retargetTarget({ environment: "next", resource: {} })
  expect(f.model.state.receipt?.data).toEqual(acknowledged)
  expect(f.model.state.targets.find((row) => row.target.id === current.target.id)).toEqual(current)
  expect(f.requests.slice(before).filter((row) => row.method === "GET").map((row) => new URL(row.url).pathname)).toEqual([
    "/api/capability/connections", `/api/capability/connections/${connection().connection.id}`,
    `/api/capability/connections/${connection().connection.id}/targets`, `/api/capability/targets/${target().target.id}`,
    `/api/capability/targets/${target().target.id}/bindings`,
  ])
  await f.model.unbind(binding().sessionID)
  await f.model.removeTarget()
  const posts = f.requests.filter((row) => row.method === "POST")
  expect(posts[1].body).toEqual({ target: current.target, sessionID: binding().sessionID })
  expect(posts[2].body).toEqual({ target: current.target })
  expect(snapshots.length).toBeGreaterThan(1)
})
