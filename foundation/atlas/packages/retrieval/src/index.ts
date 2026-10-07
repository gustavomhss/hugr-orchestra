// @atlas/retrieval — barrel
//
// Layer 5 retrieval harness: bounded packs / OwnPack / poke / injection budget; relevance is the
// deterministic hashed structural index (no embeddings, no RAG — A-14). Re-exports the package's FULL
// public surface so consumers import from the bare package root (`import { OwnPack } from '@atlas/retrieval'`).
// Each frozen interface is co-located with its impl; the shared/unconsumed ones live in types.ts.

// The frozen data model + the co-located API interfaces that no src file re-exports (CapsApi / BoundApi /
// ResolveApi). Every other frozen interface now lives beside its impl and is re-exported by `export *`
// from the runtime files below.
export type * from "./types.js"

// ── Runtime surface (WP-filled at execution) ───────────────────────────────────────────────────────
export * from "./relate.js" // WP-2.8-b.RETR — partitioned, deterministic relate() over the index axes
export * from "./pack.js" // WP-6.19.RETR — the bounded pack (relevance-from-index, ~2K cap, T0-then-T1-by-rank)
export * from "./own.js" // WP-6.20.RETR — OwnPack (mechanical own_<unit>, capped, D1 content-free availability-manifest)
export * from "./own-artifact.js" // Static OpenCode Own skills + self-report-resistant receipt verification
export * from "./own-coverage.js" // Genesis coverage receipt: expected Own units for CI
export * from "./own-snapshot.js" // Persisted Genesis Own oracle + deterministic static projection
export * from "./poke.js" // WP-6.21.RETR — debounced once-per-scope poke (N=2 settle) + covering-set tool projection (pack-grain announce, X1)
export * from "./drop.js" // WP-6.22.RETR — injection-ceiling drop-order (ledger hitRate, 2 pins never drop) + stale-not-trusted
export * from "./ledger.js" // WP-6.18.RETR — RETR-8 hits ledger (budget()) + caps tuned by observed hits (feeds the sealed dropOrder)
export * from "./offatlas.js" // WP-6.18.RETR — RETR-13 per-territory off-atlas MISS-oracle (served-0 ⇒ rate 0, θ-threshold calibration prompt)
