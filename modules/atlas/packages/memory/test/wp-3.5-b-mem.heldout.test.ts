// @atlas/memory — test/wp-3.5-b-mem.heldout.test.ts  (WP-3.5-b.MEM — HELD-OUT gate, authored by cold review)
//
// Independent transcription of the `-2` held_out goldens the builder never saw
// (goldens-mem.md: SCN-MEM-10a-2 / 10b-2 / 13a-2 / 13b-2 / 13c-2). Runs against the EXISTING src surface
// ONLY — no src edits. The `pr`-kind -2 fixtures start from an ARCHIVED closing fold (per the golden's
// "Given ... archived closing fold carries {attempted, failedWith, stoppedAt, lesson}"), so they exercise
// the kind-AGNOSTIC push/scope/determinism of makeRespawn/spawnRecall — NOT any record->pr projection
// (foldArchiveFromRecord's pr branch is deliberately left to a later WP and is not needed here).

import { describe, it, expect } from "vitest"
import type { MemoryStore, TaskMemoryEntry } from "../src/types.js"
import type { ResumeUnit, ClosingFold } from "../src/respawn.js"
import {
  versioned,
  carry,
  typesIn,
  respawnFromRecord,
  makeRespawn,
  type ArchivedFold,
  type FoldArchive,
} from "../src/respawn.js"

const cloned = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const ALL_TYPES = new Set(["task", "project", "pr", "logbook"])

// ── SCN-MEM-10a-2 — two-member store, C1->C2, branch + SECOND fork; pr travels; monotone ────────────────────
describe("SCN-MEM-10a-2 (held-out) — every type travels across two commits and a second fork", () => {
  it("every type travels at commit/branch/second-fork; monotone across C1->C2", () => {
    const storeC1: MemoryStore = [
      {
        owner: "alice",
        kind: "task",
        entry: { taskId: "T7", attempted: ["a"], failedWith: ["x"], stoppedAt: "s", lesson: "l" },
      },
      { owner: "alice", kind: "project", entry: { rule: "guard optionals", scope: "render/*", frecency: 2 } },
      {
        owner: "bob",
        kind: "pr",
        entry: { prId: "#41", decisions: ["ship"], reviewOutcomes: ["approve"], knowledgeDelta: [] },
      },
      {
        owner: "orch",
        kind: "logbook",
        entry: {
          prId: "#41",
          at: "2026-07-19T00:00:00Z",
          territories: ["render"],
          shipped: "x",
          decisions: "y",
          tradeoffs: "n",
          risks: "n",
          openThreads: "n",
          links: [],
        },
      },
    ]
    // C2 advances the commit with new records from both members (union grows).
    const storeC2add: MemoryStore = [
      {
        owner: "bob",
        kind: "task",
        entry: { taskId: "T8", attempted: ["b"], failedWith: ["y"], stoppedAt: "s2", lesson: "l2" },
      },
      {
        owner: "alice",
        kind: "pr",
        entry: { prId: "#58", decisions: ["rebase"], reviewOutcomes: ["approve"], knowledgeDelta: [] },
      },
    ]

    const c1 = versioned(storeC1)
    const c2 = carry(c1, versioned(storeC2add)) // C1 -> C2 (git-native union carry)
    const branch = carry(c2)
    const fork1 = carry(branch)
    const fork2 = carry(fork1) // the SECOND fork

    for (const stage of [c1, c2, branch, fork1, fork2]) expect(typesIn(stage)).toEqual(ALL_TYPES)

    // monotone across the C1->C2 commit/branch/fork sequence.
    expect(c2.size).toBeGreaterThanOrEqual(c1.size)
    expect(branch.size).toBeGreaterThanOrEqual(c2.size)
    expect(fork1.size).toBeGreaterThanOrEqual(branch.size)
    expect(fork2.size).toBeGreaterThanOrEqual(fork1.size)

    // teeth: `pr` travels on the SECOND fork (a non-versioned side-store would drop it).
    expect(typesIn(fork2).has("pr")).toBe(true)
  })
})

// ── SCN-MEM-10b-2 — bob's run re-spawns solely from the record after a restart ──────────────────────────────
describe("SCN-MEM-10b-2 (held-out) — a second run re-spawns from the record after a restart", () => {
  it("bob's run rebuilds solely from the versioned record — no mutable snapshot", () => {
    const bobStore: MemoryStore = [
      {
        owner: "bob",
        kind: "task",
        entry: { taskId: "T8", attempted: ["b"], failedWith: ["y"], stoppedAt: "s2", lesson: "l2" },
      },
      {
        owner: "bob",
        kind: "pr",
        entry: { prId: "#58", decisions: ["rebase"], reviewOutcomes: ["approve"], knowledgeDelta: [] },
      },
    ]
    const record = versioned(bobStore)
    // process restart: only the git-tracked record survives (a deep clone), no in-memory snapshot.
    const rebuilt = respawnFromRecord(cloned([...record.values()]).reduce((m, ev) => (m.set(ev.id, ev), m), new Map()))
    expect(rebuilt.length).toBe(bobStore.length)
    expect(new Set(rebuilt.map((r) => `${r.owner}:${r.kind}`))).toEqual(
      new Set(bobStore.map((r) => `${r.owner}:${r.kind}`)),
    )
    // teeth: a second re-spawn off the same record is identical (no mutable snapshot needed).
    expect(respawnFromRecord(record)).toEqual(respawnFromRecord(record))
  })
})

// ── MEM-13 pr-fold held-out (13a-2 / 13b-2 / 13c-2) ──────────────────────────────────────────────────────────
// The archived pr closing fold carries the same {attempted, failedWith, stoppedAt, lesson} projection.
const pr58: ResumeUnit = { kind: "pr", id: "#58" }
const bobFold58: ClosingFold = {
  attempted: ["drafted #58", "rebased on main"],
  failedWith: ["CI red on lint"],
  stoppedAt: "ci job: lint",
  lesson: "run lint before push",
}
const archived = (owner: string, unit: ResumeUnit, fold: ClosingFold): ArchivedFold => ({ owner, unit, fold })

describe("SCN-MEM-13a-2 (held-out) — a re-spawned seat own prior PR fold is pushed at spawn", () => {
  it("bob's #58 pr fold is pushed at spawnRecall(bob, #58)", () => {
    const archive: FoldArchive = [archived("bob", pr58, bobFold58)]
    const pushed = makeRespawn(archive).spawnRecall("bob", pr58)
    expect(pushed).toEqual(bobFold58)
  })
})

describe("SCN-MEM-13b-2 (held-out) — the PR-fold spawn push is scoped to own + resumed only", () => {
  it("only bob's own #58 is pushed — not alice's #58, not a general consultable pr", () => {
    const aliceFold58: ClosingFold = { ...bobFold58, lesson: "alice-foreign-lesson", attempted: ["alice-different"] }
    const generalPr: ClosingFold = { ...bobFold58, lesson: "general-consultable" }
    const archive: FoldArchive = [
      archived("bob", pr58, bobFold58),
      archived("alice", pr58, aliceFold58), // foreign seat, same unit
      archived("bob", { kind: "pr", id: "#99" }, generalPr), // own seat, DIFFERENT (non-resumed) unit
    ]
    const pushed = makeRespawn(archive).spawnRecall("bob", pr58)
    expect(pushed.lesson).toBe(bobFold58.lesson)
    expect(pushed.lesson).not.toBe("alice-foreign-lesson")
    expect(pushed.lesson).not.toBe("general-consultable")
    expect(pushed.attempted).not.toContain("alice-different")
  })
})

describe("SCN-MEM-13c-2 (held-out) — the PR-fold spawn recall is deterministic off the archived record", () => {
  it("two spawns push the identical fold, and it is a copy, not an alias", () => {
    const respawn = makeRespawn([archived("bob", pr58, bobFold58)])
    const first = respawn.spawnRecall("bob", pr58)
    const second = respawn.spawnRecall("bob", pr58)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })
})
