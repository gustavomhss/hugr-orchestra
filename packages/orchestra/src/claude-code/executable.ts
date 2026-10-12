export * as ClaudeCodeExecutable from "./executable"

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pkg from "../../package.json"

declare const ORCHESTRA_COMPILED: boolean
declare const ORCHESTRA_LIBC: string | undefined

export const SDK_VERSION = pkg.dependencies["@anthropic-ai/claude-agent-sdk"]
// The pinned SDK's public package.json claudeCodeVersion; staging rejects metadata drift.
export const CODE_VERSION = "2.1.289"

export class UnavailableError extends Error {
  override name = "ClaudeCodeExecutableUnavailable"
}

export function target(platform: string, arch: string, libc?: string) {
  if (!["darwin", "linux", "win32"].includes(platform) || !["x64", "arm64"].includes(arch) ||
    (platform === "linux" && libc !== "glibc" && libc !== "musl"))
    throw new UnavailableError(`Unsupported Claude Code executable target: ${platform}-${arch}-${libc ?? "unknown-libc"}`)
  return `${platform}-${arch}${platform === "linux" && libc === "musl" ? "-musl" : ""}`
}

/** Resolve only real deployed resources or an explicit user install. Source runs retain SDK resolution. */
export function resolve(input: {
  executable?: string
  resources?: string
  compiled?: boolean
  platform?: string
  arch?: string
  libc?: string
  execPath?: string
  moduleURL?: string
  env?: Record<string, string | undefined>
} = {}) {
  const env = input.env ?? process.env
  const executable = input.executable ?? env.ORCHESTRA_CLAUDE_CODE_EXECUTABLE
  if (executable !== undefined) return realExecutable(executable)
  const compiled = input.compiled ?? (typeof ORCHESTRA_COMPILED !== "undefined" && ORCHESTRA_COMPILED)
  const resources = input.resources ?? env.ORCHESTRA_CLAUDE_CODE_RESOURCES
  if (!compiled && resources === undefined) return undefined
  const platform = input.platform ?? process.platform
  const libc = input.libc ?? (typeof ORCHESTRA_LIBC !== "undefined" ? ORCHESTRA_LIBC : undefined) ??
    (platform === "linux" ? (process.report?.getReport().header.glibcVersionRuntime ? "glibc" : "musl") : undefined)
  const expected = target(platform, input.arch ?? process.arch, libc)
  // Bun executables ship a sibling directory; Node bundles ship it beside the entry module. Electron passes its
  // outside-asar resource directory explicitly, so neither lane can discover an arbitrary checkout or warm cache.
  const directory = resources ?? path.join(
    typeof Bun !== "undefined" ? path.dirname(input.execPath ?? process.execPath) : path.dirname(fileURLToPath(input.moduleURL ?? import.meta.url)),
    "claude-code",
  )
  if (!path.isAbsolute(directory)) throw new UnavailableError(`Claude Code resources must be absolute: ${directory}`)
  const manifest: unknown = readManifest(directory)
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) ||
    !("schema" in manifest) || manifest.schema !== 1 ||
    !("sdkVersion" in manifest) || manifest.sdkVersion !== SDK_VERSION ||
    !("claudeCodeVersion" in manifest) || manifest.claudeCodeVersion !== CODE_VERSION ||
    !("target" in manifest) || manifest.target !== expected ||
    !("file" in manifest) || manifest.file !== (platform === "win32" ? "claude.exe" : "claude") ||
    !("sha256" in manifest) || typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.sha256))
    throw new UnavailableError(`Invalid Claude Code resources for SDK ${SDK_VERSION}, Claude Code ${CODE_VERSION}, target ${expected}: ${directory}`)
  const resolved = realExecutable(path.join(directory, manifest.file))
  if (path.dirname(resolved) !== fs.realpathSync(directory))
    throw new UnavailableError(`Claude Code resource escapes its deployed directory: ${directory}`)
  return resolved
}

function readManifest(directory: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"))
  } catch (cause) {
    throw new UnavailableError(`Cannot read Claude Code resources: ${directory}`, { cause })
  }
}

function realExecutable(file: string) {
  if (!path.isAbsolute(file)) throw new UnavailableError(`Claude Code executable must be absolute: ${file}`)
  try {
    const resolved = fs.realpathSync(file)
    if (!fs.statSync(resolved).isFile()) throw new Error("Not a regular file")
    fs.accessSync(resolved, process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK)
    return resolved
  } catch (cause) {
    throw new UnavailableError(`Cannot acquire Claude Code executable: ${file}`, { cause })
  }
}
