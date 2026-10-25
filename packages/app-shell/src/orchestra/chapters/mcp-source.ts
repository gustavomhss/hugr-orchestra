import type { ServerSDK } from "@/context/server-sdk"
import { authenticateMcpV2 } from "@/context/global-sync/mcp"
import { pathKey } from "@/utils/path-key"
import { type McpEntry, mcpEntry, type McpServerConfig, type McpStatus } from "./mcp-model"

// One profile's MCP reads and writes through the V2 server: status, resolved config, the profile files' own entries,
// tool names, connection, OAuth sign-in, config writes and the profile's running sessions.
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
    // The server's resolved config, reduced to type/command/url before anything caches it.
    async config(): Promise<Record<string, McpEntry>> {
      const read = await input.serverSDK.orchestra.mcp.config({ location })
      return Object.fromEntries(Object.entries(read.data.servers).map(([name, value]) => [name, mcpEntry(value)]))
    },
    // The profile files' own entries, unresolved; the only source the Configure dialog prefills from.
    async entries(): Promise<Record<string, McpEntry> | null> {
      const read = await input.serverSDK.orchestra.mcp.config({ location })
      return Object.fromEntries(Object.entries(read.data.entries).map(([name, value]) => [name, mcpEntry(value)]))
    },
    async tools(): Promise<Record<string, string[]> | null> {
      const read = await input.serverSDK.orchestra.mcp.tools({ location })
      return Object.fromEntries(Object.entries(read.data).map(([name, names]) => [name, [...names]]))
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
    // Sessions of this profile mid-turn. A config write reloads the profile's servers, which interrupts them.
    async working() {
      const orchestra = input.serverSDK.orchestra
      const running = Object.keys((await orchestra.sessions.active()).data)
      const found = await Promise.all(
        running.map((sessionID) =>
          orchestra.sessions.get({ sessionID }).then(
            (session) => pathKey(session.data.location.directory) === pathKey(input.directory),
            () => false,
          ),
        ),
      )
      return found.filter(Boolean).length
    },
    async save(name: string, config: McpServerConfig) {
      await api().add({ server: name, location, config })
    },
    async remove(name: string) {
      await api().remove({ server: name, location })
    },
  }
}
