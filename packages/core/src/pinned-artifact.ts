export * as PinnedArtifact from "./pinned-artifact"

import path from "path"
import { createHash } from "crypto"
import { execFile } from "child_process"
import { access, chmod, mkdir, mkdtemp, rename, rm, writeFile } from "fs/promises"
import { promisify } from "util"
import which from "which"
import { Effect, Schema } from "effect"

// The host (never the model) installs pinned upstream artifacts. A download is checked against its pinned digest before
// any byte of it is written to disk, and the install directory only appears through one rename of a complete staging
// directory, so a reader sees either nothing or a finished install carrying `.complete`.

/** One pinned upstream download and the files it contributes to the install. */
export type Artifact = {
  readonly url: string
  /** Subresource-integrity digest of the download. */
  readonly integrity: `sha256-${string}` | `sha512-${string}`
  /** A `raw` download is the file itself, named by the last segment of the URL path. */
  readonly format: "tar.gz" | "zip" | "raw"
  /** Archive-relative sources moved to install-relative destinations. */
  readonly entries: ReadonlyArray<{ readonly from: string; readonly to: string; readonly executable?: boolean }>
}

/**
 * `cause` is one of `download:<status>` (`download:network` when no response arrived), `integrity-mismatch`,
 * `integrity-unsupported`, `extract`, `extractor-missing:<bin>`, `layout` or `filesystem`.
 */
export class Failed extends Schema.TaggedErrorClass<Failed>()("PinnedArtifactFailed", {
  cause: Schema.String,
}) {
  override get message() {
    return `Pinned artifact install failed: ${this.cause}`
  }
}

const DOWNLOAD_MS = 10 * 60_000

/** Download, verify and lay out every artifact in a staging dir, then move it into `directory` in one rename. */
export const install = Effect.fn("PinnedArtifact.install")(function* (
  directory: string,
  artifacts: ReadonlyArray<Artifact>,
) {
  if (yield* installed(directory)) return directory
  const parent = path.dirname(directory)
  yield* step("filesystem", () => mkdir(parent, { recursive: true }))
  const staging = yield* step("filesystem", () => mkdtemp(path.join(parent, ".staging-")))
  yield* Effect.gen(function* () {
    yield* Effect.forEach(artifacts, (artifact) => unpack(staging, artifact), { discard: true })
    yield* step("filesystem", () => writeFile(path.join(staging, ".complete"), ""))
    // A concurrent install may have renamed its staging dir first; its complete install wins.
    yield* step("filesystem", () => rename(staging, directory)).pipe(
      Effect.catch((error) =>
        installed(directory).pipe(Effect.flatMap((done) => (done ? Effect.void : Effect.fail(error)))),
      ),
    )
  }).pipe(Effect.ensuring(Effect.promise(() => rm(staging, { recursive: true, force: true }))))
  return directory
})

export const installed = (directory: string) =>
  Effect.promise(() =>
    access(path.join(directory, ".complete")).then(
      () => true,
      () => false,
    ),
  )

const unpack = Effect.fnUntraced(function* (staging: string, artifact: Artifact) {
  const separator = artifact.integrity.indexOf("-")
  const algorithm = artifact.integrity.slice(0, separator)
  if (algorithm !== "sha256" && algorithm !== "sha512") return yield* new Failed({ cause: "integrity-unsupported" })
  if (!artifact.entries.every((entry) => contained(entry.from) && contained(entry.to)))
    return yield* new Failed({ cause: "layout" })
  const extractor = artifact.format === "raw" ? undefined : command(artifact.format)
  if (extractor && !(yield* Effect.promise(() => which(extractor[0], { nothrow: true }))))
    return yield* new Failed({ cause: `extractor-missing:${extractor[0]}` })

  const response = yield* Effect.tryPromise({
    try: () => fetch(artifact.url, { redirect: "follow", signal: AbortSignal.timeout(DOWNLOAD_MS) }),
    catch: () => new Failed({ cause: "download:network" }),
  })
  if (!response.ok) return yield* new Failed({ cause: `download:${response.status}` })
  const bytes = yield* step("download:network", async () => new Uint8Array(await response.arrayBuffer()))
  // Nothing from the download reaches the disk before its digest matches the pin.
  if (createHash(algorithm).update(bytes).digest("base64") !== artifact.integrity.slice(separator + 1))
    return yield* new Failed({ cause: "integrity-mismatch" })

  const directory = yield* step("filesystem", () => mkdtemp(path.join(staging, ".unpack-")))
  const out = path.join(directory, "out")
  yield* step("filesystem", () => mkdir(out))
  yield* step("filesystem", () =>
    writeFile(extractor ? path.join(directory, `archive.${artifact.format}`) : path.join(out, path.posix.basename(new URL(artifact.url).pathname)), bytes),
  )
  if (extractor)
    yield* step("extract", () => promisify(execFile)(extractor[0], extractor.slice(1), { cwd: directory }))
  yield* Effect.forEach(
    artifact.entries,
    (entry) =>
      Effect.gen(function* () {
        const target = path.join(staging, entry.to)
        yield* step("filesystem", () => mkdir(path.dirname(target), { recursive: true }))
        yield* step("layout", () => rename(path.join(out, entry.from), target))
        if (entry.executable) yield* step("filesystem", () => chmod(target, 0o755))
      }),
    { discard: true },
  )
  yield* step("filesystem", () => rm(directory, { recursive: true, force: true }))
})

/** The extractor argv, run in the unpack dir with the download saved as `archive.<format>`, writing into `out`. */
function command(format: "tar.gz" | "zip") {
  if (format === "tar.gz") return ["tar", "-xzf", "archive.tar.gz", "-C", "out"]
  if (process.platform !== "win32") return ["unzip", "-q", "-o", "archive.zip", "-d", "out"]
  return [
    "powershell",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -LiteralPath archive.zip -DestinationPath out -Force",
  ]
}

/** A relative path that stays inside the directory it is resolved against. */
function contained(relative: string) {
  const normal = path.normalize(relative)
  return normal !== "." && path.parse(normal).root === "" && !normal.split(path.sep).includes("..")
}

const step = <A>(cause: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => new Failed({ cause }) })
