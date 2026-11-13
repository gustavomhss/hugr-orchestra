export * as ReviewLocalTools from "./local-tools"

import path from "path"
import { constants, type Stats } from "fs"
import { lstat, mkdtemp, open, realpath, rm } from "fs/promises"
import { tmpdir } from "os"
import { createHash } from "crypto"
import { Context, Effect } from "effect"
import { BackendToolkit } from "../backend-toolkit"
import shfmt from "../backend-toolkit/packs/shfmt"
import cargoMachete from "../backend-toolkit/packs/cargo-machete"
import type { TargetId } from "../backend-toolkit/target"
import { Global } from "../global"
import type { AppProcess } from "../process"
import { ResearchProcess } from "../research-toolkit/process"

export type Tool = "shfmt" | "cargo-machete"
export type Identity = {
  readonly id: Tool
  readonly version: string
  readonly target: TargetId
  readonly executable: string
  readonly integrity: string
  readonly proof: "version-probe"
}
type Refused = { readonly ok: false; readonly reason: string }
export type Readiness = { readonly ok: true; readonly identity: Identity } | Refused
type Host = { pin: typeof shfmt | typeof cargoMachete; target: TargetId; root: string }

// Root is a private host-owned cache, never a repository or a path writable by untrusted project code.
export const Root = Context.Reference<string>("@orchestra/ReviewLocalTools/Root", {
  defaultValue: () => path.join(Global.Path.cache, "review-local-tools"),
})

// Cached bytes survive a restart; a version probe does not. Lookup never turns an old install into proof of health.
const prepared = new Map<string, string>()
const HOST_TARGETS: readonly TargetId[] = ["linux-x64", "win32-x64"]
const BYTES = 32 * 1024 * 1024

/** Explicit host preparation before capturing analyzer availability for a review run. Lookup cannot acquire. */
export function prepare(tool: Tool, run: typeof ResearchProcess.run = ResearchProcess.run): Effect.Effect<Readiness, never, AppProcess.Service> {
  return Effect.gen(function* () {
    const context = yield* host(tool)
    if (!context.ok) return context
    prepared.delete(context.host.root)
    const acquired = yield* configured(context.host, BackendToolkit.ensure<string>(tool)).pipe(
      Effect.catchTag("BackendToolkit.NotReady", (error) => Effect.succeed(error)),
    )
    if (acquired instanceof BackendToolkit.NotReady) return unavailable(acquired.reason)
    const result = yield* installed(context.host)
    if (!result.ok) return result
    const outcome = yield* probe(result.identity.executable, run)
    if (!outcome || outcome.exitCode !== 0 || outcome.failure !== undefined || outcome.timedOut || outcome.overflow || outcome.memoryExceeded || outcome.stdout.truncated || outcome.stderr.truncated)
      return unavailable("host-runtime-unavailable")
    const expected = tool === "shfmt" ? `v${context.host.pin.version}` : context.host.pin.version
    if (outcome.stdout.data.toString("utf8").trim() !== expected) return unavailable("host-version-mismatch")
    const current = yield* installed(context.host)
    if (!current.ok) return current
    if (current.stamp !== result.stamp) return unavailable("host-binary-changed")
    prepared.set(context.host.root, current.stamp)
    return { ok: true, identity: { ...result.identity, proof: "version-probe" } } as const
  })
}

/** Status/bytes only. No ensure, downloads, or executable invocation on the review lookup path. */
export function locate(tool: Tool): Effect.Effect<Readiness> {
  return Effect.gen(function* () {
    const context = yield* host(tool)
    if (!context.ok) return context
    const result = yield* installed(context.host)
    if (!result.ok) {
      prepared.delete(context.host.root)
      return result
    }
    if (prepared.get(context.host.root) !== result.stamp) {
      prepared.delete(context.host.root)
      return unavailable("host-runtime-unprepared")
    }
    return { ok: true, identity: { ...result.identity, proof: "version-probe" } } as const
  })
}

/** Cargo's subcommand sentinel must not change how the closed --version argv is parsed. */
export function environment(home: string, input: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(ResearchProcess.environment(input)).filter(([key]) =>
      !/^(?:CARGO|RUST|GO)/i.test(key) && !/^(?:HOME|USERPROFILE|APPDATA|LOCALAPPDATA|XDG_CONFIG_HOME|XDG_CACHE_HOME|TMPDIR)$/i.test(key))),
    HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, TMPDIR: home,
  }
}

const host = Effect.fn("ReviewLocalTools.host")(function* (tool: Tool) {
  if (tool !== "shfmt" && tool !== "cargo-machete") return unavailable("host-tool-unknown")
  const target = yield* BackendToolkit.Target
  if (!("target" in target) || !HOST_TARGETS.includes(target.target)) return unavailable("host-runtime-unqualified")
  const root = yield* Root
  const pin = tool === "shfmt" ? shfmt : cargoMachete
  // Notice/payload changes get a new cache namespace instead of silently trusting an old .complete marker.
  const namespace = createHash("sha256").update(JSON.stringify({ id: pin.id, version: pin.version, target: target.target,
    artifact: pin.targets[target.target], binary: pin.binaryIntegrity[target.target], notices: pin.notices })).digest("hex")
  return { ok: true, host: { pin, target: target.target, root: path.join(root, namespace) } } as const
})

const installed = Effect.fn("ReviewLocalTools.installed")(function* (context: Host) {
  const states = yield* configured(context, BackendToolkit.status<string>(context.pin.id))
  const state = states[0]
  if (state?.status !== "ready") return unavailable(state?.status === "unsupported" ? state.reason : "host-tool-unavailable")
  // The host owns this cache. Descriptor checks detect replacement; they do not isolate a hostile same-uid writer.
  const descriptor = yield* Effect.acquireRelease(
    Effect.promise(() => open(state.executable, constants.O_RDONLY | ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0)).catch(() => undefined)),
    (file) => file ? Effect.promise(() => file.close()) : Effect.void,
  )
  if (!descriptor) return unavailable("host-binary-unavailable")
  const info = yield* Effect.promise(() => descriptor.stat().catch(() => undefined))
  if (!info?.isFile() || info.nlink !== 1 || info.size > BYTES) return unavailable("host-binary-unavailable")
  const bytes = Buffer.alloc(info.size + 1)
  const read = yield* Effect.promise(() => descriptor.read(bytes, 0, bytes.length, 0).catch(() => undefined))
  const after = yield* Effect.promise(() => descriptor.stat().catch(() => undefined))
  const named = yield* Effect.promise(() => lstat(state.executable).catch(() => undefined))
  if (!read || read.bytesRead !== info.size || !after || !named?.isFile() || named.isSymbolicLink() ||
    named.nlink !== 1 || stamp(info) !== stamp(after) || stamp(info) !== stamp(named)) return unavailable("host-binary-unavailable")
  const integrity = `sha256-${createHash("sha256").update(bytes.subarray(0, read.bytesRead)).digest("base64")}`
  if (integrity !== context.pin.binaryIntegrity[context.target]) return unavailable("host-binary-mismatch")
  return { ok: true, stamp: stamp(info), identity: { id: context.pin.id, version: context.pin.version, target: context.target,
    executable: state.executable, integrity } } as const
}, Effect.scoped)

function stamp(info: Stats) {
  return `${info.dev}:${info.ino}:${info.size}:${info.ctimeMs}:${info.mtimeMs}`
}

const probe = Effect.fn("ReviewLocalTools.probe")(function* (executable: string, run: typeof ResearchProcess.run) {
  const home = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(path.join(tmpdir(), "orchestra-host-probe-")).then((made) => realpath(made)).catch(() => undefined)),
    (directory) => directory ? Effect.promise(() => rm(directory, { recursive: true, force: true })) : Effect.void,
  )
  if (!home) return undefined
  return yield* run({ command: executable, args: ["--version"], cwd: home, env: environment(home),
    timeoutMs: 5_000, maxBytes: 4096, maxRssBytes: 128 * 1024 * 1024 })
}, Effect.scoped)

function configured<A, E, R>(context: Host, work: Effect.Effect<A, E, R>) {
  return work.pipe(Effect.provideService(BackendToolkit.Root, context.root),
    Effect.provideService(BackendToolkit.Manifest, { [context.pin.id]: context.pin }),
    Effect.provideService(BackendToolkit.Target, { target: context.target }))
}

function unavailable(reason: string): Refused {
  return { ok: false, reason }
}
