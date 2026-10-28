// @atlas/adapter-io — src/memory-store.ts  (the DURABLE per-seat Memory store — CAMPAIGN-11 W2)
//
// ── CALLERS ──────────────────────────────────────────────────────────────────────────────────────────
// `compose.ts` (the CLI/MCP memory doors, CAMPAIGN-11 W8) and `native-memory.ts` (the bound Memory
// composition a harness drives under an explicit `AtlasBinding`). This header used to declare the module a
// reference model with no production callers; W8 made that false and the header outlived the fact.
//
// This file is now a thin PROJECTION over `durable-log.ts` — the append-only, content-keyed JSONL
// primitive, which carries the durability argument, the torn-line defence and the travel argument in one
// place. What is memory-specific and stays here: which files a record goes to and is read from
// (`layout.ts`), and the two conversions between a `MemoryRecord` and the sealed-kernel event that
// represents it.
//
// Memory is many files: one per seat and kind, and one per task or PR (`memberMemoryPath`), so two
// branches that touch different units never touch the same file. A read folds the legacy single file first,
// then every member file in sorted order.

import type { EventLog } from "@atlas/kernel"
import { respawnFromRecord, versioned } from "@atlas/memory"
import type { MemoryRecord, MemoryStore } from "@atlas/memory"
import { createDurableLog, jsonlFiles, readDurableLogs } from "./durable-log.js"
import { legacyLogPath, memberMemoryPath, membersDir } from "./layout.js"

/** What a read found — the folded store, the log it folded, and the lines the log refused. */
export interface MemoryRead {
  readonly store: MemoryStore
  readonly log: EventLog
  /** Lines that did not parse, or whose stored `id` is not their content hash. Never silently discarded. */
  readonly rejected: number
  /** A log file or the members directory could not be read at all — see `LogRead.unreadable`. Absent on
   *  every readable outcome. */
  readonly unreadable?: true
}

/** The durable store's surface. Deliberately two verbs: memory is appended and folded, never mutated. */
export interface DurableMemory {
  /** The members directory every record is appended under — named in refusals, never opened as a file. */
  readonly path: string
  /** Fold the tracked logs into a store. Total — missing files are an empty store, not an error. */
  read(): MemoryRead
  /** Append one record. Idempotent by content id: appending the same record twice folds to one. */
  append(record: MemoryRecord): void
}

export function createDurableMemory(repoPath: string): DurableMemory {
  const dir = membersDir(repoPath)

  return {
    path: dir,
    read(): MemoryRead {
      const files = jsonlFiles(dir)
      // Only `<seat>/memory/` files: a seat's `knowledge/` logs hold other records.
      const memory = files.paths.filter((path) => path.slice(dir.length + 1).split(/[\\/]/)[1] === "memory")
      const raw = readDurableLogs([legacyLogPath(repoPath, "memory"), ...memory])
      const base = { store: respawnFromRecord(raw.log), log: raw.log, rejected: raw.rejected + (files.unreadable ? 1 : 0) }
      return raw.unreadable === true || files.unreadable === true ? { ...base, unreadable: true } : base
    },
    append(record: MemoryRecord): void {
      // The record is versioned through `@atlas/memory` rather than event-shaped here, so the identity seam
      // stays the sealed kernel one and this adapter mints no ids of its own.
      const [ev] = [...versioned([record]).values()]
      if (ev === undefined) return
      createDurableLog(memberMemoryPath(repoPath, record)).append(ev)
    },
  }
}
