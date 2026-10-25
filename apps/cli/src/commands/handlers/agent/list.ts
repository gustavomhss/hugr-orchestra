import { EOL } from "os"
import * as Effect from "effect/Effect"
import type { Orchestra } from "@orchestra/client"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"

export default Runtime.handler(
  Commands.commands.agent.commands.list,
  Effect.fn("cli.agent.list")(function* () {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const lines = yield* Effect.promise(() => listAgents(client, process.cwd()))
    process.stdout.write(lines.join(EOL) + EOL)
  }),
)

/** Every agent with its mode and permission rules, sorted by name. */
export async function listAgents(client: ReturnType<typeof Orchestra.make>, directory: string) {
  const agents = (await client.agents.list({ location: { directory } })).data
  return agents
    .toSorted((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
    .flatMap((agent) => [`${agent.name ?? agent.id} (${agent.mode})`, `  ${JSON.stringify(agent.permissions, null, 2)}`])
}
