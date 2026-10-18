// @atlas/grounding — barrel
//
// Layer 3: the truth-gate / drift-oracle / two-door admission. Re-exports the package's FULL public
// surface so consumers import from the bare package root (`import { Grounding } from '@atlas/grounding'`).
// Each frozen interface is co-located with its impl; the shared/impl-less ones live in types.js.

// The frozen data model + the API interfaces shared by ≥2 impl files or held as public surface with no
// impl (GroundApi / DriftApi / GateApi / AnchorApi + the InterfaceRState seam). Every other frozen
// interface now lives beside its impl and is re-exported by `export *` from the runtime files below.
export type * from "./types.js"

// ── Runtime surface (Campaign-4) ───────────────────────────────────────────────────────────────────
export * from "./gate.js" // WP-4.11-a.GROUND — truth-gate: HOLDS only when grounded ∧ FRESH (fail-closed)
export * from "./emit-guard.js" // WP-4.11-a.GROUND — GROUND-6 truth-door + GROUND-9 structured-template validate (+ AdmitApi)
export * from "./subtree.js" // WP-4.10-a.GROUND — subtreeHash via the sealed kernel Encoder (seam-swappable)
export * from "./span.js" // WP-4.10-d.GROUND — the SPAN amendment: a range addressed into content-addressed bytes (never a quote)
export * from "./drift.js" // WP-4.10-a.GROUND — driftDetect + isGrounded (local subtreeHash-equality oracle)
export * from "./freshness.js" // WP-4.10-b.GROUND — transitive freshness fold (own hash + closure interface)
export * from "./ground.js" // WP-4.10-c.GROUND — ground() anchor builder: re-derive anchor@src, fail-closed drop unresolvable (GROUND-3)
