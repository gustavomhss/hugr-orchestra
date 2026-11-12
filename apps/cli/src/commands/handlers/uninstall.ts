import { EOL } from "os"
import path from "path"
import { rm, access, realpath, lstat, readlink, mkdir, rmdir } from "node:fs/promises"
import { Effect } from "effect"
import { Global } from "@orchestra/core/global"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Spawn } from "../../services/process"

type Installation =
  | { method: "npm"; prefix: string }
  | { method: "archive"; prefix: string; payload: string; executable: string }

type UninstallInput = { "keep-config": boolean; "keep-data": boolean; "dry-run": boolean; force: boolean }

const hasDirectory = (directory: string) =>
  Effect.tryPromise(() => access(directory)).pipe(
    Effect.map(() => true),
    Effect.catch(() => Effect.succeed(false)),
  )

export const uninstall = Effect.fn("cli.uninstall")(function* (
  input: UninstallInput,
  executable = process.execPath,
  paths: Pick<typeof Global.Path, "data" | "cache" | "config" | "state"> = Global.Path,
) {
  const installation = yield* Effect.tryPromise(() => installationMethod(executable))
  const targets = removalTargets(input, installation.method, paths)

  for (const target of targets.directories) {
    if (!(yield* hasDirectory(target.path))) continue
    process.stdout.write(
      `  ${target.keep ? "○" : "✓"} ${target.label}: ${target.path}${target.keep ? " (keeping)" : ""}` + EOL,
    )
  }
  if (installation.method === "npm") process.stdout.write(`  ✓ Package: npm uninstall -g --prefix "${installation.prefix}" @humanguardrail/cli` + EOL)
  if (installation.method === "archive") process.stdout.write(`  ✓ Archive: ${installation.payload} (with owned current and bin/orchestra links)` + EOL)

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

  if (installation.method === "npm") {
    const current = yield* Effect.tryPromise(() => installationMethod(executable))
    if (current.method !== "npm" || current.prefix !== installation.prefix)
      return yield* Effect.fail(new Error("Installation ownership changed; no npm package was removed"))
    const result = yield* Spawn.run(["npm", "uninstall", "-g", "--prefix", installation.prefix, "@humanguardrail/cli"], { extendEnv: true })
    if (result.exitCode !== 0) {
      process.stderr.write(
        `npm uninstall failed (exit ${result.exitCode}). Retry npm uninstall -g --prefix ${JSON.stringify(installation.prefix)} @humanguardrail/cli manually.` + EOL,
      )
      return
    }
  }
  if (installation.method === "archive") yield* Effect.tryPromise(() => removeArchive(installation))
  yield* removeDirectories(targets.directories)
})

export default Runtime.handler(Commands.commands.uninstall, (input) => uninstall(input))

export const removeDirectories = Effect.fn("cli.uninstall.remove")(function* (
  directories: RemovalTargets["directories"],
) {
  for (const target of directories) {
    if (target.keep) {
      process.stdout.write(`Skipping ${target.label} (kept)` + EOL)
      continue
    }
    if (!(yield* hasDirectory(target.path))) continue
    yield* Effect.tryPromise(() => rm(target.path, { recursive: true, force: true }))
    process.stdout.write(`Removed ${target.label}` + EOL)
  }
})

interface RemovalTargets {
  readonly directories: ReadonlyArray<{ path: string; label: string; keep: boolean }>
  readonly binary: string | null
}

export function removalTargets(
  input: { "keep-config": boolean; "keep-data": boolean },
  _method: Installation["method"],
  paths: Pick<typeof Global.Path, "data" | "cache" | "config" | "state"> = Global.Path,
): RemovalTargets {
  const directories = [
    { path: paths.data, label: "Data", keep: input["keep-data"] },
    { path: paths.cache, label: "Cache", keep: false },
    { path: paths.config, label: "Config", keep: input["keep-config"] },
    { path: paths.state, label: "State", keep: false },
  ]
  return {
    directories,
    binary: null,
  }
}

// Resolve the running payload, never infer npm ownership from an arbitrary executable path.
export async function installationMethod(exec = process.execPath): Promise<Installation> {
  const executable = await realpath(exec)
  const payload = path.dirname(path.dirname(executable))
  const unsupported = () => new Error(
    `Cannot safely identify this installation: ${executable}. No files were removed. ` +
    "For a standalone archive, remove only its extracted directory and the launcher you created; " +
    "for npm, use npm uninstall -g --prefix <install-prefix> @humanguardrail/cli.",
  )
  const metadata = await Bun.file(path.join(payload, "package.json")).json().catch(() => null)
  const descriptor = await Bun.file(path.join(payload, "distribution.json")).json().catch(() => null)
  if (!metadata || !descriptor || descriptor.schema !== "orchestra-distribution-v1" ||
      typeof descriptor.version !== "string" || !/^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(descriptor.version) ||
      typeof descriptor.target !== "string" || !/^(linux|darwin|windows)-(arm64|x64)(-baseline)?(-musl)?$/.test(descriptor.target) ||
      metadata.name !== `@humanguardrail/cli-${descriptor.target}` || metadata.version !== descriptor.version ||
      !Array.isArray(descriptor.files) || !descriptor.files.some((file: { path?: string; executable?: boolean }) =>
        file.path === `bin/${path.basename(executable)}` && file.executable === true) ||
      path.dirname(executable) !== path.join(payload, "bin") ||
      !["orchestra", "orchestra.exe"].includes(path.basename(executable))) throw unsupported()

  // npm platform payloads also carry distribution.json. Require a real global
  // node_modules layout and the owning CLI package before invoking npm.
  const scope = path.dirname(payload)
  const modules = path.dirname(scope)
  if (path.basename(scope) === "@humanguardrail" && path.basename(modules) === "node_modules") {
    const nestedOwner = path.dirname(modules)
    const ownerRoot = path.basename(nestedOwner) === "cli" && path.basename(path.dirname(nestedOwner)) === "@humanguardrail"
      ? nestedOwner : path.join(scope, "cli")
    const owner = await Bun.file(path.join(ownerRoot, "package.json")).json().catch(() => null)
    const globalModules = ownerRoot === nestedOwner ? path.dirname(path.dirname(ownerRoot)) : modules
    const parent = path.dirname(globalModules)
    // npm -g uses <prefix>/lib/node_modules on POSIX and <prefix>/node_modules
    // on Windows. A local POSIX node_modules must never claim the global tree.
    const prefix = process.platform === "win32" ? parent : path.basename(parent) === "lib" ? path.dirname(parent) : null
    const removalRoot = prefix === null ? null
      : path.join(prefix, ...(process.platform === "win32" ? [] : ["lib"]), "node_modules", "@humanguardrail", "cli")
    if (prefix !== null && removalRoot === ownerRoot && owner?.name === "@humanguardrail/cli" && owner.version === metadata.version &&
        path.basename(payload) === `cli-${descriptor.target}` && path.basename(globalModules) === "node_modules" &&
        await realpath(modules) === modules && await realpath(removalRoot) === ownerRoot) {
      return { method: "npm", prefix }
    }
  }

  const versions = path.dirname(payload)
  const prefix = path.dirname(versions)
  if (path.basename(versions) !== "versions" || path.basename(payload) !== `${descriptor.version}-${descriptor.target}` ||
      await realpath(versions) !== versions) throw unsupported()
  const current = path.join(prefix, "current")
  const launcher = path.join(prefix, "bin", "orchestra")
  if (!(await lstat(current).catch(() => null))?.isSymbolicLink() ||
      !(await lstat(launcher).catch(() => null))?.isSymbolicLink() ||
      await readlink(current) !== `versions/${descriptor.version}-${descriptor.target}` ||
      await readlink(launcher) !== "../current/bin/orchestra" ||
      await realpath(current) !== payload || await realpath(launcher) !== executable ||
      await realpath(path.dirname(launcher)) !== path.dirname(launcher)) throw unsupported()
  return { method: "archive", prefix, payload, executable }
}

export async function removeArchive(installation: Extract<Installation, { method: "archive" }>) {
  // Share the installer's exclusive prefix lock so an update cannot switch current
  // between ownership validation and deletion. Retained versions and prefix survive.
  const lock = path.join(installation.prefix, ".install-lock")
  await mkdir(lock)
  try {
    const current = await installationMethod(installation.executable)
    if (current.method !== "archive" || current.prefix !== installation.prefix || current.payload !== installation.payload)
      throw new Error("Installation ownership changed; no archive files were removed")
    await rm(path.join(installation.prefix, "bin", "orchestra"))
    await rm(path.join(installation.prefix, "current"))
    await rm(installation.payload, { recursive: true })
  } finally {
    await rmdir(lock)
  }
}

const readAnswer = Effect.promise(
  () =>
    new Promise<string>((resolve) => {
      process.stdin.resume()
      process.stdin.once("data", (data) => resolve(String(data).trim()))
    }),
)