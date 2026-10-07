import { execFile } from "node:child_process"
import { lstat, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { promisify } from "node:util"

export async function electronInstallScript(
  directory = dirname(createRequire(import.meta.url).resolve("electron/package.json")),
) {
  const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"))
  if (pkg.name !== "electron" || pkg.bin?.["install-electron"] !== "install.js")
    throw new Error("Installed Electron dependency has an unexpected installer contract")
  const script = join(directory, "install.js")
  if (!(await lstat(script)).isFile()) throw new Error("Installed Electron installer must be a regular file")
  return script
}

export async function installElectron(
  directory = dirname(createRequire(import.meta.url).resolve("electron/package.json")),
) {
  // Electron 42 exposes its own installer, not a postinstall script. Node matches its supported runtime.
  await promisify(execFile)("node", [await electronInstallScript(directory)], { env: process.env })
  const executable = (await readFile(join(directory, "path.txt"), "utf8")).trim()
  if (!executable || !(await lstat(join(directory, "dist", executable))).isFile())
    throw new Error("Installed Electron executable is missing")
}

if (import.meta.main) await installElectron()
