// @atlas/adapter-io — src/open-questions-source.ts  (R11: the store feed for `deriveOpenQuestions`, and the interview)
//
// Reads what the pure question rules (`@atlas/genesis` open-questions.ts) need from one repository: the live current
// facts (retired ones excluded, R6), each unit's policy owner (`terrainOwner`, the owner `atlas own` prints), and each
// file's blast — how many files depend on it in the code index's reverse closure. An unowned unit's question also
// offers the mined authors of the fact files already in that unit (`HistorySource.signals().owners` at HEAD). Those
// names are not persisted. A history throw, or a file git cannot see, contributes no names for that file — the
// interview never throws because history could not be read. It builds its own index from the working tree and
// `.atlas/index.scip` (no dump ⇒ no edges ⇒ every blast is 0), so one call costs one index build; it is not a leg
// of the composed runtime because `compose.ts` has no room under the godfile ceiling.
//
// `interviewOf` (D29) serves one batch over those questions for the CLI and the Atlas screen alike. A question is
// answered only when its LATEST `answer` record has no `drafted`: a model's draft keeps it open and rides along as
// `draft`, so a person still answers it (an accepted draft is a plain answer of the same text).

import { join } from "node:path"
import type { Hash, StructRef } from "@atlas/contracts"
import { assembleInterview, deriveOpenQuestions, unitOfFile } from "@atlas/genesis"
import type { HistorySource, QuestionFact, RankedQuestion } from "@atlas/genesis"
import { build, createDepgraph, nodeHashOfPath } from "@atlas/index"
import { asSubtreeHash } from "@atlas/kernel"
import { currentNodes, isRetired } from "@atlas/knowledge"
import type { GroundedFact } from "@atlas/knowledge"
import { walkFileTree } from "./fs.js"
import { createHistorySource } from "./git-history.js"
import { CAS_REL } from "./okf-store.js"
import { terrainOwner } from "./own-source.js"
import { loadPolicy } from "./policy.js"
import { foldReview, readReview } from "./review-log.js"
import type { ReviewFold } from "./review-log.js"
import { headSha } from "./run-git.js"
import { readScipOrEmpty, SCIP_INDEX_REL } from "./scip.js"
import { createDiskStore, rehydrateProjection } from "./store.js"
import { gitSidecarTrust } from "./store-provenance.js"

/** One interview question as the CLI and the Atlas screen serve it: a model's latest draft rides along. */
export type InterviewQuestion = RankedQuestion & {
  readonly draft?: {
    readonly answer: string
    readonly model: string
    readonly why: string
    readonly by: string
    readonly at: string
  }
}

/** The open questions for the repository at `repoPath`, unanswered ones only, highest rank first. */
export function openQuestionsOf(repoPath: string, answered: ReadonlySet<string>): readonly RankedQuestion[] {
  const store = createDiskStore(join(repoPath, CAS_REL), () => headSha(repoPath), gitSidecarTrust(repoPath))
  const facts = currentNodes(rehydrateProjection(store)).flatMap((node): QuestionFact[] => {
    const fact = store.get(node.contentHash as Hash) as GroundedFact | undefined
    if (node.primaryAnchor === undefined || fact === undefined || isRetired(fact)) return []
    return [
      {
        nodeKey: node.nodeKey,
        file: node.primaryAnchor.split("::")[0] ?? node.primaryAnchor,
        ...(node.slot !== undefined ? { slot: node.slot } : {}),
        tier: node.tier ?? fact.tier,
        claim: node.claims[0] ?? "",
      },
    ]
  })
  const policy = loadPolicy(repoPath)
  const depgraph = createDepgraph(build(walkFileTree(repoPath), readScipOrEmpty(join(repoPath, SCIP_INDEX_REL))).edges)
  const history = historySource(repoPath)
  return deriveOpenQuestions({
    facts,
    ownerOf: (unit) => terrainOwner(policy, unit),
    authorsOf: (unit) => (history === undefined ? [] : minedAuthors(history, facts, unit)),
    blast: (file) => {
      const self = nodeHashOfPath(file)
      return depgraph.reverseClosure(self).closure.filter((h) => h !== self).length
    },
    answered,
  })
}

/**
 * One interview batch (`assembleInterview`, at most `INTERVIEW_CAP`) over the open questions, plus how many wait for
 * the next session. A log with lines that do not verify folds what did verify; the writes over it refuse instead.
 * `questions` defaults to the store read above, and exists so a caller's own tests can supply the questions.
 */
export function interviewOf(
  repoPath: string,
  questions: (answered: ReadonlySet<string>) => readonly RankedQuestion[] = (answered) => openQuestionsOf(repoPath, answered),
): { readonly batch: readonly InterviewQuestion[]; readonly deferred: number } {
  const fold = foldReview(readReview(repoPath).records)
  const assembled = assembleInterview(questions(answeredIds(fold)))
  // `assembleInterview` slices the ranked list it is given, so the batch holds the same RankedQuestion objects.
  const batch = (assembled.batch.questions as readonly RankedQuestion[]).map((q): InterviewQuestion => {
    const latest = fold.answers.get(q.id)
    const drafted = latest?.drafted
    if (latest === undefined || drafted === undefined) return q
    return { ...q, draft: { answer: latest.answer, model: drafted.model, why: drafted.why, by: latest.by, at: latest.at } }
  })
  return { batch, deferred: assembled.deferred.length }
}

/** The question ids a PERSON has answered: a question whose latest answer is a model's draft is still open (D29). */
export function answeredIds(fold: ReviewFold): ReadonlySet<string> {
  return new Set([...fold.answers.values()].filter((a) => a.drafted === undefined).map((a) => a.questionId))
}

/** One history source for the call. Construction does not shell git; a throw here (not the per-file read) still
 *  must not escape the interview, so a failed source is "no mined authors". */
function historySource(repoPath: string): HistorySource | undefined {
  try {
    return createHistorySource(repoPath, "HEAD")
  } catch {
    return undefined
  }
}

/** Distinct authors of the unit's fact files. Each file is its own read: a throw, or a path git cannot see
 *  (`owners` already empty), contributes nothing and does not fail the rest. */
function minedAuthors(history: HistorySource, facts: readonly QuestionFact[], unit: string): readonly string[] {
  const files = [...new Set(facts.filter((fact) => unitOfFile(fact.file) === unit).map((fact) => fact.file))]
  return [...new Set(files.flatMap((file) => ownersOf(history, file)))]
}

function ownersOf(history: HistorySource, file: string): readonly string[] {
  try {
    return history.signals(fileSite(file)).owners
  } catch {
    return []
  }
}

function fileSite(path: string): StructRef {
  return { kind: "file", qualifiedPath: path, subtreeHash: asSubtreeHash(nodeHashOfPath(path)) }
}
