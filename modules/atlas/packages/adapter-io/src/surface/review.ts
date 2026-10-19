// @atlas/adapter-io — src/surface/review.ts  (the Atlas UI surface: the review queue — D31)
//
// `review()` reads the shared review log (`../review-log.ts`, D14) and the interview (`interviewOf`, D29): what is
// held (R2), the open ratification proposals (R3) and memory proposals (R1), and the interview batch with a model's
// draft riding along (R11). The review writes act through the same adapter-io helpers the CLI's review commands
// call, so the screen and the CLI cannot diverge, and they refuse with the CLI's own words.
//
// COST, STATED: `review()` builds the code index once (`openQuestionsOf`), like `atlas interview`.

import { interviewOf } from "../open-questions-source.js"
import type { InterviewQuestion } from "../open-questions-source.js"
import { foldReview, readReview } from "../review-log.js"
import type { AtlasInterviewQuestion, AtlasReview } from "./types-review.js"

/** The review queue at `repoPath`. A log that cannot be fully read serves what verified and says so. */
export function review(repoPath: string): AtlasReview {
  const read = readReview(repoPath)
  const fold = foldReview(read.records)
  const interview = interviewOf(repoPath)
  return {
    state: "ok",
    unreadable: read.unreadable === true || read.rejected > 0,
    held: [...fold.held].sort(),
    proposals: fold.openProposals.map((p) => ({
      id: p.id,
      nodeKey: p.nodeKey,
      toTier: p.toTier,
      reason: p.reason,
      by: p.by,
      at: p.at,
    })),
    memoryProposals: fold.openMemoryProposals.map((p) => ({
      id: p.id,
      member: p.member,
      rule: p.rule,
      scope: p.scope,
      by: p.by,
      at: p.at,
    })),
    interview: { batch: interview.batch.map(question), deferred: interview.deferred },
  }
}

function question(q: InterviewQuestion): AtlasInterviewQuestion {
  return {
    id: q.id,
    kind: q.kind,
    subject: q.subject,
    ask: q.ask,
    rank: q.rank,
    site: q.site.qualifiedPath,
    options: q.options === undefined ? null : [...q.options],
    nodeKey: q.nodeKey ?? null,
    draft:
      q.draft === undefined
        ? null
        : { answer: q.draft.answer, model: q.draft.model, why: q.draft.why, by: q.draft.by, at: q.draft.at },
  }
}
