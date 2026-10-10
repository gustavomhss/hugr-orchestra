import { createHash } from "node:crypto"
import { constants, type Stats } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { Git } from "@/git"
import { Filesystem } from "@/util/filesystem"

// The append-only Atlas Memory logs (the union-merged files in .gitattributes).
const MEMORY_LOGS = [".atlas/memory.jsonl", ".atlas/orientation.jsonl"]
const MEMORY = MEMORY_LOGS.map((file) => `:(exclude)${file}`)

export const current = Effect.fn("MaestroContext.currentEvidence")(function* (
  directory: string,
  bounds?: { readonly files: number; readonly bytes: number },
) {
  const git = yield* Git.Service
  const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: directory })
  const worktree = Filesystem.windowsPath(root.text().replace(/\r?\n$/, ""))
  if (root.exitCode !== 0 || !worktree) return undefined
  const head = yield* git.run(["rev-parse", "HEAD"], { cwd: worktree })
  if (head.exitCode !== 0) return undefined
  // Atlas Memory logs are versioned with the code but are not task output (F4-O4): a Memory write must never make the
  // plan context dirty or stale. They are still committed and pushed like any tracked file.
  const diff = yield* git.run(["diff", "--binary", "--no-ext-diff", "HEAD", "--", ".", ...MEMORY], { cwd: worktree })
  const untracked = yield* git.run(["ls-files", "--others", "--exclude-standard", "-z", "--", ".", ...MEMORY], {
    cwd: worktree,
  })
  if (diff.exitCode !== 0 || diff.truncated || untracked.exitCode !== 0 || untracked.truncated) return undefined
  const files = untracked.text().split("\0").filter(Boolean).sort()
  if (bounds && (files.length > bounds.files || (untracked.text() && !untracked.text().endsWith("\0"))))
    return yield* Effect.die(new Error("worktree-evidence-untracked-overflow-or-framing"))
  const budget = { remaining: bounds?.bytes ?? Infinity }
  const untrackedFiles = yield* Effect.forEach(files, (file) =>
    Effect.promise(async () => {
      if (!bounds) return Bun.file(path.join(worktree, file)).arrayBuffer()
      const bytes = await readBounded(worktree, file, budget.remaining)
      budget.remaining -= bytes.byteLength
      if (budget.remaining < 0) throw new Error("worktree-evidence-untracked-overflow")
      return bytes
    }).pipe(
      Effect.map((bytes) => ({ file, sha256: createHash("sha256").update(Buffer.from(bytes)).digest("hex") })),
    ),
  )
  return {
    directory,
    branch: (yield* git.branch(worktree)) ?? "DETACHED",
    headSHA: head.text().trim(),
    changedPaths: (yield* git.status(worktree))
      .map((item) => item.file)
      .filter((file) => !MEMORY_LOGS.includes(file))
      .sort(),
    diffSHA256: createHash("sha256").update(diff.stdout).digest("hex"),
    untrackedFiles,
  }
})

// Completion-only: reject links before opening, bind the opened leaf to its inspected identity, then recheck paths
// before and after reading. Portable path checks cannot make ancestor traversal atomic (no openat API here).
async function readBounded(worktree: string, file: string, remaining: number) {
  const root = await realpath(worktree)
  if (root !== path.resolve(worktree)) throw new Error("worktree-evidence-untracked-physical-escape")
  const target = path.resolve(root, file)
  const relative = path.relative(root, target)
  if (path.isAbsolute(file) || !relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error("worktree-evidence-untracked-physical-escape")
  const parts = relative.split(path.sep)
  const paths = [root, ...parts.map((_part, index) => path.join(root, ...parts.slice(0, index + 1)))]
  const inspect = () => Promise.all(paths.map(async (name, index) => {
    const info = await lstat(name)
    if (info.isSymbolicLink() || (index === paths.length - 1 ? !info.isFile() : !info.isDirectory()))
      throw new Error("worktree-evidence-untracked-link-or-type")
    if (await realpath(name) !== name) throw new Error("worktree-evidence-untracked-physical-escape")
    return info
  }))
  const before = await inspect()
  const leaf = before.at(-1)
  if (!leaf) throw new Error("worktree-evidence-untracked-identity")
  if (leaf.size > remaining) throw new Error("worktree-evidence-untracked-overflow")
  const unchanged = async () => {
    const after = await inspect()
    if (after.some((info, index) => !sameIdentity(info, before[index])))
      throw new Error("worktree-evidence-untracked-identity")
  }
  // O_NOFOLLOW is not available on every platform. fstat/path identity checks remain mandatory on those platforms.
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  return (async () => {
    const opened = await handle.stat()
    if (!sameContent(opened, leaf)) throw new Error("worktree-evidence-untracked-identity")
    await unchanged()
    const bytes = Buffer.alloc(leaf.size + 1)
    const read = await handle.read(bytes, 0, bytes.length, 0)
    if (read.bytesRead > remaining) throw new Error("worktree-evidence-untracked-overflow")
    if (read.bytesRead !== leaf.size || !sameContent(await handle.stat(), opened))
      throw new Error("worktree-evidence-untracked-changed-or-short-read")
    await unchanged()
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + read.bytesRead)
  })().finally(() => handle.close())
}

function sameIdentity(left: Stats, right: Stats | undefined) {
  return !!right && left.dev === right.dev && left.ino === right.ino &&
    left.isFile() === right.isFile() && left.isDirectory() === right.isDirectory()
}

function sameContent(left: Stats, right: Stats) {
  return sameIdentity(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
}

export * as WorktreeEvidence from "./worktree-evidence"
