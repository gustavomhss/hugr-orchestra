import { describe, expect, test } from "bun:test"
import type { McpListInput, McpResourceCatalogInput, Session, SessionActiveOutput, SessionListInput } from "@/v2-wire"
import type { SessionInfo } from "@/v2-types"

import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { createComponent, createRoot } from "solid-js"
import { canDisposeDirectory, pickDirectoriesToEvict } from "./global-sync/eviction"
import { estimateRootSessionTotal, loadRootSessions } from "./global-sync/session-load"
import { createServerSyncContextInner, loadActiveSessionsQuery, loadMcpQuery, loadMcpResourcesQuery, seedActiveSessionStatuses } from "./server-sync"
import { closeDeletedSession, reconcileActiveSessionStatuses, resyncAfterReconnect } from "./server-resync"
import { createHomeSessionIndexCache } from "./global-sync/home-session-index"
import { readSessionTabsRemovedDetail, SESSION_TABS_REMOVED_EVENT } from "@/components/titlebar-session-events"
import type { ServerConnection } from "./server"
import { ServerScope } from "@/utils/server-scope"
import { createServerSession } from "./server-session"
import type { ServerApi } from "@/utils/server"
import { rethrow } from "../testing/rejection"
import { createServerSdkContext } from "./server-sdk"
import { LanguageProvider } from "./language"
import { PlatformProvider } from "./platform"

type McpApi = ServerApi["mcp"]

describe("MCP queries", () => {
  test("loads current servers for the requested location", async () => {
    const calls: unknown[] = []
    const queryClient = new QueryClient()
    const result = await queryClient.fetchQuery(
      loadMcpQuery(ServerScope.local, "/project", {
        list: async (input: McpListInput = {}) => {
          calls.push(input)
          return {
            location: { directory: "/project", project: { id: "project", directory: "/project" } },
            data: [
              { name: "docs", status: { status: "connected" } },
              { name: "search", status: { status: "pending" } },
            ],
          }
        },
      } as unknown as McpApi),
    )

    expect(calls).toEqual([{ location: { directory: "/project" } }])
    expect(result).toEqual({ docs: { status: "connected" }, search: { status: "pending" } })
  })

  test("loads and keys the current resource catalog", async () => {
    const calls: unknown[] = []
    const queryClient = new QueryClient()
    const result = await queryClient.fetchQuery(
      loadMcpResourcesQuery(ServerScope.local, "/project", {
        resource: {
          catalog: async (input: McpResourceCatalogInput = {}) => {
            calls.push(input)
            return {
              location: { directory: "/project", project: { id: "project", directory: "/project" } },
              data: {
                resources: [{ server: "docs", name: "Guide", uri: "docs://guide" }],
                templates: [],
              },
            }
          },
        },
      } as unknown as McpApi),
    )

    expect(calls).toEqual([{ location: { directory: "/project" } }])
    expect(result).toEqual({ "docs:docs://guide": { server: "docs", name: "Guide", uri: "docs://guide" } })
  })
})

describe("active session query", () => {
  test("loads active sessions immediately and once per server cache", async () => {
    let calls = 0
    const queryClient = new QueryClient()
    const options = loadActiveSessionsQuery(ServerScope.local, {
      active: async () => {
        calls++
        return { ses_running: { type: "running" } }
      },
    })

    expect(await queryClient.fetchQuery(options)).toEqual({ ses_running: { type: "running" } })
    expect(await queryClient.fetchQuery(options)).toEqual({ ses_running: { type: "running" } })
    expect(calls).toBe(1)
    expect(options.enabled).toBe(true)
    expect([...options.queryKey]).toEqual([ServerScope.local, "activeSessions"])
  })

  test("does not overwrite statuses already written by events", () => {
    const session = createServerSession(
      {} as Pick<ServerApi["session"], "get" | "message">,
      {} as ServerApi["message"],
      { todo: async () => [] },
    )
    session.set("session_status", "ses_retry", { type: "retry", attempt: 2, message: "retrying", next: 10 })

    seedActiveSessionStatuses(session, {
      ses_running: { type: "running" },
      ses_retry: { type: "running" },
    })

    expect(session.data.session_status.ses_running).toEqual({ type: "busy" })
    expect(session.data.session_status.ses_retry).toEqual({
      type: "retry",
      attempt: 2,
      message: "retrying",
      next: 10,
    })
  })
})

describe("pickDirectoriesToEvict", () => {
  test("keeps pinned stores and evicts idle stores", () => {
    const now = 5_000
    const picks = pickDirectoriesToEvict({
      stores: ["a", "b", "c", "d"],
      state: new Map([
        ["a", { lastAccessAt: 1_000 }],
        ["b", { lastAccessAt: 4_900 }],
        ["c", { lastAccessAt: 4_800 }],
        ["d", { lastAccessAt: 3_000 }],
      ]),
      pins: new Set(["a"]),
      max: 2,
      ttl: 1_500,
      now,
    })

    expect(picks).toEqual(["d", "c"])
  })
})

describe("loadRootSessions", () => {
  test("loads and normalizes a limited page of root sessions", async () => {
    const calls: SessionListInput[] = []

    const result = await loadRootSessions({
      api: {
        list: async (query = {}) => {
          calls.push(query)
          return { data: [sessionInfo("session-1")], cursor: {} }
        },
      } satisfies Pick<ServerApi["session"], "list">,
      directory: "dir",
      limit: 10,
    })

    expect(result.data).toEqual([
      expect.objectContaining({ id: "session-1", directory: "dir", slug: "session-1", version: "" }),
    ])
    expect(result.limited).toBe(true)
    expect(calls).toEqual([{ directory: "dir", limit: 10, order: "desc" }])
  })

  test("propagates list failures", async () => {
    expect(
      await rethrow(
        loadRootSessions({
          api: {
            list: async () => {
              throw new Error("failed")
            },
          } satisfies Pick<ServerApi["session"], "list">,
          directory: "dir",
          limit: 25,
        }),
      ),
    ).toThrow("failed")
  })
})

function sessionInfo(id: string) {
  return {
    id,
    projectID: "project-1",
    agent: "build",
    model: { id: "model-1", providerID: "provider-1" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
    title: id,
    location: { directory: "dir" },
  } as SessionInfo
}

describe("estimateRootSessionTotal", () => {
  test("keeps exact total for full fetches", () => {
    expect(estimateRootSessionTotal({ count: 42, limit: 10, limited: false })).toBe(42)
  })

  test("marks has-more for full-limit limited fetches", () => {
    expect(estimateRootSessionTotal({ count: 10, limit: 10, limited: true })).toBe(11)
  })

  test("keeps exact total when limited fetch is under limit", () => {
    expect(estimateRootSessionTotal({ count: 9, limit: 10, limited: true })).toBe(9)
  })
})

describe("canDisposeDirectory", () => {
  test("rejects pinned or inflight directories", () => {
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: true,
        booting: false,
        loadingSessions: false,
      }),
    ).toBe(false)
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: false,
        booting: true,
        loadingSessions: false,
      }),
    ).toBe(false)
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: false,
        booting: false,
        loadingSessions: true,
      }),
    ).toBe(false)
  })

  test("accepts idle unpinned directory store", () => {
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: false,
        booting: false,
        loadingSessions: false,
      }),
    ).toBe(true)
  })
})

describe("reconnect resync", () => {
  const info = (id: string): Session => ({
    id,
    slug: id,
    projectID: "project",
    directory: "/repo",
    title: id,
    version: "1",
    time: { created: 1, updated: 1 },
  })

  // Real session store over fake endpoints that record what the app asked for.
  function setup() {
    const gets: string[] = []
    const lists: string[] = []
    const store = createServerSession(
      {
        get: async (input: { sessionID: string }) => {
          gets.push(input.sessionID)
          return info(input.sessionID)
        },
        message: async () => {
          throw new Error("single message endpoint called")
        },
      } as unknown as Pick<ServerApi["session"], "get" | "message">,
      {
        list: async (input: { sessionID: string }) => {
          lists.push(input.sessionID)
          return { data: [], cursor: {} }
        },
      } as unknown as ServerApi["message"],
      { todo: async () => [] },
    )
    return { gets, lists, store }
  }

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

  test("reloads the open session even when it is already cached", async () => {
    const { gets, lists, store } = setup()
    store.pin("ses_open")
    await store.sync("ses_open")
    await store.sync("ses_open")
    expect([gets, lists]).toEqual([["ses_open"], ["ses_open"]])

    await resyncAfterReconnect(store, {})

    expect([gets, lists]).toEqual([
      ["ses_open", "ses_open"],
      ["ses_open", "ses_open"],
    ])
  })

  test("reloads loaded sessions that were or are running, and leaves never-loaded ones alone", async () => {
    const { lists, store } = setup()
    await store.sync("ses_was_busy")
    await store.sync("ses_still_busy")
    await store.sync("ses_idle")
    store.set("session_status", "ses_was_busy", { type: "busy" })
    store.set("session_status", "ses_still_busy", { type: "busy" })
    lists.length = 0

    await resyncAfterReconnect(store, { ses_still_busy: { type: "running" }, ses_unloaded: { type: "running" } })

    expect(lists.toSorted()).toEqual(["ses_still_busy", "ses_was_busy"])
  })

  test("keeps statuses when the active list could not be read, but still reloads the open session", async () => {
    const { lists, store } = setup()
    store.pin("ses_open")
    store.set("session_status", "ses_open", { type: "busy" })

    await resyncAfterReconnect(store)

    expect(store.data.session_status.ses_open).toEqual({ type: "busy" })
    expect(lists).toEqual(["ses_open"])
  })

  test("overwrites statuses with the server's list: stale busy becomes idle", () => {
    const { store } = setup()
    store.set("session_status", "ses_stale", { type: "busy" })
    store.set("session_status", "ses_retry", { type: "retry", attempt: 1, message: "retrying", next: 10 })
    store.set("session_status", "ses_done", { type: "idle" })

    reconcileActiveSessionStatuses(store, { ses_retry: { type: "running" }, ses_new: { type: "running" } })

    expect(store.data.session_status).toEqual({
      ses_stale: { type: "idle" },
      ses_retry: { type: "busy" },
      ses_done: { type: "idle" },
      ses_new: { type: "busy" },
    })
  })

  test("a deleted session leaves the home index and closes its tabs", () => {
    const queryClient = new QueryClient()
    const homeSessions = createHomeSessionIndexCache(queryClient, "server")
    queryClient.setQueryData(homeSessions.indexKey, {
      sessions: [
        { id: "ses_gone", time: { created: 1, updated: 1 } },
        { id: "ses_kept", time: { created: 1, updated: 1 } },
      ],
      eventSequence: 0,
    })
    const closed: unknown[] = []
    const listen = (event: Event) => closed.push(readSessionTabsRemovedDetail(event))
    window.addEventListener(SESSION_TABS_REMOVED_EVENT, listen)
    try {
      closeDeletedSession({
        homeSessions,
        server: "remote" as ServerConnection.Key,
        directory: "/repo",
        sessionID: "ses_gone",
      })
    } finally {
      window.removeEventListener(SESSION_TABS_REMOVED_EVENT, listen)
    }

    expect(closed).toEqual([{ server: "remote", directory: "/repo", sessionIDs: ["ses_gone"] }])
    expect(
      queryClient.getQueryData<{ sessions: { id: string }[] }>(homeSessions.indexKey)?.sessions.map((item) => item.id),
    ).toEqual(["ses_kept"])
  })
})

async function until(check: () => boolean) {
  const deadline = Date.now() + 5_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for the reconnect fixture")
    await Bun.sleep(10)
  }
}
