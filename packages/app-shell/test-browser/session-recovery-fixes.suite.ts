import "./real-ui-solid"
import { afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test"
import { createComponent, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { Root } from "@kobalte/core/dialog"
import { QueryClient } from "@tanstack/solid-query"
import { Schema } from "effect"
import { SessionSubagentModels } from "@orchestra/schema/session-subagent-models"
import { createApiForServer } from "@/utils/server"
import { createCompatibleApi } from "@/utils/server-compat"
import { createSessionManagementForServer } from "@/utils/session-management"
import { createServerSession } from "@/context/server-session"
import { createHomeSessionIndexCache, homeSessionIndexKey } from "@/context/global-sync/home-session-index"
import { normalizeSessionInfo, type AppSession } from "@/utils/session"
import type { SubagentModelPolicy } from "@/components/subagent-model-rules"
import type { Provider } from "@/v2-wire"


const id = "ses_recovery_fixes"
const directory = "/repo"
const allow: SubagentModelPolicy = { mode: "allowlist", models: [{ providerID: "router", id: "team/current" }] }
const deny: SubagentModelPolicy = { mode: "allowlist", models: [] }
const model = {
  id: "team/current",
  name: "Existing model",
  providerID: "router",
  api: { id: "team/current", url: "", npm: "" },
  capabilities: {
    temperature: true,
    reasoning: false,
    attachment: false,
    toolcall: true,
    interleaved: false,
    input: { text: true, image: false, audio: false, video: false, pdf: false },
    output: { text: true, image: false, audio: false, video: false, pdf: false },
  },
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  limit: { context: 1000, output: 100 },
  status: "active" as const,
  options: {},
  headers: {},
  release_date: "2020-01-01",
}
const provider: Provider = {
  id: "router",
  name: "Router",
  source: "custom",
  env: [],
  options: {},
  models: { [model.id]: model },
}

function fixture() {
  const canonical = { policy: allow, timestamp: 20, archived: undefined as number | undefined }
  const gates = {
    page: undefined as Promise<void> | undefined,
    pageStarted: Promise.withResolvers<void>(),
    read: undefined as Promise<void> | undefined,
    readStarted: Promise.withResolvers<void>(),
    restore: undefined as Promise<void> | undefined,
    restoreStarted: Promise.withResolvers<void>(),
    resolve: undefined as Promise<void> | undefined,
    resolveStarted: Promise.withResolvers<void>(),
  }
  const requests: Request[] = []
  const info = () => ({
    id,
    projectID: "project",
    title: "Recovery session",
    location: { directory },
    subagentModels: canonical.policy,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: canonical.timestamp, archived: canonical.archived },
  })
  const fetcher = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      requests.push(request)
      if (url.pathname === "/api/session") {
        const included = url.searchParams.get("includeArchived") === "true"
        const next = url.searchParams.get("cursor")
        gates.pageStarted.resolve()
        await gates.page
        return Response.json({
          data: !included ? [] : next ? [{ ...info(), id: "ses_second", title: "Second archive" }] : [info()],
          cursor: included && !next ? { next: "opaque/next?scope=A" } : {},
        })
      }
      if (url.pathname.endsWith("/subagent-models")) {
        if (request.method === "POST") {
          const body: unknown = await request.json()
          if (!body || typeof body !== "object" || !("policy" in body)) throw new Error("Missing fixture policy")
          canonical.policy = Schema.encodeSync(SessionSubagentModels.Policy)(
            Schema.decodeUnknownSync(SessionSubagentModels.Policy)(body.policy),
          )
        }
        return Response.json({ data: canonical.policy })
      }
      if (url.pathname.endsWith("/archive")) {
        gates.restoreStarted.resolve()
        await gates.restore
        return new Response(null, { status: 204 })
      }
      const snapshot = info()
      gates.readStarted.resolve()
      gates.resolveStarted.resolve()
      await gates.read
      await gates.resolve
      return Response.json({ data: snapshot })
    },
    { preconnect: fetch.preconnect },
  )
  const http = { url: "https://origin.test", username: "owner", password: "fixture" }
  const canonicalApi = createApiForServer({ server: http, fetch: fetcher })
  const session = createServerSession(canonicalApi.session, canonicalApi.message, { todo: async () => [] })
  session.remember(normalizeSessionInfo(info()))
  session.apply({
    type: "session.next.subagent.models.changed",
    properties: { sessionID: id, timestamp: 20, policy: allow },
    current: { durable: { seq: 1 } },
  })
  const [data, set] = createStore({ session: [] as AppSession[] })
  const query = new QueryClient()
  query.setQueryData(homeSessionIndexKey(http.url), { sessions: [], eventSequence: 0 })
  const home = createHomeSessionIndexCache(query, http.url)
  const source = {
    scope: http.url,
    server: { type: "http" as const, http },
    protocol: Promise.resolve("v2" as const),
    protocolKind: () => "v2" as const,
    api: createCompatibleApi({
      protocol: Promise.resolve("v2"),
      current: canonicalApi,
    }),
    sessionManagement: createSessionManagementForServer({
      server: http,
      fetch: fetcher,
      protocol: Promise.resolve("v2"),
    }),
  }
  return {
    canonical,
    gates,
    requests,
    info,
    source,
    session,
    data,
    set,
    query,
    home,
    sync: { directory, data, set, session },
    serverState: { session, homeSessions: home, queryOptions: { providers: () => ({}) } },
  }
}

let current = fixture()
let selected = current.source
let DialogArchivedSessions: typeof import("@/components/dialog-archived-sessions").DialogArchivedSessions
let DialogSubagentModels: typeof import("@/components/dialog-subagent-models").DialogSubagentModels
let useSessionArchive: typeof import("@/pages/session/session-archive").useSessionArchive
const disposals: VoidFunction[] = []

beforeAll(async () => {
  const queries = await import("@tanstack/solid-query")
  mock.module("@tanstack/solid-query", () => ({
    ...queries,
    useQuery: () => ({
      isSuccess: true,
      status: "success",
      data: { all: new Map([[provider.id, provider]]), connected: [provider.id] },
    }),
  }))
  mock.module("@solidjs/router", () => ({
    useLocation: () => ({ pathname: "/recovery" }),
    useNavigate: () => () => undefined,
  }))
  mock.module("@/context/server-sdk", () => ({ useServerSDK: () => () => selected }))
  mock.module("@/context/sdk", () => ({ useSDK: () => () => ({ directory, scope: current.source.scope }) }))
  mock.module("@/context/sync", () => ({ useSync: () => () => current.sync }))
  mock.module("@/context/server-sync", () => ({ useServerSync: () => () => current.serverState }))
  mock.module("@/context/language", () => ({
    useLanguage: () => ({
      t: (key: string) => (key.startsWith("session.") || key === "common.retry" ? "" : key),
      direction: () => "ltr",
    }),
  }))
  mock.module("@/context/tabs", () => ({ useTabs: () => ({ newDraft() {} }) }))
  mock.module("@/pages/session/session-layout", () => ({ useSessionKey: () => ({ params: { id } }) }))
  mock.module("@/utils/toast", () => ({ showToast() {} }))
  const archived = await import("@/components/dialog-archived-sessions")
  const models = await import("@/components/dialog-subagent-models")
  const archive = await import("@/pages/session/session-archive")
  DialogArchivedSessions = archived.DialogArchivedSessions
  DialogSubagentModels = models.DialogSubagentModels
  useSessionArchive = archive.useSessionArchive
})

beforeEach(() => {
  current.query.clear()
  current = fixture()
  selected = current.source
})
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose())
  current.query.clear()
})
function mount(view: () => ReturnType<typeof createComponent>) {
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(
    () =>
      createComponent(Root, {
        open: true,
        get children() {
          return view()
        },
      }),
    host,
  )
  disposals.push(() => {
    dispose()
    host.remove()
  })
  return {
    host,
    dispose: () => {
      dispose()
      host.remove()
    },
  }
}
async function until(check: () => boolean) {
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (!check()) return
      observer.disconnect()
      resolve()
    })
    disposals.push(() => observer.disconnect())
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    if (!check()) return
    observer.disconnect()
    resolve()
  })
  expect(check()).toBe(true)
}
const canonicalReads = () =>
  current.requests.filter(
    (request) => request.method === "GET" && new URL(request.url).pathname === `/api/session/${id}`,
  )
const nativePolicy = (policy: SubagentModelPolicy, timestamp: number, seq: number) =>
  current.session.apply({
    type: "session.next.subagent.models.changed",
    properties: { sessionID: id, timestamp, policy },
    current: { durable: { seq } },
  })
const nativeArchive = (archived: number | null, timestamp: number, seq: number) =>
  current.session.apply({
    type: "session.next.archive.changed",
    properties: { sessionID: id, timestamp, archived },
    current: { durable: { seq } },
  })

test("archive history DOM uses generated includeArchived/cursor transport pinned to opening origin", async () => {
  current.canonical.archived = 20
  const gate = Promise.withResolvers<void>()
  current.gates.page = gate.promise
  const view = mount(() => createComponent(DialogArchivedSessions, { directory }))
  await current.gates.pageStarted.promise
  selected = { ...selected, scope: "https://other.test", server: { type: "http", http: { url: "https://other.test" } } }
  gate.resolve()
  await until(() => !!view.host.querySelector('[data-session-id="ses_second"]'))
  const requests = current.requests.filter((request) => new URL(request.url).pathname === "/api/session")
  expect(requests).toHaveLength(2)
  expect(requests.map((request) => new URL(request.url).searchParams.get("includeArchived"))).toEqual(["true", "true"])
  expect(new URL(requests[1].url).searchParams.get("cursor")).toBe("opaque/next?scope=A")
  expect(requests.every((request) => new URL(request.url).origin === "https://origin.test")).toBe(true)
  expect(requests.every((request) => request.headers.get("authorization") === `Basic ${btoa("owner:fixture")}`)).toBe(
    true,
  )
  view.dispose()
})

test("actual session store keeps sequenced management fields across equal-time revisionless snapshots", async () => {
  nativePolicy(deny, 20, 3)
  nativeArchive(20, 20, 4)
  const stale = normalizeSessionInfo(current.info())
  current.session.remember(stale)
  expect(current.session.get(id)?.subagentModels).toEqual(deny)
  expect(current.session.get(id)?.subagentModelsRevision).toBe(3)
  expect(current.session.get(id)?.time.archived).toBe(20)
  expect(current.session.get(id)?.archiveRevision).toBe(4)
  nativePolicy(allow, 20, 5)
  nativeArchive(null, 20, 6)
  expect(current.session.get(id)?.subagentModels).toEqual(allow)
  expect(current.session.get(id)?.time.archived).toBeUndefined()
  current.canonical.timestamp = 21
  current.canonical.policy = deny
  current.canonical.archived = 21
  const untrusted = current.session.remember(normalizeSessionInfo(current.info()))
  expect(untrusted.subagentModels).toEqual(allow)
  expect(untrusted.subagentModelsRevision).toBe(5)
  expect(untrusted.subagentModelsReadReceipt).toBeUndefined()
  expect(untrusted.time.archived).toBe(21)
  expect(untrusted.archiveRevision).toBeUndefined()
  expect(canonicalReads()).toHaveLength(0)
  const fresh = await current.session.resolve(id, { force: true })
  expect(fresh.subagentModels).toEqual(deny)
  expect(fresh.subagentModelsRevision).toBe(5)
  expect(fresh.subagentModelsChangedAt).toBe(20)
  expect(fresh.subagentModelsReadReceipt).toBe(1)
  expect(current.session.get(id)?.subagentModels).toEqual(deny)
  expect(current.session.get(id)?.subagentModelsReadReceipt).toBe(1)
  expect(canonicalReads()).toHaveLength(1)
  expect(new URL(canonicalReads()[0].url).origin).toBe("https://origin.test")
  expect(canonicalReads()[0].headers.get("authorization")).toBe(`Basic ${btoa("owner:fixture")}`)
  expect(fresh.time.updated).toBe(21)
  expect(fresh.time.archived).toBe(21)
  expect(fresh.archiveRevision).toBeUndefined()
})

test("real policy dialog retains ACK for ambiguous equal-time event until a post-event canonical read", async () => {
  const view = mount(() => createComponent(DialogSubagentModels, { directory, sessionID: id }))
  await until(() => {
    const choice = view.host.querySelector<HTMLInputElement>('input[role="switch"]')
    return !!choice?.checked && !choice.disabled && !choice.readOnly
  })
  const choice = view.host.querySelector<HTMLInputElement>('input[role="switch"]')!
  expect(canonicalReads()).toHaveLength(1)
  choice.click()
  await until(() => !!view.host.querySelector('[data-status="none-allowed"]') && !choice.readOnly)
  expect(current.requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
    `GET /api/session/${id}/subagent-models`,
    `GET /api/session/${id}`,
    `POST /api/session/${id}/subagent-models`,
    `GET /api/session/${id}`,
  ])
  const gate = Promise.withResolvers<void>()
  current.gates.read = gate.promise
  current.gates.readStarted = Promise.withResolvers<void>()
  nativePolicy(allow, 20, 2)
  expect(choice.checked).toBe(false)
  await current.gates.readStarted.promise
  expect(canonicalReads()).toHaveLength(3)
  expect(choice.checked).toBe(false)
  gate.resolve()
  expect(choice.checked).toBe(false)
  const inherit = Promise.withResolvers<void>()
  current.gates.read = inherit.promise
  current.gates.readStarted = Promise.withResolvers<void>()
  current.canonical.policy = { mode: "inherit" }
  nativePolicy(current.canonical.policy, 20, 3)
  await current.gates.readStarted.promise
  expect(view.host.querySelector('[data-status="inherited"]')).toBeNull()
  expect(choice.checked).toBe(false)
  inherit.resolve()
  await until(() => !!view.host.querySelector('[data-status="inherited"]'))
  expect(canonicalReads().length).toBeGreaterThanOrEqual(4)
  current.gates.read = undefined
  current.canonical.policy = allow
  current.canonical.timestamp = 21
  nativePolicy(allow, 21, 4)
  await until(() => choice.checked)
  view.dispose()
})

test("policy dialog with a mismatched captured directory stays disabled and cannot write", async () => {
  current.sync.directory = "/other"
  const view = mount(() => createComponent(DialogSubagentModels, { directory, sessionID: id }))
  await until(() => !!view.host.querySelector<HTMLInputElement>('input[role="switch"]')?.disabled)
  const choice = view.host.querySelector<HTMLInputElement>('input[role="switch"]')!
  expect(choice.checked).toBe(true)
  const row = view.host.querySelector<HTMLButtonElement>('[data-slot="list-item"]')
  if (!row) throw new Error("Missing policy row")
  row.click()
  expect(current.requests.filter((request) => request.method === "POST")).toEqual([])
  expect(current.canonical.policy).toEqual(allow)
  expect(choice.disabled).toBe(true)
  view.dispose()
})

test.each(["before ACK", "during GET"] as const)(
  "restore cannot resurrect caches after rearchive %s",
  async (phase) => {
    current.canonical.timestamp = 30
    current.canonical.archived = 30
    nativeArchive(30, 30, 3)
    const archived = normalizeSessionInfo(current.info())
    const gate = Promise.withResolvers<void>()
    current.gates.restore = gate.promise
    const root = createRoot((dispose) => ({
      dispose,
      action: useSessionArchive({ server: current.source, directory }),
    }))
    disposals.push(root.dispose)
    const pending = root.action.restore(id, archived)
    await current.gates.restoreStarted.promise
    nativeArchive(null, 40, 4)
    const read = Promise.withResolvers<void>()
    if (phase === "during GET") {
      current.canonical.timestamp = 40
      current.canonical.archived = undefined
      current.gates.resolve = read.promise
      gate.resolve()
      await current.gates.resolveStarted.promise
    }
    nativeArchive(50, 50, 5)
    current.canonical.timestamp = 50
    current.canonical.archived = 50
    current.home.remove(id)
    selected = {
      ...selected,
      scope: "https://other.test",
      server: { type: "http", http: { url: "https://other.test" } },
    }
    gate.resolve()
    read.resolve()
    expect(await pending).toBe(false)
    expect(current.session.get(id)?.time.archived).toBe(50)
    expect(current.data.session).toEqual([])
    expect(
      current.query.getQueryData<{ sessions: AppSession[] }>(homeSessionIndexKey("https://origin.test"))?.sessions,
    ).toEqual([])
    expect(
      current.requests
        .filter((request) => new URL(request.url).pathname.endsWith("/archive"))
        .map((request) => new URL(request.url).origin),
    ).toEqual(["https://origin.test"])
    root.dispose()
  },
)

test("successful restore projects actual merged getter result before returning", async () => {
  nativeArchive(30, 30, 3)
  const archived = { ...normalizeSessionInfo(current.info()), time: { created: 1, updated: 30, archived: 30 } }
  current.canonical.timestamp = 40
  current.canonical.archived = undefined
  const root = createRoot((dispose) => ({ dispose, action: useSessionArchive({ server: current.source, directory }) }))
  disposals.push(root.dispose)
  expect(await root.action.restore(id, archived)).toBe(true)
  expect(current.session.get(id)?.time.archived).toBeUndefined()
  expect(current.data.session[0]?.time.updated).toBe(40)
  expect(current.data.session[0]?.time.archived).toBeUndefined()
  expect(
    current.query.getQueryData<{ sessions: AppSession[] }>(homeSessionIndexKey("https://origin.test"))?.sessions[0]
      ?.time.updated,
  ).toBe(40)
})
