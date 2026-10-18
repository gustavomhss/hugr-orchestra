import { createHash, randomUUID } from "node:crypto"
import { copyFileSync, rmSync } from "node:fs"
import { realpath } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { FSUtil } from "@orchestra/core/fs-util"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { Git } from "@/git"

/** The hold the final cold-review check raises while the workers' result has no code-stage APPROVE. */
export const REQUIRED = "WORKFLOW_CODE_REVIEW_REQUIRED"

/**
 * The workers' result as the code-stage review sees it. Workers never commit (their sandbox denies `.git`), so the
 * result is the working tree written as a tree object through a temporary index: the plan-reviewed head plus every
 * non-ignored change. HEAD must still be that head, and every changed path must lie inside the approved writePaths.
 */
export const result = Effect.fn("CodeReview.result")(function* (input: {
  readonly worktree: string
  readonly base: string
  readonly writePaths: readonly string[]
  readonly maxOutputBytes: number
}) {
  const git = yield* Git.Service
  const index = path.join(os.tmpdir(), `orchestra-code-review-${randomUUID()}`)
  const env = { GIT_INDEX_FILE: index }
  const cwd = input.worktree
  return yield* Effect.gen(function* () {
    const head = yield* git.run(["rev-parse", "HEAD"], { cwd })
    if (head.exitCode || head.text().trim() !== input.base) return { status: "head-moved" as const }
    // Starting from the real index keeps its stat cache, so `add` rehashes only files that changed.
    const real = yield* git.run(["rev-parse", "--path-format=absolute", "--git-path", "index"], { cwd })
    yield* Effect.try({ try: () => copyFileSync(real.text().trim(), index), catch: () => undefined }).pipe(
      Effect.ignore,
    )
    const read = yield* git.run(["read-tree", "-m", input.base], { cwd, env })
    const added = read.exitCode ? read : yield* git.run(["add", "-A", "--", "."], { cwd, env })
    const written = added.exitCode ? added : yield* git.run(["write-tree"], { cwd, env })
    const tree = written.text().trim()
    if (written.exitCode || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(tree)) return { status: "unavailable" as const }
    const names = yield* git.run(
      ["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", input.base, tree, "--", "."],
      { cwd },
    )
    if (names.exitCode || names.truncated) return { status: "unavailable" as const }
    const changedPaths = names.text().split("\0").filter(Boolean)
    if (!changedPaths.length) return { status: "unchanged" as const, tree }
    const outside = changedPaths.filter(
      (file) => !input.writePaths.some((root) => FSUtil.contains(path.resolve(cwd, root), path.resolve(cwd, file))),
    )
    if (outside.length) return { status: "outside" as const, outside }
    const diff = yield* git.run(
      [
        "diff",
        "--binary",
        "--full-index",
        "--no-ext-diff",
        "--no-renames",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        input.base,
        tree,
        "--",
        ".",
      ],
      { cwd, maxOutputBytes: input.maxOutputBytes },
    )
    if (diff.truncated) return { status: "too-large" as const }
    if (diff.exitCode || !diff.stdout.length) return { status: "unavailable" as const }
    return {
      status: "ready" as const,
      tree,
      changedPaths,
      diff: diff.text(),
      sha256: createHash("sha256").update(diff.stdout).digest("hex"),
    }
  }).pipe(Effect.ensuring(Effect.sync(() => rmSync(index, { force: true }))))
})

/** The approved writePaths of a plan revision's bound workflow; a revision without one has no code stage. */
export const writePaths = Effect.fn("CodeReview.writePaths")(function* (planRevisionID: string) {
  const database = yield* Database.Service
  const row = yield* database.db
    .select()
    .from(EventTable)
    .where(eq(EventTable.id, EventV2.ID.make(planRevisionID)))
    .get()
    .pipe(Effect.orDie)
  if (row?.type !== EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV3.type, 3)) return undefined
  const revision = Schema.decodeUnknownOption(MaestroEvent.PlanRevision.RecordedV3.data)(row.data)
  return Option.isSome(revision) ? revision.value.workflowBinding?.writePaths : undefined
})

/**
 * Lucy's echoed code-stage artifact against the result recomputed now: `baseSHA` is the plan-reviewed head and
 * `headSHA` the result tree. Returns the bound artifact and diff, or the rejection reason.
 */
export const verify = Effect.fn("CodeReview.verify")(function* (
  value: unknown,
  input: {
    readonly worktree: string
    readonly base: string
    readonly planRevisionID: string
    readonly workCardHash: string
    readonly maxOutputBytes: number
  },
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { reason: "malformed-artifact-evidence" }
  const artifact = value as Record<string, unknown>
  if (
    typeof artifact.worktree !== "string" ||
    !Array.isArray(artifact.changedPaths) ||
    Object.keys(artifact).some((key) => !["baseSHA", "headSHA", "worktree", "changedPaths", "sha256"].includes(key))
  )
    return { reason: "malformed-artifact-evidence" }
  if (artifact.baseSHA !== input.base) return { reason: "code-review-base-mismatch" }
  const worktree = yield* real(artifact.worktree)
  if (!worktree || worktree !== (yield* real(input.worktree))) return { reason: "artifact-worktree-mismatch" }
  const scope = yield* writePaths(input.planRevisionID)
  if (!scope) return { reason: "code-review-scope-unavailable" }
  const current = yield* result({ ...input, writePaths: scope })
  if (current.status !== "ready") return { reason: `code-review-result-${current.status}` }
  if (artifact.headSHA !== current.tree) return { reason: "artifact-context-mismatch" }
  if (!isDeepStrictEqual(artifact.changedPaths, current.changedPaths)) return { reason: "artifact-path-mismatch" }
  if (artifact.sha256 !== current.sha256) return { reason: "artifact-bytes-mismatch" }
  return {
    artifact: {
      workCardHash: input.workCardHash,
      sha256: current.sha256,
      baseSHA: input.base,
      headSHA: current.tree,
      worktree: input.worktree,
      changedPaths: current.changedPaths,
    },
    diff: current.diff,
  }
})

const real = (value: string) =>
  Effect.tryPromise({ try: () => realpath(value), catch: () => undefined }).pipe(Effect.orElseSucceed(() => undefined))

/** Whether `findingLine` of `findingPath` is an added line of a unified diff. */
export function hasAddedLine(diff: string, findingPath: string, findingLine: number) {
  let file: string | undefined
  let line: number | undefined
  for (const value of diff.split("\n")) {
    if (value.startsWith("+++ b/")) {
      file = value.slice(6)
      line = undefined
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(value)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (line === undefined || file !== findingPath) continue
    if (value.startsWith("+") && !value.startsWith("+++")) {
      if (line === findingLine) return true
      line++
      continue
    }
    if (!value.startsWith("-\\ No newline at end of file") && !value.startsWith("-")) line++
  }
  return false
}

export * as CodeReview from "./code-review"
