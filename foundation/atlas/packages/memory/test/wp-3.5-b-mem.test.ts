// @atlas/memory — test/wp-3.5-b-mem.test.ts  (WP-3.5-b.MEM)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for MEM-10 (versioned & travels; re-spawnable from
// record) + MEM-13 (recall pushed at re-spawn off the archived fold). The facet is imported DIRECTLY from
// ../src/respawn.js (the barrel is wired by the lead at SEAL). Memory identity/versioning is content-keyed
// over the SEALED @atlas/kernel `id` seam (never a hand-rolled digest), so every travel/monotone assertion
// is RELATIONAL — never a specific hex digest. Held-out `-2` fixtures (bob / `pr #58`) are NOT transcribed.
//
// SEAM (WP-3.5-b.PERSIST, frozen upstream): the PERSIST `Checkpoint` archived-fold re-spawn substrate is
// consumed here AS A FIXTURE — the upstream runtime is not yet wired into memory's package deps, so the
// frozen persist ref TYPE is transcribed as a local structural fixture (`SUBSTRATE`) that matches
// @atlas/persist ref/types.ts `Checkpoint` (seatBrief + llmOutputs + toolIO). FLAG: interface_contract
// digest is `<filled-at-freeze>` (simulated) — resolved by disciplined judgment, not a real freeze hash.

import { describe, it, expect } from "vitest"
import type { MemoryRecord, MemoryStore, TaskMemoryEntry } from "../src/types.js"
import type { ResumeUnit } from "../src/respawn.js"
import {
  versioned,
  carry,
  typesIn,
  respawnFromRecord,
  makeRespawn,
  foldArchiveFromRecord,
  archiveTaskFold,
} from "../src/respawn.js"

/** A deep clone to another machine = an independent copy of the git-tracked record (no shared refs). */
const cloned = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** The PERSIST-produced archived-fold re-spawn substrate, transcribed from the FROZEN @atlas/persist
 *  ref/types.ts `Checkpoint` shape and bound here as a seam fixture (see header). */
interface Substrate {
  readonly seatBrief: string
  readonly llmOutputs: readonly string[]
  readonly toolIO: readonly string[]
}

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────────

const aliceT7: TaskMemoryEntry = {
  taskId: "T7",
  attempted: ["wire the widget", "retry with the flag"],
  failedWith: ["null deref in render"],
  stoppedAt: "render() line 42",
  lesson: "guard the optional before render",
}

/** A full memory store — every type, both a seat and the orchestrator — at commit C1. */
const storeC1: MemoryStore = [
  { owner: "alice", kind: "task", entry: aliceT7 },
  { owner: "alice", kind: "project", entry: { rule: "always guard optionals", scope: "render/*", frecency: 3 } },
  {
    owner: "alice",
    kind: "pr",
    entry: { prId: "#41", decisions: ["ship the guard"], reviewOutcomes: ["approve"], knowledgeDelta: [] },
  },
  {
    owner: "orch",
    kind: "logbook",
    entry: {
      prId: "#41",
      at: "2026-07-19T00:00:00Z",
      territories: ["render"],
      shipped: "the guard",
      decisions: "guard before render",
      tradeoffs: "none",
      risks: "none",
      openThreads: "none",
      links: [],
    },
  },
]

const ALL_TYPES = new Set<MemoryRecord["kind"]>(["task", "project", "pr", "logbook"])

// ── REQ-MEM-10a — every memory type versioned & travels ──────────────────────────────────────────────────

describe("MEM-10a — every memory type is versioned with the repo and travels (visible goldens)", () => {
  it("SCN-MEM-10a-1: every type travels at commit/branch/fork; log-length is monotone", () => {
    const c1 = versioned(storeC1) // the versioned record at commit C1
    const branch = carry(c1) // branch inherits the whole versioned log (git-native carry)
    const fork = carry(branch) // fork inherits it too — nothing left behind

    // every memory TYPE is present at commit / branch / fork — none siphoned into a non-versioned side-store.
    for (const stage of [c1, branch, fork]) expect(typesIn(stage)).toEqual(ALL_TYPES)

    // log-length is monotone (non-decreasing) across the simulated commit → branch → fork.
    expect(branch.size).toBeGreaterThanOrEqual(c1.size)
    expect(fork.size).toBeGreaterThanOrEqual(branch.size)

    // teeth: `task` travels on the fork (a non-versioned side-store would drop it here).
    expect(typesIn(fork).has("task")).toBe(true)
  })
})

// ── REQ-MEM-10b — a run rebuilds solely from the versioned record ────────────────────────────────────────

describe("MEM-10b — an ephemeral run is re-spawnable solely from the versioned record (visible goldens)", () => {
  it("SCN-MEM-10b-1: a run rebuilds solely from the record — no mutable in-memory snapshot", () => {
    // the run's transcript substrate is the PERSIST-produced archived-fold Checkpoint (seam fixture);
    // the MEMORY slice rebuilds its own git-native record with no reliance on that live substrate.
    const substrate: Substrate = {
      seatBrief: "WP · alice re-spawn",
      llmOutputs: ["plan", "edit render.ts"],
      toolIO: ["read render.ts", "write render.ts"],
    }
    void substrate // bound at the seam; the rebuild below reads the versioned record ALONE.

    const record = versioned(storeC1)

    // simulate a process restart: nothing survives in memory except the git-tracked record (a deep clone).
    const rebuilt = respawnFromRecord(
      cloned([...record.values()]).reduce((m, ev) => {
        m.set(ev.id, ev)
        return m
      }, new Map()),
    )

    // rebuilt SOLELY from the record — same members × types, nothing lost.
    expect(rebuilt.length).toBe(storeC1.length)
    expect(new Set(rebuilt.map((r) => `${r.owner}:${r.kind}`))).toEqual(
      new Set(storeC1.map((r) => `${r.owner}:${r.kind}`)),
    )

    // teeth: a second re-spawn off the SAME record yields the identical store (no mutable snapshot needed).
    const again = respawnFromRecord(record)
    expect(again).toEqual(respawnFromRecord(record))
  })
})

// ── REQ-MEM-13a/b/c — recall pushed at re-spawn, scoped, deterministic ──────────────────────────────────

describe("MEM-13 — recall fires at re-spawn (push, not pull) off the archived fold (visible goldens)", () => {
  const T7: ResumeUnit = { kind: "task", id: "T7" }

  it("SCN-MEM-13a-1: a re-spawned seat’s own prior fold is pushed at spawn", () => {
    // alice's T7 closing fold archived in MEM-10's versioned record.
    const archive = foldArchiveFromRecord(versioned([{ owner: "alice", kind: "task", entry: aliceT7 }]))
    const respawn = makeRespawn(archive)

    // at spawn the fold is PUSHED (returned synchronously), not awaited as a discretionary memory-recall.
    const pushed = respawn.spawnRecall("alice", T7)
    expect(pushed).toEqual({
      attempted: aliceT7.attempted,
      failedWith: aliceT7.failedWith,
      stoppedAt: aliceT7.stoppedAt,
      lesson: aliceT7.lesson,
    })
  })

  it("SCN-MEM-13b-1: the spawn push is scoped to own + resumed only", () => {
    const bobT7: TaskMemoryEntry = { ...aliceT7, attempted: ["bob-different"], lesson: "bob-lesson" }
    // at re-spawn: alice's own T7, bob's T7, and a general consultable task (a DIFFERENT unit T9).
    const archive = [
      archiveTaskFold("alice", aliceT7),
      archiveTaskFold("bob", bobT7),
      archiveTaskFold("alice", { ...aliceT7, taskId: "T9", lesson: "general-consultable" }),
    ]
    const pushed = makeRespawn(archive).spawnRecall("alice", T7)

    // ONLY alice's own fold for the resumed T7 — not bob's, not the general consultable T9.
    expect(pushed.lesson).toBe(aliceT7.lesson)
    expect(pushed.lesson).not.toBe("bob-lesson")
    expect(pushed.lesson).not.toBe("general-consultable")
    expect(pushed.attempted).not.toContain("bob-different")
  })

  it("SCN-MEM-13c-1: the spawn recall is deterministic off the archived record", () => {
    const respawn = makeRespawn([archiveTaskFold("alice", aliceT7)])
    // run the spawn recall TWICE — both runs push the identical fold, off the archived record (not live state).
    const first = respawn.spawnRecall("alice", T7)
    const second = respawn.spawnRecall("alice", T7)
    expect(second).toEqual(first)
    // and it is a copy, not an alias of mutable archive state.
    expect(second).not.toBe(first)
  })
})
