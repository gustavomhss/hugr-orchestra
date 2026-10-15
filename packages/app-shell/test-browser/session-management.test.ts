import { expect, test } from "bun:test"
import { createSessionManagementForServer } from "@/utils/session-management"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"
import { createScopedFetch } from "@/utils/scoped-fetch"
import type { SubagentModelPolicy } from "@/components/subagent-model-rules"

const policy: SubagentModelPolicy = { mode: "allowlist", models: [{ providerID: "router", id: "full/slash/model" }] }

test("generated policy transport captures origin credentials and sends exact GET/POST payloads", async () => {
  const server = { url: "https://origin.test", username: "owner", password: "secret" }
  const requests: Request[] = []
  const bodies: unknown[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    const body: unknown = request.body ? await request.json() : undefined
    bodies.push(body)
    if (new URL(request.url).pathname.endsWith("/subagent-models")) {
      return Response.json({ data: body && typeof body === "object" && "policy" in body ? body.policy : { mode: "inherit" } })
    }
    return Response.json({ data: {
      id: "ses_origin", projectID: "project", title: "Origin", location: { directory: "/repo" },
      cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1, updated: 20 }, subagentModels: policy,
    } })
  }, { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({ server, fetch: fetcher, protocol: Promise.resolve("v2") })
  server.url = "https://other.test"
  server.password = "changed"
  expect(await management.getSubagentModels("ses_origin")).toEqual({ mode: "inherit" })
  expect(await management.setSubagentModels("ses_origin", policy)).toEqual(policy)
  expect(await management.setSubagentModels("ses_origin", { mode: "allowlist", models: [] })).toEqual({ mode: "allowlist", models: [] })
  expect(await management.setSubagentModels("ses_origin", { mode: "inherit" })).toEqual({ mode: "inherit" })
  expect(await management.readSubagentModels("ses_origin")).toEqual({ policy, timestamp: 20 })
  expect(requests.map((request) => [request.method, request.url])).toEqual([
    ["GET", "https://origin.test/api/session/ses_origin/subagent-models"],
    ["POST", "https://origin.test/api/session/ses_origin/subagent-models"],
    ["POST", "https://origin.test/api/session/ses_origin/subagent-models"],
    ["POST", "https://origin.test/api/session/ses_origin/subagent-models"],
    ["GET", "https://origin.test/api/session/ses_origin"],
  ])
  expect(bodies).toEqual([undefined, { policy }, { policy: { mode: "allowlist", models: [] } }, { policy: { mode: "inherit" } }, undefined])
  expect(requests.every((request) => request.headers.get("authorization") === `Basic ${btoa("owner:secret")}`)).toBe(true)
})

test.each([404, 405, 501, 401, 403, 500])("generated runtime classifies HTTP %s without masking auth/server failures", async (status) => {
  const fetcher = Object.assign(async () => Response.json({ _tag: "UnauthorizedError" }, { status }), { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({ server: { url: "https://origin.test" }, fetch: fetcher, protocol: Promise.resolve("v2") })
  const error = await management.getSubagentModels("ses_origin").then(() => undefined, (error: unknown) => error)
  expect(error).toBeDefined()
  expect(sessionManagementUnsupported(error)).toBe([404, 405, 501].includes(status))
})

test("typed SessionNotFound404 is a domain failure rather than missing route", async () => {
  const fetcher = Object.assign(async () => Response.json({
    _tag: "SessionNotFoundError", sessionID: "ses_missing", message: "Session not found: ses_missing",
  }, { status: 404 }), { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({ server: { url: "https://origin.test" }, fetch: fetcher, protocol: Promise.resolve("v2") })
  const error = await management.getSubagentModels("ses_missing").then(() => undefined, (error: unknown) => error)
  expect(error).toBeDefined()
  expect(sessionManagementUnsupported(error)).toBe(false)
})

test("session writes serialize; wait observes the latest failed write until an acknowledged retry", async () => {
  const firstStarted = Promise.withResolvers<void>()
  const firstAck = Promise.withResolvers<Response>()
  const retryStarted = Promise.withResolvers<void>()
  const retryAck = Promise.withResolvers<Response>()
  const bodies: unknown[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    bodies.push(await request.json())
    if (bodies.length === 1) {
      firstStarted.resolve()
      return firstAck.promise
    }
    if (bodies.length === 2) return Response.json({ message: "offline" }, { status: 500 })
    retryStarted.resolve()
    return retryAck.promise
  }, { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({ server: { url: "https://origin.test" }, fetch: fetcher, protocol: Promise.resolve("v2") })
  const first = management.setSubagentModels("ses_origin", policy)
  await firstStarted.promise
  const second = management.setSubagentModels("ses_origin", { mode: "allowlist", models: [] })
  const waiting = management.waitSubagentModels("ses_origin").then(() => undefined, (error: unknown) => error)
  expect(bodies).toEqual([{ policy }])
  firstAck.resolve(Response.json({ data: policy }))
  expect(await first).toEqual(policy)
  const failed = await second.then(() => undefined, (error: unknown) => error)
  expect(failed).toBeDefined()
  expect(await waiting).toBe(failed)
  expect(await management.waitSubagentModels("ses_origin").catch((error: unknown) => error)).toBe(failed)
  const retry = management.setSubagentModels("ses_origin", { mode: "allowlist", models: [] })
  await retryStarted.promise
  const state = { dispatched: false }
  const dispatch = management.waitSubagentModels("ses_origin").then(() => { state.dispatched = true })
  expect(state.dispatched).toBe(false)
  retryAck.resolve(Response.json({ data: { mode: "allowlist", models: [] } }))
  await retry
  await dispatch
  expect(state.dispatched).toBe(true)
  expect(bodies).toEqual([{ policy }, { policy: { mode: "allowlist", models: [] } }, { policy: { mode: "allowlist", models: [] } }])
})

test("different sessions and different server contexts do not share barriers", async () => {
  const started = Promise.withResolvers<void>()
  const ack = Promise.withResolvers<Response>()
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    if (request.url.includes("origin.test/api/session/ses_first/")) {
      started.resolve()
      return ack.promise
    }
    return Response.json({ data: { mode: "inherit" } })
  }, { preconnect: fetch.preconnect })
  const origin = createSessionManagementForServer({ server: { url: "https://origin.test" }, fetch: fetcher, protocol: Promise.resolve("v2") })
  const other = createSessionManagementForServer({ server: { url: "https://other.test" }, fetch: fetcher, protocol: Promise.resolve("v2") })
  const pending = origin.setSubagentModels("ses_first", policy)
  await started.promise
  expect(await origin.setSubagentModels("ses_second", { mode: "inherit" })).toEqual({ mode: "inherit" })
  expect(await other.setSubagentModels("ses_first", { mode: "inherit" })).toEqual({ mode: "inherit" })
  await other.waitSubagentModels("ses_first")
  ack.resolve(Response.json({ data: policy }))
  await pending
})

test("server disposal rejects an in-flight ACK and retains the failed dispatcher barrier", async () => {
  const lifetime = new AbortController()
  const started = Promise.withResolvers<void>()
  const ack = Promise.withResolvers<Response>()
  const fetcher = Object.assign(async () => {
    started.resolve()
    return ack.promise
  }, { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({
    server: { url: "https://origin.test" }, fetch: createScopedFetch(fetcher, lifetime.signal), protocol: Promise.resolve("v2"),
  })
  const pending = management.setSubagentModels("ses_origin", policy)
  await started.promise
  lifetime.abort()
  const failed = await pending.then(() => undefined, (error: unknown) => error)
  expect(failed).toBeDefined()
  expect(await management.waitSubagentModels("ses_origin").catch((error: unknown) => error)).toBe(failed)
  ack.resolve(Response.json({ data: policy }))
})

test.each(["get", "read", "post"])("generated %s rejects a stalled 200 JSON body on lifetime abort", async (operation) => {
  const lifetime = new AbortController()
  const reading = Promise.withResolvers<void>()
  const body = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>()
  const state = { cancelled: false }
  const requests: Request[] = []
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      body.resolve(controller)
    },
    pull() {
      reading.resolve()
    },
    cancel() {
      state.cancelled = true
    },
  }, { highWaterMark: 0 }), { status: 200, headers: { "content-type": "application/json" } })
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push(new Request(input, init))
    return response
  }, { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({
    server: { url: "https://origin.test" }, fetch: createScopedFetch(fetcher, lifetime.signal),
    protocol: Promise.resolve("v2"), signal: lifetime.signal,
  })
  const pending = (operation === "get"
    ? management.getSubagentModels("ses_origin")
    : operation === "read"
      ? management.readSubagentModels("ses_origin")
      : management.setSubagentModels("ses_origin", policy)).catch((error: unknown) => error)
  const waiting = operation === "post"
    ? management.waitSubagentModels("ses_origin").catch((error: unknown) => error)
    : undefined
  // No prefetch: pull proves the real generated decoder has started reading the body.
  await reading.promise
  expect(response.status).toBe(200)
  expect(response.bodyUsed).toBe(true)
  expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
    [operation === "post" ? "POST" : "GET", operation === "read"
      ? "/api/session/ses_origin"
      : "/api/session/ses_origin/subagent-models"],
  ])
  const reason = new Error("server disposed during JSON decoding")
  lifetime.abort(reason)
  // These must settle before the stream is closed, even if fetch ignores cancellation.
  expect(await pending).toBe(reason)
  if (operation === "post") {
    expect(await waiting).toBe(reason)
    expect(await management.waitSubagentModels("ses_origin").catch((error: unknown) => error)).toBe(reason)
  }
  expect(state.cancelled).toBe(false)
  const controller = await body.promise
  controller.enqueue(new TextEncoder().encode(JSON.stringify({ data: operation === "read" ? {
    id: "ses_origin", projectID: "project", title: "Origin", location: { directory: "/repo" },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 20 }, subagentModels: policy,
  } : policy })))
  controller.close()
  if (operation !== "post") return
  expect(await management.waitSubagentModels("ses_origin").catch((error: unknown) => error)).toBe(reason)
})

test.each(["get", "read", "post"])("generated %s aborts while protocol is pending without launching a late request", async (operation) => {
  const lifetime = new AbortController()
  const protocol = Promise.withResolvers<"v2">()
  const requests: Request[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push(new Request(input, init))
    return Response.json({ data: policy })
  }, { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({
    server: { url: "https://origin.test" }, fetch: fetcher, protocol: protocol.promise, signal: lifetime.signal,
  })
  const pending = (operation === "get"
    ? management.getSubagentModels("ses_origin")
    : operation === "read"
      ? management.readSubagentModels("ses_origin")
      : management.setSubagentModels("ses_origin", policy)).catch((error: unknown) => error)
  // Let the operation enter the unresolved protocol gate before disposal.
  await Promise.resolve()
  await Promise.resolve()
  const reason = new Error("server disposed during protocol discovery")
  lifetime.abort(reason)
  expect(await pending).toBe(reason)
  expect(requests).toEqual([])
  protocol.resolve("v2")
  await protocol.promise
  expect(requests).toEqual([])
})

test("disposed lifetime rejects before generated operations launch", async () => {
  const lifetime = new AbortController()
  const requests: Request[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push(new Request(input, init))
    return Response.json({ data: policy })
  }, { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({
    server: { url: "https://origin.test" }, fetch: fetcher, protocol: Promise.resolve("v2"), signal: lifetime.signal,
  })
  const reason = new Error("server already disposed")
  lifetime.abort(reason)
  expect(await management.getSubagentModels("ses_origin").catch((error: unknown) => error)).toBe(reason)
  expect(await management.readSubagentModels("ses_origin").catch((error: unknown) => error)).toBe(reason)
  expect(await management.setSubagentModels("ses_origin", policy).catch((error: unknown) => error)).toBe(reason)
  expect(await management.waitSubagentModels("ses_origin").catch((error: unknown) => error)).toBe(reason)
  expect(requests).toEqual([])
})

test("scoped fetch combines lifetime, Request.signal and a separate caller signal", async () => {
  const lifetime = new AbortController()
  const requestAbort = new AbortController()
  const callerAbort = new AbortController()
  const signals: AbortSignal[] = []
  const fetcher = Object.assign(async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal)
    return new Response(null)
  }, { preconnect: fetch.preconnect })
  const scoped = createScopedFetch(fetcher, lifetime.signal)
  await scoped(new Request("https://origin.test", { signal: requestAbort.signal }), { signal: callerAbort.signal })
  expect(signals[0]?.aborted).toBe(false)
  requestAbort.abort()
  expect(signals[0]?.aborted).toBe(true)
  await scoped(new Request("https://origin.test"), { signal: callerAbort.signal })
  callerAbort.abort()
  expect(signals[1]?.aborted).toBe(true)
  await scoped("https://origin.test")
  lifetime.abort()
  expect(signals[2]?.aborted).toBe(true)
})
