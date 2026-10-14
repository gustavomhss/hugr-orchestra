import { expect, test } from "bun:test"
import { createMemo, createRoot, createSignal } from "solid-js"
import { createServerContextCache } from "../src/context/global"
import { createServerSdkContext } from "../src/context/server-sdk"
import { ServerConnection } from "../src/context/server"
import { ServerScope } from "../src/utils/server-scope"

test("cold review: V2 client combines caller/context abort and rejects retained old credentials before transport", async () => {
  const requests: Request[] = []
  const started = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
  const transport = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    if (new URL(request.url).pathname.endsWith("/command")) {
      started[requests.filter((request) => new URL(request.url).pathname.endsWith("/command")).length - 1]?.resolve()
      return new Promise<Response>((_resolve, reject) => {
        if (request.signal.aborted) return reject(request.signal.reason)
        request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true })
      })
    }
    return Response.json({ healthy: true })
  }, { preconnect: fetch.preconnect })
  const first: ServerConnection.Http = { type: "http", http: { url: "http://v2.test", username: "user", password: "old" } }
  const state = createRoot((dispose) => {
    const [servers, setServers] = createSignal<ServerConnection.Any[]>([first])
    const ensure = createServerContextCache(servers, (conn) => createServerSdkContext(conn, ServerScope.local, {
      platform: "web", fetch: transport, openExternal() {}, restart: async () => {}, notify: async () => {},
    }))
    return { dispose, setServers, current: createMemo(() => ensure(first)) }
  })
  const caller = new AbortController()
  try {
    const old = state.current()
    const pending = old.currentApi.command.list({ location: { directory: "/repo" } }, { signal: caller.signal }).catch((error: unknown) => error)
    await started[0].promise
    const outgoing = requests.find((request) => new URL(request.url).pathname === "/api/command")!
    expect(outgoing.headers.get("authorization")).toBe(`Basic ${btoa("user:old")}`)
    state.setServers([{ ...first, http: { ...first.http, password: "new" } }])
    expect(outgoing.signal.aborted).toBe(true)
    expect(caller.signal.aborted).toBe(false)
    expect(await pending).toBeInstanceOf(Error)
    const before = requests.length
    await expect(old.currentApi.command.list({ location: { directory: "/repo" } })).rejects.toBeDefined()
    expect(requests.length).toBe(before)
    const nextCaller = new AbortController()
    const next = state.current().currentApi.command.list({ location: { directory: "/repo" } }, { signal: nextCaller.signal }).catch((error: unknown) => error)
    await started[1].promise
    const latest = requests.findLast((request) => new URL(request.url).pathname === "/api/command")!
    expect(latest.headers.get("authorization")).toBe(`Basic ${btoa("user:new")}`)
    expect(latest.signal.aborted).toBe(false)
    nextCaller.abort()
    expect(latest.signal.aborted).toBe(true)
    expect(await next).toBeInstanceOf(Error)
  } finally { caller.abort(); state.dispose() }
})

test("same-key credential edits replace SDK and SSE, dispose old stream, and preserve stable identity", async () => {
  const requests: { path: string; auth: string | null }[] = []
  const streams = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
  const closed = Promise.withResolvers<void>()
  const signals: AbortSignal[] = []
  // Transport boundary fixture; the real SDK builds headers, reads SSE and aborts the replaced context.
  const transport = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      requests.push({ path, auth: request.headers.get("authorization") })
      if (path === "/global/event") {
        signals.push(request.signal)
        const index = requests.filter((entry) => entry.path === path).length - 1
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(": connected\n\n"))
            streams[index]?.resolve()
            request.signal.addEventListener("abort", () => {
              controller.close()
              if (index === 0) closed.resolve()
            }, { once: true })
          },
        }), { headers: { "content-type": "text/event-stream" } })
      }
      return Response.json(path === "/global/health" ? { healthy: true } : [])
  }, { preconnect: fetch.preconnect })
  const first: ServerConnection.Http = { type: "http", http: { url: "http://server.test", username: "user", password: "old" } }
  const state = createRoot((dispose) => {
    const [servers, setServers] = createSignal<ServerConnection.Any[]>([first])
    const ensure = createServerContextCache(servers, (conn) => createServerSdkContext(conn, ServerScope.local, {
      platform: "web", fetch: transport, openExternal() {}, restart: async () => {}, notify: async () => {},
    }))
    return { dispose, setServers, ensure, current: createMemo(() => ensure(first)) }
  })
  try {
    const old = state.current()
    void old.event.start()
    await streams[0].promise
    await old.client.project.list()
    state.setServers([{ ...first, http: { ...first.http, password: "new" } }])
    const next = state.current()
    expect(next).not.toBe(old)
    expect(signals[0]?.aborted).toBe(true)
    expect(ServerConnection.key(next.server)).toBe(ServerConnection.key(first))
    expect(state.ensure(first)).toBe(next)
    void next.event.start()
    await streams[1].promise
    await closed.promise
    await next.client.project.list()
    expect(requests.filter((entry) => entry.path === "/project").map((entry) => entry.auth)).toEqual([
      `Basic ${btoa("user:old")}`, `Basic ${btoa("user:new")}`,
    ])
    expect(requests.filter((entry) => entry.path === "/global/event").map((entry) => entry.auth)).toEqual([
      `Basic ${btoa("user:old")}`, `Basic ${btoa("user:new")}`,
    ])
    state.setServers([{ ...next.server, displayName: "Renamed" }])
    expect(state.current()).toBe(next)
  } finally {
    state.dispose()
  }
})

test("legacy fetch fence blocks disposed owners despite live caller signals over real HTTP", async () => {
  const requests: { path: string; auth: string | null; directory: string | null; body: string }[] = []
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  // Real loopback HTTP and real generated clients; endpoint responses and authorization are synthetic.
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/global/health") return Response.json({ healthy: true })
      const body = await request.text()
      requests.push({
        path: url.pathname,
        auth: request.headers.get("authorization"),
        directory: url.searchParams.get("directory") ?? request.headers.get("x-orchestra-directory"),
        body,
      })
      if (url.pathname === "/api/command") return Response.json({ data: [] })
      if (url.pathname !== "/session/ses_probe/prompt_async") return new Response(null, { status: 404 })
      if (body.includes("synthetic-hold")) {
        started.resolve()
        await release.promise
      }
      return new Response(null, { status: 204 })
    },
  })
  const connection: ServerConnection.Http = {
    type: "http",
    http: { url: server.url.origin, username: "synthetic-user", password: "synthetic-old-auth" },
  }
  const state = createRoot((dispose) => ({
    dispose,
    sdk: createServerSdkContext(connection, ServerScope.local, {
      platform: "web",
      fetch,
      openExternal() {},
      restart: async () => {},
      notify: async () => {},
    }),
  }))
  const retained = state.sdk.createClient({ directory: "/synthetic/old-workspace", throwOnError: true })
  const sends = [
    (signal: AbortSignal, text = "synthetic-prompt") =>
      state.sdk.client.session.promptAsync(
        { sessionID: "ses_probe", directory: "/synthetic/old-workspace", parts: [{ type: "text", text }] },
        { signal },
      ),
    (signal: AbortSignal, text = "synthetic-prompt") =>
      retained.session.promptAsync({ sessionID: "ses_probe", parts: [{ type: "text", text }] }, { signal }),
    (signal: AbortSignal, text = "synthetic-prompt") =>
      state.sdk
        .createClient({
          directory: "/synthetic/old-workspace",
          signal,
          throwOnError: true,
        })
        .session.promptAsync({ sessionID: "ses_probe", parts: [{ type: "text", text }] }, { signal }),
    (signal: AbortSignal, text = "synthetic-prompt") =>
      state.sdk.api.session.prompt({ sessionID: "ses_probe", text }, { signal }),
  ]
  const caller = new AbortController()
  try {
    expect(await state.sdk.protocol).toBe("v1")
    // Keep client-path assertions independent of concurrent HTTP arrival order.
    for (const send of sends) await send(caller.signal)
    expect(requests).toHaveLength(sends.length)
    expect(requests.every((request) => request.path === "/session/ses_probe/prompt_async")).toBe(true)
    expect(requests.slice(0, 3).map((request) => request.directory && decodeURIComponent(request.directory))).toEqual([
      "/synthetic/old-workspace",
      "/synthetic/old-workspace",
      "/synthetic/old-workspace",
    ])
    const pending = sends[1](caller.signal, "synthetic-hold").then(
      () => false,
      () => true,
    )
    await started.promise
    caller.abort()
    expect(await pending).toBe(true)
    release.resolve()
    const beforeCallerAbort = requests.length
    await expect(sends[0](caller.signal)).rejects.toBeDefined()
    expect(requests).toHaveLength(beforeCallerAbort)
    // A caller cancellation leaves the owner usable, with its original captured authorization.
    connection.http.password = "synthetic-edited-auth"
    await sends[3](new AbortController().signal)
    expect(requests).toHaveLength(beforeCallerAbort + 1)
    expect(requests.every((request) => request.auth === `Basic ${btoa("synthetic-user:synthetic-old-auth")}`)).toBe(true)
    await state.sdk.currentApi.command.list({}, { signal: new AbortController().signal })

    state.dispose()
    const beforeOwnerAbort = requests.length
    const blocked = await Promise.all(
      sends.map(async (send) => {
        const live = new AbortController()
        const rejected = await send(live.signal, "synthetic-disposed").then(
          () => false,
          () => true,
        )
        expect(live.signal.aborted).toBe(false)
        return rejected
      }),
    )
    expect(blocked, JSON.stringify(requests)).toEqual([true, true, true, true])
    expect(requests).toHaveLength(beforeOwnerAbort)
    await expect(state.sdk.currentApi.command.list({}, { signal: new AbortController().signal })).rejects.toBeDefined()
    expect(requests).toHaveLength(beforeOwnerAbort)
  } finally {
    caller.abort()
    release.resolve()
    state.dispose()
    await server.stop(true)
  }
})
