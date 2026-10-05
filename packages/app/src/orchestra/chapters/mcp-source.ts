import type { DirectorySDK } from "@/context/sdk"
import type { ServerConnection } from "@/context/server"
import type { ServerSDK } from "@/context/server-sdk"
import { authTokenFromCredentials } from "@/utils/server"
import { mcpErrorDetail } from "./mcp-actions"
import { type McpEntry, mcpEntry, type McpServerConfig, type McpStatus } from "./mcp-model"

type Fetch = (url: URL, init: RequestInit) => Promise<Response>

// One profile's MCP reads and writes. V1 servers expose status, config, tools and profile config
// writes; V2 servers expose status, connection and config writes through the current API.
// Query functions return null, never undefined, when the server cannot answer.
export function createMcpSource(input: {
  server: ServerConnection.Any
  directory: string
  sdk: DirectorySDK
  serverSDK: ServerSDK
  fetch: Fetch
}) {
  const v1 = () => input.serverSDK.protocol.then((protocol) => protocol === "v1")
  const location = { directory: input.directory }
  const api = () => input.serverSDK.currentApi.mcp

  return {
    v1,
    async status(): Promise<Record<string, McpStatus>> {
      if (await v1()) return (await input.sdk.client.mcp.status()).data ?? {}
      const listed = await api().list({ location })
      return Object.fromEntries(listed.data.map((server) => [server.name, server.status]))
    },
    // The server's resolved config, reduced to type/command/url before anything caches it.
    async config(): Promise<Record<string, McpEntry>> {
      if (!(await v1())) return {}
      const servers = (await input.sdk.client.config.get()).data?.mcp ?? {}
      return Object.fromEntries(Object.entries(servers).map(([name, value]) => [name, mcpEntry(value)]))
    },
    // The profile files' own entries, unresolved; the only source the Configure dialog prefills from.
    async entries(): Promise<Record<string, McpEntry> | null> {
      if (!(await v1())) return null
      const value = await request(input, "GET", "/mcp/config")
      if (!value || typeof value !== "object") return {}
      return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, mcpEntry(entry)]))
    },
    async tools(): Promise<Record<string, string[]> | null> {
      if (!(await v1())) return null
      return toolNames(await request(input, "GET", "/mcp/tools"))
    },
    async connect(name: string) {
      if (await v1()) return void (await input.sdk.client.mcp.connect({ name }))
      await api().connect({ server: name, location })
    },
    async disconnect(name: string) {
      if (await v1()) return void (await input.sdk.client.mcp.disconnect({ name }))
      await api().disconnect({ server: name, location })
    },
    async authenticate(name: string) {
      await input.sdk.client.mcp.auth.authenticate({ name })
    },
    async save(name: string, config: McpServerConfig) {
      if (await v1()) return void (await request(input, "PUT", `/mcp/${encodeURIComponent(name)}/config`, { config }))
      await api().add({ server: name, location, config })
    },
    async remove(name: string) {
      if (await v1()) return void (await request(input, "DELETE", `/mcp/${encodeURIComponent(name)}/config`))
      await api().remove({ server: name, location })
    },
  }
}

// TODO: move these calls to the legacy SDK once it is regenerated with the /mcp config and tools
// routes (its generated types are at their size waiver today).
/** Builds a request with the directory routing and credentials the legacy SDK would send. */
export function mcpRequest(
  input: { server: ServerConnection.Any; directory: string },
  method: "GET" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) {
  const url = new URL(`${input.server.http.url.replace(/\/+$/, "")}${path}`)
  const headers = new Headers()
  if (method === "GET") url.searchParams.set("directory", input.directory)
  if (method !== "GET") headers.set("x-opencode-directory", encodeURIComponent(input.directory))
  if (body !== undefined) headers.set("content-type", "application/json")
  if (input.server.http.password)
    headers.set(
      "authorization",
      `Basic ${authTokenFromCredentials({ username: input.server.http.username, password: input.server.http.password })}`,
    )
  return { url, init: { method, headers, body: body === undefined ? undefined : JSON.stringify(body) } }
}

async function request(
  input: { server: ServerConnection.Any; directory: string; fetch: Fetch },
  method: "GET" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) {
  const prepared = mcpRequest(input, method, path, body)
  const response = await input.fetch(prepared.url, prepared.init)
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(mcpErrorDetail(value) ?? `${response.status} ${response.statusText}`.trim())
  return value
}

function toolNames(value: unknown) {
  if (!value || typeof value !== "object") return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, tools]) =>
      Array.isArray(tools) ? [[name, tools.filter((tool): tool is string => typeof tool === "string")]] : [],
    ),
  )
}
