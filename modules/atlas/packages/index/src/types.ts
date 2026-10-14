// @atlas/index — src/types.ts  (frozen data model + the impl-less umbrella surface; zero runtime)
//
// The index's shared data model — the axes, the per-node index record, the dual-Merkle rollup, the change
// Delta, the depends-on edge, the SCIP projection — plus `IndexApi`, the single-index umbrella that
// composes the facet interfaces (INV-INDEX-1). Shared identity types (`Hash`, `SubtreeHash`, `Territory`)
// come from @atlas/contracts — NEVER redefined here.

import type { Hash, SubtreeHash, Territory } from "@atlas/contracts"
import type { CasIndexApi } from "./cas.js"
import type { FoldApi } from "./fold.js"
import type { ResolveApi } from "./resolve.js"
import type { RetrievalApi } from "./retrieval.js"
import type { RollupApi } from "./rollup.js"

/** The multiple hierarchies over the one CAS — each a Merkle rollup, each its own job (drift +
 *  discovery). `functional`/flows is the NEXT axis, NOT built here (atlas-index:127). (atlas-index:36) */
export type Axis = "spatial" | "territory" | "dependency"

/** The three (and only three) deterministic relevance paths — no embeddings, no free-text `search()`
 *  (INDEX-6). (atlas-index:47) */
export type RetrievalMode = "scope" | "dependency" | "trigger"

/**
 * One node in an axis hierarchy. Transcribed EXACTLY from atlas-index:38:
 *   `IndexNode = { axis, level, key, subtreeHash, children: IndexNode[], objects: Hash[] }`.
 *   - `axis`        — which hierarchy this node belongs to.
 *   - `level`       — the granularity level NAME. Two vocabularies exist (spatial:
 *     `repo→crate→module→file→item→block`, atlas-index:54; territory: `project→territory→region`,
 *     atlas-index:70). The reference gives `level` NO enum type across axes → transcribed as `string`.
 *   - `key`         — the node's key within its level (reference gives no concrete type → `string`).
 *   - `subtreeHash` — THE drift oracle: BLAKE3 over sorted child hashes (branded, from contracts).
 *   - `children`    — child nodes (recursive).
 *   - `objects`     — the CAS objects hanging off this node, referenced by hash (stored once, INDEX-10).
 *
 * [FLAG — not transcribed] `ppr` (personalized-PageRank rank, structure.md DP-2 / RETR-11) is a
 * lead-ratified stored numeric FIELD, but NEITHER atlas-index nor method-tags-idx places it on
 * `IndexNode` or `Rollup` — so it is NOT added here (never invent). Add `ppr?: number` only if a
 * reference that scopes it to this record is supplied.
 */
export interface IndexNode {
  readonly axis: Axis
  readonly level: string
  readonly key: string
  readonly subtreeHash: SubtreeHash
  readonly children: readonly IndexNode[]
  readonly objects: readonly Hash[]
}

/**
 * The dual Merkle rollup of one axis node (INDEX-12). Transcribed EXACTLY from atlas-index:40-44:
 *   - `axis`   — which axis.
 *   - `bucket` — which node (the roll-up bucket).
 *   - `rId`    — BLAKE3 Merkle root over sorted child hashes — STRUCTURE.
 *   - `rState` — BLAKE3 root over (hash ‖ status ‖ freshness) — STATE.
 *
 * [FLAG — reference types both roots as `string`] `rId`/`rState` are BLAKE3 roots but the reference
 * (atlas-index:42-43) types them as bare `string`, NOT branded `Hash`/`SubtreeHash` — transcribed
 * verbatim as `string` (do not brand what the reference left unbranded).
 *
 * [FLAG — INDEX-16 tension, not added] INDEX-16 (atlas-index:202-205; method-tags-idx:128-130) says
 * the `unresolved/total` ratio is a "published health metric on every rollup", implying a `ratio`
 * field here. The canonical Rollup shape (atlas-index:40-44) does NOT list it, so it is NOT added —
 * the ratio surface is transcribed on `CoverageApi` (src/coverage.ts) instead. Flagged for the two
 * references to reconcile whether `ratio` is a stored Rollup field.
 */
export interface Rollup {
  readonly axis: Axis
  readonly bucket: string
  readonly rId: string
  readonly rState: string
}

/**
 * What a rebuild/edit changed, so a re-check is bounded to the changed buckets, never `N` (INDEX-12).
 * Transcribed EXACTLY from atlas-index:45:
 *   `Delta = { idChanged: boolean, stateChanged: boolean, changedBuckets: string[] }`.
 */
export interface Delta {
  readonly idChanged: boolean
  readonly stateChanged: boolean
  readonly changedBuckets: readonly string[]
}

/**
 * The territories manifest (normative schema). Transcribed EXACTLY from atlas-index:77:
 *   `Manifest = { territories: Territory[] }`  — declaration order is significant (overlap tiebreak).
 * `Territory` is the CANONICAL contracts type (`@atlas/contracts`), imported — NOT redefined.
 */
export interface Manifest {
  readonly territories: readonly Territory[]
}

/** An edge's resolution class. `unresolved`/`dynamic` are declared, never guessed (INDEX-13).
 *  Defined here (the base type module) and re-exported from `depgraph.ts` for its consumers.
 *  (atlas-index:185-188; method-tags-idx:108) */
export type EdgeKind = "resolved" | "unresolved" | "dynamic"

/** A depends-on edge in the dependency axis. `to` is `null` iff the target is unresolved/dynamic —
 *  no target is ever invented (SCN-INDEX-3e-1; INDEX-13c). (atlas-index:105, 185-188) */
export interface DepEdge {
  readonly from: Hash
  readonly to: Hash | null
  readonly kind: EdgeKind
}

/**
 * The set of built axis-views the index exposes (≥3, INDEX-10) — the return of `build`
 * (method-tags-idx:38, `build(tree, scipOutput)=axes`). Owner DEFINE 2026-07-18: pinned from
 * SCN-INDEX-10a-1 ("{spatial,territory,dependency}, each owning its own rollup") + the downstream
 * consumer `@atlas/genesis` scan.ts (the INDEX-13 unresolved-edge ledger + per-node CAS ids ride
 * inside `Axes`). Per-axis rollup is NOT stored — it is computed by `RollupApi.rollup(axis,key)`
 * (an EPIC-7 facet), so `edges` is the only load-bearing addition beyond the three rooted hierarchies.
 */
export interface Axes {
  readonly spatial: IndexNode
  readonly territory: IndexNode
  readonly dependency: IndexNode
  readonly edges: readonly DepEdge[]
}

/**
 * The real file tree fed to `build` (atlas-index:52-57): paths + nesting along the spatial rail
 * repo→crate→module→file→item→block, leaf `content` being the bytes normalized into the subtreeHash.
 * Owner DEFINE 2026-07-18 (minimal — no derived `level` field; `IndexNode.level` already carries it).
 */
export interface FileTree {
  readonly path: string
  readonly children: readonly FileTree[]
  readonly content?: string
}

/**
 * The minimal projection of a per-language SCIP indexer's output the build actually reads — the
 * external `scip.proto` black box (method-tags-idx:140-143), pinned to the occurrences+roles subset
 * needed to derive depends-on edges (a `reference` with no in-index `definition` = an unresolved
 * cross-language/FFI target — SCN-INDEX-3e-1). Owner DEFINE 2026-07-18: occurrences subset, not the
 * full SCIP schema.
 */
export type ScipSymbolRole = "definition" | "reference"
export interface ScipOccurrence {
  readonly symbol: string
  readonly role: ScipSymbolRole
}
export interface ScipDocument {
  readonly relativePath: string
  readonly occurrences: readonly ScipOccurrence[]
}
export interface ScipOutput {
  readonly documents: readonly ScipDocument[]
}

/**
 * The one content-addressed index (INDEX-1). Composes the public surface (atlas-index:209-216) from the
 * facets — `resolve`/`rollup` (RollupApi)/`put` (CasIndexApi)/`byScope`+`byDependency`+`byTrigger`
 * (RetrievalApi) — and pulls `delta` from `FoldApi` by its frozen signature (no redefinition). Exposes
 * the ≥3 axes it indexes on (INDEX-10). No `search()`/free-text entry point exists (INDEX-6). This is
 * the impl-less umbrella; the facet interfaces are co-located with their impls (build/cas/…), and the
 * facet file that named it is dissolved into this module.
 */
export interface IndexApi extends ResolveApi, RollupApi, CasIndexApi, RetrievalApi {
  /** The axes this single index cross-indexes on — ≥3 (`spatial`, `territory`, `dependency`),
   *  each object stored once (INDEX-10). (atlas-index:174-175) */
  readonly axes: readonly Axis[]
  /** Which axis buckets changed, structure vs state (INDEX-12). Reused verbatim from `FoldApi`.
   *  (atlas-index:212) */
  delta: FoldApi["delta"]
}
