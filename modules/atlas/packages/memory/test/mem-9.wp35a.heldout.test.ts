// @atlas/memory — test/mem-9.wp35a.heldout.test.ts  (HELD-OUT GATE · WP-3.5-a.MEM)
//
// Independent transcription of the HELD-OUT `-2` fixture the builder never saw:
//   SCN-MEM-9a-2 — a multi-member store WITH an archived (evicted R13) entry round-trips 1:1.
// DIFFERENT store contents (multi-member pm-A/pm-B + archived R13, NOT one-of-each), SAME deepEqual
// round-trip branch as SCN-MEM-9a-1. Authored against EXISTING src — no source edits.
//
// 9b/9c carry NO `-2` fixture: goldens-mem.md:831 lists the two gen:residue SCN (MEM-9b/9c) as EXEMPT
// from the held-out leg (delegated secret-scrub arm, billy/FR-12). So this gate covers 9a only.

import { describe, it, expect } from "vitest"
import type { MemoryStore, ProjectMemoryEntry, TaskMemoryEntry, PrMemoryEntry, LogbookEntry } from "../src/types.js"
import { exportMemory, importMemory } from "../src/portable.js"

// pm-A / pm-B — two members' project memories
const pmA: ProjectMemoryEntry = { rule: "always scan before write", scope: "alice/**", frecency: 5 }
const pmB: ProjectMemoryEntry = { rule: "never inline a secret", scope: "bob/**", frecency: 2 }

// orch logbook entry
const orchLog: LogbookEntry = {
  prId: "PR-57",
  at: "2026-07-19T00:00:00Z",
  territories: ["memory"],
  shipped: "MEM-9 round-trip",
  decisions: "open JSON envelope",
  tradeoffs: "none",
  risks: "none",
  openThreads: "",
  links: ["PR-57"],
}

// a pr entry
const prEntry: PrMemoryEntry = {
  prId: "PR-58",
  decisions: ["reuse OKF discipline"],
  reviewOutcomes: ["approve"],
  knowledgeDelta: [],
}

// an ARCHIVED (evicted) R13 entry — the closing-fold task subset that survives eviction. Archived-ness
// rides the record as data (the frozen envelope has no archive flag); the round-trip must retain it.
const archivedR13: TaskMemoryEntry = {
  taskId: "R13-archived",
  attempted: ["export", "evict"],
  failedWith: [],
  stoppedAt: "archived",
  lesson: "evicted-but-retained memory still round-trips",
}

const multiMember: MemoryStore = [
  { owner: "alice", kind: "project", entry: pmA },
  { owner: "bob", kind: "project", entry: pmB },
  { owner: "orch", kind: "logbook", entry: orchLog },
  { owner: "alice", kind: "pr", entry: prEntry },
  { owner: "bob", kind: "task", entry: archivedR13 }, // the archived R13 entry
]

describe("SCN-MEM-9a-2 (held-out) — multi-member store w/ archived R13 round-trips 1:1 (REQ-MEM-9a)", () => {
  it("deepEqual(mem, import(export(mem))) holds — the archive included", () => {
    const round = importMemory(exportMemory(multiMember))
    expect(round).toEqual(multiMember) // deepEqual 1:1, archive included

    // teeth: an export that dropped the archived R13 entry (lossy encoding of evicted-but-retained
    // memory) would fail this — the archived record survives the round-trip.
    expect(round).toContainEqual({ owner: "bob", kind: "task", entry: archivedR13 })
    expect(round).toHaveLength(5)
  })

  it("the dump is open JSON with 0 host/external refs (no lock-in)", () => {
    const dump = exportMemory(multiMember)
    expect(dump).not.toMatch(/file:\/\//)
    expect(dump).not.toMatch(/\/Users\//)
    expect(dump).not.toMatch(/[a-z]+:\/\//)
  })
})
