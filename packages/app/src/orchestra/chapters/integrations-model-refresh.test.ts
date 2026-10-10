import { expect, test } from "bun:test"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { Schema } from "effect"
import { binding, connection, fixture, json, target } from "./integrations-model.fixture"

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
