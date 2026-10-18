export * as ClaudeCodeExecutable from "./executable"

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import pkg from "../../package.json"

declare const ORCHESTRA_COMPILED: boolean
declare const ORCHESTRA_LIBC: string | undefined
declare const ORCHESTRA_CLAUDE_NODE: boolean

export const SDK_VERSION = pkg.dependencies["@anthropic-ai/claude-agent-sdk"]
// The pinned SDK's public package.json claudeCodeVersion; staging rejects metadata drift.
export const CODE_VERSION = "2.1.289"

export class UnavailableError extends Error {
  override name = "ClaudeCodeExecutableUnavailable"
}

export function target(platform: string, arch: string, libc?: string) {
  if (
    !["darwin", "linux", "win32"].includes(platform) ||
    !["x64", "arm64"].includes(arch) ||
    (platform === "linux" && libc !== "glibc" && libc !== "musl")
  )
    throw new UnavailableError(
      `Unsupported Claude Code executable target: ${platform}-${arch}-${libc ?? "unknown-libc"}`,
    )
  return `${platform}-${arch}${platform === "linux" && libc === "musl" ? "-musl" : ""}`
}

/** Resolve only real deployed resources or an explicit user install. Source runs retain SDK resolution. */
export function resolve(
  input: {
    executable?: string
    resources?: string
    compiled?: boolean
    platform?: string
    arch?: string
    libc?: string
    execPath?: string
    moduleURL?: string
    runtime?: "node" | "bun"
    env?: Record<string, string | undefined>
  } = {},
) {
  const env = input.env ?? process.env
  const executable = input.executable ?? env.ORCHESTRA_CLAUDE_CODE_EXECUTABLE
  if (executable !== undefined) return realExecutable(executable)
  const compiled = input.compiled ?? (typeof ORCHESTRA_COMPILED !== "undefined" && ORCHESTRA_COMPILED)
  const resources = input.resources ?? env.ORCHESTRA_CLAUDE_CODE_RESOURCES
  if (!compiled && resources === undefined) return undefined
  const platform = input.platform ?? process.platform
  const libc =
    input.libc ??
    (typeof ORCHESTRA_LIBC !== "undefined" ? ORCHESTRA_LIBC : undefined) ??
    (platform === "linux" ? nativeLibc() : undefined)
  const expected = target(platform, input.arch ?? process.arch, libc)
  const file = platform === "win32" ? "claude.exe" : "claude"
  // Bun executables ship a sibling directory; Node bundles ship it beside the entry module. Electron passes its
  // outside-asar resource directory explicitly, so neither lane can discover an arbitrary checkout or warm cache.
  const directory =
    resources ??
    path.join(
      (input.runtime ??
        (typeof ORCHESTRA_CLAUDE_NODE !== "undefined" && ORCHESTRA_CLAUDE_NODE
          ? "node"
          : typeof Bun !== "undefined"
            ? "bun"
            : "node")) === "bun"
        ? path.dirname(input.execPath ?? process.execPath)
        : path.dirname(fileURLToPath(input.moduleURL ?? import.meta.url)),
      "claude-code",
    )
  if (!path.isAbsolute(directory)) throw new UnavailableError(`Claude Code resources must be absolute: ${directory}`)
  const manifest: unknown = readManifest(directory)
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    !("schema" in manifest) ||
    manifest.schema !== 1 ||
    !("sdkVersion" in manifest) ||
    manifest.sdkVersion !== SDK_VERSION ||
    !("claudeCodeVersion" in manifest) ||
    manifest.claudeCodeVersion !== CODE_VERSION ||
    !("target" in manifest) ||
    manifest.target !== expected ||
    !("file" in manifest) ||
    manifest.file !== file ||
    !("sha256" in manifest) ||
    typeof manifest.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256)
  )
    throw new UnavailableError(
      `Invalid Claude Code resources for SDK ${SDK_VERSION}, Claude Code ${CODE_VERSION}, target ${expected}: ${directory}`,
    )
  const resolved = realExecutable(path.join(directory, file))
  if (path.dirname(resolved) !== fs.realpathSync(directory))
    throw new UnavailableError(`Claude Code resource escapes its deployed directory: ${directory}`)
  if (resourceDigest(resolved) !== manifest.sha256)
    throw new UnavailableError(`Claude Code deployed bytes differ: ${directory}`)
  return resolved
}

/**
 * The binary a Claude mode query starts, for running Claude Code's own CLI commands: the explicit or deployed one
 * (`resolve`), else the SDK's platform package as the SDK itself finds it in source runs, else `claude` on PATH.
 */
export function command(env: Record<string, string | undefined> = process.env) {
  const resolved = resolve({ env })
  if (resolved) return resolved
  const platform = process.platform
  const name = `@anthropic-ai/claude-agent-sdk-${target(platform, process.arch, platform === "linux" ? nativeLibc() : undefined)}`
  try {
    return createRequire(fileURLToPath(import.meta.resolve("@anthropic-ai/claude-agent-sdk"))).resolve(
      `${name}/${platform === "win32" ? "claude.exe" : "claude"}`,
    )
  } catch {
    return "claude"
  }
}

function resourceDigest(file: string) {
  try {
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  } catch (cause) {
    throw new UnavailableError(`Cannot read Claude Code deployed bytes: ${file}`, { cause })
  }
}

export function nativeLibc() {
  const report: unknown = process.report?.getReport()
  if (
    !report ||
    typeof report !== "object" ||
    !("header" in report) ||
    !report.header ||
    typeof report.header !== "object"
  )
    throw new UnavailableError("Cannot determine Claude Code executable Linux libc")
  return "glibcVersionRuntime" in report.header && report.header.glibcVersionRuntime ? "glibc" : "musl"
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
