// @atlas/persist — src/types.ts  (shared frozen data model + multi-consumer types; zero runtime)
//
// The persistence layer's shared data model (atlas-persist §Data model). Shared identity types (`Hash`)
// come from @atlas/contracts; the log/state types (`EventLog`, …) from @atlas/kernel — NEVER redefined
// here. `VersionDelta`/`VersionDeltaEntry` live here (co-located above their DiffApi impl would break the
// host-adapter ↔ diff sharing) since both diff.ts and host-adapter.ts consume them.

import type { Hash } from "@atlas/contracts"
import type { EventLog } from "@atlas/kernel"

/**
 * The CANONICAL per-commit provenance block. RFC-822-ish `Key: value` block committed INTO the commit
 * object, so it travels in any clone/fork by construction and survives a history rewrite onto the new
 * SHA (PERSIST-3, PERSIST-13). (atlas-persist:16)
 *
 * Field NAMES transcribed exactly (`WP / Model / Gates / Verdict / TranscriptSha`). VALUE types: the
 * trailer is a text `Key: value` block, so the values are serialized strings — typed `string` here on
 * that grounding. `TranscriptSha` is the content-hash POINTER to the large-object transcript
 * (PERSIST-10 / `TranscriptRef.sha`), so it is typed `Hash`.
 * PINNED: `Gates`/`Verdict` are the RFC-822-ish text-block values → `string` (the trailer text form; cf.
 * the structured `Metering.gates`/`Metering.verdict` below).
 */
export interface Trailer {
  readonly WP: string
  readonly Model: string
  readonly Gates: string
  readonly Verdict: string
  readonly TranscriptSha: Hash
}

/**
 * The MUTABLE OVERLAY: a JSON dossier stored under `refs/notes/orchestra`. Notes do not fetch/push by
 * default and are orphaned by rebase/squash/cherry-pick (PERSIST-13), so a note carries only data that
 * may change after commit and is perimeter-conditional. The note's payload IS the JSON `Dossier`.
 * (atlas-persist:17)
 */
export type Note = Dossier

/**
 * The per-commit provenance dossier round-tripped by `attachToCommit` / `readCommit` through
 * {trailer, note} (PERSIST-3, method-tags-pst:34-36).
 *
 * PINNED (partial): the CONSTITUENTS are grounded in prose (atlas-persist:33-35): notes + trailers carry
 * the per-commit "provenance/metering and the knowledge-delta". Membership is transcribed as the honest
 * composite {trailer (required) + metering? + knowledgeDelta?}, optionality per atlas-persist:33-35.
 * `knowledgeDelta` is the persist-LOCAL version-delta (the PERSIST-14 read-only fold-diff, below) —
 * NOT an upward knowledge-layer import (no DAG inversion).
 */
export interface Dossier {
  readonly trailer: Trailer
  readonly metering?: Metering
  readonly knowledgeDelta?: VersionDelta
}

/**
 * A POINTER in git to the content-addressed large-object transcript; the body is fetched on demand
 * (PERSIST-10). `sha` is the content hash of the object. (atlas-persist:18)
 */
export interface TranscriptRef {
  readonly sha: Hash
  readonly store: "lfs" | "partial-clone" | "cas"
}

/**
 * The re-invoke substrate = redispatch + replay; DISTINCT from the raw transcript (PERSIST-10b).
 * (atlas-persist:19)
 *
 * PINNED: the field NAMES are frozen exactly (atlas-persist:19); the elements are honest serialized
 * strings — `seatBrief` a text brief, `llmOutputs`/`toolIO` recorded I/O lines for faithful replay.
 */
export interface Checkpoint {
  readonly seatBrief: string
  readonly llmOutputs: readonly string[]
  readonly toolIO: readonly string[]
}

/**
 * The per-agent accounting record for a WP — every field required (PERSIST-6, 0 missing field).
 * (atlas-persist:20-21)
 *
 * Field NAMES transcribed exactly. Numeric counters (tokens/toolUses/wallTime/retries/reworks) typed
 * `number`; `model` typed `string`; `transcriptSha` typed `Hash` (the transcript pointer).
 * PINNED: `gates` is the required, present list of gate results (PERSIST-6 — 0 missing field) → a
 * `readonly string[]`; `verdict` is the single verdict value → `string` (the structured list/enum form,
 * vs. the `Trailer` RFC-822 text form above).
 */
export interface Metering {
  readonly model: string
  readonly tokensIn: number
  readonly tokensOut: number
  readonly tokensCache: number
  readonly toolUses: number
  readonly wallTime: number
  readonly retries: number
  readonly reworks: number
  readonly gates: readonly string[]
  readonly verdict: string
  readonly transcriptSha: Hash
}

/**
 * The projection rendered onto the host PR via the adapter (PERSIST-8). (atlas-persist:22)
 *
 * Only the field NAMES are frozen. `prId` is the host PR identifier (typed `string`).
 * OPAQUE-BY-DESIGN (kept `unknown`, flagged): `prMemory` / `logbookEntry` are memory-owned (a HIGHER
 * layer — importing it upward here would invert the DAG), `knowledgeDelta` is likewise not pinned at
 * this layer. No reference/golden/consumer freezes their shapes — left honestly opaque.
 */
export interface PrAttach {
  readonly prId: string
  readonly prMemory: unknown
  readonly logbookEntry: unknown
  readonly knowledgeDelta: unknown
}

/**
 * The forge abstraction, one impl per host (PERSIST-8). This is the data-model record shape
 * (atlas-persist:23-26); the frozen callable surface is `HostAdapterApi` (host-adapter.ts, identical
 * four methods). `sha` is a git commit SHA (a git object id — NOT the branded CAS `Hash`), so it is
 * typed `string`.
 */
export interface HostAdapter {
  attachToCommit(sha: string, dossier: Dossier): void
  readCommit(sha: string): Dossier | null
  attachToPR(prId: string, prAttach: PrAttach): void
  readPR(prId: string): PrAttach | null
}

/**
 * The registered git merge driver (`.gitattributes: <atlas-log> merge=orchestra-atlas`): set-union the
 * two event logs by content-hash and re-fold (PERSIST-11). `merge` returns an `EventLog` (kernel type).
 * (atlas-persist:27-28) The `mergeAtlas` free function (PERSIST-11) has NO ref file — its oracle is the
 * kernel `fold` — it lives in `src/`, not here.
 */
export interface MergeDriver {
  readonly name: "orchestra-atlas"
  merge(ours: EventLog, theirs: EventLog, base: EventLog): EventLog
}

// ── version-delta data model (was ref/diff.ts) ────────────────────────────────────────────────────────
// Shared by BOTH diff.ts (the DiffApi impl) and host-adapter.ts (serializes `Dossier.knowledgeDelta`),
// so the data types live here; the frozen `DiffApi` callable surface is co-located in diff.ts.

/**
 * One fact in a partition, carrying its provenance (PERSIST-14: "each entry carrying its provenance").
 * OPAQUE-BY-DESIGN (kept `unknown`, flagged): NO ref/golden/consumer freezes either the fact-payload
 * shape or the provenance shape — genuinely opaque at this layer, left honestly `unknown`. The
 * `provenance`-carrying membership requirement is the only frozen part.
 */
export interface VersionDeltaEntry {
  readonly fact: unknown
  readonly provenance: unknown
}

/**
 * The read-only fold-diff result: a total, disjoint partition of the facts (method-tags-pst:125).
 */
export interface VersionDelta {
  readonly added: readonly VersionDeltaEntry[]
  readonly edited: readonly VersionDeltaEntry[]
  readonly superseded: readonly VersionDeltaEntry[]
  readonly decayed: readonly VersionDeltaEntry[]
}
