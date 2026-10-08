export * as ToolkitRuntime from "./runtime"

import path from "path"
import { constants } from "fs"
import { access, lstat, open, readFile, realpath, stat } from "fs/promises"
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
  readonly targets: Readonly<
    Partial<Record<TargetId, { readonly artifact: PinnedArtifact.Artifact; readonly executable: string }>>
  >
}

// Bound distinct runtime installs, including those whose callers stop waiting; hosted engines never hold these permits.
const installs = Semaphore.makeUnsafe(4)
const RECEIPT = ".runtime-pin"
const METADATA = [RECEIPT, ".complete"]

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
  if (
    ![runtime.id, runtime.version].every((part) => part !== "." && part !== ".." && /^[^/\\]+$/.test(part)) ||
    !payloadPath(pin.executable) || !pin.artifact.entries.every((entry) => payloadPath(entry.to))
  )
    return yield* new PinnedArtifact.Failed({ cause: "layout" })
  const directory = path.join(input.root, "runtimes", runtime.id, `${runtime.version}-${input.target}`)
  // Structural callers may construct equivalent pins in a different property order.
  const receipt = JSON.stringify({
    executable: pin.executable,
    artifact: {
      url: pin.artifact.url,
      integrity: pin.artifact.integrity,
      format: pin.artifact.format,
      entries: pin.artifact.entries.map((entry) => ({ from: entry.from, to: entry.to, executable: entry.executable === true })),
    },
  })
  const work = PinnedArtifact.install(directory, [pin.artifact], (staging) =>
    requireUnpopulatedMetadata(staging).pipe(
      Effect.andThen(validate(staging, pin.executable, input.target)),
      Effect.andThen(createReceipt(staging, receipt)),
      Effect.andThen(validate(staging, pin.executable, input.target)),
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
    try: () => lstat(path.join(directory, ".complete")),
    catch: () => new PinnedArtifact.Failed({ cause: "layout" }),
  })
  if (!complete.isFile()) return yield* new PinnedArtifact.Failed({ cause: "layout" })
  return { directory, executable: path.join(directory, pin.executable) }
})

/** Metadata names, including parent components and portable filesystem aliases, cannot belong to payloads. */
function payloadPath(relative: string) {
  const parts = relative.replaceAll("\\", "/").split("/")
  return relative !== "" && path.posix.normalize(parts.join("/")) !== "." &&
    path.posix.parse(relative).root === "" && path.win32.parse(relative).root === "" &&
    !parts.some((part) => part === ".." || METADATA.includes(part.split(":")[0].toLowerCase().replace(/[. ]+$/, "")))
}

/** Directory entries can carry files or dangling symlinks that lexical manifest checks cannot see. */
const requireUnpopulatedMetadata = (directory: string) => Effect.tryPromise({
  try: async () => {
    await Promise.all(METADATA.map(async (name) => {
      const present = await lstat(path.join(directory, name)).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false
          throw error
        },
      )
      if (present) throw new PinnedArtifact.Failed({ cause: "layout" })
    }))
  },
  catch: (error) => error instanceof PinnedArtifact.Failed ? error : new PinnedArtifact.Failed({ cause: "filesystem" }),
})

/** O_EXCL protects the check/create gap, including existing dangling symlinks; O_NOFOLLOW is additional POSIX protection. */
const createReceipt = (directory: string, receipt: string) => Effect.tryPromise({
  try: async () => {
    const file = await open(path.join(directory, RECEIPT), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600)
    await file.writeFile(receipt).finally(() => file.close())
  },
  catch: (error) => new PinnedArtifact.Failed({
    cause: error instanceof Error && "code" in error && (error.code === "EEXIST" || error.code === "ELOOP") ? "layout" : "filesystem",
  }),
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
