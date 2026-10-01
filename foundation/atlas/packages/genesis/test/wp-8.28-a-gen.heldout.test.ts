// @atlas/genesis — test/wp-8.28-a-gen.heldout.test.ts  (WP-8.28-a.GEN — HELD-OUT `-2` gate)
//
// Cold-review held-out transcription of the `-2` beacon goldens (goldens-gen.md:910-1079):
//   GEN-2a..2f-2 · GEN-4a..4d-2 · GEN-6a..6c-2. Independent beacon data; NOT the author's visible fixtures.
import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { Candidate, Fact, MinedSignals } from "@atlas/genesis"
import type { GenesisBudget } from "@atlas/genesis"
import { runExtract, defaultCeiling, type AdvisorySeed, type SiteProposer, type EmitGate } from "../src/extract.js"

const ZERO: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }
const siteOf = (id: string, st = `st-${id}`): StructRef => ({
  kind: "symbol",
  qualifiedPath: `beacon/${id}.ts::${id}`,
  subtreeHash: asSubtreeHash(st),
})
const idOf = (c: Candidate): string => c.site.qualifiedPath.split("::")[1]!
const cand = (id: string, ppr: number, rank: number, s: MinedSignals = ZERO, st?: string): Candidate => ({
  site: siteOf(id, st),
  signals: s,
  ppr,
  rank,
})
const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const budgetOf = (n: number): GenesisBudget => ({
  ceiling: defaultCeiling(n),
  deepening: { review: OFF, enrich: OFF, expand: OFF },
})
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
    obviousness: { rank: "non-obvious", by: "harness-predicate" },
  }) as unknown as Fact
const rec = () => ({ calls: [] as string[] })
const seedProposer = (r: { calls: string[] }, extra?: Partial<AdvisorySeed>): SiteProposer => ({
  propose(c) {
    r.calls.push(idOf(c))
    return { cand: c, claim: `claim@${idOf(c)}`, ...extra }
  },
})
const abstainProposer = (r: { calls: string[] }): SiteProposer => ({
  propose(c) {
    r.calls.push(idOf(c))
    return null
  },
})
const emitAll = (): EmitGate => ({ emit: (s, c) => ({ emitted: true, fact: factFor(c, s.claim) }) })
const rejectAll = (): EmitGate => ({
  emit: (_s, c) => ({ emitted: false, whyNot: { site: c.site, reason: "ungrounded — the truth door" } }),
})
/** ADR-0012 — the truth door rejects; an OBVIOUS seed emits carrying `rank:'obvious'`. */
const truthDoorOnly = (ungrounded: ReadonlySet<string>, obvious: ReadonlySet<string>): EmitGate => ({
  emit: (s, c) =>
    ungrounded.has(idOf(c))
      ? { emitted: false, whyNot: { site: c.site, reason: "ungrounded — the truth door" } }
      : {
          emitted: true,
          fact: {
            ...(factFor(c, s.claim) as unknown as Record<string, unknown>),
            obviousness: { rank: obvious.has(idOf(c)) ? "obvious" : "non-obvious", by: "harness-predicate" },
          } as unknown as Fact,
        },
})
const emitFor = (ids: ReadonlySet<string>): EmitGate => ({
  emit: (s, c) =>
    ids.has(idOf(c))
      ? { emitted: true, fact: factFor(c, s.claim) }
      : { emitted: false, whyNot: { site: c.site, reason: "no invariant" } },
})

const beacon = (): Candidate[] => [
  cand("h1", 0.88, 1),
  cand("h2", 0.63, 2),
  cand("h3", 0.61, 3),
  cand("h4", 0.12, 4),
  cand("h5", 0.1, 5),
]

describe("GEN-2 held-out (-2 beacon)", () => {
  it("SCN-GEN-2a-2: un-ranked v2 receives 0 LLM calls", () => {
    const r = rec()
    runExtract(beacon(), budgetOf(5), { proposer: seedProposer(r), gate: emitAll() })
    expect(r.calls).not.toContain("v2")
    expect(new Set(r.calls)).toEqual(new Set(["h1", "h2", "h3", "h4", "h5"]))
  })
  it("SCN-GEN-2b-2: strictly descending PPR order over 5 sites", () => {
    const shuffled = [beacon()[2]!, beacon()[0]!, beacon()[4]!, beacon()[1]!, beacon()[3]!]
    const r = rec()
    runExtract(shuffled, budgetOf(5), { proposer: seedProposer(r), gate: emitAll() })
    expect(r.calls).toEqual(["h1", "h2", "h3", "h4", "h5"])
  })
  it("SCN-GEN-2c-2: exactly one bounded call for h1", () => {
    const r = rec()
    runExtract(beacon(), budgetOf(5), { proposer: seedProposer(r), gate: emitAll() })
    expect(r.calls.filter((c) => c === "h1").length).toBe(1)
  })
  it("SCN-GEN-2d-2: ceiling holds at min(frontier,200) for 5 and 750", () => {
    const r5 = rec()
    runExtract(beacon(), budgetOf(5), { proposer: seedProposer(r5), gate: emitAll() })
    expect(r5.calls.length).toBeLessThanOrEqual(5)
    const big = Array.from({ length: 750 }, (_, i) => cand(`b${i}`, 1 - i / 2000, i))
    const rB = rec()
    runExtract(big, budgetOf(750), { proposer: seedProposer(rB), gate: emitAll() })
    expect(defaultCeiling(750)).toBe(200)
    expect(rB.calls.length).toBe(200)
  })
  it("SCN-GEN-2e-2: halt when trailing-20 admits only 2 (<20%)", () => {
    const frontier = Array.from({ length: 30 }, (_, i) => cand(`c${i + 1}`, 1 - i / 100, i + 1))
    const r = rec()
    const out = runExtract(frontier, budgetOf(30), { proposer: seedProposer(r), gate: emitFor(new Set(["c1", "c2"])) })
    expect(r.calls.length).toBe(20) // halts at floor, does not drain 30
    expect(out.facts.length).toBe(2)
  })
  it("SCN-GEN-2f-2: no whole-repo sweep — 5 of 1200 symbols visited", () => {
    const r = rec()
    runExtract(beacon(), budgetOf(5), { proposer: seedProposer(r), gate: emitAll() })
    expect(r.calls.length).toBeLessThanOrEqual(5)
  })
})

describe("GEN-4 held-out (-2 beacon)", () => {
  it("SCN-GEN-4a-2: beacon seed carries re-deriving subtreeHash st-e50", () => {
    const c = cand("finalize", 0.9, 1, ZERO, "st-e50")
    const out = runExtract([c], budgetOf(1), { proposer: seedProposer(rec()), gate: emitAll() })
    expect(out.facts[0]!.grounding.entries[0]!.anchor.subtreeHash).toBe(asSubtreeHash("st-e50"))
  })
  it("SCN-GEN-4b-2: beacon seed clears the truth door and CARRIES a score (ADR-0012 totality)", () => {
    const out = runExtract([cand("reverse", 0.9, 1, ZERO, "st-f61")], budgetOf(1), {
      proposer: seedProposer(rec()),
      gate: emitAll(),
    })
    expect(out.facts.length).toBe(1)
    expect((out.facts[0] as unknown as { obviousness?: unknown }).obviousness).toBeDefined()
  })
  it("SCN-GEN-4c-2: ungrounded beacon seed → emitted:false; the obvious one → emitted, scored", () => {
    const out = runExtract([cand("U2", 0.9, 1), cand("O2", 0.8, 2)], budgetOf(2), {
      proposer: seedProposer(rec()),
      gate: truthDoorOnly(new Set(["U2"]), new Set(["O2"])),
    })
    expect(out.facts.length).toBe(1)
    expect(out.abstained.length).toBe(1)
    expect((out.facts[0] as unknown as { obviousness: { rank: string } }).obviousness.rank).toBe("obvious")
  })
  it("SCN-GEN-4d-2: beacon seed cannot self-declare true", () => {
    const out = runExtract([cand("renew", 0.9, 1)], budgetOf(1), {
      proposer: seedProposer(rec(), { selfAsserted: true, confidence: 1.0 }),
      gate: rejectAll(),
    })
    expect(out.facts.length).toBe(0)
  })
})

describe("GEN-6 held-out (-2 beacon)", () => {
  const LOUD: MinedSignals = {
    hotspot: 0.99,
    szzBugCommits: 42,
    coChanged: [siteOf("x")],
    owners: ["a"],
    messages: ["fix"],
  }
  it("SCN-GEN-6a-2: signals feed rank only, never Fact[]", () => {
    const admitted = new Set(["finalize"])
    const weak = runExtract([cand("finalize", 0.9, 1, ZERO)], budgetOf(1), {
      proposer: seedProposer(rec()),
      gate: emitFor(admitted),
    })
    const loud = runExtract([cand("finalize", 0.9, 1, LOUD)], budgetOf(1), {
      proposer: seedProposer(rec()),
      gate: emitFor(admitted),
    })
    expect(weak.facts.length).toBe(1)
    expect(loud.facts.length).toBe(1)
    expect(JSON.stringify(loud.facts[0])).not.toContain("42") // SZZ score never lands in the fact
  })
  it("SCN-GEN-6b-2: ungrounded beacon signal absent from fact set", () => {
    const out = runExtract([cand("renew", 0.95, 1, LOUD)], budgetOf(1), {
      proposer: seedProposer(rec()),
      gate: rejectAll(),
    })
    expect(out.facts.length).toBe(0)
  })
  it("SCN-GEN-6c-2: high churn/SZZ + no invariant → 0 facts", () => {
    const out = runExtract([cand("reverse", 0.97, 1, LOUD)], budgetOf(1), {
      proposer: abstainProposer(rec()),
      gate: emitAll(),
    })
    expect(out.facts.length).toBe(0)
    expect(out.abstained.length).toBe(1)
  })
})
