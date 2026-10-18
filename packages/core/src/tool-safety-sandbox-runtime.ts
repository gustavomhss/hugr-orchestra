export * as ToolSafetySandboxRuntime from "./tool-safety-sandbox-runtime"

import path from "path"
import { createHash } from "crypto"
import { execFile } from "child_process"
import { constants } from "fs"
import { access, mkdir, mkdtemp, rename, rm, writeFile } from "fs/promises"
import { promisify } from "util"
import which from "which"
import { Cause, Context, Effect, Option, Schedule } from "effect"
import { Global } from "./global"
import { RipgrepBinary } from "./ripgrep/binary"
import { ToolSafety } from "./tool-safety"
import { ToolSafetySrtReadAlias } from "./tool-safety-srt-read-alias"

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
  /** "path": srt runs the `rg` on PATH (a dependency then) instead of one installed with the runtime. */
  readonly ripgrep?: "path"
}

const VERSION = "0.0.78"
// Integrity values are the npm registry's `dist.integrity`. Ripgrep's archive and pin come from RipgrepBinary.
const PACKAGES = [
  ["@anthropic-ai/sandbox-runtime", VERSION, "sha512-YAIcybXTp7MZkBjasnkR1E3yxnf7u6kUkyW0vZrtsAZ9tyJGMaugWETmquPZs0YvW0sR0VnZeMfS0gsN/wQiVQ=="],
  ["@pondwader/socks5-server", "1.0.10", "sha512-bQY06wzzR8D2+vVCUoBsr5QS2U6UgPUQRmErNwtsuI6vLcyRKkafjkr3KxbtGFf9aBBIV2mcvlsKD1UYaIV+sg=="],
  ["commander", "12.1.0", "sha512-Vw8qHK3bZM9y/P10u3Vib8o/DdkvA2OtPtZvD871QKjy74Wj1WSKFILMPRPSdUSx5RFK1arlJzEtA4PkFgnbuA=="],
  ["node-forge", "1.4.0", "sha512-LarFH0+6VfriEhqMMcLX2F7SwSXeWwnEAJEsYm5QKWchiVYVvJyV9v7UDvUv+w5HO23ZpQTXDv/GxdDdMyOuoQ=="],
  ["zod", "3.25.76", "sha512-gzUt/qt81nXsFGKIFcC3YnfEAx5NkunCfnDlvuBSSFS02bcXu4Lmea0AFIUwbLWxWPx3d9p8S5QoaujKcNQxcQ=="],
] as const
// A failed acquisition is retried on a later need, not on every command.
const RETRY_MS = 5 * 60_000

/**
 * This host's runtime source. Ripgrep is installed with the runtime from RipgrepBinary's pinned release; where
 * ripgrep downloads are disabled (ORCHESTRA_DISABLE_RIPGREP_DOWNLOAD) or no release fits (arm64 musl), srt runs the
 * `rg` on PATH instead, and a missing one is reported like bwrap.
 */
export const source = (input: {
  readonly arch: string
  readonly platform: string
  readonly download: boolean
  readonly ripgrep: RipgrepBinary.Release | undefined
}): Source | undefined => {
  if (input.platform !== "linux" || !["x64", "arm64"].includes(input.arch)) return undefined
  const release = input.download ? input.ripgrep : undefined
  return {
    directory: path.join(
      Global.Path.cache,
      "sandbox-runtime",
      `${VERSION}-${ToolSafetySrtReadAlias.REVISION}-${input.arch}${release ? "" : "-path-rg"}`,
    ),
    dependencies: ["bwrap", "socat", ...(release ? [] : ["rg"])],
    ...(release ? {} : { ripgrep: "path" as const }),
    artifacts: [
      ...PACKAGES.map(([name, version, integrity]) => ({
        url: `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${version}.tgz`,
        integrity,
        root: "package",
        target: path.join("node_modules", name),
      })),
      ...(release
        ? [
            {
              url: release.url,
              integrity: `sha256-${Buffer.from(release.sha256, "hex").toString("base64")}`,
              root: release.root,
              target: "ripgrep",
            },
          ]
        : []),
    ],
  }
}

export const Source = Context.Reference<Source | undefined>("@orchestra/ToolSafetySandbox/Source", {
  defaultValue: () =>
    source({
      arch: process.arch,
      platform: process.platform,
      download: RipgrepBinary.defaults().download,
      ripgrep: RipgrepBinary.release(),
    }),
})

export const cli = (directory: string) => path.join(directory, "node_modules", "@anthropic-ai", "sandbox-runtime", "dist", "cli.js")
export const ripgrep = (directory: string) => path.join(directory, "ripgrep", "rg")
/** srt finds its seccomp helper at this package-root path first; true when it is present and executable. */
export const seccomp = (directory: string) => Effect.promise(() =>
  access(path.join(directory, "node_modules", "@anthropic-ai", "sandbox-runtime", "vendor", "seccomp", process.arch, "apply-seccomp"), constants.X_OK)
    .then(() => true, () => false))

const attempts = new Map<string, { readonly failed?: string; readonly at: number; readonly done?: Promise<void> }>()

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
  if (yield* installed(source.directory))
    return {
      directory: source.directory,
      // The dependency check above found it; srt gets its absolute path.
      ...(source.ripgrep === "path"
        ? { ripgrep: (yield* Effect.promise(() => which("rg", { nothrow: true }))) ?? undefined }
        : {}),
    }
  const attempt = attempts.get(source.directory)
  if (attempt && !attempt.failed) return { reason: "sandbox-runtime-acquiring" }
  if (attempt?.failed && (!start || Date.now() - attempt.at < RETRY_MS))
    return { reason: `sandbox-runtime-acquisition-failed: ${attempt.failed}` }
  if (!start) return { reason: "sandbox-runtime-not-acquired" }
  // Acquisition is asynchronous from its first step, so its outcome always lands after this entry.
  attempts.set(source.directory, {
    at: Date.now(),
    // Every outcome, a defect included, replaces this entry: a lost one would report "acquiring" forever.
    done: Effect.runPromise(acquire(source).pipe(Effect.matchCause({
      onSuccess: () => void attempts.delete(source.directory),
      onFailure: (cause) => void attempts.set(source.directory, {
        failed: Option.match(Cause.findErrorOption(cause), {
          onSome: (error) => error.reason,
          onNone: () => "sandbox-runtime-acquisition-defect",
        }),
        at: Date.now(),
      }),
    }))),
  })
  return { reason: "sandbox-runtime-acquiring" }
})

/** Waits for this host's in-flight runtime acquisition, if one is running; it never fails. */
export const settled = Effect.fn("ToolSafetySandboxRuntime.settled")(function* () {
  const source = yield* Source
  const done = source && attempts.get(source.directory)?.done
  if (done) yield* Effect.promise(() => done)
})

/** Like `resolve(true)`, but waits for an acquisition it starts or finds running: the installed directory, or why not. */
export const ready = Effect.fn("ToolSafetySandboxRuntime.ready")(function* () {
  yield* resolve(true)
  return yield* resolve(false).pipe(Effect.repeat({
    while: (runtime) => runtime.reason === "sandbox-runtime-acquiring",
    schedule: Schedule.spaced("1 second"),
    times: 300,
  }))
})

/** Download, verify and extract every artifact into a staging dir, then move it into place in one rename. */
export const acquire = Effect.fn("ToolSafetySandboxRuntime.acquire")(function* (source: Source) {
  const parent = path.dirname(source.directory)
  yield* step("sandbox-runtime-directory", () => mkdir(parent, { recursive: true }))
  const staging = yield* step("sandbox-runtime-staging", () => mkdtemp(path.join(parent, ".staging-")))
  yield* Effect.gen(function* () {
    yield* Effect.forEach(source.artifacts, (artifact) => unpack(staging, artifact), { discard: true })
    if (source.artifacts.some((artifact) => artifact.integrity === PACKAGES[0][2] &&
      artifact.target === path.join("node_modules", PACKAGES[0][0])))
      yield* ToolSafetySrtReadAlias.apply(staging)
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
