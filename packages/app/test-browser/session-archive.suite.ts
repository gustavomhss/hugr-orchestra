import { beforeAll, beforeEach, expect, mock, test } from "bun:test"
import { createStore } from "solid-js/store"
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
let useSessionArchive: typeof import("@/pages/session/session-archive").useSessionArchive
const writes: { source: string; input: unknown }[] = []
const navigated: string[] = []
const drafts: unknown[] = []
const notices: SessionTabsRemovedDetail[] = []
const toasts: unknown[] = []

function state() {
  const [data, set] = createStore({ session: [{ id: "shared" }, { id: "neighbor" }] })
  return {
    data,
    set,
    session: { get: (id: string) => data.session.find((item) => item.id === id), evict: () => undefined },
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
    useServerSync: () => () => ({ homeSessions: { remove: () => undefined } }),
  }))
  mock.module("@/context/server-sdk", () => ({
    useServerSDK: () => {
      const key = servers[active]
      return () => ({ server: { type: "http", http: { url: key } }, protocolKind: () => kind })
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
})

beforeEach(() => {
  kind = "v1"
  active = "B"
  pathname = "/source-B/shared"
  request = Promise.withResolvers<void>()
  started = Promise.withResolvers<void>()
  stores = { A: state(), B: state() }
  writes.length = navigated.length = drafts.length = notices.length = toasts.length = 0
})

test("V2 archive is unavailable and direct calls explain the unsupported operation", async () => {
  kind = "v2"
  const action = useSessionArchive()
  expect(action.available()).toBe(false)
  await action.archive("shared")
  expect(writes).toEqual([])
  expect(notices).toEqual([])
  expect(toasts).toEqual([{ title: "Archive unavailable on this server" }])
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
    { source: "B", input: { sessionID: "shared", directory: "/shared/repo", time: { archived: expect.any(Number) } } },
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
