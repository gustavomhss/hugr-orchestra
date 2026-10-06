// @atlas/adapter-io — src/native-bound.ts  (the installed bound-Memory entry — F3 work packages A1/A3)
//
// The host builds this exact file into @opencode-ai/atlas-boundary's `./native-memory` subpath; no Atlas-local
// runtime imports it. It only re-exports, so the reference-model ledger counts `createNativeMemory`'s missing in-tree
// caller on the `native-memory.ts` row (see harness/gates/reference-model-guard.mjs), not here.
//
// It exposes the bound Memory composition — recall, exact fold resolution, write and reconcile under one immutable
// `AtlasBinding` — and the types a host needs to persist its receipts. The owner and storage root stay forced from
// the binding; nothing reachable through this entry lets a caller name another owner or root.

export { createNativeMemory } from "./native-memory.js"
export type {
  AtlasBinding,
  BoundEntry,
  BoundRecall,
  BoundRecallQuery,
  FoldRefusal,
  FoldVerdict,
  NativeMemory,
  ProjectRuleProposal,
  ReconcileVerdict,
  RecordRef,
  StoreState,
  WriteVerdict,
} from "./native-memory.js"
export type { MemoryRefusal, MemoryRejected } from "./memory-emit.js"
export type {
  ClosingFold,
  MemberId,
  MemoryRecord,
  PrClosingFold,
  PrMemoryEntry,
  ProjectMemoryEntry,
  ResumeUnit,
  TaskMemoryEntry,
} from "@atlas/memory"
