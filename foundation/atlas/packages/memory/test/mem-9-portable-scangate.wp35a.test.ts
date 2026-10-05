// @atlas/memory — test/mem-9-portable-scangate.wp35a.test.ts  (WP-3.5-a.MEM · MEM-9)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for MEM-9:
//   SCN-MEM-9a-1 — export→import round-trips 1:1 as open JSON            (happy · conformance)
//   SCN-MEM-9b-1 — a named scanner runs in the pre-write path            (happy · residue/WIRING)
//   SCN-MEM-9c-1 — a scanner hit blocks the write (fail-closed)          (guard · residue/WIRING)
//
// Held-out `-2` fixtures (SCN-MEM-9a-2, …) are NOT transcribed — GATE runs those.
// Scanner DETECTION completeness is delegated to FR-12 (billy); the scanner-hit boolean is the delegated
// input here (a fixture scanner), so these residue goldens assert only pipeline WIRING + fail-closed.

import { describe, it, expect } from "vitest"
import type {
  MemoryStore,
  MemoryRecord,
  ProjectMemoryEntry,
  TaskMemoryEntry,
  PrMemoryEntry,
  LogbookEntry,
} from "../src/types.js"
import type { NamedScanner } from "../src/portable.js"
import {
  exportMemory,
  importMemory,
  makePortableMemory,
  writeWithScanner,
  ScannerBlockedError,
} from "../src/portable.js"

// ── fixtures: one entry of each memory type (project / task / pr / logbook) ────────────────────────

const project: ProjectMemoryEntry = {
  rule: "always run the pre-write scanner",
  scope: "packages/memory/**",
  frecency: 3,
}
const task: TaskMemoryEntry = {
  taskId: "T-9a",
  attempted: ["export via OKF envelope"],
  failedWith: [],
  stoppedAt: "green",
  lesson: "open JSON replays 1:1",
}
const pr: PrMemoryEntry = {
  prId: "PR-9a",
  decisions: ["reuse KERNEL-6 OKF discipline"],
  reviewOutcomes: ["approve"],
  knowledgeDelta: [],
}
const logbook: LogbookEntry = {
  prId: "PR-9a",
  at: "2026-07-18T00:00:00Z",
  territories: ["memory", "persist"],
  shipped: "MEM-9 portable + scanner gate",
  decisions: "fail-closed on scanner hit",
  tradeoffs: "none",
  risks: "delegated scanner detection",
  openThreads: "",
  links: ["PR-9a"],
}

const oneOfEach: MemoryStore = [
  { owner: "charlie", kind: "project", entry: project },
  { owner: "charlie", kind: "task", entry: task },
  { owner: "lucy", kind: "pr", entry: pr },
  { owner: "orch", kind: "logbook", entry: logbook },
]

// ── SCN-MEM-9a-1 — export→import round-trips 1:1 as open JSON (happy) ──────────────────────────────

describe("SCN-MEM-9a-1 — Memory exports to open JSON, replays 1:1 (REQ-MEM-9a)", () => {
  it("deepEqual(mem, import(export(mem))) — the open-JSON dump replays 1:1 into a fresh store", () => {
    const dump = exportMemory(oneOfEach)
    const round = importMemory(dump)
    expect(round).toEqual(oneOfEach) // deepEqual 1:1

    // teeth: an export that dropped the `task`-memory map (a lossy / lock-in encoding) would fail this —
    // the `task` record survives the round-trip.
    expect(round).toContainEqual({ owner: "charlie", kind: "task", entry: task })
  })

  it("the dump is OPEN JSON with 0 host/external refs (no lock-in)", () => {
    const dump = exportMemory(oneOfEach)
    // valid open JSON, self-describing envelope only (format tag + version + records verbatim)
    const parsed = JSON.parse(dump) as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(["format", "records", "version"])
    // grep the dump: no host path / external storage reference / proprietary URI
    expect(dump).not.toMatch(/file:\/\//)
    expect(dump).not.toMatch(/\/Users\//)
    expect(dump).not.toMatch(/[a-z]+:\/\//) // no scheme-qualified external ref of any kind
  })

  it("the store-attached PortableApi binder round-trips identically", () => {
    const api = makePortableMemory(oneOfEach)
    expect(api.import(api.export())).toEqual(oneOfEach)
  })

  it("import fails closed on a malformed / non-envelope dump (never a partial store)", () => {
    expect(() => importMemory("not json")).toThrow(/malformed OKF memory bundle/)
    expect(() => importMemory(JSON.stringify({ records: [] }))).toThrow(/malformed OKF memory bundle/)
  })
})

// ── SCN-MEM-9b-1 — a named scanner runs in the pre-write path (happy · WIRING) ─────────────────────

describe("SCN-MEM-9b-1 — a named scanner runs before the write persists (REQ-MEM-9b)", () => {
  it("the scanner stage is present and NAMED, and runs before the record is persisted", () => {
    const calls: string[] = []
    const record: MemoryRecord = { owner: "charlie", kind: "project", entry: project }
    const scanner: NamedScanner = {
      name: "gitleaks", // NAMED (gitleaks / trufflehog) — the golden requires the stage be named
      scan: (r): boolean => {
        calls.push(`scanned:${r.owner}`) // observe the scanner ran in the pre-write path
        return false // clean
      },
    }

    const before: MemoryStore = []
    const after = writeWithScanner(before, record, scanner)

    // the named scanner ran BEFORE the write persisted
    expect(scanner.name).toBe("gitleaks")
    expect(calls).toEqual(["scanned:charlie"])
    expect(after).toEqual([record]) // clean scan → the write persisted after the scanner
    expect(before).toEqual([]) // append-only, input store not mutated
  })

  it("teeth: an unnamed scanner is rejected — the pre-write stage MUST be a named scanner", () => {
    const record: MemoryRecord = { owner: "charlie", kind: "project", entry: project }
    const unnamed: NamedScanner = { name: "", scan: (): boolean => false }
    expect(() => writeWithScanner([], record, unnamed)).toThrow(/NAMED scanner/)
  })
})

// ── SCN-MEM-9c-1 — a scanner hit blocks the write (guard · WIRING) ─────────────────────────────────

describe("SCN-MEM-9c-1 — a scanner hit blocks the write, fail-closed (REQ-MEM-9c)", () => {
  it("on a hit the write is BLOCKED (fail-closed) — not redacted-and-continued, not logged-and-passed", () => {
    const record: MemoryRecord = {
      owner: "charlie",
      kind: "task",
      entry: { ...task, lesson: "ghp_PLANTEDSECRETshape123456" }, // planted secret (hit is delegated input)
    }
    const hitScanner: NamedScanner = {
      name: "trufflehog",
      scan: (): boolean => true, // the scanner signals a HIT (detection quality is billy/FR-12 territory)
    }

    const before: MemoryStore = []
    // fail-closed: the gate throws and the write never persists
    expect(() => writeWithScanner(before, record, hitScanner)).toThrow(ScannerBlockedError)
    // teeth: the write did NOT persist despite the hit (no redact-and-continue, no fail-open)
    expect(before).toEqual([])
  })

  it("the block is attributable to the named scanner (not a silent redaction)", () => {
    const record: MemoryRecord = { owner: "charlie", kind: "project", entry: project }
    const hitScanner: NamedScanner = { name: "gitleaks", scan: (): boolean => true }
    try {
      writeWithScanner([], record, hitScanner)
      expect.unreachable("write must be blocked on a scanner hit")
    } catch (e) {
      expect(e).toBeInstanceOf(ScannerBlockedError)
      expect((e as ScannerBlockedError).scannerName).toBe("gitleaks")
    }
  })
})
