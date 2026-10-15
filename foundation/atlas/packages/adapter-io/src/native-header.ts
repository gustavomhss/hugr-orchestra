// @atlas/adapter-io — src/native-header.ts  (the installed header-read entry — F3 work package A3)
//
// The host builds this exact file into @orchestra/atlas-boundary's `./native-header` subpath; no Atlas-local
// runtime imports it. It only re-exports, so the reference-model ledger counts `readBoundHeader`'s missing in-tree
// caller on the `native-memory.ts` row (see harness/gates/reference-model-guard.mjs), not here.
//
// It exposes the bound running-header read and nothing else: no recall, no fold, no write. A host that imports
// this subpath can read one member's header (F3 clauses 6-10) and cannot reach the Memory write door through it.

export { readBoundHeader } from "./native-memory.js"
export type { BoundHeader, HeaderBinding, HeaderBound, SlabStates, StoreState } from "./native-memory.js"
export type {
  Awareness,
  AwarenessFacet,
  FacetState,
  MemberId,
  Orientation,
  ProjectMemoryEntry,
  TurnHeader,
} from "@atlas/memory"
