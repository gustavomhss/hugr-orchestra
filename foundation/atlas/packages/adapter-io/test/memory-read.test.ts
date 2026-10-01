// @atlas/adapter-io — test/memory-read.test.ts  (CAMPAIGN-11 W6 — the memory READ doors)
//
// Owns A11, A12, A15, A23, A24, A25, A26, A31. Every test drives `createMemoryRead` over a REAL durable
// store on a real temp directory — never an in-memory array — because the door's whole job is composing
// `@atlas/memory`'s pure primitives over WHAT IS ACTUALLY ON DISK, and a test that never touches disk
// proves nothing about that composition.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDurableMemory } from "../src/memory-store.js"
import { createMemoryRead } from "../src/memory-read.js"
import { RULES_SLAB_SLOTS } from "@atlas/memory"
import type { Awareness, MemoryRecord, Orientation, ProjectMemoryEntry } from "@atlas/memory"

let repo: string

const facet = (content: string) => ({ content, grounding: [], state: "seeded" as const })
const AW: Awareness = {
  mission: facet("m"),
  constitution: facet("c"),
  terrain: facet("t"),
  ontology: facet("o"),
  taste: facet("x"),
}
const OR: Orientation = { goal: "g", last: "l", current: "c", state: "s" }

const project = (owner: string, rule: string, frecency: number): MemoryRecord => ({
  owner,
  kind: "project",
  entry: { rule, scope: "*", frecency },
})

const task = (owner: string, taskId: string, tag: string): MemoryRecord => ({
  owner,
  kind: "task",
  entry: { taskId, attempted: [`a-${tag}`], failedWith: [`f-${tag}`], stoppedAt: `s-${tag}`, lesson: `l-${tag}` },
})

const pr = (owner: string, prId: string): MemoryRecord => ({
  owner,
  kind: "pr",
  entry: { prId, decisions: ["d"], reviewOutcomes: ["r"], knowledgeDelta: [] },
})

const logbook = (prId: string): MemoryRecord => ({
  owner: "orch",
  kind: "logbook",
  entry: {
    prId,
    at: "1",
    territories: [],
    shipped: "s",
    decisions: "d",
    tradeoffs: "t",
    risks: "r",
    openThreads: "o",
    links: [],
  },
})

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-memread-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe("A11 — the read returns ONLY the calling actor's records, over the durable store", () => {
  it("zero cross-seat leak in the ranked project slab and the header", () => {
    const store = createDurableMemory(repo)
    store.append(project("lucy", "rule-lucy", 5))
    store.append(project("billy", "rule-billy", 5))
    const door = createMemoryRead({ store, actor: "lucy" })

    const slab = door.projectSlab()
    expect(slab.injected.map((e) => e.rule)).toEqual(["rule-lucy"])
    expect(slab.evicted).toEqual([])

    const header = door.header(AW, OR)
    expect(header.rules.map((e) => e.rule)).toEqual(["rule-lucy"])
    // teeth (breaks-on "the door reads the whole store instead of the owner-scoped slice").
    expect(JSON.stringify(header)).not.toContain("billy")
  })
})

describe("A12 — task / pr / logbook never appear in a turn header without an explicit recall", () => {
  it("the header excludes them structurally AND by content; recall returns them", () => {
    const store = createDurableMemory(repo)
    store.append(task("lucy", "t1", "x"))
    store.append(pr("lucy", "pr1"))
    store.append(logbook("pr1"))
    store.append(project("lucy", "r1", 5))
    const door = createMemoryRead({ store, actor: "lucy" })

    const header = door.header(AW, OR)
    expect(Object.keys(header).sort()).toEqual(["awareness", "orientation", "rules"])
    // teeth (breaks-on "a consultable kind leaked into the header's bytes").
    expect(JSON.stringify(header)).not.toContain("t1")
    expect(JSON.stringify(header)).not.toContain('"pr1"')

    expect(door.recall({ owner: "lucy", kind: "task" })).toHaveLength(1)
    expect(door.recall({ owner: "lucy", kind: "pr" })).toHaveLength(1)
  })

  it("an unqualified query returns nothing — recall is explicit, never a general dump", () => {
    const store = createDurableMemory(repo)
    store.append(task("lucy", "t1", "x"))
    const door = createMemoryRead({ store, actor: "lucy" })
    expect(door.recall({})).toEqual([])
  })
})

describe("A15 — a re-spawn pushes the seat's own prior closing fold for the resumed unit, and nothing else", () => {
  it("pushes only the matching (owner, unit) fold", () => {
    const store = createDurableMemory(repo)
    store.append(task("lucy", "t1", "lucy-own"))
    store.append(task("billy", "t1", "billy-same-id"))
    store.append(task("lucy", "t2", "lucy-other-unit"))
    const door = createMemoryRead({ store, actor: "lucy" })

    const v = door.spawnFold({ kind: "task", id: "t1" })
    expect(v.ok).toBe(true)
    expect((v as { fold: { attempted: readonly string[] } }).fold).toEqual({
      attempted: ["a-lucy-own"],
      failedWith: ["f-lucy-own"],
      stoppedAt: "s-lucy-own",
      lesson: "l-lucy-own",
    })
  })

  it("refuses fail-closed when the seat has no own archived fold for the unit", () => {
    const store = createDurableMemory(repo)
    store.append(task("billy", "t1", "x"))
    const door = createMemoryRead({ store, actor: "lucy" })
    const v = door.spawnFold({ kind: "task", id: "t1" })
    expect(v.ok).toBe(false)
    expect((v as { refusal: string }).refusal).toBe("no-own-fold")
  })
})

describe("A23 — the injected project set is the TOP-12 by frecency, descending, through the durable store", () => {
  it("caps at 12, ordered by effective frecency, sourced from real appended records", () => {
    const store = createDurableMemory(repo)
    const ids = Array.from({ length: 15 }, (_, i) => `r${String(i).padStart(2, "0")}`)
    for (const id of ids) store.append(project("lucy", id, 1000)) // r00 oldest .. r14 newest
    const door = createMemoryRead({ store, actor: "lucy" })

    const slab = door.projectSlab()
    expect(slab.injected).toHaveLength(RULES_SLAB_SLOTS)
    const expectedDesc = [...ids].reverse().slice(0, RULES_SLAB_SLOTS) // r14..r03, newest-first
    expect(slab.injected.map((e) => e.rule)).toEqual(expectedDesc)
    // r02/r01 clear the near-zero floor but lose the CAPACITY cut; r00 is genuinely near-zero — all 3 land
    // in evicted, for two different reasons (see the A24 test for the near-zero-alone case).
    expect(new Set(slab.evicted.map((e) => e.rule))).toEqual(new Set(["r02", "r01", "r00"]))
  })
})

describe("A24 — a ~zero-frecency record is EVICTED even when slots are free", () => {
  it("evicts a low-frecency record with only 2 total records and 12 slots open", () => {
    const store = createDurableMemory(repo)
    store.append(project("lucy", "cold", 1)) // stored frecency 1, wave 0
    for (let i = 0; i < 4; i++) store.append(project("filler", `f${i}`, 1)) // ages 'cold' to gap 5
    store.append(project("lucy", "hot", 1000))
    const door = createMemoryRead({ store, actor: "lucy" })

    const slab = door.projectSlab()
    expect(slab.injected.map((e) => e.rule)).toEqual(["hot"])
    expect(slab.evicted.map((e) => e.rule)).toEqual(["cold"])
    // teeth (breaks-on "eviction only fires once the slots are full").
    expect(slab.injected.length).toBeLessThan(RULES_SLAB_SLOTS)
  })
})

describe("A25 — an evicted record is still re-spawnable — nothing dies (MEM-7f)", () => {
  it("respawnRule finds it, and the durable record was never touched", () => {
    const store = createDurableMemory(repo)
    store.append(project("lucy", "cold", 1))
    for (let i = 0; i < 4; i++) store.append(project("filler", `f${i}`, 1))
    store.append(project("lucy", "hot", 1000))
    const door = createMemoryRead({ store, actor: "lucy" })

    expect(door.projectSlab().evicted.map((e) => e.rule)).toContain("cold")
    const v = door.respawnRule("cold")
    expect(v.ok).toBe(true)
    expect((v as { entry: ProjectMemoryEntry }).entry.rule).toBe("cold")
    // nothing was deleted — a completely fresh read still carries every appended record.
    expect(createDurableMemory(repo).read().store).toHaveLength(6)
  })

  it("refuses a rule that is already injected — nothing to respawn", () => {
    const store = createDurableMemory(repo)
    store.append(project("lucy", "hot", 1000))
    const door = createMemoryRead({ store, actor: "lucy" })
    const v = door.respawnRule("hot")
    expect(v.ok).toBe(false)
    expect((v as { refusal: string }).refusal).toBe("not-evicted")
  })

  it("refuses an unknown rule id", () => {
    const store = createDurableMemory(repo)
    const door = createMemoryRead({ store, actor: "lucy" })
    const v = door.respawnRule("nope")
    expect(v.ok).toBe(false)
    expect((v as { refusal: string }).refusal).toBe("unknown-rule")
  })
})

describe("A26 — frecency decays over LOGGED WAVES, never wall-clock", () => {
  it("is unaffected by a huge system-clock jump with no new log entries, and DOES move once new entries land", () => {
    const store = createDurableMemory(repo)
    store.append(project("lucy", "old", 1000)) // wave 0
    for (let i = 0; i < 13; i++) store.append(project("filler", `f${i}`, 1)) // wave 1..13, 'old' now age 13
    const door = createMemoryRead({ store, actor: "lucy" })

    // age 13: effective = 1000 * 0.5^13 ≈ 0.122 — just above the 0.1 floor.
    expect(door.projectSlab().injected.map((e) => e.rule)).toContain("old")

    // Jump the SYSTEM CLOCK forward ten years. Zero new durable-log entries. A wall-clock-keyed decay would
    // collapse 'old' toward zero here; this asserts it does NOT move — teeth against exactly that mutation.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000))
    try {
      expect(door.projectSlab().injected.map((e) => e.rule)).toContain("old")
    } finally {
      vi.useRealTimers()
    }

    // NOW log one more wave (real elapsed time: none) and confirm decay DOES move — the ledger, not the
    // clock, is what ages an entry.
    store.append(project("filler", "f13", 1)) // wave 14, 'old' now age 14
    expect(door.projectSlab().evicted.map((e) => e.rule)).toContain("old")
  })
})

describe("A31 — the logbook is consultable and has NO inject path at all", () => {
  it("never rides the header; recall returns it by kind", () => {
    const store = createDurableMemory(repo)
    store.append(logbook("PR-9"))
    const door = createMemoryRead({ store, actor: "orch" })

    const header = door.header(AW, OR)
    expect(Object.keys(header).sort()).toEqual(["awareness", "orientation", "rules"])
    expect(JSON.stringify(header)).not.toContain("PR-9")

    const recalled = door.recall({ kind: "logbook" })
    expect(recalled).toHaveLength(1)
    expect((recalled[0]!.entry as { prId: string }).prId).toBe("PR-9")
  })
})
