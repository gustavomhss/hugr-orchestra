import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { names, print } from "./format"

// `--json` stays the backend's state array (its F5 contract); `--research` selects the discovery seat's toolkit (J6.9).
export default Runtime.handler(
  Commands.commands.toolkit.commands.status,
  Effect.fn("cli.toolkit.status")(function* (input) {
    const worktree = Option.getOrUndefined(input.worktree)
    if (!input.research) {
      const states = yield* BackendToolkit.status()
      print(states, input.json)
      if (!input.json) yield* research(worktree, false)
      const broken = states.filter((state) => state.status === "failed" || state.status === "unsupported")
      if (broken.length) return yield* Effect.fail(new Error(`backend toolkit not usable: ${names(broken)}`))
      return
    }
    const engines = yield* research(worktree, input.json)
    // An unshipped pack is unsupported by design until it lands; only a failed acquisition makes research unusable.
    const broken = engines.filter((state) => state.status === "failed")
    if (broken.length) return yield* Effect.fail(new Error(`research toolkit not usable: ${names(broken)}`))
  }),
)

const research = Effect.fnUntraced(function* (worktree: string | undefined, json: boolean) {
  const engines = yield* ResearchToolkit.status()
  const shards = yield* ResearchToolkit.shards(worktree ?? process.cwd()).pipe(
    Effect.match({
      onSuccess: (shards): { shards: ReadonlyArray<ResearchToolkit.ShardState>; unavailable?: string } => ({ shards }),
      onFailure: (error) => ({ shards: [], unavailable: error.reason }),
    }),
  )
  if (json) {
    process.stdout.write(JSON.stringify({ engines, ...shards }, null, 2) + EOL)
    return engines
  }
  process.stdout.write("research toolkit:" + EOL)
  print(engines, false)
  if (shards.unavailable) process.stdout.write(`shards unavailable: ${shards.unavailable}` + EOL)
  shards.shards.forEach((shard) =>
    process.stdout.write(
      `shard ${shard.language} ${shard.project} ${shard.status === "skipped" ? `skipped:${shard.reason}` : shard.status}` + EOL,
    ),
  )
  return engines
})
