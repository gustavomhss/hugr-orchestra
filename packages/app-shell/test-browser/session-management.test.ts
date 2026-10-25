import { expect, test } from "bun:test"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"
import { createSessionManagementForServer } from "@/utils/session-management"
import { createScopedFetch } from "@/utils/scoped-fetch"
import type { SubagentModelPolicy } from "@/components/subagent-model-rules"

// These exercise the generated Promise runtime at the HTTP boundary. They require the lead's client regeneration.
test("canonical policy read uses generated Session.Info as the timestamp fence", async () => {
  const { createSessionManagementForServer } = await import("@/utils/session-management")
  const server = { url: "https://origin.test" }
  const policy = { mode: "allowlist" as const, models: [{ providerID: "router", id: "full/slash/model" }] }
  const fetcher = Object.assign(async () => Response.json({ data: {
    id: "ses_origin", projectID: "project", title: "Origin", location: { directory: "/repo" },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 20 }, subagentModels: policy,
  } }), { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({ server, fetch: fetcher, ready: Promise.resolve() })
  expect(await management.readSubagentModels("ses_origin")).toEqual({ policy, timestamp: 20 })
})

test("generated session management captures origin credentials and replaces policies, including deny-all and Inherit", async () => {
  const { createSessionManagementForServer } = await import("@/utils/session-management")
  const server = { url: "https://origin.test", username: "owner", password: "secret" }
  const requests: Request[] = []
  const bodies: unknown[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    const body: unknown = request.body ? await request.json() : undefined
    bodies.push(body)
    if (body && typeof body === "object" && "archived" in body) return new Response(null, { status: 204 })
    return Response.json({ data: body && typeof body === "object" && "policy" in body ? body.policy : { mode: "inherit" } })
  }, { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({ server, fetch: fetcher, ready: Promise.resolve() })
  server.url = "https://other.test"
  server.password = "changed"
  expect(await management.getSubagentModels("ses_origin")).toEqual({ mode: "inherit" })
  expect(await management.setSubagentModels("ses_origin", { mode: "allowlist", models: [] })).toEqual({ mode: "allowlist", models: [] })
  const policy = { mode: "allowlist" as const, models: [{ providerID: "router", id: "full/slash/model" }] }
  expect(await management.setSubagentModels("ses_origin", policy)).toEqual(policy)
  expect(await management.setSubagentModels("ses_origin", { mode: "inherit" })).toEqual({ mode: "inherit" })
  await management.archive("ses_origin", true)
  await management.archive("ses_origin", false)
  expect(bodies.slice(1, 4)).toEqual([{ policy: { mode: "allowlist", models: [] } }, { policy }, { policy: { mode: "inherit" } }])
  expect(bodies.slice(4)).toEqual([{ archived: true }, { archived: false }])
  expect(requests.every((request) => new URL(request.url).origin === "https://origin.test")).toBe(true)
  expect(requests.every((request) => request.headers.get("authorization") === `Basic ${btoa("owner:secret")}`)).toBe(true)
})

test.each([404, 405, 501, 401, 403, 500])("generated runtime classifies HTTP %s without masking auth/server failures", async (status) => {
  const { createSessionManagementForServer } = await import("@/utils/session-management")
  const server = { url: "https://origin.test" }
  const fetcher = Object.assign(async () => Response.json({ _tag: "UnauthorizedError" }, { status }), { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({ server, fetch: fetcher, ready: Promise.resolve() })
  const result = await management.getSubagentModels("ses_origin").then(() => undefined, (error: unknown) => error)
  expect(result).toBeDefined()
  expect(sessionManagementUnsupported(result)).toBe([404, 405, 501].includes(status))
})

const policy: SubagentModelPolicy = { mode: "allowlist", models: [{ providerID: "router", id: "full/slash/model" }] }
const incomplete = Symbol("operation did not settle")

function management(fetcher: typeof fetch, input: Partial<Pick<Parameters<typeof createSessionManagementForServer>[0], "server" | "ready" | "signal">> = {}) {
  const server = input.server ?? { url: "https://synthetic-origin.invalid" }
  return createSessionManagementForServer({
    server, fetch: fetcher, ready: input.ready ?? Promise.resolve(), signal: input.signal,
  })
}

function result<T>(pending: Promise<T>) {
  return Promise.race([
    pending.then((value) => value, (error: unknown) => error),
    Bun.sleep(200).then(() => incomplete),
  ])
}

function snapshot(id: string, directory = "/repo", archived?: number) {
  return {
    id, projectID: "project", title: "Synthetic", location: { directory },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 20, archived }, subagentModels: policy,
  }
}

test("typed SessionNotFound404 remains a domain failure, not an unsupported route", async () => {
  const fetcher = Object.assign(async () => Response.json({
    _tag: "SessionNotFoundError", sessionID: "ses_missing", message: "Session not found: ses_missing",
  }, { status: 404 }), { preconnect: fetch.preconnect })
  const error = await result(management(fetcher).getSubagentModels("ses_missing"))
  expect(error).toBeDefined()
  expect(error).not.toBe(incomplete)
  expect(sessionManagementUnsupported(error)).toBe(false)
})

test("archive listing paginates and isolates the requested directory and archived catalog", async () => {
  const queries: URL[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(new Request(input, init).url)
    queries.push(url)
    return Response.json(url.searchParams.has("cursor")
      ? { data: [snapshot("ses_last", "/repo", 4)], cursor: {} }
      : { data: [snapshot("ses_archived", "/repo", 3), snapshot("ses_active"), snapshot("ses_other", "/other", 3)], cursor: { next: "synthetic-cursor" } })
  }, { preconnect: fetch.preconnect })
  expect((await management(fetcher).listArchived("/repo")).map((session) => session.id)).toEqual(["ses_archived", "ses_last"])
  expect(queries).toHaveLength(2)
  expect(queries.every((url) => url.searchParams.get("directory") === "/repo" && url.searchParams.get("includeArchived") === "true")).toBe(true)
  expect(queries[1].searchParams.get("cursor")).toBe("synthetic-cursor")
})

test("serialized writes return canonical ACKs; dispatch waits follow latest failure until explicit retry", async () => {
  const firstStarted = Promise.withResolvers<void>()
  const firstAck = Promise.withResolvers<Response>()
  const retryStarted = Promise.withResolvers<void>()
  const retryAck = Promise.withResolvers<Response>()
  const bodies: unknown[] = []
  const canonical: SubagentModelPolicy = { mode: "allowlist", models: [{ providerID: "router", id: "canonical/model" }] }
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    bodies.push(await new Request(input, init).json())
    if (bodies.length === 1) { firstStarted.resolve(); return firstAck.promise }
    if (bodies.length === 2) return Response.json({ message: "synthetic offline" }, { status: 500 })
    retryStarted.resolve()
    return retryAck.promise
  }, { preconnect: fetch.preconnect })
  const port = management(fetcher)
  const first = port.setSubagentModels("ses_origin", policy)
  try {
    await firstStarted.promise
    const waiting = result(port.waitSubagentModels("ses_origin"))
    await Bun.sleep(0)
    const second = result(port.setSubagentModels("ses_origin", { mode: "allowlist", models: [] }))
    expect(bodies).toEqual([{ policy }])
    firstAck.resolve(Response.json({ data: canonical }))
    expect(await first).toEqual(canonical)
    const failed = await second
    expect(failed).toBeInstanceOf(Error)
    expect(await waiting).toBe(failed)
    expect(await result(port.waitSubagentModels("ses_origin"))).toBe(failed)
    const retry = port.setSubagentModels("ses_origin", { mode: "allowlist", models: [] })
    await retryStarted.promise
    const state = { dispatched: false }
    const dispatch = port.waitSubagentModels("ses_origin").then(() => { state.dispatched = true })
    await Bun.sleep(0)
    expect(state.dispatched).toBe(false)
    retryAck.resolve(Response.json({ data: { mode: "allowlist", models: [] } }))
    expect(await retry).toEqual({ mode: "allowlist", models: [] })
    await dispatch
    expect(state.dispatched).toBe(true)
    expect(bodies).toEqual([{ policy }, { policy: { mode: "allowlist", models: [] } }, { policy: { mode: "allowlist", models: [] } }])
    await port.waitSubagentModels("ses_origin")
  } finally {
    firstAck.resolve(Response.json({ data: canonical }))
    retryAck.resolve(Response.json({ data: { mode: "allowlist", models: [] } }))
  }
})

test.each(["success", "failure", "owner-abort"] as const)("real HTTP waiter follows queued explicit retry %s after observed write fails", async (outcome) => {
  const lifetime = new AbortController()
  const started = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
  const replies = [Promise.withResolvers<Response>(), Promise.withResolvers<Response>()]
  const requests: { path: string; body: unknown; auth: string | null }[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(request) {
      requests.push({ path: new URL(request.url).pathname, body: await request.json(), auth: request.headers.get("authorization") })
      const index = requests.length - 1
      started[index]?.resolve()
      return replies[index]?.promise ?? new Response(null, { status: 404 })
    },
  })
  const port = management(createScopedFetch(fetch, lifetime.signal), {
    server: { url: server.url.origin, username: "synthetic", password: "synthetic-auth" }, signal: lifetime.signal,
  })
  const first = result(port.setSubagentModels("ses_retry", policy))
  try {
    await started[0].promise
    const waiting = result(port.waitSubagentModels("ses_retry"))
    await Bun.sleep(0)
    const retry = result(port.setSubagentModels("ses_retry", { mode: "inherit" }))
    expect(port.subagentModelsWriteVersion("ses_retry")).toBe(2)
    expect(requests).toHaveLength(1)
    replies[0].resolve(Response.json({ message: "synthetic first failure" }, { status: 500 }))
    const firstError = await first
    expect(firstError).toBeInstanceOf(Error)
    await started[1].promise
    const canonical: SubagentModelPolicy = { mode: "allowlist", models: [{ providerID: "router", id: "canonical/retry" }] }
    const reason = new Error("synthetic owner aborted after predecessor failed")
    if (outcome === "owner-abort") lifetime.abort(reason)
    if (outcome !== "owner-abort") replies[1].resolve(outcome === "success"
      ? Response.json({ data: canonical })
      : Response.json({ message: "synthetic retry failure" }, { status: 500 }))
    const retried = await retry
    if (outcome === "success") {
      expect(retried).toEqual(canonical)
      expect(await waiting).toBeUndefined()
      expect(await result(port.waitSubagentModels("ses_retry"))).toBeUndefined()
    }
    if (outcome === "failure") {
      expect(retried).toBeInstanceOf(Error)
      expect(retried).not.toBe(firstError)
      expect(await waiting).toBe(retried)
      expect(await result(port.waitSubagentModels("ses_retry"))).toBe(retried)
    }
    if (outcome === "owner-abort") {
      expect(retried).toBe(reason)
      expect(await waiting).toBe(reason)
      expect(await result(port.waitSubagentModels("ses_retry"))).toBe(reason)
      expect(port.subagentModelsWriteVersion("ses_retry")).toBe(0)
    }
    expect(requests.map((request) => [request.path, request.body])).toEqual([
      ["/api/session/ses_retry/subagent-models", { policy }],
      ["/api/session/ses_retry/subagent-models", { policy: { mode: "inherit" } }],
    ])
    expect(requests.every((request) => request.auth === `Basic ${btoa("synthetic:synthetic-auth")}`)).toBe(true)
  } finally {
    lifetime.abort()
    replies.forEach((reply) => reply.resolve(Response.json({ data: { mode: "inherit" } })))
    await server.stop(true)
  }
})

test("write generation changes at admission, survives ACK and exposes writes across a canonical GET", async () => {
  const lifetime = new AbortController()
  const readStarted = Promise.withResolvers<void>()
  const readReply = Promise.withResolvers<Response>()
  const writeStarted = Promise.withResolvers<void>()
  const writeReply = Promise.withResolvers<Response>()
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    if (request.method === "GET") { readStarted.resolve(); return readReply.promise }
    writeStarted.resolve()
    return writeReply.promise.then((response) => response.clone())
  }, { preconnect: fetch.preconnect })
  const port = management(fetcher, { signal: lifetime.signal })
  try {
    expect(port.subagentModelsWriteVersion("ses_generation")).toBe(0)
    const beforeRead = port.subagentModelsWriteVersion("ses_generation")
    const reading = port.readSubagentModels("ses_generation")
    await readStarted.promise
    const first = port.setSubagentModels("ses_generation", policy)
    expect(port.subagentModelsWriteVersion("ses_generation")).toBe(1)
    await writeStarted.promise
    const retry = port.setSubagentModels("ses_generation", { mode: "inherit" })
    expect(port.subagentModelsWriteVersion("ses_generation")).toBe(2)
    expect(port.subagentModelsWriteVersion("ses_other")).toBe(0)
    const other = management(fetcher)
    expect(other.subagentModelsWriteVersion("ses_generation")).toBe(0)
    writeReply.resolve(Response.json({ data: { mode: "inherit" } }))
    await first
    await retry
    await port.waitSubagentModels("ses_generation")
    expect(port.subagentModelsWriteVersion("ses_generation")).toBe(2)
    readReply.resolve(Response.json({ data: { ...snapshot("ses_generation"), subagentModels: { mode: "inherit" } } }))
    await reading
    expect(port.subagentModelsWriteVersion("ses_generation")).not.toBe(beforeRead)
    const reason = new Error("synthetic disposed generation owner")
    lifetime.abort(reason)
    expect(port.subagentModelsWriteVersion("ses_generation")).toBe(0)
    expect(await result(port.setSubagentModels("ses_generation", policy))).toBe(reason)
    expect(port.subagentModelsWriteVersion("ses_generation")).toBe(0)
  } finally {
    readReply.resolve(Response.json({ data: snapshot("ses_generation") }))
    writeReply.resolve(Response.json({ data: { mode: "inherit" } }))
  }
})

test("different Sessions and captured server instances have independent policy barriers", async () => {
  const started = Promise.withResolvers<void>()
  const ack = Promise.withResolvers<Response>()
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(new Request(input, init).url)
    if (url.hostname === "synthetic-origin.invalid" && url.pathname.includes("/ses_first/")) {
      started.resolve()
      return ack.promise
    }
    return Response.json({ data: { mode: "inherit" } })
  }, { preconnect: fetch.preconnect })
  const origin = management(fetcher)
  const other = management(fetcher, { server: { url: "https://synthetic-other.invalid" } })
  const pending = origin.setSubagentModels("ses_first", policy)
  try {
    await started.promise
    expect(await result(origin.setSubagentModels("ses_second", { mode: "inherit" }))).toEqual({ mode: "inherit" })
    expect(await result(other.setSubagentModels("ses_first", { mode: "inherit" }))).toEqual({ mode: "inherit" })
    expect(await result(other.waitSubagentModels("ses_first"))).toBeUndefined()
    ack.resolve(Response.json({ data: policy }))
    expect(await pending).toEqual(policy)
  } finally { ack.resolve(Response.json({ data: policy })) }
})

test("owner disposal rejects signal-ignoring ACKs and already captured dispatch barriers", async () => {
  const lifetime = new AbortController()
  const started = Promise.withResolvers<void>()
  const ack = Promise.withResolvers<Response>()
  const fetcher = Object.assign(async () => { started.resolve(); return ack.promise }, { preconnect: fetch.preconnect })
  const port = management(createScopedFetch(fetcher, lifetime.signal), { signal: lifetime.signal })
  const pending = result(port.setSubagentModels("ses_origin", policy))
  const waiting = result(port.waitSubagentModels("ses_origin"))
  try {
    await started.promise
    const reason = new Error("synthetic owner disposed before ACK")
    lifetime.abort(reason)
    expect(await pending).toBe(reason)
    expect(await waiting).toBe(reason)
    expect(await result(port.waitSubagentModels("ses_origin"))).toBe(reason)
    expect(await result(port.setSubagentModels("ses_origin", policy))).toBe(reason)
  } finally { ack.resolve(Response.json({ data: policy })) }
})

test.each(["get", "read", "post", "list"] as const)("generated %s rejects stalled JSON without claiming unsupported stream cancellation", async (operation) => {
  const lifetime = new AbortController()
  const reading = Promise.withResolvers<void>()
  const body = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>()
  const state = { cancelled: false }
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) { body.resolve(controller) },
    pull() { reading.resolve() },
    cancel() { state.cancelled = true },
  }, { highWaterMark: 0 }), { headers: { "content-type": "application/json" } })
  const requests: Request[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push(new Request(input, init))
    return response
  }, { preconnect: fetch.preconnect })
  const port = management(createScopedFetch(fetcher, lifetime.signal), { signal: lifetime.signal })
  const operations = {
    get: () => port.getSubagentModels("ses_origin"), read: () => port.readSubagentModels("ses_origin"),
    post: () => port.setSubagentModels("ses_origin", policy), list: () => port.listArchived("/repo"),
  }
  const pending = result(operations[operation]())
  const waiting = operation === "post" ? result(port.waitSubagentModels("ses_origin")) : undefined
  try {
    await reading.promise
    expect(response.bodyUsed).toBe(true)
    expect(requests).toHaveLength(1)
    const reason = new Error("synthetic owner disposed during JSON decoding")
    lifetime.abort(reason)
    expect(await pending).toBe(reason)
    if (operation === "post") expect(await waiting).toBe(reason)
    expect(state.cancelled).toBe(false)
    expect(await result(port.waitSubagentModels("ses_origin"))).toBe(reason)
  } finally {
    const controller = await body.promise
    controller.enqueue(new TextEncoder().encode(JSON.stringify(operation === "list"
      ? { data: [snapshot("ses_origin", "/repo", 3)], cursor: {} }
      : { data: operation === "read" ? snapshot("ses_origin") : policy })))
    controller.close()
  }
})

test.each(["get", "read", "post", "archive", "list"] as const)("generated %s aborts a pending readiness wait and rejects a late request", async (operation) => {
  const lifetime = new AbortController()
  const ready = Promise.withResolvers<void>()
  const requests: Request[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push(new Request(input, init))
    return Response.json({ data: policy })
  }, { preconnect: fetch.preconnect })
  const port = management(fetcher, { ready: ready.promise, signal: lifetime.signal })
  const operations = {
    get: () => port.getSubagentModels("ses_origin"), read: () => port.readSubagentModels("ses_origin"),
    post: () => port.setSubagentModels("ses_origin", policy), archive: () => port.archive("ses_origin", true),
    list: () => port.listArchived("/repo"),
  }
  const pending = result(operations[operation]())
  try {
    await Bun.sleep(0)
    const reason = new Error("synthetic owner disposed while waiting for readiness")
    lifetime.abort(reason)
    expect(await pending).toBe(reason)
    ready.resolve()
    await Bun.sleep(0)
    expect(requests).toEqual([])
  } finally { ready.resolve() }
})

test("disposed instance cannot launch reads, archives, dispatch waits or fresh retry barriers", async () => {
  const lifetime = new AbortController()
  const requests: Request[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push(new Request(input, init))
    return Response.json({ data: policy })
  }, { preconnect: fetch.preconnect })
  const port = management(fetcher, { signal: lifetime.signal })
  const reason = new Error("synthetic owner already disposed")
  lifetime.abort(reason)
  expect(await result(port.getSubagentModels("ses_origin"))).toBe(reason)
  expect(await result(port.readSubagentModels("ses_origin"))).toBe(reason)
  expect(await result(port.archive("ses_origin", true))).toBe(reason)
  expect(await result(port.listArchived("/repo"))).toBe(reason)
  expect(await result(port.waitSubagentModels("ses_origin"))).toBe(reason)
  expect(await result(port.setSubagentModels("ses_origin", policy))).toBe(reason)
  expect(requests).toEqual([])
})
