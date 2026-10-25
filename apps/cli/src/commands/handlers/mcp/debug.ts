import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import type { Orchestra } from "@orchestra/client"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"

export default Runtime.handler(
  Commands.commands.mcp.commands.debug,
  Effect.fn("cli.mcp.debug")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const lines = yield* Effect.promise(() => debug(client, process.cwd(), input.name))
    process.stdout.write(lines.join(EOL) + EOL)
  }),
)

export async function debug(client: ReturnType<typeof Orchestra.make>, directory: string, name: string) {
  const report = (await client.mcp.debug({ server: name, location: { directory } })).data
  if (!report.oauth) return [`MCP server ${name} has OAuth explicitly disabled`]
  const lines = [`Server: ${name}`, `URL: ${report.url}`]
  if (report.tokens) {
    lines.push(`  Access token: ${report.tokens.access}`)
    if (report.tokens.expiresAt) {
      const expired = report.tokens.expiresAt < Date.now() / 1000
      lines.push(`  Expires: ${new Date(report.tokens.expiresAt * 1000).toISOString()}${expired ? " (EXPIRED)" : ""}`)
    }
    if (report.tokens.refreshToken) lines.push("  Refresh token: present")
  } else lines.push("  No stored tokens")
  if (report.client) {
    lines.push(`  Client ID: ${report.client.id}`)
    if (report.client.secretExpiresAt)
      lines.push(`  Client secret expires: ${new Date(report.client.secretExpiresAt * 1000).toISOString()}`)
  }
  if (report.error) return [...lines, `Connection failed: ${report.error}`]
  const http = report.http
  if (http) {
    lines.push(`HTTP response: ${http.status} ${http.statusText}`)
    if (http.wwwAuthenticate) lines.push(`WWW-Authenticate: ${http.wwwAuthenticate}`)
    if (http.serverInfo) lines.push(`Server info: ${http.serverInfo}`)
    if (http.body) lines.push(`Response body: ${http.body}`)
  }
  const flow = report.flow
  if (flow?.result === "authenticated") lines.push("Connection successful (already authenticated)")
  if (flow?.result === "unauthorized") {
    lines.push("Initial unauthenticated check returned 401, so this server requires OAuth")
    lines.push(`OAuth flow triggered: ${flow.message}`)
    lines.push(flow.clientRegistered ? "Client ID available" : "No client ID - dynamic registration will be attempted")
  }
  if (flow?.result === "error") lines.push(`Connection error: ${flow.message}`)
  if (!flow && http && http.status >= 200 && http.status < 300)
    lines.push("Server responded successfully (no auth required or already authenticated)")
  return lines
}
