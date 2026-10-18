// @atlas/genesis — src/admit-test-vacuity.ts  (ADR-0015 D5 · #95 — the test-vacuity family's admission legs)
//
// The EXACT sibling of `admit-relation.ts` (#99a), `admit-negation.ts` (#99b) and `admit-transition.ts` (#234):
// the family-specific PURE builders + refusals + the sound-seal decision. Unlike those three, the harness is at
// its 600-LOC ceiling, so the ADMISSION DECISION for this family (`admitTestVacuity`) ALSO lives here rather
// than in `admit-harness.ts` — the harness keeps ONLY a one-line dispatch to it. Nothing here re-implements the
// truth door (grounding) or the obviousness scorer: both arrive as INJECTED closures the dispatch binds off the
// harness's own `deps.doors`, so this module casts no admission authority the harness does not own.
//
// WHY A TEST-VACUITY IS SEALED PROVEN BY AN INJECTED ORACLE (D5, the whole design). A test-vacuity fact is the
// single-anchor PROVEN sibling of the sound arm: "named test `testName` in unit `unitKey` has all its
// assertion-shaped calls inside `catch` clauses and no assertion-count guard" — a SYNTACTIC property re-derivable
// from the unit's AST alone (adapter-io/src/test-vacuity.ts `scanTestVacuity`). genesis has NO tree-sitter, so —
// EXACTLY as `admitRelation` gates on the injected `verifyRelation` — the seal here gates on an INJECTED
// `verifyTestVacuity` closure (captured in adapter-io, where the oracle lives) and mints `seal:'proven'` ONLY
// when it returns `'proven'`. The producer supplies the closure; genesis is the seal authority. There is NO
// advisory test-vacuity form: the family is PROVEN-only, so an abstaining oracle yields NO fact (a drop), never
// a downgraded advisory. See docs/design/95-test-vacuity-design.md and ADR-0015 D5.

import type { ObviousnessScore, TestVacuityNode, TestVacuityShape, TestVacuityWitness } from "@atlas/knowledge"
// The test-vacuity identity leg — the SEALED mint (`testVacuityKey`). Identity is minted from the proposal's
// (unitKey, testName) PAIR, NEVER trusted off a payload (the proposal carries no id leg at all — KNOW-15b parity).
import { testVacuityKey } from "@atlas/knowledge"
import type { FactGrounding, TestVacuityProposal } from "./admit-proposals.js"
import type { Admission } from "./admit-harness.js"

/** The sound test-vacuity oracle (D5) — the injected re-runnable verifier. `'proven'` iff a fact with this
 *  `(shape, testName)` still appears when `scanTestVacuity` runs over the unit at HEAD; `'abstain'` otherwise.
 *  Captured in adapter-io (where tree-sitter lives); genesis calls it agnostic to where it runs, exactly like
 *  `verifyRelation`. ABSTAIN ≠ REFUTE: an abstaining oracle earns no seal, never a forced fact. */
export type TestVacuityVerifier = (unitKey: string, testName: string, shape: TestVacuityShape) => "proven" | "abstain"

// The two honest, distinct refusals (ADR-0015 D5), mirroring the relation gate-0/gate-1 split: a malformed
// identity has no address to mint, an unproven shape earned no seal. There is deliberately NO advisory
// fallthrough (unlike a relation) — the family is PROVEN-only, so a non-proven verdict is a drop, not a downgrade.
export const DROP_TEST_VACUITY_MALFORMED =
  "malformed test-vacuity: the identity pair (unitKey, testName) is not well-formed — unitKey must be a " +
  "non-empty location-free unit key and testName a non-empty test name string. A malformed pair has no address " +
  "to mint (ADR-0015 D5 — MalformedTestVacuityError's conditions, checked here so `testVacuityKey` never throws " +
  "out of the total `admit`)"
export const DROP_TEST_VACUITY_UNGROUNDED =
  "test-vacuity fails the truth door — the unit-anchor citation does not re-derive FRESH (GEN-12e / ADR-0015 D5)"
export const DROP_TEST_VACUITY_UNPROVEN =
  "the injected sound oracle (scanTestVacuity) did not re-prove the proposed test-vacuity shape at HEAD — the " +
  "PROVEN-only test-vacuity family has no advisory form, so an abstaining oracle yields NO fact (ADR-0015 D5)"

/**
 * Gate-0 well-formedness for a test-vacuity fact (ADR-0015 D5). MIRRORS `testVacuityKey`'s own refusal
 * conditions (test-vacuity-key.ts): a non-empty `unitKey` AND a non-empty `testName`. Checked BEFORE the mint so
 * `testVacuityKey` — which THROWS `MalformedTestVacuityError` on the same conditions — is never reached with a
 * pair it would reject, keeping `admit` total (no throw). Pure + total over an untrusted proposal.
 */
export function testVacuityWellFormed(p: TestVacuityProposal): boolean {
  return (
    typeof p.unitKey === "string" && p.unitKey.length > 0 && typeof p.testName === "string" && p.testName.length > 0
  )
}

/**
 * The proven test-vacuity's WITNESS, read off the proposal's SOUND-ORACLE legs (`shape` + `testName`) — the
 * single-anchor AST-substrate analogue of `relationWitnessOf`. Present iff the proposal carries a non-empty
 * `testName` (the leg the re-run must still find with this `shape`); `undefined` otherwise. Pure + total. The
 * witness is EXACTLY what reverify (reverify-store.ts) re-runs `scanTestVacuity` against — never model prose.
 */
export function testVacuityWitnessOf(p: TestVacuityProposal): TestVacuityWitness | undefined {
  if (typeof p.testName !== "string" || p.testName.length === 0) return undefined
  return { shape: p.shape, testName: p.testName }
}

/**
 * CLAIM-DERIVED-FROM-WITNESS for the test-vacuity family (mirrors `relationClaimNormFromWitness`) — the stored
 * SENTENCE generated from the SAME `(shape, testName)` legs `testVacuityWitnessOf` reads, never model prose.
 * EXPORTED (TRAVEL-BY-REPROOF) so a re-verifier holding only a stored `TestVacuityWitness` re-derives the
 * sentence a `proven` seal is required to carry. Wording is conservative — the fact flags the fragile SHAPE, it
 * does NOT assert a vacuous execution is reachable (see test-vacuity.ts's soundness rails). Pure + total.
 */
export function testVacuityClaimNormFromWitness(w: TestVacuityWitness): string {
  return `test '${w.testName}' has every assertion-shaped call inside a catch clause and no assertion-count guard (shape ${w.shape}, witnessed AST oracle)`
}

/**
 * The PROVEN test-vacuity node (#95, ADR-0015 D5) — the single-anchor sealed sibling of `buildSoundRelation`.
 * Identity is MINTED by `testVacuityKey(unitKey, testName)` (never trusted off the payload); the caller has
 * already cleared `testVacuityWellFormed`, so `testVacuityKey` cannot throw here. `seal:'proven'` + the
 * re-runnable `witness` name the proof. `authoring:'PROVEN'` is the mint value (supersession is derive-on-read).
 * `obviousness` is spread conditionally — ABSENT for the PRODUCER path (adapter-io has no harness obviousness
 * door, so a produced structural fact carries none, exactly as a transition does; `ObviousnessScore.by` admits
 * only `'harness-predicate'`), PRESENT for the harness-admitted path. `scope` is spread conditionally too — the
 * `exactOptionalPropertyTypes` discipline (absent stays ABSENT, never explicit `undefined`). Pure + total.
 */
export function buildSoundTestVacuity(
  p: TestVacuityProposal,
  witness: TestVacuityWitness,
  obviousness?: ObviousnessScore,
): TestVacuityNode {
  return {
    kind: "test-vacuity",
    id: testVacuityKey(p.unitKey, p.testName),
    tier: p.tier,
    unitKey: p.unitKey,
    testName: p.testName,
    shape: p.shape,
    grounding: p.grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "PROVEN",
    seal: "proven",
    witness,
    ...(obviousness !== undefined ? { obviousness } : {}),
    ...(p.scope !== undefined ? { scope: p.scope } : {}),
  }
}

/**
 * The test-vacuity SOUND-ADMIT decision (#95, ADR-0015 D5) — the single-anchor analogue of `trySoundRelation`.
 * Returns a `proven`-sealed `TestVacuityNode` IFF the proposal carries a witness (`testVacuityWitnessOf`) AND the
 * injected sound `verifyTestVacuity` re-proves the `(shape, testName)` shape at HEAD; otherwise `undefined`.
 * ABSTAIN ≠ REFUTE: an abstaining oracle, or no verifier wired, returns `undefined` (the caller drops — there is
 * no advisory form). `score` derives the stored obviousness FROM THE WITNESS-derived sentence (never model prose);
 * ABSENT on the producer path (no harness door), so the node carries no obviousness. Pure + total: no throw, no IO.
 */
export function trySoundTestVacuity(
  p: TestVacuityProposal,
  verifyTestVacuity: TestVacuityVerifier | undefined,
  score?: (claimNorm: string) => ObviousnessScore,
): TestVacuityNode | undefined {
  const witness = testVacuityWitnessOf(p)
  if (witness === undefined || verifyTestVacuity === undefined) return undefined
  if (verifyTestVacuity(p.unitKey, witness.testName, witness.shape) !== "proven") return undefined
  return buildSoundTestVacuity(
    p,
    witness,
    score !== undefined ? score(testVacuityClaimNormFromWitness(witness)) : undefined,
  )
}

/**
 * The harness's test-vacuity admission arm (ADR-0015 D5) — the BODY the one-line `admit` dispatch routes to
 * (housed here, not in `admit-harness.ts`, because the harness is at its 600-LOC ceiling). The EXACT sibling of
 * `admitRelation`, minus the advisory fallthrough (this family is PROVEN-only): a gate-0 well-formedness check,
 * the SAME truth door the advisory path uses (`grounded`, injected), then the sound oracle. A proven shape mints
 * a `proven`-sealed node carrying its witness (obviousness scored off the WITNESS-derived text); anything else —
 * malformed, ungrounded, or an oracle that did not re-prove — is a DROP (no fact). `grounded`/`score` are bound
 * off the harness's `deps.doors` by the dispatch, so no truth rule or scorer is re-implemented here. Pure + total.
 */
export function admitTestVacuity(
  p: TestVacuityProposal,
  verifyTestVacuity: TestVacuityVerifier | undefined,
  grounded: (grounding: FactGrounding) => boolean,
  score: (claimNorm: string) => ObviousnessScore,
): Admission {
  if (!testVacuityWellFormed(p)) return { outcome: "dropped", reason: DROP_TEST_VACUITY_MALFORMED }
  if (!grounded(p.grounding)) return { outcome: "dropped", reason: DROP_TEST_VACUITY_UNGROUNDED }
  const proven = trySoundTestVacuity(p, verifyTestVacuity, score)
  if (proven !== undefined) return { outcome: "admitted", fact: proven }
  return { outcome: "dropped", reason: DROP_TEST_VACUITY_UNPROVEN }
}
