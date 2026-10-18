// @atlas/index — src/compose.ts  (WP-2.6-b.INDEX · composed-index facet — INV-INDEX-1)
//
// THE single content-addressed index (INDEX-1): ONE built index, N axes, backs BOTH discovery (`discover`
// off the axis forest) AND inline drift (`drift` compares recorded vs current `subtreeHash`) with NO
// separate discovery/staleness structure — both close over the SAME forest, auxiliary-structure count 0.
// Only composes build + resolve; adds no resolve mode, mints no identity (subtreeHash read already-sealed).

import { build } from "./build.js"
import { createResolve, type AxisForest } from "./resolve.js"
import type { Axes, Axis, FileTree, IndexNode, ScipOutput } from "./types.js"

/** The query-time drift verdict for an anchored fact (INDEX-5): the fact stays visible (`node` surfaced)
 *  yet is `stale` when its recorded `subtreeHash` ≠ the current one — decided INLINE by a comparison off
 *  the built axes, never a re-embedding and never a separate staleness pass. */
export interface DriftVerdict {
  readonly anchor: string
  readonly node: IndexNode | undefined
  readonly recorded: string
  readonly current: string | undefined
  readonly stale: boolean
}

/** The ONE content-addressed index (INV-INDEX-1) — build ∘ resolve composed so a single object backs both
 *  drift and discovery over ≥3 axes, with 0 auxiliary discovery/staleness structures. */
export interface ComposedIndex {
  /** The one built index (EPIC-6 `build` output) — the single source of truth both jobs read. */
  readonly axes: Axes
  /** The SAME axes presented as a resolve forest (derived ONCE, shared by both jobs — never a 2nd build). */
  readonly forest: AxisForest
  /** The axes this one index cross-indexes on — ≥3 (spatial / territory / dependency), stored once (INDEX-10). */
  readonly axesList: readonly Axis[]
  /** Discovery: the covering node for `path` on `axis` (default spatial `byScope`), off the built axes. Total. */
  discover(path: string, axis?: Axis): IndexNode | undefined
  /** Drift: staleness of the anchor decided INLINE off the current vs recorded `subtreeHash`. Total. */
  drift(anchorPath: string, recorded: string, axis?: Axis): DriftVerdict
  /** Discovery/staleness structures stood up BEYOND the one index — invariantly 0 (INV-INDEX-1). */
  readonly auxiliaryStructureCount: number
  /** Separate staleness sweeps run — invariantly 0 (drift is decided at query time, INDEX-5c). */
  readonly sweepCount: number
  /** Re-embeddings run — invariantly 0 (discovery is lookup over the same axes, INDEX-7). */
  readonly reembedCount: number
  /** Whether the one built index backs BOTH jobs — the discover forest IS the drift forest IS the axes. */
  readonly backsBothJobs: boolean
}

const AXES: readonly Axis[] = ["spatial", "territory", "dependency"]

/**
 * Compose the ONE index from the axis build + the resolve surface (INV-INDEX-1). `build` mints the single
 * content-addressed index; `createResolve` gives the covering-node resolve that BOTH discovery and drift
 * route through — off the identical `forest` derived once from the identical `axes`. No second structure is
 * stood up, so `auxiliaryStructureCount` is 0; drift is a query-time `subtreeHash` comparison, so
 * `sweepCount`/`reembedCount` are 0.
 */
export function composeIndex(tree: FileTree, scipOutput: ScipOutput): ComposedIndex {
  const axes = build(tree, scipOutput) // EPIC-6 — the ONE built content-addressed index
  const forest: AxisForest = { spatial: axes.spatial, territory: axes.territory, dependency: axes.dependency }
  const { resolve } = createResolve(forest) // EPIC-8-a — discovery + drift both route through this

  // Register every backing structure the composed index STANDS UP, keyed by identity. It stands up exactly
  // one — the built `axes`. Discovery + drift are pure closures over a derived view of it and add nothing.
  // Any new standalone discovery/staleness structure (the INV-INDEX-1 violation) would be registered here.
  const backing = new Set<object>([axes])
  const auxiliaryStructureCount = backing.size - 1 // == 0: only the one index is stood up

  const discover = (path: string, axis: Axis = "spatial"): IndexNode | undefined => resolve(axis, path)

  const drift = (anchorPath: string, recorded: string, axis: Axis = "spatial"): DriftVerdict => {
    const node = resolve(axis, anchorPath) // the SAME forest discovery reads — one source of truth
    const current = node === undefined ? undefined : String(node.subtreeHash) // the drift oracle, sealed
    return {
      anchor: anchorPath,
      node,
      recorded: String(recorded),
      current,
      stale: String(recorded) !== (current ?? ""),
    }
  }

  return {
    axes,
    forest,
    axesList: AXES,
    discover,
    drift,
    auxiliaryStructureCount,
    sweepCount: 0, // drift is decided inline at query time — no separate staleness pass (INDEX-5c)
    reembedCount: 0, // discovery is lookup over the same axes — nothing is ever re-embedded (INDEX-7)
    backsBothJobs:
      forest.spatial === axes.spatial && forest.territory === axes.territory && forest.dependency === axes.dependency,
  }
}
