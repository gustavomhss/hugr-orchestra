import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"
import { authText } from "./list"

export default Runtime.handler(
  Commands.commands.mcp.commands.auth.commands.list,
  Effect.fn("cli.mcp.auth.list")(function* () {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const servers = (yield* Effect.promise(() => client.mcp.list({ location: { directory: process.cwd() } }))).data
    if (servers.length === 0) return process.stdout.write("No MCP servers configured" + EOL)
    process.stdout.write(servers.map((server) => `${authText(server)} ${server.name}`).join(EOL) + EOL)
  }),
)
