import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import type { Orchestra } from "@orchestra/client"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"
import { terminal, type Prompter } from "../prompt"

export default Runtime.handler(
  Commands.commands.providers.commands.logout,
  Effect.fn("cli.providers.logout")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const name = yield* Effect.promise(() => logout(client, terminal, process.cwd(), Option.getOrUndefined(input.provider)))
    process.stdout.write(`Logged out of ${name}` + EOL)
  }),
)

/** Removes every stored credential of one provider and returns the provider's name. */
export async function logout(
  client: ReturnType<typeof Orchestra.make>,
  prompter: Prompter,
  directory: string,
  provider: string | undefined,
) {
  const location = { directory }
  const configured = (await client.integrations.list({ location })).data.flatMap((integration) => {
    const credentials = integration.connections.flatMap((connection) => (connection.type === "credential" ? [connection.id] : []))
    return credentials.length === 0 ? [] : [{ integration, credentials }]
  })
  if (configured.length === 0) throw new Error("No credentials found")
  const chosen = provider
    ? configured.find(
        (item) =>
          item.integration.id === provider || item.integration.name.toLowerCase() === provider.toLowerCase(),
      )
    : await prompter.select(
        "Select provider",
        configured.map((item) => ({ label: item.integration.name, value: item })),
      )
  if (!chosen) throw new Error(`Unknown configured provider "${provider}"`)
  for (const credentialID of chosen.credentials) await client.credentials.remove({ credentialID, location })
  return chosen.integration.name
}
