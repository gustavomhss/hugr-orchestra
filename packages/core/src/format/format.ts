import { Formatter } from "@orchestra/schema"
import { Context, Effect, Layer } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Config } from "../config"
import { makeLocationNode } from "../effect/app-node"
import { Location } from "../location"
import { AppProcess } from "../process"
import { Flag } from "../flag/flag"
import { builtIns, type Info } from "./formatter"

export const Status = Formatter.Status
export type Status = Formatter.Status

export interface Interface {
  /** The Location's configured formatters and whether each one's program is available. */
  readonly status: () => Effect.Effect<Status[]>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/FormatV2") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const location = yield* Location.Service
    const appProcess = yield* AppProcess.Service
    const runPromise = Effect.runPromiseWith(yield* Effect.context())
    const context = {
      directory: location.directory,
      worktree: location.project.directory,
      experimentalOxfmt: Flag.ORCHESTRA_EXPERIMENTAL_OXFMT,
      run: (cmd: string[]) =>
        runPromise(
          appProcess.run(ChildProcess.make(cmd[0]!, cmd.slice(1), { cwd: location.directory, stdin: "ignore" })).pipe(
            Effect.map((result) => ({ code: result.exitCode, text: result.stdout.toString() })),
            Effect.catch(() => Effect.succeed({ code: 1, text: "" })),
          ),
        ),
    }

    const status = Effect.fn("Format.status")(function* () {
      const formatters = configured(Config.latest(yield* config.entries(), "formatter"))
      return yield* Effect.forEach(formatters, (formatter) =>
        Effect.promise(() => formatter.enabled(context).catch(() => false as const)).pipe(
          Effect.map((command) => ({ name: formatter.name, extensions: formatter.extensions, enabled: command !== false })),
        ),
      )
    })

    return Service.of({ status })
  }),
)

/** The built-in formatters with the config's overrides applied, matching the V1 Format service. */
export function configured(config: Config.Info["formatter"]): Info[] {
  if (!config) return []
  const byName = Object.fromEntries(Object.values(builtIns).map((item) => [item.name, item]))
  if (config === true) return Object.values(byName)
  // Ruff and uv are the same formatter, so disabling either disables both.
  const ruffOff = config.ruff?.disabled || config.uv?.disabled
  const overrides = Object.entries(config).filter(([name]) => !(ruffOff && ["ruff", "uv"].includes(name)))
  const removed = new Set([
    ...(ruffOff ? ["ruff", "uv"] : []),
    ...overrides.filter(([, item]) => item.disabled).map(([name]) => name),
  ])
  const merged = Object.fromEntries(
    overrides
      .filter(([, item]) => !item.disabled)
      .map(([name, item]) => {
        // V1 looks overrides up by the built-in's export name, not its formatter name.
        const builtIn = builtIns[name] as Info | undefined
        const command = item.command
        return [
          name,
          {
            name,
            extensions: [...(item.extensions ?? builtIn?.extensions ?? [])],
            environment: { ...builtIn?.environment, ...item.environment },
            enabled: builtIn && !command ? builtIn.enabled : async () => (command ? [...command] : false),
            confine: builtIn && !command ? builtIn.confine : builtIn?.confine && "file",
          } satisfies Info,
        ]
      }),
  )
  return Object.values({ ...byName, ...merged }).filter((item) => !removed.has(item.name))
}

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, Location.node, AppProcess.node],
})
