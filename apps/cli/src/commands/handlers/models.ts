import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"

export default Runtime.handler(
  Commands.commands.models,
  Effect.fn("cli.models")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const response = yield* Effect.promise(() =>
      client.models.list({ location: { directory: process.cwd() } }),
    )
    const provider = Option.getOrUndefined(input.provider)
    const selected = provider ? response.data.filter((model) => model.providerID === provider) : response.data
    if (provider && selected.length === 0) return yield* Effect.fail(new Error(`Provider not found: ${provider}`))
    if (input.json) {
      process.stdout.write(JSON.stringify(selected, null, 2) + EOL)
      return
    }
    for (const model of selected.toSorted((a, b) => a.id.localeCompare(b.id)))
      process.stdout.write(`${model.providerID}/${model.id}` + EOL)
  }),
)