// @atlas/adapter-io — src/review-decide.ts  (R3 / D29: decide one open ratification proposal)
//
// The decision half of `atlas decide`, moved out of the CLI (lead decision D29) so the CLI runner and the Atlas
// screen's surface decide through ONE function and cannot diverge. `rejected` only appends the decision, so the
// rejection stays in the history. `ratified` re-emits the CURRENT fact at the proposed tier through the emit door
// the CALLER supplies — the composed `atlas-emit` leg, so the truth, authz and KNOW-8 ratify gates every emit faces
// still apply and the ratify token stays with the composition root — and appends the decision only when the door
// admitted the re-emit: a refused ratification writes nothing and the proposal stays open.

import { isRetired } from "@atlas/knowledge"
import type { GroundedFact } from "@atlas/knowledge"
import type { Verdict } from "@atlas/tools"
import { appendReview, foldReviewLog, resolveReviewId } from "./review-log.js"
import type { ReviewOf, ReviewRefusal } from "./review-log.js"
import { currentFactOf } from "./review-store.js"
import type { CurrentFact } from "./review-store.js"

/** What the emit door answered, reduced to what a decision needs. */
export interface EmitOutcome {
  readonly emitted: boolean
  readonly id?: string
  readonly rejected?: string
}

/** One decision. `proposalId` is an exact id or a unique prefix of at least 8 characters. */
export interface DecideInput {
  readonly proposalId: string
  readonly verdict: "ratified" | "rejected"
  readonly reason: string
  readonly by: string
  readonly at: string
}

export type DecideResult =
  | {
      readonly ok: true
      readonly proposal: ReviewOf<"proposal">
      readonly decision: ReviewOf<"decision">
      /** The re-emitted fact's id, when the door returned one (ratified only). */
      readonly emittedId?: string
    }
  | ReviewRefusal

/**
 * Decide the open proposal `input.proposalId`. `emit` is the composed `atlas-emit` door, already bound to its ratify
 * token and anchor rev. `factOf` reads the current fact; it defaults to the store at `repoPath`, and exists so a
 * caller's own tests can supply one.
 */
export function decideProposal(
  repoPath: string,
  input: DecideInput,
  emit: (fact: GroundedFact) => EmitOutcome,
  factOf: (nodeKey: string) => CurrentFact | undefined = (nodeKey) => currentFactOf(repoPath, nodeKey),
): DecideResult {
  const reason = input.reason.trim()
  if (reason.length === 0) return { ok: false, refusal: "invalid", reason: "decide requires a reason after the verdict" }
  const read = foldReviewLog(repoPath)
  if ("refusal" in read) return read
  const open = read.fold.openProposals
  const id = resolveReviewId(
    open.map((p) => p.id),
    input.proposalId,
  )
  const proposal = open.find((p) => p.id === id)
  if (proposal === undefined) {
    return {
      ok: false,
      refusal: "invalid",
      reason: `decide: no open proposal matches '${input.proposalId}' — \`atlas proposals\` lists the open ones (a decided proposal is closed)`,
    }
  }
  const decided = (verdict: "ratified" | "rejected") =>
    appendReview(repoPath, {
      kind: "decision",
      proposalId: proposal.id,
      verdict,
      reason,
      at: input.at,
      by: input.by,
    }) as ReviewOf<"decision">
  if (input.verdict === "rejected") return { ok: true, proposal, decision: decided("rejected") }
  const current = factOf(proposal.nodeKey)
  if (current === undefined || isRetired(current.fact)) {
    return {
      ok: false,
      refusal: "governed",
      reason: `ratify: '${proposal.nodeKey}' is no longer a current, live fact, so there is nothing to re-emit; no decision was written — reject the proposal instead`,
    }
  }
  const out = emit({ ...current.fact, tier: proposal.toTier } as GroundedFact)
  if (!out.emitted) {
    return {
      ok: false,
      refusal: "governed",
      reason: `ratify: the emit door refused the ${proposal.toTier} re-emit of '${proposal.nodeKey}' (${out.rejected ?? "no reason given"}); no decision was written and the proposal stays open. A T1 needs ATLAS_RATIFY_TOKEN to name a ratifier; a T0 needs ATLAS_RATIFY_TOKEN=billy`,
    }
  }
  const decision = decided("ratified")
  return out.id === undefined ? { ok: true, proposal, decision } : { ok: true, proposal, decision, emittedId: out.id }
}

/** Reduce the composed handler's `atlas-emit` verdict: `data` is the door's `EmitOut` on both the admitted and the
 *  refused path. */
export function emitOutcomeOf(v: Verdict): EmitOutcome {
  const data = v.data as { readonly emitted?: unknown; readonly id?: unknown; readonly rejected?: unknown } | undefined
  if (data?.emitted === true) return typeof data.id === "string" ? { emitted: true, id: data.id } : { emitted: true }
  const rejected = typeof data?.rejected === "string" ? data.rejected : (v.rejected ?? "the emit door refused without a reason")
  return { emitted: false, rejected }
}
