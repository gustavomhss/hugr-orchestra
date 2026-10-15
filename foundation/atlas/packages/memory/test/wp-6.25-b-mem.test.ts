// @atlas/memory — test/wp-6.25-b-mem.test.ts  (WP-6.25-b.MEM)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for EPIC-25-b: the MEM-5 templated-write gate +
// the MEM-8 orchestrator-only, one-per-PR, capped, consultable-never-injected, supersede-by-link logbook.
// The facet is imported DIRECTLY from ../src/template.js + ../src/logbook.js (the barrel is wired by the
// lead at SEAL). The store's append-only floor + record identity go through the SEALED @atlas/kernel
// `id`/`createLog` seam (KERNEL-4) — no hand-rolled digest. Held-out `-2` fixtures (SCN-MEM-5a-2 /
// 5b-2 / 8a-2 / 8b-2 / 8c-2 / 8d-2 / 8e-2) are NOT transcribed.
//
// BIND NOTES (disciplined judgment vs the FROZEN ref/template.ts + ref/logbook.ts oracles — the card's
// content_hash / source_reqs / acceptance digests are `<filled-at-freeze>`, simulated):
//   · the orchestrator author id — the goldens name the sole authorized writer `orch` (SCN-MEM-8a-1/8d-2);
//     transcribed to the pinned `LOGBOOK_AUTHOR = 'orch'` constant. No `MemberId` brand is frozen (ref
//     PIN), so the seat is a bare string — used as given, not invented.
//   · per-section caps — atlas-memory:106-107 pins "per-section soft cap + hard per-entry cap" but freezes
//     NO magnitude; carried as a named `LOGBOOK_SECTION_CAP` pinned bound (the same PROSE→constant
//     discipline the `~500`/`~800` tok caps use in WP-6.25-a). No MUST golden asserts a magic number — the
//     tests assert the LAW (within-cap accept / over-cap + unfilled reject) RELATIVE to the constant. No
//     unpinned SIG-TBD / OWNER-DEFINE MUST-field exists in either oracle ⇒ no STOP.
//   · the `append` reject payload is PINNED-not-frozen (ref/logbook.ts) — a rejection is a fail-closed
//     precondition returning the append-only log UNCHANGED (the entry never persists), NOT an invented
//     error record.
//   · consultable-never-injected (SCN-MEM-8d-1) is witnessed via a LOCAL mock MEM-4 header assembler —
//     the real ref/inject.ts is a SEALED sibling facet and is NOT imported (FORBIDDEN). The logbook store
//     exposes only `consult` (no inject path) — the structural enforcement.

import { describe, it, expect } from "vitest"
import { validate, render } from "../src/template.js"
import {
  makeLogbook,
  makeLogbookStore,
  validateLogbookEntry,
  LOGBOOK_AUTHOR,
  LOGBOOK_SECTION_CAP,
  type LogbookEntry,
  type MemoryEntry,
  type MemoryStore,
  type ProjectMemoryEntry,
} from "../src/logbook.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────────

/** A well-formed logbook entry: all five prose sections filled within cap + the structured index fields. */
const entry = (prId: string, over: Partial<Record<string, unknown>> = {}): LogbookEntry =>
  ({
    prId,
    at: "2026-07-18",
    territories: ["memory"],
    shipped: "implemented the logbook facet",
    decisions: "orchestrator-only; one-per-PR; capped sections; supersede by link",
    tradeoffs: "chose append-only entries over in-place editable ones",
    risks: "section caps are pinned bounds pending ratification",
    openThreads: "barrel wiring deferred to SEAL",
    links: ["pr://correction"],
    ...over,
  }) as LogbookEntry

/** A member's own `project` memory record (the ONLY injected kind) — for the mock MEM-4 header. */
const projectRecord = (owner: string, rule: string): MemoryStore => [
  { owner, kind: "project", entry: { rule, scope: "*", frecency: 1 } as ProjectMemoryEntry },
]

/**
 * A LOCAL mock of the MEM-4 injector — assembles a running-turn header of the seat's OWN `project` memory
 * ONLY. The consultable kinds (`task`/`pr`/`logbook`) are excluded by construction. The real ref/inject.ts
 * is a SEALED sibling facet and is deliberately NOT imported.
 */
const mockAssembleHeader = (store: MemoryStore, seat: string): readonly ProjectMemoryEntry[] =>
  store.filter((r) => r.owner === seat && r.kind === "project").map((r) => r.entry as ProjectMemoryEntry)

// ── SCN-MEM-5a-1 — a missing-field write is rejected fail-closed ─────────────────────────────────────────

describe("SCN-MEM-5a-1 — a missing-field write is rejected fail-closed", () => {
  it("a TaskMemoryEntry missing its `stoppedAt` field is rejected — the untemplated write never persists", () => {
    // an untemplated task write: every required field EXCEPT `stoppedAt`
    const missingStoppedAt = {
      taskId: "T-1",
      attempted: ["a"],
      failedWith: ["e"],
      lesson: "x",
    } as unknown as MemoryEntry

    const verdict = validate("task", missingStoppedAt)
    expect(verdict.valid).toBe(false) // rejected fail-closed — never persists as free prose
    expect(verdict.reasons.join(" ")).toContain("stoppedAt")

    // teeth: a fail-OPEN validator would admit the missing-field entry as free prose
    const complete = {
      taskId: "T-1",
      attempted: ["a"],
      failedWith: ["e"],
      stoppedAt: "gate",
      lesson: "x",
    } as unknown as MemoryEntry
    expect(validate("task", complete).valid).toBe(true) // the complete template validates
  })
})

// ── SCN-MEM-5b-1 — logbook prose is confined to its fixed sections ───────────────────────────────────────

describe("SCN-MEM-5b-1 — logbook prose is confined to its fixed sections", () => {
  it("a logbook entry carrying prose OUTSIDE its fixed sections is rejected — prose is confined", () => {
    const confined = entry("#42")
    expect(validate("logbook", confined).valid).toBe(true) // all prose within the fixed sections

    // prose that spills outside the fixed sections — an out-of-section free-form key
    const spilled = {
      ...entry("#42"),
      freeform: "a free-form dump outside the fixed sections",
    } as unknown as MemoryEntry
    const verdict = validate("logbook", spilled)
    expect(verdict.valid).toBe(false) // rejected — free-form-outside-sections is not admitted
    expect(verdict.reasons.join(" ")).toContain("freeform")

    // render is STRUCTURED + byte-stable for equal input (never a prose blob)
    expect(render("logbook", confined)).toBe(render("logbook", entry("#42")))
  })
})

// ── SCN-MEM-8a-1 — only the orchestrator may write the logbook ───────────────────────────────────────────

describe("SCN-MEM-8a-1 — only the orchestrator may write the logbook", () => {
  it("alice's logbook write is rejected; orch's is accepted — the logbook is orchestrator-only", () => {
    const store = makeLogbookStore()

    store.append("alice", entry("#42")) // a member seat attempts a logbook write
    expect(store.size()).toBe(0) // rejected fail-closed — a non-orchestrator never writes the logbook

    store.append(LOGBOOK_AUTHOR, entry("#42")) // the orchestrator writes
    expect(store.size()).toBe(1) // accepted — only orch's write lands

    // teeth: dropping the orchestrator-only guard would land alice's write
    expect(store.entries().map((e) => e.prId)).toEqual(["#42"])
  })
})

// ── SCN-MEM-8b-1 — a second entry for the same PR is rejected ────────────────────────────────────────────

describe("SCN-MEM-8b-1 — a second entry for the same PR is rejected", () => {
  it("a logbook already holding one entry for PR #42 rejects a second — exactly one entry per PR", () => {
    const store = makeLogbookStore()
    store.append(LOGBOOK_AUTHOR, entry("#42"))
    expect(store.size()).toBe(1)

    // a second (even differing) entry for the SAME PR
    store.append(LOGBOOK_AUTHOR, entry("#42", { shipped: "a different second write for #42" }))
    expect(store.size()).toBe(1) // rejected — ≤1 entry/prId, and the extant entry is NOT edited in place

    // teeth: dropping the one-per-PR guard would append (or overwrite) a second #42 entry
    expect(store.entries()[0]!.shipped).toBe("implemented the logbook facet") // the first entry is untouched
  })
})

// ── SCN-MEM-8c-1 — an over-cap / unfilled-section entry is rejected ───────────────────────────────────────

describe("SCN-MEM-8c-1 — an over-cap / unfilled-section entry is rejected", () => {
  it("a within-cap entry is accepted; an over-cap section and an unfilled section are each rejected", () => {
    expect(validateLogbookEntry(entry("#42")).valid).toBe(true) // all sections filled within cap

    const overCap = entry("#42", { decisions: "x".repeat(LOGBOOK_SECTION_CAP + 1) })
    expect(validateLogbookEntry(overCap).valid).toBe(false) // section over its cap — rejected

    const unfilled = entry("#42", { risks: "" })
    expect(validateLogbookEntry(unfilled).valid).toBe(false) // an unfilled fixed section — rejected

    // and the store's append honors the cap gate fail-closed
    const store = makeLogbookStore()
    store.append(LOGBOOK_AUTHOR, overCap)
    expect(store.size()).toBe(0) // the over-cap write never persists
    store.append(LOGBOOK_AUTHOR, entry("#42"))
    expect(store.size()).toBe(1) // the within-cap write lands
  })
})

// ── SCN-MEM-8d-1 — the logbook is consultable but never injected ─────────────────────────────────────────

describe("SCN-MEM-8d-1 — the logbook is consultable but never injected", () => {
  it("the logbook is returned by an explicit consult yet is absent from alice's running-turn header", () => {
    const store = makeLogbookStore()
    store.append(LOGBOOK_AUTHOR, entry("#42"))

    // consultable — an explicit consult by PR returns the logbook entry
    const consulted = store.consult({ prId: "#42" })
    expect(consulted.map((e) => e.prId)).toEqual(["#42"])

    // never injected — the MEM-4 header assembler injects OWN project memory only; the logbook is excluded
    const header = mockAssembleHeader(projectRecord("alice", "always ground a claim"), "alice")
    expect(header).toHaveLength(1) // alice's own project rule is injected
    expect(JSON.stringify(header)).not.toContain("#42") // the logbook never auto-injects

    // the logbook surface exposes ONLY a consult read path — there is no inject method on it
    const api = makeLogbook(LOGBOOK_AUTHOR)
    expect("consult" in api).toBe(true)
    expect("inject" in (api as object)).toBe(false) // structurally consultable-only
  })
})

// ── SCN-MEM-8e-1 — a later entry supersedes by link, leaving history intact ──────────────────────────────

describe("SCN-MEM-8e-1 — a later entry supersedes by link, leaving history intact", () => {
  it("supersede(#42, link) links to L1 and leaves L1 bytes unchanged — no history rewrite", () => {
    const store = makeLogbookStore()
    store.append(LOGBOOK_AUTHOR, entry("#42", { decisions: "the original decision recorded in L1" }))

    const before = JSON.stringify(store.entries()[0]) // L1's bytes before the supersede

    store.supersede("#42", "pr://later-correction@sha")

    const after = JSON.stringify(store.entries()[0])
    expect(after).toBe(before) // L1's bytes are UNCHANGED — supersede by link, never by rewriting history
    expect(store.size()).toBe(1) // the entry log did not grow / churn — no in-place rewrite

    // the supersede is recorded as an append-only link pointer to L1
    expect(store.supersessions()).toContainEqual({ prId: "#42", link: "pr://later-correction@sha" })

    // teeth: a rewrite-in-place would mutate L1's `decisions` bytes — here they are intact
    expect(store.entries()[0]!.decisions).toBe("the original decision recorded in L1")
  })
})
