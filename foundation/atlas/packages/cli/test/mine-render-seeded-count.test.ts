// @atlas/cli — test/mine-render-seeded-count.test.ts  (#237 — the single-arm summary must AGREE with the store)
//
// MEASURED 2026-08-18: `atlas mine` pinned to a single arm (`ATLAS_MINE_SLOT=advisory`) against a repo whose
// sites were ALREADY staged from an earlier pass (a plain rerun) printed `genesis: seeded 0 candidate
// fact(s)` and `mine: 0 candidate facts — every one abstained`, while the SAME run's own per-site LEDGER
// said `"outcome":"seeded"` for every site and `.atlas/staging.json` durably held every row.
//
// ROOT CAUSE (traced, not the WP card's original guess): `mine-decide.ts`'s "never re-author an
// already-staged key" guard (belt-and-braces since ADR-0008) skips minting a candidate whose key is already
// present in `staged.current` — so it never reaches `grounded`, so it never reaches `report.seeded`. The
// per-site LEDGER (`RunCoverage`), written one layer upstream at the GATE'S admission, does not share that
// skip and still says `seeded`. Two different layers of ONE pass disagreeing is the defect; `mine-arms.ts`'s
// UNION renderer is not involved at all when a single arm is pinned (`foldArms` calls `foldVerdict` directly
// in that case) — the WP card's diagnosis of WHERE the bug lived was wrong (see the PR body).
//
// THE FIX (mine-render.ts): `seededCount`/`ledgerSeededIds` read the coverage ledger's own `outcome:
// 'seeded'` rows FIRST (falling back to `r.seeded.length` only for a pre-ledger report), so the printed
// `genesis: seeded N` line and `mineWhyEmpty`'s cause are computed from the SAME source the per-site ledger
// prints below them — they cannot disagree by construction.
//
// This suite asserts the RENDERED TEXT against a synthetic `GenesisReport` shaped exactly like the measured
// defect: `seeded: []` (nothing newly minted) alongside a coverage ledger whose sites are all `'seeded'`
// with real fact ids — the store-durable truth. Revert `seededCount`'s ledger-first reading (i.e. go back to
// `r.seeded.length` alone) and every assertion below fails.

import { describe, expect, it } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { GenesisReport } from "@atlas/genesis"
import type { StructRef } from "@atlas/contracts"
import { foldVerdict, ledgerSeededIds, mineOutcome, mineWhyEmpty, seededCount } from "../src/mine-render.js"
import type { MinePass } from "../src/mine-render.js"

const site = (n: number): StructRef => ({
  kind: "file",
  qualifiedPath: `src/f${n}.ts`,
  subtreeHash: asSubtreeHash(`f${n}`),
})

/** A five-facet all-UN-SEEDED Awareness — the honest seed of any run that ratified nothing (GEN-9c). */
const emptyAwareness = () => {
  const facet = (name: string) => ({
    content: `UN-SEEDED: ${name} — source absent, no self-model line fabricated`,
    grounding: [],
    state: "UN-SEEDED" as const,
  })
  return {
    mission: facet("mission"),
    constitution: facet("constitution"),
    terrain: facet("terrain"),
    ontology: facet("ontology"),
    taste: facet("taste"),
  }
}

/** THE MEASURED SHAPE: a pass whose write-dedup minted nothing NEW (`seeded: []`) but whose ledger records
 *  every one of N sites as `'seeded'` with a real fact id — i.e. every site WAS admitted, the store already
 *  durably holds N rows, and this pass's own write was an idempotent no-op over an already-staged repo. */
function alreadyStagedReport(n: number): GenesisReport {
  return {
    seeded: [], // the write-dedup's view: nothing newly minted THIS pass
    ratified: [],
    open: [],
    llmCalls: n,
    budgetSpent: n,
    coverage: {
      frontier: "planned",
      planned: n,
      sites: Array.from({ length: n }, (_, i) => ({
        outcome: "seeded" as const,
        rank: i + 1,
        site: site(i),
        facts: [`fact-${i}`], // the durable id the store actually holds
      })),
    },
  }
}

describe("#237 — the single-arm mine summary reads the coverage LEDGER, agreeing with the store", () => {
  it("ledgerSeededIds collects every seeded site's fact ids from the coverage ledger", () => {
    const ids = ledgerSeededIds(alreadyStagedReport(3))
    expect(ids).toEqual(new Set(["fact-0", "fact-1", "fact-2"]))
  })

  it("ledgerSeededIds is undefined for a pre-ledger report (no coverage) — the honest absent-tolerant reading", () => {
    const r: GenesisReport = { seeded: [], ratified: [], open: [], llmCalls: 0, budgetSpent: 0 }
    expect(ledgerSeededIds(r)).toBeUndefined()
  })

  it("seededCount reads the LEDGER over the empty write-dedup set — the #237 fix, byte-for-byte", () => {
    const r = alreadyStagedReport(5)
    expect(r.seeded.length).toBe(0) // the write-dedup view (what a REVERT would read)
    expect(seededCount(r)).toBe(5) // the ledger view (what the store actually holds)
  })

  it("seededCount falls back to r.seeded.length when there is no ledger (byte-identical to before #237)", () => {
    const r: GenesisReport = { seeded: [{ id: "x" } as never], ratified: [], open: [], llmCalls: 1, budgetSpent: 1 }
    expect(seededCount(r)).toBe(1)
  })

  it('mineOutcome.facts and mineWhyEmpty agree with the ledger — no more false "every one abstained"', () => {
    const o = mineOutcome(alreadyStagedReport(4), true)
    expect(o.facts).toBe(4)
    expect(mineWhyEmpty(o)).toBeNull() // facts > 0 ⇒ nothing to explain — the run DID produce
  })

  it("foldVerdict's printed header matches the ledger, not the write-dedup's empty set (REVERT ⇒ RED)", () => {
    const pass: MinePass = { report: alreadyStagedReport(5), seed: emptyAwareness(), modelWired: true, seedsDropped: 0 }
    const v = foldVerdict(pass)
    // THE MEASURED DEFECT, pinned as a NEGATIVE assertion: a revert to `r.seeded.length` alone reproduces
    // exactly this pair of lines against `alreadyStagedReport`.
    expect(v.stdout).not.toContain("genesis: seeded 0 candidate fact(s)")
    expect(v.stdout).not.toContain("every one abstained")
    expect(v.stdout).toContain("genesis: seeded 5 candidate fact(s); ratified 0")
    // the ledger rows the header must agree with are printed right below it
    expect(v.stdout).toContain('"outcome":"seeded"')
  })
})
