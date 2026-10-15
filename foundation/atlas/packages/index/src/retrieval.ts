// @atlas/index — src/retrieval.ts  (INDEX-6/7/8/9/10: the CLOSED three-mode retrieval surface)
//
// Relevance resolves by EXACTLY three deterministic modes (INDEX-6): `byScope`, `byDependency`,
// `byTrigger` — no fourth mode, no free-text `search()`, NO embedding/vector/ANN (INDEX-7). Every mode is
// TOTAL (miss ⇒ empty, never a throw) and ordered by a total CAS-hash sort, so equal queries are
// byte-identical (INDEX-8); objects are referenced by hash out of the ONE store, never copied per axis.

import type { Hash } from "@atlas/contracts"
import { coveringPath, type AxisForest } from "./resolve.js"

// [UPWARD-TYPE — knowledge-owned, do NOT import upward] `Fact` (a `GroundedFact`, atlas-index:21, 59)
// is owned by a HIGHER layer (@atlas/knowledge). Importing it here would invert the layer DAG, so it
// is transcribed as `unknown` and flagged — NOT redefined as an index-local type. The retrieval
// surface returns whatever the knowledge layer's `Fact` is; the index only addresses + orders it.
export type Fact = unknown

/** The CLOSED three-mode retrieval surface (INDEX-6/7/8/9): relevance resolves by EXACTLY `byScope`,
 *  `byDependency`, `byTrigger` — no free-text `search()`, no embeddings; every mode total + deterministic. */
export interface RetrievalApi {
  /** Mode 1 — scope: spatial resolve + hierarchy roll-up ("what's known here and above"). Total.
   *  (atlas-index:213) */
  byScope(path: string): readonly Fact[]
  /** Mode 2 — dependency: follow `depends-on` / blast radius (reverse closure). Total. (atlas-index:214) */
  byDependency(path: string): readonly Fact[]
  /** Mode 3 — trigger: cross-cutting rules attached by tag/pattern match. Total. (atlas-index:215) */
  byTrigger(tag: string): readonly Fact[]
}

/**
 * The read model the retrieval surface serves — assembled from the built axes (EPIC-6). It holds facts in
 * ONE `store` keyed by CAS hash (stored once, INDEX-10c); the axes and the mode maps reference facts BY HASH.
 *   - `forest`      — the ≥3 axis hierarchies (spatial rolled up for scope + roll-up).
 *   - `store`       — the single object store: `Hash → Fact`. The axes never hold a second copy.
 *   - `triggers`    — `tag → object hashes` (the cross-cutting trigger axis).
 *   - `blastRadius` — `path → dependency-reachable object hashes` (the dependency-mode reach, computed by the
 *     depgraph facet; retrieval only addresses + orders it).
 */
export interface RetrievalModel {
  readonly forest: AxisForest
  readonly store: ReadonlyMap<Hash, Fact>
  readonly triggers: ReadonlyMap<string, readonly Hash[]>
  readonly blastRadius: ReadonlyMap<string, readonly Hash[]>
}

/**
 * Dereference a hash list through the ONE store, deduped and in a TOTAL deterministic order (sort on the CAS
 * hash string — byte-stable, insertion-order-independent). A hash absent from the store is skipped (total).
 */
function dereferenceSorted(hashes: readonly Hash[], store: ReadonlyMap<Hash, Fact>): readonly Fact[] {
  const seen = new Set<Hash>()
  const uniq: Hash[] = []
  for (const h of hashes) {
    if (!seen.has(h)) {
      seen.add(h)
      uniq.push(h)
    }
  }
  uniq.sort() // total deterministic sort ⇒ two identical queries are byte-identical (INDEX-8)
  const out: Fact[] = []
  for (const h of uniq) {
    if (store.has(h)) out.push(store.get(h) as Fact)
  }
  return out
}

/** Construct the CLOSED three-mode retrieval surface over a fixed read model. Pure + total on every mode. */
export function createRetrieval(model: RetrievalModel): RetrievalApi {
  const { forest, store, triggers, blastRadius } = model
  return {
    // Mode 1 — scope: resolve the covering node in the spatial axis, then roll UP, unioning the objects
    // anchored at the covering node AND every ancestor (file → module → crate → repo). (INDEX-4b)
    byScope(path: string): readonly Fact[] {
      if (typeof path !== "string") return []
      const chain = coveringPath(forest.spatial, path)
      if (chain.length === 0) return []
      const hashes: Hash[] = []
      for (const node of chain) hashes.push(...node.objects)
      return dereferenceSorted(hashes, store)
    },
    // Mode 2 — dependency: the blast-radius object set for the path (reverse closure computed upstream).
    byDependency(path: string): readonly Fact[] {
      if (typeof path !== "string") return []
      return dereferenceSorted(blastRadius.get(path) ?? [], store)
    },
    // Mode 3 — trigger: cross-cutting rules attached by exact tag match. A free-text token matches no tag.
    byTrigger(tag: string): readonly Fact[] {
      if (typeof tag !== "string") return []
      return dereferenceSorted(triggers.get(tag) ?? [], store)
    },
  }
}
