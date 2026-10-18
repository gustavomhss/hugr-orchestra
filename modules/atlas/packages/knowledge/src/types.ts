// @atlas/knowledge — src/types.ts  (frozen data model + co-located API interfaces; zero runtime)
//
// Layer 4 Knowledge-kind shared model: the shared, grounded, project-level truth (GroundedFact = advisory
// | predicate, Candidate, TerritoryView, Check, the closed PredicateSlot vocabulary), plus the co-located
// EvaluatorApi / StoreApi interfaces — both consumed by ≥2 src files (EvaluatorApi by evaluator.ts + the
// store; StoreApi by evaluator.ts/archive.ts/router.ts), so they live here beside the model. Layer-0
// identity vocabulary (Tier/Status/StructRef/Hash/NodeKey), kernel ClaimEntry, grounding Grounding, and
// the index IndexNode are imported, NEVER redefined.

import type { Tier, Status, StructRef, Hash, NodeKey } from "@atlas/contracts"
import type { ClaimEntry } from "@atlas/kernel"
import type { Grounding } from "@atlas/grounding"
import type { IndexNode } from "@atlas/index"
// The #99b scoped-negative shapes are declared in a cohesive sibling (extracted at the godfile ceiling) and
// IMPORTED here so `GroundedFact` can reference `NegationNode`, then RE-EXPORTED below for a byte-identical surface.
import type { NegationNode, AbstainedRecord } from "./negation-types.js"
// The #234 transition shape (ADR-0015 D4) is declared in its own cohesive sibling (same godfile-ceiling
// extraction as negation-types.ts) and IMPORTED here so `GroundedFact` can reference `TransitionNode`, then
// RE-EXPORTED below for a byte-identical surface.
import type { TransitionNode } from "./transition-types.js"
// The #95 test-vacuity shape (ADR-0015 D5) is declared in its own cohesive sibling (same godfile-ceiling
// extraction as negation-types.ts/transition-types.ts) and IMPORTED here so `GroundedFact` can reference
// `TestVacuityNode`, then RE-EXPORTED below for a byte-identical surface.
import type { TestVacuityNode, TestVacuityWitness, TestVacuityShape } from "./test-vacuity-types.js"

/**
 * The Knowledge freshness vocabulary. Transcribed from atlas-knowledge:29 — `Freshness = 'FRESH' |
 * 'DRIFTED'`.
 *
 * [FLAG — deliberate DISTINCT type, do not conflate] @atlas/contracts owns the CANONICAL 3-state
 * `Freshness = 'FRESH' | 'DRIFTED' | 'STALE'` (the grounding oracle, where `STALE` is advisory drift —
 * non-blocking, served-with-flag; GROUND-13). The Knowledge node carries the 2-state variant (no
 * `STALE`): a Knowledge fact is either FRESH or DRIFTED. To avoid REDEFINING the contracts type name
 * with a narrower body, the 2-state variant is transcribed under the distinct name
 * `KnowledgeFreshness` — same discipline the ratified skeleton applied to `TerritoryView`/
 * `ClaimProvenance`. Flagged for the two references (atlas-knowledge:29 vs contracts) to reconcile.
 */
export type KnowledgeFreshness = "FRESH" | "DRIFTED"

/**
 * The provenance receipt on a claim. Transcribed EXACTLY from atlas-knowledge:27 —
 *   `Provenance = { source, trusted: boolean, sha? }`  — untrusted → advisory, excluded from the gate.
 *
 * Named `ClaimProvenance` (NOT `Provenance`) per the LEAD-RATIFIED decision: `Provenance` is
 * @atlas/persist's per-agent metering type; the Knowledge claim-receipt is a distinct type.
 *
 * [PINNED — oracle-pin-map §Non-decisions] The reference names `source` with no concrete type (a
 * provenance origin — a URL / commit / agent id); pinned to `string` (the honest nominal form), NOT a
 * new exported type. Under `exactOptionalPropertyTypes`, `sha?` is genuinely absent-or-string.
 */
export interface ClaimProvenance {
  readonly source: string // PINNED → string (provenance origin nominal form)
  readonly trusted: boolean
  readonly sha?: string
}

/**
 * A predicate's mechanical `check` (KNOW-16, atlas-knowledge:66). RATIFIED oracle-pin (oracle-pin-map §1,
 * cross-cutting DEFINE): KNOW-16's two named legs — "a deterministic index-query OR a pinned declarative
 * assertion". A tagged union; both legs named by the reference. Consumers (the evaluator, `normalize`
 * into `nodeKey`) treat it opaquely — minimal, no speculative fields.
 */
export type Check =
  | { readonly kind: "index-query"; readonly query: string }
  | { readonly kind: "assertion"; readonly expr: string }

/**
 * The Knowledge node — the content kinds of the Atlas. Transcribed from atlas-knowledge:19
 * (`GroundedFact = AdvisoryNode | PredicateNode`) and WIDENED by ADR-0015 D2 (#99a) with the THIRD shape,
 * `RelationNode` — a 2-ended grounded fact. A discriminated union on `kind`.
 *
 * [ADR-0015 D2 — #99a] A relation ("X depends-on Z") spans TWO structural units, generally in different
 * files. It gets its OWN identity (`relationKey`, the ordered endpoint pair — router.ts) because the
 * intrinsic identity (`nodeKey → deepestCommonUnit`) refuses a cross-file grounding by design (#103's
 * wildcard fix). Its FRESHNESS is the UNCHANGED oracle: a relation grounds TWO entries (both endpoints) and
 * `driftDetect` already AND-folds every entry (drift-if-either) — GROUND-1/5 verbatim. Identity (the
 * location-free `endpointA`/`endpointB` unitKeys) is SPLIT from freshness (the entries' `subtreeHash`), so a
 * pure edit drifts the relation WITHOUT orphaning it. See docs/design/99a-relation-fact-contract.md.
 *
 * [ADR-0015 D3 — #99b] WIDENED to a FOURTH variant, `NegationNode` — a scoped grounded NEGATIVE, sibling
 * of `RelationNode` (advisory-CLASS, no `check`). `AbstainedRecord` (below) is its honest-abstention
 * sibling and is deliberately NOT in this union — it asserts nothing about the world. See
 * docs/design/99b-negation-fact-contract.md.
 *
 * [ADR-0015 D4 — #234] WIDENED to a FIFTH variant, `TransitionNode` — a 2-rev IMMUTABLE ADVISORY HISTORICAL
 * record ("unit returned A, now returns B"), the OTHER advisory-class sibling (no `check`). Unlike the four
 * live-predicate/oracle shapes it is NEVER re-checked at HEAD (a closed valid-time interval) and is SEALED
 * `justified`, never `proven` (D-T1); it is SUPERSEDED, not falsified, by a later transition on the same unit
 * lineage (D-T3). See docs/design/234-transition-design.md.
 *
 * [ADR-0015 D5 — #95] WIDENED to a SIXTH variant, `TestVacuityNode` — a single-anchor PROVEN AST-shape fact
 * ("named test T in unit U asserts only inside catch"), the single-anchor sibling of the sound arm. Like the
 * relation/negation/transition shapes it carries NO `check` (its oracle is tree-sitter, not SCIP), but unlike
 * a transition it HAS a mechanical HEAD oracle (`scanTestVacuity`), so it is SEALED `proven` (never
 * `justified`) and carries a re-runnable `witness`, exactly as a proven `depends-on` relation does. Identity
 * is the (unitKey, testName) pair. See docs/design/95-test-vacuity-design.md.
 */
export type GroundedFact = AdvisoryNode | PredicateNode | RelationNode | NegationNode | TransitionNode | TestVacuityNode

/**
 * The closed relation vocabulary (NORMATIVE, additive-only — a new kind is a `cv` bump, exactly like the
 * `PredicateSlot` vocabulary). DIRECTED: `endpointA <relationKind> endpointB` reads left-to-right, so
 * `(A, depends-on, B) ≠ (B, depends-on, A)`. Seeded minimal + honest — only the kinds Atlas can GROUND from
 * index state today (the dependency axis). These are the frontier's high-value facts a comment gestures at
 * but never grounds (ADR-0015 §Honesty).
 *
 * [ADR-0015 letter-correction] ADR-0015 D2 said "reuse the index `EdgeKind`". Read against the code,
 * `@atlas/index`'s `EdgeKind = 'resolved' | 'unresolved' | 'dynamic'` is edge-RESOLUTION status, not relation
 * SEMANTICS — reusing it would type a relation by how confidently the extractor resolved it, not by what the
 * relation IS. The ADR is right in spirit (a relation is a typed tuple) and wrong in the letter of which enum;
 * corrected here to a semantic vocabulary. The dependency axis remains the drift/witness SOURCE.
 */
export type RelationKind =
  | "depends-on" // A's unit references/imports B's unit (a grounded dependency-axis edge)
  | "calls" // A's body calls B (a resolved call edge)

/**
 * A 2-ended grounded fact (ADR-0015 D2, #99a). Structurally a sibling of `AdvisoryNode` — no `check`, so no
 * predicate lifecycle — but carrying TWO endpoints and a `relationKind` instead of a single anchor + claim.
 *
 * IDENTITY vs FRESHNESS, made concrete (the Kythe/SCIP lesson):
 *   - `endpointA` / `endpointB` are the LOCATION-FREE identity legs (the units' `qualifiedPath`s). They feed
 *     `relationKey = hash(endpointA ‖ relationKind ‖ endpointB)` (router.ts) — NOT `deepestCommonUnit`, which
 *     would collapse a cross-file pair to the empty wildcard anchor (#103). A pure edit does not change them.
 *   - `grounding.entries` carries EXACTLY TWO entries — entry[0] anchors A, entry[1] anchors B — each with its
 *     unit's `subtreeHash`. These are the FRESHNESS legs: `driftDetect` (drift.ts) AND-folds both, so the
 *     relation reads DRIFTED iff EITHER endpoint's bytes changed, and FRESH iff both still match. Reused
 *     verbatim — the whole point of D2 is that the multi-entry AND-fold already existed (the deferred GAP-1).
 */
export interface RelationNode {
  readonly kind: "relation"
  readonly id: NodeKey // = relationKey (router.ts); MINTED, never trusted from the payload
  readonly tier: Tier
  readonly relationKind: RelationKind
  readonly endpointA: string // location-free unitKey (qualifiedPath of A's anchor) — identity leg, subject
  readonly endpointB: string // location-free unitKey (qualifiedPath of B's anchor) — identity leg, object
  readonly grounding: Grounding // EXACTLY two entries: [0] anchors A, [1] anchors B (freshness, AND-folded)
  readonly freshness: KnowledgeFreshness
  readonly claims: readonly ClaimEntry[]
  readonly authoring: "RELATED" | "SUPERSEDED"
  readonly scope?: string // KNOW-11a — the write scope (authz); the 2.1 anchor gate binds on `endpointA`
  readonly obviousness?: ObviousnessScore // ADR-0012 — additive, absent-tolerant (see AdvisoryNode)
  readonly seal?: Seal // ADR-0017 — two-seal provenance, additive/absent-tolerant (see AdvisoryNode)
  readonly witness?: RelationWitness // #99 ADR-0018 — the `proven` relation's re-runnable derivation (see RelationWitness). ADDITIVE + absent-tolerant.
}

// The #99b scoped-negative shapes (ADR-0015 D3) — `NegationNode` (the FOURTH `GroundedFact` variant) and its
// honest-abstention sibling `AbstainedRecord` (NOT in the union) — are DECLARED in `negation-types.ts`
// (imported above) and RE-EXPORTED here so the package surface is byte-identical to an inline declaration.
// They were extracted at the 400-LOC godfile ceiling along a cohesive boundary, exactly as `relation-key.ts`
// split from `router.ts` on the sibling #99a leg. `RelationKind`/`ObviousnessScore` stay owned HERE.
export type { NegationNode, AbstainedRecord }

// The #234 transition shape (ADR-0015 D4) — `TransitionNode` (the FIFTH `GroundedFact` variant) — is DECLARED
// in `transition-types.ts` (imported above) and RE-EXPORTED here so the package surface is byte-identical to an
// inline declaration, exactly as `negation-types.ts` is on the sibling #99b leg. `Seal`/`ObviousnessScore`
// stay owned HERE and are imported by that module (a type-only cycle, erased at runtime).
export type { TransitionNode }

// The #95 test-vacuity shape (ADR-0015 D5) — `TestVacuityNode` (the SIXTH `GroundedFact` variant), its
// `TestVacuityWitness` (the seal's re-runnable derivation) and `TestVacuityShape` — is DECLARED in
// `test-vacuity-types.ts` (imported above) and RE-EXPORTED here so the package surface is byte-identical to an
// inline declaration, exactly as `negation-types.ts`/`transition-types.ts` are on the sibling legs.
// `Seal`/`ObviousnessScore` stay owned HERE and are imported by that module (a type-only cycle, erased at runtime).
export type { TestVacuityNode, TestVacuityWitness, TestVacuityShape }

/**
 * The ORDINAL leg of the obviousness score (ADR-0012). Two-point on purpose, and the honesty matters:
 * the harness's obviousness predicate is a BOOLEAN (`TwoDoorBar.nonObvious`), so a two-point ordinal is
 * exactly what it can produce today. Inventing a real-valued scale here would be inventing a number, which
 * ADR-0011's Decision-4 discipline forbids and which ADR-0012 §"What this ADR does NOT close" declines
 * twice over (the predicate is not mechanical, and the retrieval weight is a decision on real data).
 * Widening this union later is additive.
 */
export type ObviousnessRank = "obvious" | "non-obvious"

/**
 * The seal provenance vocabulary. Records HOW a mined fact's grounds were established, and the two never blur
 * (genesis-epistemic-contract.md §"the seal names its grounds"):
 *   - `proven`    — a mechanical, re-runnable witness discharged the claim (a symbol index resolved a
 *                   dependency, tsc confirmed a type). The narrow band a machine could also have derived.
 *   - `justified` — no deterministic checker decides the claim (it is semantic / about intent), but the model
 *                   grounded it in the cited bytes, self-refuted it, and carries a contestable derivation that
 *                   leads a reader to the same conclusion (proven-vs-justified.md). NOT a truth claim — its
 *                   confidence is raised only by model-independent means, never converted to `proven`.
 * ADDITIVE + absent-tolerant, exactly like `obviousness` (ADR-0012) below — this type only makes the field
 * EXIST; it never decides WHEN a seal is set (that is the admit path's job). ADR-0017 CORRECTION 5 added
 * `justified` (196b) — the ratified two-seal vocabulary the design always named.
 */
export type Seal = "proven" | "justified"

/**
 * The `seal:'proven'` fact's own DERIVATION — the oracle call that discharged it, carried alongside the
 * verdict so a `proven` seal is a re-checkable claim rather than a bare assertion of trust (task
 * SEAL-CARRIES-ITS-WITNESS). A single NESTED object, not sibling fields: `AdvisoryNode.scope` (KNOW-11a) is
 * the fact's AUTHZ scope (e.g. `'atlas:mined'`) — a completely different thing from `witness.scope`, the
 * VERIFY-SCOPE directory the oracle's witness ranges over (e.g. `'src/pay'`). Nesting makes the two
 * unreadable as each other: `node.scope` and `node.witness.scope` are different paths, so a reader recovering
 * the oracle's arguments cannot silently pick up the authz scope by name collision. ADDITIVE + absent-
 * tolerant, exactly like `obviousness`/`seal` — carried ONLY where `buildSound` (genesis/src/admit-harness.ts)
 * mints the seal; an advisory/predicate/relation/negation fact with no seal carries no witness either.
 */
export interface PredicateWitness {
  readonly slot: PredicateSlot // the oracle FAMILY the witness answers ('dependency' | 'count' | 'definition' | a type-expressible slot)
  readonly target: string // the global symbol the oracle proved against (verifyDependency/verifyCount's `target`)
  readonly scope: string // the VERIFY-SCOPE directory the witness ranges over — NOT the authz `scope` above
  readonly atLeast?: number // the witnessed lower bound N — present for the 'count' slot only
}

/**
 * The `seal:'proven'` RELATION fact's own DERIVATION (#99 sound relation, ADR-0018) — the sibling of
 * `PredicateWitness` for the 2-ended family, carried on `RelationNode.witness` so a proven `depends-on`
 * edge is a re-checkable claim, not a bare assertion. A relation has no `PredicateSlot`, so the witness
 * encodes what the oracle RE-RUNS instead: the proven `relationKind` plus the exact `verifyDependency`
 * arguments — the global symbol under `endpointB` whose reference from `endpointA`'s scope witnessed the
 * resolved cross-unit edge. Read-side reverify (reverify-store.ts) re-runs `verifyDependency(sourceScope,
 * target)` over the CURRENT index and re-proves iff the edge still exists (else `broken`); a `proven`
 * relation with no witness is `unverifiable` (the #240 trap, closed for the relation family).
 *
 * `sourceScope` is the VERIFY-SCOPE (endpointA's containing scope the witnessed reference must lie in) —
 * NOT the fact's authz `scope` (KNOW-11a, `RelationNode.scope`), exactly the `PredicateWitness.scope` vs
 * `node.scope` distinction. Only `'depends-on'` is provable (F3, ADR-0018); `calls` never mints a witness.
 * ADDITIVE + absent-tolerant, same discipline as `PredicateWitness`.
 */
export interface RelationWitness {
  readonly relationKind: RelationKind // the PROVEN kind — only 'depends-on' is mechanically provable (F3)
  readonly target: string // the global SCIP symbol under endpointB whose witnessed reference proves the edge
  readonly sourceScope: string // endpointA's verify-scope — reverify re-runs verifyDependency(sourceScope, target)
}

/**
 * The STORED, AUDITABLE obviousness score (GEN-4 / GROUND-7, ADR-0012 — owner-ratified 2026-08-02).
 *
 * Obviousness never rejects. It is measured at mine time — the one moment the source bytes and the model
 * are both in hand — and kept, so that the filter's own accuracy can be audited after the fact and
 * re-thresholded at zero cost. A rejected candidate leaves no record; a gate therefore destroys exactly the
 * evidence needed to audit the gate.
 *
 * `by` is a CLOSED single-literal union, and that is the load-bearing part rather than a formality. GEN-16
 * forbids the usefulness judgment from resting on the proposer's self-assessment, and ADR-0011 makes it
 * structural by never passing `Candidate.signals` into the prompt. Pinning the only legal provenance to
 * `'harness-predicate'` means a proposer-authored score is not merely ignored — it is UNSPELLABLE in the
 * stored type. "Computed at mine time, when the model is in hand" must never be read as "ask the model how
 * non-obvious its own claim is."
 */
export interface ObviousnessScore {
  readonly rank: ObviousnessRank
  /** Provenance. The harness's predicate over the SOURCE BYTES — never a field the proposer wrote. */
  readonly by: "harness-predicate"
}

/**
 * The flat, honest default (a grounded claim, no verdict). Transcribed EXACTLY from
 * atlas-knowledge:21-22:
 *   `AdvisoryNode = { kind:'advisory', id, tier, claimNorm, grounding, freshness,
 *                     claims: ClaimEntry[], authoring:'ADVISORY'|'SUPERSEDED' }`
 *
 * [FLAG — `id` identity leg] atlas-knowledge:15 frames a node `id` as "the BLAKE3 hash of its canonical
 * form" (a `contentHash`-flavored value), while KNOW-15 (atlas-knowledge:123-124) makes NODE IDENTITY
 * the `nodeKey = hash(primaryAnchorId ‖ predicateSlot)`. `id` is transcribed as the branded `NodeKey`
 * (the create/update identity leg), NOT a `Hash` — flagged for the two lines to reconcile which leg the
 * stored `id` field carries.
 *
 * [RESOLVED — R3 data-model reconciliation, owner-authorized 2026-07-19] The `scope` (KNOW-11a) and
 * `predicateSlot` (KNOW-15b nodeKey leg / KNOW-4g read-side grouping) fields are now SURFACED on both node
 * shapes — OPTIONALLY. Optional because ~17 merged `GroundedFact` literals (src+test) omit them; the
 * KNOW-11 "every fact MUST carry a scope" stays enforced BEHAVIORALLY by the WP-5.14 emit/authz facet +
 * the conformance goldens, not by the type. Grounded shapes (`string`, closed `PredicateSlot`) — not
 * invented. Discharges the former [FLAG — no stored slot/scope].
 *
 * [REMOVED — `owner`, #187 owner-ratified 2026-08-03] R3 (above) originally also surfaced an `owner?:
 * string` field (KNOW-11a read "every fact MUST carry an `owner` + `scope`"). That MUST is AMENDED (see
 * `req-knw.md#REQ-KNOW-11a`): measured on the built binary, nothing supplies `owner` on any shipped write
 * path (`atlas emit`, `atlas mine` both stamp `scope`, never `owner`), and it is not a gate input — the
 * write door keys on `scope` alone, via `actorInScope(policy, actor, node.scope)` in
 * `adapter-io/src/policy.ts` (the LIVE gate — this sentence used to name `inScope(actor, fact.scope)`, a
 * function in `write/authz.ts` that no production path ever called and that #186 deleted). Producer identity
 * is already carried on every claim by `provenance.source` (`ClaimProvenance`, KNOW-14, MUST-required).
 * Grepped repo-wide (source, tests, `dist/`) before removal: the only reads of `fact.owner` were the
 * now-reverted `authz()` write-branch leg (#178/PR#105) and its pinning test, both removed by that
 * amendment — so nothing reads `owner` after this change, and the field is deleted rather than kept-but-unused.
 */
export interface AdvisoryNode {
  readonly kind: "advisory"
  readonly id: NodeKey // [FLAG] identity leg — see above (reference:15 says "hash of canonical form")
  readonly tier: Tier
  readonly claimNorm: string
  readonly grounding: Grounding
  readonly freshness: KnowledgeFreshness
  readonly claims: readonly ClaimEntry[] // [FLAG] kernel `ClaimEntry` — see the union note below
  readonly provenance?: ClaimProvenance // KNOW-14 — intrinsic claim receipt, absent on legacy rows
  readonly authoring: "ADVISORY" | "SUPERSEDED"
  readonly scope?: string // R3 — KNOW-11a (territory scope id)
  readonly predicateSlot?: PredicateSlot // R3 — KNOW-15b nodeKey leg / KNOW-4g read-side grouping
  /** ADR-0012 — the stored obviousness score. ADDITIVE + absent-tolerant, exactly as the N11 `builtAt` /
   *  `sameAs` widening (task #75): old data stays readable, no migration, no default fabricated. TOTALITY
   *  ("every emitted fact carries a score") is enforced BEHAVIOURALLY at the emit path + its goldens, the
   *  same way KNOW-11's "every fact MUST carry a scope" is — not by the type, because ~17 merged
   *  `GroundedFact` literals predate the field and a required field would make them unreadable. */
  readonly obviousness?: ObviousnessScore
  readonly seal?: Seal // ADR-0017 — two-seal provenance. ADDITIVE + absent-tolerant, same discipline as `obviousness`.
  readonly witness?: PredicateWitness // SEAL-CARRIES-ITS-WITNESS — the `proven` seal's own derivation (see above). ADDITIVE + absent-tolerant.
  /** ADR-0017 CORRECTION 5 (196b) — the `justified` seal's own carried derivation: the compact, contestable
   *  chain from the cited bytes that leads a reader to the SAME conclusion (genesis-epistemic-contract.md
   *  §JUSTIFIED). It is the model's grounds, NOT its free scratch reasoning (that stays parsed-away). Prose,
   *  provenance only — never a `nodeKey`/route/authz leg. ADDITIVE + absent-tolerant, same discipline as
   *  `witness`; a `proven` fact carries `witness`, a `justified` fact carries `derivation`. */
  readonly derivation?: string
}

/**
 * The checkable family: adds a `check` + mechanical `HOLDS/BROKEN/NA`. Transcribed EXACTLY from
 * atlas-knowledge:23-24:
 *   `PredicateNode = { kind:'predicate', id, tier, check, grounding, status, freshness,
 *                      claims: ClaimEntry[], authoring:'PREDICATED'|'SUPERSEDED' }`
 *
 * [PINNED — oracle-pin-map §1] KNOW-16's `check` = "a deterministic index-query OR a pinned declarative
 * assertion" is pinned to the ratified `Check` tagged union (above). It is `normalize`d into the
 * predicate `nodeKey` (KNOW-15) and evaluated by the evaluator.
 *
 * [FLAG — no stored `supersededBy`] KNOW-12 (atlas-knowledge:97-99) says a predicate SUPERSEDE adds a
 * `supersededBy` POINTER into CAS, yet the frozen shape lists no such field (only `authoring:'…'|
 * 'SUPERSEDED'` marks the state). The pointer is handled in `archive.ts` but is ABSENT from the
 * frozen record — NOT invented here. Flagged.
 */
export interface PredicateNode {
  readonly kind: "predicate"
  readonly id: NodeKey // [FLAG] identity leg — see AdvisoryNode
  readonly tier: Tier
  readonly check: Check // PINNED → Check (KNOW-16 index-query | declarative assertion)
  readonly grounding: Grounding
  readonly status: Status
  readonly freshness: KnowledgeFreshness
  readonly claims: readonly ClaimEntry[] // [FLAG] kernel `ClaimEntry` — see the union note below
  readonly provenance?: ClaimProvenance // KNOW-14 — intrinsic claim receipt, absent on legacy rows
  readonly authoring: "PREDICATED" | "SUPERSEDED"
  readonly scope?: string // R3 — KNOW-11a
  readonly predicateSlot?: PredicateSlot // R3 — KNOW-15b nodeKey leg / KNOW-4g grouping
  readonly obviousness?: ObviousnessScore // ADR-0012 — the stored obviousness score (see AdvisoryNode)
  readonly seal?: Seal // ADR-0017 — two-seal provenance (see AdvisoryNode)
}

// [FLAG — `ClaimEntry` reference divergence] atlas-knowledge:26 defines a Knowledge-local
//   `ClaimEntry = { claimNorm, claimText, provenance }`.
// Per the task's DAG-safe rule the LOWER-layer `ClaimEntry` is IMPORTED from @atlas/kernel (where it is
// aliased to `Event`, kernel/ref/types.ts) rather than redefined here. The two shapes DIVERGE (kernel
// `Event` vs the `{claimNorm, claimText, provenance}` record). Transcribed to the imported kernel type
// to avoid inverting/duplicating the DAG; flagged for the two references to reconcile whether Knowledge
// claims are kernel `Event`s or a distinct `{claimNorm, claimText, provenance}` record.

/**
 * The knowledge-local RICHER territory shape. Transcribed EXACTLY from atlas-knowledge:42 —
 *   `Territory = { path, owner, tier, files[], regions?, blastRadius }`.
 *
 * Named `TerritoryView` (NOT `Territory`) per the LEAD-RATIFIED decision: the CANONICAL
 * `Territory = { name, owner, tier, globs }` stays in @atlas/contracts; this richer view is a distinct
 * type owned HERE.
 *
 * [FLAG — `owner` field type] The reference `owner` is a `seat` (nominal seat id), not in the ratified
 * contracts membership. Transcribed as `string` — the same discipline contracts applied to
 * `Territory.owner`. NOT invented as a new exported type.
 *
 * [PINNED — oracle-pin-map §1 blastRadius] The blast-radius reachability set + the region set both pin
 * to `readonly NodeKey[]` — the reverse-dep closure already lives in index axis-3, so the SET is the
 * honest carrier (no tighter shape in the reference). Under `exactOptionalPropertyTypes`, `regions?` is
 * genuinely absent-or-value.
 */
export interface TerritoryView {
  readonly path: string
  readonly owner: string // [FLAG] reference: `seat` (nominal seat id) — transcribed as string
  readonly tier: Tier
  readonly files: readonly string[]
  readonly regions?: readonly NodeKey[] // PINNED → NodeKey[] (region set)
  readonly blastRadius: readonly NodeKey[] // PINNED → NodeKey[] (reachability set)
}

/**
 * The closed `predicateSlot` vocabulary (NORMATIVE). Transcribed EXACTLY — all 13 members — from
 * atlas-knowledge:166-179. The list is CLOSED: adding a slot is a spec revision that bumps the contract
 * version `cv` (atlas-knowledge:163). "Same topic" is decidable ONLY because this union is finite, which
 * is what lets `nodeKey` collide and force UPDATE/union instead of proliferating (atlas-knowledge:150).
 * Each slot binds to exactly one write template (KNOW-10) — see `template.ts`.
 */
export type PredicateSlot =
  | "invariant"
  | "contract"
  | "precondition"
  | "postcondition"
  | "sideeffect"
  | "ownership"
  | "perf-bound"
  | "security-property"
  | "gotcha"
  | "rationale"
  | "dependency"
  | "count"
  | "definition"

/**
 * The SEMANTIC subset of `PredicateSlot` (196c) — the eight slots NO mechanical oracle decides (now or
 * planned), so they land `justified`, never `proven`: a grounded, contestable reading whose derivation
 * travels with the fact (genesis-epistemic-contract.md §JUSTIFIED). DELIBERATELY EXCLUDES the oracle-backed
 * slots (`dependency`/`count`, already `proven`) AND the structural-provable trio (`definition`/`precondition`/
 * `postcondition`), which get a real oracle later and MUST NOT be laundered as `justified` here. A CLOSED
 * subtype of `PredicateSlot` — every member is one, so `isSemanticSlot` NARROWS to it. */
export type SemanticSlot =
  | "invariant"
  | "contract"
  | "sideeffect"
  | "ownership"
  | "perf-bound"
  | "security-property"
  | "gotcha"
  | "rationale"

/** The runtime copy of the eight-member semantic vocabulary (KNOW-10 closed-slot discipline — the erased
 *  `SemanticSlot` type enforces nothing at a value boundary, so the semantic mining arm validates the model's
 *  chosen slot against THIS list). Additive to the normative `PredicateSlot`/`PREDICATE_SLOTS` (router.ts):
 *  it names no member the 13-slot vocabulary does not, it only carves out the justified-eligible subset.
 *  MODULE-PRIVATE: the only consumer is `SEMANTIC_SLOT_SET`/`isSemanticSlot` below — the public value surface
 *  is the `isSemanticSlot` guard, which is what the mining arm imports. Exporting the raw list would be dead
 *  cross-package value surface (reference-model-guard). */
const SEMANTIC_SLOTS: readonly SemanticSlot[] = [
  "invariant",
  "contract",
  "sideeffect",
  "ownership",
  "perf-bound",
  "security-property",
  "gotcha",
  "rationale",
]

const SEMANTIC_SLOT_SET: ReadonlySet<string> = new Set(SEMANTIC_SLOTS)

/** Closed-vocabulary membership guard that NARROWS a `PredicateSlot` (or any `unknown`) to `SemanticSlot`.
 *  TOTAL over `unknown`: `Set.has` never throws/coerces, so a non-string, an out-of-vocabulary slot, or an
 *  oracle/structural slot (`dependency`/`count`/`definition`/…) all answer `false` — which is what lets the
 *  semantic arm ABSTAIN (fail-closed) on a model that classified outside the eight, never mint a fact whose
 *  slot the harness cannot honestly seal `justified`. */
export function isSemanticSlot(x: unknown): x is SemanticSlot {
  return typeof x === "string" && SEMANTIC_SLOT_SET.has(x)
}

/**
 * A proposed, un-ratified fact in staging (from the explorer). Transcribed from atlas-knowledge:31.
 *
 * [SIG-TBD — record NOT frozen] atlas-knowledge:31 is a PROSE characterization ("a proposed, un-ratified
 * fact in staging"), not a frozen field list. The fields below are the reference-ATTRIBUTED minimum the
 * write path consumes — NOT an invented record:
 *   - `claimText` / `claimNorm` — the LLM proposes ONLY the claim body (atlas-knowledge:127; the body of
 *      a `ClaimEntry`, atlas-knowledge:26).
 *   - `slot`       — proposed alongside the body (atlas-knowledge:127), from the closed vocabulary.
 *   - `check?`     — predicate candidates only (atlas-knowledge:127); pinned `Check`, see `PredicateNode`.
 *   - `grounding`  — the citations; `primaryAnchorId` is COMPUTED from these, never proposed (KNOW-15).
 *   - `provenance` — every claim carries a receipt (KNOW-14).
 *   - `tier`       — proposed tier (heuristics may only FLAG T0, never assign it — KNOW-7).
 * The `id`/`nodeKey`/`status`/`freshness` legs are NOT candidate fields — they are recomputed
 * side-indexes minted at ratification. Flagged: this record is not frozen; do not treat as canonical.
 */
export interface Candidate {
  readonly claimText: string
  readonly claimNorm: string
  readonly slot: PredicateSlot
  readonly target?: string // ADR-0017 dependency-slot leg — the global symbol X the fact depends on (absent for non-oracle slots)
  readonly scope?: string //  ADR-0017 dependency-slot leg — the directory key S the dependency witness ranges over
  readonly atLeast?: number // #196c count-slot leg — the WITNESSED lower bound N (distinct caller units); absent for non-count slots
  readonly check?: Check // PINNED → Check (predicate candidates only)
  readonly grounding: Grounding
  readonly provenance: ClaimProvenance
  readonly tier: Tier
}

// ── frozen API surface, co-located here (was ref/evaluator.ts · ref/store.ts) ─────────────────────────
// These interfaces carry zero runtime; they live with the shared data model because EvaluatorApi is
// consumed by BOTH evaluator.ts and StoreApi, and StoreApi is consumed by evaluator.ts / archive.ts /
// router.ts (≥2 src consumers each). Housing them here keeps the impl files free of impl→impl imports.

/**
 * The pure predicate-check evaluator (KNOW-16, spec §3.2). A `PredicateNode.check` evaluates to
 * `HOLDS/BROKEN/NA` from Atlas-INDEX state ALONE — a deterministic query over the structural/dependency
 * axes or a pinned declarative assertion — with NO arbitrary code execution, NO sandbox, NO clock/IO
 * (same index state ⇒ same verdict). A check needing runtime/behavioral execution is OUT OF SCOPE for v0
 * and MUST stay advisory; the verdict feeds `atlas-reconcile`. (atlas-knowledge:66, 221-223)
 */
export interface EvaluatorApi {
  /** Evaluate a check against index state (KNOW-16). Deterministic + pure — no code-exec, no clock, no
   *  IO; same `indexState` ⇒ same verdict. Yields `HOLDS | BROKEN | NA` (a subset of `Status`; the
   *  `'advisory'` member is not an evaluator verdict — a runtime-requiring check is refused to advisory
   *  UPSTREAM, not returned here).
   *
   *  [PINNED — oracle-pin-map §1] KNOW-16's check ("a deterministic index-query or a pinned declarative
   *  assertion") is pinned to the ratified `Check` union (see `PredicateNode.check`).
   *
   *  [FLAG — `indexState` arg] Typed as the LOWER-layer `@atlas/index` `IndexNode` (the task's reserved
   *  index-query import — DAG-safe, index is below knowledge). The reference says "over the Atlas index
   *  (structural/dependency AXES)", which may be the multi-axis root set (`Axes`) rather than a single
   *  `IndexNode`; transcribed to the pinned `IndexNode` per the task, flagged for the WP to confirm the
   *  index-state granularity. */
  evaluate(check: Check, indexState: IndexNode): Status
}

/**
 * Advisory-standalone operability (KNOW-9, spec §3.2). Both node families ship day-one, but with NO
 * evaluator wired the store is FULLY operable on advisory nodes alone (emit / query / reconcile all
 * succeed); the predicate family is present day-one, NOT deferred. (atlas-knowledge:36, 59, 200-201)
 *
 * [SIG-TBD — NO concrete signature frozen] method-tags-knw:78 describes "a reference store PARAMETRIZED
 * by `evaluator?=none`" that runs the full emit→query→reconcile cycle on advisory nodes with a null
 * evaluator, but freezes NO concrete store signature. The one FROZEN structural fact — the evaluator is
 * OPTIONAL — is transcribed below; the rest is flagged, NOT invented.
 */
export interface StoreApi {
  /** The predicate-check evaluator seam — OPTIONAL (KNOW-9). Absent (`evaluator?=none`) ⇒ the store
   *  operates on advisory nodes alone; a code path that HARD-REQUIRES an evaluator to operate on advisory
   *  fails the standalone cycle (method-tags-knw:79). Under `exactOptionalPropertyTypes`, genuinely
   *  absent-or-present.
   *
   *  [SIG-TBD] The full emit→query→reconcile operating surface is composed from the sibling facets
   *  (`emit.ts`, `reconcile.ts`, the query pack) — the aggregate store signature is not frozen; only the
   *  optional-evaluator parametrization is transcribed. Flagged. */
  readonly evaluator?: EvaluatorApi
}
