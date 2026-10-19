// @atlas/cli — src/review-common.ts  (the helpers every review-log command shares)
//
// The review log (`@atlas/adapter-io` review-log.ts, D14) is read by `atlas promote` (the held set) and written by
// the review commands (hold/release, propose/decide, answer). A command that DECIDES from the log must not decide
// over a log it cannot fully read: a torn or edited line could be the very hold or decision it would miss.
// Contract: specs/atlas-ui/build/tasks/B-L-API.md §3. The refusal text, the invariant line and the id-prefix rule
// live in adapter-io (D29), so the Atlas screen shows the same words.

import { foldReviewLog, REVIEW_INVARIANT } from "@atlas/adapter-io"
import type { ReviewFold } from "@atlas/adapter-io"
import { errorVerdict, refusalVerdict } from "./cli-verdict.js"
import { renderRefusal, renderVerdict } from "./render.js"
import type { CliVerdict } from "./render.js"

/** A governed refusal (exit 2): the invocation was well-formed and the review state declined it. */
export function governedRefusal(message: string): CliVerdict {
  return renderRefusal(refusalVerdict(message))
}

/** The folded review state, or the refusal to give when the log has lines that do not verify. */
export function foldOrRefuse(repoPath: string): { readonly fold: ReviewFold } | { readonly refusal: CliVerdict } {
  const read = foldReviewLog(repoPath)
  return "fold" in read ? read : { refusal: governedRefusal(read.reason) }
}

/** A successful review outcome (exit 0) in the CLI's status/next/invariant shape, plus detail lines. */
export function reviewOutcome(next: string, lines: readonly string[]): CliVerdict {
  return { exitCode: 0, stdout: `${["status: ok", `next: ${next}`, `invariant: ${REVIEW_INVARIANT}`, ...lines].join("\n")}\n` }
}

/** A usage error (exit 1): the invocation itself was wrong. */
export function usageError(message: string): CliVerdict {
  return renderVerdict(errorVerdict(message))
}

/** The `--by <actor>` every review write is attributed to, or `undefined` when absent, bare or blank. */
export function requireBy(flags: Readonly<Record<string, string>>): string | undefined {
  const by = flags["by"]
  return by === undefined || by === "true" || by.trim().length === 0 ? undefined : by.trim()
}
