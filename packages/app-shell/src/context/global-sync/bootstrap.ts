import type { Project } from "@/v2-types"
import type { ServerApi, ServerSdk } from "@/utils/server"
import type { CompatibleApi, CompatibleSessionApi } from "@/utils/server-compat"
import type { PermissionRequest, QuestionRequest, ReferenceInfo } from "@/v2-types"
import type { Session } from "@/v2-wire"

import type { Config, Path, ProviderAuthResponse } from "@/v2-wire"
import type { AgentListInput, AgentListOutput, CommandInfo, CommandListInput, CommandListOutput, ProjectCurrentInput, ProjectCurrentOutput, ReferenceListInput, ReferenceListOutput } from "@/v2-wire"
import type { ProjectListOutput } from "@/v2-types"

import { showToast } from "@/utils/toast"
import { getFilename } from "@orchestra/core/util/path"
import { retry } from "@orchestra/core/util/retry"
import { batch } from "solid-js"
import { produce, reconcile, type SetStoreFunction, type Store } from "solid-js/store"
import type { State, VcsCache } from "./types"
import type { ServerSession } from "../server-session"
import {
  cmp,
  normalizeAgentList,
  normalizePermissionRequest,
  normalizeProjectInfo,
  normalizeProviderList,
} from "./utils"
import { formatServerError, isLocationNotFoundError } from "@/utils/server-errors"
import { QueryClient, queryOptions } from "@tanstack/solid-query"
import { loadMcpQuery, loadMcpResourcesQuery } from "../server-sync"
import { NormalizedProviderListResponse } from "@orchestra/session-ui/context"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"
import { normalizeSessionInfo, type AppSession } from "@/utils/session"
import type { ServerProtocol } from "@/utils/server-protocol"

type GlobalStore = {
  ready: boolean
  path: Path
  project: Project[]
  provider: NormalizedProviderListResponse
  provider_auth: ProviderAuthResponse
  config: Config
  reload: undefined | "pending" | "complete"
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    const timer = setTimeout(finish, 50)
    if (typeof requestAnimationFrame !== "function") return
    requestAnimationFrame(() => {
      setTimeout(() => {
        clearTimeout(timer)
        finish()
      }, 0)
    })
  })
}

function errors(list: PromiseSettledResult<unknown>[]) {
  return list.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => item.reason)
}

const providerRev = new Map<string, number>()

export function clearProviderRev(scope: ServerScope, directory: string) {
  providerRev.delete(ScopedKey.from(scope, directory))
}

function runAll(list: Array<() => Promise<unknown>>) {
  return Promise.allSettled(list.map((item) => item()))
}

function showErrors(input: {
  errors: unknown[]
  title: string
  translate: (key: string, vars?: Record<string, string | number>) => string
  formatMoreCount: (count: number) => string
}) {
  if (input.errors.length === 0) return
  const message = formatServerError(input.errors[0], input.translate)
  const more = input.errors.length > 1 ? input.formatMoreCount(input.errors.length - 1) : ""
  showToast({
    variant: "error",
    title: input.title,
    description: message + more,
  })
}

export const loadGlobalConfigQuery = (
  scope: ServerScope,
  sdk: ServerSdk,
  protocol?: Promise<ServerProtocol>,
  readV2?: () => Promise<Config>,
) =>
  queryOptions({
    queryKey: [scope, "config"],
    queryFn: async () => {
      return readV2 ? retry(readV2) : {}
    },
  })

type ProjectApi = ServerApi["project"]

/** The provider and model groups of the current API. */
export type CatalogApi = Pick<ServerApi, "provider" | "model">

type LocationApi = ServerApi["location"]
type McpApi = ServerApi["mcp"]
type PermissionApi = ServerApi["permission"]
type QuestionApi = ServerApi["question"]
type VcsApi = ServerApi["vcs"]

export const loadProjectsQuery = (scope: ServerScope, api: ProjectApi) =>
  queryOptions({
    queryKey: [scope, "project"],
    queryFn: () =>
      retry(() =>
        api.list().then((projects) => {
          return projects
            .filter((p) => !!p?.id)
            .filter((p) => !!p.worktree && !p.worktree.includes("orchestra-test"))
            .map(normalizeProjectInfo)
            .slice()
            .sort((a, b) => cmp(a.id, b.id))
        }),
      ),
  })

export async function bootstrapGlobal(input: {
  serverSDK: ServerSdk
  readV2Config?: () => Promise<Config>
  serverAPI: CatalogApi & { readonly location: LocationApi; readonly project: ProjectApi }
  protocol?: Promise<ServerProtocol>
  scope: ServerScope
  requestFailedTitle: string
  translate: (key: string, vars?: Record<string, string | number>) => string
  formatMoreCount: (count: number) => string
  setGlobalStore: SetStoreFunction<GlobalStore>
  queryClient: QueryClient
}) {
  const slow = [
    () =>
      input.queryClient.fetchQuery(
        loadGlobalConfigQuery(input.scope, input.serverSDK, input.protocol, input.readV2Config),
      ),
    () =>
      input.queryClient.fetchQuery(
        loadProvidersQuery(input.scope, null, input.serverAPI, input.serverSDK, input.protocol),
      ),
    () => input.queryClient.fetchQuery(loadPathQuery(input.scope, null, input.serverAPI.location)),
    () =>
      input.queryClient
        .fetchQuery(loadProjectsQuery(input.scope, input.serverAPI.project))
        .then((data) => input.setGlobalStore("project", data)),
  ]
  await runAll(slow)
  // showErrors({
  //   errors: errors(),
  //   title: input.requestFailedTitle,
  //   translate: input.translate,
  //   formatMoreCount: input.formatMoreCount,
  // })
}

function groupBySession<T extends { id: string; sessionID: string }>(input: T[]) {
  return input.reduce<Record<string, T[]>>((acc, item) => {
    if (!item?.id || !item.sessionID) return acc
    const list = acc[item.sessionID]
    if (list) list.push(item)
    if (!list) acc[item.sessionID] = [item]
    return acc
  }, {})
}

function projectID(directory: string, projects: Project[]) {
  return projects.find((project) => project.worktree === directory || project.sandboxes?.includes(directory))?.id
}

function mergeSession(setStore: SetStoreFunction<State>, session: Session) {
  setStore("session", (list) => {
    const next = list.slice()
    const idx = next.findIndex((item) => item.id >= session.id)
    if (idx === -1) return [...next, session]
    if (next[idx]?.id === session.id) {
      next[idx] = session
      return next
    }
    next.splice(idx, 0, session)
    return next
  })
}

function warmSessions(input: {
  ids: string[]
  store: Store<State>
  setStore: SetStoreFunction<State>
  api: ServerApi["session"]
}) {
  const known = new Set(input.store.session.map((item) => item.id))
  const ids = [...new Set(input.ids)].filter((id) => !!id && !known.has(id))
  if (ids.length === 0) return Promise.resolve()
  return Promise.all(
    ids.map((sessionID) =>
      retry(() => input.api.get({ sessionID })).then((session) =>
        mergeSession(input.setStore, normalizeSessionInfo(session)),
      ),
    ),
  ).then(() => undefined)
}

// The directory list loads root Sessions only, and a parent finds a subagent's request by walking
// that list from the parent down. A subagent blocked on a request emits nothing, so after a reload
// the owning Session and every Session between it and its root must be indexed here. Only the
// owner must resolve; an ancestor that cannot be read leaves the chain short instead of failing
// the whole request load.
function indexRequestSessions(input: {
  ids: string[]
  directory: string
  session: ServerSession
  setStore: SetStoreFunction<State>
}) {
  const lineage = (sessionID: string | undefined): AppSession[] => {
    const session = sessionID ? input.session.get(sessionID) : undefined
    return session ? [session, ...lineage(session.parentID)] : []
  }
  return Promise.all(
    [...new Set(input.ids)]
      .filter((id) => !!id)
      .map((sessionID) =>
        input.session.lineage
          .resolve(sessionID)
          .catch(() => input.session.resolve(sessionID))
          .then(() =>
            lineage(sessionID)
              .filter((session) => !!session.parentID && session.directory === input.directory)
              .filter((session) => session.time.archived === undefined)
              .forEach((session) => mergeSession(input.setStore, session)),
          ),
      ),
  ).then(() => undefined)
}

export const loadProvidersQuery = (
  scope: ServerScope,
  directory: string | null,
  sdk: CatalogApi,
  legacy?: ServerSdk,
  protocol?: Promise<ServerProtocol>,
) =>
  queryOptions({
    queryKey: [scope, directory, "providers"],
    queryFn: () =>
      retry(async () => {
        const location = directory ? { location: { directory } } : undefined
        const [providers, models, defaultModel] = await Promise.all([
          sdk.provider.list(location),
          sdk.model.list(location),
          loadDefaultModel(sdk.model, location),
        ])
        return normalizeProviderList(providers.data, models.data, defaultModel)
      }),
  })

export async function loadDefaultModel(
  model: CatalogApi["model"],
  input?: Parameters<CatalogApi["model"]["default"]>[0],
) {
  if (typeof model.default !== "function") return null
  return model.default(input).then(
    (result) => result.data,
    (error: unknown) => {
      const cause = error instanceof Error ? error.cause : undefined
      const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
      if (status === 404 || status === 405 || status === 501) return null
      throw error
    },
  )
}

type AgentListApi = ServerApi["agent"]

type CommandListApi = ServerApi["command"]

type ReferenceListApi = ServerApi["reference"]

export const loadAgentsQuery = (
  scope: ServerScope,
  directory: string,
  sdk: AgentListApi,
  legacy?: ServerSdk,
  protocol?: Promise<ServerProtocol>,
) =>
  queryOptions({
    queryKey: [scope, directory, "agents"],
    queryFn: () =>
      retry(async () => {
        return sdk.list({ location: { directory } }).then((result) => normalizeAgentList(result.data))
      }),
  })

export const loadCommands = (
  directory: string,
  api: CommandListApi,
  legacy?: ServerSdk,
  protocol?: Promise<ServerProtocol>,
): Promise<CommandInfo[]> =>
  retry(async () => {
    return api.list({ location: { directory } }).then((result) => result.data)
  })

export const loadPathQuery = (scope: ServerScope, directory: string | null, api: LocationApi) =>
  queryOptions<Path>({
    queryKey: [scope, directory, "path"],
    queryFn: () =>
      retry(() => api.paths())
        // Without a home the folder picker still opens; a failed read must not break bootstrap.
        .then((result) => result.home)
        .catch(() => "")
        .then((home) => ({ state: "", config: "", worktree: "", directory: directory ?? "", home })),
  })

export const loadReferencesQuery = (
  scope: ServerScope,
  directory: string,
  api: ReferenceListApi,
  legacy?: ServerSdk,
  protocol?: Promise<ServerProtocol>,
) =>
  queryOptions<ReferenceInfo[]>({
    queryKey: [scope, directory, "references"] as const,
    queryFn: () =>
      retry(async () => {
        return api.list({ location: { directory } }).then((result) => result.data)
      }).catch(() => []),
    placeholderData: [],
  })

export async function bootstrapDirectory(input: {
  directory: string
  scope: ServerScope
  mcp: boolean
  sdk: ServerSdk
  api: CompatibleApi & {
    readonly agent: AgentListApi
    readonly command: CommandListApi
    readonly mcp: McpApi
    readonly permission: PermissionApi
    readonly project: ProjectApi
    readonly question: QuestionApi
    readonly reference: ReferenceListApi
    readonly session: CompatibleSessionApi
    readonly vcs: VcsApi
  }
  store: Store<State>
  setStore: SetStoreFunction<State>
  vcsCache: VcsCache
  loadSessions: (directory: string) => Promise<void> | void
  loadActiveSessions: () => Promise<unknown>
  translate: (key: string, vars?: Record<string, string | number>) => string
  global: {
    config: Config
    path: Path
    project: Project[]
    provider: NormalizedProviderListResponse
  }
  queryClient: QueryClient
  session?: ServerSession
  protocol?: Promise<ServerProtocol>
  readV2Config?: () => Promise<Config>
  /** The V2 server's branch read (`GET /api/vcs`); V1 answers through the legacy SDK. */
  branches?: (input: {
    location: { directory: string }
  }) => Promise<{ data: { branch?: string | null; default_branch?: string | null } }>
  /** Takes over the reload-failed toast when the server reports the directory no longer exists. */
  onMissingDirectory?: (directory: string) => void
}) {
  const loading = input.store.status !== "complete"
  const seededProject = projectID(input.directory, input.global.project)
  const seededPath = input.global.path.directory === input.directory ? input.global.path : undefined
  if (seededProject) input.setStore("project", seededProject)
  if (seededPath) input.setStore("path", seededPath)
  if (Object.keys(input.store.config).length === 0 && Object.keys(input.global.config).length > 0) {
    input.setStore("config", reconcile(input.global.config, { merge: false }))
  }
  if (loading) input.setStore("status", "partial")

  const revKey = ScopedKey.from(input.scope, input.directory)
  const rev = (providerRev.get(revKey) ?? 0) + 1
  providerRev.set(revKey, rev)
  const latest = () => providerRev.get(revKey) === rev
  ;(async () => {
    const slow = [
      () => Promise.resolve(input.loadSessions(input.directory)),
      () =>
        settle(
          input.setStore,
          "agent",
          input.queryClient
            .ensureQueryData(loadAgentsQuery(input.scope, input.directory, input.api.agent, input.sdk, input.protocol))
            .then((data) => input.setStore("agent", data)),
          latest,
        ),
      () =>
        settle(
          input.setStore,
          "config",
          retry(async () => {
            if (!input.readV2Config) return
            const data = await input.readV2Config()
            input.setStore("config", reconcile(data, { merge: false }))
          }),
          latest,
        ),
      async () => {
        // v2 statuses come from the server-wide active session seed, whose failure is not this directory's.
        return settle(input.setStore, "session_status", input.loadActiveSessions(), latest).catch(() => undefined)
      },
      !seededProject &&
        (() =>
          retry(() => input.api.project.current({ location: { directory: input.directory } })).then((project) =>
            input.setStore("project", project.id),
          )),
      !seededPath &&
        (() =>
          input.queryClient
            .ensureQueryData(loadPathQuery(input.scope, input.directory, input.api.location))
            .then((data) => {
              const next = projectID(data.directory ?? input.directory, input.global.project)
              if (next) input.setStore("project", next)
            })),
      () =>
        retry(async () => {
          const result =
            false
              ? (await input.sdk.vcs.get()).data
              : // A server without the branch route has no branch to show; it is not retried.
                await input
                  .branches?.({ location: { directory: input.directory } })
                  .then((value) => value.data)
                  .catch(() => undefined)
          if (!result) return
          const next = { branch: result.branch ?? undefined, default_branch: result.default_branch ?? undefined }
          input.setStore("vcs", next)
          input.vcsCache.setStore("value", next)
        }),
      input.mcp &&
        (() =>
          loadCommands(input.directory, input.api.command, input.sdk, input.protocol).then((commands) =>
            input.setStore("command", commands),
          )),
      () =>
        input.queryClient.fetchQuery(
          loadReferencesQuery(input.scope, input.directory, input.api.reference, input.sdk, input.protocol),
        ),
      () =>
        retry(() =>
          (async () => {
            return input.api.permission.request
              .list({ location: { directory: input.directory } })
              .then((result: unknown) => ((result as { data: Parameters<typeof normalizePermissionRequest>[0][] }).data).map(normalizePermissionRequest))
          })().then((permissions) => {
            const ids = permissions.map((permission) => permission.sessionID)
            const grouped = groupBySession(
              permissions.filter((permission) => !!permission.id && !!permission.sessionID),
            )
            const warm = input.session
              ? indexRequestSessions({ ids, directory: input.directory, session: input.session, setStore: input.setStore })
              : warmSessions({ ids, store: input.store, setStore: input.setStore, api: input.api.session })
            return warm.then(() =>
              batch(() => {
                const current = input.session?.data.permission ?? input.store.permission
                for (const sessionID of Object.keys(current)) {
                  if (grouped[sessionID]) continue
                  if (input.session?.get(sessionID)?.directory !== input.directory) continue
                  if (input.session) input.session.set("permission", sessionID, [])
                  if (!input.session) input.setStore("permission", sessionID, [])
                }
                for (const [sessionID, permissions] of Object.entries(grouped)) {
                  const value = reconcile(
                    permissions.filter((p) => !!p?.id).sort((a, b) => cmp(a.id, b.id)),
                    { key: "id" },
                  )
                  if (input.session) input.session.set("permission", sessionID, value)
                  if (!input.session) input.setStore("permission", sessionID, value)
                }
              }),
            )
          }),
        ),
      () =>
        retry(() =>
          (async () => {
            return input.api.question.request
              .list({ location: { directory: input.directory } })
              .then((result: unknown) => (result as { data: unknown[] }).data)
          })().then((questions) => {
            const ids = (questions as QuestionRequest[]).map((question) => question.sessionID)
            const grouped = groupBySession(
              (questions as QuestionRequest[]).filter((question) => !!question.id && !!question.sessionID),
            )
            const warm = input.session
              ? indexRequestSessions({ ids, directory: input.directory, session: input.session, setStore: input.setStore })
              : warmSessions({ ids, store: input.store, setStore: input.setStore, api: input.api.session })
            return warm.then(() =>
              batch(() => {
                const current = input.session?.data.question ?? input.store.question
                for (const sessionID of Object.keys(current)) {
                  if (grouped[sessionID]) continue
                  if (input.session?.get(sessionID)?.directory !== input.directory) continue
                  if (input.session) input.session.set("question", sessionID, [])
                  if (!input.session) input.setStore("question", sessionID, [])
                }
                for (const [sessionID, questions] of Object.entries(grouped)) {
                  const value = reconcile(
                    questions.filter((q) => !!q?.id).sort((a, b) => cmp(a.id, b.id)),
                    { key: "id" },
                  )
                  if (input.session) input.session.set("question", sessionID, value)
                  if (!input.session) input.setStore("question", sessionID, value)
                }
              }),
            )
          }),
        ),
      () => Promise.resolve(input.loadSessions(input.directory)),
      input.mcp &&
        (() =>
          input.queryClient.fetchQuery(
            loadMcpQuery(input.scope, input.directory, input.api.mcp, input.sdk, input.protocol),
          )),
      input.mcp &&
        (() =>
          input.queryClient.fetchQuery(
            loadMcpResourcesQuery(input.scope, input.directory, input.api.mcp, input.sdk, input.protocol),
          )),
      () =>
        input.queryClient
          .fetchQuery(loadProvidersQuery(input.scope, input.directory, input.api, input.sdk, input.protocol))
          .catch((err) => {
            // The run's failures below hand a missing directory over once.
            if (input.onMissingDirectory && isLocationNotFoundError(err)) throw err
            const project = getFilename(input.directory)
            showToast({
              variant: "error",
              title: input.translate("toast.project.reloadFailed.title", { project }),
              description: formatServerError(err, input.translate),
            })
          }),
    ].filter(Boolean) as (() => Promise<any>)[]

    await waitForPaint()
    const slowErrs = errors(await runAll(slow))
    const missing = input.onMissingDirectory && slowErrs.some(isLocationNotFoundError)
    if (missing) input.onMissingDirectory?.(input.directory)
    if (slowErrs.length > 0 && !missing) {
      console.error("Failed to finish bootstrap instance", slowErrs[0])
      const project = getFilename(input.directory)
      showToast({
        variant: "error",
        title: input.translate("toast.project.reloadFailed.title", { project }),
        description: formatServerError(slowErrs[0], input.translate),
      })
    }

    if (loading && slowErrs.length === 0) input.setStore("status", "complete")
  })()
}

// Readers that need one resource must not wait for every other bootstrap read to succeed.
// Runs of one directory overlap, and every successful read writes its data, which no failed read
// removes. So any run's success records "ready", and only the latest run's failure records "failed",
// never over a success: the flag must not deny data a successful read put in the store.
function settle(
  setStore: SetStoreFunction<State>,
  resource: keyof State["load"],
  read: Promise<unknown>,
  latest: () => boolean,
) {
  return read.then(
    () => setStore("load", resource, "ready"),
    (error: unknown) => {
      if (latest()) setStore("load", resource, (current) => (current === "ready" ? current : "failed"))
      throw error
    },
  )
}
