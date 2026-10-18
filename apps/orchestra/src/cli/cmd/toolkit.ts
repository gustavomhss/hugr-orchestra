import type { Argv } from "yargs"
import { Effect } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { BackendToolkitManifest } from "@orchestra/core/backend-toolkit/manifest"
import { BackendToolkitTarget } from "@orchestra/core/backend-toolkit/target"
import { effectCmd, fail } from "../effect-cmd"

const StatusCommand = effectCmd({
  command: "status",
  describe: "show the state of every backend toolkit engine on this machine",
  instance: false,
  builder: (yargs: Argv) => yargs.option("json", { type: "boolean", default: false, describe: "print the states as JSON" }),
  handler: Effect.fn("Cli.toolkit.status")(function* (args: { json: boolean }) {
    const states = yield* BackendToolkit.status()
    print(states, args.json)
    const broken = states.filter((state) => state.status === "failed" || state.status === "unsupported")
    if (broken.length) return yield* fail(`backend toolkit not usable: ${broken.map((state) => `${state.engine} ${describe(state)}`).join(", ")}`)
  }),
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
  describe: "manage the backend specialist's toolkit engines",
  instance: false,
  builder: (yargs: Argv) => yargs.command(StatusCommand).command(PrefetchCommand).demandCommand(),
  handler: Effect.fn("Cli.toolkit")(function* () {}),
})

function print(states: ReadonlyArray<BackendToolkit.State>, json: boolean) {
  if (json) return console.log(JSON.stringify(states, null, 2))
  states.forEach((state) => console.log(`${state.engine} ${state.version} ${describe(state)}`))
}

function describe(state: BackendToolkit.State) {
  if (state.status === "ready") return `ready ${state.executable}`
  if (state.status === "failed") return `failed: ${state.cause}`
  if (state.status === "unsupported") return `unsupported: ${state.reason}`
  return state.status
}
