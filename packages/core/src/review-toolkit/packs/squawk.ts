export * as ReviewPackSquawk from "./squawk"

import path, { posix, win32 } from "node:path"
import { constants } from "node:fs"
import { access, lstat, mkdir, realpath } from "node:fs/promises"
import { Effect } from "effect"
import pinned from "../../backend-toolkit/packs/squawk"
import { BackendToolkit } from "../../backend-toolkit"
import type { Pack } from "../../backend-toolkit/manifest"
import { Probe } from "../../research-toolkit/probe/types"
import type { Outcome } from "../../research-toolkit/process"
import type { Parsed } from "../sarif"
import { containedPath, flavor, parseReport } from "./squawk-report"

export { RULES } from "./squawk-report"

// Pinned 2.67.0 artifact. Workspace license is Apache-2.0 OR MIT; the pin field stays Apache-2.0. Empty
// included_rules adds to defaults (with_rules), then excludes, not a whitelist. pg_version is omitted;
// upstream Version::default is 15.0.0 and is not a claim about the reviewed project. Status never fetches.

export const manifest = {
  ...pinned,
  fit: { role: "check", input: "The reviewed tree in lucy's scratch copy", skills: [] },
} as const satisfies Pack

export const hostToml = "assume_in_transaction = false\nincluded_rules = []\nexcluded_rules = []\n"
export const pgVersion = "unspecified" as const
export const upstreamVersionDefault = "15.0.0" as const
export const includes = "additive" as const

export const locate = Effect.fn("ReviewPackSquawk.locate")(function* () {
  const states = yield* BackendToolkit.status(manifest.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [manifest.id]: manifest }),
  )
  const state = states[0]
  if (state?.status === "ready") return { executable: state.executable }
  if (state?.status === "unsupported") return { absent: `squawk unsupported: ${state.reason}` }
  return { absent: "squawk absent" }
})

export const prepare = Effect.fn("ReviewPackSquawk.prepare")(function* (directory: string, excluded: readonly string[] = []) {
  const config = path.join(directory, "squawk.toml")
  yield* Effect.promise(async () => {
    await mkdir(directory, { recursive: true })
    await Bun.write(config, excluded.length === 0 ? hostToml : excludedToml(excluded))
  })
  return config
})

// glob 0.3.1 Pattern::escape is [?] [*] [[] []]; classes contain no separator. Verbatim/device prefixes yield nothing.
// Lexical checks run first. FS preflight then requires a host-native root. It is not an atomic seal: a same-uid
// process can replace a checked path before squawk opens it.
export const argv = Effect.fn("ReviewPackSquawk.argv")(function* (input: {
  executable: string
  config: string
  root: string
  files: readonly string[]
}) {
  const refused = earlyRefusal(input)
  if (refused) return refused
  return yield* Effect.promise(() => physical(input))
})

export function settle(outcome: Outcome, root: string): Parsed | { status: "not-run"; reason: string } {
  if (outcome.failure) return { status: "not-run", reason: "spawn-failure" }
  if (outcome.timedOut) return { status: "not-run", reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run", reason: "memory-exceeded" }
  if (outcome.overflow || outcome.stdout.truncated || outcome.stderr.truncated) return { status: "acquisition-error", reason: "truncated" }
  if (outcome.exitCode === null) return { status: "acquisition-error", reason: "missing-exit" }
  if (outcome.exitCode !== 0 && outcome.exitCode !== 1) return { status: "acquisition-error", reason: `exit-${outcome.exitCode}` }
  const stderr = decode(outcome.stderr.data)
  if (stderr === undefined) return { status: "acquisition-error", reason: "not-utf8" }
  if (stderr.includes("Configuration error:") || stderr.includes("Failed to find files"))
    return { status: "acquisition-error", reason: "configuration-error" }
  if (stderr.trim() !== "") return { status: "acquisition-error", reason: "stderr" }
  const stdout = decode(outcome.stdout.data)
  if (stdout === undefined) return { status: "acquisition-error", reason: "not-utf8" }
  if (stdout.trim() === "") return { status: "acquisition-error", reason: "missing-report" }
  const parsed = parseReport(stdout, { root })
  if (parsed.status !== "ok") return parsed
  if (outcome.exitCode === 0 && parsed.results.length === 0) return parsed
  if (outcome.exitCode === 1 && parsed.results.length > 0) return parsed
  return { status: "acquisition-error", reason: "exit-mismatch" }
}

function excludedToml(excluded: readonly string[]) {
  const quoted = excluded.map((id) => `"${id.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`).join(", ")
  return `assume_in_transaction = false\nincluded_rules = []\nexcluded_rules = [${quoted}]\n`
}

function stop(status: "not-run" | "unsupported", reason: string) {
  return { status, reason }
}

function earlyRefusal(input: { executable: string; config: string; root: string; files: readonly string[] }) {
  if (input.files.length === 0) return stop("not-run", "no-input")
  if ([input.root, input.config, input.executable, ...input.files].some(unverified)) return stop("unsupported", "glob-literal-unverified")
  if (!input.executable || input.executable.includes("\0")) return stop("not-run", "executable-missing")
  if (flavor(input.root) !== (process.platform === "win32" ? win32 : posix)) return stop("unsupported", "nonnative-root")
  const config = hostConfig(input.config, input.root)
  if (config) return stop("not-run", config)
  const escaped: string[] = []
  for (const file of input.files) {
    const reason = sqlFile(file, input.root)
    if (reason) return stop("not-run", reason)
    escaped.push(patternEscape(file))
  }
  const bytes = [input.executable, "--config", input.config, "--reporter", "json", "--", ...escaped]
    .reduce((sum, arg) => sum + Buffer.byteLength(arg), 0)
  if (bytes > Probe.Limits.outputBytes) return stop("not-run", "argv-bound")
  return undefined
}

async function physical(input: { executable: string; config: string; root: string; files: readonly string[] }) {
  const root = await canonicalRoot(input.root)
  if (typeof root !== "string") return root
  const config = await hostFile(input.config, root)
  if (config) return stop("not-run", config)
  const escaped: string[] = []
  for (const file of input.files) {
    const reason = await selected(file, root)
    if (reason) return stop(reason === "symlink" ? "unsupported" : "not-run", reason)
    escaped.push(patternEscape(file))
  }
  return { status: "ok" as const, argv: [input.executable, "--config", input.config, "--reporter", "json", "--", ...escaped] }
}

async function canonicalRoot(root: string) {
  const canonical = await realpath(root).catch((error: NodeJS.ErrnoException) => error)
  if (canonical instanceof Error) return stop("not-run", named(canonical, "root-missing"))
  const info = await lstat(canonical).catch((error: NodeJS.ErrnoException) => error)
  if (info instanceof Error) return stop("not-run", named(info, "root-missing"))
  if (!info.isDirectory()) return stop("not-run", "root-not-directory")
  return canonical
}

async function hostFile(config: string, root: string) {
  const info = await lstat(config).catch((error: NodeJS.ErrnoException) => error)
  if (info instanceof Error) return named(info, "config-missing")
  if (info.isSymbolicLink()) return "config-symlink"
  if (!info.isFile()) return "config-not-file"
  const physicalPath = await realpath(config).catch((error: NodeJS.ErrnoException) => error)
  if (physicalPath instanceof Error) return named(physicalPath, "config-missing")
  if (inside(root, physicalPath)) return "config-inside"
  return readable(config)
}

async function selected(file: string, root: string) {
  const info = await lstat(file).catch((error: NodeJS.ErrnoException) => error)
  if (info instanceof Error) return named(info, "missing")
  if (info.isSymbolicLink()) return "symlink"
  if (info.isDirectory()) return "directory"
  if (!info.isFile()) return "not-file"
  const physicalPath = await realpath(file).catch((error: NodeJS.ErrnoException) => error)
  if (physicalPath instanceof Error) return named(physicalPath, "missing")
  if (!inside(root, physicalPath)) return "path-outside"
  return readable(file)
}

function inside(root: string, file: string) {
  const relative = path.relative(root, file)
  return relative.length > 0 && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)
}

function named(error: NodeJS.ErrnoException, missing: string) {
  if (error.code === "ENOENT") return missing
  if (error.code === "EACCES" || error.code === "EPERM") return "unreadable"
  return `fs-${error.code ?? "error"}`
}

async function readable(file: string) {
  const opened = await access(file, constants.R_OK).then(() => undefined, (error: NodeJS.ErrnoException) => error)
  if (!opened) return undefined
  return named(opened, "missing")
}

function unverified(value: string) {
  const head = value.slice(0, 4).replaceAll("/", "\\")
  return head === "\\\\?\\" || head === "\\\\.\\"
}

function hostConfig(config: string, root: string) {
  if (config.includes("\0") || root.includes("\0")) return "nul"
  if (!spelled(root, root) || !spelled(config, root)) return "config-not-absolute"
  if (dots(config, root) || dots(root, root)) return "path-outside"
  if (flavor(root).resolve(config) === flavor(root).resolve(root) || containedPath(config, root)) return "config-inside"
  return undefined
}

function sqlFile(file: string, root: string) {
  if (file.includes("\0")) return "nul"
  if (flavor(root).sep === "\\" ? /[\\/]$/.test(file) : file.endsWith("/")) return "directory"
  if (!spelled(file, root)) return "not-absolute"
  if (dots(file, root) || !containedPath(file, root)) return "path-outside"
  if (!flavor(root).basename(file).endsWith(".sql")) return "not-sql"
  return undefined
}

function spelled(value: string, root: string) {
  if (/^[A-Za-z]:(?![\\/])/.test(value) || !flavor(root).isAbsolute(value)) return false
  if (flavor(root).sep === "/") return value.startsWith("/")
  if (/^[A-Za-z]:[\\/]/.test(root)) return /^[A-Za-z]:[\\/]/.test(value)
  return value.startsWith("\\\\") || value.startsWith("//")
}

function dots(value: string, root: string) {
  return value.split(flavor(root).sep === "\\" ? /[\\/]/ : /\//).includes("..")
}

function patternEscape(value: string) {
  let escaped = ""
  for (const char of value) escaped += char === "?" || char === "*" || char === "[" || char === "]" ? `[${char}]` : char
  return escaped
}

function decode(data: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data)
  } catch {
    return undefined
  }
}
