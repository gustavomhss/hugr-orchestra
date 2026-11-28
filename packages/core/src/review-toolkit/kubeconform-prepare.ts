export * as ReviewKubeconformPrepare from "./kubeconform-prepare"

import path from "node:path"
import { constants, type Stats } from "node:fs"
import { lstat, mkdtemp, open, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
import { Effect } from "effect"
import { BackendToolkit } from "../backend-toolkit"
import kubeconform from "../backend-toolkit/packs/kubeconform"
import type { AppProcess } from "../process"
import { ResearchProcess } from "../research-toolkit/process"
import { ReviewLocalTools } from "./local-tools"

export type Identity = {
  readonly id: "kubeconform"
  readonly version: "0.8.0"
  readonly target: "linux-x64"
  readonly executable: string
  readonly integrity: string
  readonly proof: "version-probe"
}
type Refused = { readonly ok: false; readonly reason: string }
export type Readiness = { readonly ok: true; readonly identity: Identity } | Refused
type Host = { readonly target: "linux-x64"; readonly root: string }
const BYTES = 32 * 1024 * 1024

/** Explicit host preparation only; every call checks the payload and runs a new version probe. */
export function prepare(): Effect.Effect<Readiness, never, AppProcess.Service> {
  return Effect.gen(function* () {
    const context = yield* host()
    if (!context.ok) return context
    const acquired = yield* configured(context.host, BackendToolkit.ensure<string>(kubeconform.id)).pipe(
      Effect.catchTag("BackendToolkit.NotReady", (error) => Effect.succeed(error)),
    )
    if (acquired instanceof BackendToolkit.NotReady) return unavailable(acquired.reason)
    const before = yield* installed(context.host)
    if (!before.ok) return before
    const outcome = yield* probe(before.identity.executable)
    if (!outcome || outcome.exitCode !== 0 || outcome.failure !== undefined || outcome.timedOut || outcome.overflow ||
      outcome.memoryExceeded || outcome.stdout.truncated || outcome.stderr.truncated) return unavailable("host-runtime-unavailable")
    if (outcome.stdout.data.toString("utf8") !== `v${kubeconform.version}\n` || outcome.stdout.bytes !== 7 ||
      outcome.stderr.bytes !== 0 || outcome.stderr.data.byteLength !== 0) return unavailable("host-version-mismatch")
    const after = yield* installed(context.host)
    if (!after.ok) return after
    if (after.stamp !== before.stamp) return unavailable("host-binary-changed")
    return { ok: true, identity: { ...after.identity, proof: "version-probe" } } as const
  })
}

const host = Effect.fn("ReviewKubeconformPrepare.host")(function* () {
  const target = yield* BackendToolkit.Target
  if (process.platform !== "linux" || process.arch !== "x64" || !("target" in target) || target.target !== "linux-x64")
    return unavailable("host-runtime-unqualified")
  const root = yield* ReviewLocalTools.Root
  // A changed declaration gets a fresh private cache; completed global installs are never repaired here.
  const namespace = createHash("sha256").update(JSON.stringify({ id: kubeconform.id, version: kubeconform.version,
    target: target.target, artifact: kubeconform.targets[target.target], binary: kubeconform.binaryIntegrity[target.target],
    notices: kubeconform.notices })).digest("hex")
  return { ok: true, host: { target: target.target, root: path.join(root, namespace) } } as const
})

const installed = Effect.fn("ReviewKubeconformPrepare.installed")(function* (context: Host) {
  // Status rechecks required notices both before and after the executable invocation.
  const states = yield* configured(context, BackendToolkit.status<string>(kubeconform.id))
  const state = states[0]
  if (state?.status !== "ready") return unavailable(state?.status === "unsupported" ? state.reason : "host-tool-unavailable")
  // Descriptor/name checks detect observed replacement, without claiming isolation from a hostile same-uid writer.
  const descriptor = yield* Effect.acquireRelease(
    Effect.promise(() => open(state.executable, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => undefined)),
    (file) => file ? Effect.promise(() => file.close()) : Effect.void,
  )
  if (!descriptor) return unavailable("host-binary-unavailable")
  const info = yield* Effect.promise(() => descriptor.stat().catch(() => undefined))
  if (!info?.isFile() || info.nlink !== 1 || info.size > BYTES) return unavailable("host-binary-unavailable")
  const bytes = Buffer.alloc(info.size + 1)
  const read = yield* Effect.promise(() => descriptor.read(bytes, 0, bytes.length, 0).catch(() => undefined))
  const after = yield* Effect.promise(() => descriptor.stat().catch(() => undefined))
  const named = yield* Effect.promise(() => lstat(state.executable).catch(() => undefined))
  if (!read || read.bytesRead !== info.size || !after || !named?.isFile() || named.isSymbolicLink() || named.nlink !== 1 ||
    stamp(info) !== stamp(after) || stamp(info) !== stamp(named)) return unavailable("host-binary-unavailable")
  const integrity = `sha256-${createHash("sha256").update(bytes.subarray(0, read.bytesRead)).digest("base64")}`
  if (integrity !== kubeconform.binaryIntegrity[context.target]) return unavailable("host-binary-mismatch")
  return { ok: true, stamp: stamp(info), identity: { id: kubeconform.id, version: kubeconform.version, target: context.target,
    executable: state.executable, integrity } } as const
}, Effect.scoped)

function stamp(info: Stats) {
  return `${info.dev}:${info.ino}:${info.size}:${info.ctimeMs}:${info.mtimeMs}`
}

const probe = Effect.fn("ReviewKubeconformPrepare.probe")(function* (executable: string) {
  const home = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(path.join(tmpdir(), "orchestra-kubeconform-probe-")).then((made) => realpath(made)).catch(() => undefined)),
    (directory) => directory ? Effect.promise(() => rm(directory, { recursive: true, force: true })) : Effect.void,
  )
  if (!home) return undefined
  return yield* ResearchProcess.run({ command: executable, args: ["-v"], cwd: home, env: ReviewLocalTools.environment(home),
    timeoutMs: 5_000, maxBytes: 4096, maxRssBytes: 128 * 1024 * 1024 })
}, Effect.scoped)

function configured<A, E, R>(context: Host, work: Effect.Effect<A, E, R>) {
  return work.pipe(Effect.provideService(BackendToolkit.Root, context.root),
    Effect.provideService(BackendToolkit.Manifest, { [kubeconform.id]: kubeconform }),
    Effect.provideService(BackendToolkit.Target, { target: context.target }))
}

function unavailable(reason: string): Refused {
  return { ok: false, reason }
}
