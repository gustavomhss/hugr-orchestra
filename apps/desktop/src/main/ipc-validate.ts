import { stat } from "node:fs/promises"
import { extname, isAbsolute, normalize } from "node:path"
import { LINUX_OPEN_APPS, MAC_OPEN_APPS, WINDOWS_OPEN_APPS } from "@orchestra/app/open-apps"

// The renderer is untrusted input: a compromised page can send any argument to any handler. Everything the renderer
// names (a store, a URL, a path, an app) is checked here, in main, before it reaches the file system, the shell or
// a child process.

// Renderer stores are the `.dat` files the page's persist layer names (`default.dat`, `orchestra.global.dat`,
// `orchestra.workspace.<id>.dat`, ...). Main-owned stores (`orchestra.settings`, `orchestra.updater`,
// `orchestra.janitor`) have no `.dat` suffix, so the renderer can neither read nor overwrite them.
export function rendererStoreName(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 200 ||
    value.includes("..") ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.dat$/.test(value)
  )
    throw new Error("Invalid store name")
  return value
}

// The default server is stored as a `ServerConnection.Key`: a server URL, `sidecar`, `wsl:<distro>` or `ssh:<host>`.
// Only the http(s) form is a URL; the others are fixed key shapes. null clears the default.
export function defaultServerKey(value: unknown) {
  if (value === null) return null
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) throw new Error("Invalid server URL")
  if (value === "sidecar" || /^(wsl|ssh):[A-Za-z0-9][A-Za-z0-9._@:-]*$/.test(value)) return value
  if (!URL.canParse(value)) throw new Error("Invalid server URL")
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Invalid server URL")
  return value
}

export function openAppNames(platform: NodeJS.Platform = process.platform) {
  const apps = platform === "darwin" ? MAC_OPEN_APPS : platform === "win32" ? WINDOWS_OPEN_APPS : LINUX_OPEN_APPS
  return new Set<string>(apps.map((item) => item.openWith))
}

// Only an app the renderer's own "open in" list offers. An absolute path or an arbitrary command name is refused,
// because the app is later run (or handed to `open -a`) by main.
export function isOpenApp(app: unknown, platform: NodeJS.Platform = process.platform) {
  return typeof app === "string" && openAppNames(platform).has(app)
}

// A path the renderer wants opened must be absolute, so it can never be read as an option (`-a`, `--args`) by
// `open` or by an editor, and it is normalized so `..` segments are resolved before any check.
export function absoluteTargetPath(value: unknown) {
  if (typeof value !== "string" || value.length === 0 || /[\x00-\x1f]/.test(value) || !isAbsolute(value)) return
  return normalize(value)
}

const LAUNCHABLE = new Set([
  ".app",
  ".action",
  ".workflow",
  ".command",
  ".tool",
  ".terminal",
  ".scpt",
  ".scptd",
  ".pkg",
  ".dmg",
  ".exe",
  ".com",
  ".bat",
  ".cmd",
  ".msi",
  ".msp",
  ".scr",
  ".pif",
  ".lnk",
  ".url",
  ".reg",
  ".cpl",
  ".hta",
  ".vbs",
  ".vbe",
  ".js",
  ".jse",
  ".wsf",
  ".wsh",
  ".ps1",
  ".psm1",
  ".sh",
  ".bash",
  ".zsh",
  ".jar",
  ".desktop",
  ".appimage",
  ".run",
  ".deb",
  ".rpm",
])

// shell.openPath launches whatever the OS associates with the target, so executables, installers and scripts run
// instead of opening. Those are only revealed. On unix a file with an execute bit counts too, which also catches
// extensionless binaries.
export async function isLaunchableTarget(path: string) {
  if (LAUNCHABLE.has(extname(path).toLowerCase())) return true
  if (process.platform === "win32") return false
  const info = await stat(path).catch(() => undefined)
  return !!info?.isFile() && (info.mode & 0o111) !== 0
}
