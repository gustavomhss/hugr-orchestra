export * as ReviewLocalCargoInput from "./local-cargo-input"

import path from "path"
import { constants } from "fs"
import { lstat, open } from "fs/promises"
import { Effect } from "effect"
import type { ReviewScanProjection } from "./scan-projection"
import { ReviewLocalCargoPaths } from "./local-cargo-paths"

export type Refusal = ReviewLocalCargoPaths.Refusal

const MAX_MANIFESTS = 512
const MAX_FILE = 64 * 1024
const MAX_TOTAL = 4 * 1024 * 1024
const MAX_PATH = 2048
const OPEN = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)

export function check(projection: ReviewScanProjection.Projection): Effect.Effect<Refusal | undefined> {
  const selected = select(projection.files)
  if (selected.kind === "refusal") return Effect.succeed(selected.refusal)
  const paths = projection.files.map((entry) => entry.path)
  return load(projection.root, selected.entries).pipe(
    Effect.flatMap((loaded) => {
      if (loaded.kind === "refusal") return Effect.succeed(loaded.refusal)
      const failed = ReviewLocalCargoPaths.check(loaded.manifests, paths)
      if (failed) return Effect.succeed(failed)
      return ancestors(path.dirname(projection.root))
    }),
    Effect.catch(() => Effect.succeed({ status: "acquisition-error" as const, reason: "cargo-manifest-changed" })),
  )
}

type Entry = ReviewScanProjection.Projection["files"][number]
type Loaded = { readonly kind: "refusal"; readonly refusal: Refusal } | { readonly kind: "manifests"; readonly manifests: ReadonlyArray<ReviewLocalCargoPaths.Manifest> }

function refusal(status: Refusal["status"], reason: string) {
  return { kind: "refusal" as const, refusal: { status, reason } }
}

function select(files: ReviewScanProjection.Projection["files"]) {
  const entries = files.filter((entry) => typeof entry.path === "string" && entry.path.split("/").at(-1) === "Cargo.toml")
  if (entries.length === 0) return refusal("not-run", "cargo-manifest-missing")
  if (entries.length > MAX_MANIFESTS) return refusal("not-run", "cargo-manifest-budget")
  let total = 0
  for (const entry of entries) {
    if (!posixEntry(entry.path)) return refusal("not-run", "cargo-path-outside")
    if (Buffer.byteLength(entry.path, "utf8") > MAX_PATH) return refusal("not-run", "cargo-manifest-budget")
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) return refusal("acquisition-error", "cargo-manifest-changed")
    if (entry.bytes > MAX_FILE) return refusal("not-run", "cargo-manifest-budget")
    total += entry.bytes
    if (total > MAX_TOTAL) return refusal("not-run", "cargo-manifest-budget")
  }
  return { kind: "entries" as const, entries }
}

function posixEntry(rel: string): boolean {
  if (rel.length === 0 || rel.includes("\0") || rel.includes("\\") || rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) return false
  return rel.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
}

function hostPath(root: string, rel: string): string | undefined {
  if (!path.isAbsolute(root)) return undefined
  const file = path.join(root, ...rel.split("/"))
  const base = root.endsWith(path.sep) ? root : root + path.sep
  if (file !== root && !file.startsWith(base)) return undefined
  return file
}

function load(root: string, entries: ReadonlyArray<Entry>): Effect.Effect<Loaded, unknown> {
  return Effect.gen(function* () {
    const manifests: Array<ReviewLocalCargoPaths.Manifest> = []
    for (const entry of entries) {
      const read = yield* readManifest(root, entry)
      if (read.kind === "refusal") return read
      manifests.push(read.manifest)
    }
    return { kind: "manifests" as const, manifests }
  })
}

function readManifest(root: string, entry: Entry) {
  return Effect.scoped(Effect.gen(function* () {
    const file = hostPath(root, entry.path)
    if (!file) return refusal("not-run", "cargo-path-outside")
    const listed = yield* Effect.tryPromise(() => lstat(file))
    if (listed.isSymbolicLink() || !listed.isFile() || listed.size !== entry.bytes) return refusal("acquisition-error", "cargo-manifest-changed")
    const handle = yield* Effect.acquireRelease(
      Effect.tryPromise(() => open(file, OPEN)),
      (opened) => Effect.promise(() => opened.close()),
    )
    const opened = yield* Effect.tryPromise(() => handle.stat())
    if (!opened.isFile() || opened.size !== entry.bytes) return refusal("acquisition-error", "cargo-manifest-changed")
    const buffer = Buffer.alloc(entry.bytes)
    let offset = 0
    while (offset < entry.bytes) {
      const part = yield* Effect.tryPromise(() => handle.read(buffer, offset, entry.bytes - offset, offset))
      if (!part.bytesRead) return refusal("acquisition-error", "cargo-manifest-changed")
      offset += part.bytesRead
    }
    const again = yield* Effect.tryPromise(() => handle.stat())
    if (!again.isFile() || again.size !== entry.bytes) return refusal("acquisition-error", "cargo-manifest-changed")
    const sha256 = new Bun.CryptoHasher("sha256").update(buffer).digest("hex")
    if (sha256 !== entry.sha256) return refusal("acquisition-error", "cargo-manifest-changed")
    const parsed = yield* Effect.try({ try: () => Bun.TOML.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)), catch: () => "cargo-manifest-invalid" as const }).pipe(
      Effect.map((value) => ({ ok: true as const, value })),
      Effect.catch(() => Effect.succeed({ ok: false as const })),
    )
    if (!parsed.ok) return refusal("acquisition-error", "cargo-manifest-invalid")
    return { kind: "manifest" as const, manifest: { path: entry.path, value: parsed.value } }
  }))
}

// The pinned CLI walks parents even when a root workspace exists (v0.9.2 search_unused.rs:267).
// Probe only known-name metadata; never read an outside manifest or disclose its path/content.
function ancestors(directory: string, remaining = 128): Effect.Effect<Refusal | undefined> {
  return Effect.gen(function* () {
    if (remaining === 0) return { status: "not-run" as const, reason: "cargo-manifest-budget" }
    const found = yield* Effect.tryPromise({
      try: () => lstat(path.join(directory, "Cargo.toml")).then(() => true).catch((error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return false
        throw error
      }),
      catch: () => "unavailable" as const,
    }).pipe(Effect.catch(() => Effect.succeed("unavailable" as const)))
    if (found === "unavailable") return { status: "not-run" as const, reason: "cargo-ancestor-unavailable" }
    if (found) return { status: "not-run" as const, reason: "cargo-ancestor-outside" }
    const parent = path.dirname(directory)
    if (parent !== directory) return yield* ancestors(parent, remaining - 1)
  })
}
