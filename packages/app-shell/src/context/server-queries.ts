import type { OrchestraClient } from "../compat/sdk-v2-client"
import type { NormalizedProviderListResponse } from "@orchestra/session-ui/context"
import { queryOptions, type QueryClient, type SolidQueryOptions } from "@tanstack/solid-query"
import type {
  McpListInput,
  McpListOutput,
  McpResource,
  McpResourceCatalogInput,
  McpResourceCatalogOutput,
  McpServer,
} from "../compat/vendored-client-promise"
import type { ServerApi } from "@/utils/server"
import type { ServerScope } from "@/utils/server-scope"
import type { PathKey } from "@/utils/path-key"
import { directoryKey } from "./global-sync/utils"
import {
  loadAgentsQuery,
  loadGlobalConfigQuery,
  loadPathQuery,
  loadProjectsQuery,
  loadProvidersQuery,
  loadReferencesQuery,
} from "./global-sync/bootstrap"

type McpListApi = {
  readonly list: (input?: McpListInput) => Promise<McpListOutput>
}

type McpResourceApi = {
  readonly resource: {
    readonly catalog: (input?: McpResourceCatalogInput) => Promise<McpResourceCatalogOutput>
  }
}

type ApiQueryOptions<T, K extends readonly unknown[]> = SolidQueryOptions<T, Error, T, K> & {
  initialData?: undefined
  queryKey: K
}

export const loadMcpQuery = (
  scope: ServerScope,
  directory: string,
  api: McpListApi,
  legacy?: OrchestraClient,
  protocol?: Promise<"v1" | "v2">,
): ApiQueryOptions<Record<string, McpServer["status"]>, readonly [ServerScope, string, "mcp"]> =>
  queryOptions<
    Record<string, McpServer["status"]>,
    Error,
    Record<string, McpServer["status"]>,
    readonly [ServerScope, string, "mcp"]
  >({
    queryKey: [scope, directory, "mcp"] as const,
    queryFn: async () => {
      if ((await protocol) === "v1" && legacy) return (await legacy.mcp.status()).data ?? {}
      return api
        .list({ location: { directory } })
        .then((result) => Object.fromEntries(result.data.map((server) => [server.name, server.status])))
    },
  })

export const loadMcpResourcesQuery = (
  scope: ServerScope,
  directory: string,
  api: McpResourceApi,
  legacy?: OrchestraClient,
  protocol?: Promise<"v1" | "v2">,
): ApiQueryOptions<Record<string, McpResource>, readonly [ServerScope, string, "mcpResources"]> =>
  queryOptions<
    Record<string, McpResource>,
    Error,
    Record<string, McpResource>,
    readonly [ServerScope, string, "mcpResources"]
  >({
    queryKey: [scope, directory, "mcpResources"] as const,
    queryFn: async () => {
      if ((await protocol) === "v1" && legacy) {
        return Object.fromEntries(
          Object.entries((await legacy.experimental.resource.list()).data ?? {}).map(([key, resource]) => [
            key,
            { ...resource, server: resource.client },
          ]),
        )
      }
      return api.resource
        .catalog({ location: { directory } })
        .then((result) =>
          Object.fromEntries(result.data.resources.map((resource) => [`${resource.server}:${resource.uri}`, resource])),
        )
    },
    placeholderData: {},
  })

export const loadLspQuery = (scope: ServerScope, directory: string, sdk: OrchestraClient) =>
  queryOptions({
    queryKey: [scope, directory, "lsp"] as const,
    queryFn: () => sdk.lsp.status().then((r) => r.data ?? []),
  })

export function makeQueryOptionsApi(
  scope: ServerScope,
  serverSDK: () => OrchestraClient,
  serverAPI: ServerApi,
  sdkFor: (dir: PathKey) => OrchestraClient,
  protocol: Promise<"v1" | "v2">,
) {
  return {
    globalConfig: () => loadGlobalConfigQuery(scope, serverSDK(), protocol),
    projects: () => loadProjectsQuery(scope, serverAPI.project),
    providers: (directory: PathKey | null) =>
      loadProvidersQuery(scope, directory, serverAPI, directory ? sdkFor(directory) : serverSDK(), protocol),
    path: (directory: PathKey | null) =>
      loadPathQuery(scope, directory, directory ? sdkFor(directory) : serverSDK(), protocol),
    agents: (directory: PathKey) => loadAgentsQuery(scope, directory, serverAPI.agent, sdkFor(directory), protocol),
    references: (directory: PathKey) =>
      loadReferencesQuery(scope, directory, serverAPI.reference, sdkFor(directory), protocol),
    mcp: (directory: PathKey) => loadMcpQuery(scope, directory, serverAPI.mcp, sdkFor(directory), protocol),
    mcpResources: (directory: PathKey) =>
      loadMcpResourcesQuery(scope, directory, serverAPI.mcp, sdkFor(directory), protocol),
    lsp: (directory: PathKey) => loadLspQuery(scope, directory, sdkFor(directory)),
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
