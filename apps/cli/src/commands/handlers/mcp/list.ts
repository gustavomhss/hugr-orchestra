import { EOL } from "os"
import * as Effect from "effect/Effect"
import type { McpListOutput, Orchestra } from "@orchestra/client"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"

export default Runtime.handler(
  Commands.commands.mcp.commands.list,
  Effect.fn("cli.mcp.list")(function* () {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const lines = yield* Effect.promise(() => listServers(client, process.cwd()))
    process.stdout.write(lines.join(EOL) + EOL)
  }),
)

export type Server = McpListOutput["data"][number]

export async function listServers(client: ReturnType<typeof Orchestra.make>, directory: string) {
  const servers = (await client.mcp.list({ location: { directory } })).data
  if (servers.length === 0) return ["No MCP servers configured", "Add servers with: orchestra mcp add"]
  return [...servers.map(describe), `${servers.length} server(s)`]
}

function describe(server: Server) {
  const status = server.status
  if (status.status === "connected") return `✓ ${server.name} connected`
  if (status.status === "disabled") return `○ ${server.name} disabled`
  if (status.status === "needs_auth") return `⚠ ${server.name} needs authentication`
  if (status.status === "needs_client_registration") return `✗ ${server.name} needs client registration${EOL}    ${status.error}`
  return `✗ ${server.name} failed${EOL}    ${status.error}`
}

/** OAuth state as far as the server reports it: a connected server holds working credentials. */
export function authText(server: Server) {
  if (server.status.status === "connected") return "✓ authenticated"
  if (server.status.status === "needs_auth") return "✗ not authenticated"
  return `⚠ ${server.status.status}`
}
