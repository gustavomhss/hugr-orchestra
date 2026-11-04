import { execFile } from "node:child_process"
import { constants } from "node:fs"
import { access, readFile, readdir, stat } from "node:fs/promises"
import { delimiter, dirname, extname, isAbsolute, join } from "node:path"
import util from "node:util"
import { absoluteTargetPath, isLaunchableTarget, isOpenApp } from "./ipc-validate"
import { DesktopOmni } from "./omni-process"

const legacyExecFile = util.promisify(execFile)
// Behind ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER the lookups run through omni; legacy stays the default.
const execFilePromise = (file: string, args: string[]) =>
  DesktopOmni.enabled() ? DesktopOmni.execFile(file, args) : legacyExecFile(file, args)

const exists = (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false)

export async function checkAppExists(appName: string) {
  if (isAbsolute(appName) || process.platform !== "darwin") return (await resolveAppPath(appName)) !== null
  return checkMacosApp(appName)
}

export function resolveAppPath(appName: string) {
  // `where` searches command names; absolute executable paths need direct filesystem validation.
  if (isAbsolute(appName))
    return process.platform !== "win32" || extname(appName).toLowerCase() === ".exe"
      ? resolveExecutable(appName)
      : Promise.resolve(null)
  if (process.platform === "linux") return resolveExecutable(appName)
  if (process.platform === "darwin") return Promise.resolve(appName)
  return resolveWindowsAppPath(appName)
}

export async function resolveExecutable(name: string, searchPath = process.env.PATH ?? "") {
  if (!name || /[\x00-\x1f]/.test(name)) return null
  const candidates =
    isAbsolute(name) || name.includes("/")
      ? [name]
      : searchPath
          .split(delimiter)
          .filter(Boolean)
          .map((directory) => join(directory, name))
  for (const candidate of candidates) {
    const executable = await stat(candidate)
      .then((file) => file.isFile())
      .catch(() => false)
    if (!executable) continue
    if (
      await access(candidate, constants.X_OK)
        .then(() => true)
        .catch(() => false)
    )
      return candidate
  }
  return null
}

export type OpenPathResult =
  | { status: "opened" }
  | { status: "revealed" }
  | { status: "failed"; code: "app-unavailable" | "open-failed"; detail?: string }

// `path` and `app` come from the renderer, so both are checked here. `app` must be one the "open in" list offers
// (not a path), and an app only ever receives a directory. With no app the OS opens the target with its default
// handler, which would run an executable or script, so those are revealed in the file manager instead.
export async function openDesktopPath(
  path: string,
  app: string | undefined,
  openDefault: (path: string) => Promise<string>,
  reveal?: (path: string) => void,
): Promise<OpenPathResult> {
  const target = absoluteTargetPath(path)
  if (!target) return { status: "failed", code: "open-failed", detail: "Invalid path" }
  if (!app) {
    if (await isLaunchableTarget(target)) {
      if (!reveal) return { status: "failed", code: "open-failed", detail: "Refused to open an executable" }
      reveal(target)
      return { status: "revealed" }
    }
    return openDefault(target).then(
      (detail) => (detail ? { status: "failed", code: "open-failed", detail } : { status: "opened" }),
      (error: unknown) => ({ status: "failed", code: "open-failed", detail: String(error) }),
    )
  }
  if (!isOpenApp(app) || !(await checkAppExists(app))) return { status: "failed", code: "app-unavailable" }
  const executable = await resolveAppPath(app)
  if (!executable) return { status: "failed", code: "app-unavailable" }
  if (!(await stat(target).then((info) => info.isDirectory(), () => false)))
    return { status: "failed", code: "open-failed", detail: "Not a directory" }
  // `target` is absolute, so neither `open` nor the app can read it as an option.
  return execFilePromise(
    process.platform === "darwin" ? "open" : executable,
    process.platform === "darwin" ? ["-a", app, target] : [target],
  ).then(
    () => ({ status: "opened" }),
    (error: unknown) => ({ status: "failed", code: "open-failed", detail: String(error) }),
  )
}

async function checkMacosApp(appName: string) {
  const locations = [`/Applications/${appName}.app`, `/System/Applications/${appName}.app`]

  const home = process.env.HOME
  if (home) locations.push(`${home}/Applications/${appName}.app`)

  for (const location of locations) {
    if (await exists(location)) return true
  }

  return execFilePromise("which", [appName])
    .then(() => true)
    .catch(() => false)
}

async function resolveWindowsAppPath(appName: string): Promise<string | null> {
  if (!appName || /[\x00-\x1f]/.test(appName)) return null
  let output: string
  try {
    output = await execFilePromise("where", [appName]).then((r) => r.stdout.toString())
  } catch {
    return null
  }

  const paths = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const hasExt = (path: string, ext: string) => extname(path).toLowerCase() === `.${ext}`

  const exe = paths.find((path) => hasExt(path, "exe"))
  if (exe && (await resolveExecutable(exe))) return exe

  const resolveCmd = async (path: string) => {
    const content = await readFile(path, "utf8")
    for (const token of content.split('"').map((value: string) => value.trim())) {
      const lower = token.toLowerCase()
      if (!lower.includes(".exe")) continue

      const index = lower.indexOf("%~dp0")
      if (index >= 0) {
        const base = dirname(path)
        const suffix = token.slice(index + 5)
        const resolved = suffix
          .replace(/\//g, "\\")
          .split("\\")
          .filter((part: string) => part && part !== ".")
          .reduce((current: string, part: string) => {
            if (part === "..") return dirname(current)
            return join(current, part)
          }, base)

        if (await resolveExecutable(resolved)) return resolved
      }

      if (await resolveExecutable(token)) return token
    }

    return null
  }

  for (const path of paths) {
    if (hasExt(path, "cmd") || hasExt(path, "bat")) {
      const resolved = await resolveCmd(path)
      if (resolved) return resolved
    }

    if (!extname(path)) {
      const cmd = `${path}.cmd`
      if (await exists(cmd)) {
        const resolved = await resolveCmd(cmd)
        if (resolved) return resolved
      }

      const bat = `${path}.bat`
      if (await exists(bat)) {
        const resolved = await resolveCmd(bat)
        if (resolved) return resolved
      }
    }
  }

  const key = appName
    .split("")
    .filter((value: string) => /[a-z0-9]/i.test(value))
    .map((value: string) => value.toLowerCase())
    .join("")

  if (key) {
    for (const path of paths) {
      const dirs = [dirname(path), dirname(dirname(path)), dirname(dirname(dirname(path)))]
      for (const dir of dirs) {
        try {
          for (const entry of await readdir(dir)) {
            const candidate = join(dir, entry)
            if (!hasExt(candidate, "exe")) continue
            const stem = entry.replace(/\.exe$/i, "")
            const name = stem
              .split("")
              .filter((value: string) => /[a-z0-9]/i.test(value))
              .map((value: string) => value.toLowerCase())
              .join("")
            if ((name.includes(key) || key.includes(name)) && (await resolveExecutable(candidate))) return candidate
          }
        } catch {
          continue
        }
      }
    }
  }

  return null
}
