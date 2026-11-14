// Review acts remain append-only. New Memory decisions instead publish one joint immutable receipt;
// readReview composes both sources, so consumers do not infer completeness from the raw review file alone.

import { eventId, id } from "@atlas/kernel"
import type { Event } from "@atlas/kernel"
import { createDurableLog } from "./durable-log.js"
import { foldReview, parseInput, reviewLogPath } from "./review-records.js"
import type { ReviewFold, ReviewInput, ReviewRead, ReviewRecord } from "./review-records.js"
import { readMemoryDecisionReceipts } from "./memory-decision-receipts.js"

export { foldReview, resolveReviewId, reviewLogPath } from "./review-records.js"
export type { ReviewTier, ReviewBody, ReviewInput, ReviewRecord, ReviewOf, ReviewRead, ReviewFold } from "./review-records.js"

/**
 * Append one review act and return it with its id. THROWS on an input that does not match its kind (an empty
 * field, a tier other than T1/T0, an unknown verdict): callers validate first, so the throw is a defect path —
 * writing a line this module's own reader would reject would be a silent black hole.
 */
export function appendReview(repoPath: string, input: ReviewInput): ReviewRecord {
  const body = parseInput(input)
  if (body === undefined) {
    throw new Error(`review-log: refusing to append a malformed '${String((input as { kind?: unknown }).kind)}' record`)
  }
  const event: Omit<Event, "id"> = { seq: 0, contentHash: id(body), fresh: true, supersedes: [], payload: body }
  createDurableLog(reviewLogPath(repoPath)).append({ ...event, id: eventId(event) })
  return { ...body, id: String(event.contentHash) }
}

/** Raw review and validated joint Memory receipts, with shared diagnostics. */
export function readReview(repoPath: string): ReviewRead {
  return readMemoryDecisionReceipts(repoPath).review
}

/** The invariant line every review act reports, in the CLI and on the Atlas screen alike. */
export const REVIEW_INVARIANT =
  "REVIEW-LOG (D14): review acts are content-keyed records in .atlas/project/review.jsonl; new Memory decisions use joint immutable receipts in .atlas/project/memory-decisions — the current state folds both, and nothing is edited or removed"

/**
 * A review act a helper declined. `invalid`: the request itself is wrong (the CLI's exit 1). `governed`: the log or
 * the store declined it (exit 2). `reason` is the exact text the CLI prints and the Atlas screen shows.
 */
export interface ReviewRefusal {
  readonly ok: false
  readonly refusal: "invalid" | "governed"
  readonly reason: string
}

/** The folded review state, or the governed refusal when the log has lines that do not verify: a decision taken over
 *  a log that cannot be fully read could miss the very hold or decision a torn line held. */
export function foldReviewLog(repoPath: string): { readonly fold: ReviewFold } | ReviewRefusal {
  const read = readReview(repoPath)
  if (read.unreadable !== true && read.rejected === 0) return { fold: foldReview(read.records) }
  const why =
    read.unreadable === true
      ? "could not be read"
      : `has ${read.rejected} line(s) that do not verify (torn, edited, or not a review record)`
  return {
    ok: false,
    refusal: "governed",
    reason: `the review log ${reviewLogPath(repoPath)} ${why}, so a hold or a decision in it could be missed — repair or remove those lines, then re-run`,
  }
}
