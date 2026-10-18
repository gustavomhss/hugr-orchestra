// @atlas/genesis — src/admit-harness.ts   (WP-8.28-b.GEN — EPIC-28-b, GEN-12)
//
// The S2 MECHANICAL ADMISSION engine (mechanical admit + synthesized-check TEETH / mutant gate). In S2 the
// LLM ONLY proposes typed candidates; admission is mechanical. A predicate candidate becomes a PREDICATE
// NODE only if its synthesized `check` (a) compiles + returns `HOLDS` on current code AND (b) flips to
// `BROKEN` on ≥1 mechanically-mutated counterfactual (the TEETH / anti-vacuity — a check no mutant can break
// → DROP), and the two conjuncts are the only constructor of the `VerifiedCheck` the node's `check` field
// accepts. An ADVISORY candidate passes the TRUTH door (grounding) alone and is SCORED for obviousness —
// never rejected for it (ADR-0012, owner-ratified 2026-08-02); abstention is a valid grounded why-not.
// SOUND ORACLE FIRST for type-expressible slots — and that branch emits an ADVISORY, because the sound
// verdict comes from the type checker while a KNOW-16 `Check` can express nothing but index state, so there
// is no truthful check to carry (WP-FIX-6.KNOW / #200; see `buildSound` for the whole argument).
// Co-locates the frozen `PredicateApi` + `Check` re-export; the check-engine / admission semantics are
// consumed as injected ports, never defined here.

import type { Status, StructRef } from "@atlas/contracts"
import type {
  AdvisoryNode,
  Check,
  GroundedFact,
  ObviousnessScore,
  PredicateNode,
  PredicateSlot,
  PredicateWitness,
  RelationKind,
} from "@atlas/knowledge"
import type { IndexNode } from "@atlas/index"
// WP-96-R — the relation admission's PURE legs (identity mint, set-union text, gate-0 check, drop reasons),
// extracted to the sibling at the 400-LOC ceiling. The truth-door call + obviousness scoring stay HERE, in
// `admitRelation` (they need module-private `scoreObviousness`); this module only mints + shapes the node.
import {
  buildRelation,
  relationClaimNorm,
  relationEndpointsResolve,
  trySoundRelation,
  DROP_RELATION_MALFORMED,
  DROP_RELATION_UNGROUNDED,
} from "./admit-relation.js"
// WP-96-N — the negation admission's PURE legs (identity mint + gate-0 check + the one honest drop), extracted
// to the sibling at the 400-LOC ceiling exactly as the relation legs were. The candidate is built HERE; the
// scope-directory grounding + the abstention law stay the DOOR's (contract F4), so no truth-door call lives here.
import { buildNegation, negationTripleResolves, DROP_NEGATION_MALFORMED } from "./admit-negation.js"
import { buildTransition, transitionWellFormed, DROP_TRANSITION_MALFORMED } from "./admit-transition.js" // #234 D4 — justified, NO oracle
import { admitTestVacuity } from "./admit-test-vacuity.js" // #95 D5 — the PROVEN-only test-vacuity family's admission BODY (housed there; harness at the 600-LOC cap)
import type { Candidate, WhyNot } from "./types.js"

/**
 * A synthesized runnable check. [PINNED — oracle-pin-map §1, KNOW-16] the check carrier is the RATIFIED
 * @atlas/knowledge `Check` — the tagged union of KNOW-16's two named legs ("a deterministic index-query
 * OR a pinned declarative assertion"). IMPORTED, never redefined: genesis synthesizes exactly the check
 * kind the steady-state predicate evaluator consumes (mirrors @atlas/knowledge `PredicateNode.check` and
 * `EvaluatorApi.evaluate(check, indexState)`). Re-exported so the genesis dialect reads from one place.
 */
export type { Check }

export interface PredicateApi {
  /** GEN-12 PROPOSE. Synthesize a runnable check for a checkable candidate (CodeQL / Semgrep). `null` =
   *  no admissible check (the candidate stays advisory, or abstains). Prefers the SOUND type-checker / LSP
   *  verdict for a type-expressible slot (`contract` / `ownership` / visibility) over a synthesized query. */
  synthesize(cand: Candidate): Check | null

  /** GEN-12 VERIFY. Evaluate the check against index state → `HOLDS | BROKEN | NA` (KNOW-16, deterministic
   *  + pure — no code-exec, no clock, no IO; same index state ⇒ same verdict). Mirrors the @atlas/knowledge
   *  `EvaluatorApi.evaluate` verdict domain (a subset of `Status`; `'advisory'` is refused UPSTREAM, not a
   *  verdict here).
   *
   *  [FLAG — `indexState` carrier] typed as the @atlas/index `IndexNode` (mirrors KNOW-16
   *  `evaluate(check, indexState: IndexNode)`); the reference "over the structural/dependency axes" may be
   *  the multi-axis root (`Axes`) rather than a single node — flagged to reconcile at the WP. */
  verify(check: Check, indexState: IndexNode): Status

  /** GEN-12 TEETH (anti-vacuity). Evaluate the check on a mechanically-MUTATED counterfactual of the
   *  anchored subtree; admit ONLY if it flips to `BROKEN` on some mutant. A check that returns `HOLDS` but
   *  survives EVERY mutant is vacuous (a tautology / matches nothing) → `false` ⇒ DROP. */
  teeth(check: Check, anchor: StructRef): boolean
}

// The LLM proposal DATA MODEL (the typed candidate shapes + the `Proposal` union) was EXTRACTED to
// `admit-proposals.ts` at the 400-LOC godfile ceiling when WP-96 widened it with the relation/negation
// families (ADR-0015 D2/D3) — the harness keeps the ADMISSION ENGINE, that file keeps the shapes it admits.
// RE-EXPORTED here so `import { Proposal, RelationProposal, ... } from '@atlas/genesis'` is byte-identical.
export type {
  FactGrounding,
  PredicateProposal,
  AdvisoryProposal,
  RelationProposal,
  NegationProposal,
  TransitionProposal,
  TestVacuityProposal,
  Abstention,
  Proposal,
} from "./admit-proposals.js"
import type {
  FactGrounding,
  PredicateProposal,
  AdvisoryProposal,
  RelationProposal,
  NegationProposal,
  Proposal,
} from "./admit-proposals.js"

// ---- the injected mechanical seams (defined elsewhere; consumed here) ----------------------------------

/**
 * The admission bar (CAMPAIGN-4, amended by ADR-0012).
 *
 * `grounded` (truth — the citation re-derives) is the door: it still REJECTS.
 *
 * `nonObvious` (usefulness — non-obvious AND actionable, not a restated signature) KEEPS ITS PREDICATE and
 * LOSES ITS AUTHORITY TO REJECT. It is the part of this seam that knows how to judge obviousness, so it is
 * the part that computes the stored score; it is no longer consulted for the admit/reject decision. An
 * earlier lead note said `nonObvious` dies — that was wrong, and ADR-0012 corrects it.
 *
 * The name is kept deliberately. The predicate's polarity is `true ⇒ non-obvious`, and renaming it while
 * inverting nothing would silently re-point every existing implementation (`() => true`, `() => false`) in
 * the tests and the e2e fixtures.
 */
export interface TwoDoorBar {
  grounded(grounding: FactGrounding, indexState: IndexNode): boolean
  nonObvious(claimNorm: string): boolean
}

/**
 * Compute the STORED obviousness score from the HARNESS's predicate (ADR-0012, GEN-16).
 *
 * The input is `claimNorm` — the claim text derived from the source bytes — routed through the injected
 * harness predicate. It is NEVER read off a field the proposer wrote: `Proposal` carries no score field to
 * read, `ObviousnessScore.by` admits only `'harness-predicate'`, and ADR-0011 keeps `Candidate.signals` out
 * of the prompt so the model cannot self-score even if asked to. Module-private on purpose — every emitted
 * node gets its score through `buildAdvisory` / `buildPredicate`, so there is no second way to mint one.
 */
function scoreObviousness(doors: TwoDoorBar, claimNorm: string): ObviousnessScore {
  return { rank: doors.nonObvious(claimNorm) ? "non-obvious" : "obvious", by: "harness-predicate" }
}

/**
 * The sound `$0` type-checker / LSP oracle (GEN-12k). `expressible` reports whether the slot is expressible
 * in the language type system; `diagnose` returns the SOUND compiler/LSP verdict (the compiler already ran).
 */
export interface TypeOracle {
  expressible(slot: PredicateSlot): boolean
  diagnose(site: Candidate, slot: PredicateSlot): Status
}

/** The admission harness's injected dependencies — every mechanism is a seam, none is defined here. */
export interface AdmitDeps {
  readonly predicate: PredicateApi // synthesize/verify/teeth (CodeQL/Semgrep, KNOW-16)
  readonly doors: TwoDoorBar // the advisory 2-door bar (CAMPAIGN-4)
  readonly typeOracle: TypeOracle // sound-oracle-first (GEN-12k)
  readonly verifyDependency?: (target: string, scope: string) => "proven" | "abstain" // GEN-12-dep: sound symbol-reverse oracle (verify-fact positive dual)
  readonly verifyCount?: (target: string, scope: string, atLeast: number) => "proven" | "abstain" // GEN-12-count: sound cardinality oracle (#196c — verifyCount lower-bound)
  readonly verifyDefinition?: (target: string, scope: string) => "proven" | "abstain" // GEN-12-def: sound definition oracle (#196d — verifyDefinition def-occurrence-under-scope)
  readonly verifyRelation?: (
    relationKind: RelationKind,
    target: string,
    sourceScope: string,
    endpointA: string,
    endpointB: string,
  ) => "proven" | "abstain" // #99 sound relation (ADR-0018): the directed-edge oracle (verifyRelation — verify-fact.ts). Binds BOTH endpoint FILES to the witnessed edge (endpointA a real referrer, endpointB the definer). Only 'depends-on' can prove.
  readonly verifyTestVacuity?: (unitKey: string, testName: string, shape: string) => "proven" | "abstain" // #95 D5 sound test-vacuity oracle (scanTestVacuity-backed, injected in adapter-io — genesis has no tree-sitter)
  readonly refine: (check: Check, site: Candidate) => Check | null // CEGIS refine; `null` = no change
  readonly indexState: IndexNode // current code (KNOW-16 evaluate carrier)
  readonly K: number // refine budget (GEN-13 default K≤1)
}

// ---- the admission outcome -----------------------------------------------------------------------------

/** The label on an admitted predicate (GEN-12i) — a machine-checked LIKELY invariant, NEVER a proof. */
export const LIKELY_INVARIANT = "machine-checked likely invariant" as const
export type InvariantLabel = typeof LIKELY_INVARIANT

/** The mechanical admission verdict. `admitted` yields the fact to emit; `dropped`/`abstained` yield none. */
export type Admission =
  | { readonly outcome: "admitted"; readonly fact: GroundedFact; readonly label?: InvariantLabel }
  | { readonly outcome: "dropped"; readonly reason: string }
  | { readonly outcome: "abstained"; readonly whyNot: WhyNot }

// the structured drop reasons — honest, never a forced fact.
// NOTE: there is deliberately NO abstain drop reason. An oracle ABSTAINING (verifyDependency/verifyCount ≠ proven,
// or no synthesized check exists) does NOT drop a model-proposed fact — it admits as a JUSTIFIED advisory if
// grounded (see `admitAbstainedAsJustified`, genesis-epistemic-contract.md). The retired `DROP_DEP_ABSTAIN` /
// `DROP_COUNT_ABSTAIN` / `DROP_NO_CHECK` are GONE (deleted, not commented) so a resurrected gate cannot reach a
// ready-made abstain-drop string. Only REFUTE / vacuous / malformed / type-broken / ungrounded still drop.
const DROP_NOT_HOLDS = "synthesized check does not compile ∧ HOLDS on current code, after refine ≤K (GEN-12c/12d)"
const DROP_VACUOUS = "synthesized check survives every mutant — vacuous / toothless (GEN-12j)"
const DROP_TYPE_BROKEN = "sound type-checker / LSP verdict is not HOLDS on the type-expressible slot (GEN-12k)"
const DROP_DEP_UNWIRED = "dependency slot but no verifyDependency leg supplied (GEN-12-dep)"
const DROP_DEP_MALFORMED = "dependency proposal missing target/scope (GEN-12-dep)"
const DROP_COUNT_UNWIRED = "count slot but no verifyCount leg supplied (GEN-12-count)"
const DROP_COUNT_MALFORMED = "count proposal missing target/scope or atLeast not a positive integer (GEN-12-count)"
const DROP_DEF_UNWIRED = "definition slot but no verifyDefinition leg supplied (GEN-12-def)"
const DROP_DEF_MALFORMED = "definition proposal missing target/scope (GEN-12-def)"
const DROP_UNGROUNDED = "advisory fails the truth door — the citation does not ground (GEN-12e)"
// RELATION/NEGATION/TRANSITION drops. All three greenfield families are ADMITTED; their honest refusals live
// beside their builders (`DROP_RELATION_MALFORMED`/`DROP_RELATION_UNGROUNDED`, `DROP_NEGATION_MALFORMED`,
// `DROP_TRANSITION_MALFORMED`), imported above; the `shape-not-yet-emitted` stub reason is GONE for each. A
// negation's second failure mode (undecidable well-formed negative) is the DOOR's ABSTENTION (F4); a transition
// has NO second mode (no HEAD oracle to abstain, D-T1) — a malformed identity is its only drop.
// There is deliberately NO obviousness drop reason. ADR-0012: nothing is ever rejected for being obvious —
// an obvious claim is emitted carrying `obviousness.rank === 'obvious'` and loses at ranking, where the
// decision is recoverable. The retired `DROP_OBVIOUS` is not commented out anywhere; it is gone, so a
// resurrected gate cannot reach for a ready-made reason string.

// ---- the harness ---------------------------------------------------------------------------------------

/**
 * Run one site: invoke the proposer EXACTLY once, then admit its typed candidate mechanically. The proposer
 * is never re-prompted (GEN-12h) — a 0-candidate abstention is a valid outcome, not a failure (GEN-12g).
 */
export function runSite(propose: () => Proposal, deps: AdmitDeps): Admission {
  const proposal = propose() // GEN-12h: invoked ONCE — never pressured to emit
  return admit(proposal, deps) // GEN-12a: the harness casts the decision, not the model
}

/** Mechanically admit one typed candidate (GEN-12). Pure + total: no clock, no IO, no throw. */
export function admit(p: Proposal, deps: AdmitDeps): Admission {
  switch (p.kind) {
    case "abstain":
      return { outcome: "abstained", whyNot: p.whyNot } // GEN-12g — valid, unpressured
    case "advisory":
      return admitAdvisory(p, deps)
    case "predicate":
      return admitPredicate(p, deps)
    case "relation":
      return admitRelation(p, deps)
    case "negation":
      return admitNegation(p, deps)
    case "transition": // #234 (ADR-0015 D4) — JUSTIFIED, NO oracle (D-T1): gate-0 well-formed else DROP; mint+ground+seal in `buildTransition`
      return transitionWellFormed(p)
        ? { outcome: "admitted", fact: buildTransition(p) }
        : { outcome: "dropped", reason: DROP_TRANSITION_MALFORMED }
    case "test-vacuity": // #95 (ADR-0015 D5) — PROVEN-only sound family; the BODY (grounding+oracle+mint) lives in `admit-test-vacuity.ts` (harness at cap), bound to `deps.doors` here
      return admitTestVacuity(
        p,
        deps.verifyTestVacuity,
        (g) => deps.doors.grounded(g, deps.indexState),
        (cn) => scoreObviousness(deps.doors, cn),
      )
  }
}

/**
 * WP-96-R — the relation family's admission (ADR-0015 D2). The EXACT sibling of `admitAdvisory`: a relation
 * passes the SAME truth door the advisory path uses (`deps.doors.grounded` — NO new truth rule; the relation's
 * grounding carries the 2-entry AND-fold, so "both endpoints re-derive FRESH" is what that one door already
 * answers), and obviousness is SCORED, never gated (ADR-0012), off the canonical relation triple. It differs
 * from the advisory in exactly two ways, both forced by the shape: (1) a gate-0 well-formedness check FIRST,
 * because the endpoints ARE the identity (an intrinsic fact's degenerate grounding is caught downstream by
 * `primaryAnchorId`; a relation's is caught HERE, so `relationKey` in `buildRelation` never throws out of this
 * total function); (2) identity is minted by `relationKey`, never `nodeKey`. Pure + total: no throw, no IO.
 */
function admitRelation(p: RelationProposal, deps: AdmitDeps): Admission {
  if (!relationEndpointsResolve(p)) return { outcome: "dropped", reason: DROP_RELATION_MALFORMED }
  if (!deps.doors.grounded(p.grounding, deps.indexState))
    return { outcome: "dropped", reason: DROP_RELATION_UNGROUNDED }
  // SOUND-ORACLE-FIRST for a PROVABLE `depends-on` relation (#99, ADR-0018 — see `trySoundRelation`). A proven
  // directed edge mints a `proven`-sealed relation carrying its re-runnable witness (obviousness scored off the
  // WITNESS-derived text, AR-6); ABSTAIN ≠ REFUTE, so a non-proven verdict (a `calls` kind AR-5, a
  // local/unresolvable target AR-3/AR-17, no reference in scope, or no leg wired) falls through to the EXISTING
  // advisory build — abstain is NOT a drop, exactly as `admitAbstainedAsJustified` on the predicate arm.
  const proven = trySoundRelation(p, deps.verifyRelation, (claimNorm) => scoreObviousness(deps.doors, claimNorm))
  if (proven !== undefined) return { outcome: "admitted", fact: proven }
  return { outcome: "admitted", fact: buildRelation(p, scoreObviousness(deps.doors, relationClaimNorm(p))) }
}

/**
 * WP-96-N — the negation family's admission (ADR-0015 D3). Unlike `admitRelation`, it does NOT call a truth
 * door and does NOT score obviousness: a negation's soundness is a CLOSED-WORLD completeness question the DOOR
 * decides against the N0 feed + the live scope Merkle (contract F4 — the abstention law is the door's, never
 * re-implemented in genesis). So this leg does exactly two things: a gate-0 well-formedness check (a malformed
 * triple has no address ⇒ DROP), then it mints the `negationKey` identity and hands over a CANDIDATE whose
 * grounding/edgeModel the door will construct + stamp at admit. Pure + total: no truth call, no throw, no IO —
 * `negationTripleResolves` guarantees `negationKey` (in `buildNegation`) never throws out of this function.
 */
function admitNegation(p: NegationProposal, _deps: AdmitDeps): Admission {
  if (!negationTripleResolves(p)) return { outcome: "dropped", reason: DROP_NEGATION_MALFORMED }
  return { outcome: "admitted", fact: buildNegation(p) }
}

/**
 * GEN-12e (as amended by ADR-0012) — an advisory passes the TRUTH door alone. Obviousness is computed and
 * attached, never consulted: the score is taken AFTER the only rejecting branch, so no reordering of this
 * function can turn it back into a gate without deleting the `return` below.
 */
function admitAdvisory(p: AdvisoryProposal, deps: AdmitDeps): Admission {
  if (!deps.doors.grounded(p.grounding, deps.indexState)) return { outcome: "dropped", reason: DROP_UNGROUNDED }
  return { outcome: "admitted", fact: buildAdvisory(p, scoreObviousness(deps.doors, p.claimNorm)) }
}

/**
 * ABSTAIN ⇒ JUSTIFIED (genesis-epistemic-contract.md, proven-vs-justified.md). When a sound oracle ABSTAINS
 * on a model-proposed predicate — could-not-prove, never proved-false — the fact is not dropped: it is admitted
 * as the EXISTING unsealed advisory node (the "justified" ground), gated ONLY by the truth door. There is no new
 * node kind and no new seal value: `buildAdvisory` mints the same unsealed shape `admitAdvisory` produces, so
 * `verify-store` (seal-absent ⇒ skip) routes it correctly with zero ripple. Only UNGROUNDED still drops here;
 * REFUTE / vacuous / malformed / type-broken are handled by their own branches and are unaffected.
 */
function admitAbstainedAsJustified(p: PredicateProposal, deps: AdmitDeps): Admission {
  if (!deps.doors.grounded(p.grounding, deps.indexState)) return { outcome: "dropped", reason: DROP_UNGROUNDED }
  const advisory: AdvisoryProposal = {
    kind: "advisory",
    site: p.site,
    nodeKey: p.nodeKey,
    claimNorm: p.claimNorm,
    grounding: p.grounding,
    tier: p.tier,
  }
  return { outcome: "admitted", fact: buildAdvisory(advisory, scoreObviousness(deps.doors, p.claimNorm)) }
}

/**
 * 196b (ADR-0017 CORRECTION 5) — a grounded SEMANTIC-slot predicate (a slot no mechanical oracle decides —
 * `gotcha` and its kin; reached only after dependency/count/type-expressible and the synthesized-check path
 * have all been ruled out) is admitted as a FIRST-CLASS `justified` fact, not the degenerate bare-advisory
 * downgrade `admitAbstainedAsJustified` mints for the oracle-abstain arms. It carries `predicateSlot` (the
 * type survives), `seal:'justified'` (the ground is named — distinct from a bare unsealed advisory and from
 * `proven`) and the contestable `derivation` (the chain that leads a reader to the same conclusion, per
 * genesis-epistemic-contract.md §JUSTIFIED). Gated ONLY by the truth door (grounding) — the seal reflects
 * proof-strength, never admission (proven-vs-justified.md). Only UNGROUNDED still drops here.
 */
function admitSemanticJustified(p: PredicateProposal, deps: AdmitDeps): Admission {
  if (!deps.doors.grounded(p.grounding, deps.indexState)) return { outcome: "dropped", reason: DROP_UNGROUNDED }
  return { outcome: "admitted", fact: buildJustified(p, scoreObviousness(deps.doors, p.claimNorm)) }
}

/**
 * GEN-12 — mechanical predicate admission. SOUND ORACLE FIRST for a type-expressible slot; otherwise the
 * synthesized-check path: compile ∧ HOLDS (refine ≤K, else drop) ∧ TEETH (flip on ≥1 mutant, else vacuous).
 */
function admitPredicate(p: PredicateProposal, deps: AdmitDeps): Admission {
  if (p.slot === "dependency") {
    if (deps.verifyDependency === undefined) return { outcome: "dropped", reason: DROP_DEP_UNWIRED }
    const t = p.target,
      s = p.scope
    if (typeof t !== "string" || !t || typeof s !== "string" || !s)
      return { outcome: "dropped", reason: DROP_DEP_MALFORMED }
    // ABSTAIN ≠ REFUTE (genesis-epistemic-contract.md): `verifyDependency` only ever returns proven|abstain, so
    // `!== "proven"` is ALWAYS an abstain — "could not prove the edge", never "proved the edge absent". The sound
    // oracle abstaining must NOT drop a model-proposed fact; it admits as a JUSTIFIED advisory if grounded. The
    // ONLY thing the oracle earns on the positive verdict is the `proven` seal (buildSound) below.
    if (deps.verifyDependency(t, s) !== "proven") return admitAbstainedAsJustified(p, deps)
    if (!deps.doors.grounded(p.grounding, deps.indexState)) return { outcome: "dropped", reason: DROP_UNGROUNDED }
    return {
      outcome: "admitted",
      fact: buildSound(p, scoreObviousness(deps.doors, p.claimNorm)),
      label: LIKELY_INVARIANT,
    }
  }

  // GEN-12-count (#196c) — the CARDINALITY dual of the dependency arm, and it MUST precede the synthesized-check
  // path below: without this branch a `count` seed falls through to `predicate.synthesize`, where an unrelated
  // check could admit a count fact `verifyCount` never proved (a count "proven" by the wrong mechanism). The gate
  // RE-CHECKS the seed's number (`isPositiveInt`) rather than trusting it — the model never supplies a count, but
  // a malformed seed must still drop, never ride the oracle blind.
  if (p.slot === "count") {
    if (deps.verifyCount === undefined) return { outcome: "dropped", reason: DROP_COUNT_UNWIRED }
    const t = p.target,
      s = p.scope,
      n = p.atLeast
    if (
      typeof t !== "string" ||
      !t ||
      typeof s !== "string" ||
      !s ||
      typeof n !== "number" ||
      !Number.isInteger(n) ||
      n < 1
    )
      return { outcome: "dropped", reason: DROP_COUNT_MALFORMED }
    // ABSTAIN ≠ REFUTE — same law as the dependency arm. `verifyCount` returns proven|abstain only; `!== "proven"`
    // is "could not witness ≥ atLeast callers", never "proved fewer exist" (the SCIP feed gives no completeness).
    // So the count oracle abstaining admits a JUSTIFIED advisory if grounded; the `proven` seal is earned below only.
    if (deps.verifyCount(t, s, n) !== "proven") return admitAbstainedAsJustified(p, deps)
    if (!deps.doors.grounded(p.grounding, deps.indexState)) return { outcome: "dropped", reason: DROP_UNGROUNDED }
    return {
      outcome: "admitted",
      fact: buildSound(p, scoreObviousness(deps.doors, p.claimNorm)),
      label: LIKELY_INVARIANT,
    }
  }

  // GEN-12-def (#196d) — the DEFINITION dual of the dependency arm, BYTE-IDENTICAL to it (no cardinality leg),
  // and it MUST precede the synthesized-check path below for the same reason as the count arm: without it a
  // `definition` seed would fall through to `predicate.synthesize`, where an unrelated check could admit a
  // definition fact `verifyDefinition` never proved. `definition` is `PredicateSlot`-structural (NOT one of the
  // eight `SemanticSlot`s), so it is not a justified-slot either — it belongs HERE, on the sound gate.
  if (p.slot === "definition") {
    if (deps.verifyDefinition === undefined) return { outcome: "dropped", reason: DROP_DEF_UNWIRED }
    const t = p.target,
      s = p.scope
    if (typeof t !== "string" || !t || typeof s !== "string" || !s)
      return { outcome: "dropped", reason: DROP_DEF_MALFORMED }
    // ABSTAIN ≠ REFUTE — same law as the dependency/count arms. `verifyDefinition` returns proven|abstain only;
    // `!== "proven"` is "could not witness the definition under scope", never "proved it undefined". So the
    // definition oracle abstaining admits a JUSTIFIED advisory if grounded; the `proven` seal is earned below only.
    if (deps.verifyDefinition(t, s) !== "proven") return admitAbstainedAsJustified(p, deps)
    if (!deps.doors.grounded(p.grounding, deps.indexState)) return { outcome: "dropped", reason: DROP_UNGROUNDED }
    return {
      outcome: "admitted",
      fact: buildSound(p, scoreObviousness(deps.doors, p.claimNorm)),
      label: LIKELY_INVARIANT,
    }
  }

  // GEN-12k — a type-expressible slot uses the SOUND `$0` type-checker / LSP, not a synthesized query.
  if (deps.typeOracle.expressible(p.slot)) {
    if (deps.typeOracle.diagnose(p.site, p.slot) !== "HOLDS") return { outcome: "dropped", reason: DROP_TYPE_BROKEN }
    // ...and it emits an ADVISORY, because there is no truthful `Check` to carry here. See `buildSound`.
    return {
      outcome: "admitted",
      fact: buildSound(p, scoreObviousness(deps.doors, p.claimNorm)),
      label: LIKELY_INVARIANT,
    }
  }

  // synthesized-check path (CodeQL/Semgrep, KNOW-16). A slot a real check can synthesize mints the mechanical
  // predicate below. A slot with NO synthesized check is a genuinely SEMANTIC slot (`gotcha` and its kin — no
  // mechanical oracle decides it), NOT a refutation: it does not prove the claim false, so (196b, ADR-0017
  // CORRECTION 5 / genesis-epistemic-contract.md §JUSTIFIED) it admits as a FIRST-CLASS `justified` fact if
  // grounded — carrying its `predicateSlot` + `seal:'justified'` + the contestable `derivation` (see
  // `admitSemanticJustified`), NOT the degenerate bare-advisory downgrade the oracle-abstain arms take. The
  // retired `DROP_NO_CHECK` no longer exists. A check that DOES exist but does not compile-∧-HOLDS, or is
  // vacuous (TEETH did not flip), IS a refutation and still DROPS below via `attest`.
  let check = deps.predicate.synthesize(p.site)
  if (check === null) return admitSemanticJustified(p, deps)

  // GEN-12c VERIFY — require HOLDS on current code; GEN-12d — a failing check is refined ≤K, then dropped.
  let verdict = deps.predicate.verify(check, deps.indexState)
  for (let k = 0; verdict !== "HOLDS" && k < deps.K; k += 1) {
    const refined = deps.refine(check, p.site)
    if (refined === null) break // no change → stop early, never force
    check = refined
    verdict = deps.predicate.verify(check, deps.indexState)
  }

  // GEN-12c ∧ GEN-12j, funnelled through the ONE constructor of a `VerifiedCheck`.
  const final = check
  const attested = attest(final, verdict, () => deps.predicate.teeth(final, p.site.site))
  if (!attested.ok) return { outcome: "dropped", reason: attested.reason } // never forced

  return {
    outcome: "admitted",
    fact: buildPredicate(p, attested.check, scoreObviousness(deps.doors, p.claimNorm)),
    label: LIKELY_INVARIANT,
  }
}

// ---- I2: a `HOLDS` predicate cannot be BUILT out of a check nobody evaluated ---------------------------

/**
 * A check that EARNED its verdict: `verify` said `HOLDS` on current code AND `teeth` flipped it to `BROKEN`
 * on ≥1 mechanically-mutated counterfactual. `attest` is its only constructor and `buildPredicate` accepts
 * nothing else, so the node that carries `status: 'HOLDS'` cannot be assembled from an unevaluated check:
 * `buildPredicate` has exactly ONE call site, and at it the compiler will accept nothing `attest` did not
 * hand back. The brand is `declare`d, so it costs a type error and not a runtime byte.
 *
 * This is the enforcement, stated as I2 asks. It is deliberately a TYPE and not a test: the defect it
 * replaces was a second `return` inside this same function that quietly skipped both mechanisms, and a test
 * can only catch the shapes of that mistake someone thought to write down.
 */
declare const ATTESTED: unique symbol
export type VerifiedCheck = Check & { readonly [ATTESTED]: true }

type Attested = { readonly ok: true; readonly check: VerifiedCheck } | { readonly ok: false; readonly reason: string }

/**
 * The single gate (GEN-12c + GEN-12j). `teeth` arrives as a THUNK because the ORDER is normative and
 * observable: a check that is not `HOLDS` on current code must never reach the mutation gate at all
 * (SCN-GEN-12d-1 pins `teeth` at ZERO calls on a persistently-BROKEN check). Both refusals keep their own
 * distinct reason — a caller that cannot tell "did not hold" from "held but proved nothing" is being told
 * less than the harness knows.
 */
function attest(check: Check, verdict: Status, teeth: () => boolean): Attested {
  if (verdict !== "HOLDS") return { ok: false, reason: DROP_NOT_HOLDS }
  if (!teeth()) return { ok: false, reason: DROP_VACUOUS }
  return { ok: true, check: check as VerifiedCheck }
}

/**
 * The node the SOUND-ORACLE arm emits (GEN-12k) — an ADVISORY, carrying its slot and NO check.
 *
 * WHAT WAS HERE BEFORE, and why a better string was not the fix. This branch used to build a
 * `PredicateNode` around `soundCheck(slot) = {kind:'assertion', expr:`type-checker/LSP diagnostics:
 * ${slot}`}` — an expression that was never passed to `verify`, never subjected to `teeth`, and that the
 * steady-state evaluator cannot read at all: its assertion grammar is `child-count|<key>|<n>` /
 * `subtree-hash|<key>|<hash>` over one `IndexNode`, so that string names no operator and evaluates to `NA`
 * on every index state, forever. The node nonetheless shipped `status: 'HOLDS'`.
 *
 * The tension is real and is NOT resolved by writing a parseable expression. REQ-GEN-12k wants the SOUND
 * compiler oracle; KNOW-16's `Check` can express nothing but INDEX STATE, and a type-checker diagnostic is
 * not index state. `PredicateNode.check` is required, not optional. So the predicate family cannot honestly
 * hold this fact, and substituting some index query that happens to parse (`exists|<the site>`) would be the
 * same fabrication in a costume that also gets past the door — a check the mechanisms never ran, asserting
 * something the oracle never said.
 *
 * The advisory family is exactly the shape of what is known: a grounded claim with no mechanical verdict.
 * It has no `status` field, so `HOLDS` is not merely unset here — it is UNREPRESENTABLE. `predicateSlot`
 * (R3) keeps the slot, so the KNOW-15b identity leg and KNOW-4g read-side grouping are unchanged.
 * "ABSENT means UNKNOWN, never a fabricated placeholder" is the repo's own rule for grounding spans; the
 * verification field earns it more than a span does.
 *
 * The `LIKELY_INVARIANT` label is KEPT and it is not an overclaim: it names the ORACLE, and the compiler
 * really is a machine that really did check. What it never claimed, and still does not, is a proof.
 */
function buildSound(p: PredicateProposal, obviousness: ObviousnessScore): AdvisoryNode {
  const witness = witnessOf(p)
  return {
    kind: "advisory",
    obviousness,
    id: p.nodeKey,
    tier: p.tier,
    claimNorm: claimNormFor(p, witness),
    grounding: p.grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    predicateSlot: p.slot,
    seal: "proven",
    ...(witness !== undefined ? { witness } : {}),
  }
}

/**
 * CLAIM-DERIVED-FROM-WITNESS — the stored SENTENCE, generated from the same RESOLVED legs `witnessOf` reads,
 * never from `p.claimNorm` (the model's own answer prose). A `proven` seal used to authenticate only the
 * DERIVATION (the witness re-proves) while the STATEMENT rode over untouched, model-authored bytes — so a
 * fact could carry a witness that re-proves and a sentence that lies, and nothing would notice. Making the
 * text a PURE, TOTAL function of the witness closes that gap structurally: same witness ⇒ same sentence,
 * always, so the two can no longer diverge.
 *
 * Wording is deliberately conservative, mirroring the oracle it reports (`verify-fact.ts` / `verifyDependency`
 * `/verifyCount`, `@atlas/genesis`):
 *   - "references", never "calls" — the oracle's `reverseCallers` witnesses a cross-unit SCIP REFERENCE
 *     (imports and type positions count, `symbol-reverse.ts` `occ.role === 'reference'`); `reverseCallers`/
 *     `callers` are known-lying names for what they return, and this sentence must not repeat the lie.
 *   - "at least N" for the count arm, never "= N" — `verifyCount` proves a WITNESSED LOWER BOUND
 *     (`witnessed >= atLeast`), not an exact cardinality; an equality reading would overclaim completeness
 *     the SCIP feed does not give (see `verify-fact.ts`'s header on why REFUTE is not emitted at all).
 *
 * `undefined` witness (the GEN-12k type-expressible arm) has no re-provable derivation to build FROM — that
 * arm's sound oracle is the type checker, not `verifyDependency`/`verifyCount`, and carries no `target`/
 * `scope` legs at all (see `witnessOf`). Its claim text is left as the model's `p.claimNorm`, UNCHANGED and
 * OUT OF SCOPE for this fix — flagged, not silently "fixed" by fabricating a derivation that does not exist.
 */
function claimNormFor(p: PredicateProposal, witness: PredicateWitness | undefined): string {
  if (witness === undefined) return p.claimNorm // GEN-12k arm — no witness; model prose stands (out of scope)
  return claimNormFromWitness(witness)
}

/**
 * The witness-only half of `claimNormFor`, EXPORTED (TRAVEL-BY-REPROOF, #199 fix-round finding 1a) so a
 * re-verifier holding nothing but a STORED witness — never a `PredicateProposal`, which only exists inside
 * one mine run — can RE-DERIVE the sentence a `proven` seal is required to carry and demand byte equality.
 * Pure, total, identical to the branch `claimNormFor` already took when `witness !== undefined`; extracting
 * it changes no behaviour of `claimNormFor` itself.
 */
export function claimNormFromWitness(witness: PredicateWitness): string {
  if (witness.slot === "count" && typeof witness.atLeast === "number")
    return `${witness.target} is referenced by at least ${witness.atLeast} distinct unit(s) under ${witness.scope} (witnessed lower bound, sound oracle)`
  // #196d — a definition is a witnessed DEFINITION-occurrence under the scope, NOT a reference ("references"
  // would be the dependency oracle's lie; `verifyDefinition` witnesses the def-site itself, `definesAt`).
  if (witness.slot === "definition")
    return `${witness.target} is defined under ${witness.scope} (witnessed definition occurrence, sound oracle)`
  return `${witness.scope} references ${witness.target} (witnessed cross-unit reference, sound oracle)`
}

/**
 * SEAL-CARRIES-ITS-WITNESS — the `proven` seal's own derivation, read off the RESOLVED proposal legs
 * `admitPredicate` already checked `verifyDependency`/`verifyCount` against (never re-parsed from
 * `p.claimNorm`, which is the model's PRE-RESOLUTION prose). `undefined` for the type-expressible-slot arm
 * (GEN-12k): that branch's oracle is the type checker, not `verifyDependency`/`verifyCount`, and `p.target`/
 * `p.scope` are the dependency-slot legs, absent there — carrying them would misattribute a witness the
 * type oracle never produced.
 */
function witnessOf(p: PredicateProposal): PredicateWitness | undefined {
  if (typeof p.target !== "string" || typeof p.scope !== "string") return undefined
  return {
    slot: p.slot,
    target: p.target,
    scope: p.scope,
    ...(typeof p.atLeast === "number" ? { atLeast: p.atLeast } : {}),
  }
}

/**
 * Construct the emitted predicate node. The chain-of-thought is structurally absent (GEN-12f), and the
 * obviousness score is REQUIRED here rather than optional (ADR-0012 TOTALITY: an emitted fact without a
 * score is a defect, not a default — the field is optional on the stored shape only so that pre-ADR data
 * stays readable, exactly as with `builtAt`/`sameAs`).
 *
 * `predicateSlot: p.slot` is CARRIED (lucy #96 Finding 1 — the predicate mine→promote→query e2e revealed the
 * gap): the KNOW-15b identity leg is `nodeKey(predicate) = hash(primaryAnchorId ‖ predicateSlot ‖ check)`, and
 * BOTH the staging mint (`decideStaging`) and the door (`governed-emit.ts` candidateView) read `predicateSlot`
 * for the slot leg. Dropping it here minted a slot-FREE key, diverging from the true identity and from the
 * SOUND-oracle arm (`buildSound`, which carries `predicateSlot`) — so a predicate at the same anchor with a
 * different slot but equal check would collide, and the KNOW-4g read-side slot grouping was blind. Fixed at
 * source so the slot rides the fact into CAS, identity and the read projection identically.
 */
function buildPredicate(p: PredicateProposal, check: VerifiedCheck, obviousness: ObviousnessScore): PredicateNode {
  return {
    kind: "predicate",
    obviousness,
    id: p.nodeKey,
    tier: p.tier,
    check,
    grounding: p.grounding,
    status: "HOLDS",
    freshness: "FRESH",
    claims: [],
    authoring: "PREDICATED",
    predicateSlot: p.slot,
  }
}

/**
 * Construct the emitted advisory node. The chain-of-thought is structurally absent (GEN-12f); the
 * obviousness score is REQUIRED (ADR-0012 TOTALITY — see `buildPredicate`).
 */
function buildAdvisory(p: AdvisoryProposal, obviousness: ObviousnessScore): AdvisoryNode {
  return {
    kind: "advisory",
    obviousness,
    id: p.nodeKey,
    tier: p.tier,
    claimNorm: p.claimNorm,
    grounding: p.grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }
}

/**
 * The node a grounded SEMANTIC slot emits (196b) — an ADVISORY carrying its slot, the `justified` seal, and
 * its contestable derivation. Chosen over `PredicateNode` deliberately: `AdvisoryNode` is the ONLY node kind
 * that already carries all three additive legs (`predicateSlot?`, `seal?`, `derivation?`), needs no `check`/
 * `status` a semantic slot cannot honestly supply, mints its identity off the same upstream `nodeKey` (no new
 * identity leg), and round-trips through governed-emit unchanged. It differs from `buildSound` in exactly the
 * two fields that name the ground: `seal:'justified'` (not `'proven'`) and `derivation` (not `witness`) —
 * the seal names its grounds, and the two provenance carriers never blur (types.ts §PredicateWitness /
 * §derivation). The derivation is PERSISTED here, unlike `scratch` (GEN-12f), and is carried absent-tolerant:
 * a proposal that names no grounds simply omits it, never fabricates one.
 */
function buildJustified(p: PredicateProposal, obviousness: ObviousnessScore): AdvisoryNode {
  return {
    kind: "advisory",
    obviousness,
    id: p.nodeKey,
    tier: p.tier,
    claimNorm: p.claimNorm,
    grounding: p.grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    predicateSlot: p.slot,
    seal: "justified",
    ...(typeof p.derivation === "string" && p.derivation.length > 0 ? { derivation: p.derivation } : {}),
  }
}
