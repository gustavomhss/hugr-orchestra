// @atlas/memory — test/wp-6.25-a-mem.test.ts  (WP-6.25-a.MEM)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the project Rules-slab (MEM-3 injected-cap gate +
// MEM-7 deterministic frecency eviction). The facet is imported DIRECTLY from ../src/rules.js (the barrel is
// wired by the lead at SEAL). The store's insert-only floor + identity go through the SEALED @atlas/kernel
// `id`/`createLog` seam (KERNEL-4), never a hand-rolled digest. Held-out `-2` fixtures (SCN-MEM-3a-2 /
// 3b-2 orchestrator `~800` cap) are NOT transcribed.
//
// BIND NOTES (disciplined judgment vs the FROZEN ref/cap.ts + ref/frecency.ts oracles — the
// interface_contract / source_reqs / acceptance digests are `<filled-at-freeze>`, simulated):
//   · wave unit — PINNED in ref/frecency.ts (`wave: number` = a logical ledger position / monotone
//     event-count, never wall-clock; the oracle-pin-map theme #4 recommendation, already transcribed). No
//     MUST golden needs an unpinned wave-count — the goldens supply concrete waves (w1/w9/w10). No STOP.
//   · decay rate `0.5/wave` + `current wave w10` are GOLDEN-SUPPLIED fixture bounds (SCN-MEM-7b-1),
//     used as given — the same discipline the `~500`/`~800` tok caps use (ratified pinned bounds, PROSE).
//   · the frecency FLOATS in the golden prose (`3.0` / `≈0.098` / `≈0.05`) are ILLUSTRATIVE and internally
//     loose (2 hits cannot yield `3.0` AND 50 old hits yield `0.098` under one `0.5/wave` law). The frozen
//     contract pins NO exact decay coefficient, so the tests assert the LAWS the "Then" clauses mandate —
//     relative ORDERING, EVICTION membership, determinism, cited-only increment, monotone store — NOT the
//     illustrative floats. Fixtures are built from the golden's ledger premises (2 hits, 50 old hits, …).
//   · `ruleId`-not-on-`ProjectMemoryEntry` is a FLAG in ref/frecency.ts (the entry↔ledger identity gap).
//     Bridged at this WP layer by a `RuleRecord { id, entry }` pairing — NOT invented as a frozen field.

import { describe, it, expect } from "vitest"
import {
  MEMBER_TOK_CAP,
  NEAR_ZERO_FRECENCY,
  RULES_SLAB_SLOTS,
  ruleOfTokens,
  capGate,
  citedHitCount,
  frecencyOf,
  rankRules,
  makeRuleStore,
  type RuleRecord,
  type RuleEvent,
} from "../src/rules.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────────

/** A project rule identified by `id`, whose token size (word-count tokenizer proxy) is exactly `toks`. */
const rule = (id: string, toks = 3): RuleRecord => ({ id, entry: ruleOfTokens(id, toks) })

/** A cited-as-governing ledger event — a real hit (increments frecency). */
const cited = (ruleId: string, wave: number): RuleEvent => ({ ruleId, wave, governing: true })
/** A mere read/mention — NOT a hit (must never increment frecency). */
const mention = (ruleId: string, wave: number): RuleEvent => ({ ruleId, wave, governing: false })

/** `n` cited hits for `ruleId`, all at the same `wave` (a fresh, un-decayed cluster). */
const hitsAt = (ruleId: string, wave: number, n: number): RuleEvent[] =>
  Array.from({ length: n }, () => cited(ruleId, wave))

// ── SCN-MEM-3a-1 — a within-cap member injection is accepted ─────────────────────────────────────────────

describe("SCN-MEM-3a-1 — a within-cap member injection is accepted", () => {
  it("accepts A_ok (480 ≤ 500) and rejects A_over (620 > 500) against the ~500 member cap", () => {
    const aOk = [ruleOfTokens("r1", 240), ruleOfTokens("r2", 240)] // Σ = 480
    const aOver = [ruleOfTokens("r1", 310), ruleOfTokens("r2", 310)] // Σ = 620

    const ok = capGate(aOk, MEMBER_TOK_CAP)
    expect(ok.accepted).toBe(true)
    expect(ok.tokens).toBe(480)
    expect(ok.cap).toBe(MEMBER_TOK_CAP)

    const over = capGate(aOver, MEMBER_TOK_CAP)
    expect(over.accepted).toBe(false) // teeth: dropping the cap check would inject 620 over the ~500 cap
    expect(over.tokens).toBe(620)
  })
})

// ── SCN-MEM-3b-1 — an over-cap write is a structured rejection, never silent overflow ────────────────────

describe("SCN-MEM-3b-1 — an over-cap write is a structured rejection, never silent overflow", () => {
  it("rejects a write pushing the injected set to 540 tok over the ~500 cap — a receipt, not overflow", () => {
    const injected = [ruleOfTokens("r1", 300)] // 300 in the set
    const write = ruleOfTokens("r2", 240) // would push to 540

    const verdict = capGate([...injected, write], MEMBER_TOK_CAP)
    expect(verdict.accepted).toBe(false) // rejected — never silently truncated / overflowed
    expect(verdict.tokens).toBe(540) // an honest receipt of the would-be total, not a silent drop
    expect(verdict.cap).toBe(MEMBER_TOK_CAP)
  })
})

// ── SCN-MEM-7a-1 — a hit increments only on a cited-as-governing event ───────────────────────────────────

describe("SCN-MEM-7a-1 — a hit increments only on a cited-as-governing event", () => {
  it("R5 hit-count rises by exactly 1 (the cited event) — the mere read/mention does not bump it", () => {
    const prior = hitsAt("R5", 8, 4) // R5 with 4 prior cited-hits
    expect(citedHitCount("R5", prior)).toBe(4)

    // a seat merely READS/MENTIONS R5 (not cited) + a cold-reviewer CITES R5 as governing a decision
    const turn: RuleEvent[] = [...prior, mention("R5", 9), cited("R5", 10)]
    expect(citedHitCount("R5", turn)).toBe(5) // rose by exactly 1 — the mention did not count

    // teeth: counting any access/mention would bump R5 to 6 (frecency inflates without a cited application)
    const mentionOnly: RuleEvent[] = [...prior, mention("R5", 9)]
    expect(citedHitCount("R5", mentionOnly)).toBe(4) // still 4 — a mention alone is never a hit
  })
})

// ── SCN-MEM-7b-1 — same ledger ⇒ identical ordered top-12 (determinism) ──────────────────────────────────

describe("SCN-MEM-7b-1 — same ledger ⇒ identical ordered top-12 (determinism)", () => {
  it("two runs on identical Λ yield the identical ordered top-12; the R6/R7 tie breaks by rule-id asc", () => {
    // R1..R13 at current wave w10. R6 and R7 tie (both 3 fresh hits @w10 ⇒ equal frecency). R13 is the
    // 13th (lowest, but NOT near-zero) ⇒ excluded by capacity, not by ~zero eviction.
    const records: RuleRecord[] = Array.from({ length: 13 }, (_, i) => rule(`R${i + 1}`))
    const ledger: RuleEvent[] = []
    for (let i = 1; i <= 12; i++) ledger.push(...hitsAt(`R${i}`, 10, 3)) // R1..R12 → 3.0
    ledger.push(cited("R13", 9)) // R13 → 0.5 (≥ near-zero: a capacity exclusion, not an eviction)

    const runA = rankRules(records, ledger)
    const runB = rankRules(records, ledger)
    const idsA = runA.injected.map((r) => r.id)
    const idsB = runB.injected.map((r) => r.id)

    expect(idsA).toEqual(idsB) // byte-identical ordered top-12 across the two runs (deterministic)
    expect(idsA).toHaveLength(RULES_SLAB_SLOTS) // exactly the top-12
    expect(idsA).not.toContain("R13") // R13 excluded from the injected top-12
    // teeth: an insertion-order tie-break could order R6/R7 differently across runs — here R6 precedes R7
    expect(idsA.indexOf("R6")).toBeLessThan(idsA.indexOf("R7")) // tie broken by rule-id asc, total + stable
  })
})

// ── SCN-MEM-7c-1 — the ~zero-frecency entry is evicted to the archive ────────────────────────────────────

describe("SCN-MEM-7c-1 — the ~zero-frecency entry is evicted to the archive", () => {
  it("R4 (~zero frecency) is evicted even though slots remain; the injected set is {R1,R2,R3,R5}", () => {
    const records: RuleRecord[] = ["R1", "R2", "R3", "R4", "R5"].map((id) => rule(id))
    const ledger: RuleEvent[] = [
      ...hitsAt("R1", 10, 3),
      ...hitsAt("R2", 10, 3),
      ...hitsAt("R3", 10, 3),
      ...hitsAt("R5", 10, 3), // R1..R3,R5 fresh @w10 ⇒ 3.0
      cited("R4", 4), // R4 decayed far ⇒ ~zero (well below NEAR_ZERO_FRECENCY)
    ]
    const ranked = rankRules(records, ledger)
    const injected = ranked.injected.map((r) => r.id).sort()
    const evicted = ranked.evicted.map((r) => r.id)

    expect(injected).toEqual(["R1", "R2", "R3", "R5"]) // R4 dropped though only 5 of 12 slots used
    expect(evicted).toContain("R4") // evicted to the archive on ~zero frecency, not on rank position
    expect(frecencyOf("R4", ledger)).toBeLessThan(NEAR_ZERO_FRECENCY) // R4 IS ~zero at the head wave w10
  })
})

// ── SCN-MEM-7d-1 — a high-raw-count old rule loses its slot to a fresh one ───────────────────────────────

describe("SCN-MEM-7d-1 — a high-raw-count old rule loses its slot to a fresh one", () => {
  it("the fresh R1 outranks the old-popular R13 (50 hits @w1) and R13 holds no slot — no LFU pinning", () => {
    const records: RuleRecord[] = [rule("R1"), rule("R13")]
    const ledger: RuleEvent[] = [
      ...hitsAt("R13", 1, 50), // 50 cumulative OLD hits, all at w1 ⇒ decayed to ~zero at w10
      cited("R1", 9),
      cited("R1", 10), // 2 recent hits ⇒ a live, fresh score
    ]
    const ranked = rankRules(records, ledger)
    const injectedIds = ranked.injected.map((r) => r.id)

    // teeth: raw cumulative count (LFU) would pin R13's 50 hits at slot 1 and starve the fresh R1
    expect(frecencyOf("R1", ledger)).toBeGreaterThan(frecencyOf("R13", ledger)) // recency beats raw count
    expect(injectedIds).toContain("R1") // fresh R1 keeps its slot
    expect(injectedIds).not.toContain("R13") // old-popular R13 holds no slot (evicted at ~zero)
  })
})

// ── SCN-MEM-7e-1 — an evicted entry stays in the versioned archive and re-spawns ─────────────────────────

describe("SCN-MEM-7e-1 — an evicted entry stays in the versioned archive and re-spawns", () => {
  it("R13 evicted at w10 is still present (versioned) in the archive and is re-spawnable into the active set", () => {
    const store = makeRuleStore()
    for (const id of ["R1", "R13"]) store.insert(rule(id))
    const ledger: RuleEvent[] = [...hitsAt("R13", 1, 50), cited("R1", 10)]

    store.applyRanking(ledger) // R13 (~zero) evicts to the archive
    expect(store.active().map((r) => r.id)).not.toContain("R13")
    expect(store.archive().map((r) => r.id)).toContain("R13") // retained + versioned in the archive

    const found = store.archiveQuery("R13")
    expect(found).toBeDefined() // archive query hits — the record was not removed

    store.respawn("R13") // re-spawn back into the active set
    expect(store.active().map((r) => r.id)).toContain("R13")
  })
})

// ── SCN-MEM-7f-1 — no delete op removes any memory; store size is monotone ───────────────────────────────

describe("SCN-MEM-7f-1 — no delete op removes any memory; store size is monotone", () => {
  it("a delete is rejected and the versioned store size is monotone non-decreasing across the waves", () => {
    const store = makeRuleStore()
    const sizes: number[] = []
    // waves w1..w10: insert + evict churn; record the versioned store size after each wave
    for (let w = 1; w <= 10; w++) {
      store.insert(rule(`R${w}`))
      store.applyRanking([cited(`R${w}`, w)]) // eviction churn — moves entries, deletes nothing
      sizes.push(store.size())
    }
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]!) // insert-only ⇒ monotone non-decreasing
    }
    // teeth: a hard delete would drop the evicted bytes and shrink the store — it is rejected
    expect(() => store.attemptDelete("R1")).toThrow()
    expect(store.size()).toBe(sizes[sizes.length - 1]) // size unchanged by the rejected delete
  })
})
