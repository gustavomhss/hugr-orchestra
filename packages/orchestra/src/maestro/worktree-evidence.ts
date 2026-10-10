import { createHash } from "node:crypto"
import path from "node:path"
import { Effect } from "effect"
import { Git } from "@/git"
import { Filesystem } from "@/util/filesystem"

// The append-only Atlas Memory logs (the union-merged files in .gitattributes).
const MEMORY_LOGS = [".atlas/memory.jsonl", ".atlas/orientation.jsonl"]
const MEMORY = MEMORY_LOGS.map((file) => `:(exclude)${file}`)

export const current = Effect.fn("MaestroContext.currentEvidence")(function* (directory: string) {
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
  const untrackedFiles = yield* Effect.forEach(untracked.text().split("\0").filter(Boolean).sort(), (file) =>
    Effect.promise(() => Bun.file(path.join(worktree, file)).arrayBuffer()).pipe(
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

export * as WorktreeEvidence from "./worktree-evidence"
