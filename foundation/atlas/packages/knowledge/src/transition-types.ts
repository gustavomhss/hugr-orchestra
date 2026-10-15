// @atlas/knowledge — src/transition-types.ts  (ADR-0015 D4 · #234 — the 2-rev transition data model)
//
// EXTRACTED from `types.ts` at the 400-LOC godfile ceiling along a cohesive boundary (the #234 transition
// shape is its own concern), EXACTLY as `negation-types.ts` was extracted on the sibling #99b leg. RE-EXPORTED
// by `types.ts` (`export type { TransitionNode }`) so the package surface — `import type { TransitionNode }
// from '@atlas/knowledge'` — is byte-identical to having declared it inline. `Seal`/`ObviousnessScore` stay
// owned by `types.ts` and are imported here (a type-only cycle, erased at runtime). See
// docs/design/234-transition-design.md.
//
// WHAT A TRANSITION IS, AND WHY IT IS THE OTHER ADVISORY-CLASS SIBLING OF THE NEGATION (ADR-0015 D4, L107-110):
// a transition is an IMMUTABLE ADVISORY HISTORICAL record — "unit returned A, now returns B" — spanning TWO
// revisions, anchored to the rev-pair `{unit@shaBefore, unit@shaAfter}`. It was true and STAYS true (a closed
// valid-time interval, the Datomic/bitemporal lesson): it is NEVER re-checked for truth at HEAD, and it is
// SUPERSEDED — not falsified — by a later transition on the SAME unit lineage. There is NO mechanical HEAD
// oracle for it, so it carries NO `check` (like a negation/relation) and it is SEALED `justified`, never
// `proven` (D-T1) — the seal names the ground (a model read both rev bodies and derived the change), and the
// contestable `derivation` travels with it, exactly the `justified` semantics genesis-epistemic-contract.md
// §JUSTIFIED gives every advisory-class fact.
//
// IDENTITY vs FRESHNESS, made concrete (D-T2):
//   - `unitKey` + `shaBefore` + `shaAfter` are the IDENTITY legs. They feed `transitionKey = hash({trn, u, b,
//     a})` (transition-key.ts) — DIRECTED (before→after is not after→before) and refusing `shaBefore ===
//     shaAfter` (a rev-pair that spans no interval is not a transition). Identity is the exact unit-LINEAGE:
//     the SAME `unitKey` across the two revs. A move/rename that changes `unitKey` is OUT OF SCOPE (D-T4, an
//     honest limit — the two ends are NOT reconciled, never silently linked).
//   - `grounding.entries` carries EXACTLY TWO entries — entry[0] anchors `unit@shaBefore`, entry[1] anchors
//     `unit@shaAfter`, each with that rev's `subtreeHash`. Both are CONTENT-ADDRESSED. Unlike a relation
//     (whose AND-fold re-checks BOTH endpoints at HEAD), a transition's freshness is STAMPED AT EMIT and NEVER
//     RE-CHECKED: a transition about two PAST revs would AND-fold to DRIFTED against every future HEAD, which
//     is meaningless for a historical record. `reverify-store` already skips it (its seal gate admits only
//     `proven`, and a transition is `justified`) — so NO transition branch is added there, by design.
//
// SUPERSESSION, NOT DRIFT (D-T3): a later transition on the same `unitKey` lineage supersedes an earlier one.
// Two transitions on the same unit but DIFFERENT sha-pairs are DISTINCT nodes (distinct `transitionKey`s), both
// RETAINED; the lineage's HEAD is the transition whose `shaAfter` is no other transition's `shaBefore`, and the
// predecessors read back as SUPERSEDED (a derive-on-read verdict over the lineage — see read/transitions.ts).

import type { Tier, NodeKey } from "@atlas/contracts"
import type { ClaimEntry } from "@atlas/kernel"
import type { Grounding } from "@atlas/grounding"
import type { KnowledgeFreshness, ObviousnessScore, Seal } from "./types.js"

/**
 * A 2-rev grounded TRANSITION (ADR-0015 D4, #234 — "unit returned A, now returns B"). Structurally the OTHER
 * advisory-class sibling of `NegationNode`/`RelationNode` — no `check`, so no predicate lifecycle — carrying a
 * unit lineage + the rev-pair it spans. An IMMUTABLE ADVISORY HISTORICAL record: never a live predicate, sealed
 * `justified` (never `proven`, D-T1), superseded not falsified (D-T3). See the module header + D4 (L107-110).
 */
export interface TransitionNode {
  readonly kind: "transition"
  readonly id: NodeKey // = transitionKey(unitKey, shaBefore, shaAfter) (transition-key.ts); MINTED, never trusted from the payload
  readonly tier: Tier
  readonly unitKey: string // the LOCATION-FREE unit lineage (qualifiedPath) — the identity leg the two revs share
  readonly shaBefore: string // the BEFORE revision's content hash of the unit — identity leg (the interval's open end)
  readonly shaAfter: string //  the AFTER revision's content hash of the unit — identity leg (the interval's close)
  readonly grounding: Grounding // EXACTLY two entries: [0] anchors unit@shaBefore, [1] anchors unit@shaAfter (stamped at emit, never re-checked — D-T2)
  readonly freshness: KnowledgeFreshness // STAMPED AT EMIT (D-T2) — a historical record is not re-derived against HEAD
  readonly claims: readonly ClaimEntry[]
  readonly authoring: "TRANSITIONED" | "SUPERSEDED" // minted 'TRANSITIONED'; the lineage HEAD/predecessor verdict is derive-on-read (D-T3)
  readonly seal?: Seal // ADR-0017 — ALWAYS 'justified' on a minted transition (D-T1); additive/absent-tolerant like the sibling families
  readonly derivation?: string // the contestable grounds the seal names (proven-vs-justified.md §JUSTIFIED) — the change the model read across the two rev bodies
  readonly scope?: string // KNOW-11a — the write/authz scope; additive/absent-tolerant (see AdvisoryNode)
  readonly obviousness?: ObviousnessScore // ADR-0012 — additive, absent-tolerant (see AdvisoryNode)
}
