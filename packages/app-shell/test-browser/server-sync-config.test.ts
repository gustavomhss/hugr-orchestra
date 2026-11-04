import { expect, test } from "bun:test"
import { createComponent } from "solid-js"
import { render } from "solid-js/web"

import type { ServerSDK } from "@/context/server-sdk"
import type { ServerEvent } from "@/context/server-sdk"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { solidDom } from "./solid-dom"

// Real server sync, compiled with the app's Solid preset whichever test file loaded the plain modules first.
const { ServerScope }: typeof import("@/utils/server-scope") = await import(solidDom("@/utils/server-scope", import.meta.dir))
const { createServerSyncContextInner }: typeof import("@/context/server-sync") = await import(
  solidDom("@/context/server-sync", import.meta.dir)
)
const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))
const { LanguageProvider }: typeof import("@/context/language") = await import(solidDom("@/context/language", import.meta.dir))

async function until(predicate: () => boolean) {
  for (let n = 0; n < 200 && !predicate(); n++) await Bun.sleep(10)
  expect(predicate()).toBe(true)
}

test("a rejected global config GET still completes the global bootstrap; a later config refetch fills the config", async () => {
  type Settings = { model?: string; disabledProviders: string[] }
  const transport = { reads: 0, read: async (): Promise<Settings> => { throw new Error("config GET denied") } }
  const client = {}
  const sdk = {
    scope: ServerScope.local, server: { type: "http", http: { url: "http://config-test" } }, ready: Promise.resolve(),
    client, createClient: () => client,
    api: {
      project: { list: async () => [] }, session: {}, message: {},
      provider: { list: async () => ({ data: [] }) }, model: { list: async () => ({ data: [] }) },
    },
    orchestra: { config: { get: () => { transport.reads++; return transport.read() } }, sessions: {} },
    event: { listen: () => () => {}, start: async () => {} },
  } as unknown as ServerSDK
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false } } })
  const scope: { sync?: ReturnType<typeof createServerSyncContextInner> } = {}
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return createComponent(LanguageProvider, {
      locale: "en", get children() { return createComponent(QueryClientProvider, {
        client: queryClient, get children() { return createComponent(() => {
          scope.sync = createServerSyncContextInner(sdk)
          return undefined
        }, {}) },
      }) },
    }) },
  }), document.createElement("div"))
  const config = () => queryClient.getQueryState([ServerScope.local, "config"])
  const bootstrap = () => queryClient.getQueryState([ServerScope.local, "bootstrap"])
  try {
    await until(() => scope.sync!.ready && config()?.status === "error" && config()?.fetchStatus === "idle")
    expect(transport.reads).toBeGreaterThan(0)
    // The rejected read neither fails the bootstrap nor surfaces as a server-sync error, and the other reads land.
    expect(bootstrap()?.status).toBe("success")
    expect(scope.sync!.error).toBeUndefined()
    expect(scope.sync!.data.config).toEqual({})
    transport.read = async () => ({ model: "provider/model", disabledProviders: [] })
    await queryClient.refetchQueries({ queryKey: [ServerScope.local, "config"] })
    await until(() => config()?.status === "success")
    expect(scope.sync!.data.config).toEqual({ model: "provider/model", disabled_providers: [] })
    expect(scope.sync!.ready).toBe(true)
    expect(scope.sync!.error).toBeUndefined()
  } finally { dispose(); queryClient.clear() }
})

// Real listener/store integration, not an end-to-end SSE transport or schema test.
function mountReconnectFixture() {
  const events = createGlobalEmitter<{ [key: string]: ServerEvent }>()
  const reads = { active: 0, get: 0, list: 0 }
  const transport = {
    rejectActive: false,
    message: { id: "msg_before", type: "user", text: "Before gap", time: { created: 1 } },
  }
  const sessionID = "ses_reconnect"
  const client = {}
  const sdk = {
    scope: ServerScope.local, server: { type: "http", http: { url: "http://reconnect-test" } }, ready: Promise.resolve(),
    client, createClient: () => client,
    api: {
      session: {
        active: async () => {
          reads.active++
          if (transport.rejectActive) throw new Error("active sessions GET denied")
          return {}
        },
        get: async () => {
          reads.get++
          return {
            id: sessionID, slug: "reconnect", projectID: "project_reconnect", directory: "/repo",
            title: "Reconnect", version: "1", time: { created: 1, updated: 1 },
          }
        },
      },
      message: { list: async () => { reads.list++; return { data: [transport.message], cursor: {} } } },
      location: { paths: async () => ({ home: "" }) },
      project: { list: async () => [] },
      provider: { list: async () => ({ data: [] }) }, model: { list: async () => ({ data: [] }) },
    },
    orchestra: {
      config: { get: async () => ({ disabledProviders: [] }) },
      sessions: { todo: async () => [] },
    },
    event: { listen: events.listen, start: async () => {} },
  } as unknown as ServerSDK
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false } } })
  const scope: { sync?: ReturnType<typeof createServerSyncContextInner> } = {}
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return createComponent(LanguageProvider, {
      locale: "en", get children() { return createComponent(QueryClientProvider, {
        client: queryClient, get children() { return createComponent(() => {
          scope.sync = createServerSyncContextInner(sdk)
          return undefined
        }, {}) },
      }) },
    }) },
  }), document.createElement("div"))
  const sync = scope.sync!
  const active = () => queryClient.getQueryState([ServerScope.local, "activeSessions"])
  const settled = () => until(() => queryClient.isFetching() === 0 && !sync.session.history.loading(sessionID))
  return {
    sync, sessionID, reads, transport, active, settled,
    connected: () => events.emit("global", { id: "connection_greeting", type: "server.connected", properties: {} }),
    async prepare() {
      await until(() => sync.ready && active()?.status === "success" && queryClient.isFetching() === 0)
      expect(queryClient.getQueryState([ServerScope.local, "bootstrap"])?.status).toBe("success")
      expect(reads.active).toBe(1)
      sync.session.pin(sessionID)
      await sync.session.sync(sessionID)
      await settled()
      expect(sync.session.open()).toEqual([sessionID])
      expect(sync.session.data.session_message[sessionID]).toEqual([
        { id: "msg_before", type: "user", text: "Before gap", time: { created: 1 } },
      ])
      expect(reads.get).toBe(1)
      expect(reads.list).toBe(1)
      reads.active = 0
      reads.get = 0
      reads.list = 0
    },
    async cleanup() {
      try { await settled() }
      finally { sync.session.unpin(sessionID); dispose(); queryClient.clear() }
    },
  }
}

test("the initial global greeting does not reload a pinned session or refetch an already loaded active seed", async () => {
  const fixture = mountReconnectFixture()
  try {
    await fixture.prepare()
    fixture.connected()
    await fixture.settled()
    expect(fixture.reads).toEqual({ active: 0, get: 0, list: 0 })
    expect(fixture.sync.session.data.session_message[fixture.sessionID]?.map((message) => message.id)).toEqual(["msg_before"])
  } finally { await fixture.cleanup() }
})

test("back-to-back global greetings recover a pinned session and reconcile a stale busy status", async () => {
  const fixture = mountReconnectFixture()
  try {
    await fixture.prepare()
    fixture.sync.session.set("session_status", fixture.sessionID, { type: "busy" })
    fixture.transport.message = { id: "msg_before", type: "user", text: "Recovered gap", time: { created: 1 } }
    // Same synchronous task, with no await or clock patch between greetings. This is not an exact wall-clock bound.
    fixture.connected()
    fixture.connected()
    await until(() => fixture.reads.active === 1 && fixture.sync.session.data.session_message[fixture.sessionID]?.some((message) => message.id === "msg_before" && message.type === "user" && message.text === "Recovered gap") === true)
    await fixture.settled()
    expect(fixture.active()?.status).toBe("success")
    expect(fixture.reads).toEqual({ active: 1, get: 1, list: 1 })
    expect(fixture.sync.session.data.session_status[fixture.sessionID]).toEqual({ type: "idle" })
    expect(fixture.sync.session.data.session_message[fixture.sessionID]).toEqual([
      { id: "msg_before", type: "user", text: "Recovered gap", time: { created: 1 } },
    ])
    expect(fixture.sync.session.data.session_message[fixture.sessionID]?.some((message) => message.type === "user" && message.text === "Before gap")).toBe(false)
  } finally { await fixture.cleanup() }
})

test("back-to-back global greetings still recover the pinned page when the fresh active read fails without declaring it idle", async () => {
  const fixture = mountReconnectFixture()
  try {
    await fixture.prepare()
    fixture.sync.session.set("session_status", fixture.sessionID, { type: "busy" })
    // Initial active-query success is complete; rejection is created only when the real callback requests a fresh read.
    fixture.transport.rejectActive = true
    fixture.transport.message = { id: "msg_before", type: "user", text: "Recovered gap", time: { created: 1 } }
    fixture.connected()
    fixture.connected()
    await until(() => fixture.active()?.status === "error" && fixture.sync.session.data.session_message[fixture.sessionID]?.some((message) => message.id === "msg_before" && message.type === "user" && message.text === "Recovered gap") === true)
    await fixture.settled()
    expect(fixture.active()?.fetchStatus).toBe("idle")
    expect(fixture.reads).toEqual({ active: 1, get: 1, list: 1 })
    expect(fixture.sync.session.data.session_status[fixture.sessionID]).toEqual({ type: "busy" })
    expect(fixture.sync.session.data.session_message[fixture.sessionID]).toEqual([
      { id: "msg_before", type: "user", text: "Recovered gap", time: { created: 1 } },
    ])
    expect(fixture.sync.session.data.session_message[fixture.sessionID]?.some((message) => message.type === "user" && message.text === "Before gap")).toBe(false)
  } finally { await fixture.cleanup() }
})
