import { expect, test } from "bun:test"
import { binding, browser, connection, fixture, json, reads, recordSnapshots, target } from "./integrations-model.fixture"

test.each(["list", "get", "targets", "getTarget", "bindings"] as const)("browser known ACK recovers failed %s metadata chain without any repeated POST", async (stage) => {
  let posted = false
  let failed = true
  const currentConnection = { ...connection(), connection: { ...connection().connection, generation: 2 } }
  const currentTarget = { target: { ...target().target, generation: 2 } }
  const snapshots = recordSnapshots("private-server-secret", "private-intent")
  const paths = { list: "/api/capability/connections", get: `/api/capability/connections/${connection().connection.id}`,
    targets: `/api/capability/connections/${connection().connection.id}/targets`, getTarget: `/api/capability/targets/${target().target.id}`,
    bindings: `/api/capability/targets/${target().target.id}/bindings` }
  const f = fixture((request) => {
    const path = new URL(request.url).pathname
    if (request.method === "POST") { posted = true; return json({ requestID: "known-ack", reused: false, data: null }) }
    if (posted && failed && path === paths[stage]) return json({ _tag: "ForbiddenError", message: "private-server-secret" }, 403)
    if (posted && path === paths.get) return json(currentConnection)
    if (posted && path === paths.getTarget) return json(currentTarget)
    return reads(request)
  }, false, snapshots.observe)
  if (!(await browser(f, import.meta.path, `browser known ACK recovers failed ${stage} metadata`))) return
  await f.model.load(); await f.model.select(f.model.state.connections[0]); await f.model.selectTarget(f.model.state.targets[0])
  await f.model.unbind(binding().sessionID)
  expect(f.model.state.receipt?.requestID).toBe("known-ack")
  const receipt = JSON.stringify(f.model.state.receipt)
  expect(f.model.state.failure).toBe("authorization")
  expect(f.model.state.retryable).toBe(false)
  expect(f.model.state.readRetryable).toBe(true)
  const before = f.requests.length
  await f.model.retry()
  expect(f.requests).toHaveLength(before)
  failed = false
  await f.model.retryRead()
  expect(f.model.state.status).toBe("ready")
  expect(f.model.state.readRetryable).toBe(false)
  expect(f.model.state.retryable).toBe(false)
  expect(JSON.stringify(f.model.state.receipt)).toBe(receipt)
  const order = [paths.list, paths.get, paths.targets, paths.getTarget, paths.bindings]
  expect(f.requests.slice(before).map((row) => new URL(row.url).pathname)).toEqual(order.slice(order.indexOf(paths[stage])))
  expect(f.requests.filter((row) => row.method === "POST")).toHaveLength(1)
  expect(f.model.state.connections.find((row) => row.connection.id === currentConnection.connection.id)).toEqual(currentConnection)
  expect(f.model.state.targets.find((row) => row.target.id === currentTarget.target.id)).toEqual(currentTarget)
  const complete = f.requests.length
  await f.model.retryRead(); await f.model.retry()
  expect(f.requests).toHaveLength(complete)
  snapshots.verify()
})
