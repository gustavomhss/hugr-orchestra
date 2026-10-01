// @atlas/genesis — src/verify-negation.ts  (spike/verify-fact — the NEGATION class of the PROVEN fact family)
//
// A PURE, TOTAL oracle: PROVE / REFUTE / ABSTAIN on a "NO unit under scope A references global symbol B"
// claim, riding the SAME live `SymbolReverseApi` mechanics as the dependency (`verify-fact.ts`) and count
// (`verify-count.ts`) oracles and the shipped negation door (`adapter-io/src/governed-emit-negation.ts`,
// gate-1 + #220). This is the genesis-side, `--class`-driven restatement of that door's logic — TRANSCRIBED,
// not invented — as a PROVEN oracle. It does NOT touch the shipped sealed door.
//
// THE DUALITY (why this oracle EMITS `refuted` where the dependency oracle deliberately does not).
// A negation is an ABSENCE claim, so the two verdicts have OPPOSITE soundness conditions from the positive
// dependency oracle's:
//   - REFUTE (the negation is FALSE): witness ONE caller of B under A. A witnessed caller is a positive
//     EXISTENCE — sound in ANY world, because an incomplete index cannot FABRICATE a caller. So refuting a
//     negation needs NO closed-world proof. This is the sound direction here — the exact mirror of the
//     dependency oracle, where PROVE was the any-world-sound direction and REFUTE the unsound one.
//   - PROVE (the negation HOLDS): "no caller anywhere in S" is a closed-world claim — sound only if the index
//     has NO unresolved/dynamic reference INSIDE THAT SAME SCOPE S (`holeSources() ∩ scope == ∅`); a hole
//     under S could be an unseen caller of B. Hole in scope ⇒ abstain('scope-open'), never a false `proven`.
//   - A PHANTOM target (`!resolves(target)`, #220): `reverseCallers` is `[]` by CONSTRUCTION for a symbol with
//     no in-index definition, so "no caller" would VACUOUSLY prove the negation for a target Atlas cannot even
//     see. Fail closed: abstain('target-unresolvable') BEFORE any prove — exactly the shipped door's #220 fix.
//
// ONE SCOPE, NOT TWO (lucy cold-review 2026-08-12). The shipped negation door (`governed-emit-negation.ts`
// gate 1) checks caller-absence AND hole-absence against the SAME single `scope`. An earlier cut of this
// oracle borrowed the dependency oracle's `{sourceScope, worldScope}` split, which re-opened a false-`proven`
// channel: a hole under `sourceScope` but OUTSIDE an under-sized `worldScope` escaped the completeness check.
// A negation is scoped to ONE region S: to prove "nothing in S references B" soundly you must check for holes
// in exactly S — no wider, no narrower. So this oracle takes a SINGLE `scope`, matching the door by
// construction and closing the gap: the caller cannot pass a completeness world that fails to cover the
// absence it claims.
//
// `underScope`/`anyInScope` come from the shared `scope-predicate.ts` (one transcription for the whole PROVEN
// family). `pathOfHash` and `isLocal` are supplied by the CALLER, as `verifyDependency` requires them (see
// `packages/adapter-io/src/verify-fact-source.ts`, `createVerifyFactLeg`).

import type { Hash } from "@atlas/contracts"
import type { SymbolReverseApi } from "@atlas/index"
import { anyInScope } from "./scope-predicate.js"

/** One "NO unit under `scope` references global symbol `target`" claim. A SINGLE scope: the region the
 *  negation ranges over is exactly the region whose completeness (hole-freeness) must be checked to prove it —
 *  matching the shipped door's single-scope gate. No separate `worldScope` (which could be under-sized and
 *  admit a false `proven` — lucy cold-review). */
export type NegationClaim = {
  readonly scope: string
  readonly target: string
}

/** PROVE / REFUTE / ABSTAIN — the negation oracle's verdict. Unlike the dependency oracle's `FactVerdict`
 *  (which has NO `refuted`, because there a refute would be the unsound closed-world direction), THIS oracle
 *  emits `refuted` as its SOUND, any-world direction (a witnessed counterexample caller). `oracle` stays
 *  `'symbol-reverse'`: it is the same feed answering an absence question, not a second decision-maker. */
export type NegationVerdict = {
  readonly verdict: "proven" | "refuted" | "abstain"
  readonly reason?: string
  readonly oracle: "symbol-reverse"
}

const abstain = (reason: string): NegationVerdict => ({ verdict: "abstain", reason, oracle: "symbol-reverse" })

/**
 * PROVE / REFUTE / ABSTAIN on the negation `claim`, over the live `reverse` feed (`SymbolReverseApi`,
 * @atlas/index). PURE + TOTAL: no IO, no clock, never throws. The ladder (single scope S):
 *
 *   0. malformed (`target`/`scope` any empty) ⇒ abstain('malformed').
 *   1. `isLocal(target)` (a `local ` SCIP symbol — document-scoped, #99b v1 scope) ⇒ abstain('target-not-global').
 *   2. `!reverse.resolves(target)` (#220 — a PHANTOM: `reverseCallers` is `[]` by construction, so "no caller"
 *      would VACUOUSLY prove the negation) ⇒ abstain('target-unresolvable').
 *   3. a real caller of `target` lies under `scope` ⇒ REFUTED — a witnessed counterexample, SOUND IN ANY
 *      WORLD (no closed-world requirement; the negation is simply false).
 *   4. no caller under `scope`, AND a hole lies under THAT SAME `scope` — an `unresolved` hole
 *      (`holeSources()`) OR a COLLAPSED cross-package ref (`opaqueRefSources()`, #99) ⇒ abstain('scope-open')
 *      — an unseen reference could exist inside S, so the absence cannot be trusted.
 *   5. no caller under `scope`, AND S is hole-free ⇒ PROVEN — a sound closed-world negative over S.
 */
export function verifyNegation(
  claim: NegationClaim,
  reverse: SymbolReverseApi,
  pathOfHash: (h: Hash) => string | undefined,
  isLocal: (sym: string) => boolean,
): NegationVerdict {
  const { scope, target } = claim
  if (target.length === 0 || scope.length === 0) return abstain("malformed")
  if (isLocal(target)) return abstain("target-not-global")
  if (!reverse.resolves(target)) return abstain("target-unresolvable")

  // REFUTE: a witnessed caller under scope is a positive existence — sound in ANY world, no closed-world
  // test. The negation is false.
  if (anyInScope(reverse.reverseCallers(target), pathOfHash, scope)) {
    return { verdict: "refuted", oracle: "symbol-reverse" }
  }

  // No caller witnessed under scope. PROVING the absence is closed-world OVER THAT SAME SCOPE: a hole under S
  // could be an unseen caller of target. Checking holes in exactly S (not a separate, possibly under-sized
  // world) is what makes `proven` sound by construction — see the module header.
  // The completeness holes are the UNION of two classes: CLASS-1 the benign external `unresolved` holes
  // (`holeSources()`) AND CLASS-2 the COLLAPSED cross-package refs (`opaqueRefSources()`, #99) — a `local `
  // ref the indexer emitted for a cross-package call, whose real target vanished from `reverseCallers`. Either
  // one inside S means an unseen reference could exist there, so the closed-world `proven` is unsound.
  if (
    anyInScope(reverse.holeSources(), pathOfHash, scope) ||
    anyInScope(reverse.opaqueRefSources(), pathOfHash, scope)
  ) {
    return abstain("scope-open")
  }
  return { verdict: "proven", oracle: "symbol-reverse" }
}
