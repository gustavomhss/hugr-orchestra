// @atlas/adapter-io — src/review-answer.ts  (R11 / D29: answer one open interview question)
//
// The answer half of `atlas answer`, moved out of the CLI (lead decision D29) so the CLI runner and the Atlas
// screen's surface answer through ONE function. An answer is one `answer` record in the review log. A PERSON's
// `tier` answer of T1 or T0 also appends a `proposal`, so a rule still needs `atlas decide` by a person, and reuses
// an open proposal for the same node and tier instead of adding a second one. A model's DRAFTED answer only appends
// its `answer` record with `drafted`: it never proposes, and the question stays open until a person answers it.

import type { RankedQuestion } from "@atlas/genesis"
import { answeredIds, openQuestionsOf } from "./open-questions-source.js"
import { appendReview, foldReviewLog, resolveReviewId } from "./review-log.js"
import type { ReviewOf, ReviewRefusal } from "./review-log.js"

/** One answer. `questionId` is an exact id or a unique prefix of at least 8 characters. */
export interface AnswerInput {
  readonly questionId: string
  readonly answer: string
  readonly by: string
  readonly at: string
  readonly drafted?: { readonly model: string; readonly why: string }
}

export type AnswerResult =
  | {
      readonly ok: true
      readonly question: RankedQuestion
      readonly answer: ReviewOf<"answer">
      /** The proposal a person's T1/T0 tier answer appended. */
      readonly proposal?: ReviewOf<"proposal">
      /** The proposal already open for that node and tier, which the answer reuses. */
      readonly pending?: ReviewOf<"proposal">
    }
  | ReviewRefusal

/** Answer the open question `input.questionId`. `questions` defaults to the store's open questions, and exists so a
 *  caller's own tests can supply them. */
export function answerQuestion(
  repoPath: string,
  input: AnswerInput,
  questions: (answered: ReadonlySet<string>) => readonly RankedQuestion[] = (answered) => openQuestionsOf(repoPath, answered),
): AnswerResult {
  const answer = input.answer.trim()
  if (answer.length === 0) return invalid("answer requires the answer text after the question id")
  const drafted = input.drafted
  if (drafted !== undefined && (drafted.model.trim() === "" || drafted.why.trim() === "")) {
    return invalid("answer: a drafted answer names its model and why")
  }
  const read = foldReviewLog(repoPath)
  if ("refusal" in read) return read
  const open = questions(answeredIds(read.fold))
  const id = resolveReviewId(
    open.map((q) => q.id),
    input.questionId,
  )
  const question = open.find((q) => q.id === id)
  if (question === undefined) {
    return invalid(
      `answer: no open question matches '${input.questionId}' — \`atlas interview\` lists the open batch (an answered question drops out)`,
    )
  }
  // A draft never proposes: only a person's answer starts a ratification (D29).
  const toTier = drafted === undefined && question.kind === "tier" && (answer === "T1" || answer === "T0") ? answer : undefined
  const nodeKey = question.nodeKey
  const pending =
    toTier === undefined || nodeKey === undefined
      ? undefined
      : read.fold.openProposals.find((p) => p.nodeKey === nodeKey && p.toTier === toTier)
  const proposal =
    toTier === undefined || nodeKey === undefined || pending !== undefined
      ? undefined
      : (appendReview(repoPath, {
          kind: "proposal",
          nodeKey,
          toTier,
          reason: `ratification interview answer to question ${question.id}`,
          at: input.at,
          by: input.by,
        }) as ReviewOf<"proposal">)
  const record = appendReview(repoPath, {
    kind: "answer",
    questionId: question.id,
    answer,
    ...(drafted !== undefined ? { drafted: { model: drafted.model, why: drafted.why } } : {}),
    at: input.at,
    by: input.by,
  }) as ReviewOf<"answer">
  return {
    ok: true,
    question,
    answer: record,
    ...(proposal !== undefined ? { proposal } : {}),
    ...(pending !== undefined ? { pending } : {}),
  }
}

function invalid(reason: string): ReviewRefusal {
  return { ok: false, refusal: "invalid", reason }
}
