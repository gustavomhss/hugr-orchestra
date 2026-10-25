import { expect, test } from "bun:test"
import type { Model } from "./integrations-contract"
import { Response, binding, browser, connection, deferred, fixture, json, reads, recordSnapshots, target } from "./integrations-model.fixture"

test("browser initial read failure exposes read-only recovery and retries exactly one GET", async () => {
  let failed = true
  const snapshots = recordSnapshots("private-server-secret", "private-intent")
  const f = fixture((request) => failed ? json({ _tag: "ForbiddenError", message: "private-server-secret" }, 403)
    : reads(request), false, snapshots.observe)
  if (!(await browser(f, import.meta.path, "browser initial read failure"))) return
  expect(f.model.state.retryable).toBe(false)
  expect(f.model.state.readRetryable).toBe(false)
  await f.model.load()
  expect(f.model.state.failure).toBe("authorization")
  expect(f.model.state.retryable).toBe(false)
  expect(f.model.state.readRetryable).toBe(true)
  await f.model.retry()
  expect(f.requests).toHaveLength(1)
  failed = false
  const retry = f.model.retryRead()
  expect(f.model.state.busy).toBe(true)
  expect(f.model.state.readRetryable).toBe(false)
  await retry
  expect(f.requests.map((row) => row.method)).toEqual(["GET", "GET"])
  expect(f.model.state.status).toBe("ready")
  expect(f.model.state.connections).toEqual([connection(), connection(2)])
  expect(f.model.state.retryable).toBe(false)
  expect(f.model.state.readRetryable).toBe(false)
  await f.model.retryRead()
  expect(f.requests).toHaveLength(2)
  expect(Object.values(f.model.state).some((value) => typeof value === "function")).toBe(false)
  snapshots.verify()
})

test("browser unauthorized mutation retains exact private intent until explicit retry, cancellation, or invalid edit", async () => {
  const snapshots = recordSnapshots("private-secret", "private-intent")
  const f = fixture(() => json({ _tag: "UnauthorizedError", message: "private-secret private-intent-1" }, 401), false, snapshots.observe)
  if (!(await browser(f, import.meta.path, "browser unauthorized mutation retains"))) return
  const pending = f.model.connect({ provider: "slack", key: "private-secret" })
  expect(f.model.state.retryable).toBe(true)
  expect(f.model.state.readRetryable).toBe(false)
  await pending
  expect(f.model.state.failure).toBe("authorization")
  expect(f.model.state.retryable).toBe(true)
  expect(f.requests).toHaveLength(1)
  await f.model.retryRead()
  expect(f.requests).toHaveLength(1)
  await f.model.retry()
  expect(f.requests.map((row) => row.key)).toEqual(["private-intent-1", "private-intent-1"])
  expect(f.requests.map((row) => row.body)).toEqual([{ provider: "slack", key: "private-secret" }, { provider: "slack", key: "private-secret" }])
  f.model.cancel()
  expect(f.model.state.retryable).toBe(false)
  expect(f.model.state.readRetryable).toBe(false)
  await f.model.retry(); await f.model.retryRead()
  expect(f.requests).toHaveLength(2)
  await f.model.connect({ provider: "slack", key: "private-secret" })
  expect(f.model.state.retryable).toBe(true)
  await f.model.connect({ provider: "slack", key: "" })
  expect(f.model.state.failure).toBe("invalid")
  expect(f.model.state.retryable).toBe(false)
  expect(f.model.state.readRetryable).toBe(false)
  await f.model.retry()
  expect(f.requests).toHaveLength(3)
  f.dispose()
  expect(f.model.state.retryable).toBe(false)
  expect(f.model.state.readRetryable).toBe(false)
  snapshots.verify()
})

test("failed read retry remains available but never repeats automatically", async () => {
  const f = fixture(() => json({ _tag: "ForbiddenError", message: "unavailable" }, 403))
  await f.model.load()
  await f.model.retryRead()
  expect(f.requests.map((row) => row.method)).toEqual(["GET", "GET"])
  expect(f.model.state.readRetryable).toBe(true)
  expect(f.model.state.retryable).toBe(false)
  expect(f.model.state.busy).toBe(false)
  await f.model.retryRead()
  expect(f.requests).toHaveLength(3)
})

test.each(["select", "query", "cancel", "dispose"] as const)("failed read recovery invalidated by %s cannot be replayed", async (action) => {
  let failed = true
  const f = fixture((request) => failed ? json({ _tag: "ForbiddenError", message: "unavailable" }, 403)
    : new URL(request.url).pathname.includes(connection(2).connection.id)
      ? json({ items: [target(2, 2)], coverage: "live" }) : reads(request))
  await f.model.load()
  expect(f.model.state.readRetryable).toBe(true)
  failed = false
  if (action === "select") await f.model.select(connection(2))
  if (action === "query") await f.model.load()
  if (action === "cancel") f.model.cancel()
  if (action === "dispose") f.dispose()
  expect(f.model.state.readRetryable).toBe(false)
  const before = f.requests.length
  await f.model.retryRead()
  expect(f.requests).toHaveLength(before)
})

test("browser read-recovery publication is fenced before synchronous error observer changes owner", async () => {
  let active: Model | undefined
  let next: Promise<void> | undefined
  let fired = false
  const snapshots = recordSnapshots("private-server-secret")
  const f = fixture((request) => new URL(request.url).pathname.endsWith("/connections")
    ? json({ _tag: "ForbiddenError", message: "private-server-secret" }, 403)
    : json({ items: [target(2, 2)], coverage: "live" }), false, (state) => {
    snapshots.observe(state)
    if (!state.readRetryable || !active || fired) return
    fired = true
    active.cancel()
    next = active.select(connection(2))
  })
  active = f.model
  if (!(await browser(f, import.meta.path, "browser read-recovery publication"))) return
  await f.model.load(); await next
  expect(fired).toBe(true)
  expect(f.model.state.connectionID).toBe(connection(2).connection.id)
  expect(f.model.state.status).toBe("ready")
  expect(f.model.state.readRetryable).toBe(false)
  const before = f.requests.length
  await f.model.retryRead()
  expect(f.requests).toHaveLength(before)
  snapshots.verify()
})

test("browser disposal during explicit read recovery aborts it and prevents late recovery results", async () => {
  let attempt = 0
  const held = deferred<Response>()
  const started = deferred<void>()
  const f = fixture(() => {
    if (++attempt === 1) return json({ _tag: "ForbiddenError", message: "unavailable" }, 403)
    started.resolve()
    return held.promise
  }, true)
  if (!(await browser(f, import.meta.path, "browser disposal during explicit read recovery"))) return
  await f.model.load()
  const pending = f.model.retryRead()
  await started.promise
  f.dispose()
  expect(f.signals[1].aborted).toBe(true)
  expect(f.model.state.readRetryable).toBe(false)
  expect(f.model.state.retryable).toBe(false)
  held.resolve(json({ items: [connection()], coverage: "live" }))
  await pending; await f.model.retryRead()
  expect(f.requests).toHaveLength(2)
  expect(f.model.state.connections).toEqual([])
})

test("browser two live roots keep recovery callbacks receipts and late results isolated", async () => {
  for (const end of ["cancel", "dispose"] as const) {
    const held = deferred<Response>()
    const started = deferred<void>()
    const observedA: string[] = []
    const observedB: string[] = []
    const root = (id: number, name: string, observed: string[], blocked: boolean) => {
      let posted = false
      let attempts = 0
      return fixture((request) => {
        const path = new URL(request.url).pathname
        if (request.method === "POST") { posted = true; return json({ requestID: `receipt-${name}`, reused: false, data: null }) }
        if (path.endsWith(target(id, id).target.id)) {
          if (posted && ++attempts === 1) return json({ _tag: "ForbiddenError", message: `private-${name}-read-error` }, 403)
          if (posted && blocked) { started.resolve(); return held.promise }
          return json({ target: { ...target(id, id).target, generation: posted ? 2 : 0 } })
        }
        if (path.endsWith("/bindings")) return json({ items: [], coverage: "current-actor" })
        if (path.endsWith("/targets")) return json({ items: [target(id, id)], coverage: "live" })
        if (path.endsWith(connection(id).connection.id)) return json(connection(id))
        return json({ items: [connection(id)], coverage: "live" })
      }, true, (state) => observed.push(JSON.stringify(state)), () => `private-intent-${name}`)
    }
    const a = root(1, "a", observedA, false)
    const b = root(2, "b", observedB, true)
    if (!(await browser(a, import.meta.path, "browser two live roots keep recovery"))) { b.dispose(); b.stop(); return }
    expect(await browser(b, import.meta.path, "browser two live roots keep recovery")).toBe(true)
    expect(a.model.state).not.toBe(b.model.state)
    await a.model.load(); await a.model.select(a.model.state.connections[0]); await a.model.selectTarget(a.model.state.targets[0])
    expect(observedA.length).toBeGreaterThan(1)
    expect(observedB).toHaveLength(1)
    const aReady = observedA.length
    await b.model.load(); await b.model.select(b.model.state.connections[0]); await b.model.selectTarget(b.model.state.targets[0])
    expect(observedB.length).toBeGreaterThan(1)
    expect(observedA).toHaveLength(aReady)
    await a.model.unbind(binding().sessionID); await b.model.unbind(binding(2).sessionID)
    expect(a.model.state).toMatchObject({ connectionID: connection().connection.id, targetID: target().target.id,
      status: "error", failure: "authorization", retryable: false, readRetryable: true, busy: false })
    expect(b.model.state).toMatchObject({ connectionID: connection(2).connection.id, targetID: target(2, 2).target.id,
      status: "error", failure: "authorization", retryable: false, readRetryable: true, busy: false })
    expect(a.model.state.receipt).toEqual({ requestID: "receipt-a", reused: false, data: null })
    expect(b.model.state.receipt).toEqual({ requestID: "receipt-b", reused: false, data: null })
    expect(new URL(a.requests[0].url).origin).not.toBe(new URL(b.requests[0].url).origin)
    const beforeA = a.requests.length
    const beforeB = b.requests.length
    expect(beforeA).toBe(8)
    expect(beforeB).toBe(8)
    const aFailure = JSON.stringify(a.model.state)
    const recoverA = () => a.model.retryRead()
    const recoverB = () => b.model.retryRead()
    const pendingB = recoverB()
    await started.promise
    expect(JSON.stringify(a.model.state)).toBe(aFailure)
    const bPending = JSON.stringify(b.model.state)
    const bRecorded = observedB.length
    await recoverA()
    expect(a.model.state).toMatchObject({ status: "ready", connectionID: connection().connection.id, targetID: target().target.id,
      retryable: false, readRetryable: false, busy: false, receipt: { requestID: "receipt-a" } })
    expect(a.model.state.targets).toEqual([{ target: { ...target().target, generation: 2 } }])
    expect(JSON.stringify(b.model.state)).toBe(bPending)
    expect(observedB).toHaveLength(bRecorded)
    expect(a.requests.slice(beforeA).map((request) => new URL(request.url).pathname)).toEqual([
      `/api/capability/targets/${target().target.id}`, `/api/capability/targets/${target().target.id}/bindings`,
    ])
    expect(b.requests.slice(beforeB).map((request) => new URL(request.url).pathname)).toEqual([
      `/api/capability/targets/${target(2, 2).target.id}`,
    ])
    const signal = b.signals.at(-1)
    expect(signal?.aborted).toBe(false)
    const recoveredA = JSON.stringify(a.model.state)
    const recoveredObservedA = observedA.length
    if (end === "cancel") b.model.cancel()
    if (end === "dispose") b.dispose()
    expect(signal?.aborted).toBe(true)
    expect(b.model.state).toMatchObject({ retryable: false, readRetryable: false, busy: false })
    expect(b.model.state.receipt).toBeUndefined()
    const abandonedB = JSON.stringify(b.model.state)
    const abandonedObservedB = observedB.length
    held.resolve(json({ target: { ...target(2, 2).target, generation: 2 } }))
    await pendingB; await a.model.retryRead(); await b.model.retryRead()
    expect(JSON.stringify(a.model.state)).toBe(recoveredA)
    expect(observedA).toHaveLength(recoveredObservedA)
    expect(JSON.stringify(b.model.state)).toBe(abandonedB)
    expect(observedB).toHaveLength(abandonedObservedB)
    expect(a.requests).toHaveLength(beforeA + 2)
    expect(b.requests).toHaveLength(beforeB + 1)
    expect(a.requests.filter((request) => request.method === "POST")).toEqual([expect.objectContaining({ key: "private-intent-a",
      body: { target: target().target, sessionID: binding().sessionID } })])
    expect(b.requests.filter((request) => request.method === "POST")).toEqual([expect.objectContaining({ key: "private-intent-b",
      body: { target: target(2, 2).target, sessionID: binding(2).sessionID } })])
    if (end === "cancel") {
      expect(b.model.state.connectionID).toBe(connection(2).connection.id)
      expect(b.model.state.targetID).toBe(target(2, 2).target.id)
      expect(b.model.state.targets).toEqual([target(2, 2)])
    }
    if (end === "dispose") {
      expect(b.model.state.connectionID).toBeUndefined()
      expect(b.model.state.targetID).toBeUndefined()
      expect(b.model.state.targets).toEqual([])
    }
    expect([...observedA, ...observedB].every((snapshot) => !snapshot.includes("private-intent") && !snapshot.includes("read-error"))).toBe(true)
    a.dispose(); a.stop(); b.dispose(); b.stop()
  }
}, 60000)
