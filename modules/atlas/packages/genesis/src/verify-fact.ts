// @atlas/genesis — src/verify-fact.ts  (spike/verify-fact — the POSITIVE DUAL of the #99b negation door)
//
// A PURE, TOTAL oracle: PROVE or ABSTAIN on a "scope A depends on global symbol B" claim, riding the
// SAME live `SymbolReverseApi` mechanics `governed-emit-negation.ts` (the negation door, @atlas/adapter-io)
// already uses. This is that door's gate-1 logic, restated as its POSITIVE counterpart — TRANSCRIBED, not
// invented:
//   - a POSITIVE existence (`reverseCallers(target) ∩ sourceScope ≠ ∅`) is SOUND IN ANY WORLD — no
//     closed-world requirement, unlike a negative. `proven` therefore needs no `holeSources` check at all;
//     this is the one place the positive dual is CHEAPER than the negation door's admit.
//   - a REFUTATION is deliberately NOT emitted (see `FactVerdict`): it would need a closed-world completeness
//     proof the SCIP feed does not give cross-package (PV-recall 2026-08-12), so an absence is ABSTAINED, not
//     refuted. The `holeSources() ∩ worldScope` test survives only to discriminate the abstain reason.
//   - everything else the negation door abstains on, this door abstains on too (malformed / non-global
//     target / unresolvable target / an open or un-closeable world).
//
// LAYERING NOTE (flagged, NOT invented — the frozen contract said "use the real `underScope`... never a
// string `.includes`" but did not anticipate this): the negation door recovers a docHash's path via
// `indexPathsByHash(axes.spatial, nodeHashOfPath)` (adapter-io/src/governed-emit-negation.ts), walking the
// FULL spatial axis, and its `∩ S` containment is `adapter-io/src/anchor-scope.ts`'s `underScope`.
// `@atlas/genesis` is L8 (ARCHITECTURE.md), strictly BELOW the ring `@atlas/adapter-io` sits in
// (`harness/gates/layer-guard.mjs` ARCH-1/2) — importing `underScope` from adapter-io here would be a
// FORBIDDEN upward edge (genesis may only import from packages strictly below it). So `underScope` is
// TRANSCRIBED verbatim (byte-identical predicate — cite the source, never invent a second one) in the ONE
// shared home `scope-predicate.ts`, imported here as `anyInScope` — a single copy for the whole PROVEN
// family, not one transcription per oracle (see that module's header). `pathOfHash` is supplied by the
// CALLER — see `packages/adapter-io/src/verify-fact-source.ts` (`createVerifyFactLeg`, the production feed
// wired to `atlas verify-fact`), which builds it straight off the SCIP feed's own
// `documents[].relativePath`, provably every hash `SymbolReverseApi` can ever return: `createSymbolReverse`
// mints `nodeHashOfPath(doc.relativePath)` for exactly those documents and no others
// (`packages/index/src/symbol-reverse.ts`), so that is a deliberate MINIMAL-but-COMPLETE restriction of
// `indexPathsByHash`, not an approximation of it.

import type { Hash } from "@atlas/contracts"
import type { RelationKind } from "@atlas/knowledge"
import type { SymbolReverseApi } from "@atlas/index"
import { anyInScope, underScope } from "./scope-predicate.js"

/** One "scope A depends on global symbol B" claim. `worldScope` is the directory the completeness check
 *  ranges over — retained as the `scope-open` diagnostic discriminant. (It formerly gated a REFUTE; that
 *  verdict is suppressed — see `FactVerdict` and step 4 below.) */
export type DepClaim = {
  readonly sourceScope: string
  readonly target: string
  readonly worldScope: string
}

/** The oracle's verdict — PROVE or ABSTAIN, never a throw, never a silent guess. `reason` is present on
 *  `abstain` (the durable-record discriminant, mirroring `AbstainedRecord['reason']`'s shape) and absent on
 *  a `proven` decision.
 *
 *  [SOUND-CONSERVATIVE — PV-recall 2026-08-12] There is deliberately NO `refuted`. A positive `proven` is
 *  a witnessed EXISTENCE — sound under an incomplete index (an index cannot fabricate a caller). A REFUTE
 *  is a closed-world ABSENCE claim, sound only if the completeness feed (`holeSources`) captures ALL
 *  incompleteness. It does NOT cross-package: `scip-typescript` attributes a cross-package reference to a
 *  `dist/*.d.ts` symbol that carries no definition, so a genuine cross-package caller can exist while
 *  `holeSources() ∩ worldScope == ∅` — which would emit a FALSE `refuted`. Rather than gate refute on a
 *  completeness guarantee the feed does not give, this oracle emits ONLY `proven` or `abstain`. Refuting
 *  is not the product goal (admitting TRUE facts is); the capability can return once cross-package SCIP
 *  completeness is established (dist↔src symbol canonicalisation, the #189 family). The SAME mechanism is a
 *  latent risk in the shipped negation door's closed-world ADMIT — flagged separately, not touched here. */
export type FactVerdict = {
  readonly verdict: "proven" | "abstain"
  readonly reason?: string
  readonly oracle: "symbol-reverse"
}

const abstain = (reason: string): FactVerdict => ({ verdict: "abstain", reason, oracle: "symbol-reverse" })

/**
 * PROVE/REFUTE/ABSTAIN on `claim`, over the live `reverse` completeness feed (`SymbolReverseApi`,
 * @atlas/index) — the POSITIVE DUAL of `governed-emit-negation.ts`'s gate-1 (transcribed, not invented; see
 * the module header for the full mapping). PURE + TOTAL: no IO, no clock, never throws.
 *
 *   0. malformed (`target`/`sourceScope`/`worldScope` any empty) ⇒ abstain('malformed').
 *   1. `isLocal(target)` (a `local ` SCIP symbol — document-scoped, its callers are intra-doc, #99b v1
 *      scope) ⇒ abstain('target-not-global').
 *   2. `!reverse.resolves(target)` (#220 — no in-index DEFINITION, a PHANTOM target: neither a positive nor
 *      a negative about it is groundable) ⇒ abstain('target-unresolvable').
 *   3. a real caller of `target` lies under `sourceScope` ⇒ proven — SOUND IN ANY WORLD, no closed-world
 *      requirement (a witnessed existence needs no completeness proof, unlike a negative).
 *   4. else ⇒ abstain — NO caller was witnessed under `sourceScope`. This is NOT a refute (see
 *      `FactVerdict`: cross-package completeness is not guaranteed, so an absence cannot be trusted). The
 *      reason discriminates for diagnostics only: `scope-open` if `worldScope` has an unresolved/dynamic
 *      reference (`holeSources() ∩ worldScope ≠ ∅`), else `no-caller-in-scope`.
 */
export function verifyDependency(
  claim: DepClaim,
  reverse: SymbolReverseApi,
  pathOfHash: (h: Hash) => string | undefined,
  isLocal: (sym: string) => boolean,
): FactVerdict {
  const { sourceScope, target, worldScope } = claim
  if (target.length === 0 || sourceScope.length === 0 || worldScope.length === 0) return abstain("malformed")
  if (isLocal(target)) return abstain("target-not-global")
  if (!reverse.resolves(target)) return abstain("target-unresolvable")

  if (anyInScope(reverse.reverseCallers(target), pathOfHash, sourceScope)) {
    return { verdict: "proven", oracle: "symbol-reverse" }
  }
  // No witnessed caller under sourceScope. NOT a refute (cross-package completeness is not guaranteed —
  // see FactVerdict): abstain either way, the reason is a diagnostic only.
  return abstain(anyInScope(reverse.holeSources(), pathOfHash, worldScope) ? "scope-open" : "no-caller-in-scope")
}

/** One "global symbol B is DEFINED under scope A" claim (#196d). No `worldScope`: a definition is a POSITIVE
 *  WITNESSED EXISTENCE (the def-occurrence lies under the scope), sound in ANY world — there is no
 *  closed-world absence to guard, so no completeness world is carried (`verifyDefinition` never emits the
 *  `scope-open` diagnostic the dependency/count oracles carry `worldScope` for). Mirrors `DepClaim` minus that
 *  leg. */
export type DefClaim = {
  readonly sourceScope: string
  readonly target: string
}

/**
 * PROVE/ABSTAIN on `claim`, over the live `reverse` feed (`SymbolReverseApi`, @atlas/index) — the DEFINITION
 * class of the PROVEN family (#196d). PURE + TOTAL: no IO, no clock, never throws. The guard ladder is the
 * dependency oracle's, verbatim through step 2 (a target that oracle would abstain on this one abstains on
 * identically); the existence branch differs only in WHAT is witnessed:
 *
 *   0. malformed (`target`/`sourceScope` any empty) ⇒ abstain('malformed').
 *   1. `isLocal(target)` (a `local ` SCIP symbol — document-scoped, #189) ⇒ abstain('target-not-global').
 *   2. `!reverse.resolves(target)` (#220 — no in-index DEFINITION, a PHANTOM: nothing is defined to witness)
 *      ⇒ abstain('target-unresolvable').
 *   3. the symbol's first-definition-wins def-occurrence (`definesAt`) lies UNDER `sourceScope` ⇒ proven —
 *      SOUND IN ANY WORLD (a witnessed definition-occurrence needs no completeness proof; an incomplete index
 *      cannot fabricate a definition, exactly as it cannot fabricate a caller). NO closed-world assumption.
 *   4. else ⇒ abstain('def-out-of-scope') — the symbol IS defined in the index (step 2 passed), but its def
 *      lies OUTSIDE `sourceScope` (or its def-doc has no known path — fail-closed). NOT a refute: this is a
 *      scoped non-answer, not a proof the symbol is undefined.
 */
export function verifyDefinition(
  claim: DefClaim,
  reverse: SymbolReverseApi,
  pathOfHash: (h: Hash) => string | undefined,
  isLocal: (sym: string) => boolean,
): FactVerdict {
  const { sourceScope, target } = claim
  if (target.length === 0 || sourceScope.length === 0) return abstain("malformed")
  if (isLocal(target)) return abstain("target-not-global")
  if (!reverse.resolves(target)) return abstain("target-unresolvable")

  const defHash = reverse.definesAt(target) // present by construction once `resolves` is true; kept total either way
  const defPath = defHash === undefined ? undefined : pathOfHash(defHash)
  if (defPath !== undefined && underScope(defPath, sourceScope)) {
    return { verdict: "proven", oracle: "symbol-reverse" }
  }
  // Defined in the index, but not under this scope (or def-doc path unknown — fail-closed). A scoped
  // non-answer, NOT a refutation (the symbol is not proved undefined; it is proved defined ELSEWHERE).
  return abstain("def-out-of-scope")
}

/** One "unit A `relationKind` unit B" claim (#99 sound relation, ADR-0018). No `worldScope`: a proven relation
 *  is a POSITIVE WITNESSED EXISTENCE (a resolved cross-unit reference from endpointA to a definition of `target`
 *  in endpointB), sound in ANY world — there is no closed-world absence to guard, exactly as `DefClaim` carries
 *  no completeness world.
 *
 *  A relation is a unit→unit edge — it has TWO anchors, unlike the dependency oracle's unit→symbol claim (ONE
 *  anchor). So the proof binds BOTH endpoints at FILE granularity, not merely a directory scope:
 *   - `endpointA` is the qualifiedPath of the SUBJECT unit — it must be a REAL REFERRER of `target` (its file
 *     appears in `reverseCallers(target)`), never just some file under `sourceScope` (a directory another file
 *     happens to reference from is NOT this endpoint's edge).
 *   - `endpointB` is the qualifiedPath of the OBJECT unit — its file must be the DEFINER of `target`
 *     (`definesAt(target)`), never merely a wrong-but-existing file.
 *  `sourceScope` remains endpointA's verify-scope leg (retained on the witness/reverify tamper binding); `target`
 *  is the global SCIP symbol under endpointB. Only `'depends-on'` is mechanically provable (F3, §2.3 — SCIP has
 *  no call-role occurrence, so `calls` cannot be proven distinct from a reference). */
export type RelationClaim = {
  readonly relationKind: RelationKind
  readonly target: string
  readonly sourceScope: string
  readonly endpointA: string
  readonly endpointB: string
}

/** The FILE portion of a unit key — endpoints are qualifiedPaths and may carry a `::symbol` structural
 *  refinement (KNOW-15d's `::` join); `pathOfHash` yields the BARE doc path, so strip from the first `::` on so
 *  the two can be compared for equality. (A bare file path — the mechanical projection's own endpoint form,
 *  `relation-derive.ts` — passes through unchanged.) */
const docOf = (x: string): string => x.split("::")[0] ?? x

/**
 * PROVE/ABSTAIN on `claim`, over the live `reverse` feed (`SymbolReverseApi`, @atlas/index) — the RELATION class
 * of the PROVEN family (#99, ADR-0018). PURE + TOTAL: no IO, no clock, never throws. A relation is a unit→unit
 * edge (TWO anchors), so — unlike `verifyDependency`'s directory-scoped unit→symbol existence — the proof BINDS
 * BOTH endpoints to the witnessed edge at FILE granularity; a forged endpoint PAIR (a same-directory referrer, a
 * wrong-but-existing definer) can therefore no longer ride a DIFFERENT true edge in the directory. It keeps the
 * relation-kind gate FIRST because only `depends-on` is provable from the frozen SCIP projection (§2.3:
 * `ScipSymbolRole` has no call-role). NEVER refutes (see `FactVerdict`): an absent/unbound edge is abstained,
 * never a "these do not depend" fact.
 *
 *   0. malformed (`target`/`sourceScope`/`endpointA`/`endpointB` any empty) ⇒ abstain('malformed').
 *   1. `relationKind !== 'depends-on'` (AR-5 — `calls`/any future kind is NOT mechanically provable) ⇒
 *      abstain('relation-kind-not-provable').
 *   2. `isLocal(target)` (a `local ` SCIP symbol — document-scoped, #189) ⇒ abstain('target-not-global').
 *   3. `!reverse.resolves(target)` (#220 — no in-index DEFINITION: a PHANTOM target, and the honest boundary for
 *      a reflection/dynamic-dispatch/cross-language edge whose `to` never resolves — AR-17) ⇒
 *      abstain('target-unresolvable').
 *   4. endpointA is a REAL REFERRER of `target` — its FILE appears in `reverseCallers(target)`. Else ⇒
 *      abstain('endpointA-not-a-referrer'): a same-directory file that references nothing does not re-prove.
 *   5. endpointB is the DEFINER of `target` — `definesAt(target)`'s file equals endpointB's file. Else ⇒
 *      abstain('endpointB-not-the-definer'): a wrong-but-existing object file does not re-prove.
 *   6. BOTH held ⇒ proven — a witnessed cross-unit reference from endpointA to endpointB's definition of
 *      `target`, SOUND IN ANY WORLD (an incomplete index cannot fabricate a referrer or a definition).
 */
export function verifyRelation(
  claim: RelationClaim,
  reverse: SymbolReverseApi,
  pathOfHash: (h: Hash) => string | undefined,
  isLocal: (sym: string) => boolean,
): FactVerdict {
  const { relationKind, target, sourceScope, endpointA, endpointB } = claim
  if (target.length === 0 || sourceScope.length === 0 || endpointA.length === 0 || endpointB.length === 0) {
    return abstain("malformed")
  }
  if (relationKind !== "depends-on") return abstain("relation-kind-not-provable") // AR-5 — calls is not provable
  if (isLocal(target)) return abstain("target-not-global")
  if (!reverse.resolves(target)) return abstain("target-unresolvable") // AR-3/AR-17 — phantom/dynamic/cross-language

  // BINDING 1 — endpointA must be a REAL referrer of `target` at FILE granularity (not merely a file under
  // `sourceScope`; a DIFFERENT file in that directory referencing `target` is not THIS endpoint's edge).
  const docA = docOf(endpointA)
  if (!reverse.reverseCallers(target).some((h) => pathOfHash(h) === docA)) {
    return abstain("endpointA-not-a-referrer")
  }
  // BINDING 2 — endpointB must be the DEFINER of `target` (an existing-but-wrong file is not this edge's object).
  const defHash = reverse.definesAt(target)
  const defPath = defHash === undefined ? undefined : pathOfHash(defHash)
  if (defPath === undefined || defPath !== docOf(endpointB)) {
    return abstain("endpointB-not-the-definer")
  }
  // BOTH endpoints bound to the witnessed edge — a proven cross-unit reference, SOUND IN ANY WORLD. NOT a refute
  // (cross-package completeness is not guaranteed — see FactVerdict). No worldScope leg (a positive needs none).
  return { verdict: "proven", oracle: "symbol-reverse" }
}
