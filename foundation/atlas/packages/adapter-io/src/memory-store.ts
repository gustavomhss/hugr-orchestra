// @atlas/adapter-io — src/memory-store.ts  (the DURABLE per-seat Memory store — CAMPAIGN-11 W2)
//
// ── REFERENCE MODEL — NO PRODUCTION CALLERS ──────────────────────────────────────────────────────────
// Nothing in `packages/*/src` calls `createDurableMemory` yet. The doors that will are later work packages
// in the same campaign: W4 (the governed write door) and W6 (the read doors). This is DECLARED in
// `harness/gates/reference-model-guard.mjs` rather than pre-wired, because wiring a door early to clear
// that gate is exactly the stub the gate exists to refuse — and a door with no gates behind it is worse
// than no door. The entry goes stale the moment W4 composes this, and the ledger's STALE leg says so out
// loud when it does.
//
// It is a reference model in CALLERS only, not in rigour: the acceptance items it owns (A1-A4) are driven
// against the real filesystem, and A4 with eight real subprocesses.
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
      const { log: folded, rejected } = log.read()
      return { store: respawnFromRecord(folded), log: folded, rejected }
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
