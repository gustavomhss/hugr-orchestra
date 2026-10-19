// @atlas/cli — src/interview-cli.ts  (R11: `atlas interview [--json]` / `atlas answer <questionId> <answer...> --by <actor>`)
//
// The ratification interview (D17): the open questions derived from the store (`openQuestionsOf`), served as ONE batch
// of at most `INTERVIEW_CAP` by `assembleInterview` (genesis align.ts), ranked by blast × tier; the rest waits for the
// next session. An answer is one `answer` record in the review log, and an answered question drops out of the next
// batch. A `tier` question answered `T1` or `T0` ALSO appends a `proposal`, so a rule still needs `atlas decide` by a
// person — the interview itself never ratifies anything.

import { appendReview, openQuestionsOf } from "@atlas/adapter-io"
import { assembleInterview } from "@atlas/genesis"
import type { RankedQuestion } from "@atlas/genesis"
import type { CliVerdict } from "./render.js"
import { foldOrRefuse, requireBy, resolveId, reviewOutcome, usageError } from "./review-common.js"

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
  const assembled = assembleInterview(ports.questions(new Set(read.fold.answers.keys())))
  // `assembleInterview` slices the ranked list it is given, so the batch holds the same RankedQuestion objects.
  const batch = assembled.batch.questions as readonly RankedQuestion[]
  if (flags["json"] === "true") {
    return { exitCode: 0, stdout: `${JSON.stringify({ batch, deferred: assembled.deferred.length })}\n` }
  }
  return reviewOutcome(
    batch.length === 0
      ? "no open questions — every unit has an owner and a rationale, and no rule candidate or contested slot is waiting"
      : `${batch.length} question(s) in this session's batch (at most ${assembled.batch.cap}); ${assembled.deferred.length} deferred to the next session — answer with \`atlas answer <questionId> <answer...> --by <you>\``,
    batch.flatMap((q) => [
      `  ${q.id} ${q.kind} rank ${q.rank}: ${q.ask}`,
      ...(q.options !== undefined ? [`      options: ${q.options.join(" | ")}`] : []),
      `      why: ${q.rankReason}`,
    ]),
  )
}

export function runAnswer(ports: InterviewPorts, positionals: readonly string[], flags: Readonly<Record<string, string>>): CliVerdict {
  const by = requireBy(flags)
  if (by === undefined) return usageError("answer requires --by <actor>: the person who answers")
  const wanted = positionals[0] ?? ""
  const answer = positionals.slice(1).join(" ").trim()
  if (answer.length === 0) return usageError("answer requires the answer text after the question id")
  const read = foldOrRefuse(ports.repoPath)
  if ("refusal" in read) return read.refusal
  const open = ports.questions(new Set(read.fold.answers.keys()))
  const qid = resolveId(open.map((q) => q.id), wanted)
  const question = open.find((q) => q.id === qid)
  if (question === undefined) {
    return usageError(`answer: no open question matches '${wanted}' — \`atlas interview\` lists the open batch (an answered question drops out)`)
  }
  const toTier = question.kind === "tier" && (answer === "T1" || answer === "T0") ? answer : undefined
  const nodeKey = question.nodeKey
  const pending =
    toTier === undefined || nodeKey === undefined
      ? undefined
      : read.fold.openProposals.find((p) => p.nodeKey === nodeKey && p.toTier === toTier)
  const proposal =
    toTier === undefined || nodeKey === undefined || pending !== undefined
      ? undefined
      : appendReview(ports.repoPath, {
          kind: "proposal",
          nodeKey,
          toTier,
          reason: `ratification interview answer to question ${question.id}`,
          at: ports.now(),
          by,
        })
  const record = appendReview(ports.repoPath, { kind: "answer", questionId: question.id, answer, at: ports.now(), by })
  return reviewOutcome(
    proposal !== undefined
      ? `answered; proposal ${proposal.id} now waits for \`atlas decide\` by a person`
      : "answered; the question drops out of the next batch",
    [
      `answer: ${record.id} ${question.kind} ${question.subject} by ${by}: ${answer}`,
      ...(proposal !== undefined ? [`proposal: ${proposal.id} ${nodeKey ?? ""} -> ${toTier ?? ""}`] : []),
      ...(pending !== undefined ? [`proposal: ${pending.id} already open for ${pending.nodeKey} -> ${pending.toTier}`] : []),
    ],
  )
}
