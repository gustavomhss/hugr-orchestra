// @atlas/genesis — test/wp-8.28-a-gen.test.ts  (WP-8.28-a.GEN)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the S2 proposal driver:
//   GEN-2 (rationed intelligence: SCN-GEN-2a..2f-1) · GEN-4 (grounded from birth: SCN-GEN-4a..4d-1) ·
//   GEN-6 (mined signals are heuristics, never facts: SCN-GEN-6a..6c-1).
// The facet is imported DIRECTLY from ../src/extract.js (the barrel is wired by the lead at SEAL). The
// 2-door gate + the bounded LLM proposer are CALLED via injected seams (card exclusions: "it calls them")
// — modelled here as fakes so the driver's SCHEDULING, GATE-ROUTING and SIGNAL-DISCIPLINE are the units
// under test. Grounded-fact identity rides the SEALED @atlas/kernel mint (`asSubtreeHash`/`asNodeKey`),
// never a hand-rolled digest. Held-out `-2` fixtures are NOT transcribed.
//
// FLAG: interface_contract digest is `<filled-at-freeze>` (simulated) — resolved by disciplined judgment,
// not a real freeze hash.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { Candidate, Fact, MinedSignals } from "@atlas/genesis"
import type { GenesisBudget } from "@atlas/genesis"
import {
  runExtract,
  makeExtract,
  defaultCeiling,
  MARGINAL_WINDOW,
  MARGINAL_MIN_ADMITS,
  type AdvisorySeed,
  type SiteProposer,
  type EmitGate,
} from "../src/extract.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────

const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }

const siteOf = (id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `pkg/${id}.ts::${id}`,
  subtreeHash: asSubtreeHash(`st-${id}`),
})
const idOf = (c: Candidate): string => c.site.qualifiedPath.split("::")[1]!

const cand = (id: string, ppr: number, rank: number, signals: MinedSignals = ZERO_SIGNALS): Candidate => ({
  site: siteOf(id),
  signals,
  ppr,
  rank,
})

const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const budgetOf = (frontierSize: number): GenesisBudget => ({
  ceiling: defaultCeiling(frontierSize),
  deepening: { review: OFF, enrich: OFF, expand: OFF },
})

/** A minimal grounded fact whose anchor subtreeHash re-derives from the site (test-fixture cast — the
 *  driver never inspects a fact's internals, it only forwards the gate's verdict). */
const factFor = (c: Candidate, claim: string): Fact =>
  ({
    kind: "advisory",
    id: asNodeKey(`nk-${c.site.qualifiedPath}`),
    tier: "T2",
    claimNorm: claim,
    grounding: { entries: [{ anchor: c.site, path: c.site.qualifiedPath }] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    // ADR-0012 TOTALITY — an emitted fact always carries its harness-computed obviousness score.
    obviousness: { rank: "non-obvious", by: "harness-predicate" },
  }) as unknown as Fact

interface Recorder {
  readonly calls: string[]
}
const recorder = (): Recorder => ({ calls: [] })

/** A bounded proposer that records EACH call (order + count) and returns a seed per site. */
const seedProposer = (rec: Recorder, extra?: Partial<AdvisorySeed>): SiteProposer => ({
  propose(c) {
    rec.calls.push(idOf(c))
    return { cand: c, claim: `claim@${idOf(c)}`, ...extra }
  },
})
/** A proposer that ABSTAINS (returns null) at every site. */
const abstainProposer = (rec: Recorder): SiteProposer => ({
  propose(c) {
    rec.calls.push(idOf(c))
    return null
  },
})

const gateEmitAll = (): EmitGate => ({ emit: (seed, c) => ({ emitted: true, fact: factFor(c, seed.claim) }) })
const gateRejectAll = (): EmitGate => ({
  emit: (_seed, c) => ({ emitted: false, whyNot: { site: c.site, reason: "ungrounded — the truth door" } }),
})
/** ADR-0012 — the amended gate: the TRUTH door rejects; an OBVIOUS seed emits with a low score. */
const gateTruthDoorOnly = (ungrounded: ReadonlySet<string>, obvious: ReadonlySet<string>): EmitGate => ({
  emit: (seed, c) =>
    ungrounded.has(idOf(c))
      ? { emitted: false, whyNot: { site: c.site, reason: "ungrounded — the truth door" } }
      : {
          emitted: true,
          fact: {
            ...(factFor(c, seed.claim) as unknown as Record<string, unknown>),
            obviousness: { rank: obvious.has(idOf(c)) ? "obvious" : "non-obvious", by: "harness-predicate" },
          } as unknown as Fact,
        },
})
const gateEmitFor = (ids: ReadonlySet<string>): EmitGate => ({
  emit: (seed, c) =>
    ids.has(idOf(c))
      ? { emitted: true, fact: factFor(c, seed.claim) }
      : { emitted: false, whyNot: { site: c.site, reason: "no grounded invariant at site" } },
})

// ── GEN-2 — rationed intelligence over the ranked frontier ─────────────────────────────────────────────

describe("GEN-2 — the LLM fires only on ranked sites, budgeted, halting at marginal value", () => {
  it("SCN-GEN-2a-1: an un-ranked site receives 0 LLM calls (every visited site ∈ the ranked set)", () => {
    const frontier = [cand("s1", 0.9, 1), cand("s2", 0.7, 2), cand("s3", 0.5, 3), cand("s4", 0.3, 4)]
    const rec = recorder()
    runExtract(frontier, budgetOf(frontier.length), { proposer: seedProposer(rec), gate: gateEmitAll() })

    const ranked = new Set(frontier.map(idOf))
    for (const called of rec.calls) expect(ranked.has(called)).toBe(true)
    // teeth: a repo-wide fallback would call the un-ranked `u1` — the driver never touches an unlisted site.
    expect(rec.calls).not.toContain("u1")
    expect(new Set(rec.calls)).toEqual(ranked)
  })

  it("SCN-GEN-2b-1: calls issue in strictly descending PPR order (highest-first)", () => {
    // supplied shuffled — the driver must re-order highest-PPR-first.
    const shuffled = [cand("s3", 0.55, 3), cand("s1", 0.91, 1), cand("s4", 0.09, 4), cand("s2", 0.74, 2)]
    const rec = recorder()
    runExtract(shuffled, budgetOf(shuffled.length), { proposer: seedProposer(rec), gate: gateEmitAll() })
    expect(rec.calls).toEqual(["s1", "s2", "s3", "s4"])
  })

  it("SCN-GEN-2c-1: exactly one bounded call per visited site — never re-called", () => {
    const frontier = [cand("s1", 0.9, 1), cand("s2", 0.7, 2), cand("s3", 0.5, 3)]
    const rec = recorder()
    runExtract(frontier, budgetOf(frontier.length), { proposer: seedProposer(rec), gate: gateEmitAll() })
    for (const id of ["s1", "s2", "s3"]) expect(rec.calls.filter((c) => c === id).length).toBe(1)
    expect(rec.calls.length).toBe(3)
  })

  it("SCN-GEN-2d-1: total spend capped at min(frontier_size, 200) — the hard ceiling holds", () => {
    // frontier 4 → budget = min(4,200) = 4.
    const small = Array.from({ length: 4 }, (_, i) => cand(`s${i}`, 1 - i / 10, i))
    const recS = recorder()
    runExtract(small, budgetOf(small.length), { proposer: seedProposer(recS), gate: gateEmitAll() })
    expect(defaultCeiling(4)).toBe(4)
    expect(recS.calls.length).toBeLessThanOrEqual(4)

    // frontier 500 → budget = min(500,200) = 200; every site admits (no marginal halt) ⇒ spend == 200.
    const big = Array.from({ length: 500 }, (_, i) => cand(`b${i}`, 1 - i / 1000, i))
    const recB = recorder()
    runExtract(big, budgetOf(big.length), { proposer: seedProposer(recB), gate: gateEmitAll() })
    expect(defaultCeiling(500)).toBe(200)
    expect(recB.calls.length).toBe(200) // teeth: a max(frontier,200) budget would spend 500
  })

  it("SCN-GEN-2e-1: halt when the trailing-20 admit-rate < 20%", () => {
    // 25 ranked sites; the gate admits only the top 3 ⇒ after 20 sites the window admits 3 (< 4).
    const frontier = Array.from({ length: 25 }, (_, i) => cand(`c${i + 1}`, 1 - i / 100, i + 1))
    const admitted = new Set(["c1", "c2", "c3"])
    const rec = recorder()
    const out = runExtract(frontier, budgetOf(frontier.length), {
      proposer: seedProposer(rec),
      gate: gateEmitFor(admitted),
    })
    expect(MARGINAL_WINDOW).toBe(20)
    expect(MARGINAL_MIN_ADMITS).toBe(4)
    // halted at the diminishing-returns floor: exactly the first 20 sites called, none past it.
    expect(rec.calls.length).toBe(20) // teeth: a `>` halt predicate would drain all 25
    expect(out.facts.length).toBe(3)
  })

  it("SCN-GEN-2f-1: no whole-repo LLM sweep — only the ranked sites are visited", () => {
    // 4 ranked out of a nominal 900 symbols; the driver only ever sees the 4 it is handed.
    const frontier = [cand("r1", 0.9, 1), cand("r2", 0.8, 2), cand("r3", 0.7, 3), cand("r4", 0.6, 4)]
    const rec = recorder()
    runExtract(frontier, budgetOf(frontier.length), { proposer: seedProposer(rec), gate: gateEmitAll() })
    expect(rec.calls.length).toBeLessThanOrEqual(4) // not 900 — no repo-wide sweep
    expect(new Set(rec.calls)).toEqual(new Set(["r1", "r2", "r3", "r4"]))
  })
})

// ── GEN-4 — grounded from birth (routed through the 2-door bar) ─────────────────────────────────────────

describe("GEN-4 — every seed is grounded and passes the 2-door bar; nothing self-declares", () => {
  it("SCN-GEN-4a-1: every seeded fact carries the re-deriving subtreeHash", () => {
    const c = cand("applyPosting", 0.9, 1)
    const out = runExtract([c], budgetOf(1), { proposer: seedProposer(recorder()), gate: gateEmitAll() })
    expect(out.facts.length).toBe(1)
    // the emitted fact carries the gate's grounded subtreeHash (not ∅ / stale).
    expect(out.facts[0]!.grounding.entries[0]!.anchor.subtreeHash).toBe(c.site.subtreeHash)
  })

  it("SCN-GEN-4b-1: a seed clearing the truth door is emitted CARRYING an obviousness score", () => {
    const out = runExtract([cand("s1", 0.9, 1)], budgetOf(1), {
      proposer: seedProposer(recorder()),
      gate: gateEmitAll(),
    })
    expect(out.facts.length).toBe(1)
    expect(out.abstained.length).toBe(0)
    // ADR-0012 TOTALITY — teeth (breaks-on "a scoreless emitted fact"): the driver forwards the score the
    // gate attached; an emitted fact without one is a defect, not a default.
    expect((out.facts[0] as unknown as { obviousness?: unknown }).obviousness).toBeDefined()
  })

  it("SCN-GEN-4c-1: the UNGROUNDED seed is rejected; the OBVIOUS one is emitted with a low score", () => {
    // ADR-0012. The retired assertion was `facts.length === 0` for BOTH `U` and `O`. Obviousness never
    // rejects: `O` reaches the fact set carrying `rank:'obvious'` and loses at ranking instead.
    const frontier = [cand("U", 0.9, 1), cand("O", 0.8, 2)]
    const out = runExtract(frontier, budgetOf(frontier.length), {
      proposer: seedProposer(recorder()),
      gate: gateTruthDoorOnly(new Set(["U"]), new Set(["O"])),
    })
    expect(out.facts.length).toBe(1) // only the truth door rejected — `U`
    expect(out.abstained.length).toBe(1)
    expect(out.abstained[0]!.site.qualifiedPath).toContain("U")
    // teeth (breaks-on "a resurrected obviousness gate — `O` is dropped to emitted:false"):
    expect((out.facts[0] as unknown as { obviousness: { rank: string } }).obviousness.rank).toBe("obvious")

    // CONTROL — a gate that fails the truth door on BOTH still admits neither (the door is real).
    const both = runExtract(frontier, budgetOf(frontier.length), {
      proposer: seedProposer(recorder()),
      gate: gateRejectAll(),
    })
    expect(both.facts.length).toBe(0)
    expect(both.abstained.length).toBe(2)
  })

  it("SCN-GEN-4d-1: a seed cannot self-declare true — self_asserted is ignored, only the gate admits", () => {
    // the model attaches self_asserted:true / confidence:1.0 but the gate (no external grounding) rejects.
    const out = runExtract([cand("s1", 0.9, 1)], budgetOf(1), {
      proposer: seedProposer(recorder(), { selfAsserted: true, confidence: 1.0 }),
      gate: gateRejectAll(),
    })
    // teeth: a driver that honoured the self-declaration would promote it — the fact set stays empty.
    expect(out.facts.length).toBe(0)
    expect(out.abstained.length).toBe(1)
  })
})

// ── GEN-6 — mined signals are ranking heuristics, never facts ──────────────────────────────────────────

describe("GEN-6 — churn/SZZ signals feed the rank only; a fact is minted solely by the gate", () => {
  const LOUD: MinedSignals = {
    hotspot: 0.99,
    szzBugCommits: 42,
    coChanged: [siteOf("other")],
    owners: ["alice"],
    messages: ["fix bug", "hotfix"],
  }

  it("SCN-GEN-6a-1: mined signals feed only the rank — the fact set is invariant to signal magnitude", () => {
    const admitted = new Set(["g1"])
    const weak = [cand("g1", 0.9, 1, ZERO_SIGNALS), cand("g2", 0.8, 2, ZERO_SIGNALS)]
    const loud = [cand("g1", 0.9, 1, LOUD), cand("g2", 0.8, 2, LOUD)]
    const a = runExtract(weak, budgetOf(2), { proposer: seedProposer(recorder()), gate: gateEmitFor(admitted) })
    const b = runExtract(loud, budgetOf(2), { proposer: seedProposer(recorder()), gate: gateEmitFor(admitted) })
    // signals never enter Fact[] — the admitted set depends on the gate, not the signal magnitude.
    expect(a.facts.length).toBe(1)
    expect(b.facts.length).toBe(1)
    expect(b.facts[0]!.grounding.entries[0]!.anchor.subtreeHash).toBe(
      a.facts[0]!.grounding.entries[0]!.anchor.subtreeHash,
    )
  })

  it("SCN-GEN-6b-1: a high-signal site with no grounded invariant is absent from the fact set", () => {
    const out = runExtract([cand("hot", 0.95, 1, LOUD)], budgetOf(1), {
      proposer: seedProposer(recorder()),
      gate: gateRejectAll(),
    })
    expect(out.facts.length).toBe(0)
  })

  it("SCN-GEN-6c-1: high churn/SZZ + no invariant → 0 facts (churn alone mints nothing)", () => {
    // the site has top-decile churn and high SZZ but the proposer abstains (no grounded invariant).
    const out = runExtract([cand("ledgerPost", 0.97, 1, LOUD)], budgetOf(1), {
      proposer: abstainProposer(recorder()),
      gate: gateEmitAll(),
    })
    expect(out.facts.length).toBe(0) // teeth: minting a fact from the churn signal alone would be 1 fact
    expect(out.abstained.length).toBe(1)
  })
})

// ── the frozen ExtractApi binding ──────────────────────────────────────────────────────────────────────

describe("makeExtract binds the frozen ExtractApi surface", () => {
  it("extract(cands, budget) drives the same result as runExtract", () => {
    const frontier = [cand("s1", 0.9, 1), cand("s2", 0.7, 2)]
    const deps = { proposer: seedProposer(recorder()), gate: gateEmitAll() }
    const api = makeExtract(deps)
    const out = api.extract(frontier, budgetOf(frontier.length))
    expect(out.facts.length).toBe(2)
  })
})
