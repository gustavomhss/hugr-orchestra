// @atlas/adapter-io — src/surface/types-memory.ts  (the Atlas UI surface: committed Own, Memory and territories)
//
// The shapes of the four snapshot keys lead decision D3b adds to extract.py's object: `own` (the committed Own
// snapshot as Orchestra reads it), `memory` and `orientation` (the durable `.atlas/memory.jsonl` and
// `.atlas/orientation.jsonl` logs) and `territories` (`TERRITORY-CATALOG.json`). Plain JSON, and this file imports
// nothing, for the reason ./types.ts gives.

/** One published Own skill file under `.orchestra/skills/own/`. */
export interface AtlasOwnSkill {
  /** Repository-relative, `/`-separated. */
  readonly path: string
  /** The file's size in bytes. */
  readonly size: number
  /** The first 4096 bytes, decoded as UTF-8; a character cut at the boundary decodes as U+FFFD. */
  readonly head: string
}

/** `.orchestra/skills/own/OWN-COVERAGE.json` (`StaticOwnCoverageReceipt`, `@atlas/retrieval`). */
export interface AtlasOwnCoverage {
  readonly snapshot: string
  readonly sourceRevision: string
  readonly units: readonly string[]
}

/** `OWN-SNAPSHOT.json` as `parseOwnSnapshot` (`@atlas/retrieval`) reads it, plus the published files. */
export interface AtlasOwnSnapshot {
  /** READY when the file parses; HOLD with reason `snapshot-invalid` when it does not. */
  readonly status: "READY" | "HOLD"
  readonly reason: string | null
  readonly snapshot: string | null
  readonly sourceRevision: string | null
  /** Every source path the units pin, sorted. */
  readonly sourcePaths: readonly string[]
  /** `OwnSnapshot.units` (`{ unit, sourceBlobs, pack }`), carried as JSON; empty when HOLD. */
  readonly units: readonly unknown[]
  /** null when the coverage file is absent or does not parse. */
  readonly coverage: AtlasOwnCoverage | null
  /** Every `SKILL.md` under `.orchestra/skills/own/`, sorted by path. */
  readonly skills: readonly AtlasOwnSkill[]
}

/** One `.atlas/memory.jsonl` record. */
export interface AtlasMemoryRecord {
  /** The log event id, the record's content key. */
  readonly eventId: string
  readonly seq: number
  readonly member: string
  /** `task`, `pr`, `project` or `logbook`. */
  readonly kind: string
  /** project: the rule; task: the lesson; pr: the decisions joined by "; "; logbook: what shipped. */
  readonly text: string
  /** The project rule's scope; null for every other kind. */
  readonly scope: string | null
  /** The logbook entry's `at`; null for every other kind, because no other record carries a time. */
  readonly at: string | null
  /** project grounding, task and pr ref, logbook links; a structural ref reads `qualifiedPath@subtreeHash`. */
  readonly refs: readonly string[]
  /** The whole `MemoryEntry` (`@atlas/memory`). */
  readonly entry: unknown
}

/** One `.atlas/orientation.jsonl` event. */
export interface AtlasOrientationEvent {
  readonly eventId: string
  readonly seq: number
  /** `milestone` or `state`; "" when the payload carries none. */
  readonly channel: string
  readonly label: string
  readonly supersedes: readonly string[]
}

/** One `TERRITORY-CATALOG.json` territory (`Territory`, `@atlas/contracts`). */
export interface AtlasTerritory {
  readonly name: string
  readonly owner: string
  readonly tier: string
  readonly globs: readonly string[]
}
