// @atlas/genesis — src/admit-proposals.ts   (the LLM proposal data model — the typed candidate ONLY)
//
// EXTRACTED from `admit-harness.ts` at the 400-LOC godfile ceiling along the cohesive boundary WP-96 forced:
// the harness owns the mechanical ADMISSION ENGINE (synthesize / verify / teeth / mint), and this module owns
// the SHAPES the LLM proposes into it — a typed candidate carrying the CLAIM only, never an admission vote.
// The exact sibling of the knowledge `relation-key.ts` / `negation-types.ts` extractions on #99a/#99b. Every
// shape is re-exported by `admit-harness.ts` (which uses them), so the package surface is byte-identical.
//
// The four fact families each get a proposal slot: advisory + predicate (the original two), and — widened by
// ADR-0015 D2/D3 (WP-96) — relation + negation, so the later relation/negation admission WPs have a typed
// place to fill and the `Proposal` union is exhaustive (tsc). NO admission authority rides any of these: the
// harness casts the decision, never the model (GEN-12a). `scratch` is chain-of-thought — never a fact (GEN-12f).

import type { NodeKey, Tier } from "@atlas/contracts"
import type { AdvisoryNode, PredicateSlot, RelationKind, TestVacuityShape } from "@atlas/knowledge"
import type { Candidate, WhyNot } from "./types.js"

/** The citations carrier of a grounded fact — reused from the frozen node shape, NEVER redefined. */
export type FactGrounding = AdvisoryNode["grounding"]

/** ONE grounding entry (an anchored citation) — projected off the frozen `FactGrounding` shape so genesis needs
 *  no DIRECT @atlas/grounding import (the same layer discipline `FactGrounding` itself keeps for the relation
 *  family). A transition proposal carries two of these — the unit at each rev. */
export type FactGroundingEntry = FactGrounding["entries"][number]

// ---- the LLM proposal: a TYPED candidate ONLY (GEN-12a) — no admission vote, no confidence field --------

/**
 * A predicate candidate the LLM proposes (GEN-12a). It carries the CLAIM only — the runnable `check` is
 * SYNTHESIZED mechanically by the harness (`PredicateApi.synthesize`), never trusted from the model.
 * `scratch` is the chain-of-thought: SCRATCH ONLY (GEN-12f), never persisted onto the emitted node.
 */
export interface PredicateProposal {
  readonly kind: "predicate"
  readonly site: Candidate // the genesis ranked SITE — the admission anchor rides `site.site.subtreeHash`
  readonly slot: PredicateSlot // drives SOUND-ORACLE-FIRST (GEN-12k)
  readonly target?: string // ADR-0017 dependency-slot leg — the global symbol X the fact depends on (absent for non-oracle slots)
  readonly scope?: string //  ADR-0017 dependency-slot leg — the directory key S the dependency witness ranges over
  readonly atLeast?: number // #196c count-slot leg — the WITNESSED lower bound N (distinct caller units); absent for non-count slots
  readonly nodeKey: NodeKey // identity carried through (minted upstream, not by a model vote)
  readonly claimNorm: string
  readonly grounding: FactGrounding
  readonly tier: Tier
  readonly scratch?: string // chain-of-thought — discarded, never a fact (GEN-12f)
  readonly derivation?: string // 196b justified-slot leg — the contestable grounds carried onto `node.derivation` (ADR-0017 CORRECTION 5). PERSISTED, unlike `scratch`. Absent for oracle slots.
}

/** An advisory candidate the LLM proposes (GEN-12e) — a grounded claim with no verdict. */
export interface AdvisoryProposal {
  readonly kind: "advisory"
  readonly site: Candidate
  readonly nodeKey: NodeKey
  readonly claimNorm: string
  readonly grounding: FactGrounding
  readonly tier: Tier
  readonly scratch?: string // chain-of-thought — discarded, never a fact (GEN-12f)
}

/**
 * A RELATION candidate the LLM proposes (ADR-0015 D2, #99a). Mirrors `RelationNode`
 * (packages/knowledge/src/types.ts:109) MINUS the harness/door-minted legs (`relationKey`/id, freshness,
 * authoring, obviousness): the proposer supplies the two LOCATION-FREE endpoint unitKeys + `relationKind` +
 * grounding; the identity (`relationKey`) is minted DOWNSTREAM (KNOW-15b parity), never by the model. No
 * `check` — a relation is not a checkable predicate, so a relation carrying one is refused as malformed
 * (`familyOf`, governed-emit-identity.ts:38). Admission (grounding/mint) is WP-96-R — this is only its slot.
 */
export interface RelationProposal {
  readonly kind: "relation"
  readonly site: Candidate
  readonly relationKind: RelationKind
  readonly endpointA: string // location-free unitKey of A (subject) — identity leg, NOT a single anchor
  readonly endpointB: string // location-free unitKey of B (object) — identity leg
  readonly grounding: FactGrounding // EXACTLY two entries: [0] anchors A, [1] anchors B (AND-folded freshness)
  readonly tier: Tier
  // ── SOUND-ORACLE legs (#99 sound relation, ADR-0018 — WP-96-R2). Present iff the proposal is a PROVABLE
  //    depends-on edge the mechanical projection (WP-R3) resolved: `target` is the global SCIP symbol under
  //    endpointB and `sourceScope` is endpointA's verify-scope (the reverify args a `proven` seal re-runs).
  //    ABSENT on an advisory/LLM relation (no oracle, no seal). Mirrors PredicateProposal's `target?`/`scope?`.
  //    NEVER endpoint prose: derived from a `resolved DepEdge`, not the endpoints, and re-checked by `verifyRelation`.
  readonly target?: string // the global SCIP symbol under endpointB whose witnessed reference proves the edge
  readonly sourceScope?: string // endpointA's verify-scope the witnessed reference must lie under
  readonly scope?: string
  readonly scratch?: string // chain-of-thought — discarded, never a fact (GEN-12f)
}

/**
 * A NEGATION candidate the LLM proposes (ADR-0015 D3, #99b). Mirrors `NegationNode`
 * (packages/knowledge/src/negation-types.ts:41) MINUS the harness/door-minted legs (`negationKey`/id,
 * `edgeModel`, freshness, authoring, claims). NO `grounding`: the governed door CONSTRUCTS it at admit from
 * the scope directory's subtree-Merkle (bobby F4; governed-emit-negation.ts:199-201) — the proposer names
 * only the (relationKind, target, scope) it is a negative about. `scope` is the directory/witness IDENTITY leg;
 * the F3 authz-vs-identity split (WP-96-N, owner-ratified 2026-08-11, amends #99b) is the OPTIONAL `authzScope`
 * below, kept SEPARATE from the identity `scope`. Admission is WP-96-N (`admitNegation` → `buildNegation`).
 */
export interface NegationProposal {
  readonly kind: "negation"
  readonly site: Candidate
  readonly relationKind: RelationKind // the NEGATED relation (shares #99a's closed vocabulary)
  readonly target: string // location-free GLOBAL symbol key X the negative is ABOUT (¬∃ · →X) — identity leg
  readonly scope: string // the CLOSED scope S (a DIRECTORY key) the witness ranges over — identity leg
  readonly tier: Tier
  // ── AUTHZ SCOPE (ADDITIVE, OPTIONAL — F3, WP-96-N) — the scope the DOOR's authz gate binds instead of the
  //    witness `scope`, when present. NEVER an identity leg (`negationKey` reads the triple only) and NEVER read
  //    by the abstention law. Absent on a human proposal (authz falls back to the witness `scope`); the MINED
  //    path stamps it `atlas:mined` downstream (mine-decide.ts). Carried onto the candidate by `buildNegation`.
  readonly authzScope?: string
  readonly scratch?: string // chain-of-thought — discarded, never a fact (GEN-12f)
}

/**
 * A TRANSITION candidate the proposer emits (ADR-0015 D4, #234). Mirrors `TransitionNode`
 * (packages/knowledge/src/transition-types.ts) MINUS the harness-minted legs (`transitionKey`/id, freshness,
 * authoring, seal, obviousness): the proposer supplies the LOCATION-FREE `unitKey` lineage + the TWO rev-pair
 * grounding entries (each a `GroundingEntry` anchored at the unit AT that rev, its `subtreeHash` the
 * content hash) + the contestable `derivation` the `justified` seal will name. NO `check` — a transition is
 * not a checkable predicate. NO oracle: unlike the negation door (which CONSTRUCTS the scope-Merkle grounding),
 * `buildTransition` grounds DIRECTLY on the two rev entries the proposer already resolved from real revs, mints
 * `seal:'justified'` + the `derivation`, and calls no truth door (D-T1). The identity (`transitionKey`) and the
 * `shaBefore`/`shaAfter` legs are DERIVED downstream from the two entries' `subtreeHash`es — never trusted off
 * a payload id leg (KNOW-15b parity). Admission is `admitTransition` → `buildTransition`.
 */
export interface TransitionProposal {
  readonly kind: "transition"
  readonly unitKey: string // the LOCATION-FREE unit lineage (qualifiedPath) both revs share — identity leg
  readonly refBefore: FactGroundingEntry // the unit anchored at the BEFORE rev (anchor.subtreeHash = the before content hash) — grounding entry[0] + identity
  readonly refAfter: FactGroundingEntry //  the unit anchored at the AFTER rev  (anchor.subtreeHash = the after content hash)  — grounding entry[1] + identity
  readonly tier: Tier
  readonly scope?: string // KNOW-11a — the AUTHZ/write scope the governed door authorizes against (the unit's own scope, `unitScopeOf(unitKey)`, stamped by the producer). Carried onto `node.scope` by `buildTransition`.
  readonly derivation?: string // the change the model read ACROSS the two rev bodies — the contestable ground the `justified` seal names (proven-vs-justified.md §JUSTIFIED)
  readonly scratch?: string // chain-of-thought — discarded, never a fact (GEN-12f)
}

/**
 * A TEST-VACUITY candidate the PRODUCER emits (ADR-0015 D5, #95). Mirrors `TransitionProposal`: LOCATION-FREE,
 * carrying NO `site` — the single-anchor `unitKey` lineage + the test's `testName` + the proven `shape` + ONE
 * grounding entry anchoring the unit (its `subtreeHash` the freshness leg) + the mined `tier` + the authz
 * `scope`. NO `check` — a test-vacuity is not a checkable predicate; its oracle is tree-sitter (`scanTestVacuity`),
 * injected as `verifyTestVacuity`, NEVER re-run inside genesis. The identity (`testVacuityKey`) and the `witness`
 * are DERIVED downstream from (`unitKey`, `testName`, `shape`) — never trusted off a payload id leg (KNOW-15b
 * parity). Admission is `admitTestVacuity` → `trySoundTestVacuity` → `buildSoundTestVacuity`.
 */
export interface TestVacuityProposal {
  readonly kind: "test-vacuity"
  readonly unitKey: string // the LOCATION-FREE unit lineage (qualifiedPath) holding the test — identity leg
  readonly testName: string // the test's name string — identity leg (a unit may hold many named vacuous tests)
  readonly shape: TestVacuityShape // WHICH proven syntactic property (closed vocabulary, reference/atlas-knowledge.md)
  readonly grounding: FactGrounding // EXACTLY one entry: anchors the unit (its subtreeHash the freshness leg)
  readonly tier: Tier
  readonly scope?: string // KNOW-11a — the AUTHZ/write scope the governed door authorizes against (the unit's own scope)
  readonly scratch?: string // chain-of-thought — discarded, never a fact (GEN-12f)
}

/** A grounded abstention (GEN-12g) — a VALID outcome, never a manufactured fact. */
export interface Abstention {
  readonly kind: "abstain"
  readonly whyNot: WhyNot
}

/** What the proposer emits for one site — a typed candidate OR a grounded abstention. NO admission authority. */
export type Proposal =
  | PredicateProposal
  | AdvisoryProposal
  | RelationProposal
  | NegationProposal
  | TransitionProposal
  | TestVacuityProposal
  | Abstention
