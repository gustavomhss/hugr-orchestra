import type { Path, ProviderAuthResponse } from "@/v2-wire"
import type { Project } from "@/v2-types"
import type { SessionStatus } from "@/v2-wire"

import { showToast } from "@/utils/toast"
import { getFilename } from "@orchestra/core/util/path"
import { type Accessor, type ParentProps, batch, createEffect, createMemo, getOwner, on, onCleanup, onMount, untrack } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { InitError } from "../pages/error"
import { ServerSDK } from "./server-sdk"
import {
  bootstrapDirectory,
  bootstrapGlobal,
  clearProviderRev,
  loadCommands,
  type GlobalConfig,
} from "./global-sync/bootstrap"
import { createChildStoreManager } from "./global-sync/child-store"
import { applyDirectoryEvent, applyGlobalEvent, upsertDirectorySession } from "./global-sync/event-reducer"
import { estimateRootSessionTotal, loadRootSessions } from "./global-sync/session-load"
import { trimSessions } from "./global-sync/session-trim"
import type { ProjectMeta } from "./global-sync/types"
import { SESSION_RECENT_LIMIT } from "./global-sync/types"
import { formatServerError, isLocationNotFoundError } from "@/utils/server-errors"
import { queryOptions, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/solid-query"
import type { SolidQueryOptions } from "@tanstack/solid-query"
import { createRefreshQueue } from "./global-sync/queue"
import { directoryKey } from "./global-sync/utils"
import { createDirSyncContext } from "./directory-sync"
import { createSimpleContext } from "@orchestra/ui/context"
import { NormalizedProviderListResponse } from "@orchestra/session-ui/context"
import { createRefCountMap } from "@/utils/refcount"
import { createGrace } from "@/utils/grace"
import { useGlobal } from "./global"
import { ServerConnection, useServer } from "./server"
import { ServerRequired } from "@/components/server-unavailable"
import { retry } from "@orchestra/core/util/retry"
import type { ServerScope } from "@/utils/server-scope"
import { createHomeSessionIndexCache } from "./global-sync/home-session-index"
import { persisted } from "@/utils/persist"
import type { SessionActiveOutput } from "@/v2-wire"

import { authenticateMcpV2, toggleMcp } from "./global-sync/mcp"
import { createServerSession, type ServerSession } from "./server-session"
import { createProviderRefresher, makeQueryOptionsApi } from "./server-queries"
import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import { applySessionPolicyEvent, sessionManagementFences } from "./session-management-state"
import { decodeSessionLifecycleEvent, decodeSessionManagementEvent } from "@/utils/session"

export { createProviderRefresher, loadLspQuery, loadMcpQuery, loadMcpResourcesQuery } from "./server-queries"
export type { QueryOptionsApi } from "./server-queries"
export { applySessionPolicyEvent } from "./session-management-state"

type GlobalStore = {
  ready: boolean
  error?: InitError
  path: Path
  project: Project[]
  provider: NormalizedProviderListResponse
  provider_auth: ProviderAuthResponse
  config: GlobalConfig
  reload: undefined | "pending" | "complete"
}

export type JanitorReportEvent = {
  report: string
  notify: boolean
  source: string
}

const janitorReportListeners = new Set<(event: JanitorReportEvent) => void>()

export function onJanitorReport(listener: (event: JanitorReportEvent) => void) {
  janitorReportListeners.add(listener)
  return () => janitorReportListeners.delete(listener)
}

type ApiQueryOptions<T, K extends readonly unknown[]> = SolidQueryOptions<T, Error, T, K> & {
  initialData?: undefined
  queryKey: K
}

type SessionActiveApi = {
  readonly active: () => Promise<SessionActiveOutput>
}

export const loadActiveSessionsQuery = (
  scope: ServerScope,
  api: SessionActiveApi,
): ApiQueryOptions<SessionActiveOutput, readonly [ServerScope, "activeSessions"]> =>
  queryOptions<SessionActiveOutput, Error, SessionActiveOutput, readonly [ServerScope, "activeSessions"]>({
    queryKey: [scope, "activeSessions"] as const,
    queryFn: () => api.active(),
    enabled: true,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  })

export function seedActiveSessionStatuses(
  session: Pick<ServerSession, "data" | "set">,
  active: SessionActiveOutput | Record<string, SessionStatus>,
) {
  for (const sessionID of Object.keys(active)) {
    if (session.data.session_status[sessionID] !== undefined) continue
    const status = active[sessionID]
    session.set("session_status", sessionID, status?.type === "running" ? { type: "busy" } : status)
  }
}

export function createServerSyncContextInner(
  serverSDK: ServerSDK,
  options: { closeProject?: (directory: string) => void } = {},
) {
  const language = useLanguage()
  const owner = getOwner()
  if (!owner) throw new Error("ServerSync must be created within owner")

  // Every load of a project whose folder was removed fails the same way: warn once per directory, with a way out.
  const missingDirectories = new Set<string>()
  const directoryMissing = (directory: string) => {
    const key = directoryKey(directory)
    if (missingDirectories.has(key)) return
    missingDirectories.add(key)
    const closeProject = options.closeProject
    const close = closeProject && {
      label: language.t("orchestra.shell.project.close"),
      onClick: () => {
        missingDirectories.delete(key)
        closeProject(directory)
      },
    }
    showToast({
      variant: "error",
      persistent: true,
      title: language.t("orchestra.shell.project.missing.title", { project: getFilename(directory) }),
      description: language.t("orchestra.shell.project.missing.description", { directory }),
      actions: [...(close ? [close] : []), { label: language.t("common.dismiss"), onClick: "dismiss" }],
    })
  }

  const booting = new Map<string, Promise<void>>()
  const sessionLoads = new Map<string, Promise<void>>()
  const sessionMeta = new Map<string, { limit: number }>()
  const lifetime = { disposed: false }
  onCleanup(() => { lifetime.disposed = true })

  const session = createServerSession(serverSDK.api.session, serverSDK.api.message, {
    todo: (sessionID) => serverSDK.orchestra.sessions.todo({ sessionID }),
  })
  // V2 keeps only the settings the app writes (default model, shell, engines, disabled providers, tool permission
  // rules) in its global config document.
  const readV2Config = () =>
    serverSDK.orchestra.config
      .get()
      .then(
        (settings): GlobalConfig => ({
          model: settings.model,
          shell: settings.shell,
          agent: settings.agents,
          disabled_providers: [...settings.disabledProviders],
          permissions: settings.permissions,
        }),
      )
  const queryOptionsApi = makeQueryOptionsApi(
    serverSDK.scope,
    serverSDK.api,
    readV2Config,
    serverSDK.orchestra,
  )

  const [configQuery, providerQuery, pathQuery] = useQueries(() => ({
    queries: [queryOptionsApi.globalConfig(), queryOptionsApi.providers(null), queryOptionsApi.path(null)],
  }))
  const activeSessions = () =>
    loadActiveSessionsQuery(serverSDK.scope, {
      active: async () => {
        const active = await serverSDK.api.session.active()
        seedActiveSessionStatuses(session, active)
        for (const sessionID of Object.keys(active)) {
          void session.resolve(sessionID).catch(() => undefined)
        }
        return active
      },
    })
  const activeSessionsQuery = useQuery(activeSessions)

  const [globalStore, setGlobalStore] = createStore<GlobalStore>({
    get ready() {
      return !bootstrap.isPending
    },
    project: [],
    provider_auth: {},
    get path() {
      const EMPTY = { state: "", config: "", worktree: "", directory: "", home: "" }
      if (pathQuery.isLoading) return EMPTY
      return pathQuery.data ?? EMPTY
    },
    get provider() {
      const EMPTY = { all: new Map(), connected: [], default: {} }
      if (providerQuery.isLoading) return EMPTY
      return providerQuery.data ?? EMPTY
    },
    get config() {
      if (configQuery.isLoading) return {}
      return configQuery.data ?? {}
    },
    get reload() {
      return updateConfigMutation.isPending ? "pending" : undefined
    },
  })

  const queryClient = useQueryClient()
  const homeSessions = createHomeSessionIndexCache(queryClient, ServerConnection.key(serverSDK.server))
  const refreshProviders = createProviderRefresher(queryClient, serverSDK.scope, queryOptionsApi)

  let bootedAt = 0
  let bootingRoot = false
  let eventFrame: number | undefined
  let eventTimer: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => {
    if (eventFrame !== undefined) cancelAnimationFrame(eventFrame)
    if (eventTimer !== undefined) clearTimeout(eventTimer)
  })

  const setProjects = (next: Project[] | ((draft: Project[]) => Project[])) => {
    setGlobalStore("project", next)
  }

  const setBootStore = ((...input: unknown[]) => {
    if (input[0] === "project" && Array.isArray(input[1])) {
      setProjects(input[1] as Project[])
      return input[1]
    }
    return (setGlobalStore as (...args: unknown[]) => unknown)(...input)
  }) as typeof setGlobalStore

  const bootstrap = useQuery(() => ({
    queryKey: [serverSDK.scope, "bootstrap"],
    queryFn: async () => {
      await bootstrapGlobal({
        readV2Config,
        serverAPI: serverSDK.api,
        scope: serverSDK.scope,
        requestFailedTitle: language.t("common.requestFailed"),
        translate: language.t,
        formatMoreCount: (count) => language.t("common.moreCountSuffix", { count }),
        setGlobalStore: setBootStore,
        queryClient,
      })
      bootedAt = Date.now()
      return bootedAt
    },
  }))

  const set = ((...input: unknown[]) => {
    if (input[0] === "project" && (Array.isArray(input[1]) || typeof input[1] === "function")) {
      setProjects(input[1] as Project[] | ((draft: Project[]) => Project[]))
      return input[1]
    }
    return (setGlobalStore as (...args: unknown[]) => unknown)(...input)
  }) as typeof setGlobalStore

  const paused = () => untrack(() => globalStore.reload) !== undefined

  const queue = createRefreshQueue({
    paused,
    key: directoryKey,
    bootstrap: () => queryClient.fetchQuery({ queryKey: [serverSDK.scope, "bootstrap"] }),
    bootstrapInstance,
  })

  const children = createChildStoreManager({
    owner,
    scope: serverSDK.scope,
    persist: persisted,
    query: useQuery,
    isBooting: (directory) => booting.has(directory),
    isLoadingSessions: (directory) => sessionLoads.has(directory),
    onBootstrap: (directory) => {
      void bootstrapInstance(directory)
    },
    onMcp: (directory, setStore) => {
      void loadCommands(directory, serverSDK.api.command)
        .then((commands) => setStore("command", commands))
        .catch((err) => {
          if (isLocationNotFoundError(err)) return directoryMissing(directory)
          showToast({
            variant: "error",
            title: language.t("toast.project.reloadFailed.title", { project: getFilename(directory) }),
            description: formatServerError(err, language.t),
          })
        })
    },
    onDispose: (directory) => {
      const key = directoryKey(directory)
      queue.clear(key)
      sessionMeta.delete(key)
      clearProviderRev(serverSDK.scope, key)
    },
    translate: language.t,
    queryOptions: queryOptionsApi,
    global: {
      provider: globalStore.provider,
    },
  })

  async function loadSessions(directory: string, options?: { limit?: number }) {
    const key = directoryKey(directory)
    const pending = sessionLoads.get(key)
    if (pending) {
      await pending
      return loadSessions(directory, options)
    }

    children.pin(key)
    const [store, setStore] = children.child(directory, { bootstrap: false })
    const fences = sessionManagementFences(session, key)
    const meta = sessionMeta.get(key)
    const retainedLimit = Math.max(store.limit, options?.limit ?? 0, meta?.limit ?? 0)
    if (meta && meta.limit >= retainedLimit) {
      const next = trimSessions(fences.visible(store.session, session.get), {
        limit: retainedLimit,
        permission: session.data.permission,
      })
      setStore("session", reconcile(next, { key: "id" }))
      children.unpin(key)
      return
    }

    const limit = Math.max(retainedLimit + SESSION_RECENT_LIMIT, SESSION_RECENT_LIMIT)
    const promise = queryClient
      .fetchQuery({
        ...queryOptionsApi.sessions(key),
        queryFn: () =>
          serverSDK.ready
            .then(() =>
              loadRootSessions({ api: serverSDK.api.session, directory, limit }),
            )
            .then((x) => {
              const nonArchived = fences.visible((x.data ?? []).filter((s) => !!s?.id), session.get)
                .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
              const limit = Math.max(store.limit, options?.limit ?? 0, sessionMeta.get(key)?.limit ?? 0)
              const childSessions = fences.visible(store.session.filter((s) => !!s.parentID), session.get)
              const next = trimSessions([...nonArchived, ...childSessions], {
                limit,
                permission: session.data.permission,
              })
              batch(() => {
                const remembered = fences.visible(next.map(session.remember), session.get)
                setStore(
                  "sessionTotal",
                  estimateRootSessionTotal({
                    count: nonArchived.length,
                    limit: x.limit,
                    limited: x.limited,
                  }),
                )
                setStore("session", reconcile(remembered, { key: "id" }))
              })
              sessionMeta.set(key, { limit })
            })
            .catch((err) => {
              console.error("Failed to load sessions", err)
              const project = getFilename(directory)
              showToast({
                variant: "error",
                title: language.t("toast.session.listFailed.title", { project }),
                description: formatServerError(err, language.t),
              })
            })
            .then(() => null),
      })
      .then(() => {})

    sessionLoads.set(key, promise)
    void promise.finally(() => {
      sessionLoads.delete(key)
      children.unpin(key)
    })
    return promise
  }

  async function bootstrapInstance(directory: string) {
    const key = directoryKey(directory)
    if (!key) return
    const pending = booting.get(key)
    if (pending) return pending

    children.pin(key)
    const promise = Promise.resolve().then(async () => {
      const child = children.ensureChild(directory)
      const cache = children.vcsCache.get(key)
      if (!cache) return
      await bootstrapDirectory({
        directory,
        scope: serverSDK.scope,
        mcp: children.mcp(key),
        global: {
          config: globalStore.config,
          path: globalStore.path,
          project: globalStore.project,
          provider: globalStore.provider,
        },
        api: serverSDK.api,
        store: child[0],
        setStore: child[1],
        vcsCache: cache,
        loadSessions,
        loadActiveSessions: () => queryClient.ensureQueryData(activeSessions()),
        translate: language.t,
        queryClient,
        session,
        branches: (value) => serverSDK.orchestra.vcs.get(value),
        onMissingDirectory: directoryMissing,
      })
    })

    booting.set(key, promise)
    void promise.finally(() => {
      booting.delete(key)
      children.unpin(key)
    })
    return promise
  }

  const indexSession = (info: Parameters<typeof session.remember>[0]) => {
    const key = directoryKey(info.directory)
    const existing = children.children[key]
    if (!existing) return
    upsertDirectorySession(
      {
        directory: key,
        store: existing[0],
        fenceOwner: session,
        readSession: session.get,
        setStore: existing[1],
        push: queue.push,
        retainedLimit: sessionMeta.get(key)?.limit,
        sessionContent: false,
        permission: session.data.permission,
      },
      info,
      true,
    )
  }

  const publishSession = (info: Parameters<typeof session.remember>[0]) => {
    homeSessions.apply({ type: "upsert", info })
    indexSession(info)
    if (info.time.archived === undefined) return
    homeSessions.remove(info.id)
    notifySessionTabsRemoved({ server: ServerConnection.key(serverSDK.server), directory: info.directory, sessionIDs: [info.id] })
  }

  const unsub = serverSDK.event.listen((e) => {
    const directory = e.name
    const key = directoryKey(directory)
    const event = e.details
    const eventType: string = event.type
    if (eventType === "janitor.report") forwardJanitorReport(event.properties, ServerConnection.key(serverSDK.server))
    const recent = bootingRoot || Date.now() - bootedAt < 1500

    if (event.current) session.applyV2(event.current)
    const recovery = eventType === "session.next.subagent.models.changed" || eventType === "session.next.archive.changed"
      ? applySessionPolicyEvent({
          event, session, children: children.children, disposed: () => lifetime.disposed,
          indexSession: publishSession,
        })
      : session.apply(event)
    void recovery?.catch(() => {})
    const lifecycle = decodeSessionLifecycleEvent(event)
    if (lifecycle?.type === "created") homeSessions.apply({ type: "upsert", info: session.get(lifecycle.sessionID) ?? lifecycle.info })
    if (lifecycle?.type === "renamed")
      homeSessions.apply({ type: "rename", sessionID: lifecycle.sessionID, title: lifecycle.title, timestamp: lifecycle.timestamp })
    if (lifecycle?.type === "deleted") homeSessions.apply({ type: "remove", sessionID: lifecycle.sessionID })
    if (eventType === "session.next.subagent.models.changed" || eventType === "session.next.archive.changed") {
      const properties = event.properties
      if (properties && typeof properties === "object" && "sessionID" in properties && typeof properties.sessionID === "string") {
        const info = session.get(properties.sessionID)
        if (info) publishSession(info)
      }
    }
    if (eventType !== "session.next.subagent.models.changed") homeSessions.refresh(event.type)
    if (eventType === "integration.connection.updated") void refreshProviders()

    if (directory === "global") {
      if (eventType === "server.connected" && activeSessionsQuery.data === undefined && !activeSessionsQuery.isFetching)
        void activeSessionsQuery.refetch()
      applyGlobalEvent({
        event,
        refresh: () => {
          if (recent) return
          bootstrap.refetch()
        },
      })
      if (eventType === "catalog.updated" || eventType === "project.directories.updated") bootstrap.refetch()
      if (eventType === "server.connected") {
        if (recent) return
        for (const directory of Object.keys(children.children)) {
          if (!children.active(directory)) continue
          queue.push(directory)
        }
      }
      return
    }

    if (event.current?.type === "session.moved") {
      const info = session.get(event.current.data.sessionID)
      if (info) indexSession(info)
    }

    const existing = children.children[key]
    if (!existing) {
      const decoded = decodeSessionManagementEvent(event)
      if (decoded) sessionManagementFences(session, key).apply(decoded)
      if (lifecycle?.type === "deleted") sessionManagementFences(session, key).delete(lifecycle.sessionID)
      return
    }
    children.mark(key)
    if (event.current?.type === "session.moved") queue.push(key)
    const [store, setStore] = existing
    applyDirectoryEvent({
      event,
      directory,
      store,
      fenceOwner: session,
      readSession: session.get,
      setStore,
      push: (directory) => {
        if (children.active(directory)) queue.push(directory)
      },
      retainedLimit: sessionMeta.get(key)?.limit,
      sessionContent: false,
      permission: session.data.permission,
      vcsCache: children.vcsCache.get(key),
      loadReferences: () => {
        if (!children.active(key)) return
        void queryClient.fetchQuery(queryOptionsApi.references(key))
      },
    })
  })

  onCleanup(unsub)
  onCleanup(() => {
    queue.dispose()
  })
  onCleanup(() => {
    for (const directory of Object.keys(children.children)) {
      children.disposeDirectory(directoryKey(directory))
    }
  })

  onMount(() => {
    if (typeof requestAnimationFrame === "function") {
      eventFrame = requestAnimationFrame(() => {
        eventFrame = undefined
        eventTimer = setTimeout(() => {
          eventTimer = undefined
          void serverSDK.event.start()
        }, 0)
      })
    } else {
      eventTimer = setTimeout(() => {
        eventTimer = undefined
        void serverSDK.event.start()
      }, 0)
    }
  })

  const projectApi = {
    loadSessions,
    meta(directory: string, patch: ProjectMeta) {
      children.projectMeta(directory, patch)
    },
    icon(directory: string, value: string | undefined) {
      children.projectIcon(directory, value)
    },
  }

  const updateConfigMutation = useMutation(() => ({
    mutationFn: async (config: GlobalConfig) => {
      // V2 keeps the default model, shell, per-agent engines, disabled providers and tool permission rules in its
      // global config document. `permissions` is the whole ordered list and replaces the stored one.
      return serverSDK.orchestra.config.update({
        model: config.model,
        shell: config.shell,
        disabledProviders: config.disabled_providers,
        permissions: config.permissions,
        agents:
          config.agent &&
          Object.fromEntries(
            Object.entries(config.agent).flatMap(([id, agent]) => (agent?.engine ? [[id, { engine: agent.engine }]] : [])),
          ),
      })
    },
    onSuccess: () => {
      bootstrap.refetch()
      // Invalidate all provider queries so newly configured custom providers
      // appear immediately in the available provider list across all directories.
      queryClient.invalidateQueries({ queryKey: [serverSDK.scope, null, "providers"] })
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === serverSDK.scope && query.queryKey[2] === "providers",
      })
      // Open directories keep their agent list and config from their own bootstrap, and the agent list is read
      // through ensureQueryData. Drop it and re-bootstrap them so a changed engine reaches model selection at once.
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] === serverSDK.scope && query.queryKey[2] === "agents",
      })
      for (const directory of Object.keys(children.children)) {
        if (children.active(directory)) queue.push(directory)
      }
    },
  }))
  // A config update pauses the queue, and its onSuccess runs while the mutation is still pending, so the directories it
  // queues would wait for an unrelated push. Drain them once it settles, so a changed engine reaches them at once.
  createEffect(
    on(
      () => globalStore.reload,
      (reload) => {
        if (reload === undefined) queue.resume()
      },
      { defer: true },
    ),
  )

  return {
    data: globalStore,
    set,
    get ready() {
      return globalStore.ready
    },
    get error() {
      return globalStore.error
    },
    child: children.child,
    peek: children.peek,
    disableMcp: children.disableMcp,
    queryOptions: queryOptionsApi,
    refreshProviders,
    // bootstrap,
    updateConfig: updateConfigMutation.mutateAsync,
    project: projectApi,
    session,
    homeSessions,
    mcp: {
      toggle: async (directory: string, name: string, open: (url: string) => void) => {
        const key = directoryKey(directory)
        const status = children.child(key, { bootstrap: false })[0].mcp[name]?.status
        if (!status) return
        await toggleMcp({
          status,
          connect: async () => {
            await serverSDK.api.mcp.connect({ server: name, location: { directory: key } })
          },
          disconnect: async () => {
            await serverSDK.api.mcp.disconnect({ server: name, location: { directory: key } })
          },
          authenticate: async () => {
            const location = { directory: key }
            await authenticateMcpV2({
              start: () => serverSDK.orchestra.mcp.authStart({ server: name, location }),
              status: () =>
                serverSDK.api.mcp
                  .list({ location })
                  .then((result) => result.data.find((server) => server.name === name)?.status.status),
              open,
            })
          },
          refresh: async () => {
            await queryClient.refetchQueries(queryOptionsApi.mcp(key))
            await queryClient.refetchQueries(queryOptionsApi.mcpResources(key))
          },
        })
      },
    },
  }
}

const MCP_IDLE_MS = 5 * 60 * 1000

export function createServerSyncContext(
  serverSDK: ServerSDK,
  options: { closeProject?: (directory: string) => void } = {},
) {
  const inner = createServerSyncContextInner(serverSDK, options)
  // Leaving a chat for a chapter and back drops the last owner of the directory in between. Turning MCP off at that
  // moment makes the way back refetch the MCP status, its resources and the commands, so it waits for a quiet period.
  const mcp = createGrace(MCP_IDLE_MS, (dir) => inner.disableMcp(dir))
  onCleanup(mcp.clear)
  return Object.assign(inner, {
    ensureDirSyncContext: createRefCountMap(
      (dir) => {
        mcp.hold(directoryKey(dir))
        return createDirSyncContext(dir, inner, serverSDK)
      },
      mcp.drop,
      directoryKey,
    ),
  })
}

export type ServerSync = ReturnType<typeof createServerSyncContext>

const ServerSyncContext = createSimpleContext({
  name: "ServerSync",
  // Returns an accessor so the resolved server can change reactively without
  // re-instantiating the subtree (mirrors useServerSDK).
  init: (props: { server?: Accessor<ServerConnection.Any | undefined>; value?: ServerSync }) => {
    const captured = props.value
    if (captured) return () => captured
    const global = useGlobal()
    const server = useServer()

    return createMemo<ServerSync>(() => {
      const conn = props.server?.() ?? server.current
      // ServerRequired renders the unavailable state before this provider mounts without a connection.
      if (!conn) throw new Error("No server connection resolved")
      return global.ensureServerCtx(conn).sync
    })
  },
})

export const useServerSync = ServerSyncContext.use

export function ServerSyncProvider(props: ParentProps<Parameters<typeof ServerSyncContext.provider>[0]>) {
  return (
    <ServerRequired server={props.server} value={props.value}>
      <ServerSyncContext.provider {...props}>{props.children}</ServerSyncContext.provider>
    </ServerRequired>
  )
}

export function useQueryOptions() {
  const sync = useServerSync()
  return createMemo(() => sync().queryOptions)
}

function forwardJanitorReport(properties: unknown, source: string) {
  const inner =
    properties && typeof properties === "object" && "report" in properties
      ? (properties as { report?: unknown }).report
      : properties
  if (!inner || typeof inner !== "object") return
  const notify =
    properties && typeof properties === "object" && "notify" in properties
      ? (properties as { notify?: unknown }).notify !== false
      : true
  const event = { report: JSON.stringify(inner), notify, source }
  for (const listener of janitorReportListeners) listener(event)
  const api = window.api?.janitor
  if (api) void api.publish(event.report, notify, source).catch(() => undefined)
}
