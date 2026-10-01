// @atlas/retrieval — src/relate.ts  (relate / blast-radius facet — RETR-10 / RETR-11)
//
// `relate(unit)` = the related-node set PARTITIONED by relation kind, computed purely from the index axes,
// deterministic + 0 LLM. Seam consumer: reads the frozen index `ReverseClosure`, never recomputes closure;
// job is presentation only (partition → rank → cap). `coChanged` is opt-in, labeled, and disjoint from the
// structural bands. Total (RETR-9): a malformed/missing unit ⇒ empty `RelationSet`, never a throw.

import { tierRank } from "@atlas/knowledge"
import type { PackInvariant } from "@atlas/contracts"
import type { ReverseClosure } from "@atlas/index"
import type { BoundMeta, Path, RelatedFact, RelationSet } from "./types.js"

/**
 * Deterministic partitioned closure (RETR-10). `relate(unit)` = the related-node set computed purely from
 * the index axes, PARTITIONED by relation kind, byte-identical for equal input, 0 LLM. Total: a malformed
 * unit yields an empty set, never a throw (RETR-9). (atlas-retrieval:169 / method-tags-ret:84-89)
 */
export interface RelateApi {
  /** Touched unit (path) → ALL nodes related to it, PARTITIONED by relation kind (RETR-10). Consumes
   *  the index's three axes; deterministic (byte-identical for equal input), 0 LLM. Pure + total (miss
   *  ⇒ empty RelationSet, no throw — RETR-9). (atlas-retrieval:169) */
  relate(unit: Path): RelationSet
}

// ── frozen bounds (RETR-11; defaults per BoundApi) ─────────────────────────────────────────
/** Hop-distance cut for the reverse/forward closure — `maxHops = 2` (RETR-11a). */
export const MAX_HOPS = 2
/** Hard count cap on a bounded band — `K = 8` one-line `RelatedFact`s (RETR-11c/11e). */
export const K = 8
/** The EXACT frozen deterministic total-rank literal (`BoundMeta.rank`, types.ts). */
export const RELATE_RANK = "tier-desc,ppr-desc,distance-asc,nodeKey-asc" as const

/** Criticality → sort ordinal (T0 highest ⇒ smallest ordinal ⇒ first under ascending). `tier-desc`. */
// The lattice is NOT rebuilt here. A private `Record<Tier, number>` yields `undefined` for an off-lattice
// value, so `tierRank(a) - tierRank(b)` was `NaN` and the sort order became undefined around a
// poisoned row. `tierRank` (@atlas/knowledge) is total: an unrecognized class ranks LAST, so it sinks.

// ── the deterministic total-rank comparator (RETR-11b) ──────────────────────────────────────────────────
/**
 * The deterministic, antisymmetric total order over `RelatedFact`s:
 *   `tier`-descending, then `ppr`-descending (precomputed PPR importance, GEN-11), then `distance`-ascending
 *   (demoted to a tiebreak), then `nodeKey`-ascending (identity, the final total-order key).
 * A high-`ppr` hub 2 hops out therefore outranks a low-`ppr` leaf 1 hop in (RETR-11b). Pure + no LLM.
 */
export function compareRelated(a: RelatedFact, b: RelatedFact): number {
  const t = tierRank(a.tier) - tierRank(b.tier)
  if (t !== 0) return t
  if (a.ppr !== b.ppr) return b.ppr - a.ppr // ppr-desc
  if (a.distance !== b.distance) return a.distance - b.distance // distance-asc (tiebreak)
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0 // nodeKey-asc (code-point, byte-stable)
}

// ── the ranked, capped, honestly-truncated bounder (RETR-11) ────────────────────────────────────────────
/**
 * `closure(≤ maxHops) → stable-sort-by-rank → take(K)` with honest `BoundMeta`. Deterministic and
 * truncate-AFTER-rank (the returned set is a rank-prefix, never an insertion-order prefix). `total` is the
 * HONEST full pre-truncation count within the hop cut; `truncated` iff that total exceeds the cap (RETR-11d).
 * The index already resolved WHICH nodes are in the closure (and their `distance`/`tier`/`ppr`); RETR never
 * recomputes the closure — it only cuts, ranks, and caps.
 */
export function boundClosure(
  facts: readonly RelatedFact[],
  maxHops: number = MAX_HOPS,
  cap: number = K,
): { readonly closure: readonly RelatedFact[]; readonly meta: BoundMeta } {
  const withinHops = facts.filter((f) => f.distance <= maxHops) // RETR-11a cut
  const ranked = [...withinHops].sort(compareRelated) // RETR-11b rank (copy — never mutate the input)
  const returned = ranked.slice(0, cap) // RETR-11c/11d cap AFTER ranking = a rank-prefix
  const meta: BoundMeta = {
    maxHops,
    rank: RELATE_RANK,
    total: ranked.length, // honest pre-truncation count
    returned: returned.length,
    truncated: ranked.length > cap,
  }
  return { closure: returned, meta }
}

// ── the index-axis seam (consumed, never re-derived) ────────────────────────────────────────────────────
/**
 * The RETR-side projection of the FROZEN index `ReverseClosure` (index/ref/depgraph.ts): the index has
 * already computed the reverse closure and resolved its hash-keyed members to `RelatedFact`s (joining in
 * `distance` / `tier` / `ppr`). RETR consumes this — it NEVER recomputes the closure. `underApprox` and the
 * correlational `coChanged` band are carried straight through from the frozen seam.
 * @see ReverseClosure (index/ref/depgraph.ts)
 */
export interface ReverseAxis extends Pick<ReverseClosure, "underApprox"> {
  /** Index-resolved reverse-closure members (blast radius) — RETR only partitions/ranks/caps these. */
  readonly facts: readonly RelatedFact[]
  /** The correlational git-history `coChanged` band (from `ReverseClosure.coChanged`) — opt-in, labeled. */
  readonly coChanged: readonly RelatedFact[]
}

/**
 * The four index axes `relate()` reads — supplied by the index (the seam this facet consumes). RETR owns
 * none of these; it partitions + ranks + caps what the index axes deliver.
 */
export interface RelateAxes {
  /** Spatial roll-up: file → module → crate (the `enclosing` band). */
  readonly enclosing: (unit: Path) => readonly PackInvariant[]
  /** Reverse closure (blast radius) + `coChanged` + `underApprox` — the frozen depgraph seam projection. */
  readonly reverse: (unit: Path) => ReverseAxis
  /** Forward closure: "built on these contracts" (the `dependencies` band, pre-bound). */
  readonly forward: (unit: Path) => readonly RelatedFact[]
  /** Territory rule(s): owner + tier over the unit (the `governing` band). */
  readonly governing: (unit: Path) => readonly PackInvariant[]
}

/** Per-invocation options. `coChanged` is OPT-IN (RETR-10e): absent ⇒ the band is not surfaced. */
export interface RelateOptions {
  readonly coChanged?: boolean
}

/** The facet surface: satisfies the FROZEN `RelateApi` (the extra optional arg is assignable to it). */
export interface RelateFacet extends RelateApi {
  relate(unit: Path, opts?: RelateOptions): RelationSet
}

// ── totality (RETR-9): a malformed/missing unit ⇒ empty set, never a throw ───────────────────────────────
function emptyRelationSet(unit: unknown): RelationSet {
  return {
    unit: typeof unit === "string" ? unit : "",
    enclosing: [],
    dependents: [],
    dependents_meta: { maxHops: MAX_HOPS, rank: RELATE_RANK, total: 0, returned: 0, truncated: false },
    dependencies: [],
    governing: [],
  }
}

/** Every `nodeId` carried in a structural band — used to keep `coChanged` DISJOINT from them (RETR-10f). */
function structuralIds(
  enclosing: readonly PackInvariant[],
  dependents: readonly RelatedFact[],
  dependencies: readonly RelatedFact[],
  governing: readonly PackInvariant[],
): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const e of enclosing) ids.add(e.nodeId)
  for (const d of dependents) ids.add(d.nodeId)
  for (const d of dependencies) ids.add(d.nodeId)
  for (const g of governing) ids.add(g.nodeId)
  return ids
}

/**
 * Prepare the OPT-IN `coChanged` band (RETR-10f): force the `coChanged` label, drop any node already in a
 * structural band (so `coChanged ∩ structuralBands = ∅`), then rank + cap it like any bounded band. Purely
 * correlational (git-history) — deterministic, never a static edge, never mixed into the structural bands.
 */
function labelCoChanged(band: readonly RelatedFact[], structural: ReadonlySet<string>): readonly RelatedFact[] {
  const labeled = band
    .filter((f) => !structural.has(f.nodeId))
    .map((f) => (f.relation === "coChanged" ? f : { ...f, relation: "coChanged" as const }))
  return boundClosure(labeled).closure
}

// ── the frozen RelateApi, over the index axes ───────────────────────────────────────────────────────────
/**
 * Build the `relate` facet over the index axes. `relate(unit)` returns the exact related-node set,
 * partitioned by relation kind, deterministic (byte-identical for equal input), 0 LLM (RETR-10). Total: a
 * malformed unit ⇒ empty set, never a throw (RETR-9).
 */
export function createRelate(axes: RelateAxes): RelateFacet {
  const relate = (unit: Path, opts?: RelateOptions): RelationSet => {
    if (typeof unit !== "string" || unit.length === 0) return emptyRelationSet(unit)
    try {
      const enclosing = axes.enclosing(unit)
      const rev = axes.reverse(unit)
      const dep = boundClosure(rev.facts) // RETR-11: reverse closure → cut → rank → cap
      const dependencies = boundClosure(axes.forward(unit)).closure // RETR-11e: same rank + same K
      const governing = axes.governing(unit)
      const base: RelationSet = {
        unit,
        enclosing,
        dependents: dep.closure,
        dependents_meta: dep.meta,
        dependencies,
        governing,
      }
      if (opts?.coChanged) {
        const structural = structuralIds(enclosing, dep.closure, dependencies, governing)
        return { ...base, coChanged: labelCoChanged(rev.coChanged, structural) }
      }
      return base
    } catch {
      return emptyRelationSet(unit) // RETR-9: total — never propagate a throw
    }
  }
  return { relate }
}
