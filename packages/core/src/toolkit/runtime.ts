export * as ToolkitRuntime from "./runtime"

import path from "path"
import { constants } from "fs"
import { access, readFile, realpath, stat, writeFile } from "fs/promises"
import { Effect, Semaphore } from "effect"
import { PinnedArtifact } from "../pinned-artifact"
import { TARGETS, type TargetId } from "../backend-toolkit/target"
import { ToolkitInstall } from "./install"

/** A pinned private runtime, independent of any capability pack's engine vocabulary. */
export type Runtime<Id extends string = string> = {
  readonly id: Id
  readonly version: string
  readonly license: string
  readonly upstream: string
  readonly targets: Readonly<Partial<Record<TargetId, {
    readonly artifact: PinnedArtifact.Artifact
    readonly executable: string
  }>>>
}

// Bound distinct runtime downloads; hosted engine work never holds these permits.
const installs = Semaphore.makeUnsafe(4)
const RECEIPT = ".runtime-pin"

/** Call only after authorization, on first use. No discovery or ambient environment changes. */
export const ensure = Effect.fn("ToolkitRuntime.ensure")(function* (input: {
  readonly root: string
  readonly runtime: Runtime
  readonly target: TargetId
}) {
  const runtime = input.runtime
  const pin = runtime.targets[input.target]
  if (!TARGETS.includes(input.target) || !pin)
    return yield* new PinnedArtifact.Failed({ cause: `unsupported-target:${input.target}` })
  if (![runtime.id, runtime.version].every((part) => part !== "." && part !== ".." && /^[^/\\]+$/.test(part)) ||
      !pin.executable || path.isAbsolute(pin.executable) || pin.executable.split(/[\\/]/).some((part) => part === "..") ||
      path.normalize(pin.executable) === ".")
    return yield* new PinnedArtifact.Failed({ cause: "layout" })
  const directory = path.join(input.root, "runtimes", runtime.id, `${runtime.version}-${input.target}`)
  const receipt = JSON.stringify(pin)
  const work = PinnedArtifact.install(directory, [pin.artifact], (staging) =>
    validate(staging, pin.executable, input.target).pipe(
      Effect.andThen(Effect.tryPromise({
        try: () => writeFile(path.join(staging, RECEIPT), receipt),
        catch: () => new PinnedArtifact.Failed({ cause: "filesystem" }),
      })),
    ),
  ).pipe(installs.withPermit)
  const cause = yield* ToolkitInstall.once(directory, work)
  if (cause !== undefined) return yield* new PinnedArtifact.Failed({ cause })
  yield* validate(directory, pin.executable, input.target)
  const saved = yield* Effect.tryPromise({
    try: () => readFile(path.join(directory, RECEIPT), "utf8").catch((error: NodeJS.ErrnoException) => {
      // Pre-extraction BackendToolkit caches have no receipt; retain them after executable validation.
      if (error.code === "ENOENT") return undefined
      throw error
    }),
    catch: () => new PinnedArtifact.Failed({ cause: "filesystem" }),
  })
  if (saved !== undefined && saved !== receipt)
    return yield* new PinnedArtifact.Failed({ cause: "integrity-mismatch" })
  const complete = yield* Effect.tryPromise({
    try: () => stat(path.join(directory, ".complete")),
    catch: () => new PinnedArtifact.Failed({ cause: "layout" }),
  })
  if (!complete.isFile()) return yield* new PinnedArtifact.Failed({ cause: "layout" })
  return { directory, executable: path.join(directory, pin.executable) }
})

/** Python archives use interpreter symlinks: allow them only when their file stays inside the install. */
const validate = (directory: string, relative: string, target: TargetId) => Effect.tryPromise({
  try: async () => {
    const executable = path.join(directory, relative)
    const resolved = path.relative(await realpath(directory), await realpath(executable))
    if (!resolved || path.isAbsolute(resolved) || resolved.split(path.sep).includes("..")) throw new Error("layout")
    const info = await stat(executable)
    if (!info.isFile() || info.size === 0) throw new Error("layout")
    await access(executable, constants.R_OK | (target !== "win32-x64" && process.platform !== "win32" ? constants.X_OK : 0))
  },
  catch: () => new PinnedArtifact.Failed({ cause: "layout" }),
})
