import type { ServerSDK } from "@/context/server-sdk"
import { authenticateMcpV2 } from "@/context/global-sync/mcp"
import type { McpEntry, McpServerConfig, McpStatus } from "./mcp-model"

// One profile's MCP reads and writes through the current API: status, resolved config, the profile's own
// entries, tool names, connection, OAuth sign-in and config writes.
export function createMcpSource(input: {
  directory: string
  serverSDK: ServerSDK
  /** Opens a sign-in's authorization URL. */
  open: (url: string) => void
}) {
  const location = { directory: input.directory }
  const api = () => input.serverSDK.api.mcp

  return {
    async status(): Promise<Record<string, McpStatus>> {
      const listed = await api().list({ location })
      return Object.fromEntries(listed.data.map((server) => [server.name, server.status]))
    },
    // The server's resolved config, already reduced to type/command/url by the server.
    async config(): Promise<Record<string, McpEntry>> {
      return (await api().config({ location })).data
    },
    // The profile files' own entries, unresolved; the only source the Configure dialog prefills from.
    async entries(): Promise<Record<string, McpEntry>> {
      return (await api().entries({ location })).data
    },
    async tools(): Promise<Record<string, string[]>> {
      const listed = await api().tools({ location })
      return Object.fromEntries(Object.entries(listed.data).map(([name, tools]) => [name, [...tools]]))
    },
    async connect(name: string) {
      await api().connect({ server: name, location })
    },
    async disconnect(name: string) {
      await api().disconnect({ server: name, location })
    },
    // Resolves when the browser sign-in finishes, so the caller can abort the wait.
    async authenticate(name: string, signal?: AbortSignal) {
      await authenticateMcpV2({
        start: () => input.serverSDK.orchestra.mcp.authStart({ server: name, location }, { signal }),
        status: () =>
          api()
            .list({ location })
            .then((listed) => listed.data.find((server) => server.name === name)?.status.status),
        open: input.open,
        signal,
      })
    },
    // Sessions a config write would stop. A V2 config write reconnects only the edited server, so none.
    async working() {
      return 0
    },
    async save(name: string, config: McpServerConfig) {
      await api().add({ server: name, location, config })
    },
    async remove(name: string) {
      await api().remove({ server: name, location })
    },
  }
}
