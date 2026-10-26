import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import type { Orchestra } from "@orchestra/client"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"
import { terminal, type Prompter } from "../prompt"

export default Runtime.handler(
  Commands.commands.mcp.commands.logout,
  Effect.fn("cli.mcp.logout")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const name = yield* Effect.promise(() => logout(client, terminal, process.cwd(), Option.getOrUndefined(input.name)))
    process.stdout.write(`Removed OAuth credentials for ${name}` + EOL)
  }),
)

export async function logout(
  client: ReturnType<typeof Orchestra.make>,
  prompter: Prompter,
  directory: string,
  name: string | undefined,
) {
  const location = { directory }
  const servers = (await client.mcp.list({ location })).data
  if (servers.length === 0) throw new Error("No MCP servers configured")
  const server =
    name ?? (await prompter.select("Select MCP server to logout", servers.map((item) => ({ label: item.name, value: item.name }))))
  if (!servers.some((item) => item.name === server)) throw new Error(`MCP server not found: ${server}`)
  await client.mcp.authRemove({ server, location })
  return server
}
