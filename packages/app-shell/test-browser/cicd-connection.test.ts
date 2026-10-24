import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createPipelines } from "../src/orchestra/chapters/cicd-runner"
import { createServerSdkContext } from "../src/context/server-sdk"
import { ServerScope } from "../src/utils/server-scope"

class Socket extends EventTarget {
  binaryType = ""
  url?: URL
  close() {}
  send() {}
  closed() { this.dispatchEvent(new CloseEvent("close", { code: 1000 })) }
}

function fixture(protocol: "v2", manual = false) {
  const sockets: Socket[] = []
  const timers: (() => void)[] = []
  const state = { gets: 0, ticketRequests: [] as { url: string; ticket: string | null }[], tickets: [] as ReturnType<typeof Promise.withResolvers<Response>>[], removes: [] as ReturnType<typeof Promise.withResolvers<Response>>[] }
  const transport = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname === "/global/health") return Response.json({ healthy: true }, { status: protocol === "v1" ? 200 : 404 })
    if (url.pathname === "/api/health") return Response.json({ pid: 1 })
    if (url.pathname.endsWith("connect-token")) {
      state.ticketRequests.push({ url: request.url, ticket: request.headers.get("x-orchestra-ticket") })
      if (manual) {
        const ticket = Promise.withResolvers<Response>()
        state.tickets.push(ticket)
        return ticket.promise
      }
      return Response.json({ data: { ticket: "auto", expires_in: 30 } })
    }
    if (request.method === "DELETE") {
      const remove = Promise.withResolvers<Response>()
      state.removes.push(remove)
      return remove.promise
    }
    const data = request.method === "POST" ? { id: "pty-owned" } : { id: "pty-owned", status: "running" }
    if (request.method === "GET") state.gets++
    return Response.json(protocol === "v1" ? data : { data, location: { directory: "/repo" } })
  }, { preconnect: fetch.preconnect })
  const platform = { platform: "desktop" as const, openExternal() {}, restart: async () => {}, notify: async () => {},
    openDirectoryPickerDialog: async () => null,
    storage: () => ({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }), fetch: transport }
  return createRoot((dispose) => {
    const sdk = createServerSdkContext({ type: "http", http: { url: "http://runner.test" } }, ServerScope.local, platform)
    const runner = createPipelines({ sdk, platform, directory: `/repo/${crypto.randomUUID()}`, t: (key) => key,
      socket: (url) => { const socket = new Socket(); socket.url = new URL(String(url)); sockets.push(socket); return socket as unknown as WebSocket },
      reconnect: (callback) => { timers.push(callback) },
    })
    runner.save({ id: "pipeline", name: "Checks", branch: "dev", trigger: "manual", command: "true", environment: "preview", deploy: false })
    return { runner, state, sockets, timers, dispose }
  })
}

test("cold review: failed stop ignores retired socket close and invalidates its reconnect timer", async () => {
  const f = fixture("v2")
  try {
    await f.runner.run("pipeline", "dev")
    await until(() => f.sockets.length === 1)
    f.runner.stop("pipeline")
    await until(() => f.state.removes.length === 1)
    f.state.removes[0]!.resolve(Response.json({}, { status: 500 }))
    await until(() => f.sockets.length === 2)
    f.sockets[0]!.dispatchEvent(new MessageEvent("message", { data: "retired output" }))
    f.sockets[0]!.closed()
    await drain()
    expect(f.state.gets).toBe(0)
    expect(f.timers).toHaveLength(0)
    expect(f.runner.log("pipeline")).not.toContain("retired output")
    f.sockets[1]!.closed()
    await until(() => f.timers.length === 1)
    f.runner.stop("pipeline")
    await until(() => f.state.removes.length === 2)
    f.state.removes[1]!.resolve(Response.json({}, { status: 500 }))
    await until(() => f.sockets.length === 3)
    f.timers[0]!()
    await drain()
    expect(f.sockets).toHaveLength(3)
  } finally { f.dispose() }
})

test("cold review: an old awaited PTY ticket cannot attach after stop failure starts a new connection", async () => {
  const f = fixture("v2", true)
  try {
    await f.runner.run("pipeline", "dev")
    await until(() => f.state.tickets.length === 1)
    f.runner.stop("pipeline")
    await until(() => f.state.removes.length === 1)
    f.state.removes[0]!.resolve(Response.json({}, { status: 500 }))
    await until(() => f.state.tickets.length === 2)
    f.state.tickets[1]!.resolve(Response.json({ data: { ticket: "new", expires_in: 30 } }))
    await until(() => f.sockets.length === 1)
    f.state.tickets[0]!.resolve(Response.json({ data: { ticket: "old", expires_in: 30 } }))
    await drain()
    expect(f.sockets).toHaveLength(1)
  } finally { f.dispose() }
})

test("the runner fetches a V2 connect ticket before it opens the WebSocket", async () => {
  const f = fixture("v2")
  try {
    await f.runner.run("pipeline", "dev")
    await until(() => f.sockets.length === 1)
    expect(f.state.ticketRequests).toHaveLength(1)
    expect(new URL(f.state.ticketRequests[0]!.url).pathname).toBe("/api/pty/pty-owned/connect-token")
    expect(f.state.ticketRequests[0]!.ticket).toBe("1")
    expect(f.sockets[0]!.url?.searchParams.get("ticket")).toBe("auto")
  } finally { f.dispose() }
})

async function drain() { for (let turn = 0; turn < 30; turn++) await Promise.resolve() }
async function until(check: () => boolean) {
  for (let turn = 0; turn < 100 && !check(); turn++) await new Promise((resolve) => setTimeout(resolve, 0))
  expect(check()).toBe(true)
}
