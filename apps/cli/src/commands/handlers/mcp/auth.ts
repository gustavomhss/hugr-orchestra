import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import type { Orchestra } from "@orchestra/client"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"
import { terminal, type Prompter } from "../prompt"

export default Runtime.handler(
  Commands.commands.mcp.commands.auth,
  Effect.fn("cli.mcp.auth")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    yield* Effect.tryPromise({
      try: () =>
        authenticate(client, terminal, {
          directory: process.cwd(),
          name: Option.getOrUndefined(input.name),
          say: (line) => process.stdout.write(line + EOL),
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    })
  }),
)

/** Starts the server's OAuth flow, takes the authorization code from the person and reports the resulting status. */
export async function authenticate(
  client: ReturnType<typeof Orchestra.make>,
  prompter: Prompter,
  options: { readonly directory: string; readonly name?: string; readonly say: (line: string) => void },
) {
  const location = { directory: options.directory }
  const servers = (await client.mcp.list({ location })).data
  if (servers.length === 0) throw new Error("No MCP servers configured")
  const server =
    options.name ?? (await prompter.select("Select MCP server to authenticate", servers.map((item) => ({ label: item.name, value: item.name }))))
  const found = servers.find((item) => item.name === server)
  if (!found) throw new Error(`MCP server not found: ${server}`)
  if (found.status.status === "disabled") throw new Error(`MCP server ${server} is disabled`)

  const start = await client.mcp.authStart({ server, location })
  options.say(`Authorize in your browser:${EOL}${start.authorizationUrl}`)
  const code = await prompter.text("Paste the authorization code here")
  if (!code) throw new Error("An authorization code is required")
  const status = await client.mcp.authCallback({ server, location, code })
  if (status.status === "connected") return options.say("Authentication successful!")
  if (status.status === "needs_client_registration")
    throw new Error(`${status.error}${EOL}Add oauth.client_id to the ${server} MCP server config`)
  if (status.status === "failed") throw new Error(`Authentication failed: ${status.error}`)
  throw new Error(`Unexpected status: ${status.status}`)
}
