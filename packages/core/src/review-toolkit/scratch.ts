export * as ReviewScratch from "./scratch"

import os from "os"
import path from "path"
import { mkdtemp, realpath, rm } from "fs/promises"
import { Effect } from "effect"
import { FSUtil } from "../fs-util"
import { ResearchProcess } from "../research-toolkit/process"
import { denied } from "../research-toolkit/probe/assets"
import { ProbeSnapshot } from "../research-toolkit/probe/snapshot"
import { Probe } from "../research-toolkit/probe/types"

export { ProbeError } from "../research-toolkit/probe/assets"

// K7/E10: the host-made copy of the reviewed tree that probes and build-lane analyzers run in (design §6.3). Each copy
// lives in its own scratch directory, removed by the caller's Scope, so a review that holds a base and a head copy opens
// both in its one review scope. The reviewed worktree is only read; every write lands in a copy.

export type Snapshot = ProbeSnapshot.Snapshot & {
  /** The directory the caller's Scope removes; the copy is `root`, inside it. Probe runners may write their own files here. */
  readonly scratch: string
  /** sha256 of the copied tree as taken: its git tree and every changed or untracked file's bytes. Probes key repeat refusal on it. */
  readonly digest: string
}

/** One hunk to revert in a copy: the `current` lines starting at 1-based `line` are replaced by `original`. */
export type Hunk = {
  readonly path: string
  readonly line: number
  readonly current: ReadonlyArray<string>
  readonly original: ReadonlyArray<string>
}

/** A copy of `revision` (a commit), or of the working tree as it is now (`tree`), removed when the caller's Scope closes. */
export const create = Effect.fn("ReviewScratch.create")(function* (
  input: { readonly worktree: string; readonly maxBytes?: number } & ({ readonly revision: string } | { readonly tree: true }),
) {
  const scratch = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "orchestra-review-")).then((made) => realpath(made))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const snapshot = yield* ProbeSnapshot.create({
    worktree: input.worktree,
    snapshot: "revision" in input ? { kind: "commit", revision: input.revision } : { kind: "worktree" },
    scratch,
    maxBytes: input.maxBytes ?? Probe.Limits.scratchBytes,
  })
  return { ...snapshot, scratch, digest: yield* digest(snapshot) } satisfies Snapshot
})

/** The physical path of `file` inside the copy; refused when it, or a link on its way, leads outside the copy. */
export const resolve = Effect.fn("ReviewScratch.resolve")(function* (snapshot: Snapshot, file: string) {
  const target = path.resolve(snapshot.root, file)
  if (file.includes("\0") || !FSUtil.contains(snapshot.root, target)) return yield* denied(`scratch-path-outside: ${file}`)
  // Dependency directories are links to the original worktree, so the lexical check alone is not enough.
  const physical = yield* Effect.promise(() => existing(target))
  if (!FSUtil.contains(snapshot.root, physical)) return yield* denied(`scratch-path-outside: ${file}`)
  return physical
})

/** Reverts one hunk in the copy only (the regress probe's fail-before step); refused when the copy does not hold `current` there. */
export const revert = Effect.fn("ReviewScratch.revert")(function* (snapshot: Snapshot, hunk: Hunk) {
  const file = yield* resolve(snapshot, hunk.path)
  const text = yield* Effect.promise(() => Bun.file(file).text().catch(() => undefined))
  if (text === undefined) return yield* denied(`scratch-hunk-file-missing: ${hunk.path}`)
  const lines = text.split("\n")
  const start = hunk.line - 1
  const matches = Number.isInteger(hunk.line) && start >= 0 && start + hunk.current.length <= lines.length &&
    hunk.current.every((line, index) => lines[start + index] === line)
  if (!matches) return yield* denied(`scratch-hunk-mismatch: ${hunk.path}:${hunk.line}`)
  yield* Effect.promise(() => Bun.write(file, [...lines.slice(0, start), ...hunk.original, ...lines.slice(start + hunk.current.length)].join("\n")))
})

/** The commit's tree, plus for a worktree copy every file that differs from HEAD or is untracked, read from the copy. */
const digest = Effect.fnUntraced(function* (snapshot: ProbeSnapshot.Snapshot) {
  const tree = (yield* git(snapshot.origin, ["rev-parse", "--verify", `${snapshot.revision}^{tree}`])).trim()
  const changed = snapshot.kind === "worktree"
    ? [...new Set([
      ...(yield* git(snapshot.origin, ["diff", "--name-only", "--no-renames", "-z", snapshot.revision, "--"])).split("\0"),
      ...(yield* git(snapshot.origin, ["ls-files", "-o", "--exclude-standard", "-z"])).split("\0"),
    ].filter(Boolean))].sort()
    : []
  return yield* Effect.promise(async () => {
    const hasher = new Bun.CryptoHasher("sha256")
    hasher.update(`tree\0${tree}\0`)
    for (const file of changed) {
      hasher.update(`${file}\0`)
      const copy = Bun.file(path.join(snapshot.root, file))
      hasher.update(await copy.exists() ? new Uint8Array(await copy.arrayBuffer()) : "deleted")
      hasher.update("\0")
    }
    return hasher.digest("hex")
  })
})

const git = (cwd: string, args: ReadonlyArray<string>) =>
  ResearchProcess.git(cwd, args).pipe(
    Effect.map((data) => data.toString("utf8")),
    Effect.mapError((error) => denied(`snapshot-git-failed: ${error.command}: ${error.detail}`)),
  )

/** realpath of the deepest existing ancestor, with the missing rest appended. */
async function existing(target: string): Promise<string> {
  const found = await realpath(target).catch(() => undefined)
  if (found) return found
  const parent = path.dirname(target)
  if (parent === target) return target
  return path.join(await existing(parent), path.basename(target))
}
