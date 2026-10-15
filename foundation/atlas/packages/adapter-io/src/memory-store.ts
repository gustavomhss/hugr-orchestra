// @atlas/adapter-io — src/memory-store.ts  (the DURABLE per-seat Memory store — CAMPAIGN-11 W2)
//
// ── CALLERS ──────────────────────────────────────────────────────────────────────────────────────────
// `compose.ts` (the CLI/MCP memory doors, CAMPAIGN-11 W8) and `native-memory.ts` (the bound Memory
// composition a harness drives under an explicit `AtlasBinding`). This header used to declare the module a
// reference model with no production callers; W8 made that false and the header outlived the fact.
//
// This file is now a thin PROJECTION over `durable-log.ts` — the append-only, content-keyed JSONL
// primitive, which carries the durability argument, the torn-line defence and the travel argument in one
// place. What is memory-specific and stays here: the file name, and the two conversions between a
// `MemoryRecord` and the sealed-kernel event that represents it.

import { join } from "node:path"
import type { EventLog } from "@atlas/kernel"
import { respawnFromRecord, versioned } from "@atlas/memory"
import type { MemoryRecord, MemoryStore } from "@atlas/memory"
import { createDurableLog } from "./durable-log.js"

/** The tracked log's path under a repo root. One file; no generations, because nothing is ever replaced. */
export const memoryLogPath = (repoPath: string): string => join(repoPath, ".atlas", "memory.jsonl")

/** What a read found — the folded store, the log it folded, and the lines the log refused. */
export interface MemoryRead {
  readonly store: MemoryStore
  readonly log: EventLog
  /** Lines that did not parse, or whose stored `id` is not their content hash. Never silently discarded. */
  readonly rejected: number
  /** The log FILE could not be read at all — see `LogRead.unreadable`. Absent on every readable outcome. */
  readonly unreadable?: true
}

/** The durable store's surface. Deliberately two verbs: memory is appended and folded, never mutated. */
export interface DurableMemory {
  readonly path: string
  /** Fold the tracked log into a store. Total — a missing file is an empty store, not an error. */
  read(): MemoryRead
  /** Append one record. Idempotent by content id: appending the same record twice folds to one. */
  append(record: MemoryRecord): void
}

export function createDurableMemory(repoPath: string): DurableMemory {
  const log = createDurableLog(memoryLogPath(repoPath))

  return {
    path: log.path,
    read(): MemoryRead {
      const raw = log.read()
      const base = { store: respawnFromRecord(raw.log), log: raw.log, rejected: raw.rejected }
      return raw.unreadable === true ? { ...base, unreadable: true } : base
    },
    append(record: MemoryRecord): void {
      // The record is versioned through `@atlas/memory` rather than event-shaped here, so the identity seam
      // stays the sealed kernel one and this adapter mints no ids of its own.
      const [ev] = [...versioned([record]).values()]
      if (ev === undefined) return
      log.append(ev)
    },
  }
}
