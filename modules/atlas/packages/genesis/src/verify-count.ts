// @atlas/genesis — src/verify-count.ts  (spike/verify-fact — the COUNT class of the PROVEN fact family)
//
// A PURE, TOTAL oracle: PROVE or ABSTAIN on a "global symbol B is referenced by AT LEAST N distinct units
// under scope A" claim, riding the SAME live `SymbolReverseApi` mechanics the dependency oracle
// (`verify-fact.ts`) and the negation door use. This is the CARDINALITY dual of `verifyDependency`:
// dependency asks "is the caller set ∩ scope NON-EMPTY"; count asks "is its CARDINALITY ≥ N".
//
// WHY A LOWER BOUND IS THE ONLY SOUND POSITIVE COUNT. An incomplete index can never FABRICATE a caller (a
// reference occurrence in the SCIP feed is a witnessed fact), so the number of DISTINCT referencing units it
// reports under a scope is a sound LOWER BOUND on the true number: `witnessed ≤ truth`. Therefore
// `truth ≥ N` is proven the instant `witnessed ≥ N`. An EXACT count (`truth == N`) is a closed-world claim —
// it is only sound when the index has NO unresolved/dynamic reference in the world it ranges over
// (`holeSources() ∩ worldScope == ∅`), because any hole could be an unseen (N+1)-th caller. So:
//   - the claim is a LOWER BOUND (`atLeast`, the default) ⇒ proven on `witnessed ≥ atLeast`, sound in ANY
//     world — no `holeSources` check needed (a witnessed cardinality needs no completeness proof to bound
//     from below, exactly as the dependency oracle's existence branch needs none).
//   - the claim is EXACT (`exact: true`) ⇒ proven only when `witnessed === atLeast` AND the world is closed
//     (`holeSources() ∩ worldScope == ∅`); a hole in the world ⇒ abstain('scope-open'), never a false exact.
// There is deliberately NO refute (mirroring `FactVerdict`): "fewer than N" is a closed-world ABSENCE the
// cross-package SCIP feed cannot guarantee (the #189 family), so a shortfall ABSTAINS, never refutes.
//
// The count is over DISTINCT referencing UNITS (docHashes from `reverseCallers`, already deduped), NOT over
// reference-occurrence sites — the frozen `ScipOccurrence` projection carries no per-occurrence multiplicity,
// so "N callers" means "N distinct files/units", the granularity `reverseCallers` reports. `underScope` /
// `countInScope` live in the shared `scope-predicate.ts` (one transcription for the whole family). `pathOfHash`
// and `isLocal` are supplied by the CALLER exactly as `verifyDependency` requires them (see
// `packages/adapter-io/src/verify-fact-source.ts`, `createVerifyFactLeg`).

import type { Hash } from "@atlas/contracts"
import type { SymbolReverseApi } from "@atlas/index"
import type { FactVerdict } from "./verify-fact.js"
import { countInScope, anyInScope } from "./scope-predicate.js"

/** One "global symbol B is referenced by ≥ `atLeast` distinct units under `sourceScope`" claim. `atLeast`
 *  is the asserted lower bound (a positive integer). `exact: true` upgrades the claim to "EXACTLY `atLeast`"
 *  — provable only in a closed world. `worldScope` is the directory the completeness check ranges over
 *  (used only by the exact-mode closed-world test / the diagnostic reason); it mirrors `DepClaim`. */
export type CountClaim = {
  readonly sourceScope: string
  readonly target: string
  readonly atLeast: number
  readonly worldScope: string
  readonly exact?: boolean
}

/** Reuses `verify-fact.ts`'s `FactVerdict` verbatim — the count oracle is the SAME `symbol-reverse` oracle
 *  answering a cardinality question, never a second decision-maker with its own verdict vocabulary. */
const abstain = (reason: string): FactVerdict => ({ verdict: "abstain", reason, oracle: "symbol-reverse" })

/** `n` is a POSITIVE INTEGER (≥ 1). A count claim of 0 is vacuous ("≥ 0 callers" holds for every symbol,
 *  including a phantom) and is rejected as malformed — the oracle grounds a real cardinality, never a
 *  tautology. NaN / Infinity / fractional / negative all fail this. */
const isPositiveInt = (n: number): boolean => Number.isInteger(n) && n >= 1

/**
 * PROVE/ABSTAIN on `claim`, over the live `reverse` feed (`SymbolReverseApi`, @atlas/index) — the CARDINALITY
 * dual of `verifyDependency`. PURE + TOTAL: no IO, no clock, never throws. The guard ladder is the dependency
 * oracle's, verbatim through step 2, so a target that oracle would abstain on this one abstains on identically:
 *
 *   0. malformed (`target`/`sourceScope`/`worldScope` any empty, or `atLeast` not a positive integer)
 *      ⇒ abstain('malformed').
 *   1. `isLocal(target)` (a `local ` SCIP symbol — document-scoped, #99b v1 scope) ⇒ abstain('target-not-global').
 *   2. `!reverse.resolves(target)` (#220 — no in-index DEFINITION, a PHANTOM: no count about it is groundable)
 *      ⇒ abstain('target-unresolvable').
 *   3. let `witnessed = |reverseCallers(target) ∩ sourceScope|` (distinct units).
 *      - LOWER-BOUND mode (default): `witnessed ≥ atLeast` ⇒ proven — SOUND IN ANY WORLD (a witnessed
 *        cardinality bounds the truth from below with no completeness proof). Else ⇒ abstain('below-witnessed-bound').
 *      - EXACT mode (`exact: true`): the world must be CLOSED — `holeSources() ∩ worldScope == ∅`; a hole in
 *        the world ⇒ abstain('scope-open'). With the world closed: `witnessed === atLeast` ⇒ proven; else
 *        ⇒ abstain('exact-count-mismatch').
 */
export function verifyCount(
  claim: CountClaim,
  reverse: SymbolReverseApi,
  pathOfHash: (h: Hash) => string | undefined,
  isLocal: (sym: string) => boolean,
): FactVerdict {
  const { sourceScope, target, worldScope, atLeast, exact = false } = claim
  if (target.length === 0 || sourceScope.length === 0 || worldScope.length === 0) return abstain("malformed")
  if (!isPositiveInt(atLeast)) return abstain("malformed")
  if (isLocal(target)) return abstain("target-not-global")
  if (!reverse.resolves(target)) return abstain("target-unresolvable")

  const witnessed = countInScope(reverse.reverseCallers(target), pathOfHash, sourceScope)

  if (!exact) {
    // Lower bound: a witnessed cardinality bounds the truth from below in ANY world — no closed-world test.
    return witnessed >= atLeast ? { verdict: "proven", oracle: "symbol-reverse" } : abstain("below-witnessed-bound")
  }

  // Exact: an equality is a closed-world claim — a hole in the world could be an unseen (N+1)-th caller.
  if (anyInScope(reverse.holeSources(), pathOfHash, worldScope)) return abstain("scope-open")
  return witnessed === atLeast ? { verdict: "proven", oracle: "symbol-reverse" } : abstain("exact-count-mismatch")
}
