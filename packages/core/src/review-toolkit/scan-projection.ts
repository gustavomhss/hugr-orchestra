export * as ReviewScanProjection from "./scan-projection"

import { tmpdir } from "os"
import path from "path"
import { constants, type Stats } from "fs"
import { lstat, mkdir, mkdtemp, open, opendir, realpath, rm } from "fs/promises"
import { Context, Effect, Scope } from "effect"
import { FSUtil } from "../fs-util"
import type { ReviewScratch } from "./scratch-copy"

export type Limits = { readonly maxBytes: number; readonly maxEntries: number; readonly maxDepth: number; readonly maxPathBytes: number }
export const DEFAULTS: Limits = { maxBytes: 64 * 1024 * 1024, maxEntries: 10_000, maxDepth: 64, maxPathBytes: 1024 * 1024 }
/** Host-owned scratch parent. Never a project-controlled location. */
export const Parent = Context.Reference<string>("@orchestra/ReviewScanProjection/Parent", { defaultValue: () => tmpdir() })
export type Projection = {
  readonly root: string
  readonly source: { readonly digest: string; readonly revision: string; readonly kind: "commit" | "worktree" }
  readonly files: ReadonlyArray<{ readonly path: string; readonly bytes: number; readonly sha256: string }>
  readonly excluded: ReadonlyArray<string>
  readonly digest: string
}
export type Result = { readonly ok: true; readonly projection: Projection } | { readonly ok: false; readonly reason: string }

const NAMES = new Set(["node_modules", ".venv", "target"])
const READ = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)

class Refusal {
  constructor(readonly reason: string) {}
}

/** Independent regular-file copies only, excluding declared host dependency roots. Lifetime belongs to the caller's Scope. */
export function create(input: { readonly snapshot: ReviewScratch.Snapshot; readonly limits?: Partial<Limits> }): Effect.Effect<Result, never, Scope.Scope> {
  const pending: { work?: Promise<unknown> } = {}
  const settle = () => pending.work?.then(() => undefined, () => undefined) ?? Promise.resolve()
  return Effect.gen(function* () {
    const limits = checked(input.limits)
    if (!limits) return refused("projection-limits-invalid")
    const parent = yield* Parent
    const ready = yield* Effect.tryPromise({
      try: () => prepare(input.snapshot, parent),
      catch: (error): Refusal => error instanceof Refusal ? error : new Refusal("projection-filesystem"),
    }).pipe(Effect.catch((error) => Effect.succeed(error)))
    if (ready instanceof Refusal) return refused(ready.reason)
    const stage = yield* Effect.acquireRelease(
      Effect.tryPromise({ try: () => mkdtemp(path.join(ready.parent, "scan-projection-")), catch: () => new Refusal("projection-filesystem") }),
      (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
    )
    yield* Effect.addFinalizer(() => Effect.promise(settle))
    return yield* Effect.tryPromise({
      try: () => {
        const work = project(ready, limits, stage)
        pending.work = work
        return work
      },
      catch: () => refused("projection-filesystem"),
    }).pipe(Effect.onInterrupt(() => Effect.promise(settle)))
  }).pipe(Effect.catch(() => Effect.succeed(refused("projection-filesystem"))))
}

function refused(reason: string): Result {
  return { ok: false, reason }
}

function checked(input: Partial<Limits> | undefined): Limits | undefined {
  const limits = {
    maxBytes: input?.maxBytes ?? DEFAULTS.maxBytes,
    maxEntries: input?.maxEntries ?? DEFAULTS.maxEntries,
    maxDepth: input?.maxDepth ?? DEFAULTS.maxDepth,
    maxPathBytes: input?.maxPathBytes ?? DEFAULTS.maxPathBytes,
  }
  if (!bounded(limits.maxBytes, 0, DEFAULTS.maxBytes)) return
  if (!bounded(limits.maxEntries, 1, DEFAULTS.maxEntries)) return
  if (!bounded(limits.maxDepth, 1, DEFAULTS.maxDepth)) return
  if (!bounded(limits.maxPathBytes, 1, DEFAULTS.maxPathBytes)) return
  return limits
}

function bounded(value: number, min: number, max: number) {
  return Number.isInteger(value) && value >= min && value <= max
}

type Ready = {
  readonly root: string
  readonly parent: string
  readonly source: Projection["source"]
  readonly excluded: ReadonlyArray<string>
  readonly pruned: ReadonlySet<string>
}

async function prepare(snapshot: ReviewScratch.Snapshot, parent: string): Promise<Ready> {
  if (!/^[0-9a-f]{64}$/.test(snapshot.digest) || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(snapshot.revision)) throw new Refusal("projection-root-invalid")
  if (snapshot.kind !== "commit" && snapshot.kind !== "worktree") throw new Refusal("projection-root-invalid")
  const rootStat = await lstat(snapshot.root).catch(() => undefined)
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) throw new Refusal("projection-root-invalid")
  const root = await realpath(snapshot.root).catch(() => undefined)
  if (root !== snapshot.root) throw new Refusal("projection-root-invalid")
  const dependencies = await dependencyRoots(snapshot.dependencyRoots, root)
  const parentStat = await lstat(parent).catch(() => undefined)
  if (!parentStat?.isDirectory() || parentStat.isSymbolicLink()) throw new Refusal("projection-parent-invalid")
  const canonical = await realpath(parent).catch(() => undefined)
  if (!canonical || FSUtil.contains(root, canonical)) throw new Refusal("projection-parent-invalid")
  return { root, parent: canonical, source: { digest: snapshot.digest, revision: snapshot.revision, kind: snapshot.kind }, excluded: dependencies.excluded, pruned: dependencies.pruned }
}

async function dependencyRoots(declared: readonly string[] | undefined, root: string) {
  if (!Array.isArray(declared)) throw new Refusal("projection-dependency-roots-invalid")
  const excluded: string[] = []
  const pruned = new Set<string>()
  for (const entry of declared) {
    if (typeof entry !== "string" || !path.isAbsolute(entry) || entry.includes("\0")) throw new Refusal("projection-dependency-roots-invalid")
    const stat = await lstat(entry).catch(() => undefined)
    if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Refusal("projection-dependency-roots-invalid")
    const real = await realpath(entry).catch(() => undefined)
    if (real !== entry || !NAMES.has(path.basename(entry)) || entry === root || !FSUtil.contains(root, entry)) throw new Refusal("projection-dependency-roots-invalid")
    const relative = path.relative(root, entry).split(path.sep).join("/")
    if (!relative || relative === ".." || relative.startsWith("../") || relative.split("/").includes("..")) throw new Refusal("projection-dependency-roots-invalid")
    excluded.push(relative)
    pruned.add(entry)
  }
  const sorted = [...new Set(excluded)].sort()
  return { excluded: sorted, pruned }
}

async function project(ready: Ready, limits: Limits, stage: string): Promise<Result> {
  const tree = path.join(stage, "tree")
  try {
    await mkdir(tree)
    const files: Array<{ path: string; bytes: number; sha256: string }> = []
    await walk(ready.root, "", 0, limits, ready.pruned, tree, files, { entries: 0, bytes: 0, pathBytes: 0 })
    files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
    const body = JSON.stringify({ source: ready.source, files, excluded: ready.excluded })
    return { ok: true, projection: { root: await realpath(tree), source: ready.source, files, excluded: ready.excluded, digest: hash(body) } }
  } catch (error) {
    await rm(stage, { recursive: true, force: true })
    if (error instanceof Refusal) return refused(error.reason)
    return refused("projection-filesystem")
  }
}

async function walk(dir: string, rel: string, depth: number, limits: Limits, pruned: ReadonlySet<string>, tree: string, files: Array<{ path: string; bytes: number; sha256: string }>, state: { entries: number; bytes: number; pathBytes: number }) {
  const names = await boundedNames(dir, rel, depth, limits, pruned, state)
  for (const name of names) {
    const relative = rel ? `${rel}/${name}` : name
    const absolute = path.join(dir, name)
    const stat = await lstat(absolute)
    if (stat.isSymbolicLink()) throw new Refusal("projection-source-link")
    if (stat.isDirectory()) {
      await walk(absolute, relative, depth + 1, limits, pruned, tree, files, state)
      continue
    }
    if (!stat.isFile()) throw new Refusal("projection-source-special")
    if (stat.nlink !== 1) throw new Refusal("projection-source-hardlink")
    const bytes = await readBounded(absolute, stat, limits.maxBytes - state.bytes)
    state.bytes += bytes.length
    const dest = path.join(tree, ...relative.split("/"))
    await mkdir(path.dirname(dest), { recursive: true })
    const handle = await open(dest, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600)
    await handle.writeFile(bytes).finally(() => handle.close())
    files.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) })
  }
}

async function boundedNames(dir: string, rel: string, depth: number, limits: Limits, pruned: ReadonlySet<string>, state: { entries: number; pathBytes: number }) {
  const handle = await opendir(dir)
  const names: string[] = []
  try {
    let entry = await handle.read()
    while (entry) {
      const absolute = path.join(dir, entry.name)
      if (!pruned.has(absolute)) {
        const relative = rel ? `${rel}/${entry.name}` : entry.name
        state.entries += 1
        state.pathBytes += Buffer.byteLength(relative, "utf8")
        if (state.entries > limits.maxEntries || state.pathBytes > limits.maxPathBytes || depth + 1 > limits.maxDepth) throw new Refusal("projection-budget")
        names.push(entry.name)
      }
      entry = await handle.read()
    }
  } finally {
    await handle.close()
  }
  names.sort()
  return names
}

async function readBounded(file: string, before: Stats, remaining: number) {
  if (before.size > remaining) throw new Refusal("projection-budget")
  const handle = await open(file, READ).catch((error: unknown) => {
    throw code(error) === "ELOOP" ? new Refusal("projection-source-link") : new Refusal("projection-filesystem")
  })
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || !stamp(before, opened)) throw new Refusal("projection-source-changed")
    const buffer = Buffer.alloc(Math.min(opened.size, remaining) + 1)
    let size = 0
    while (size < buffer.length) {
      const part = await handle.read(buffer, size, buffer.length - size, size)
      if (!part.bytesRead) break
      size += part.bytesRead
    }
    const after = await handle.stat()
    const named = await lstat(file)
    if (!stamp(opened, after) || !stamp(before, named) || size !== before.size) throw new Refusal("projection-source-changed")
    if (size > remaining) throw new Refusal("projection-budget")
    return buffer.subarray(0, size)
  } finally {
    await handle.close()
  }
}

function stamp(left: Stats, right: Stats) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.ctimeMs === right.ctimeMs && left.mtimeMs === right.mtimeMs
}
function code(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined
}
function hash(value: Uint8Array | string) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}
