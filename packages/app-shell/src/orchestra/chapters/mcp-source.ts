import type { ServerSDK } from "@/context/server-sdk"
import { authenticateMcpV2 } from "@/context/global-sync/mcp"
import type { McpEntry, McpServerConfig, McpStatus } from "./mcp-model"

// One profile's MCP reads and writes: status, connection, OAuth sign-in and config writes through the current API.
// The V1-only reads (resolved config, profile entries, tools, busy sessions) answer empty, null or zero.
export function createMcpSource(input: {
  directory: string
  serverSDK: ServerSDK
  /** Opens a sign-in's authorization URL. */
  open: (url: string) => void
}) {
  const location = { directory: input.directory }
  const api = () => input.serverSDK.api.mcp

  return {
    v1: async () => false,
    async status(): Promise<Record<string, McpStatus>> {
      const listed = await api().list({ location })
      return Object.fromEntries(listed.data.map((server) => [server.name, server.status]))
    },
    async config(): Promise<Record<string, McpEntry>> {
      return {}
    },
    async entries(): Promise<Record<string, McpEntry> | null> {
      return null
    },
    async tools(): Promise<Record<string, string[]> | null> {
      return null
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
