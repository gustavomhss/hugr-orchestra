// @atlas/e2e — S7 · Memory is per-seat scoped and is NOT Knowledge
// AXIS: SECURITY (scoping-not-access-control + the Memory≠Knowledge partition — fail-closed, append-only).
//
// STORY. Memory and Knowledge live in the ONE Atlas on the same index/format, yet they are DISTINCT kinds
// that must never conflate, and a seat's Memory is scoped to that seat. This story drives the REAL wired
// @atlas/memory runtime across the package seam to prove five load-bearing laws:
//   (1) the Memory/Knowledge partition is fail-closed — a knowledge-shaped entry claimed as memory is
//       REJECTED with a `KindConflationError`, never silently stored on the wrong side (MEM-2),
//   (2) a member's turn-header injects ONLY that member's own Memory — 0 cross-seat leak — and an
//       unqualified recall surfaces NOTHING (explicit-only reads) (MEM-1 / MEM-4b),
//   (3) the running-turn header carries the seat's OWN project rules ONLY — task/pr/logbook never
//       auto-inject (`header ∩ {task,pr,logbook} = ∅`, MEM-4),
//   (4) the Rules-slab is CAPPED at 12 by frecency-desc, evicts a ~zero record even with free slots, and a
//       would-exceed token write is a STRUCTURED reject — never a silent truncation (MEM-3 / MEM-7),
//   (5) memory is NEVER deleted — a hard-delete THROWS and a non-orchestrator logbook append is refused
//       (the log returned UNCHANGED, not thrown) (MEM-7f / MEM-8a).
//
// THE PARK IS CLOSED (2026-08-30) — this header used to state the boundary; it now states what replaced it.
// `kinds.ts :: put(kind, entry)` had an OWNER-DEFINE-parked MATCHED branch that THREW on a *successful*
// write, because a `MemoryRecord` needs an `owner` and there was nowhere honest to get one. That refusal to
// fabricate was right, and this test pinned it as a throw. `reference/atlas-memory.md` §Decisions D1
// ratified the source — the composition root's already-resolved `actor` — so the signature took an `owner`
// argument and the branch materializes the record. The assertion here was REPLACED rather than deleted: a
// test that documented an absence became one that asserts the presence, which is the only honest way to
// retire a pin. Two teeth guard the new branch: an EMPTY owner is refused (`UnownedWriteError` — an unowned
// record would be injected to every caller whose actor also resolves empty), and the record's `kind` is
// DERIVED from the entry's shape, never announced by the payload.

import { describe, it, expect } from "vitest"
import {
  partition,
  put,
  KindConflationError,
  UnownedWriteError,
  injectFor,
  recall,
  assembleHeader,
  RULES_SLAB_SLOTS,
  rankRules,
  capGate,
  ruleOfTokens,
  MEMBER_TOK_CAP,
  makeRuleStore,
  makeLogbookStore,
  LOGBOOK_AUTHOR,
} from "@atlas/memory"
import type {
  MemoryStore,
  MemoryEntry,
  ProjectMemoryEntry,
  LogbookEntry,
  Awareness,
  Orientation,
  RuleRecord,
  RuleEvent,
} from "@atlas/memory"

// ── memory-shaped vs knowledge-shaped entries (the partition oracle is STRUCTURAL) ──────────────────────
const pmAlice: ProjectMemoryEntry = { rule: "always seam-only edits", scope: "src/**", frecency: 2 }
const pmBob: ProjectMemoryEntry = { rule: "never fold impurely", scope: "src/**", frecency: 3 }

/** A Knowledge fact (an `AdvisoryNode` `GroundedFact`) — a top-level `kind: 'advisory'` discriminant, which
 *  NO MemoryEntry carries. Cast at the deliberately-wrong write to exercise the MEM-2 conflation gate. */
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

// ── the shared, git-native store holding two seats' Memory (plaintext, one Atlas) ───────────────────────
const twoSeatStore: MemoryStore = [
  { owner: "alice", kind: "project", entry: pmAlice },
  { owner: "bob", kind: "project", entry: pmBob },
]

/** alice's full running-turn store: her project rule + EVERY consultable kind present (so MEM-4 has teeth). */
const runningStore: MemoryStore = [
  { owner: "alice", kind: "project", entry: pmAlice },
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

// ── the shared derived slabs (MEM-11 / MEM-6, sibling-owned) — trivial fixtures; this story composes them ─
const facet = { content: "", grounding: [] as const, state: "seeded" as const }
const AWARENESS: Awareness = { mission: facet, constitution: facet, terrain: facet, ontology: facet, taste: facet }
const ORIENTATION: Orientation = { goal: "ship S7", last: "MEM freeze", current: "exec", state: "green" }

// ── Rules-slab ledger fixtures (mirroring the WP-6.25-a proven shapes) ──────────────────────────────────
const rule = (id: string): RuleRecord => ({ id, entry: ruleOfTokens(id, 3) })
const cited = (ruleId: string, wave: number): RuleEvent => ({ ruleId, wave, governing: true })
const hitsAt = (ruleId: string, wave: number, n: number): RuleEvent[] =>
  Array.from({ length: n }, () => cited(ruleId, wave))

// ── a well-formed logbook entry (all five fixed sections filled within cap) ─────────────────────────────
const logbookEntry: LogbookEntry = {
  prId: "#42",
  at: "2026-07-19",
  territories: ["memory"],
  shipped: "implemented the logbook facet",
  decisions: "orchestrator-only; append-only; supersede by link",
  tradeoffs: "chose append-only entries over in-place editable ones",
  risks: "section caps are pinned bounds pending ratification",
  openThreads: "barrel wiring deferred to SEAL",
  links: ["pr://correction"],
}

describe("S7 · memory is per-seat scoped and is NOT Knowledge (fail-closed, append-only)", () => {
  it("fails closed on Memory↔Knowledge conflation — a knowledge-shaped entry never routes into memory (MEM-2)", () => {
    // the STRUCTURAL partition oracle: a knowledge fact carries a top-level `kind` discriminant, memory never does.
    expect(partition(knowledgeFact)).toBe("knowledge")
    expect(partition(pmAlice)).toBe("memory")

    // a write claiming `memory` for a knowledge-shaped entry is REJECTED fail-closed (claimed ≠ actual).
    // teeth (breaks-on "a knowledge-shaped entry is silently written as memory — the partition is bypassed"):
    expect(() => put("memory", knowledgeFact, "alice")).toThrow(KindConflationError)

    // [AMENDED 2026-08-30 — the park is CLOSED, so the assertion that PINNED it is REPLACED, not deleted.]
    // This line used to assert `.toThrow('OWNER-DEFINE-parked')`: a test documenting the ABSENCE of a
    // behaviour. `reference/atlas-memory.md` §Decisions D1 ratified the owner-source, so the matched branch
    // now materializes a record and the honest pin is that it does — with BOTH discriminants derived and
    // neither announced by the payload.
    const written = put("memory", pmAlice, "alice")
    expect(written).toEqual({ owner: "alice", kind: "project", entry: pmAlice })

    // teeth (breaks-on "an unowned write mints a record every empty-actor caller is then injected"):
    expect(() => put("memory", pmAlice, "")).toThrow(UnownedWriteError)
  })

  it("injects only a seat's own Memory and refuses a broad read — 0 cross-seat leak (MEM-1 / MEM-4b)", () => {
    const forAlice = injectFor(twoSeatStore, "alice")
    expect(forAlice).toHaveLength(1)
    expect(forAlice[0]?.entry).toEqual(pmAlice)
    // teeth (breaks-on "a seat's inject leaks another seat's memory"): 0 of bob's records reach alice.
    expect(forAlice.some((r) => r.owner === "bob")).toBe(false)

    // recall is EXPLICIT-only: an unqualified query (no recognizable selector) surfaces nothing — no broad read.
    expect(recall(twoSeatStore, {})).toEqual([])
    expect(recall(twoSeatStore, "give me everything")).toEqual([])
  })

  it("excludes task/pr/logbook from the running-turn header — consultable never auto-injects (MEM-4)", () => {
    // the store DOES hold every consultable kind, so the header exclusion is load-bearing.
    expect(runningStore.some((r) => r.kind === "task")).toBe(true)
    expect(runningStore.some((r) => r.kind === "pr")).toBe(true)
    expect(runningStore.some((r) => r.kind === "logbook")).toBe(true)

    const header = assembleHeader(runningStore, "alice", AWARENESS, ORIENTATION)
    expect(header.rules).toHaveLength(1) // alice's OWN project rule only
    expect(header.rules[0]).toEqual(pmAlice)
    // teeth (breaks-on "the orchestrator-only logbook/task/pr leaks into a member's turn header"):
    for (const injected of header.rules) {
      expect("taskId" in injected).toBe(false) // no task slab leaked
      expect("prId" in injected).toBe(false) // no pr / logbook slab leaked
    }
    expect(JSON.stringify(header.rules)).not.toContain("#41") // no consultable-kind payload rode along
  })

  it("caps the Rules-slab at 12 by frecency-desc, evicts a ~zero record with free slots, rejects over-cap tokens (MEM-3 / MEM-7)", () => {
    expect(RULES_SLAB_SLOTS).toBe(12)

    // 13 candidates: R1 hottest (4 fresh hits), R2..R12 fresh (3 hits), R13 the 13th (1 hit — capacity overflow).
    const records: RuleRecord[] = Array.from({ length: 13 }, (_, i) => rule(`R${i + 1}`))
    const ledger: RuleEvent[] = [...hitsAt("R1", 10, 4)]
    for (let i = 2; i <= 12; i++) ledger.push(...hitsAt(`R${i}`, 10, 3))
    ledger.push(cited("R13", 10)) // R13 → 1.0 (≥ near-zero: excluded by CAPACITY, not by ~zero eviction)

    const capped = rankRules(records, ledger)
    // teeth (breaks-on "the rules slab overflows 12 or silently truncates instead of a structured reject"):
    expect(capped.injected.length).toBeLessThanOrEqual(RULES_SLAB_SLOTS)
    expect(capped.injected).toHaveLength(12)
    expect(capped.injected[0]?.id).toBe("R1") // frecency-DESC — the hottest rule leads the slab
    expect(capped.evicted.map((r) => r.id)).toContain("R13") // the 13th overflows, retained-not-lost

    // a ~zero-frecency record is EVICTED even though only 4 of 12 slots are used (no LFU pinning).
    const sparse: RuleRecord[] = ["A", "B", "C", "D"].map(rule)
    const sparseLedger: RuleEvent[] = [
      ...hitsAt("A", 10, 3),
      ...hitsAt("B", 10, 3),
      ...hitsAt("C", 10, 3),
      cited("D", 2), // D decayed far below the near-zero floor at head wave 10
    ]
    const ranked = rankRules(sparse, sparseLedger)
    expect(ranked.injected.map((r) => r.id).sort()).toEqual(["A", "B", "C"])
    expect(ranked.evicted.map((r) => r.id)).toContain("D") // evicted at ~zero though 8 slots remain free

    // a would-exceed token write is a STRUCTURED reject (an honest receipt), NEVER a silent truncation.
    const overCap = capGate([ruleOfTokens("r1", 300), ruleOfTokens("r2", 300)], MEMBER_TOK_CAP)
    expect(overCap.accepted).toBe(false)
    expect(overCap.tokens).toBe(600) // the honest would-be total, not a silently-dropped 500
    expect(overCap.cap).toBe(MEMBER_TOK_CAP)
  })

  it("never deletes memory: a hard-delete THROWS and a non-orchestrator logbook append is refused (MEM-7f / MEM-8a)", () => {
    // the versioned Rules store rejects any hard-remove — memory is insert-only, evict-to-archive.
    const rules = makeRuleStore()
    rules.insert(rule("R1"))
    const sizeBefore = rules.size()
    // teeth (breaks-on "memory is deletable, or a non-orchestrator can append to the logbook"):
    expect(() => rules.attemptDelete("R1")).toThrow("memory is never deleted")
    expect(rules.size()).toBe(sizeBefore) // the rejected delete shrank nothing

    // the logbook is orchestrator-only: a member (non-`orch`) append is REFUSED — the log returns UNCHANGED,
    // not thrown (a fail-closed precondition, the entry simply never persists).
    const logbook = makeLogbookStore()
    const afterMember = logbook.append("alice", logbookEntry) // a member seat attempts the write
    expect(afterMember).toEqual([]) // refused — the append-only log is UNCHANGED
    expect(logbook.size()).toBe(0)

    // and the orchestrator's own append lands (the guard is a scoping predicate, not a total block).
    const afterOrch = logbook.append(LOGBOOK_AUTHOR, logbookEntry)
    expect(afterOrch.map((e) => e.prId)).toEqual(["#42"])
    expect(logbook.size()).toBe(1)
  })
})
