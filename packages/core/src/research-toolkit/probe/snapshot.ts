export * as ProbeSnapshot from "./snapshot"

import path from "path"
import { constants } from "fs"
import { copyFile, lstat, mkdir, readlink, realpath, rm, symlink } from "fs/promises"
import { Effect } from "effect"
import { ResearchProcess } from "../process"
import type { Probe } from "./types"
import { denied } from "./assets"

// J4.4: a fresh snapshot per probe, in the probe's scratch. The runner reads and writes only that copy; the original
// worktree is reached only through the dependency links, which the jail leaves read-only.

export type Snapshot = {
  /** Physical root of the copy. */
  readonly root: string
  /** Physical root of the original worktree, for translating paths back. */
  readonly origin: string
  readonly kind: "commit" | "worktree"
  readonly revision: string
  readonly dirtyDigest?: string
  readonly files: number
}

const DEPENDENCIES = ["node_modules", ".venv", "target"]

export const create = Effect.fn("ProbeSnapshot.create")(function* (input: {
  readonly worktree: string
  readonly snapshot: Probe.ProbeInput["snapshot"]
  /** An empty directory the caller owns and removes. */
  readonly scratch: string
  readonly maxBytes: number
}) {
  const origin = yield* Effect.promise(() => realpath(input.worktree))
  const top = (yield* ResearchProcess.git(origin, ["rev-parse", "--show-toplevel"]).pipe(Effect.mapError(fail))).toString("utf8").trim()
  const repo = yield* Effect.promise(() => realpath(top))
  const root = path.join(input.scratch, "snapshot")
  yield* Effect.promise(() => mkdir(root))
  const made = input.snapshot.kind === "commit"
    ? yield* commit(repo, root, input.snapshot.revision, input)
    : yield* worktree(repo, root, input)
  yield* link(repo, root, made.paths)
  return { root, origin: repo, kind: input.snapshot.kind, revision: made.revision, dirtyDigest: made.dirtyDigest, files: made.paths.length } satisfies Snapshot
})

/** `git archive` of the resolved commit, extracted into the scratch; the size is checked from the tree first. */
const commit = Effect.fnUntraced(function* (repo: string, root: string, revision: string, input: { scratch: string; maxBytes: number }) {
  const hash = (yield* ResearchProcess.git(repo, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`]).pipe(
    Effect.mapError(() => denied(`snapshot-revision-unknown: ${revision}`)))).toString("utf8").trim()
  const entries = (yield* ResearchProcess.git(repo, ["ls-tree", "-r", "-l", "-z", hash]).pipe(Effect.mapError(fail)))
    .toString("utf8").split("\0").filter(Boolean).map((line) => {
      const tab = line.indexOf("\t")
      return { size: Number(line.slice(0, tab).trim().split(/\s+/)[3]) || 0, path: line.slice(tab + 1) }
    })
  // The tar and its extraction coexist briefly.
  if (entries.reduce((sum, entry) => sum + entry.size, 0) * 2 > input.maxBytes) return yield* denied("snapshot-exceeds-scratch-cap")
  const tar = path.join(input.scratch, "snapshot.tar")
  yield* ResearchProcess.git(repo, ["archive", "--format=tar", "-o", tar, hash]).pipe(Effect.mapError(fail))
  const extracted = yield* ResearchProcess.run({
    command: "tar", args: ["-xf", tar, "-C", root], cwd: input.scratch, env: ResearchProcess.environment(), timeoutMs: 300_000, maxBytes: 1024 * 1024,
  })
  yield* Effect.promise(() => rm(tar, { force: true }))
  if (extracted.exitCode !== 0) return yield* fail(new ResearchProcess.Failed({ command: "tar", detail: extracted.stderr.data.toString("utf8").trim() }))
  return { revision: hash, dirtyDigest: undefined, paths: entries.map((entry) => entry.path) }
})

/** File clones (clonefile on APFS, reflink where the filesystem has it, else a copy) of the tracked and unignored files. */
const worktree = Effect.fnUntraced(function* (repo: string, root: string, input: { maxBytes: number }) {
  const revision = (yield* ResearchProcess.git(repo, ["rev-parse", "--verify", "HEAD"]).pipe(
    Effect.mapError(() => denied("snapshot-worktree-has-no-commit")))).toString("utf8").trim()
  const listed = (yield* ResearchProcess.git(repo, ["ls-files", "-co", "--exclude-standard", "-z"]).pipe(Effect.mapError(fail)))
    .toString("utf8").split("\0").filter(Boolean)
  // Deleted tracked files and submodule gitlinks are listed but are no file to copy.
  const present = (yield* Effect.forEach([...new Set(listed)], (file) => Effect.promise(() =>
    lstat(path.join(repo, file)).then((stat) => stat.isFile() || stat.isSymbolicLink() ? [{ file, size: stat.size, link: stat.isSymbolicLink() }] : [], () => [])),
  { concurrency: 64 })).flat()
  if (present.reduce((sum, entry) => sum + entry.size, 0) > input.maxBytes) return yield* denied("snapshot-exceeds-scratch-cap")
  yield* Effect.forEach(present, (entry) => Effect.promise(async () => {
    const target = path.join(root, entry.file)
    await mkdir(path.dirname(target), { recursive: true })
    if (entry.link) return symlink(await readlink(path.join(repo, entry.file)), target)
    return copyFile(path.join(repo, entry.file), target, constants.COPYFILE_FICLONE)
  }), { concurrency: 64, discard: true })
  const dirty = (yield* ResearchProcess.git(repo, ["ls-files", "-mo", "--exclude-standard", "-z"]).pipe(Effect.mapError(fail)))
    .toString("utf8").split("\0").filter(Boolean).sort()
  const dirtyDigest = dirty.length ? yield* Effect.promise(async () => {
    const hasher = new Bun.CryptoHasher("sha256")
    for (const file of dirty) {
      hasher.update(`${file}\0`)
      const copy = Bun.file(path.join(root, file))
      hasher.update(await copy.exists() ? new Uint8Array(await copy.arrayBuffer()) : "deleted")
      hasher.update("\0")
    }
    return hasher.digest("hex")
  }) : undefined
  return { revision, dirtyDigest, paths: present.map((entry) => entry.file) }
})

/** Dependency directories of the original enter as symlinks, at the root and next to every package.json. */
const link = Effect.fnUntraced(function* (repo: string, root: string, paths: ReadonlyArray<string>) {
  const dirs = new Set(["", ...paths.filter((file) => path.basename(file) === "package.json" && !file.split("/").some((part) => DEPENDENCIES.includes(part)))
    .map((file) => path.dirname(file)).map((dir) => (dir === "." ? "" : dir))])
  yield* Effect.forEach([...dirs].flatMap((dir) => DEPENDENCIES.map((name) => path.join(dir, name))), (relative) => Effect.promise(async () => {
    const source = path.join(repo, relative)
    const stat = await lstat(source).catch(() => undefined)
    if (!stat?.isDirectory()) return
    if (await lstat(path.join(root, relative)).then(() => true, () => false)) return
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
    await symlink(source, path.join(root, relative))
  }), { concurrency: 16, discard: true })
})

const fail = (error: ResearchProcess.Failed) => denied(`snapshot-git-failed: ${error.command}: ${error.detail}`)
