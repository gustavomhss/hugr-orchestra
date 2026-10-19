export * as BackendToolkitLauncher from "./launcher"

import path from "path"
import { randomUUID } from "crypto"
import { access, chmod, mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises"
import { constants } from "fs"
import { Effect } from "effect"
import { PinnedArtifact } from "../pinned-artifact"
import type { Engine, Runtime, RuntimeId } from "./manifest"
import type { TargetId } from "./target"

export function executable(engine: Engine, directory: string, target: TargetId) {
  const install = "runtime" in engine ? engine.install : undefined
  if (install?.kind === "source") {
    const name = target === "win32-x64" ? `${install.binary}.exe` : install.binary
    // `go build -o` writes where it is told; `cargo install --root` writes under bin/.
    return install.build === "go" ? path.join(directory, name) : path.join(directory, "bin", name)
  }
  // A pip distribution can contain a package named exactly like the engine (sqlglot/). Never overwrite it with a launcher.
  if ("runtime" in engine) return path.join(directory, ...(install?.kind === "pip" ? [".launchers"] : []), target === "win32-x64" ? `${engine.id}.cmd` : engine.id)
  return path.join(directory, engine.targets[target].executable)
}

export const fileReady = (file: string, target: TargetId) => Effect.promise(async () => {
  if (!(await stat(file).catch(() => undefined))?.isFile()) return false
  return access(file, target === "win32-x64" ? constants.F_OK : constants.X_OK).then(() => true, () => false)
})

export function launchText(root: string, engine: Engine, runtimes: Readonly<Record<RuntimeId, Runtime>>, directory: string, target: TargetId) {
  const bin = engine.dependencies?.length ? path.join(root, "bin") : undefined
  if (!("runtime" in engine)) return launcher(target === "win32-x64", [executable(engine, directory, target)], engine.env ?? {}, bin)
  const runtime = runtimes[engine.runtime]
  const home = path.join(root, "runtimes", runtime.id, `${runtime.version}-${target}`)
  const expand = (text: string) => text.replaceAll("{install}", directory).replaceAll("{runtime}", home)
  return launcher(target === "win32-x64",
    engine.install.kind === "source" ? [executable(engine, directory, target)] : [path.join(home, runtime.targets[target].executable), ...engine.launch.map(expand)],
    Object.fromEntries(Object.entries({ ...(engine.install.kind === "pip" ? { PYTHONPATH: "{install}" } : {}), ...engine.env }).map(([key, value]) => [key, expand(value)])), bin)
}

/** A launcher that runs `command` with the caller's arguments appended and `env` set for the child only. */
function launcher(windows: boolean, command: ReadonlyArray<string>, env: Readonly<Record<string, string>>, bin?: string) {
  const vars = Object.entries(env)
  if (windows)
    return ["@echo off", "setlocal", ...vars.map(([key, value]) => `set "${key}=${value}"`), ...(bin ? [`set "PATH=${bin};%PATH%"`] : []), `${command.map((part) => `"${part}"`).join(" ")} %*`, "exit /b %errorlevel%", ""].join("\r\n")
  return ["#!/bin/sh", ...vars.map(([key, value]) => `export ${key}=${quote(value)}`), ...(bin ? [`export PATH=${quote(bin)}:"$PATH"`] : []), `exec ${command.map(quote).join(" ")} "$@"`, ""].join("\n")
}

/** Write an engine's `<root>/bin` launcher through a temp file and one rename, skipping it when it is already current. */
export function shim(root: string, id: string, text: string, bin = path.join(root, "bin")) {
  return Effect.tryPromise({
    try: async () => {
      const file = path.join(bin, process.platform === "win32" ? `${id}.cmd` : id)
      if ((await readFile(file, "utf8").catch(() => undefined)) === text) return
      await mkdir(bin, { recursive: true })
      const temp = path.join(bin, `.${id}-${randomUUID()}`)
      await writeFile(temp, text)
      await chmod(temp, 0o755)
      await rename(temp, file).catch(async (error) => {
        await rm(temp, { force: true })
        throw error
      })
    },
    catch: () => new PinnedArtifact.Failed({ cause: "shim" }),
  })
}

const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`
