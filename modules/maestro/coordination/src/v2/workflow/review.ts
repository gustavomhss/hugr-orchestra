export * as WorkflowReviewV2 from "./review"

import { createHash, randomUUID } from "node:crypto"
import { copyFile, realpath, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { and, desc, eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import type { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import type { GitCli } from "@orchestra/core/git-cli"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { GovernanceRecordsV2 } from "../governance/records"

// The code-review gate: the workers' uncommitted result as a
// Git tree, the approved writePaths that bound it, the check of Lucy's echoed code-stage artifact against it, and the
// code-stage receipt the workflow host's cold review reads for that tree.

type Db = Database.Interface["db"]

/** The hold the final cold-review check raises while the workers' result has no code-stage receipt at all. */
export const REQUIRED = "WORKFLOW_CODE_REVIEW_REQUIRED"
/** The graded failure of the final cold-review check while the workers' result has a FIX_FIRST or REJECT receipt. */
export const NOT_APPROVED = "WORKFLOW_CODE_REVIEW_NOT_APPROVED"
/** The hold of a settlement whose result is still the tree a FIX_FIRST already graded: no retry is spent. */
export const UNADDRESSED = "WORKFLOW_CODE_REVIEW_UNADDRESSED"

/**
 * The workers' result as the code-stage review sees it. Workers never commit (their sandbox denies `.git`), so the
 * result is the working tree written as a tree object through a temporary index: the plan-reviewed head plus every
 * change Git does not ignore. HEAD must still be that head, and every such changed path must lie inside the approved
 * writePaths. Known gap: files matched by `.gitignore` never enter the result, so writes to ignored paths are neither
 * reviewed nor scope-checked here; only the worker write sandbox bounds them.
 */
export const result = Effect.fn("WorkflowReviewV2.result")(function* (
  git: GitCli.Interface,
  input: {
    readonly worktree: string
    readonly base: string
    readonly writePaths: readonly string[]
    readonly maxOutputBytes: number
  },
) {
  const index = path.join(os.tmpdir(), `orchestra-code-review-${randomUUID()}`)
  const env = { GIT_INDEX_FILE: index }
  const cwd = input.worktree
  return yield* Effect.gen(function* () {
    const head = yield* git.run(["rev-parse", "HEAD"], { cwd })
    if (head.exitCode || head.text().trim() !== input.base) return { status: "head-moved" as const }
    // Starting from the real index keeps its stat cache, so `add` rehashes only files that changed.
    const shared = yield* git.run(["rev-parse", "--path-format=absolute", "--git-path", "index"], { cwd })
    yield* Effect.tryPromise(() => copyFile(shared.text().trim(), index)).pipe(Effect.ignore)
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
  }).pipe(
    Effect.ensuring(
      Effect.promise(() => Promise.all([rm(index, { force: true }), rm(`${index}.lock`, { force: true })])),
    ),
  )
})

/** The approved writePaths of a plan revision's bound workflow; a revision without one has no code stage. */
export const writePaths = Effect.fn("WorkflowReviewV2.writePaths")(function* (db: Db, planRevisionID: string) {
  const revision = yield* GovernanceRecordsV2.readPlanRevision(db, planRevisionID)
  return revision && "workflowBinding" in revision ? revision.workflowBinding?.writePaths : undefined
})

/**
 * Lucy's echoed code-stage artifact against the result recomputed now: `baseSHA` is the plan-reviewed head and
 * `headSHA` the result tree. Returns the bound artifact and diff, or the rejection reason.
 */
export const verify = Effect.fn("WorkflowReviewV2.verify")(function* (
  services: { readonly db: Db; readonly git: GitCli.Interface },
  value: unknown,
  input: {
    readonly worktree: string
    readonly base: string
    readonly planRevisionID: string
    readonly workCardHash: string
    readonly maxOutputBytes: number
  },
) {
  const artifact = Option.getOrUndefined(Schema.decodeUnknownOption(Artifact)(value, { onExcessProperty: "error" }))
  if (!artifact) return { reason: "malformed-artifact-evidence" }
  if (artifact.baseSHA !== input.base) return { reason: "code-review-base-mismatch" }
  const worktree = yield* real(artifact.worktree)
  if (!worktree || worktree !== (yield* real(input.worktree))) return { reason: "artifact-worktree-mismatch" }
  const scope = yield* writePaths(services.db, input.planRevisionID)
  if (!scope) return { reason: "code-review-scope-unavailable" }
  const current = yield* result(services.git, { ...input, writePaths: scope })
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

// The earlier runtime accepts only these keys, with a string worktree and a path array; the rest is compared against the recomputation.
const Artifact = Schema.Struct({
  baseSHA: Schema.optional(Schema.Unknown),
  headSHA: Schema.optional(Schema.Unknown),
  worktree: Schema.String,
  changedPaths: Schema.Array(Schema.Unknown),
  sha256: Schema.optional(Schema.Unknown),
})

const real = (value: string) => Effect.tryPromise(() => realpath(value)).pipe(Effect.orElseSucceed(() => undefined))

/**
 * The newest code-stage receipt of a validation for exactly this result tree: a later verdict on the same tree
 * supersedes an earlier one, and a receipt for another tree never answers for this one.
 */
export const receipt = Effect.fn("WorkflowReviewV2.receipt")(function* (
  db: Db,
  sessionID: string,
  validationRecordID: string,
  tree: string,
) {
  const rows = yield* db
    .select({ id: EventV2.EventTable.id, data: EventV2.EventTable.data })
    .from(EventV2.EventTable)
    .where(
      and(
        eq(EventV2.EventTable.aggregate_id, sessionID),
        eq(EventV2.EventTable.type, EventV2.versionedType(MaestroEvent.Review.ReceivedV2.type, 2)),
      ),
    )
    .orderBy(desc(EventV2.EventTable.seq))
    .all()
    .pipe(Effect.orDie)
  return rows
    .flatMap((row) =>
      Option.toArray(
        Schema.decodeUnknownOption(MaestroEvent.Review.ReceivedV2.data)(row.data).pipe(
          Option.map((data) => ({ id: row.id, data })),
        ),
      ),
    )
    .find(
      (row) =>
        row.data.validationRecordID === validationRecordID &&
        row.data.stage === "code" &&
        row.data.artifact.headSHA === tree,
    )
})
