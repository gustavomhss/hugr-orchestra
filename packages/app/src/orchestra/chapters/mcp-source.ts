import type { DirectorySDK } from "@/context/sdk"
import type { ServerConnection } from "@/context/server"
import type { ServerSDK } from "@/context/server-sdk"
import { authTokenFromCredentials } from "@/utils/server"
import { mcpErrorDetail } from "./mcp-actions"
import type { McpServerConfig } from "./mcp-model"

// One profile's MCP reads and writes. V1 servers expose status, config, tools and profile config
// writes; V2 servers expose status, connection and config writes through the current API.
export function createMcpSource(input: {
  server: ServerConnection.Any
  directory: string
  sdk: DirectorySDK
  serverSDK: ServerSDK
  fetch: (url: URL, init: RequestInit) => Promise<Response>
}) {
  const v1 = () => input.serverSDK.protocol.then((protocol) => protocol === "v1")
  const location = { directory: input.directory }
  const api = () => input.serverSDK.currentApi.mcp

  return {
    v1,
    async config(): Promise<Record<string, unknown>> {
      if (!(await v1())) return {}
      return (await input.sdk.client.config.get()).data?.mcp ?? {}
    },
    // Undefined means the server cannot say which tools a server offers.
    async tools() {
      if (!(await v1())) return
      return toolNames(await request(input, "GET", "/mcp/tools"))
    },
    async connect(name: string) {
      if (await v1()) return input.sdk.client.mcp.connect({ name })
      return api().connect({ server: name, location })
    },
    async disconnect(name: string) {
      if (await v1()) return input.sdk.client.mcp.disconnect({ name })
      return api().disconnect({ server: name, location })
    },
    authenticate(name: string) {
      return input.sdk.client.mcp.auth.authenticate({ name })
    },
    async save(name: string, config: McpServerConfig) {
      if (await v1()) return request(input, "PUT", `/mcp/${encodeURIComponent(name)}/config`, { config })
      return api().add({ server: name, location, config })
    },
    async remove(name: string) {
      if (await v1()) return request(input, "DELETE", `/mcp/${encodeURIComponent(name)}/config`)
      return api().remove({ server: name, location })
    },
  }
}

// The legacy SDK predates the profile config routes, so they are called directly with the same
// directory routing and credentials the SDK uses.
async function request(
  input: { server: ServerConnection.Any; directory: string; fetch: (url: URL, init: RequestInit) => Promise<Response> },
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
  const response = await input.fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(mcpErrorDetail(value) ?? `${response.status} ${response.statusText}`.trim())
  return value
}

function toolNames(value: unknown) {
  if (!value || typeof value !== "object") return
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, tools]) =>
      Array.isArray(tools) ? [[name, tools.filter((tool): tool is string => typeof tool === "string")]] : [],
    ),
  )
}
