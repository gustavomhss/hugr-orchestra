// @atlas/memory — barrel
//
// Layer 6: the per-member (per-seat + orchestrator) Memory kind — the member's own craft of DOING the
// work. Memory shares the ONE Atlas with Knowledge (same hashed index, grounding primitive, templated
// write, portable export) but is a DISTINCT kind, never conflated (MEM-2). Memory IMPORTS @atlas/retrieval
// (the allowed memory→retrieval edge that broke the RET⟷MEM cycle); retrieval NEVER imports memory.
// Re-exports the package's FULL public surface so consumers import from the bare package root
// (`import type { TurnHeader } from '@atlas/memory'`). Each frozen interface is co-located with its impl;
// the shared/multi-consumer ones (Awareness / Orientation / Memoize) live in types.ts.

// The frozen data model + the co-located slab interfaces consumed by ≥2 src files (Awareness / Orientation
// / Memoize). Every other frozen interface now lives beside its impl and is re-exported by `export *` from
// the runtime files below.
export type * from "./types.js"

// Campaign-3 runtime surface: WP-3.5-a.MEM (memory-export + pre-write named-scanner gate) +
// WP-3.5-b.MEM (every memory type versioned & travels + recall pushed at re-spawn). `src/awareness.ts`
// (WP-6.24-a.MEM) is Campaign-6 — wired at that seal.
export * from "./portable.js"
export * from "./respawn.js"

// Campaign-6 runtime surface (serve — inject/scope + the three turn-header slabs):
export * from "./inject.js" // WP-6.23.MEM  — inject only own Memory; scoping-not-access-control; recall (CLI-floor)
export * from "./kinds.js" // WP-6.23.MEM  — Memory≠Knowledge partition gate (fail-closed on conflation)
export * from "./awareness.js" // WP-6.24-a.MEM — Awareness slab (root-assembled, per-facet grounded, UN-SEEDED sentinel)
export * from "./orient.js" // WP-6.24-b.MEM — Orientation slab (goal from DEFINE, event-log fold, never-written)
export * from "./rules.js" // WP-6.25-a.MEM — project Rules-slab (capped, top-12 frecency, evict-never-delete)
export * from "./template.js" // WP-6.25-b.MEM — MEM-5 fail-closed templated-write gate (validate/render)
export * from "./logbook.js" // WP-6.25-b.MEM — MEM-8 orchestrator-only append-only logbook (consultable-never-injected, supersede-by-link)
