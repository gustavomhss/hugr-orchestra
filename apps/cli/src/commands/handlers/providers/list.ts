import { EOL } from "os"
import * as Effect from "effect/Effect"
import type { Orchestra } from "@orchestra/client"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"

export default Runtime.handler(
  Commands.commands.providers.commands.list,
  Effect.fn("cli.providers.list")(function* () {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const lines = yield* Effect.promise(() => listProviders(client, process.cwd()))
    process.stdout.write(lines.join(EOL) + EOL)
  }),
)

/** Stored credentials first, then provider environment variables that are set. */
export async function listProviders(client: ReturnType<typeof Orchestra.make>, directory: string) {
  const integrations = (await client.integrations.list({ location: { directory } })).data
  const credentials = integrations.flatMap((integration) =>
    integration.connections.flatMap((connection) =>
      connection.type === "credential" ? [`${integration.name}  ${connection.label}`] : [],
    ),
  )
  const environment = integrations.flatMap((integration) =>
    integration.connections.flatMap((connection) =>
      connection.type === "env" ? [`${integration.name}  ${connection.name}`] : [],
    ),
  )
  return [
    "Credentials",
    ...credentials.map((line) => `  ${line}`),
    `${credentials.length} credentials`,
    ...(environment.length === 0
      ? []
      : [
          "",
          "Environment",
          ...environment.map((line) => `  ${line}`),
          `${environment.length} environment variable${environment.length === 1 ? "" : "s"}`,
        ]),
  ]
}
