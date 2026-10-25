import type { Orchestra } from "@orchestra/client"
import type { NormalizedProviderListResponse } from "@orchestra/session-ui/context"
import { queryOptions, type QueryClient, type SolidQueryOptions } from "@tanstack/solid-query"
import type { McpListInput, McpListOutput, McpResourceCatalogInput, McpResourceCatalogOutput } from "@/v2-wire"
import type { McpResource, McpServer } from "@/v2-wire"


import type { ServerApi } from "@/utils/server"
import type { CompatibleApi } from "@/utils/server-compat"
import type { ServerScope } from "@/utils/server-scope"
import type { PathKey } from "@/utils/path-key"
import { directoryKey } from "./global-sync/utils"
import {
  loadAgentsQuery,
  loadGlobalConfigQuery,
  type GlobalConfig,
  loadPathQuery,
  loadProjectsQuery,
  loadProvidersQuery,
  loadReferencesQuery,
} from "./global-sync/bootstrap"

type McpListApi = ServerApi["mcp"]

type McpResourceApi = ServerApi["mcp"]

type ApiQueryOptions<T, K extends readonly unknown[]> = SolidQueryOptions<T, Error, T, K> & {
  initialData?: undefined
  queryKey: K
}

export const loadMcpQuery = (
  scope: ServerScope,
  directory: string,
  api: McpListApi,
): ApiQueryOptions<Record<string, McpServer["status"]>, readonly [ServerScope, string, "mcp"]> =>
  queryOptions<
    Record<string, McpServer["status"]>,
    Error,
    Record<string, McpServer["status"]>,
    readonly [ServerScope, string, "mcp"]
  >({
    queryKey: [scope, directory, "mcp"] as const,
    queryFn: async () => {
      return api
        .list({ location: { directory } })
        .then((result) => Object.fromEntries(result.data.map((server) => [server.name, server.status])))
    },
  })

export const loadMcpResourcesQuery = (
  scope: ServerScope,
  directory: string,
  api: McpResourceApi,
): ApiQueryOptions<Record<string, McpResource>, readonly [ServerScope, string, "mcpResources"]> =>
  queryOptions<
    Record<string, McpResource>,
    Error,
    Record<string, McpResource>,
    readonly [ServerScope, string, "mcpResources"]
  >({
    queryKey: [scope, directory, "mcpResources"] as const,
    queryFn: async () => {
      return api.resource
        .catalog({ location: { directory } })
        .then((result) =>
          Object.fromEntries(result.data.resources.map((resource) => [`${resource.server}:${resource.uri}`, resource])) as unknown as Record<string, McpResource>,
        )
    },
    placeholderData: {},
  })

export const loadLspQuery = (
  scope: ServerScope,
  directory: string,
  orchestra: ReturnType<typeof Orchestra.make> | undefined,
) =>
  queryOptions({
    queryKey: [scope, directory, "lsp"] as const,
    queryFn: async () => {
      if (!orchestra) return []
      return orchestra["server.lsp"].status({ location: { directory } }).then((result) => [...result.data])
    },
  })

export function makeQueryOptionsApi(
  scope: ServerScope,
  serverAPI: CompatibleApi,
  readV2Config?: () => Promise<GlobalConfig>,
  orchestra?: ReturnType<typeof Orchestra.make>,
) {
  return {
    globalConfig: () => loadGlobalConfigQuery(scope, readV2Config),
    projects: () => loadProjectsQuery(scope, serverAPI.project),
    providers: (directory: PathKey | null) => loadProvidersQuery(scope, directory, serverAPI),
    path: (directory: PathKey | null) => loadPathQuery(scope, directory, serverAPI.location),
    agents: (directory: PathKey) => loadAgentsQuery(scope, directory, serverAPI.agent),
    references: (directory: PathKey) => loadReferencesQuery(scope, directory, serverAPI.reference),
    mcp: (directory: PathKey) => loadMcpQuery(scope, directory, serverAPI.mcp),
    mcpResources: (directory: PathKey) => loadMcpResourcesQuery(scope, directory, serverAPI.mcp),
    lsp: (directory: PathKey) => loadLspQuery(scope, directory, orchestra),
    sessions: (directory: PathKey) => ({ queryKey: [scope, directory, "loadSessions"] as const }),
  }
}
export type QueryOptionsApi = ReturnType<typeof makeQueryOptionsApi>

export function createProviderRefresher(
  queryClient: QueryClient,
  scope: ServerScope,
  options: Pick<QueryOptionsApi, "providers">,
) {
  return async (directory?: string | null) => {
    if (directory === undefined)
      return queryClient.refetchQueries({
        predicate: (query) => query.queryKey[0] === scope && query.queryKey[2] === "providers",
      })
    const query = options.providers(directory === null ? null : directoryKey(directory))
    // Auth completion must not join a request started before the credential write. Use this owner's
    // cache, not a nested view's QueryClient, and propagate errors to the explicit caller.
    await queryClient.cancelQueries({ queryKey: query.queryKey, exact: true })
    await queryClient.fetchQuery({ ...query, staleTime: 0 })
  }
}
