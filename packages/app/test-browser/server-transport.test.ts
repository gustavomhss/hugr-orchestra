import { expect, test } from "bun:test"
import { createMemo, createRoot, createSignal } from "solid-js"
import { createServerContextCache } from "../src/context/global"
import { createServerSdkContext } from "../src/context/server-sdk"
import { ServerConnection } from "../src/context/server"
import { ServerScope } from "../src/utils/server-scope"

test("cold review: V2 client combines caller/context abort and rejects retained old credentials before transport", async () => {
  const requests: Request[] = []
  const started = Promise.withResolvers<void>()
  const transport = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    if (new URL(request.url).pathname.endsWith("/command")) {
      started.resolve()
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
    await started.promise
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
    const latest = requests.at(-1)!
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
