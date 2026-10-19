import type { Argv } from "yargs"
import { Effect } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { BackendToolkitManifest } from "@orchestra/core/backend-toolkit/manifest"
import { BackendToolkitTarget } from "@orchestra/core/backend-toolkit/target"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { effectCmd, fail } from "../effect-cmd"

// `--json` stays the backend's state array (its F5 contract); `--research` selects the discovery seat's toolkit (J6.9).
const StatusCommand = effectCmd({
  command: "status",
  describe: "show the state of every toolkit engine on this machine, and the research index shards of a worktree",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .option("json", { type: "boolean", default: false, describe: "print the states as JSON" })
      .option("research", { type: "boolean", default: false, describe: "show only the research toolkit and its index shards" })
      .option("worktree", { type: "string", describe: "worktree whose research index shards are shown (the current directory when omitted)" }),
  handler: Effect.fn("Cli.toolkit.status")(function* (args: { json: boolean; research: boolean; worktree?: string }) {
    if (!args.research) {
      const states = yield* BackendToolkit.status()
      print(states, args.json)
      if (!args.json) yield* research(args.worktree, false)
      const broken = states.filter((state) => state.status === "failed" || state.status === "unsupported")
      if (broken.length) return yield* fail(`backend toolkit not usable: ${broken.map((state) => `${state.engine} ${describe(state)}`).join(", ")}`)
      return
    }
    const engines = yield* research(args.worktree, args.json)
    // An unshipped pack is unsupported by design until it lands; only a failed acquisition makes research unusable.
    const broken = engines.filter((state) => state.status === "failed")
    if (broken.length) return yield* fail(`research toolkit not usable: ${broken.map((state) => `${state.engine} ${describe(state)}`).join(", ")}`)
  }),
})

const research = Effect.fnUntraced(function* (worktree: string | undefined, json: boolean) {
  const engines = yield* ResearchToolkit.status()
  const shards = yield* ResearchToolkit.shards(worktree ?? process.cwd()).pipe(
    Effect.match({
      onSuccess: (shards): { shards: ReadonlyArray<ResearchToolkit.ShardState>; unavailable?: string } => ({ shards }),
      onFailure: (error) => ({ shards: [], unavailable: error.reason }),
    }),
  )
  if (json) {
    console.log(JSON.stringify({ engines, ...shards }, null, 2))
    return engines
  }
  console.log("research toolkit:")
  print(engines, false)
  if (shards.unavailable) console.log(`shards unavailable: ${shards.unavailable}`)
  shards.shards.forEach((shard) =>
    console.log(`shard ${shard.language} ${shard.project} ${shard.status === "skipped" ? `skipped:${shard.reason}` : shard.status}`),
  )
  return engines
})

const PrefetchCommand = effectCmd({
  command: "prefetch [engines..]",
  describe: "download and verify backend toolkit engines ahead of first use",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .positional("engines", {
        type: "string",
        array: true,
        choices: Object.keys(BackendToolkitManifest.ENGINES),
        describe: "engines to fetch (all when omitted)",
      })
      .option("target", {
        type: "string",
        choices: BackendToolkitTarget.TARGETS,
        describe: "target to fetch for (this machine's when omitted)",
      })
      .option("json", { type: "boolean", default: false, describe: "print the states as JSON" }),
  handler: Effect.fn("Cli.toolkit.prefetch")(function* (args: { engines?: string[]; target?: string; json: boolean }) {
    const ids = Object.values(BackendToolkitManifest.ENGINES)
      .map((engine) => engine.id)
      .filter((id) => !args.engines?.length || args.engines.includes(id))
    const target = BackendToolkitTarget.TARGETS.find((item) => item === args.target)
    const states = yield* BackendToolkit.prefetch(ids, target)
    print(states, args.json)
    const broken = states.filter((state) => state.status !== "ready")
    if (broken.length) return yield* fail(`backend toolkit prefetch failed: ${broken.map((state) => `${state.engine} ${describe(state)}`).join(", ")}`)
  }),
})

export const ToolkitCommand = effectCmd({
  command: "toolkit",
  describe: "manage the backend and research toolkit engines",
  instance: false,
  builder: (yargs: Argv) => yargs.command(StatusCommand).command(PrefetchCommand).demandCommand(),
  handler: Effect.fn("Cli.toolkit")(function* () {}),
})

function print(states: ReadonlyArray<BackendToolkit.State<string>>, json: boolean) {
  if (json) return console.log(JSON.stringify(states, null, 2))
  states.forEach((state) => console.log(`${state.engine} ${state.version} ${describe(state)}`))
}

function describe(state: BackendToolkit.State<string>) {
  if (state.status === "ready") return `ready ${state.executable}`
  if (state.status === "failed") return `failed: ${state.cause}`
  if (state.status === "unsupported") return `unsupported: ${state.reason}`
  return state.status
}
