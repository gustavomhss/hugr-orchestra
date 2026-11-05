export * as ProbeSnapshot from "./snapshot"

import path from "path"
import { constants } from "fs"
import { chmod, copyFile, lstat, mkdir, readlink, realpath, symlink, writeFile } from "fs/promises"
import { Effect } from "effect"
import { FSUtil } from "../../fs-util"
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
  const made = input.snapshot.kind === "commit"
    ? yield* commit(repo, root, input.snapshot.revision, input)
    : yield* worktree(repo, root, input)
  yield* link(repo, root, made.paths)
  return { root, origin: repo, kind: input.snapshot.kind, revision: made.revision, dirtyDigest: made.dirtyDigest, files: made.paths.length } satisfies Snapshot
})

/** Literal blobs of a commit or tree: archive attributes must not omit or rewrite reviewed bytes. */
const commit = Effect.fnUntraced(function* (repo: string, root: string, revision: string, input: { maxBytes: number }) {
  const hash = (yield* ResearchProcess.git(repo, ["rev-parse", "--verify", "--end-of-options", `${revision}^{tree}`]).pipe(
    Effect.mapError(() => denied(`snapshot-revision-unknown: ${revision}`)))).toString("utf8").trim()
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(hash)) return yield* denied("snapshot-tree-invalid")
  const listed = yield* ResearchProcess.git(repo, ["ls-tree", "-r", "-l", "-z", hash]).pipe(Effect.mapError(fail))
  const records = listed.toString("utf8").split("\0")
  if (!Buffer.from(listed.toString("utf8")).equals(listed) || records.at(-1) !== "")
    return yield* denied("snapshot-tree-list-invalid")
  const entries = yield* Effect.forEach(records.slice(0, -1), (record) => Effect.gen(function* () {
    const tab = record.indexOf("\t")
    const metadata = /^(100644|100755|120000|160000) (blob|commit) ([0-9a-f]{40}|[0-9a-f]{64}) +([0-9]+|-)$/.exec(record.slice(0, tab))
    if (tab < 0 || !metadata) return yield* denied("snapshot-tree-entry-invalid")
    const file = record.slice(tab + 1)
    const parts = file.split("/")
    const target = path.resolve(root, file)
    if (parts.some((part) => part === "" || part === "." || part === "..") ||
      (process.platform === "win32" && /[\\:]/.test(file)) || !FSUtil.contains(root, target))
      return yield* denied(`snapshot-path-outside: ${file}`)
    const gitlink = metadata[1] === "160000"
    const size = gitlink ? 0 : Number(metadata[4])
    if (gitlink ? metadata[2] !== "commit" || metadata[4] !== "-" :
      metadata[2] !== "blob" || !/^[0-9]+$/.test(metadata[4]) || !Number.isSafeInteger(size))
      return yield* denied(`snapshot-tree-entry-invalid: ${file}`)
    return { path: file, target, mode: metadata[1], hash: metadata[3], size, gitlink }
  }))
  const paths = new Set(entries.map((entry) => entry.path))
  if (paths.size !== entries.length || entries.some((entry) => entry.path.split("/").slice(0, -1)
    .some((_, index) => paths.has(entry.path.split("/").slice(0, index + 1).join("/")))))
    return yield* denied("snapshot-tree-path-conflict")
  if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 0 || entries.reduce((sum, entry) => sum + entry.size, 0) > input.maxBytes)
    return yield* denied("snapshot-exceeds-scratch-cap")
  yield* Effect.promise(() => mkdir(root))
  // Create every parent before any links, including aliases on case-insensitive filesystems.
  yield* Effect.forEach(entries.filter((entry) => !entry.gitlink), (entry) =>
    Effect.promise(() => mkdir(path.dirname(entry.target), { recursive: true })), { concurrency: 8, discard: true })
  const materialize = (entry: (typeof entries)[number]) => Effect.gen(function* () {
    const blob = yield* ResearchProcess.git(repo, ["cat-file", "blob", entry.hash]).pipe(Effect.mapError(fail))
    if (blob.length !== entry.size) return yield* denied(`snapshot-blob-size-mismatch: ${entry.path}`)
    if (entry.mode === "120000" && (blob.length === 0 || blob.includes(0)))
      return yield* denied(`snapshot-symlink-invalid: ${entry.path}`)
    yield* Effect.promise(async () => {
      if (entry.mode === "120000") return symlink(blob, entry.target)
      await writeFile(entry.target, blob, { flag: "wx", mode: entry.mode === "100755" ? 0o755 : 0o644 })
      await chmod(entry.target, entry.mode === "100755" ? 0o755 : 0o644)
    })
  })
  yield* Effect.forEach(entries.filter((entry) => !entry.gitlink && entry.mode !== "120000"), materialize, { concurrency: 8, discard: true })
  yield* Effect.forEach(entries.filter((entry) => entry.mode === "120000"), materialize, { concurrency: 8, discard: true })
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
  yield* Effect.promise(() => mkdir(root))
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
