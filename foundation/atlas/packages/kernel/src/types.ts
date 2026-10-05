// @atlas/kernel — src/types.ts  (frozen shared data model; zero runtime)
//
// The CAS store, the append-only event log, and the OR-Set fold node. Shared identity types
// (`Hash`, `NodeKey`) are imported from @atlas/contracts — NEVER redefined here.

import type { Hash, NodeKey } from "@atlas/contracts"

/**
 * A folded-in log entry. Transcribed EXACTLY from the fspec-merge reference model (fspec-merge:106-107),
 * which the task pins as the canonical Event shape:
 *   - `id`          — the event's identity = `hash(canonicalForm(event))` with `seq` excluded (KERNEL-9).
 *   - `seq`         — a LOCAL ordering hint only (per-writer/per-branch); never identity, never a merge key.
 *   - `nodeKey?`    — the fold target (the subject this event re-evidences); optional.
 *   - `contentHash` — the OR-Set entry key inside a Node (fspec-merge:138 keys `entries` by contentHash).
 *   - `fresh`       — freshness of this evidence (drives `head` FRESH filtering, fspec-merge:145).
 *   - `supersedes`  — contentHashes this event archives (the supersedes-DAG, fspec-merge:149).
 *   - `payload`     — the opaque event body.
 *
 * [FLAG — reference divergence] `atlas-kernel.md:20` states a DIFFERENT Event shape:
 *   `Event = { id, seq, kind, actor, nodeKey?, payload, at }` (adds `kind`, `actor`, `at`; omits
 *   `contentHash`, `fresh`, `supersedes`). The task pins the fspec-merge shape below; the atlas-kernel
 *   fields (`kind`/`actor`/`at`) are NOT transcribed — flagged for the two references to reconcile.
 */
export interface Event {
  readonly id: Hash
  readonly seq: number
  readonly nodeKey?: NodeKey
  readonly contentHash: Hash
  readonly fresh: boolean
  readonly supersedes: readonly Hash[]
  readonly payload: unknown
}

/**
 * The append-only, content-keyed event SET. `hash → event` keyed by the event id; combining two logs
 * is set-union on the id (KERNEL-9). (atlas-kernel:21)
 */
export type EventLog = Map<Hash, Event>

/**
 * A per-nodeKey OR-Set node: the grow-only set of `ClaimEntry`/lineage keyed by `contentHash`
 * (fspec-merge:138). `entries` are keyed by each event's `contentHash`; union never drops.
 */
export interface Node {
  readonly nodeKey: NodeKey
  readonly entries: Map<Hash, Event>
}

/**
 * The convergent fold result: `AtlasState = fold(EventLog)` (atlas-kernel:22). The fspec-merge
 * reference `fold` (fspec-merge:152) projects the set to `Map<NodeKey, Node>`, so AtlasState is
 * transcribed as that projection. The byte-identical AtlasState (KERNEL-11) is the canonical
 * serialization of this map.
 */
export type AtlasState = Map<NodeKey, Node>

/**
 * Any typed Atlas object stored in the CAS. Reference (atlas-kernel:17):
 *   `CasObject = StructuralNode | KnowledgeFact | MemoryEntry`.
 *
 * [SIG-TBD — underspecified / architectural tension] None of `StructuralNode`, `KnowledgeFact`,
 * `MemoryEntry` are defined in @atlas/contracts, atlas-kernel, or fspec-merge, and each is owned by a
 * HIGHER layer (index / knowledge / memory) that the layer-1 kernel MUST NOT import (that would invert
 * the dependency and cycle). The reference model itself keeps the stored body opaque (`payload: unknown`,
 * fspec-merge:107). Transcribed here as the honest layer-1 generic (`unknown`) — the union arms are NOT
 * invented as kernel-local types. Flagged for the arm types to be surfaced from their owning layers.
 */
export type CasObject = unknown

/**
 * The whole content-addressed store: `hash → object` (atlas-kernel:18).
 */
export type Cas = Map<Hash, CasObject>

/**
 * One entry in a Node's OR-Set (the grow-only claim/lineage keyed by `contentHash`, referenced in
 * KERNEL-10 and fspec-merge:42-47, 138 as "an OR-Set of ClaimEntry/lineage").
 *
 * [SIG-TBD — underspecified] No cited source (atlas-kernel, fspec-merge, contracts) gives `ClaimEntry`
 * a FIELD SHAPE. The fspec-merge reference model keys `Node.entries` by `Map<Hash, Event>` (i.e. the
 * entry value is an `Event`, fspec-merge:138), never a distinct `ClaimEntry` record. Aliased to `Event`
 * to match the only concrete reference (Node.entries), NOT invented with new fields. Flagged.
 */
export type ClaimEntry = Event
