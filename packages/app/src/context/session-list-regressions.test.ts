import { afterEach, expect, test } from "bun:test"
import { createComponent } from "solid-js"
import { render } from "solid-js/web"
import { produce } from "solid-js/store"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import type { ServerEvent, ServerSDK } from "./server-sdk"
import { createApiForServer, createSdkForServer } from "@/utils/server"
import { createCompatibleApi } from "@/utils/server-compat"
// This browser loader lives outside the composite src project; keep it out of the static typecheck graph.
const { solidDom }: { solidDom: (specifier: string, directory: string) => string } = await import(
  Bun.resolveSync("../../test-browser/solid-dom", import.meta.dir)
)

const { createServerSyncContextInner }: typeof import("./server-sync") = await import(solidDom("./server-sync", import.meta.dir))
const { createDirSyncContext }: typeof import("./directory-sync") = await import(solidDom("./directory-sync", import.meta.dir))
const { PlatformProvider }: typeof import("./platform") = await import(solidDom("./platform", import.meta.dir))
const { LanguageProvider }: typeof import("./language") = await import(solidDom("./language", import.meta.dir))
const { ServerScope }: typeof import("@/utils/server-scope") = await import(solidDom("@/utils/server-scope", import.meta.dir))

const id = "ses_pending_list"
const disposals: VoidFunction[] = []
afterEach(() => disposals.splice(0).forEach((dispose) => dispose()))

function fixture(origin = "https://pending-list.test") {
  const gate = { pending: undefined as Promise<void> | undefined, started: Promise.withResolvers<void>() }
  const requests: Request[] = []
  const canonical = { updated: 1, archived: undefined as number | undefined }
  const row = () => ({
    id, projectID: "project", title: "Pending list", location: { directory: "/repo" },
    parentID: undefined as string | undefined,
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: canonical.updated, archived: canonical.archived },
  })
  const page = { rows: () => [row()] }
  const fetcher = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    const pathname = new URL(request.url).pathname
    if (pathname === "/api/session") {
      const snapshot = page.rows()
      gate.started.resolve()
      await gate.pending
      return Response.json({ data: snapshot, cursor: {} })
    }
    if (pathname === "/api/session/active") return Response.json({ data: {} })
    if (pathname === `/api/session/${id}`) return Response.json({ data: row() })
    if (pathname.endsWith("/project")) return Response.json({ data: [] })
    if (pathname.endsWith("/model/default")) return Response.json({ data: null })
    if (pathname.includes("resource")) return Response.json({ data: { resources: [], templates: [] } })
    return Response.json({ data: [] })
  }, { preconnect: fetch.preconnect })
  const http = { url: origin }
  const protocol = Promise.resolve("v2" as const)
  const client = createSdkForServer({ server: http, fetch: fetcher, throwOnError: true })
  const api = createCompatibleApi({ protocol, current: createApiForServer({ server: http, fetch: fetcher }), legacy: () => client })
  const emitter = createGlobalEmitter<Record<string, ServerEvent>>()
  const sdk = {
    server: { type: "http", http }, scope: ServerScope.local, protocol, client, api,
    createClient: () => client,
    event: { listen: emitter.listen.bind(emitter), start: async () => {} },
  } as unknown as ServerSDK
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const ready = Promise.withResolvers<ReturnType<typeof createServerSyncContextInner>>()
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return createComponent(LanguageProvider, {
      locale: "en", get children() { return createComponent(QueryClientProvider, {
        client: query, get children() { return createComponent(() => {
          ready.resolve(createServerSyncContextInner(sdk))
          return undefined
        }, {}) },
      }) },
    }) },
  }), document.createElement("div"))
  disposals.push(() => { dispose(); query.clear() })
  const emit = (archived: number | undefined, timestamp: number, seq: number, directory = "/repo") => {
    canonical.updated = timestamp
    canonical.archived = archived
    emitter.emit(directory, {
      type: "session.next.archive.changed",
      properties: { sessionID: id, timestamp, archived: archived ?? null },
      current: { durable: { seq } },
    } as unknown as ServerEvent)
  }
  return { gate, requests, row, page, emit, events: emitter, ready: ready.promise, sdk, canonical }
}

test.each(["directory fetch", "root bootstrap load"] as const)("pending %s cannot reinsert archived snapshot; fresh restore reveals row", async (path) => {
  const ctx = fixture()
  const sync = await ctx.ready
  const [store, setStore] = sync.child("/repo", { bootstrap: false })
  setStore("status", "partial")
  const dir = createDirSyncContext("/repo", sync, ctx.sdk)
  const gate = Promise.withResolvers<void>()
  ctx.gate.pending = gate.promise
  const pending = path === "directory fetch" ? dir.session.fetch(1) : sync.project.loadSessions("/repo")
  await ctx.gate.started.promise
  ctx.emit(20, 20, 2)
  gate.resolve()
  await pending
  expect(store.session).toEqual([])
  ctx.gate.pending = undefined
  ctx.emit(undefined, 30, 3)
  if (path === "directory fetch") await dir.session.fetch(1)
  if (path === "root bootstrap load") await sync.project.loadSessions("/repo", { limit: store.limit + 1 })
  expect(store.session.map((info) => info.id)).toEqual([id])
  expect(store.session[0]?.time.archived).toBeUndefined()
  expect(store.session[0]?.time.updated).toBe(30)
  const lists = ctx.requests.filter((request) => new URL(request.url).pathname === "/api/session")
  expect(lists.length).toBeGreaterThanOrEqual(2)
  expect(lists.every((request) => new URL(request.url).origin === "https://pending-list.test")).toBe(true)
  expect(new URL(lists[0].url).searchParams.get("directory")).toBe("/repo")
  if (path === "root bootstrap load") expect(new URL(lists[0].url).searchParams.get("parentID")).toBe("null")
})

test("index and directory setter share absent archive fence without leaking into another server or directory", async () => {
  const ctx = fixture()
  const sync = await ctx.ready
  ctx.emit(20, 20, 2)
  const [store, setStore] = sync.child("/repo", { bootstrap: false })
  setStore("status", "partial")
  const dir = createDirSyncContext("/repo", sync, ctx.sdk)
  const stale = { id, slug: id, projectID: "project", directory: "/repo", title: "Stale", version: "", time: { created: 1, updated: 1 } }
  dir.session.remember(stale)
  expect(store.session).toEqual([])
  dir.set("session", [stale])
  expect(store.session).toEqual([])
  dir.set(produce((draft) => { draft.session = [stale] }))
  expect(store.session).toEqual([])
  const other = fixture("https://other-list.test")
  const otherSync = await other.ready
  const [otherStore, otherSet] = otherSync.child("/repo", { bootstrap: false })
  otherSet("status", "partial")
  createDirSyncContext("/repo", otherSync, other.sdk).session.remember(stale)
  expect(otherStore.session.map((info) => info.id)).toEqual([id])
  const [otherDirStore, otherDirSet] = sync.child("/other", { bootstrap: false })
  otherDirSet("status", "partial")
  createDirSyncContext("/other", sync, ctx.sdk).session.remember({ ...stale, id: "ses_other", directory: "/other" })
  expect(otherDirStore.session.map((info) => info.id)).toEqual(["ses_other"])
  ctx.emit(undefined, 30, 3)
  dir.session.remember({ ...stale, time: { created: 1, updated: 30 } })
  expect(store.session.map((info) => info.id)).toEqual([id])
})

test.each(["directory truncation", "root child retention"] as const)("fenced list preserves %s", async (path) => {
  const ctx = fixture()
  const sync = await ctx.ready
  const [store, setStore] = sync.child("/repo", { bootstrap: false })
  setStore("status", "partial")
  setStore("limit", 1)
  const keep = { id: "ses_keep", slug: "keep", projectID: "project", directory: "/repo", title: "Keep", version: "", time: { created: 1, updated: 1 } }
  setStore("session", [keep, { ...keep, id: "ses_child", parentID: keep.id }])
  ctx.page.rows = () => [ctx.row(), { ...ctx.row(), id: keep.id }]
  const gate = Promise.withResolvers<void>()
  ctx.gate.pending = gate.promise
  const pending = path === "directory truncation"
    ? createDirSyncContext("/repo", sync, ctx.sdk).session.fetch(0)
    : sync.project.loadSessions("/repo")
  await ctx.gate.started.promise
  ctx.emit(20, 20, 2)
  gate.resolve()
  await pending
  expect(store.session.map((info) => info.id)).toEqual(path === "directory truncation" ? [keep.id] : ["ses_child", keep.id])
  expect(store.limit).toBe(1)
})

test("deletion clears archive metadata even before a directory store exists", async () => {
  const ctx = fixture()
  const sync = await ctx.ready
  ctx.emit(20, 20, 2)
  ctx.events.emit("/repo", { type: "session.deleted", properties: { sessionID: id } } as unknown as ServerEvent)
  const [store, setStore] = sync.child("/repo", { bootstrap: false })
  setStore("status", "partial")
  createDirSyncContext("/repo", sync, ctx.sdk).session.remember({
    id, slug: id, projectID: "project", directory: "/repo", title: "Created", version: "", time: { created: 1, updated: 1 },
  })
  expect(store.session.map((info) => info.id)).toEqual([id])
})

test("server index excludes an archived GET result for an existing visible row", async () => {
  const ctx = fixture()
  const sync = await ctx.ready
  const [store, setStore] = sync.child("/repo", { bootstrap: false })
  setStore("status", "partial")
  createDirSyncContext("/repo", sync, ctx.sdk).session.remember({
    id, slug: id, projectID: "project", directory: "/repo", title: "Visible", version: "", time: { created: 1, updated: 1 },
  })
  ctx.canonical.updated = 40
  ctx.canonical.archived = 40
  const pending = sync.session.resolve(id, { force: true })
  ctx.events.emit("/repo", {
    type: "session.forked", properties: { sessionID: id },
    current: { type: "session.forked", data: { sessionID: id }, created: 40 },
  } as unknown as ServerEvent)
  await pending
  await Promise.resolve()
  expect(store.session).toEqual([])
})

test("already projected archive event removes an aliased visible row", async () => {
  const ctx = fixture()
  const sync = await ctx.ready
  const [store, setStore] = sync.child("/repo", { bootstrap: false })
  setStore("status", "partial")
  createDirSyncContext("/repo", sync, ctx.sdk).session.remember({
    id, slug: id, projectID: "project", directory: "/repo", title: "Visible", version: "", time: { created: 1, updated: 1 },
  })
  ctx.emit(20, 20, 2)
  expect(store.session).toEqual([])
  ctx.emit(20, 20, 2)
  expect(store.session).toEqual([])
})
