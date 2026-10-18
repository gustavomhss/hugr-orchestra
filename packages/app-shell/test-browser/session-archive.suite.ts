import "./real-ui-solid"
import { beforeAll, beforeEach, expect, mock, test } from "bun:test"
import { createStore } from "solid-js/store"
import { createComponent } from "solid-js"
import { render } from "solid-js/web"
import { Root } from "@kobalte/core/dialog"
import { createServerSession } from "@/context/server-session"
import { createSdkForServer } from "@/utils/server"
import { SessionManagementUnsupported } from "@/utils/session-management-errors"
import { base64Encode } from "@orchestra/core/util/encode"
import {
  readSessionTabsRemovedDetail,
  SESSION_TABS_REMOVED_EVENT,
  type SessionTabsRemovedDetail,
} from "@/components/titlebar-session-events"

const servers = { A: "http://a.invalid", B: "http://b.invalid" }
let kind: "v1" | "v2" = "v1"
let active: "A" | "B" = "B"
let pathname = "/source-B/shared"
let request = Promise.withResolvers<void>()
let started = Promise.withResolvers<void>()
let missing = false
let listFailure = false
let reactive = false
let useSessionArchive: typeof import("@/pages/session/session-archive").useSessionArchive
let DialogArchivedSessions: typeof import("@/components/dialog-archived-sessions").DialogArchivedSessions
const writes: { source: string; input: unknown }[] = []
const navigated: string[] = []
const drafts: unknown[] = []
const notices: SessionTabsRemovedDetail[] = []
const toasts: unknown[] = []

function state() {
  const rows = ["shared", "neighbor"].map((id) => ({
    id, slug: id, projectID: "project", version: "", title: id, directory: "/shared/repo",
    time: { created: 1, updated: 1, archived: undefined as number | undefined },
  }))
  const [data, set] = createStore({ session: rows })
  const canonical = new Map(rows.map((row) => [row.id, structuredClone(row)]))
  const session = createServerSession(
    createSdkForServer({
      server: { url: "https://archive-fixture.test" },
      fetch: Object.assign(async (input: string | URL | Request) => {
        const id = new URL(input instanceof Request ? input.url : input).pathname.split("/").at(-1)!
        return Response.json(canonical.get(id))
      }, { preconnect: fetch.preconnect }),
    }),
    { protocol: Promise.resolve("v2") },
  )
  rows.forEach(session.remember)
  return {
    data,
    set,
    session,
    canonical,
  }
}
let stores = { A: state(), B: state() }

beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useNavigate: () => (href: string) => navigated.push(href),
    useLocation: () => ({
      get pathname() {
        return pathname
      },
    }),
  }))
  mock.module("@/context/sdk", () => ({
    useSDK: () => {
      const source = active
      const sdk = {
        scope: source,
        directory: "/shared/repo",
        protocol: Promise.resolve(kind),
        client: {
          session: {
            update: (input: unknown) => {
              writes.push({ source, input })
              started.resolve()
              return request.promise
            },
          },
        },
      }
      return () => sdk
    },
  }))
  mock.module("@/context/sync", () => ({
    useSync: () => {
      const captured = stores[active]
      return () => captured
    },
  }))
  mock.module("@/context/server-sync", () => ({
    useServerSync: () => {
      const store = stores[active]
      return () => ({ homeSessions: { remove: () => undefined, apply: () => undefined }, session: store.session })
    },
  }))
  mock.module("@/context/server-sdk", () => ({
    useServerSDK: () => {
      const captured = active
      return () => {
        const source = reactive ? active : captured
        const key = servers[source]
        return {
        scope: `${key}:${missing}`,
        server: { type: "http", http: { url: key } }, protocolKind: () => kind,
        api: { session: { list: async () => {
          if (listFailure) throw new Error("history offline")
          return { data: stores[source].data.session, cursor: {} }
        } } },
        sessionManagement: { listArchived: async () => {
          if (listFailure) throw new Error("history offline")
          return [...stores[source].canonical.values()].filter((session) => session.time.archived !== undefined)
        }, archive: async (sessionID: string, archived: boolean, directory: string) => {
          if (missing) throw new SessionManagementUnsupported()
          const store = stores[source]
          writes.push({ source, input: { sessionID, archived, directory } })
          started.resolve()
          await request.promise
          const row = store.canonical.get(sessionID)!
          store.canonical.set(sessionID, { ...row, time: { ...row.time, updated: row.time.updated + 1, archived: archived ? 5 : undefined } })
        } },
        }
      }
    },
  }))
  mock.module("@/context/tabs", () => ({ useTabs: () => ({ newDraft: (draft: unknown) => drafts.push(draft) }) }))
  mock.module("@/pages/session/session-layout", () => ({
    useSessionKey: () => ({
      params: {
        id: "shared",
        get serverKey() {
          return base64Encode(servers[active])
        },
      },
    }),
  }))
  mock.module("@/context/language", () => ({ useLanguage: () => ({ t: () => "" }) }))
  mock.module("@/utils/toast", () => ({ showToast: (toast: unknown) => toasts.push(toast) }))
  window.addEventListener(SESSION_TABS_REMOVED_EVENT, (event) => {
    const notice = readSessionTabsRemovedDetail(event)
    if (notice) notices.push(notice)
  })
  const module = await import("@/pages/session/session-archive")
  useSessionArchive = module.useSessionArchive
  const history = await import("@/components/dialog-archived-sessions")
  DialogArchivedSessions = history.DialogArchivedSessions
})

beforeEach(() => {
  kind = "v1"
  missing = false
  listFailure = false
  reactive = false
  active = "B"
  pathname = "/source-B/shared"
  request = Promise.withResolvers<void>()
  started = Promise.withResolvers<void>()
  stores = { A: state(), B: state() }
  writes.length = navigated.length = drafts.length = notices.length = toasts.length = 0
})

test("old V2 archive explains unsupported operations without removing sessions or tabs", async () => {
  kind = "v2"
  missing = true
  const action = useSessionArchive()
  expect(action.available()).toBe(true)
  await action.archive("shared")
  expect(action.available()).toBe(false)
  expect(writes).toEqual([])
  expect(notices).toEqual([])
  expect(toasts[0]).toMatchObject({ title: "Archive unavailable on this server" })
})

test("late archive stays source scoped even when its disposed SDK accessor stays frozen", async () => {
  const action = useSessionArchive()
  expect(action.available()).toBe(true)
  const pending = action.archive("shared")
  await started.promise
  active = "A"
  pathname = "/source-A/shared"
  request.resolve()
  await pending
  expect(writes).toEqual([
    { source: "B", input: { sessionID: "shared", directory: "/shared/repo", archived: true } },
  ])
  expect(stores.B.data.session.map((item) => item.id)).toEqual(["neighbor"])
  expect(stores.A.data.session.map((item) => item.id)).toEqual(["shared", "neighbor"])
  expect(notices).toEqual([{ server: servers.B, directory: "/shared/repo", sessionIDs: ["shared"] }])
  expect(navigated).toEqual([])
  expect(drafts).toEqual([])
})

test("successful archive navigates within its originating server", async () => {
  const action = useSessionArchive()
  const pending = action.archive("shared")
  await started.promise
  request.resolve()
  await pending
  expect(navigated).toEqual([`/server/${base64Encode(servers.B)}/session/neighbor`])
})

test("failed archive preserves both servers' sessions and tabs", async () => {
  const pending = useSessionArchive().archive("shared")
  await started.promise
  request.reject(new Error("archive rejected"))
  await pending
  expect(stores.B.data.session.map((item) => item.id)).toEqual(["shared", "neighbor"])
  expect(notices).toEqual([])
  expect(navigated).toEqual([])
  expect(toasts).toHaveLength(1)
})

test("V2 archive coalesces duplicate clicks until acknowledgement", async () => {
  kind = "v2"
  const action = useSessionArchive()
  const pending = action.archive("shared")
  await started.promise
  expect(action.busy("shared")).toBe(true)
  await action.archive("shared")
  expect(writes).toHaveLength(1)
  expect(stores.B.data.session.map((item) => item.id)).toEqual(["shared", "neighbor"])
  request.resolve()
  await pending
  expect(action.busy("shared")).toBe(false)
  expect(stores.B.data.session.map((item) => item.id)).toEqual(["neighbor"])
})

test("V2 restore keeps archived session intact on failure and restores within its origin scope on retry", async () => {
  kind = "v2"
  stores.B.set("session", 0, "time", "archived", 5)
  const action = useSessionArchive()
  const failed = action.restore("shared")
  await started.promise
  request.reject(new Error("restore failed"))
  expect(await failed).toBe(false)
  expect(stores.B.data.session[0].time.archived).toBe(5)
  request = Promise.withResolvers<void>()
  started = Promise.withResolvers<void>()
  const retry = action.restore("shared")
  await started.promise
  active = "A"
  pathname = "/source-A/shared"
  request.resolve()
  expect(await retry).toBe(true)
  expect(writes.at(-1)).toEqual({ source: "B", input: { sessionID: "shared", archived: false, directory: "/shared/repo" } })
  expect(stores.B.data.session.find((item) => item.id === "shared")?.time.archived).toBeUndefined()
  expect(notices).toEqual([])
})

test("real archive history DOM retries a failed load, then restores only its captured server and directory", async () => {
  kind = "v2"
  reactive = true
  listFailure = true
  stores.B.set("session", 0, "time", "archived", 5)
  const row = stores.B.canonical.get("shared")!
  stores.B.canonical.set("shared", { ...row, time: { ...row.time, archived: 5 } })
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => createComponent(Root, { open: true, get children() {
    return createComponent(DialogArchivedSessions, { directory: "/shared/repo" })
  } }), host)
  await until(() => !!host.querySelector('[role="alert"]'))
  expect(host.textContent).toContain("Could not load archived sessions.")
  listFailure = false
  const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Retry")!
  retry.click()
  await until(() => !!host.querySelector('[data-session-id="shared"]'))
  expect(host.querySelector('[data-session-id="neighbor"]')).toBeNull()
  active = "A"
  pathname = "/source-A/shared"
  const restore = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Restore session")!
  restore.click()
  await started.promise
  expect(writes).toEqual([{ source: "B", input: { sessionID: "shared", archived: false, directory: "/shared/repo" } }])
  expect(restore.disabled).toBe(true)
  request.resolve()
  await until(() => !host.querySelector('[data-session-id="shared"]'))
  expect(stores.A.data.session.map((session) => session.id)).toEqual(["shared", "neighbor"])
  expect(notices).toEqual([])
  dispose()
  host.remove()
}, 30_000)

async function until(check: () => boolean) {
  for (let turn = 0; turn < 100 && !check(); turn++) await new Promise((resolve) => setTimeout(resolve, 0))
  expect(check()).toBe(true)
}
