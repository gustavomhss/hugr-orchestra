export * as ToolSafetySandboxRuntime from "./tool-safety-sandbox-runtime"

import path from "path"
import { createHash } from "crypto"
import { execFile } from "child_process"
import { access, mkdir, mkdtemp, rename, rm, writeFile } from "fs/promises"
import { promisify } from "util"
import which from "which"
import { Context, Effect } from "effect"
import { Global } from "./global"
import { ToolSafety } from "./tool-safety"

// The Linux shell jail is Anthropic's sandbox-runtime (`srt`, npm `@anthropic-ai/sandbox-runtime`) over bubblewrap.
// The host fetches it on first need from the npm registry and ripgrep's GitHub releases at pinned versions, checks each
// archive against its pinned integrity before extracting it, and installs it under the app cache dir (the sandbox
// denies data and state). bubblewrap and socat come from the system package manager: the host never installs them, it
// reports them missing. macOS uses the built-in seatbelt; Windows needs an elevated `srt windows-install` that creates
// a local account and machine-wide firewall filters, which the host does not do.

/** One pinned upstream archive, verified before extraction. */
export type Artifact = {
  readonly url: string
  /** Subresource-integrity digest of the archive: `sha512-<base64>` or `sha256-<base64>`. */
  readonly integrity: string
  /** Directory inside the archive that becomes `target`. */
  readonly root: string
  /** Install-relative destination. */
  readonly target: string
}

export type Source = {
  readonly directory: string
  readonly artifacts: ReadonlyArray<Artifact>
  /** System executables the runtime needs on PATH; the host never installs them. */
  readonly dependencies: ReadonlyArray<string>
}

const VERSION = "0.0.78"
const RIPGREP = "15.1.0"
// Integrity values are the npm registry's `dist.integrity` and the sha512 of ripgrep's release archives, whose
// upstream .sha256 files were checked when pinning.
const PACKAGES = [
  ["@anthropic-ai/sandbox-runtime", VERSION, "sha512-YAIcybXTp7MZkBjasnkR1E3yxnf7u6kUkyW0vZrtsAZ9tyJGMaugWETmquPZs0YvW0sR0VnZeMfS0gsN/wQiVQ=="],
  ["@pondwader/socks5-server", "1.0.10", "sha512-bQY06wzzR8D2+vVCUoBsr5QS2U6UgPUQRmErNwtsuI6vLcyRKkafjkr3KxbtGFf9aBBIV2mcvlsKD1UYaIV+sg=="],
  ["commander", "12.1.0", "sha512-Vw8qHK3bZM9y/P10u3Vib8o/DdkvA2OtPtZvD871QKjy74Wj1WSKFILMPRPSdUSx5RFK1arlJzEtA4PkFgnbuA=="],
  ["node-forge", "1.4.0", "sha512-LarFH0+6VfriEhqMMcLX2F7SwSXeWwnEAJEsYm5QKWchiVYVvJyV9v7UDvUv+w5HO23ZpQTXDv/GxdDdMyOuoQ=="],
  ["zod", "3.25.76", "sha512-gzUt/qt81nXsFGKIFcC3YnfEAx5NkunCfnDlvuBSSFS02bcXu4Lmea0AFIUwbLWxWPx3d9p8S5QoaujKcNQxcQ=="],
] as const
const RIPGREP_LINUX = {
  x64: ["x86_64-unknown-linux-musl", "sha512-xGkIH47/SSN5qRKnl4Q1opKavAXmYrDlPdK7Bm3yZsq4S+38Vy97MwQDoWta/NCVfr25jFdz6K/Awd8qRlqddQ=="],
  arm64: ["aarch64-unknown-linux-gnu", "sha512-hMb4c/CgVFfKavEo+vsWkExHzql33IzzWz4X4fL5uex77U/59O27gKLAu8fSUdrxLYhzl53LjCNvIDfYV3Bosw=="],
} as const
// A failed acquisition is retried on a later need, not on every command.
const RETRY_MS = 5 * 60_000

export const Source = Context.Reference<Source | undefined>("@orchestra/ToolSafetySandbox/Source", {
  defaultValue: () => {
    const ripgrep = process.platform === "linux" ? RIPGREP_LINUX[process.arch as keyof typeof RIPGREP_LINUX] : undefined
    if (!ripgrep) return undefined
    return {
      directory: path.join(Global.Path.cache, "sandbox-runtime", `${VERSION}-${process.arch}`),
      dependencies: ["bwrap", "socat"],
      artifacts: [
        ...PACKAGES.map(([name, version, integrity]) => ({
          url: `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${version}.tgz`,
          integrity,
          root: "package",
          target: path.join("node_modules", name),
        })),
        {
          url: `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP}/ripgrep-${RIPGREP}-${ripgrep[0]}.tar.gz`,
          integrity: ripgrep[1],
          root: `ripgrep-${RIPGREP}-${ripgrep[0]}`,
          target: "ripgrep",
        },
      ],
    }
  },
})

export const cli = (directory: string) => path.join(directory, "node_modules", "@anthropic-ai", "sandbox-runtime", "dist", "cli.js")
export const ripgrep = (directory: string) => path.join(directory, "ripgrep", "rg")

const attempts = new Map<string, { readonly failed?: string; readonly at: number }>()

/**
 * The installed runtime directory, or the reason no jail is available. With `start`, a missing runtime begins
 * acquisition in the background; the command that needed it runs without the jail and a later one uses it.
 */
export const resolve = Effect.fn("ToolSafetySandboxRuntime.resolve")(function* (start: boolean) {
  const source = yield* Source
  if (!source) return { reason: `sandbox-platform-unsupported: ${process.platform}-${process.arch}` }
  const missing = yield* Effect.promise(() =>
    Promise.all(source.dependencies.map(async (name) => ((await which(name, { nothrow: true })) ? [] : [name]))),
  )
  if (missing.flat().length) return { reason: `sandbox-dependency-missing: ${missing.flat().join(", ")}` }
  if (yield* installed(source.directory)) return { directory: source.directory }
  const attempt = attempts.get(source.directory)
  if (attempt && !attempt.failed) return { reason: "sandbox-runtime-acquiring" }
  if (attempt?.failed && (!start || Date.now() - attempt.at < RETRY_MS))
    return { reason: `sandbox-runtime-acquisition-failed: ${attempt.failed}` }
  if (!start) return { reason: "sandbox-runtime-not-acquired" }
  attempts.set(source.directory, { at: Date.now() })
  Effect.runFork(acquire(source).pipe(Effect.match({
    onSuccess: () => attempts.delete(source.directory),
    onFailure: (error) => attempts.set(source.directory, { failed: error.reason, at: Date.now() }),
  })))
  return { reason: "sandbox-runtime-acquiring" }
})

/** Download, verify and extract every artifact into a staging dir, then move it into place in one rename. */
export const acquire = Effect.fn("ToolSafetySandboxRuntime.acquire")(function* (source: Source) {
  const parent = path.dirname(source.directory)
  yield* step("sandbox-runtime-directory", () => mkdir(parent, { recursive: true }))
  const staging = yield* step("sandbox-runtime-staging", () => mkdtemp(path.join(parent, ".staging-")))
  yield* Effect.gen(function* () {
    yield* Effect.forEach(source.artifacts, (artifact) => unpack(staging, artifact), { discard: true })
    yield* step("sandbox-runtime-marker", () => writeFile(path.join(staging, ".complete"), ""))
    // Another process may have installed it first; its complete install wins.
    yield* step("sandbox-runtime-install", () => rename(staging, source.directory)).pipe(
      Effect.catch((error) => installed(source.directory).pipe(Effect.flatMap((done) => done ? Effect.void : Effect.fail(error)))),
    )
  }).pipe(Effect.ensuring(Effect.promise(() => rm(staging, { recursive: true, force: true }))))
  return source.directory
})

const unpack = Effect.fnUntraced(function* (staging: string, artifact: Artifact) {
  const bytes = yield* step(`sandbox-runtime-download: ${artifact.url}`, async () => {
    const response = await fetch(artifact.url, { redirect: "follow", signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  })
  const separator = artifact.integrity.indexOf("-")
  const algorithm = artifact.integrity.slice(0, separator)
  if (!["sha256", "sha512"].includes(algorithm))
    return yield* new ToolSafety.Denied({ reason: `sandbox-runtime-integrity-unsupported: ${artifact.url}` })
  // Nothing from the archive is written to disk before its digest matches the pinned one.
  if (createHash(algorithm).update(bytes).digest("base64") !== artifact.integrity.slice(separator + 1))
    return yield* new ToolSafety.Denied({ reason: `sandbox-runtime-integrity-mismatch: ${artifact.url}` })
  const directory = yield* step("sandbox-runtime-staging", () => mkdtemp(path.join(staging, ".unpack-")))
  yield* step("sandbox-runtime-staging", () => writeFile(path.join(directory, "archive.tgz"), bytes))
  yield* step(`sandbox-runtime-extract: ${artifact.url}`, () => promisify(execFile)("tar", ["-xzf", "archive.tgz"], { cwd: directory }))
  yield* step("sandbox-runtime-staging", () => mkdir(path.dirname(path.join(staging, artifact.target)), { recursive: true }))
  yield* step(`sandbox-runtime-layout: ${artifact.url}`, () =>
    rename(path.join(directory, artifact.root), path.join(staging, artifact.target)),
  )
  yield* step("sandbox-runtime-staging", () => rm(directory, { recursive: true, force: true }))
})

const installed = (directory: string) =>
  Effect.promise(() => access(path.join(directory, ".complete")).then(() => true, () => false))

const step = <A>(reason: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => new ToolSafety.Denied({ reason }) })
