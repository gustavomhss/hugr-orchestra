// @atlas/knowledge — src/fastpath.ts  (WP-5.15.KNOW · EPIC-15)
//
// The confidence fast-path (KNOW-18). Human review is spent on RISK, not rubber-stamp: a candidate that
// is grounded ∧ low-risk ∧ `T2` ∧ advisory AUTO-ACCEPTS (no human); a `T0`, CONTESTED (reviewer veto /
// conflicting node), or ANY PREDICATE candidate routes to FULL human ratification. Over-admission is
// backstopped by the KNOW-17 hits-decay. Binds the FROZEN `FastpathApi` (co-located below):
// `route(candidate, ctx: RatifyContext): 'auto-accept' | 'full-ratify'`.
//
// FACET BOUNDARY (BIND — resolved vs the frozen FastpathApi, co-located below):
//  • [R3 reconciliation] `ctx` supplies the two verdicts the ratifier decides UPSTREAM: `contested`
//    (store-state — reviewer veto / conflicting node, KNOW-18b) and `lowRisk` (the KNOW-17 door-2
//    THRESHOLD verdict, KNOW-18a). The lowRisk THRESHOLD VALUE stays OPEN-DEFINE in hits.ts — this
//    facet consumes the BOOLEAN and does NOT pin the threshold.
//  • The candidate-intrinsic conjuncts are computed HERE: `grounded` (GROUND-2 real-grounding — ≥1 entry,
//    each a non-empty `subtreeHash`; no raw hashing, the branded value is read), `T2` (the proposed tier),
//    and `advisory` (a candidate carries a `check` iff predicate — so advisory ⟺ no `check`).

import type { Tier } from "@atlas/contracts"
import type { Candidate } from "../types.js"
import type { Grounding } from "@atlas/grounding"
import { strictestTier } from "./tier.js"

// ── frozen FastpathApi surface, co-located here (was ref/fastpath.ts) ─────────────────────────────────

/**
 * [R3 reconciliation — owner-authorized 2026-07-19] The two store/threshold-derived verdicts the ratifier
 * decides UPSTREAM (against store state + the KNOW-17 door-2 threshold) and hands to `route`. NEITHER is a
 * `Candidate` field — `contested` (KNOW-18b: reviewer veto / conflicting node) is store-decided at ratify
 * time; `lowRisk` (KNOW-18a/17b) is the door-2 threshold verdict whose THRESHOLD VALUE stays OPEN-DEFINE in
 * hits.ts (not invented here).
 */
export type WriteOrigin = "authored" | "promoted"

export interface RatifyContext {
  readonly contested: boolean // KNOW-18b — reviewer veto / conflicting node (store-state verdict)
  readonly lowRisk: boolean // KNOW-18a/17b — door-2 threshold verdict (threshold value = OPEN-DEFINE, hits.ts)

  /**
   * [KNOW-8 · the promotion door] WHERE this write came from, as the DOOR knows it — `authored` (a seat
   * presented this fact at a governed door) or `promoted` (the door lifted it out of the explorer's staging
   * sidecar). ABSENT ⇒ the door did not speak ⇒ `authored`, so every pre-existing caller is unchanged.
   *
   * WHY IT EXISTS, AND WHY IT IS NOT `contested`. The fast path's premise is stated at the top of this file:
   * human review is spent on RISK, not rubber-stamp. A grounded `T2` advisory that a seat authored IS the
   * rubber-stamp case. A staged candidate is the opposite case wearing the same shape — it is machine-
   * proposed, no human has read it, and the whole purpose of promoting it is that a ratifier now takes
   * responsibility for it. Every mined candidate is `T2`, advisory, and grounded (it cleared the truth door),
   * so on the intrinsic conjuncts alone a bulk promotion would AUTO-ACCEPT and the KNOW-8 token would never
   * be consulted: the ratifier would be bypassed on the one path built expressly to run through it.
   *
   * The two available shortcuts are both refused as FORGERIES, and the reason is the same one ARCH-9 gives.
   * `contested:true` means a reviewer vetoed this node or a conflicting node exists; `lowRisk:false` means
   * the KNOW-17 door-2 threshold judged it risky. Neither is true of an ordinary promotion, and writing
   * either would put a false value in a record the next reader believes — a store that lies about its own
   * history is the failure this codebase keeps refusing one direction over. What is TRUE is where the write
   * came from, so that is the field.
   *
   * THE JOIN IS ONE-WAY, exactly like `derivedTier`'s: this conjunct can only ever make the gate HARDER
   * (`promoted` removes the fast path; it can never grant one), so `FastpathApi`'s contract — auto-accept
   * ONLY for grounded ∧ lowRisk ∧ T2 ∧ advisory ∧ ¬contested — is narrowed, never widened.
   *
   * IT IS DOOR-DERIVED, NEVER REQUEST-CHOSEN (ARCH-9). The promotion door knows it read the row out of
   * staging; the payload has no way to say so and no way to say otherwise. A fact cannot declare itself
   * `authored` to buy a softer gate — the field is not on the fact.
   */
  readonly origin?: WriteOrigin

  /**
   * [ARCH-9 · ADR-0010] The governance class the DOOR DERIVED for this write's target — the class the author
   * could not choose. Supplying it is what makes the ratification route a decision about the RESOURCE rather
   * than a decision the payload announces about itself.
   *
   * WHY THIS FIELD EXISTS. `route` selected the ratification gate from `candidate.tier`, an author-supplied
   * payload field, and `nodeKey = hash(primaryAnchorId ‖ slot[‖ check])` contains no tier — so WHICH node a
   * write lands on and WHICH gate it must clear were decided by two different things, the second of them by
   * the author. Declaring `tier:'T2'` + advisory made this function answer `auto-accept`, the KNOW-8 token
   * was never consulted, and the write landed on whatever node that identity resolved to. That is the
   * confused deputy, and ARCH-9's remedy is stated as a single requirement, not a choice: a field that
   * selects a gate is DERIVED by the door, never chosen by the request.
   *
   * THE JOIN IS ONE-WAY, ON PURPOSE. The governing class is `strictestTier(derived, declared)`, so a payload
   * may only ever make its own gate HARDER (declaring `T0` still buys a full ratification) and never softer.
   * `strictestTier` is TOTAL over `unknown` and joins garbage to `T0`, so an off-lattice derived value fails
   * CLOSED — a door that computes nonsense pins the gate shut, not open.
   *
   * ABSENT MEANS THE DOOR DID NOT SPEAK, AND THAT IS STILL THE OPEN HOLE. With no derived class the declared
   * one stands, which is exactly the pre-ADR-0010 behaviour: this field is the SEAM ARCH-9 needs, and it is
   * only closed for a caller that actually fills it. `adapter-io/governed-emit.ts` does not yet — closing the
   * UPDATE leg there is one line (the incumbent's own class), while the CREATE leg has no incumbent to derive
   * from at all and is ARCH-D3b, an OPEN owner DEFINE. Optional rather than required for the same reason: a
   * required field would have forced every existing caller to invent a value, and an invented derivation
   * ("a constant that pins the gate open") is the one thing ARCH-9 names as NOT satisfying the clause.
   */
  readonly derivedTier?: Tier
}

export interface FastpathApi {
  /** Route a candidate (KNOW-18): auto-accept iff `grounded ∧ lowRisk ∧ T2 ∧ advisory`; predicate / `T0` /
   *  contested — and a write the door derived as `origin:'promoted'` — ALL route to `full-ratify`
   *  (method-tags-knw:142). `route` computes the candidate-intrinsic conjuncts (grounded/T2/advisory)
   *  itself; `ctx` supplies the store/threshold-derived `contested` + `lowRisk` verdicts and the two
   *  door-derived fields (`derivedTier`, `origin`). Pure + total over (candidate, ctx). */
  route(candidate: Candidate, ctx: RatifyContext): "auto-accept" | "full-ratify"
}

export type FastpathRoute = "auto-accept" | "full-ratify"

/**
 * GROUND-2 real grounding: ≥1 entry, each carrying a non-empty `subtreeHash`. Fail-closed.
 *
 * SECURITY: this predicate is the first conjunct of `route`'s auto-accept decision (`:126`/`:137`), so a
 * value that reads as "grounded" here reaches a write door with no human ratification. `subtreeHash`'s
 * brand (`@atlas/contracts` `SubtreeHash = string & {brand}`) evaporates at runtime — every value reaching
 * this function may have come through `JSON.parse`, an SDK-parsed MCP argument, or a CAS blob, none of
 * which enforce it. A prior `String(e.anchor.subtreeHash).length > 0` coerced-before-checking, which is
 * fail-OPEN: `String(undefined)`/`String(null)`/`String({})` are all non-empty strings, so `undefined`,
 * `null`, `0`, `false`, and `{}` all read as grounded. The `typeof` guard below is the fix: only an actual
 * non-empty string passes, matching the sealed `GroundApi['isGrounded']` (`@atlas/grounding` `drift.ts:73`,
 * type-imported only — see `test/fastpath-isgrounded-parity.test.ts` for the fitness function that keeps
 * the two predicates from diverging again).
 */
export function isGrounded(grounding: Grounding): boolean {
  return (
    grounding.entries.length > 0 &&
    grounding.entries.every((e) => typeof e.anchor.subtreeHash === "string" && e.anchor.subtreeHash.length > 0)
  )
}

/** A candidate is advisory iff it carries NO `check` — the predicate family is the checkable one. */
export function isAdvisory(candidate: Candidate): boolean {
  // An explicitly untrusted claim cannot retain predicate authority. Missing provenance stays legacy-compatible.
  return candidate.check === undefined || (candidate.provenance !== undefined && candidate.provenance.trusted !== true)
}

/**
 * Route a candidate (KNOW-18): auto-accept iff `grounded ∧ lowRisk ∧ T2 ∧ advisory`; predicate / `T0` /
 * contested / door-derived `promoted` ALL route to `full-ratify`. Pure + total over (candidate, ctx).
 */
export function route(candidate: Candidate, ctx: RatifyContext): FastpathRoute {
  const grounded = isGrounded(candidate.grounding)
  // ARCH-9 — the gate-selecting class. A door-DERIVED class overrides the payload's self-declaration; the
  // lattice JOIN makes that override one-way (harder only) and fail-closed on anything off-lattice. Absent
  // ⇒ the declared class stands, the ARCH-D3b hole, documented on `RatifyContext.derivedTier`.
  const governingTier = ctx.derivedTier === undefined ? candidate.tier : strictestTier(ctx.derivedTier, candidate.tier)
  const t2 = governingTier === "T2"
  const advisory = isAdvisory(candidate)
  // Explicitly present malformed/untrusted receipts fail closed; absent receipt is legacy data.
  const trusted = candidate.provenance === undefined || candidate.provenance.trusted === true
  // KNOW-8 — the PROMOTION conjunct. A write the door lifted out of staging is machine-proposed and unread
  // by any human, so the rubber-stamp premise the fast path rests on does not hold for it, whatever its
  // intrinsic conjuncts say. ONE-WAY: this can only remove a fast path, never grant one. Absent ⇒ authored.
  const promoted = ctx.origin === "promoted"
  const fastPath = grounded && ctx.lowRisk && t2 && advisory && trusted && !ctx.contested && !promoted
  return fastPath ? "auto-accept" : "full-ratify"
}

/** The frozen-`FastpathApi` binding (conformance handle). */
export const fastpath: FastpathApi = { route }
