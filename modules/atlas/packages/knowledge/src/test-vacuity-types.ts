// @atlas/knowledge — src/test-vacuity-types.ts  (ADR-0015 D5 · #95 — the single-anchor test-vacuity data model)
//
// EXTRACTED into its own cohesive sibling at the `types.ts` godfile ceiling, EXACTLY as `negation-types.ts`
// (#99b) and `transition-types.ts` (#234) were on the sibling legs. RE-EXPORTED by `types.ts`
// (`export type { TestVacuityNode }`) so the package surface — `import type { TestVacuityNode } from
// '@atlas/knowledge'` — is byte-identical to an inline declaration. `Seal`/`ObviousnessScore`/`KnowledgeFreshness`
// stay owned by `types.ts` and are imported here (a type-only cycle, erased at runtime). See
// docs/design/95-test-vacuity-design.md and ADR-0015 D5.
//
// WHAT A TEST-VACUITY FACT IS, AND WHY IT IS THE SINGLE-ANCHOR PROVEN SIBLING OF THE SOUND ARM (ADR-0015 D5):
// a test-vacuity fact is a single-anchor PROVEN record — "named test `testName` in unit `unitKey` has all its
// assertion-shaped calls inside `catch` clauses and no assertion-count guard" — a SYNTACTIC property that is a
// pure function of the unit's AST (see adapter-io/src/test-vacuity.ts `scanTestVacuity`). Unlike a transition
// (which has NO mechanical HEAD oracle and is SEALED `justified`), a test-vacuity fact HAS a mechanical HEAD
// oracle — a tree-sitter scan of the unit at HEAD re-derives it — so it is SEALED `proven`, the single-anchor
// AST-substrate analogue of a proven `depends-on` relation. It carries NO `check` (its oracle is tree-sitter,
// not SCIP — a different substrate, living in adapter-io, injected like `verifyRelation`, never re-run inside
// genesis), so it is NOT a `PredicateNode` and never enters the predicate lifecycle.
//
// IDENTITY vs FRESHNESS, made concrete (ADR-0015 D5):
//   - `unitKey` + `testName` are the IDENTITY legs. They feed `testVacuityKey = hash({tv, u, t})`
//     (test-vacuity-key.ts) — a PAIR (not an ordered triple; DIRECTED is n/a). A unit may hold MANY named
//     vacuous tests, each its OWN node (a distinct `testVacuityKey`); the address is not the unit, it is the
//     (unit, test) pair.
//   - `grounding.entries` carries EXACTLY ONE entry — it anchors the unit (its `subtreeHash` the freshness
//     leg). Single-anchor, unlike a relation (2-ended) or a transition (a 2-rev pair). Reverify (Wave 1a)
//     RE-RUNS `scanTestVacuity` over the unit at HEAD and re-proves iff a fact with this `testName`+`shape`
//     still appears in the oracle's output (else `broken`) — the freshness leg is the unit anchor's
//     `subtreeHash`, exactly the positive-intrinsic oracle.

import type { Tier, NodeKey } from "@atlas/contracts"
import type { ClaimEntry } from "@atlas/kernel"
import type { Grounding } from "@atlas/grounding"
import type { KnowledgeFreshness, ObviousnessScore, Seal } from "./types.js"

/**
 * The proven SHAPE a test-vacuity fact names. A CLOSED, ADDITIVE-ONLY union (adding a member is a spec
 * revision — the `cv` bump ADR-0015 D5 names), exactly like `RelationKind`. The normative vocabulary lives
 * in `reference/atlas-knowledge.md` — a member added here without a row there is an undocumented widening.
 *
 * Every member is a SYNTACTIC property of the test's own AST, provable by `scanTestVacuity` from the hashed
 * unit's bytes alone. None is a runtime claim that the test's bug fires (that is a semantic, cross-procedural
 * question no AST oracle can settle) — each flags a fragile SHAPE, which is what makes the family
 * 0-false-admit by construction.
 */
export type TestVacuityShape =
  | "assertion-only-in-catch" // every assertion sits inside a `catch`; the success path asserts nothing
  | "no-assertion-in-test" // the body discards work and contains no assertion-shaped call at all
  | "assertion-never-invoked" // a matcher is REFERENCED but never CALLED, so the assertion never runs

/**
 * A single-anchor PROVEN `test-vacuity` fact (#95, ADR-0015 D5): "named test `testName` in unit
 * `unitKey` has all its assertion-shaped calls inside `catch` clauses and no assertion-count guard" — a
 * SYNTACTIC property re-derivable from the unit's AST alone (see adapter-io/src/test-vacuity.ts).
 * Structurally the single-anchor PROVEN sibling of the sound arm: it carries a `witness` (its re-runnable
 * derivation) and is SEALED `proven` (never `justified` — there IS a mechanical HEAD oracle, unlike a
 * transition). Identity is the (unitKey, testName) pair — a unit may hold many named vacuous tests, each
 * its own node. Freshness is the unit anchor's `subtreeHash`; reverify RE-RUNS `scanTestVacuity` over the
 * unit at HEAD and re-proves iff a fact with this `testName`+`shape` still exists (else `broken`).
 */
export interface TestVacuityNode {
  readonly kind: "test-vacuity"
  readonly id: NodeKey // = testVacuityKey(unitKey, testName) (test-vacuity-key.ts); MINTED, never trusted from the payload
  readonly tier: Tier
  readonly unitKey: string // the LOCATION-FREE unit lineage (qualifiedPath) holding the test — identity leg
  readonly testName: string // the test's name string — identity leg (a unit may hold many named tests)
  readonly shape: TestVacuityShape // WHICH proven syntactic property this fact names (identity leg with unitKey+testName)
  readonly grounding: Grounding // EXACTLY one entry: anchors the unit (its subtreeHash the freshness leg)
  readonly freshness: KnowledgeFreshness
  readonly claims: readonly ClaimEntry[]
  readonly authoring: "PROVEN" | "SUPERSEDED" // minted 'PROVEN'; supersession is derive-on-read if ever needed
  readonly seal?: Seal // ADR-0017 — ALWAYS 'proven' on a minted test-vacuity node; additive/absent-tolerant
  readonly witness?: TestVacuityWitness // SEAL-CARRIES-ITS-WITNESS — see below. ADDITIVE + absent-tolerant.
  readonly scope?: string // KNOW-11a — the write/authz scope; additive/absent-tolerant (see AdvisoryNode)
  readonly obviousness?: ObviousnessScore // ADR-0012 — additive, absent-tolerant (see AdvisoryNode)
}

/**
 * The `seal:'proven'` test-vacuity fact's re-runnable derivation — the single-anchor AST-substrate
 * analogue of `RelationWitness`. A test-vacuity fact has no `PredicateSlot` (its oracle is tree-sitter,
 * not SCIP), so the witness encodes what the AST oracle RE-RUNS: the proven `shape` + the `testName` to
 * find in `scanTestVacuity`'s output over the unit at HEAD. Read-side reverify (Wave 1a) re-parses the
 * unit and re-proves iff a fact with this (`shape`, `testName`) still appears (else `broken`); a proven
 * test-vacuity node with no witness is `unverifiable` (the #240 trap — closed by carrying this witness).
 * ADDITIVE + absent-tolerant, same discipline as `PredicateWitness`/`RelationWitness`.
 */
export interface TestVacuityWitness {
  readonly shape: TestVacuityShape // the proven SHAPE the oracle re-derives
  readonly testName: string // the test name the re-run must still find with this shape
}
