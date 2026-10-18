// @atlas/memory — test/wp-6.23-mem.test.ts  (WP-6.23.MEM · MEM-1 / MEM-2 / MEM-4)
//
// RED→GREEN transcription of the VISIBLE `-1` acceptance goldens for:
//   · MEM-1a  SCN-MEM-1a-1 — a turn-header injects ONLY the seat's own entries (owner-SCOPING).
//   · MEM-1b  SCN-MEM-1b-1 — a repo reader reads every seat's Memory bytes (scoping ≠ access-control).
//   · MEM-2a  SCN-MEM-2a-1 — a Memory entry routed into Knowledge is REJECTED.
//   · MEM-2b  SCN-MEM-2b-1 — a Knowledge fact routed into Memory is REJECTED.
//   · MEM-4a  SCN-MEM-4a-1 — task/pr/logbook NEVER auto-inject on a running turn (header ∩ consultable = ∅).
//   · MEM-4b  SCN-MEM-4b-1 — task memory is returned ONLY on an explicit `memory-recall`.
//
// Facets imported DIRECTLY from ../src/inject.js + ../src/kinds.js (the barrel is wired by the lead at
// SEAL). Held-out `-2` fixtures (bob mirror / logbook-into-knowledge / ontology-into-memory / pr) are NOT
// transcribed here. The shared Awareness/Orientation slabs are sibling-owned (WP-6.24-a/-b) and bound here
// as trivial fixtures — this WP consumes them, never authors them. FLAG: interface_contract digest is
// `<filled-at-freeze>` (simulated) — resolved by disciplined judgment, not a real freeze hash.

import { describe, it, expect } from "vitest"
import type { Awareness, Orientation, MemoryEntry, MemoryStore, ProjectMemoryEntry } from "../src/types.js"
import { assembleHeader, injectFor, readRepoBytes, recall } from "../src/inject.js"
import { partition, put } from "../src/kinds.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────────

const pmA: ProjectMemoryEntry = { rule: "always seam-only edits", scope: "src/**", frecency: 2 }
const pmB: ProjectMemoryEntry = { rule: "never fold impurely", scope: "src/**", frecency: 3 }

/** A shared, git-native store holding two seats' project memory — plaintext, one Atlas. */
const store: MemoryStore = [
  { owner: "alice", kind: "project", entry: pmA },
  { owner: "bob", kind: "project", entry: pmB },
]

/** A minimal Knowledge fact (an `AdvisoryNode` — `GroundedFact`), cast at the deliberately-wrong write. */
const knowledgeFact = {
  kind: "advisory",
  id: "nk-1",
  tier: "T2",
  claimNorm: "the widget guards its optional",
  grounding: { path: "src/widget.ts", subtreeHash: "st-1" },
  freshness: "FRESH",
  claims: [],
  authoring: "ADVISORY",
} as unknown as MemoryEntry

/** Sibling-owned shared slabs (WP-6.24-a/-b) — trivial fixtures; this WP only composes them. */
const facet = { content: "", grounding: [] as const, state: "seeded" as const }
const AWARENESS: Awareness = {
  mission: facet,
  constitution: facet,
  terrain: facet,
  ontology: facet,
  taste: facet,
}
const ORIENTATION: Orientation = { goal: "ship WP-6.23", last: "MEM freeze", current: "exec", state: "green" }

/** A full running-turn store for alice: one project rule + every CONSULTABLE kind present. */
const running: MemoryStore = [
  { owner: "alice", kind: "project", entry: pmA },
  {
    owner: "alice",
    kind: "task",
    entry: { taskId: "T7", attempted: ["a"], failedWith: ["b"], stoppedAt: "x", lesson: "guard it" },
  },
  {
    owner: "alice",
    kind: "pr",
    entry: { prId: "#41", decisions: ["ship"], reviewOutcomes: ["approve"], knowledgeDelta: [] },
  },
  {
    owner: "orch",
    kind: "logbook",
    entry: {
      prId: "#41",
      at: "2026-07-19",
      territories: ["memory"],
      shipped: "s",
      decisions: "d",
      tradeoffs: "t",
      risks: "r",
      openThreads: "o",
      links: [],
    },
  },
]

// ── MEM-1a · SCN-MEM-1a-1 — own-only injection scoping ───────────────────────────────────────────────────

describe("SCN-MEM-1a-1 — a turn-header injects only the seat own entries (scoping)", () => {
  it("injects alice pm-A and 0 entries owned by bob", () => {
    const injected = injectFor(store, "alice")
    expect(injected).toHaveLength(1)
    expect(injected[0]?.entry).toEqual(pmA)
    expect(injected.some((r) => r.owner === "bob")).toBe(false) // 0 cross-seat leak (a scoping predicate)
  })
})

// ── MEM-1b · SCN-MEM-1b-1 — scoping is NOT access-control (bytes stay readable) ───────────────────────────

describe("SCN-MEM-1b-1 — a repo reader reads every seat Memory bytes (by design)", () => {
  it("lets bob (repo-read only) read alice pm-A bytes — no per-seat gate", () => {
    const visible = readRepoBytes(store, "bob") // a non-owner repo reader
    const seesAlice = visible.some((r) => r.owner === "alice" && (r.entry as ProjectMemoryEntry).rule === pmA.rule)
    expect(seesAlice).toBe(true) // readability is the design; scoping ≠ confidentiality
  })
})

// ── MEM-2a · SCN-MEM-2a-1 — a Memory entry routed into Knowledge is rejected ─────────────────────────────

describe("SCN-MEM-2a-1 — a Memory entry routed into Knowledge is rejected", () => {
  it("rejects put(knowledge, <Memory entry>) — partition(entry) must equal the claimed kind", () => {
    expect(partition(pmA)).toBe("memory")
    expect(() => put("knowledge", pmA, "alice")).toThrow()
  })
})

// ── MEM-2b · SCN-MEM-2b-1 — a Knowledge fact routed into Memory is rejected ───────────────────────────────

describe("SCN-MEM-2b-1 — a Knowledge fact routed into Memory is rejected", () => {
  it("rejects put(memory, <Knowledge fact>) — no Knowledge fact is stored as Memory", () => {
    expect(partition(knowledgeFact)).toBe("knowledge")
    expect(() => put("memory", knowledgeFact, "alice")).toThrow()
  })
})

// ── MEM-4a · SCN-MEM-4a-1 — consultable never auto-injects on a running turn ──────────────────────────────

describe("SCN-MEM-4a-1 — task/pr/logbook never auto-inject on a running turn", () => {
  it("assembles a header whose ∩ with {task,pr,logbook} is empty", () => {
    // the store DOES hold every consultable kind — so the exclusion is load-bearing
    expect(running.some((r) => r.kind === "task")).toBe(true)
    expect(running.some((r) => r.kind === "pr")).toBe(true)
    expect(running.some((r) => r.kind === "logbook")).toBe(true)

    const header = assembleHeader(running, "alice", AWARENESS, ORIENTATION)
    expect(header.rules).toHaveLength(1) // only the own project rule
    expect(header.rules[0]).toEqual(pmA)
    for (const rule of header.rules) {
      expect("taskId" in rule).toBe(false) // no task leaked
      expect("prId" in rule).toBe(false) // no pr / logbook leaked
    }
  })
})

// ── MEM-4b · SCN-MEM-4b-1 — consultable only via explicit memory-recall ───────────────────────────────────

describe("SCN-MEM-4b-1 — task memory is returned only on an explicit memory-recall", () => {
  it("returns the task via recall and on no injection path", () => {
    // explicit recall → the task surfaces
    const recalled = recall(running, { owner: "alice", kind: "task" })
    expect(recalled.some((r) => r.kind === "task")).toBe(true)

    // the running-turn header (a non-recall path) never surfaces it
    const header = assembleHeader(running, "alice", AWARENESS, ORIENTATION)
    expect(header.rules.some((rule) => "taskId" in rule)).toBe(false)
  })
})
