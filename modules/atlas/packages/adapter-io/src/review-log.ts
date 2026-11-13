// @atlas/adapter-io — src/review-log.ts  (D14: the shared review log, `.atlas/project/review.jsonl`)
//
// One append-only, content-keyed log for every human review act the Atlas screen and CLI record: a curator holding
// or releasing a staged candidate (R2), a reviewer proposing a fact for T1/T0 and a person deciding it (R3), an
// interview answer (R11), and a steward's memory proposal and decision (R1). Each act is ONE record; nothing is
// edited or removed, and the current state — what is held, which proposals are open — is a FOLD over the records.
//
// The file is the durable-log primitive (`durable-log.ts`), exactly as the memory logs are: every line is a kernel
// `Event` whose `payload` is the record without its id and whose `contentHash` is the record id, so a torn or edited
// line fails its own content-key check and is COUNTED (`rejected`), never folded in. It travels in git
// (`.gitignore` re-admits it, `.gitattributes` merges it by union), so a hold made on one branch survives the merge.
//
// A record's id is the kernel content hash (`id`, `@atlas/kernel`) of the record's known fields. `at` is hashed too,
// so the same act repeated later is a second record and the fold decides by `at` (file order breaks a tie). Never
// name a record field `status`, `grounding` or `freshness`: the kernel hash drops those keys (KERNEL-8).

import { eventId, id } from "@atlas/kernel"
import type { Event } from "@atlas/kernel"
import { createDurableLog } from "./durable-log.js"
import { foldReview, parseInput, readRawReview, reviewLogPath } from "./review-records.js"
import type { ReviewFold, ReviewInput, ReviewRead, ReviewRecord } from "./review-records.js"

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

/** Read every verifiable record, in file order. Total — a missing file is an empty log, not an error. */
export function readReview(repoPath: string): ReviewRead {
  return readRawReview(repoPath)
}

/** The invariant line every review act reports, in the CLI and on the Atlas screen alike. */
export const REVIEW_INVARIANT =
  "REVIEW-LOG (D14): a review act is one appended, content-keyed record in .atlas/project/review.jsonl — nothing is edited or removed, and the current state is a fold over the records"

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
