// @atlas/kernel — barrel
//
// Layer-1 sealed identity/CAS seam: content-addressed store, append-only event log, convergent
// fold + OR-Set merge, and the swappable digest seam. Re-exports the package's FULL public surface so
// consumers import from the bare package root (`import { createStore } from '@atlas/kernel'`). Each
// frozen interface is co-located with its impl; the shared data model lives in types.ts.

// The shared frozen data model (Event / EventLog / Node / AtlasState / CasObject / Cas / ClaimEntry).
export type * from "./types.js"

// The branded-value mint boundary — the sanctioned cast sites for Hash/SubtreeHash/NodeKey.
export { asHash, asSubtreeHash, asNodeKey } from "./brand.js"

// ── Runtime surface + co-located frozen interfaces ─────────────────────────────────────────────────
export * from "./encoder.js" // the digest seam: default BLAKE3 encoder (Encoder / EncoderApi)
export * from "./canonical.js" // canonicalForm + id — content-addressed identity (CanonicalApi)
export * from "./store.js" // the single CAS: createStore (StoreApi)
export * from "./log.js" // append-only event log + eventId/combine/reseq (LogApi/RefLog/RefLogStatics)
export * from "./fold.js" // fold + convergent merge/mergeNode/head (FoldApi)
export * from "./portable.js" // open-JSON (OKF) export/import of the CAS (PortableApi)
export * from "./jsonl.js" // content-keyed JSONL log form + safe-degrade line-merge
