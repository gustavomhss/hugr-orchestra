// @atlas/knowledge — src/negation-types.ts  (ADR-0015 D3 · #99b — the scoped-negative data model)
//
// EXTRACTED from `types.ts` at the 400-LOC godfile ceiling along a cohesive boundary (the #99b negation
// shapes are their own concern), exactly as `relation-key.ts` was extracted from `router.ts` at the same
// ceiling on the sibling #99a leg. RE-EXPORTED by `types.ts` (`export type { NegationNode, AbstainedRecord }`)
// so the package surface — `import type { NegationNode } from '@atlas/knowledge'` — is byte-identical to
// having declared them inline. `RelationKind`/`ObviousnessScore` stay owned by `types.ts` and are imported
// here (a type-only cycle, erased at runtime). `Seal` (ADR-0017) is imported the same way. See
// docs/design/99b-negation-fact-contract.md §1.

import type { Tier, NodeKey } from "@atlas/contracts"
import type { ClaimEntry } from "@atlas/kernel"
import type { Grounding } from "@atlas/grounding"
import type { KnowledgeFreshness, RelationKind, ObviousnessScore, Seal } from "./types.js"

/**
 * A SCOPED grounded NEGATIVE (ADR-0015 D3, #99b — "the honesty core"). Structurally a sibling of
 * `RelationNode` — no `check`, so no predicate lifecycle — asserting `¬∃` over a relation within a
 * CLOSED scope: "within scope S under edge-model E, no `relationKind`-edge targets X was found". A
 * closed-world negative is sound ONLY if the negated relation was computed COMPLETELY over S, so the
 * groundable form is the scoped positive that carries its own completeness proof (§0).
 *
 * IDENTITY vs FRESHNESS, made concrete (why `scope` is an identity leg):
 *   - `relationKind` + `target` (the location-free GLOBAL symbol key X the negative is ABOUT, ¬∃·→X)
 *     + `scope` (the CLOSED scope S, a DIRECTORY key) are the identity legs. They feed
 *     `negationKey = hash({neg, t, s})` (negation-key.ts) — NOT `deepestCommonUnit`. `(¬calls, X)` in
 *     scope `src/payments` is a DIFFERENT fact than in scope `src/`: the negative is only as strong as
 *     the scope it was proven closed over (§1). Two negations over the same (kind, X) at different
 *     scopes are distinct nodes. A pure edit does not change them.
 *   - `grounding` carries EXACTLY ONE entry anchored at the scope directory:
 *     `{ kind:'directory', qualifiedPath: S, subtreeHash: <S's folded hash at emit> }`. That folded
 *     hash IS the insertion-sensitive scope Merkle (§3): `driftDetect` (drift.ts) rides VERBATIM —
 *     a NEW caller of X entering S (a new file, or an edit to an in-S file) moves the named-child set
 *     ⇒ the dir hash moves ⇒ DRIFTED. Identity (target+scope) is SPLIT from freshness (the directory
 *     subtreeHash), the whole point of D3's "insertion-sensitivity a per-unit hash lacks".
 *   - `edgeModel` is the `IndexerPlan.version` at emit — the ONE completeness clause `driftDetect`
 *     CANNOT see (an extractor upgrade changes no file bytes). It rides as this explicit field. HONEST STATUS
 *     (billy F1, 2026-08-10): the conjunct `edgeModel === currentEdgeModel` is STAMPED at emit but NOT YET
 *     ENFORCED — no freshness path reads it; enforcement is a named N4 DoD (reconcile/doctor, §6). Until
 *     wired, a negation is sound only under a FIXED edge model. (freshness never re-runs `reverseCallers`.)
 */
export interface NegationNode {
  readonly kind: "negation"
  readonly id: NodeKey // = negationKey (negation-key.ts); MINTED, never trusted from the payload
  readonly tier: Tier
  readonly relationKind: RelationKind // the NEGATED relation (reuse #99a's closed 'depends-on'|'calls')
  readonly target: string // the location-free GLOBAL symbol key X the negative is ABOUT (¬∃ · →X) — identity leg
  readonly scope: string // the CLOSED scope S (a DIRECTORY key) the witness ranges over — identity leg
  readonly grounding: Grounding // ONE entry anchored at S; its subtreeHash IS the scope Merkle (§3 — DECIDED)
  readonly edgeModel: string // the IndexerPlan.version at emit — the ONE witness clause the oracle can't see (§3)
  readonly freshness: KnowledgeFreshness
  readonly claims: readonly ClaimEntry[]
  readonly authoring: "NEGATED" | "SUPERSEDED"
  readonly obviousness?: ObviousnessScore // ADR-0012 — additive, absent-tolerant (see AdvisoryNode)
  readonly seal?: Seal // ADR-0017 — two-seal provenance, additive/absent-tolerant (see AdvisoryNode)
  /**
   * THE AUTHZ SCOPE (F3 — WP-96-N, owner-ratified 2026-08-11, amends #99b/ADR-0015 D3). ADDITIVE + OPTIONAL.
   * The scope the DOOR's authz gate binds instead of the witness `scope`, when present. It is NEVER an
   * identity leg: `negationKey` is `(relationKind, target, scope)` over the WITNESS directory and does NOT
   * read this field, so two negations differing only in `authzScope` are the SAME node. It is also NOT read
   * by the honest-abstention law (scope-open / target-not-global / scope-empty / target-unresolvable), which operates on the
   * witness `scope` — the assertion is still ABOUT that scope.
   *   - ABSENT ⇒ authz binds the witness `scope` EXACTLY as before (human-emitted negations UNCHANGED, the
   *     back-compat floor: an `atlas emit --negation` over `src/pay` still needs authority over `src/pay`).
   *   - PRESENT ⇒ authz binds `authzScope`. This is what lets a MINED negation carry its WITNESS directory as
   *     identity (so it is the real, groundable scoped-negative) while being authorized by the orchestrator's
   *     `atlas:mined` grant — the split #99b's single-scope shape could not express (a miner holds no
   *     authority over an arbitrary source directory it happened to prove closed).
   */
  readonly authzScope?: string
}

/**
 * The explicit honest-abstention record (owner-ratified 2026-08-10, closes #202's 0/300 abstentions).
 * NOT a `GroundedFact` — it asserts NOTHING about the world; it records that the door was ASKED a
 * negative it could not soundly DECIDE, and WHY. A durable, read-back SIBLING record (the door emits
 * it, N2), so "abstention FIRED" is observable rather than a silent fail-closed refusal.
 *
 * It reuses the SAME `negationKey` address the negation WOULD take, so a later successful negation at
 * the same question SUPERSEDES the abstention on the shared address (the honest lifecycle: "couldn't
 * decide" → later "decided false", handled at the door, not by routing). `reason` is a CLOSED set of
 * WHY-it-could-not-decide causes; `witness.underApproxSources` names the unresolved/dynamic edges that
 * left the scope OPEN (the completeness hole), so the abstention carries its own evidence.
 */
export interface AbstainedRecord {
  readonly kind: "abstained"
  readonly id: NodeKey // = negationKey(the refused question) — the same address the negation WOULD take
  readonly relationKind: RelationKind
  readonly target: string
  readonly scope: string
  // WHY it could not decide (closed set). `target-unresolvable` (#220): the target is a global symbol Atlas
  // cannot SEE defined, so "it is not called in S" would be VACUOUSLY true — the door abstains instead of
  // grounding a negative about a phantom. Distinct from `target-not-global` (a syntactically `local ` symbol).
  //   ADR-0016 (#99, target-relative completeness) adds two v2 causes — the TWO closure legs the target-relative
  //   gate proves, each abstained (durable) rather than silently dropped when it cannot be proven:
  //     · `escape-open`   — the TARGET X ESCAPES: some reference of X sits in a non-safe syntactic position
  //       (argument, assignment RHS, collection element, member/subscript base, the operand of `X as T`), so
  //       X flows into shared mutable state where a scope that never imports X could still reach it at runtime.
  //       The index under-sees X ⇒ "uncalled in S" is not provable. `witness.underApproxSources` = the escape sites.
  //     · `scope-dynamic` — the SCOPE S has an opaque runtime channel (`import(nonliteral)` | `require(nonliteral)`
  //       | `ns[nonliteral]` on a namespace-import binding | `eval` | `new Function`) that could reach X with no
  //       emitted occurrence. `witness.underApproxSources` = the offending channels. Conservative abstain.
  //   Both REPLACE the canon blanket `scope-open` on the target-relative path; `scope-open` remains the fallback
  //   (machinery absent) — see docs/adr/ADR-0016-*.
  readonly reason:
    | "scope-open"
    | "target-not-global"
    | "scope-empty"
    | "target-unresolvable"
    | "escape-open"
    | "scope-dynamic"
  readonly witness: { readonly underApproxSources: readonly string[] } // the unresolved/dynamic edges that opened S
}
