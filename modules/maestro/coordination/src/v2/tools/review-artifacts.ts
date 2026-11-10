export * as ReviewArtifactsV2 from "./review-artifacts"

import { Effect } from "effect"
import type { GitCli } from "@orchestra/core/git-cli"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroReviewRecords } from "./review-records"
import { WorkflowReviewV2 } from "../workflow/review"

// The committed branch delta the plan stage reviews.
export const planArtifact = Effect.fn("MaestroReviewTools.planArtifact")(function* (
  git: GitCli.Interface,
  worktree: string,
  baseSHA: string,
  headSHA: string,
) {
  const artifact = yield* MaestroReviewRecords.diffArtifact(git, worktree, baseSHA, headSHA)
  if (artifact.diff.truncated)
    return yield* new Tool.Failure({
      message: `Review artifact exceeds ${MaestroReviewRecords.REVIEW_ARTIFACT_MAX_BYTES} bytes: the cold reviewer (\`lucy\`) reviews the whole committed branch delta merge-base(HEAD, <primary remote>/HEAD)..HEAD, here ${baseSHA}..${headSHA}, so splitting the work card does not help. The owner or a maintainer decides: a smaller branch delta, or a primary remote whose HEAD is the real base, then a new validation with a new workCardID.`,
    })
  if (
    artifact.names.exitCode !== 0 ||
    artifact.names.truncated ||
    artifact.diff.exitCode !== 0 ||
    artifact.diff.stdout.length === 0
  )
    return yield* new Tool.Failure({ message: "Review artifact diff unavailable" })
  return { baseSHA, headSHA, changedPaths: artifact.changedPaths, sha256: artifact.sha256, diff: artifact.diff.text() }
})

// The workers' uncommitted result the code stage reviews, written as a tree from the plan-reviewed head.
export const codeArtifact = Effect.fn("MaestroReviewTools.codeArtifact")(function* (
  git: GitCli.Interface,
  worktree: string,
  baseSHA: string,
  writePaths: readonly string[],
) {
  const result = yield* WorkflowReviewV2.result(git, {
    worktree,
    base: baseSHA,
    writePaths,
    maxOutputBytes: MaestroReviewRecords.REVIEW_ARTIFACT_MAX_BYTES,
  })
  if (result.status === "ready")
    return { baseSHA, headSHA: result.tree, changedPaths: result.changedPaths, sha256: result.sha256, diff: result.diff }
  return yield* new Tool.Failure({
    message:
      result.status === "head-moved"
        ? `Code review requires HEAD to stay at the plan-reviewed head ${baseSHA}: workers leave their result uncommitted.`
        : result.status === "unchanged"
          ? "Code review has nothing to review: the working tree still matches the plan-reviewed head."
          : result.status === "outside"
            ? `The workers' result changes paths outside the approved writePaths ${JSON.stringify(writePaths)}: ${JSON.stringify(result.outside.slice(0, 10))}.`
            : result.status === "too-large"
              ? `Review artifact exceeds ${MaestroReviewRecords.REVIEW_ARTIFACT_MAX_BYTES} bytes: the code review covers the workers' whole result since the plan review. The owner or a maintainer decides how to split the work.`
              : "Review artifact diff unavailable",
  })
})
