// @atlas/cli — src/review-common.ts  (the helpers every review-log command shares)
//
// The review log (`@atlas/adapter-io` review-log.ts, D14) is read by `atlas promote` (the held set) and written by
// the review commands (hold/release, propose/decide, answer). A command that DECIDES from the log must not decide
// over a log it cannot fully read: a torn or edited line could be the very hold or decision it would miss.
// Contract: specs/atlas-ui/build/tasks/B-L-API.md §3.

import { foldReview, readReview, reviewLogPath } from "@atlas/adapter-io"
import type { ReviewFold } from "@atlas/adapter-io"
import { refusalVerdict } from "./cli-verdict.js"
import { renderRefusal } from "./render.js"
import type { CliVerdict } from "./render.js"

/** A governed refusal (exit 2): the invocation was well-formed and the review state declined it. */
export function governedRefusal(message: string): CliVerdict {
  return renderRefusal(refusalVerdict(message))
}

/** The folded review state, or the refusal to give when the log has lines that do not verify. */
export function foldOrRefuse(repoPath: string): { readonly fold: ReviewFold } | { readonly refusal: CliVerdict } {
  const read = readReview(repoPath)
  if (read.unreadable === true || read.rejected > 0) {
    return {
      refusal: governedRefusal(
        `the review log ${reviewLogPath(repoPath)} ${read.unreadable === true ? "could not be read" : `has ${read.rejected} line(s) that do not verify (torn, edited, or not a review record)`}, so a hold or a decision in it could be missed — repair or remove those lines, then re-run`,
      ),
    }
  }
  return { fold: foldReview(read.records) }
}
