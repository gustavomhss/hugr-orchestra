import { Formatter } from "@orchestra/schema"
import { Context, Effect, Layer } from "effect"
import { ChildProcess } from "effect/unstable/process"
import path from "path"
import fs from "fs/promises"
import { constants, type Stats } from "fs"
import { Config } from "../config"
import { makeLocationNode } from "../effect/app-node"
import { FSUtil } from "../fs-util"
import { Location } from "../location"
import { AppProcess } from "../process"
import { Flag } from "../flag/flag"
import { ToolSafety } from "../tool-safety"
import { ToolSafetySandbox } from "../tool-safety-sandbox"
import { builtIns, type Info } from "./formatter"

export const Status = Formatter.Status
export type Status = Formatter.Status

export interface Interface {
  /** The Location's configured formatters and whether each one's program is available. */
  readonly status: () => Effect.Effect<Status[]>
  /** Runs every enabled formatter for the file's extension; true when at least one matched. Failures are logged. */
  readonly file: (filepath: string) => Effect.Effect<boolean>
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

    // Probing a formatter can resolve or install its package, so an enabled command is kept for the Location's life.
    const commands = new Map<string, string[]>()
    const command = (formatter: Info) =>
      Effect.promise(async () => {
        const cached = commands.get(formatter.name)
        if (cached) return cached
        const found = await formatter.enabled(context).catch(() => false as const)
        if (found) commands.set(formatter.name, found)
        return found
      })

    const file = Effect.fn("Format.file")(function* (filepath: string) {
      const extension = path.extname(filepath)
      const formatters = configured(Config.latest(yield* config.entries(), "formatter")).filter((item) =>
        item.extensions.includes(extension),
      )
      const matched = (yield* Effect.forEach(formatters, (item) =>
        command(item).pipe(Effect.map((cmd) => (cmd ? { item, cmd } : undefined))),
      )).filter((entry) => entry !== undefined)
      if (!matched.length) return false
      yield* Effect.forEach(matched, (entry) => run(entry.item, entry.cmd, filepath), { discard: true })
      return true
    })

    const run = Effect.fnUntraced(function* (item: Info, cmd: string[], filepath: string) {
      const replaced = cmd.map((part) => part.replace("$FILE", filepath))
      const directory = location.directory
      // A trusted formatter still runs workspace code when its program resolves into the workspace, is a runner
      // (npx, uv run, ...) or is a version-manager shim.
      const confine =
        item.confine ??
        ((yield* Effect.promise(() =>
          ToolSafetySandbox.runsWorkspaceCode(directory, replaced[0]!, replaced.slice(1), directory),
        ))
          ? "file"
          : undefined)
      const source = confine === "stdin" ? yield* Effect.promise(() => readSource(filepath, directory)) : undefined
      if (confine === "stdin" && !source)
        return yield* Effect.logError("failed to format file", { error: "outside the workspace", command: cmd, file: filepath })
      const input = source?.content
      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          if (!confine)
            return yield* appProcess.run(
              ChildProcess.make(replaced[0]!, replaced.slice(1), {
                cwd: directory,
                env: item.environment,
                extendEnv: true,
                stdin: "ignore",
                stdout: "ignore",
                stderr: "ignore",
              }),
            )
          const launch = yield* ToolSafetySandbox.confine({
            command: replaced[0]!,
            args: replaced.slice(1),
            cwd: directory,
            env: { ...process.env, ...item.environment },
            write: input ? [] : [filepath],
          })
          return yield* appProcess.run(
            ChildProcess.make(launch.command, launch.args, {
              cwd: directory,
              env: launch.env,
              extendEnv: false,
              stdin: "ignore",
              stdout: input ? "pipe" : "ignore",
              stderr: "ignore",
            }),
            input ? { stdin: input } : undefined,
          )
        }),
      ).pipe(
        Effect.catch((error) =>
          Effect.logError("failed to format file", {
            error: error instanceof ToolSafety.Denied ? "sandbox refused" : "spawn failed",
            command: cmd,
            file: filepath,
          }).pipe(Effect.as(undefined)),
        ),
      )
      if (result && result.exitCode !== 0) yield* Effect.logError("failed", { command: cmd, file: filepath })
      // Empty output for a non-empty file is a formatter that wrote nothing, never a formatted result.
      if (result?.exitCode === 0 && source && result.stdout.length > 0 && !result.stdout.equals(source.content))
        yield* Effect.promise(() => writeBack(source, result.stdout))
    })

    return Service.of({ status, file })
  }),
)

/** The built-in formatters with the config's overrides applied, matching the earlier runtime's Format service. */
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
        // The earlier runtime looks overrides up by the built-in's export name, not its formatter name.
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

// A stdin formatter's input is one physical file inside the workspace; its output goes back into that same file and
// never through a symlink or a different file swapped in while the formatter ran.
async function readSource(filepath: string, directory: string) {
  const file = await fs.realpath(filepath)
  if (!FSUtil.contains(await fs.realpath(directory), file)) return undefined
  return { file, stat: await fs.stat(file), content: await fs.readFile(file) }
}

async function writeBack(source: { file: string; stat: Stats }, output: Buffer) {
  const handle = await fs.open(source.file, constants.O_WRONLY | constants.O_NOFOLLOW).catch(() => undefined)
  if (!handle) return
  await handle
    .stat()
    .then((now) =>
      now.dev === source.stat.dev && now.ino === source.stat.ino
        ? handle.truncate(0).then(() => handle.writeFile(output))
        : undefined,
    )
    .finally(() => handle.close())
}

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, Location.node, AppProcess.node],
})
