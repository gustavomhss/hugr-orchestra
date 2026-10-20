// @atlas/cli — src/interview-cli.ts  (R11: `atlas interview [--json]` / `atlas answer <questionId> <answer...> --by <actor>`)
//
// The ratification interview (D17): the open questions derived from the store (`openQuestionsOf`), served as ONE batch
// of at most `INTERVIEW_CAP` by `interviewOf` (adapter-io, D29), ranked by blast × tier; the rest waits for the next
// session. An answer goes through `answerQuestion` (adapter-io, D29), the one function the Atlas screen answers
// through too: one `answer` record in the review log, and an answered question drops out of the next batch. A `tier`
// question answered `T1` or `T0` ALSO appends a `proposal`, so a rule still needs `atlas decide` by a person — the
// interview itself never ratifies anything. A model's draft (written by the Atlas screen's delegation) is printed
// under its question, which stays open until a person answers it.

import { answerQuestion, interviewOf, openQuestionsOf } from "@atlas/adapter-io"
import { INTERVIEW_CAP } from "@atlas/genesis"
import type { RankedQuestion } from "@atlas/genesis"
import type { CliVerdict } from "./render.js"
import { foldOrRefuse, governedRefusal, requireBy, reviewOutcome, usageError } from "./review-common.js"

/** What interview/answer read and write through — injected so a test needs no store or index. */
export interface InterviewPorts {
  readonly repoPath: string
  readonly now: () => string
  /** The open questions, minus the answered ids, highest rank first. */
  readonly questions: (answered: ReadonlySet<string>) => readonly RankedQuestion[]
}

/** The production ports: the repository at cwd, the wall clock, the real store/policy/index feed. */
export function interviewPorts(): InterviewPorts {
  const repoPath = process.cwd()
  return { repoPath, now: () => new Date().toISOString(), questions: (answered) => openQuestionsOf(repoPath, answered) }
}

export function runInterview(ports: InterviewPorts, flags: Readonly<Record<string, string>>): CliVerdict {
  const read = foldOrRefuse(ports.repoPath)
  if ("refusal" in read) return read.refusal
  const interview = interviewOf(ports.repoPath, ports.questions)
  const batch = interview.batch
  if (flags["json"] === "true") {
    return { exitCode: 0, stdout: `${JSON.stringify({ batch, deferred: interview.deferred })}\n` }
  }
  return reviewOutcome(
    batch.length === 0
      ? "no open questions — every unit has an owner and a rationale, and no rule candidate or contested slot is waiting"
      : `${batch.length} question(s) in this session's batch (at most ${INTERVIEW_CAP}); ${interview.deferred} deferred to the next session — answer with \`atlas answer <questionId> <answer...> --by <you>\``,
    batch.flatMap((q) => [
      `  ${q.id} ${q.kind} rank ${q.rank}: ${q.ask}`,
      ...(q.options !== undefined ? [`      options: ${q.options.join(" | ")}`] : []),
      `      why: ${q.rankReason}`,
      ...(q.draft !== undefined ? [`      draft by ${q.draft.model}: ${q.draft.answer} (${q.draft.why})`] : []),
    ]),
  )
}

export function runAnswer(ports: InterviewPorts, positionals: readonly string[], flags: Readonly<Record<string, string>>): CliVerdict {
  const by = requireBy(flags)
  if (by === undefined) return usageError("answer requires --by <actor>: the person who answers")
  const wanted = positionals[0] ?? ""
  const answer = positionals.slice(1).join(" ").trim()
  if (answer.length === 0) return usageError("answer requires the answer text after the question id")
  const out = answerQuestion(ports.repoPath, { questionId: wanted, answer, by, at: ports.now() }, ports.questions)
  if (!out.ok) return out.refusal === "invalid" ? usageError(out.reason) : governedRefusal(out.reason)
  return reviewOutcome(
    out.proposal !== undefined
      ? `answered; proposal ${out.proposal.id} now waits for \`atlas decide\` by a person`
      : "answered; the question drops out of the next batch",
    [
      `answer: ${out.answer.id} ${out.question.kind} ${out.question.subject} by ${by}: ${answer}`,
      ...(out.proposal !== undefined ? [`proposal: ${out.proposal.id} ${out.proposal.nodeKey} -> ${out.proposal.toTier}`] : []),
      ...(out.pending !== undefined ? [`proposal: ${out.pending.id} already open for ${out.pending.nodeKey} -> ${out.pending.toTier}`] : []),
    ],
  )
}
