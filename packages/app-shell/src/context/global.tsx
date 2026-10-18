import { createSimpleContext } from "@orchestra/ui/context"
import { type Accessor, createEffect, createMemo, createRoot, getOwner, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { createServerProjects, RECENTLY_CLOSED_DISPLAY_LIMIT, ServerConnection, useServer } from "./server"
import { pathKey } from "@/utils/path-key"
import { useServerHealth } from "@/utils/server-health"
import { createServerSdkContext } from "./server-sdk"
import { createServerSyncContext } from "./server-sync"
import { QueryClient } from "@tanstack/solid-query"
import type { ServerScope } from "@/utils/server-scope"

export const { use: useGlobal, provider: GlobalProvider } = createSimpleContext({
  name: "Global",
  init: () => {
    const server = useServer()
    const serverHealth = useServerHealth(
      () => server.list,
      () => true,
    )
    const [store, setStore] = createStore({
      settings: {
        serverKey: undefined as ServerConnection.Key | undefined,
      },
    })

    const settingsServer = createMemo(() => {
      const list = server.list
      return list.find((conn) => ServerConnection.key(conn) === store.settings.serverKey) ?? list[0]
    })

    createEffect(() => {
      const conn = settingsServer()
      const key = conn ? ServerConnection.key(conn) : undefined
      if (store.settings.serverKey !== key) setStore("settings", "serverKey", key)
    })

    const ensureServerCtx = createServerContextCache(
      () => server.list,
      (conn) => {
        const key = ServerConnection.key(conn)
        return createServerCtx(conn, server.scope(key), server.projects.forServer(key))
      },
    )

    return {
      servers: {
        list: () => server.list,
        health: serverHealth,
      },
      settings: {
        server: {
          get key() {
            return store.settings.serverKey
          },
          selected: settingsServer,
          set(key: ServerConnection.Key) {
            if (store.settings.serverKey !== key) setStore("settings", "serverKey", key)
          },
        },
      },
      ensureServerCtx(conn: ServerConnection.Any) {
        return ensureServerCtx(conn)
      },
    }
  },
})

// Tab/project identity stays stable; transport credentials belong to a disposable context lifetime.
export function createServerContextCache<T>(
  servers: Accessor<ServerConnection.Any[]>,
  create: (conn: ServerConnection.Any) => T,
) {
  const owner = getOwner()
  const contexts = new Map<ServerConnection.Key, { identity: string; dispose: () => void; value: T }>()
  const ensure = (input: ServerConnection.Any) => {
    const key = ServerConnection.key(input)
    // Callers may still hold a previous connection object after editing the same server.
    const conn = servers().find((item) => ServerConnection.key(item) === key) ?? input
    const identity = JSON.stringify([
      conn.type,
      conn.http.url,
      conn.http.username,
      conn.http.password,
      conn.type === "http" && conn.authToken,
    ])
    const existing = contexts.get(key)
    if (existing?.identity === identity) return existing.value
    existing?.dispose()
    const root = createRoot(
      (dispose) => ({
        identity,
        dispose,
        value: create({ ...conn, http: { ...conn.http } }),
      }),
      owner,
    )
    contexts.set(key, root)
    return root.value
  }
  createEffect(() => {
    const list = servers()
    list.forEach(ensure)
    contexts.forEach((context, key) => {
      if (list.some((conn) => ServerConnection.key(conn) === key)) return
      context.dispose()
      contexts.delete(key)
    })
  })
  onCleanup(() => {
    contexts.forEach((context) => context.dispose())
    contexts.clear()
  })
  return ensure
}

function createServerCtx(
  conn: ServerConnection.Any,
  scope: ServerScope,
  projects: ReturnType<typeof createServerProjects>,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnReconnect: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      },
    },
  })
  onCleanup(() => queryClient.clear())
  const sdk = createServerSdkContext(conn, scope)
  const sync = createServerSyncContext(sdk)

  function enrich(project: { worktree: string; expanded: boolean }) {
    const [childStore] = sync.child(project.worktree, { bootstrap: false })
    const projectID = childStore.project
    const metadata = projectID
      ? sync.data.project.find((x) => x.id === projectID)
      : sync.data.project.find((x) => x.worktree === project.worktree)

    // Preserve local icon override from per-workspace localStorage cache (childStore.icon).
    // Without this, different subdirectories of the same git repo would share the same
    // icon from the database instead of using their individual overrides.
    const base = { ...metadata, ...project }
    if (childStore.icon) {
      return { ...base, icon: { ...base.icon, override: childStore.icon } }
    }
    return base
  }

  const projectsList = createMemo(() => projects.list().map(enrich))
  const recentlyClosedList = createMemo(() => {
    const known = new Set(sync.data.project.map((project) => pathKey(project.worktree)))
    return projects
      .recentlyClosed()
      .filter((worktree) => known.has(pathKey(worktree)))
      .slice(0, RECENTLY_CLOSED_DISPLAY_LIMIT)
      .map((worktree) => enrich({ worktree, expanded: false }))
  })

  const isLocal =
    (conn?.type === "sidecar" && conn.variant === "base") || (conn?.type === "http" && isLocalHost(conn.http.url))

  return {
    queryClient,
    sdk,
    sync,
    isLocal,
    projects: {
      ...projects,
      list: projectsList,
      recentlyClosed: recentlyClosedList,
    },
  }
}

export type ServerCtx = ReturnType<typeof createServerCtx>

function isLocalHost(url: string) {
  const host = url.replace(/^https?:\/\//, "").split(":")[0]
  if (host === "localhost" || host === "127.0.0.1") return "local"
}
