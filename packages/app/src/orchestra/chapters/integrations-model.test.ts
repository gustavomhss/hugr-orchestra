import { expect, test } from "bun:test"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { Response, binding, browser, connection, deferred, fixture, json, reads, recordSnapshots, target } from "./integrations-model.fixture"

test("reads actual live/current-actor pages; next controls send exact advancing cursors", async () => {
  const cursor = "x".repeat(32)
  const f = fixture((request) => {
    const url = new URL(request.url)
    const more = url.searchParams.has("after")
    if (url.pathname.endsWith("/bindings")) return json({ items: [binding(more ? 2 : 1)],
      coverage: "current-actor", ...(more ? {} : { after: binding().sessionID }) })
    if (url.pathname.endsWith("/targets")) return json({ items: [target(more ? 2 : 1)],
      coverage: "live", ...(more ? {} : { after: cursor }) })
    return json({ items: [connection(more ? 2 : 1)], coverage: "live",
      ...(more ? {} : { after: connection().connection.id }) })
  })
  await f.model.load()
  expect(f.requests).toHaveLength(1)
  await f.model.load(true)
  expect(f.model.state.connections).toHaveLength(2)
  await f.model.select(f.model.state.connections[0])
  await f.model.moreTargets()
  expect(f.model.state.targets).toHaveLength(2)
  await f.model.selectTarget(f.model.state.targets[0])
  await f.model.moreBindings()
  expect(f.model.state.bindings).toEqual([binding(), binding(2)])
  expect(f.requests.filter((row) => new URL(row.url).searchParams.has("after")).map((row) =>
    new URL(row.url).searchParams.get("after"))).toEqual([connection().connection.id, cursor, binding().sessionID])
  const count = f.requests.length
  await f.model.load(true); await f.model.moreTargets(); await f.model.moreBindings()
  expect(f.requests).toHaveLength(count)
  expect(f.model.state.status).toBe("ready")
})

test("late list and target replies cannot populate changed account, even transport ignores abort", async () => {
  const oldList = deferred<Response>()
  const oldTargets = deferred<Response>()
  const listStarted = deferred<void>()
  const targetStarted = deferred<void>()
  const f = fixture((request) => {
    const path = new URL(request.url).pathname
    if (path.endsWith("/connections")) { listStarted.resolve(); return oldList.promise }
    if (path.includes(connection().connection.id)) { targetStarted.resolve(); return oldTargets.promise }
    return json({ items: [target(2, 2)], coverage: "live" })
  }, true)
  const load = f.model.load()
  await listStarted.promise
  const first = f.model.select(connection())
  await targetStarted.promise
  await f.model.select(connection(2))
  oldList.resolve(json({ items: [connection()], coverage: "live" }))
  oldTargets.resolve(json({ items: [target()], coverage: "live" }))
  await Promise.all([load, first])
  expect(f.model.state.connectionID).toBe(connection(2).connection.id)
  expect(f.model.state.connections).toEqual([])
  expect(f.model.state.targets).toEqual([target(2, 2)])
  expect(f.signals.slice(0, 2).every((signal) => signal.aborted)).toBe(true)
})

test("late bindings, including rejected reply, cannot poison new target", async () => {
  const held = deferred<Response>()
  const started = deferred<void>()
  const f = fixture((request) => {
    const path = new URL(request.url).pathname
    if (path.includes(target().target.id)) { started.resolve(); return held.promise }
    if (path.endsWith("/bindings")) return json({ items: [binding(2)], coverage: "current-actor" })
    return reads(request)
  }, true)
  await f.model.load(); await f.model.select(connection())
  const first = f.model.selectTarget(target())
  await started.promise
  await f.model.selectTarget(target(2))
  held.resolve(json({ _tag: "ForbiddenError", message: "private provider text" }, 403))
  await first
  expect(f.model.state.targetID).toBe(target(2).target.id)
  expect(f.model.state.bindings).toEqual([binding(2)])
  expect(f.model.state.failure).toBeUndefined()
})

test("owner disposal aborts reads and discards late results; disposed model sends nothing", async () => {
  const held = deferred<Response>()
  const started = deferred<void>()
  const snapshots = recordSnapshots("private-secret", "private-intent")
  let first = true
  const f = fixture((request) => {
    if (first) { first = false; return reads(request) }
    started.resolve(); return held.promise
  }, true, snapshots.observe)
  if (!(await browser(f, import.meta.path, "owner disposal aborts reads"))) return
  await f.model.load()
  const load = f.model.load()
  await started.promise
  snapshots.verify()
  f.dispose()
  expect(f.signals[1].aborted).toBe(true)
  held.resolve(json({ items: [connection()], coverage: "live" }))
  await load
  await f.model.load(); await f.model.select(connection()); await f.model.connect({ provider: "slack", key: "private-secret" })
  expect(f.requests).toHaveLength(2)
  expect(f.model.state.connections).toEqual([])
  expect(f.model.state.receipt).toBeUndefined()
  snapshots.verify()
})

test("lost HTTP ACK retries only explicitly, same key and detached setup input; changed intent gets new key", async () => {
  const receipts = new Map<string, typeof CapabilityManagement.Receipt.Type>()
  let commits = 0
  const snapshots = recordSnapshots("private-secret", "edited-secret", "private-intent")
  const f = fixture((request) => {
    if (request.method === "GET") return reads(request)
    const key = request.headers.get("idempotency-key")!
    const previous = receipts.get(key)
    if (previous) return json({ ...previous, reused: true })
    commits++
    const receipt = CapabilityManagement.Receipt.make({ requestID: `receipt-${commits}`, reused: false,
      data: CapabilitySetup.Result.make({ connection: connection().connection, verification: "verified" }) })
    receipts.set(key, receipt)
    // The write committed, but HTTP delivered only a truncated acknowledgement.
    return new Response('{"requestID":', { headers: { "content-type": "application/json" } })
  }, false, snapshots.observe)
  if (!(await browser(f, import.meta.path, "lost HTTP ACK retries only explicitly"))) return
  const input: CapabilitySetup.Input = { provider: "slack", key: "private-secret", label: "first" }
  const pending = f.model.connect(input)
  Object.assign(input, { key: "edited-secret", label: "edited" })
  snapshots.verify()
  await pending
  expect(f.model.state.failure).toBe("unknown")
  expect(f.requests.filter((row) => row.method === "POST")).toHaveLength(1)
  expect(JSON.stringify(f.model.state)).not.toContain("private-secret")
  expect(JSON.stringify(f.model.state)).not.toContain("private-intent")
  await f.model.retry()
  expect(commits).toBe(1)
  expect(f.model.state.receipt?.reused).toBe(true)
  const posts = f.requests.filter((row) => row.method === "POST")
  expect(posts.map((row) => row.key)).toEqual(["private-intent-1", "private-intent-1"])
  expect(posts.map((row) => row.body)).toEqual([
    { provider: "slack", key: "private-secret", label: "first" }, { provider: "slack", key: "private-secret", label: "first" },
  ])
  await f.model.retry()
  expect(f.requests.filter((row) => row.method === "POST")).toHaveLength(2)
  await f.model.connect(input)
  expect(f.requests.filter((row) => row.method === "POST")[2].key).toBe("private-intent-2")
  expect(f.requests.filter((row) => row.method === "POST")).toHaveLength(3)
  expect(f.requests.filter((row) => row.method === "POST")[2].body).toEqual({ provider: "slack", key: "edited-secret", label: "edited" })
  expect(commits).toBe(2)
  snapshots.verify()
})

test("busy blocks selection and duplicate mutations; snapshot refs/resource survive edits and explicit retry", async () => {
  const held = deferred<Response>()
  const started = deferred<void>()
  let posts = 0
  const snapshots = recordSnapshots("must not enter receipt", "private-intent")
  const f = fixture((request) => {
    if (request.method === "GET") return reads(request)
    if (++posts === 1) { started.resolve(); return held.promise }
    return json({ requestID: "target-receipt", reused: true,
      data: { target: { ...target(2).target, environment: "original" } } })
  }, false, snapshots.observe)
  if (!(await browser(f, import.meta.path, "busy blocks selection and duplicate mutations"))) return
  await f.model.load()
  const selected = structuredClone(connection())
  await f.model.select(selected)
  const input = { environment: "original", resource: { room: "one" } }
  const first = f.model.createTarget(input)
  Object.assign(selected.connection, { generation: 99 })
  input.resource.room = "edited"
  await started.promise
  await f.model.select(connection(2)); await f.model.disconnect(); await f.model.retry()
  expect(f.model.state.busy).toBe(true)
  expect(f.model.state.connectionID).toBe(connection().connection.id)
  expect(posts).toBe(1)
  held.resolve(json({ requestID: "bad", reused: false, data: { secret: "must not enter receipt" } }))
  await first
  expect(f.model.state.failure).toBe("unknown")
  expect(f.model.state.receipt).toBeUndefined()
  await f.model.retry()
  const writes = f.requests.filter((row) => row.method === "POST")
  expect(f.model.state.receipt?.reused).toBe(true)
  expect(writes[0].body).toEqual({ connection: connection().connection,
    input: { environment: "original", resource: { room: "one" } } })
  expect(writes[1]).toMatchObject({ key: writes[0].key, body: writes[0].body })
  snapshots.verify()
})

test("successful receipt retained when post-commit read fails; retry cannot redrive closed intent", async () => {
  const f = fixture((request) => request.method === "GET" ? json({ broken: true }) :
    json({ requestID: "known-commit", reused: false, data: { connection: connection().connection, verification: "verified" } }))
  await f.model.connect({ provider: "slack", key: "private-secret" })
  expect(f.model.state.status).toBe("error")
  expect(f.model.state.failure).toBe("request")
  expect(f.model.state.receipt?.requestID).toBe("known-commit")
  await f.model.retry()
  expect(f.requests.filter((row) => row.method === "POST")).toHaveLength(1)
})

test("socket lost after actual POST admission is unknown, never automatic retry", async () => {
  let admitted = 0
  const f = fixture(() => {
    admitted++
    f.stop()
    return json({ requestID: "unacknowledged", reused: false, data: null })
  })
  await f.model.connect({ provider: "slack", key: "private-secret" })
  expect(admitted).toBe(1)
  expect(f.requests).toHaveLength(1)
  expect(f.model.state.failure).toBe("unknown")
  expect(f.model.state.receipt).toBeUndefined()
})

test("cancelled post-commit refresh cannot overwrite newly selected account", async () => {
  const held = deferred<Response>()
  const started = deferred<void>()
  const f = fixture((request) => {
    const path = new URL(request.url).pathname
    if (request.method === "POST") return json({ requestID: "committed", reused: false, data: null })
    if (path.endsWith("/connections")) { started.resolve(); return held.promise }
    if (path.includes(connection(2).connection.id)) return json({ items: [target(2, 2)], coverage: "live" })
    return reads(request)
  }, true)
  await f.model.select(connection())
  const mutation = f.model.disconnect()
  await started.promise
  f.model.cancel()
  await f.model.select(connection(2))
  held.resolve(json({ items: [connection()], coverage: "live" }))
  await mutation
  expect(f.model.state.connectionID).toBe(connection(2).connection.id)
  expect(f.model.state.targets).toEqual([target(2, 2)])
  expect(f.model.state.status).toBe("ready")
})

test("binding and local removal mutations send parsed exact target/session refs, no actor input", async () => {
  const f = fixture((request) => request.method === "GET" ? reads(request) :
    json({ requestID: "local-operation", reused: false, data: null }))
  await f.model.load(); await f.model.select(f.model.state.connections[0]); await f.model.selectTarget(f.model.state.targets[0])
  const actions = ["send"]
  const put = f.model.bind({ sessionID: binding().sessionID, actions })
  actions.push("edited")
  await put
  await f.model.unbind(binding().sessionID)
  await f.model.removeTarget()
  await f.model.disconnect()
  const posts = f.requests.filter((row) => row.method === "POST")
  expect(posts.map((row) => row.body)).toEqual([
    { target: target().target, input: { sessionID: binding().sessionID, actions: ["send"] } },
    { target: target().target, sessionID: binding().sessionID },
    { target: target().target }, { connection: connection().connection },
  ])
  expect(posts.map((row) => row.key)).toEqual(["private-intent-1", "private-intent-2", "private-intent-3", "private-intent-4"])
  expect(f.model.state.receipt?.data).toBeNull()
  f.model.dispose()
  expect(f.model.state.receipt).toBeUndefined()
  expect(f.model.state.connections).toEqual([])
})

test("retarget uses detached selected generation/resource; refresh adopts actual server generation", async () => {
  let committed = false
  const acknowledged = { target: { ...target().target, generation: 1, environment: "new" } }
  const updated = { target: { ...target().target, generation: 2, environment: "new" } }
  const snapshots = recordSnapshots("private-intent")
  const f = fixture((request) => {
    if (request.method === "POST") {
      committed = true
      return json({ requestID: "retarget-receipt", reused: false,
        data: new URL(request.url).pathname.endsWith("/retarget") ? acknowledged : null })
    }
    if (new URL(request.url).pathname.endsWith(target().target.id) && committed) return json(updated)
    if (new URL(request.url).pathname.endsWith("/targets") && committed) return json({ items: [acknowledged], coverage: "live" })
    return reads(request)
  }, false, snapshots.observe)
  if (!(await browser(f, import.meta.path, "retarget uses detached selected generation/resource"))) return
  await f.model.load(); await f.model.select(f.model.state.connections[0])
  const selected = structuredClone(target())
  await f.model.selectTarget(selected)
  Object.assign(selected.target, { generation: 99 })
  const input = { environment: "new", resource: { room: ["original"] } }
  const pending = f.model.retargetTarget(input)
  input.resource.room.push("edited")
  await pending
  expect(f.model.state.receipt?.data).toEqual(acknowledged)
  expect(f.requests.find((row) => row.method === "POST")?.body).toEqual({ target: target().target,
    input: { environment: "new", resource: { room: ["original"] } } })
  expect(f.model.state.targets).toEqual([updated])
  expect(f.requests.filter((row) => row.method === "GET" && new URL(row.url).pathname.endsWith(target().target.id))).toHaveLength(1)
  await f.model.unbind(binding().sessionID)
  expect(f.requests.filter((row) => row.method === "POST")[1].body).toEqual({ target: updated.target, sessionID: binding().sessionID })
  await f.model.removeTarget()
  expect(f.requests.filter((row) => row.method === "POST")[2].body).toEqual({ target: updated.target })
  snapshots.verify()
})

test("invalid call-time schema inputs never POST; reflected private keys never become public receipts", async () => {
  const f = fixture(() => json({ requestID: "private-secret", reused: false,
    data: { connection: connection().connection, verification: "verified" } }))
  await f.model.connect({ provider: "slack", key: "" })
  expect(f.model.state.failure).toBe("invalid")
  expect(f.requests).toHaveLength(0)
  await f.model.connect({ provider: "slack", key: "private-secret" })
  expect(f.model.state.failure).toBe("unknown")
  expect(f.model.state.receipt).toBeUndefined()
  expect(JSON.stringify(f.model.state)).not.toContain("private-secret")
})

test("cancel/dispose abort mutation, release retry and ignore late successful receipt", async () => {
  for (const end of ["cancel", "dispose"] as const) {
    const held = deferred<Response>()
    const started = deferred<void>()
    const f = fixture(() => { started.resolve(); return held.promise }, true)
    const pending = f.model.connect({ provider: "slack", key: "private-secret" })
    await started.promise
    f.model[end]()
    expect(f.signals[0].aborted).toBe(true)
    held.resolve(json({ requestID: "late", reused: false,
      data: { connection: connection().connection, verification: "verified" } }))
    await pending; await f.model.retry()
    expect(f.model.state.receipt).toBeUndefined()
    expect(f.model.state.busy).toBe(false)
    expect(f.requests).toHaveLength(1)
  }
})

test("paging retains at most 512 rows across account/target/binding pages; malformed page is error", async () => {
  let page = 0
  let broken = false
  const f = fixture((request) => {
    if (broken) return json({ items: [], coverage: "all" })
    if (new URL(request.url).pathname.endsWith("/connections")) {
      const items = Array.from({ length: 32 }, (_, index) => connection(++page * 32 + index))
      return json({ items, after: items[31].connection.id, coverage: "live" })
    }
    return reads(request)
  })
  await f.model.load()
  for (let index = 0; index < 20; index++) await f.model.load(true)
  expect(f.model.state.connections).toHaveLength(512)
  await f.model.select(connection()); await f.model.selectTarget(target())
  expect(f.model.state.targets).toHaveLength(1)
  expect(f.model.state.bindings).toHaveLength(1)
  expect(f.model.state.connections.length + f.model.state.targets.length + f.model.state.bindings.length).toBe(512)
  broken = true
  await f.model.load(true)
  expect(f.model.state.status).toBe("error")
  expect(f.model.state.failure).toBe("request")
  expect(f.model.state.connections.length + f.model.state.targets.length + f.model.state.bindings.length).toBe(512)
})

test.each(["null", "a"])("short private value %s does not match JSON syntax or incidental provider word", async (key) => {
  const f = fixture((request) => request.method === "GET" ? reads(request) : json({ requestID: "receipt", reused: false,
    data: new URL(request.url).pathname.endsWith("/connect") ? { connection: connection().connection, verification: "verified" } : null }),
  false, undefined, () => key)
  await f.model.connect({ provider: "slack", key: "a" })
  expect(f.model.state.failure).toBeUndefined()
  expect(f.model.state.receipt?.requestID).toBe("receipt")
  await f.model.select(connection()); await f.model.selectTarget(target())
  await f.model.removeTarget()
  expect(f.model.state.failure).toBeUndefined()
  expect(f.model.state.receipt?.data).toBeNull()
})

test.each(["full-private-secret", "a"])("exact private string leaf %s is rejected without public receipt", async (key) => {
  const f = fixture(() => json({ requestID: key, reused: false,
    data: { connection: connection().connection, verification: "verified" } }))
  await f.model.connect({ provider: "slack", key })
  expect(f.model.state.failure).toBe("unknown")
  expect(f.model.state.receipt).toBeUndefined()
})

test("long secret substring rejected in schema-valid string leaf; matching property name is harmless", async () => {
  const leaking = fixture(() => json({ requestID: "prefix-private-secret-suffix", reused: false,
    data: { connection: connection().connection, verification: "verified" } }))
  await leaking.model.connect({ provider: "slack", key: "private-secret" })
  expect(leaking.model.state.failure).toBe("unknown")
  expect(leaking.model.state.receipt).toBeUndefined()
  expect(JSON.stringify(leaking.model.state)).not.toContain("private-secret")
  const harmless = fixture((request) => request.method === "GET" ? reads(request) : json({ requestID: "receipt", reused: false,
    data: { connection: connection().connection, verification: "verified" } }))
  await harmless.model.connect({ provider: "slack", key: "verification" })
  expect(harmless.model.state.failure).toBeUndefined()
  expect(harmless.model.state.receipt?.data).toEqual({ connection: connection().connection, verification: "verified" })
})
