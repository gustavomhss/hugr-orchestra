import { expect, test } from "bun:test"
import { createComponent, createRoot } from "solid-js"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import type { SessionActiveOutput } from "@/v2-wire"
import { solidDom } from "./solid-dom"

// This provider graph needs the browser Solid runtime and the same TSX compilation as the app.
// The existing shared helper keeps one reactive runtime and transforms the real local graph, with no context mocks.
const { createServerSdkContext }: typeof import("@/context/server-sdk") = await import(solidDom("@/context/server-sdk", import.meta.dir))
const { createServerSyncContextInner }: typeof import("@/context/server-sync") = await import(solidDom("@/context/server-sync", import.meta.dir))
const { LanguageProvider }: typeof import("@/context/language") = await import(solidDom("@/context/language", import.meta.dir))
const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))
const { ServerScope }: typeof import("@/utils/server-scope") = await import(solidDom("@/utils/server-scope", import.meta.dir))

test("a retained reconnect status snapshot cannot overwrite a newer live status", async () => {
  const captured = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const serverState = { active: {} as SessionActiveOutput }
  const connections: ReadableStreamDefaultController<Uint8Array>[] = []
  const activeReads: string[] = []
  const unexpected: string[] = []
  const location = { directory: "/repo", project: { id: "project", directory: "/repo" } }
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: object) =>
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const pathname = new URL(request.url).pathname
      if (pathname === "/api/event")
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            connections.push(controller)
            send(controller, { id: `evt_connected_${connections.length}`, type: "server.connected", data: {} })
          },
        }), { headers: { "content-type": "text/event-stream" } })
      if (pathname === "/api/session/active") {
        activeReads.push(pathname)
        const snapshot = Response.json({ data: serverState.active })
        if (activeReads.length === 1) return snapshot
        // Captured while ses_started was idle; release only after its new live start reaches the store.
        captured.resolve()
        return release.promise.then(() => snapshot)
      }
      if (pathname === "/api/health") return Response.json({ pid: 123 })
      if (pathname === "/api/config") return Response.json({ disabledProviders: [] })
      if (pathname === "/api/location/paths")
        return Response.json({ state: "", config: "", worktree: "/repo", directory: "/repo", home: "/home" })
      if (pathname === "/api/project") return Response.json([])
      if (pathname === "/api/model/default") return Response.json({ location, data: null })
      if (pathname === "/api/provider" || pathname === "/api/model") return Response.json({ location, data: [] })
      if (pathname === "/api/session/ses_started/todo") return Response.json({ data: [] })
      if (pathname === "/api/session/ses_started/message")
        return Response.json({ data: [
          { id: "msg_started", type: "assistant", agent: "build", model: { providerID: "test", id: "model" }, content: [], time: { created: 2 } },
          { id: "msg_user", type: "user", text: "start", time: { created: 1 } },
        ], cursor: {} })
      if (pathname === "/api/session/ses_started")
        return Response.json({ data: {
          id: pathname.split("/").at(-1), projectID: "project", title: "status fixture", location: { directory: "/repo" },
          cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: 1, updated: 1 },
        } })
      unexpected.push(pathname)
      return Response.json({ message: "Unexpected request" }, { status: 500 })
    },
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const greetings: string[] = []
  let sync!: ReturnType<typeof createServerSyncContextInner>
  const dispose = createRoot((dispose) => {
    createComponent(PlatformProvider, {
      value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
      get children() {
        return createComponent(LanguageProvider, {
          locale: "en",
          get children() {
            return createComponent(QueryClientProvider, {
              client,
              get children() {
                const sdk = createServerSdkContext({ type: "http", http: { url: server.url.origin } }, ServerScope.local)
                sync = createServerSyncContextInner(sdk)
                sdk.event.listen((event) => {
                  if (event.details.type === "server.connected") greetings.push(event.details.id)
                })
                return null
              },
            })
          },
        })
      },
    })
    return dispose
  })

  try {
    await until(() => greetings.length === 1 && activeReads.length === 1 && sync.ready)
    expect(unexpected).toEqual([])
    expect(connections).toHaveLength(1)
    sync.session.set("session_status", "ses_started", { type: "idle" })
    sync.session.set("session_status", "ses_stale", { type: "busy" })
    connections[0].close()
    await until(() => activeReads.length === 2)
    await captured.promise
    expect(connections).toHaveLength(2)
    expect(greetings).toHaveLength(2)
    serverState.active = { ses_started: { type: "running" } }
    send(connections[1], {
      id: "evt_new_start", type: "session.next.step.started", location: { directory: "/repo" },
      data: { sessionID: "ses_started", assistantMessageID: "msg_started", timestamp: 2, agent: "build", model: { providerID: "test", id: "model" } },
    })
    await until(() => sync.session.data.session_status.ses_started?.type === "busy")
    expect(sync.session.data.session_status.ses_started).toEqual({ type: "busy" })
    release.resolve()
    // A separate untouched status proves that the retained snapshot was actually reconciled.
    await until(() => sync.session.data.session_status.ses_stale?.type === "idle")
    expect(activeReads).toHaveLength(2)
    expect(unexpected).toEqual([])
    expect(serverState.active).toEqual({ ses_started: { type: "running" } })
    expect(sync.session.data.session_status.ses_started).toEqual({ type: "busy" })
  } finally {
    release.resolve()
    dispose()
    client.clear()
    server.stop(true)
  }
}, 15_000)

async function until(check: () => boolean) {
  const deadline = Date.now() + 5_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for the reconnect fixture")
    await Bun.sleep(10)
  }
}
