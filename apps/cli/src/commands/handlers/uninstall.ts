import { EOL } from "os"
import path from "path"
import { rm, access } from "node:fs/promises"
import { Effect } from "effect"
import { Global } from "@orchestra/core/global"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Spawn } from "../../services/process"

type Method = "npm" | "github"

const hasDirectory = (directory: string) =>
  Effect.tryPromise(() => access(directory)).pipe(
    Effect.map(() => true),
    Effect.catch(() => Effect.succeed(false)),
  )

export default Runtime.handler(
  Commands.commands.uninstall,
  Effect.fn("cli.uninstall")(function* (input) {
    const method = installationMethod()
    const targets = removalTargets(input, method)

    for (const target of targets.directories) {
      if (!(yield* hasDirectory(target.path))) continue
      process.stdout.write(
        `  ${target.keep ? "○" : "✓"} ${target.label}: ${target.path}${target.keep ? " (keeping)" : ""}` + EOL,
      )
    }
    if (method === "npm") process.stdout.write(`  ✓ Package: npm uninstall -g @humanguardrail/cli` + EOL)
    if (targets.binary) process.stdout.write(`  ✓ Binary: ${targets.binary}` + EOL)

    if (input["dry-run"]) {
      process.stdout.write("Dry run - no changes made" + EOL)
      return
    }
    if (!input.force) {
      process.stdout.write("Are you sure you want to uninstall? [y/N] ")
      const answer = yield* readAnswer
      if (answer !== "y" && answer !== "Y") {
        process.stdout.write("Cancelled" + EOL)
        return
      }
    }

    if (method === "npm") {
      const result = yield* Spawn.run(["npm", "uninstall", "-g", "@humanguardrail/cli"], { extendEnv: true })
      if (result.exitCode !== 0) {
        process.stderr.write(
          `npm uninstall failed (exit ${result.exitCode}). You may need to run 'npm uninstall -g @humanguardrail/cli' manually.` + EOL,
        )
      }
    }

    for (const target of targets.directories) {
      if (target.keep) {
        process.stdout.write(`Skipping ${target.label} (kept)` + EOL)
        continue
      }
      if (!(yield* hasDirectory(target.path))) continue
      yield* Effect.tryPromise(() => rm(target.path, { recursive: true, force: true }))
      process.stdout.write(`Removed ${target.label}` + EOL)
    }
    if (targets.binary) process.stdout.write(`To finish removing the binary, run: rm "${targets.binary}"` + EOL)
  }),
)

interface RemovalTargets {
  readonly directories: ReadonlyArray<{ path: string; label: string; keep: boolean }>
  readonly binary: string | null
}

function removalTargets(input: { "keep-config": boolean; "keep-data": boolean }, method: Method): RemovalTargets {
  const directories = [
    { path: Global.Path.data, label: "Data", keep: input["keep-data"] },
    { path: Global.Path.cache, label: "Cache", keep: false },
    { path: Global.Path.config, label: "Config", keep: input["keep-config"] },
    { path: Global.Path.state, label: "State", keep: false },
  ]
  return {
    directories,
    binary: method === "github" && process.execPath.includes(".orchestra") ? process.execPath : null,
  }
}

function installationMethod(): Method {
  const exec = process.execPath
  if (exec.includes(path.join(".orchestra", "bin")) || exec.includes(path.join(".local", "bin"))) return "github"
  return "npm"
}

const readAnswer = Effect.promise(
  () =>
    new Promise<string>((resolve) => {
      process.stdin.resume()
      process.stdin.once("data", (data) => resolve(String(data).trim()))
    }),
)