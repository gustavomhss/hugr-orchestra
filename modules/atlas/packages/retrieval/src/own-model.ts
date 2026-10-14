// @atlas/retrieval — src/own-model.ts  (the `own` facet's DATA MODEL — declarations only, zero runtime)
//
// SPLIT OUT OF `own.ts` BY ROLE, not by size. `own.ts` held two different things: WHAT an `own` briefing is
// (the records the seam is stated in) and HOW one is composed (rank → cap → project). Adding the ADVISORY
// band (REQ-RETR-12m) put the combined file over the 400-line ceiling, and the honest response to that is
// the boundary that was already there rather than a shorter comment: the MODEL is what a caller imports and
// a reviewer reads first; the COMPOSER is what runs. `own.ts` re-exports every name declared here, so no
// importer moves and the package's public surface is byte-identical.
//
// Zero runtime by construction: every export below is a `type` or an `interface`. The frozen bounds
// (`OWN_CAP`, `EDGE_CAP`, `FINER_CAP`, `MANIFEST_CAP`, `OWN_ADVISORY_CAP`) stay with the composer that
// enforces them — a cap that lives away from its loop is a number nobody re-reads when the loop changes.

import type { NodeKey, Pack, PackInvariant, Tier } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { OwnPack, OwnUnit, RelationSet } from "./types.js"

/**
 * The curated, zero-assembly `own` pack (RETR-12): `own_<unit>` returns a curated `OwnPack` composed by
 * INDEX READS ALONE (0 LLM, 0 free prose), `≤ ~1.5K` under the pinned cap, byte-identical for equal
 * input. Total: a malformed unit yields an empty briefing, never a throw (RETR-9). (atlas-retrieval:168)
 */
export interface OwnApi {
  /** Scope-unit → its CURATED, mechanically-composed `OwnPack` (the `own_<id>` tool), `≤ ~1.5K` under
   *  the pinned cap, deterministic (0 LLM). Pure + total (miss ⇒ empty briefing, no throw — RETR-9).
   *  (atlas-retrieval:168) */
  own(unit: OwnUnit): OwnPack
}

// ── facet-local input records (the sized index candidates the composer ranks/caps) ──────────────────────
/** One invariant candidate + its ranking keys + its pinned token cost (index-supplied). Carries a row of
 *  EITHER band — the tier on `inv` says which, and the FEED decides; see `OwnSources.advisory`. */
export interface SizedInvariant {
  readonly inv: PackInvariant
  readonly ppr: number // stored precomputed importance (GEN-11) — a field, not a call
  readonly hits: number // observed hit-count (frecency)
  readonly cost: number // tokenEstimate under the pinned cap measure
}

/** One gotcha/rationale knowledge fact + its pinned token cost. */
export interface SizedGotcha {
  readonly fact: GroundedFact
  readonly cost: number
}

/**
 * A CONTENT-FREE availability pointer (D1). Names a reachable surface — never carries its content.
 * `digest` is the surface's content-identity: index/kernel-SUPPLIED (this facet never hashes — sealed
 * @atlas/kernel seam). Where a digest is synthesized locally it is a FLAGGED `sim:` placeholder.
 */
export interface ManifestPointer {
  readonly kind: "pack" | "memory" | "knowledge" | "drill"
  readonly name: string // e.g. `own_payments`, `pr-memory:billing`
  readonly digest: string // content-identity (index-supplied; `sim:` prefix = SIMULATED, no raw hashing here)
  readonly pull: string // how-to-pull label
  readonly hits: number // frecency — ranks + drops the pointer
}

/** One manifest-pointer candidate + its pinned token cost. */
export interface ManifestCandidate {
  readonly pointer: ManifestPointer
  readonly cost: number
}

/** The bounded, frecency-ranked, content-free reachable map (D1). */
export interface AvailabilityManifest {
  readonly pointers: readonly ManifestPointer[]
  readonly truncated: boolean
}

/** Where a unit is grounded from (RETR-12i): the tree (crate/module), a manifest (service/feature), or —
 *  for a NON-grounded epic (RETR-12j) — its project-memory `goal`. */
export type GroundingSource = "tree" | "manifest" | "goal"

/** The composed OwnPack + the exec-observable receipts the goldens assert on (additive; see SHAPE NOTE). */
export interface OwnPackPlus extends OwnPack {
  readonly grounding: { readonly source: GroundingSource }
  readonly tokenEstimate: number // pinned `cl100k_base` count — `≤ OWN_CAP` (RETR-12f)
  readonly manifest: AvailabilityManifest // D1 content-free reachable map
  readonly pullReachable: readonly NodeKey[] // capped-out fact keys (0 silent drops — a pull-reachable tail)
  /** The ADVISORY band (REQ-RETR-12m): `T2` machine proposals no ratifier saw, under `OWN_ADVISORY_CAP`
   *  INSIDE `OWN_CAP`. Field name shared with `Pack.advisory` on purpose — one advisory vocabulary, two
   *  read doors; a reader who has seen `atlas query`'s band has already read this one. */
  readonly advisory: readonly PackInvariant[]
  /** How many advisory rows the sub-cap refused. Every one of them is ALSO in `pullReachable`; this number
   *  is the ledger beside the tail, because a truncated set that does not say so reads as complete (#130). */
  readonly advisoryDropped: number
}

/** The index-read axes the composer consumes (the seam). It owns none of these — it ranks + caps + projects. */
export interface OwnSources {
  readonly role: (unit: OwnUnit) => string // the 1-line role (from a definition fact / terrain)
  readonly invariants: (unit: OwnUnit) => readonly SizedInvariant[] // the unit's GOVERNING tier≥T1 rows
  /**
   * The unit's `T2` rows — the ADVISORY band (REQ-RETR-12m).
   *
   * REQUIRED, not optional, and that is the whole point. An optional axis lets the next feed FORGET the
   * band and serve a silently governing-only briefing, which is the exact defect this amendment closes: the
   * shipped feed bounded `T2` out of both fact sections and `own` served 0 of the 199 facts in this
   * repository's own store while `atlas query` served them. A feed with nothing advisory returns `[]` — it
   * says so, rather than being unable to say anything.
   *
   * The feed owns the tier PREDICATE, not this layer: it is stated ONCE, in `@atlas/tools` src/bands.ts
   * (`isAdvisory` = `isTier(t) && t === 'T2'`, membership, never `!atLeastT1`), which retrieval may not
   * import — L5 retrieval is inner, L7 tools is outer, and ARCH-1 flows outer→inner. The composer receives
   * a band that has already been labelled and owns only the BUDGET.
   */
  readonly advisory: (unit: OwnUnit) => readonly SizedInvariant[]
  readonly terrain: (unit: OwnUnit) => {
    readonly contents: readonly NodeKey[]
    readonly owner: string
    readonly tier: Tier
  }
  readonly relate: (unit: OwnUnit) => RelationSet // bounded relate() — the blast summary source
  readonly gotchas: (unit: OwnUnit) => readonly SizedGotcha[] // gotcha/rationale knowledge facts
  readonly memory: (unit: OwnUnit) => unknown // upward project-memory POINTERS (never a memory type)
  readonly finer: (unit: OwnUnit) => readonly OwnUnit[] // finer scope-units (drill.finer)
  readonly manifest: (unit: OwnUnit) => readonly ManifestCandidate[] // D1 reachable-surface pointers
}

/** An epic scope-unit (RETR-12j/12l): NOT a grounded node — a project-memory `goal` spanning `features`. */
export interface EpicUnit {
  readonly id: string
  readonly goal: string // the Orientation project-memory goal (the role source)
  readonly features: readonly OwnUnit[] // the grounded feature units whose OwnPacks compose the epic
}

/** A dedup pointer (RETR-12k): a nodeId the co-injected pack cedes to `own`, plus how-to-pull it. */
export interface DedupPointer {
  readonly nodeId: NodeKey
  readonly pull: string
}

/** The facet surface. `own` narrows the frozen `OwnApi.own` (OwnPackPlus is assignable to OwnPack). */
export interface OwnFacet extends OwnApi {
  own(unit: OwnUnit): OwnPackPlus
  ownEpic(epic: EpicUnit): OwnPackPlus
  dispatch(unit: OwnUnit): { readonly tool: string; readonly pack: OwnPackPlus }
  project(units: readonly OwnUnit[]): readonly { readonly tool: string; readonly pack: OwnPackPlus }[]
  dedup(own: OwnPackPlus, pack: Pack): { readonly pack: Pack; readonly pointers: readonly DedupPointer[] }
}
