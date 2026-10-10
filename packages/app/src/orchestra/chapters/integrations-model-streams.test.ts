import { expect, test } from "bun:test"
import { binding, browser, connection, deferred, fixture, json, reads, streamedJson, target } from "./integrations-model.fixture"

const cases = ["get", "getTarget", "bindings"].flatMap((stage) => ["json", "403", "malformed"].flatMap((reply) =>
  ["select", "dispose"].map((action) => [stage, reply, action] as const)))

test.each(cases)("streamed refresh %s late %s after %s preserves current owner with zero old downstream reads", async (stage, reply, action) => {
  let committed = false
  const headers = deferred<void>()
  let heldSignal: AbortSignal | undefined
  const path = stage === "get" ? `/api/capability/connections/${connection().connection.id}`
    : stage === "getTarget" ? `/api/capability/targets/${target().target.id}`
    : `/api/capability/targets/${target().target.id}/bindings`
  const late = streamedJson(reply === "403" ? { _tag: "ForbiddenError", message: "unavailable" }
    : stage === "get" ? connection() : stage === "getTarget" ? target()
    : { items: [binding()], coverage: "current-actor" }, reply === "403" ? 403 : 200, reply === "malformed")
  const snapshots: string[] = []
  const f = fixture((request) => {
    const current = new URL(request.url).pathname
    if (request.method === "POST") { committed = true; return json({ requestID: "ack", reused: false, data: null }) }
    if (current.includes(connection(2).connection.id)) return json({ items: [target(2, 2)], coverage: "live" })
    if (committed && current === path) return late.response
    return reads(request)
  }, true, (state) => snapshots.push(JSON.stringify(state)), undefined, (current, signal) => {
    if (!committed || current !== path) return
    heldSignal = signal
    headers.resolve()
  })
  if (!(await browser(f, import.meta.path, `streamed refresh ${stage} late ${reply} after ${action}`))) return
  await f.model.load(); await f.model.select(f.model.state.connections[0]); await f.model.selectTarget(f.model.state.targets[0])
  let finished = false
  const pending = f.model.bind({ sessionID: binding().sessionID, actions: ["send"] }).then(() => { finished = true })
  await headers.promise
  expect(finished).toBe(false)
  expect(heldSignal).toBeDefined()
  expect(heldSignal?.aborted).toBe(false)
  const before = f.requests.length
  if (action === "dispose") f.dispose()
  if (action === "select") { f.model.cancel(); await f.model.select(connection(2)) }
  expect(heldSignal?.aborted).toBe(true)
  const current = JSON.stringify(f.model.state)
  const currentFailure = f.model.state.failure
  const recorded = snapshots.length
  late.finish()
  await pending
  expect(finished).toBe(true)
  expect(JSON.stringify(f.model.state)).toBe(current)
  expect(f.model.state.failure).toBe(currentFailure)
  expect(snapshots).toHaveLength(recorded)
  expect(f.requests.slice(before).map((row) => new URL(row.url).pathname)).toEqual(action === "select"
    ? [`/api/capability/connections/${connection(2).connection.id}/targets`] : [])
  expect(snapshots.length).toBeGreaterThan(1)
  if (action === "select") {
    expect(f.model.state.connectionID).toBe(connection(2).connection.id)
    expect(f.model.state.targets).toEqual([target(2, 2)])
    expect(f.model.state.status).toBe("ready")
  }
  if (action === "dispose") {
    expect(f.model.state.receipt).toBeUndefined()
    expect(f.model.state.connections).toEqual([])
    await f.model.load(); await f.model.retry()
    expect(f.requests).toHaveLength(before)
  }
}, 10000)
