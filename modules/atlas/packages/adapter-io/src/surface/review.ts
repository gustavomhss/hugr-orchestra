// @atlas/adapter-io — src/surface/review.ts  (the Atlas UI surface: the review queue and its writes — D31)
//
// `review()` reads the shared review log (`../review-log.ts`, D14) and the interview (`interviewOf`, D29): what is
// held (R2), the open ratification proposals (R3) and memory proposals (R1), and the interview batch with a model's
// draft riding along (R11). The writes act through the same adapter-io helpers the CLI's review commands call
// (`decideProposal`, `answerQuestion`, `decideProjectRule`, `declareTerritory`) or repeat the CLI runner's checks in
// its order, so the screen and the CLI cannot diverge, and they refuse with the CLI's own words.
//
// WHO AND WHEN: every review record is written `by` the composed actor (`ATLAS_ACTOR ?? git user.email`, as `emit`
// writes) at the wall clock; a missing actor is a refusal. A territory records no actor (`atlas territory` takes no
// `--by`): its authority is the ratify token. A memory decision writes the rule as the PROPOSAL's member, never as
// this actor (`decideProjectRule`), so the binding built here carries only the storage root.
//
// COST, STATED: `review()` and `answer` build the code index once (`openQuestionsOf`), like `atlas interview`;
// `decide` composes the runtime only for a ratification.

import { basename, resolve } from "node:path"
import { BILLY, isRetired, isWeakerTier } from "@atlas/knowledge"
import { gitUserEmail } from "../compose.js"
import { decideProjectRule } from "../native-memory.js"
import type { AtlasBinding } from "../native-memory.js"
import { interviewOf } from "../open-questions-source.js"
import type { InterviewQuestion } from "../open-questions-source.js"
import { answerQuestion } from "../review-answer.js"
import { decideProposal, emitOutcomeOf } from "../review-decide.js"
import { appendReview, foldReview, foldReviewLog, readReview, REVIEW_INVARIANT } from "../review-log.js"
import { currentFactOf, stagedNodeKeys } from "../review-store.js"
import { headSha } from "../run-git.js"
import { declareTerritory, TERRITORY_CATALOG_FILE } from "../territory-write.js"
import { composeWith } from "./compose-with.js"
import type { AtlasVerdict } from "./types.js"
import type {
  AtlasAnswerInput,
  AtlasDecideInput,
  AtlasHoldInput,
  AtlasInterviewQuestion,
  AtlasMemoryDecideInput,
  AtlasProposeInput,
  AtlasReleaseInput,
  AtlasReview,
  AtlasReviewWriteOut,
  AtlasTerritoryInput,
} from "./types-review.js"

type ReviewWrite = AtlasVerdict<AtlasReviewWriteOut>

const NO_ACTOR = "no write actor: set ATLAS_ACTOR (or git user.email) to who acts; nothing was written"
const TERRITORY_INVARIANT =
  "TERRITORY (D22): a territory's tier is human-ratified — the catalog is written only through publishTerritoryCatalog with ATLAS_RATIFY_TOKEN naming a ratifier (billy for T0), and its version is the hash of its content"

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

/** `atlas hold`: keep a staged candidate out of every promote. */
export function hold(repoPath: string, input: AtlasHoldInput): ReviewWrite {
  const by = actorOf(repoPath)
  if (by === "") return refused(NO_ACTOR)
  const read = foldReviewLog(repoPath)
  if ("refusal" in read) return refused(read.reason)
  if (read.fold.held.has(input.nodeKey)) return refused(`'${input.nodeKey}' is already held — nothing was written`)
  const staged = stagedNodeKeys(repoPath)
  if (staged === undefined) {
    return refused("hold: the staging sidecar could not be read, so the nodeKey cannot be checked against it; nothing was written")
  }
  if (!staged.has(input.nodeKey)) {
    return refused(`hold: no staged candidate has nodeKey '${input.nodeKey}' — \`atlas promote\` prints each staged row's nodeKey`)
  }
  const record = appendReview(repoPath, { kind: "hold", nodeKey: input.nodeKey, at: now(), by })
  return accepted(record.id, `'${input.nodeKey}' is held: every \`atlas promote\` skips it until \`atlas release ${input.nodeKey} --by <you>\``)
}

/** `atlas release`: let a held candidate back into the next promote. */
export function release(repoPath: string, input: AtlasReleaseInput): ReviewWrite {
  const by = actorOf(repoPath)
  if (by === "") return refused(NO_ACTOR)
  const read = foldReviewLog(repoPath)
  if ("refusal" in read) return refused(read.reason)
  if (!read.fold.held.has(input.nodeKey)) {
    return refused(`release: '${input.nodeKey}' is not held — \`atlas hold\` holds a staged candidate`)
  }
  const record = appendReview(repoPath, { kind: "release", nodeKey: input.nodeKey, at: now(), by })
  return accepted(record.id, `'${input.nodeKey}' is released: the next \`atlas promote\` presents it again`)
}

/** `atlas propose`: the same checks, in the same order, as `runPropose`. */
export function propose(repoPath: string, input: AtlasProposeInput): ReviewWrite {
  const by = actorOf(repoPath)
  if (by === "") return refused(NO_ACTOR)
  const toTier = input.toTier
  if (toTier !== "T1" && toTier !== "T0") return refused(`propose: the target tier must be T1 or T0, got '${String(toTier)}'`)
  const reason = input.reason.trim()
  if (reason.length === 0) return refused("propose requires a reason after the tier")
  const nodeKey = input.nodeKey
  const current = currentFactOf(repoPath, nodeKey)
  if (current === undefined) return refused(`propose: no current fact has nodeKey '${nodeKey}'`)
  if (isRetired(current.fact)) return refused(`propose: '${nodeKey}' is retired (authoring SUPERSEDED); a retired fact is not proposed`)
  if (!isWeakerTier(current.fact.tier, toTier)) {
    return refused(`propose: '${nodeKey}' is already ${current.fact.tier}; a proposal must raise the tier`)
  }
  const read = foldReviewLog(repoPath)
  if ("refusal" in read) return refused(read.reason)
  const open = read.fold.openProposals.find((p) => p.nodeKey === nodeKey && p.toTier === toTier)
  if (open !== undefined) return refused(`propose: '${nodeKey}' already has an open ${toTier} proposal ${open.id}`)
  const record = appendReview(repoPath, { kind: "proposal", nodeKey, toTier, reason, at: now(), by })
  return accepted(record.id, `proposal ${record.id} waits for a person: \`atlas decide ${record.id} ratify|reject <reason...> --by <you>\``)
}

/** `atlas decide`: a ratification re-emits through the composed door with this write's token, at live HEAD. */
export function decide(repoPath: string, input: AtlasDecideInput): ReviewWrite {
  const by = actorOf(repoPath)
  if (by === "") return refused(NO_ACTOR)
  const out = decideProposal(
    repoPath,
    { proposalId: input.proposalId, verdict: input.verdict, reason: input.reason, by, at: now() },
    (fact) =>
      emitOutcomeOf(composeWith(repoPath, input.token).handler.handle("atlas-emit", { node: fact, at: headSha(repoPath) ?? "" })),
  )
  if (!out.ok) return refused(out.reason)
  const p = out.proposal
  return accepted(
    out.decision.id,
    out.decision.verdict === "ratified"
      ? `proposal ${p.id} ratified: '${p.nodeKey}' is now ${p.toTier}`
      : `proposal ${p.id} rejected; the fact keeps its tier and the rejection stays in the log`,
  )
}

/** `atlas answer`, or a model's draft (`drafted`), which never proposes and keeps the question open. */
export function answer(repoPath: string, input: AtlasAnswerInput): ReviewWrite {
  const by = actorOf(repoPath)
  if (by === "") return refused(NO_ACTOR)
  const drafted = input.drafted
  const out = answerQuestion(repoPath, {
    questionId: input.questionId,
    answer: input.answer,
    by,
    at: now(),
    ...(drafted !== undefined ? { drafted: { model: drafted.model, why: drafted.why } } : {}),
  })
  if (!out.ok) return refused(out.reason)
  if (out.proposal !== undefined) {
    return accepted(out.answer.id, `answered; proposal ${out.proposal.id} now waits for \`atlas decide\` by a person`)
  }
  return accepted(
    out.answer.id,
    drafted !== undefined ? "drafted; the question stays open until a person answers it" : "answered; the question drops out of the next batch",
  )
}

/** A person indexes or discards a seat's memory proposal (R1, D30). */
export function memoryDecide(repoPath: string, input: AtlasMemoryDecideInput): ReviewWrite {
  const by = actorOf(repoPath)
  if (by === "") return refused(NO_ACTOR)
  const out = decideProjectRule(
    bindingOf(repoPath, by),
    {
      proposalId: input.proposalId,
      verdict: input.verdict,
      ...(input.rule !== undefined ? { rule: input.rule } : {}),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      by,
    },
    now(),
  )
  if (!out.ok) return refused(out.reason)
  return accepted(
    out.decisionId,
    input.verdict === "indexed"
      ? "indexed: the rule is written as the proposing member's and reaches its header"
      : "discarded: the proposal is closed and stays in the log",
  )
}

/** `atlas territory`: the same checks, in the same order, as `runTerritory`; the token is this write's or the process's. */
export function territory(repoPath: string, input: AtlasTerritoryInput): ReviewWrite {
  if (input.globs.length === 0) return refused("territory requires <name> and at least one <glob>", TERRITORY_INVARIANT)
  if (input.owner.trim() === "") {
    return refused("territory requires --owner <seat>: the seat that owns the territory", TERRITORY_INVARIANT)
  }
  const tier = input.tier
  if (tier !== "T0" && tier !== "T1" && tier !== "T2") {
    return refused("territory requires --tier <T0|T1|T2>: the territory's human-ratified criticality", TERRITORY_INVARIANT)
  }
  const token = (input.token ?? process.env.ATLAS_RATIFY_TOKEN ?? "").trim()
  if (token === "") {
    return refused(
      "territory: a territory's tier is human-ratified — set ATLAS_RATIFY_TOKEN to the ratifier's name; nothing was written",
      TERRITORY_INVARIANT,
    )
  }
  if (tier === "T0" && token !== BILLY) {
    return refused(`territory: a T0 territory needs ATLAS_RATIFY_TOKEN=${BILLY}; nothing was written`, TERRITORY_INVARIANT)
  }
  const out = declareTerritory(repoPath, {
    name: input.name,
    owner: input.owner,
    tier,
    globs: input.globs,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
  })
  if (!out.ok) return refused(`territory: ${out.reason}`, TERRITORY_INVARIANT)
  return accepted(
    out.path,
    `'${input.name}' is ${out.replaced ? "replaced" : "declared"} in ${TERRITORY_CATALOG_FILE}; commit the file — Orchestra reads the committed catalog`,
    TERRITORY_INVARIANT,
  )
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

/** The composed write actor, resolved as compose.ts:170 resolves it. A claim, not an authentication. */
function actorOf(repoPath: string): string {
  return (process.env.ATLAS_ACTOR ?? gitUserEmail(repoPath) ?? "").trim()
}

function now(): string {
  return new Date().toISOString()
}

/** The binding a memory decision runs under: the storage root, and PATH's named scanner. `memoryOwner` never
 *  writes — `decideProjectRule` writes as the proposal's member. */
function bindingOf(repoPath: string, by: string): AtlasBinding {
  const root = resolve(repoPath)
  const projectId = basename(root)
  return {
    storage: { projectID: projectId, root },
    source: { worktree: root, revision: headSha(root) ?? "" },
    memoryOwner: by,
    execution: { actor: { memberId: by, projectId, sessionId: "atlas-surface" }, executionSessionID: "atlas-surface" },
  }
}

function accepted(id: string, next: string, invariant = REVIEW_INVARIANT): ReviewWrite {
  return { state: "ok", ok: true, data: { id }, guidance: { next, invariant } }
}

function refused(reason: string, invariant = REVIEW_INVARIANT): ReviewWrite {
  return { state: "ok", ok: false, rejected: reason, guidance: { next: "nothing was written — act on the refusal, then retry", invariant } }
}
