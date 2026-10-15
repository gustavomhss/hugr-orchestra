// @atlas/memory — test/wp-6.24-b-mem.heldout.test.ts  (WP-6.24-b.MEM — HELD-OUT leg)
//
// COLD-REVIEW held-out gate. Transcribes the `held_out: true` `-2` fixtures from goldens-mem.md
// (SCN-MEM-6a-2 re-ratified DEFINE + seat memory present, 6b-2 longer log / distinct head H',
// 6c-2 member-vs-orchestrator byte-identity, 6d-2 exact 250/251 cap boundary, 6e-2 orch `task`
// entry, 12c-2 single-entry H3→H4 delta) against the ALREADY-BUILT src/orient.ts. The builder never
// saw these fixtures; an overfit to the `-1` goldens fails here. Same SEALED kernel seam, RELATIONAL
// byte-identity (never a fixed hex).

import { describe, it, expect } from "vitest"
import type { Hash } from "@atlas/contracts"
import type { Event, EventLog } from "@atlas/kernel"
import type { Orientation } from "../src/types.js"
import {
  orient,
  orientEvent,
  orientationBytes,
  orientationTokens,
  injectOrientation,
  persistAsWrittenEntry,
  foldOrientation,
  foldOrientationInstrumented,
  ORIENTATION_TOK_CAP,
} from "../src/orient.js"

const defineWith = (goal: string): unknown => ({ goal })

function milestones(labels: readonly string[]): Event[] {
  const out: Event[] = []
  let prev: Hash | undefined
  for (const label of labels) {
    const e = orientEvent("milestone", label, prev !== undefined ? [prev] : [])
    out.push(e)
    prev = e.contentHash
  }
  return out
}

function logOf(events: readonly Event[]): EventLog {
  const m = new Map<Hash, Event>()
  for (const e of events) m.set(e.id, e)
  return m
}

const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${i}`).join(" ")

// ── SCN-MEM-6a-2 — goal tracks a RE-RATIFIED DEFINE, not seat memory / prior DEFINE ────────────────
describe("SCN-MEM-6a-2 — goal tracks a re-ratified DEFINE artifact (held-out)", () => {
  it("reads goal from the re-ratified DEFINE even with seat project-memory present", () => {
    const log = logOf(milestones(["M1", "M2"]))
    const prior = "ship R1 · governed atlas"
    const seatMem = "my personal note · finish the parser"

    // prior DEFINE
    const o1 = orient(defineWith(prior), log)
    expect(o1.goal).toBe(prior)

    // DEFINE re-ratified to a new goal; a seat's project memory is ALSO present on the artifact —
    // orient has no seat parameter, so goal is strictly the (re-ratified) DEFINE.goal field.
    const definePrime: unknown = { goal: "ship R2 · retrieval slab", project: seatMem }
    const o2 = orient(definePrime, log)
    expect(o2.goal).toBe("ship R2 · retrieval slab")
    expect(o2.goal).not.toBe(prior) // not pinned to the stale prior DEFINE
    expect(o2.goal).not.toBe(seatMem) // not sourced from the seat's project memory
  })
})

// ── SCN-MEM-6b-2 — a LONGER log / distinct head H' still == replay-from-empty ──────────────────────
describe("SCN-MEM-6b-2 — a longer event log still folds to replay-from-empty (held-out)", () => {
  it("folds last/current at head Hprime order-independently", () => {
    const evs = milestones(["A", "B", "C", "D", "E"]) // distinct, longer chain; head H' = E
    const define = defineWith("ship R1")

    const o = orient(define, logOf(evs))
    expect(o.current).toBe("E") // head H'
    expect(o.last).toBe("D") // head's superseded predecessor

    // pure function of the SET: a different insertion order rebuilds a byte-identical Orientation.
    const replayed = orient(define, logOf([...evs].reverse()))
    expect(replayed).toEqual(o)
    expect(Buffer.from(orientationBytes(replayed)).equals(Buffer.from(orientationBytes(o)))).toBe(true)
  })
})

// ── SCN-MEM-6c-2 — a member and the ORCHESTRATOR get byte-identical Orientation ────────────────────
describe("SCN-MEM-6c-2 — member and orchestrator get byte-identical Orientation (held-out)", () => {
  it("alice (member) bytes == orch (orchestrator) bytes — orient folds no per-seat input", () => {
    const log = logOf(milestones(["M1", "M2", "M3"]))
    const define = defineWith("ship R1")
    // the orchestrator is a seat like any other; orient takes NO seat argument, so both are identical.
    const alice = orientationBytes(orient(define, log))
    const orch = orientationBytes(orient(define, log))
    expect(Buffer.from(alice).equals(Buffer.from(orch))).toBe(true)
  })
})

// ── SCN-MEM-6d-2 — the EXACT cap boundary: 250 injected, 251 rejected ──────────────────────────────
describe("SCN-MEM-6d-2 — Orientation at the exact cap boundary is injected (held-out)", () => {
  it("injects O_edge (250 ≤ 250) and rejects O_bust (251 > 250)", () => {
    const oEdge: Orientation = { goal: words(250), last: "", current: "", state: "" }
    expect(orientationTokens(oEdge)).toBe(250)
    expect(injectOrientation(oEdge)).toBe(oEdge) // boundary is inclusive (≤), not a strict <

    const oBust: Orientation = { goal: words(251), last: "", current: "", state: "" }
    expect(orientationTokens(oBust)).toBe(251)
    expect(() => injectOrientation(oBust)).toThrow() // 251 > 250 — rejected
    expect(ORIENTATION_TOK_CAP).toBe(250)
  })
})

// ── SCN-MEM-6e-2 — orch attempt to persist Orientation as a written `task` entry is rejected ───────
describe("SCN-MEM-6e-2 — orch cannot persist Orientation as a written task entry (held-out)", () => {
  it("rejects the orchestrator persisting Orientation as a written entry — derived-only", () => {
    const o = orient(defineWith("ship R1"), logOf(milestones(["M1"])))
    // there is NO write path (fail-closed guard) regardless of seat kind (orch) or entry kind (task).
    expect(() => persistAsWrittenEntry(o)).toThrow(/derived-only/)
  })
})

// ── SCN-MEM-12c-2 — a SINGLE tail entry (H3→H4), not a replay ──────────────────────────────────────
describe("SCN-MEM-12c-2 — Orientation folds a single tail entry, not a replay (held-out)", () => {
  it("folds only the 1 appended tail entry (H3→H4), matching a whole-log assembly", () => {
    const define = defineWith("ship R1")
    const [m1, m2, m3, m4] = milestones(["M1", "M2", "M3", "M4"])

    // Orientation last assembled at head H3 (M1,M2,M3 folded).
    const prev = orient(define, logOf([m1!, m2!, m3!]))
    expect(prev.current).toBe("M3")
    expect(prev.last).toBe("M2")

    // exactly 1 new entry appended since (head now H4): the incremental fold sees ONLY that delta.
    const tail = logOf([m4!])
    const next = foldOrientation(prev, tail)

    expect(next).toEqual(orient(define, logOf([m1!, m2!, m3!, m4!]))) // == whole-log assembly
    expect(next.current).toBe("M4")
    expect(next.last).toBe("M3")

    const instrumented = foldOrientationInstrumented(prev, tail)
    expect(instrumented.folded).toBe(1) // the single tail delta — NOT the whole log (which is 4)
    expect(instrumented.value).toEqual(next)
  })
})
