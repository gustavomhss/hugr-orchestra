import { expect, test } from "bun:test"
import type { Model } from "./integrations-contract"
import { Response, browser, connection, deferred, fixture, json, reads, recordSnapshots, target } from "./integrations-model.fixture"

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
