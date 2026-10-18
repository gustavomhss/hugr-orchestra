// @atlas/knowledge — src/init.ts  (WP-5.15.KNOW · EPIC-15)
//
// The `$0`-LLM structural move-in (KNOW-6) — the machine behind `atlas-init`. Knowledge starts
// UN-AUTHORED: the emitted skeleton carries ZERO invariants and every territory ships the T2/advisory
// default BY CONSTRUCTION (nothing authored, nothing promoted — KNOW-7). Binds the FROZEN `InitApi`
// (co-located below): `init(tree: unknown): readonly TerritoryView[]`.
//
// FACET BOUNDARY (BIND — resolved vs the frozen InitApi, co-located below):
//  • The reference names `init(tree)` with NO concrete type for the structural tree snapshot; the frozen
//    oracle transcribes it as `unknown` because the tree is a LOWER-layer artifact (index/kernel are
//    below knowledge). This facet BINDS to `tree: unknown` exactly and NARROWS it session-internally to
//    a `StructuralTree` seed shape (cf. router.ts `StoreProjection` — caller-side, NOT an invented frozen
//    index type). A non-tree input yields the empty skeleton (total).
//  • "family == advisory" + "count(invariants) == 0" are BY-CONSTRUCTION guarantees of the emitter, NOT
//    fields on the returned view: `TerritoryView` (types.ts) has no `family`/`invariants` leg. The
//    skeleton carries ONLY the frozen territory fields; nothing authored can leak.

import type { NodeKey } from "@atlas/contracts"
import type { TerritoryView } from "../types.js"

// ── frozen InitApi surface, co-located here (was ref/init.ts) ─────────────────────────────────────────

export interface InitApi {
  /** Structural move-in over a tree (KNOW-6). Emits the territory skeleton + blast radius, every
   *  territory at `tier=T2` / advisory family with `invariants=[]` — auto-promotes nothing (KNOW-7).
   *  Pure + total.
   *
   *  [SIG-TBD — `tree` arg, downward-owned] the reference names `init(tree)` with no concrete type for the
   *  structural tree snapshot (a LOWER-layer artifact); transcribed as `unknown`, flagged.
   *  [FLAG — return carries no `invariants`] the zero-invariant property is a by-construction guarantee of
   *  the emitter, not a field on `TerritoryView`. Flagged. */
  init(tree: unknown): readonly TerritoryView[]
}

/**
 * A single territory seed the move-in walks out of the structural tree. Session-internal (the frozen
 * `tree` arg is `unknown`, downward-owned) — the minimal skeleton inputs, no authored content.
 */
export interface TerritorySeed {
  readonly path: string
  readonly owner: string
  readonly files: readonly string[]
  readonly blastRadius?: readonly NodeKey[]
}

/** The structural tree snapshot the `$0`-LLM move-in narrows `unknown` to. */
export interface StructuralTree {
  readonly territories: readonly TerritorySeed[]
}

function isTree(t: unknown): t is StructuralTree {
  return typeof t === "object" && t !== null && Array.isArray((t as { territories?: unknown }).territories)
}

function toTerritory(seed: TerritorySeed): TerritoryView {
  // Every territory ships tier=T2 by construction (KNOW-6); nothing is promoted (KNOW-7). The advisory
  // family + zero invariants are structural — the skeleton has no authored-content field to carry.
  return {
    path: seed.path,
    owner: seed.owner,
    tier: "T2",
    files: seed.files,
    blastRadius: seed.blastRadius ?? [],
  }
}

/**
 * Structural move-in over a tree (KNOW-6). Emits one `TerritoryView` per territory, every one at
 * `tier=T2` (advisory / zero-invariant by construction). Pure + total — a non-tree input yields `[]`.
 */
export function init(tree: unknown): readonly TerritoryView[] {
  if (!isTree(tree)) return []
  return tree.territories.map(toTerritory)
}

/** The frozen-`InitApi` binding (conformance handle). */
export const initializer: InitApi = { init }
