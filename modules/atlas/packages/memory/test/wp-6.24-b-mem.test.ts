// @atlas/memory — test/wp-6.24-b-mem.test.ts  (WP-6.24-b.MEM)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the Orientation slab (MEM-6: goal-from-DEFINE,
// last/current/state as an event-log fold, byte-identical across members, ≤ ~250 tok, never a written
// entry) + MEM-12c (Orientation is an INCREMENTAL fold over the appended tail, never a full replay). The
// facet is imported DIRECTLY from ../src/orient.js (the barrel is wired by the lead at SEAL). Identity +
// byte-identical assembly go through the SEALED @atlas/kernel `id`/`canonicalForm`/`fold`/`head` seam
// (never a hand-rolled digest), so byte-identity is RELATIONAL, never a fixed hex. Held-out `-2` fixtures
// (SCN-MEM-6a-2 re-ratified DEFINE, 6b-2 longer log, 6c-2 member/orch, 6d-2 250-boundary, 6e-2 orch `task`
// entry, 12c-2 single-entry delta) are NOT transcribed. The sibling WP-6.24-a facet (Awareness/rollup +
// assembleAwareness) is out of scope here.
//
// FLAG: the interface_contract / source_reqs / acceptance digests are `<filled-at-freeze>` (simulated) —
// resolved by disciplined judgment against the FROZEN ref/orient.ts + ref/memoize.ts oracles, not a real
// freeze hash. `orient(define, …)` DEFINE is OPAQUE-BY-DESIGN (`unknown`, no frozen type at this layer): the
// `goal` is read opaquely from a conventional `goal` field, NOT invented as a new frozen artifact type.

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

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────────

/** The ratified DEFINE artifact carrying the current-milestone `goal` (opaque genesis artifact). */
const defineWith = (goal: string): unknown => ({ goal })

/** A linear milestone chain: each event supersedes its predecessor (the KERNEL supersedes-DAG lineage). */
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

/** An `EventLog` (content-keyed Map) over a set of events — insertion order is NOT identity (KERNEL-11). */
function logOf(events: readonly Event[]): EventLog {
  const m = new Map<Hash, Event>()
  for (const e of events) m.set(e.id, e)
  return m
}

const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${i}`).join(" ")

// ── SCN-MEM-6a-1 — the goal is taken from the ratified DEFINE artifact ─────────────────────────────────────

describe("SCN-MEM-6a-1 — the goal is taken from the ratified DEFINE artifact", () => {
  it("takes Orientation.goal from the DEFINE artifact, not authored per-seat", () => {
    const log = logOf(milestones(["M1"]))
    const o = orient(defineWith("ship R1 · governed atlas"), log)
    expect(o.goal).toBe("ship R1 · governed atlas")

    // orient() has NO seat / project-memory parameter — the goal is strictly a function of DEFINE, so a
    // re-ratified DEFINE (a different goal) is the ONLY thing that moves it (never a seat's memory).
    const o2 = orient(defineWith("ship R2 · retrieval"), log)
    expect(o2.goal).toBe("ship R2 · retrieval")
    expect(o2.goal).not.toBe(o.goal)
  })
})

// ── SCN-MEM-6b-1 — last/current/state is a fold over the event log ─────────────────────────────────────────

describe("SCN-MEM-6b-1 — last/current/state is a fold over the event log", () => {
  it("folds last/current from the log identically to a replay-from-empty (order-independent)", () => {
    const evs = milestones(["M1", "M2", "M3"])
    const define = defineWith("ship R1")

    const o = orient(define, logOf(evs))
    expect(o.current).toBe("M3") // the current milestone = the fold head
    expect(o.last).toBe("M2") // the last milestone = the head's superseded predecessor

    // a fold is a pure function of the SET, not a mutable snapshot: replaying the same events in a
    // DIFFERENT insertion order rebuilds a byte-identical Orientation (== replay-from-empty).
    const replayed = orient(define, logOf([...evs].reverse()))
    expect(replayed).toEqual(o)
  })
})

// ── SCN-MEM-6c-1 — two seats at one head get byte-identical Orientation ────────────────────────────────────

describe("SCN-MEM-6c-1 — two seats at one head get byte-identical Orientation", () => {
  it("alice bytes == bob bytes (orient folds no per-seat input)", () => {
    const log = logOf(milestones(["M1", "M2"]))
    const define = defineWith("ship R1")
    const alice = orientationBytes(orient(define, log)) // orient takes NO seat argument
    const bob = orientationBytes(orient(define, log))
    expect(Buffer.from(alice).equals(Buffer.from(bob))).toBe(true)
  })
})

// ── SCN-MEM-6d-1 — injected Orientation is within the ~250 cap ─────────────────────────────────────────────

describe("SCN-MEM-6d-1 — injected Orientation is within the ~250 cap", () => {
  it("injects O_ok (240 ≤ 250) and rejects O_over (300 > 250)", () => {
    const oOk: Orientation = { goal: words(240), last: "", current: "", state: "" }
    expect(orientationTokens(oOk)).toBe(240)
    expect(injectOrientation(oOk)).toBe(oOk) // 240 ≤ 250 — injected

    const oOver: Orientation = { goal: words(300), last: "", current: "", state: "" }
    expect(orientationTokens(oOver)).toBe(300)
    expect(() => injectOrientation(oOver)).toThrow() // 300 > 250 — rejected, never injected over-cap
    expect(ORIENTATION_TOK_CAP).toBe(250)
  })
})

// ── SCN-MEM-6e-1 — Orientation cannot be persisted as a per-member written entry ───────────────────────────

describe("SCN-MEM-6e-1 — Orientation cannot be persisted as a per-member written entry", () => {
  it("rejects any attempt to persist Orientation as a written entry — derived-only, never stored", () => {
    const o = orient(defineWith("ship R1"), logOf(milestones(["M1"])))
    expect(() => persistAsWrittenEntry(o)).toThrow(/derived-only/)
  })
})

// ── SCN-MEM-12c-1 — Orientation folds only the tail delta, never a full replay ─────────────────────────────

describe("SCN-MEM-12c-1 — Orientation folds only the tail delta, never a full replay", () => {
  it("folds only the 2 appended tail entries (H1→H3), matching a whole-log assembly", () => {
    const define = defineWith("ship R1")
    const [m1, m2, m3] = milestones(["M1", "M2", "M3"])

    // Orientation last assembled at head H1 (only M1 folded so far).
    const prev = orient(define, logOf([m1!]))
    expect(prev.current).toBe("M1")

    // 2 new entries appended since (head now H3): the incremental fold receives ONLY the tail delta.
    const tail = logOf([m2!, m3!])
    const next = foldOrientation(prev, tail)

    // it matches a from-whole-log assembly (correct), while having folded ONLY the 2 tail entries.
    expect(next).toEqual(orient(define, logOf([m1!, m2!, m3!])))
    const instrumented = foldOrientationInstrumented(prev, tail)
    expect(instrumented.folded).toBe(2) // the tail delta only — NOT the whole log (which is 3)
    expect(instrumented.value).toEqual(next)
  })
})
