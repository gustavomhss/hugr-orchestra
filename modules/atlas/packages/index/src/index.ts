// @atlas/index — barrel
//
// The one content-addressed git-native index (axes / rollup / depgraph / drift). Re-exports the package's
// FULL public surface so consumers import from the bare package root (`import type { IndexNode } from
// '@atlas/index'`). Each frozen facet interface is co-located with its impl; the shared data model + the
// impl-less `IndexApi` umbrella live in types.ts.

// The shared frozen data model (Axis / IndexNode / Rollup / Delta / Manifest / DepEdge / SCIP projection)
// + the impl-less umbrella `IndexApi` that composes the facet interfaces.
export type * from "./types.js"

// ── Runtime surface + co-located frozen facet interfaces ───────────────────────────────────────────
export * from "./build.js" // WP-2.6.INDEX   — mechanical $0-LLM axis build (BuildApi)
export * from "./depgraph.js" // WP-2.6/2.8-b   — dependency axis + honest reverse closure (DepgraphApi/ReverseClosure/EdgeKind)
export * from "./symbol-reverse.js" // #99b N0       — symbol-level reverse callers, the negation completeness feed (SymbolReverseApi)
export * from "./unit-deps.js" // #196a           — a unit's cross-unit dependencies: the candidate-grounded RECALL source (UnitDepsApi)
export * from "./unit-exports.js" // #196c           — a unit's externally-called exports + witnessed caller count: CARDINALITY RECALL (UnitExportsApi)
export * from "./unit-defs.js" // #196d           — a unit's OWN global definitions: the DEFINITION candidate-grounded RECALL source (UnitDefsApi)
export * from "./rollup.js" // WP-2.7-a.INDEX — structural rollup, leaf→root re-hash (RollupApi)
export * from "./fold.js" // WP-2.7-a/2.7-b — delta + drift, dirty-bit/lazy rState/MaxHops (FoldApi)
export * from "./own-impact.js" // Static Own PR impact receipt: delta + reverse blast + Knowledge drift input
export * from "./resolve.js" // WP-2.8-a.INDEX — three-mode resolve (ResolveApi)
export * from "./retrieval.js" // WP-2.8-a.INDEX — read-model retrieval (RetrievalApi/Fact)
export * from "./territory.js" // WP-2.9-a.INDEX — territory assignment (TerritoryApi/TerritoryAssignment)
export * from "./territory-catalog.js" // ACE catalog seam — explicit versioned read-only project catalogs
export * from "./ownership.js" // WP-2.9-a.INDEX — ownership reconcile (OwnershipApi/OwnerMap/BlameEntry)
export * from "./coverage.js" // WP-2.9-b.INDEX — per-territory unresolved-ratio gate (CoverageApi)
export * from "./compose.js" // WP-2.6-b.INDEX — composed index: one structure backs drift + discovery
export * from "./cas.js" // WP-4.10-a.INDEX — every Atlas object is one BLAKE3-CAS object (CasIndexApi, Campaign-4)
