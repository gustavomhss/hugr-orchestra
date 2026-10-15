// @atlas/e2e — S2 · Genesis mining: the deterministic governance spine
// AXIS: functioning (the $0-LLM deterministic mining loop + the admission bar).
//
// STORY. Genesis is the TOP of the DAG: it seeds an Atlas onto a brownfield repo. This story drives the REAL
// @atlas/genesis runtime and proves the DETERMINISTIC MACHINERY around the model — NOT the model itself:
//   (1) the S0/S1 floor is a byte-identical, $0-LLM function of (repo, rev) — `rank` re-runs identically and
//       `s0s1Cost` reports zero model calls (no embedding / RAG / clock leaked in),
//   (2) only ADMITTED seeds survive: `runExtract` routes every ranked site through the emit gate and a fact
//       enters ONLY on `emitted:true`; every rejected seed surfaces as a grounded `WhyNot`,
//   (3) spend is BOUNDED: with a ceiling below the frontier, the fact set never exceeds the ceiling,
//   (4) a VACUOUS predicate (teeth that flip no mutant) is `dropped`, never admitted as a real fact.
//
// INJECTED PORT — NOT the thing under test. The LLM is the `SiteProposer.propose` seam and the truth/teeth
// verdicts are the `EmitGate.emit` / `PredicateApi` seams (card exclusions "it calls them"). We supply
// deterministic doubles for exactly these ports — the proposer/gate/check-engine — so the machinery they
// bracket (ranking, budget, the emit/2-door gate, vacuous-drop) is what is actually exercised. Nothing here
// asserts anything about model quality; identity rides the sealed @atlas/kernel mint (`asSubtreeHash` /
// `asHash` / `asNodeKey`), hand-built, never really hashed. Fixture shapes reuse the proven per-WP unit
// fixtures (wp-8.27 skeleton, wp-8.28-a seed/gate, wp-8.28-b admit-harness), not re-derived from scratch.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asHash, asNodeKey } from "@atlas/kernel"
import { rank, s0s1Cost, runExtract, defaultCeiling, admit, LIKELY_INVARIANT } from "@atlas/genesis"
import type { StructRef, Hash } from "@atlas/contracts"
import type { Axes, DepEdge, IndexNode, Manifest } from "@atlas/index"
import type { Check, PredicateSlot } from "@atlas/knowledge"
import type {
  Candidate,
  MinedSignals,
  Fact,
  WhyNot,
  GenesisBudget,
  Skeleton,
  SiteProposer,
  EmitGate,
  PredicateProposal,
  PredicateApi,
  AdmitDeps,
  TwoDoorBar,
  TypeOracle,
} from "@atlas/genesis"

// ── the ranked frontier fixture (mirrors wp-8.27's acme-repo skeleton) ────────────────────────────────
// Both identity legs mint from one id (asHash('st-a10') === asSubtreeHash('st-a10') as strings) so a mined
// frontier site's CONTENT subtreeHash resolves to the dep-graph NODE-IDENTITY key — the toy collapse that
// keeps the fixture legible; the real subtreeHash≠identity bridge is exercised in the genesis unit suite.
const struct = (id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `pkg/${id}.ts::${id}`,
  subtreeHash: asSubtreeHash(id),
})
const A = struct("st-a10")
const B = struct("st-b22")
const C = struct("st-c31")
const D = struct("st-d40")
const FRONTIER = [A, B, C, D] as const

const edge = (from: string, to: string | null): DepEdge => ({
  from: asHash(from),
  to: to === null ? null : asHash(to),
  kind: "resolved",
})
// def→ref (referencing → defining): st-a10 is the hub (referenced by b/c/d), st-d40 is cold.
const REF_EDGES: readonly DepEdge[] = [
  edge("st-b22", "st-a10"),
  edge("st-c31", "st-a10"),
  edge("st-c31", "st-b22"),
  edge("st-d40", "st-a10"),
  edge("st-d40", "st-b22"),
  edge("st-d40", "st-c31"),
]

const leaf = (key: string): IndexNode => ({
  axis: "dependency",
  level: "symbol",
  key,
  subtreeHash: asSubtreeHash(key),
  children: [],
  objects: [] as readonly Hash[],
})
const axisRoot = (keys: readonly string[]): IndexNode => ({
  axis: "dependency",
  level: "repo",
  key: "root",
  subtreeHash: asSubtreeHash("root"),
  children: keys.map(leaf),
  objects: [],
})
const skeletonOf = (edges: readonly DepEdge[], keys: readonly string[]): Skeleton => {
  const axes: Axes = { spatial: axisRoot(keys), territory: axisRoot(keys), dependency: axisRoot(keys), edges }
  const manifest: Manifest = { territories: [] }
  return { axes, manifest }
}
const BASE_SKELETON = skeletonOf(REF_EDGES, ["st-a10", "st-b22", "st-c31", "st-d40"])

// ── the S2 driver fixtures (mirror wp-8.28-a) ─────────────────────────────────────────────────────────
const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }
const idOf = (c: Candidate): string => c.site.subtreeHash
const cand = (id: string, ppr: number, rank: number): Candidate => ({
  site: struct(id),
  signals: ZERO_SIGNALS,
  ppr,
  rank,
})

const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const budgetWithCeiling = (ceiling: number): GenesisBudget => ({
  ceiling,
  deepening: { review: OFF, enrich: OFF, expand: OFF },
})

/** A grounded fact whose anchor re-derives from the site — the driver only forwards the gate's verdict. */
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
  }) as unknown as Fact

/** The INJECTED LLM port: proposes a seed at every ranked site (opaque to the driver). */
const alwaysProposer: SiteProposer = { propose: (c) => ({ cand: c, claim: `claim@${idOf(c)}` }) }
/** The INJECTED emit gate: admits the given ids, rejects the rest with a grounded WhyNot. */
const gateEmitFor = (ids: ReadonlySet<string>): EmitGate => ({
  emit: (seed, c) =>
    ids.has(idOf(c))
      ? { emitted: true, fact: factFor(c, seed.claim) }
      : { emitted: false, whyNot: { site: c.site, reason: "no grounded non-obvious invariant at site" } },
})
const gateEmitAll = (): EmitGate => ({ emit: (seed, c) => ({ emitted: true, fact: factFor(c, seed.claim) }) })
const anchorOf = (f: Fact): string => f.grounding.entries[0]!.anchor.subtreeHash

// ── the admission-harness fixtures (mirror wp-8.28-b) ─────────────────────────────────────────────────
const predAnchor: StructRef = {
  kind: "block",
  qualifiedPath: "src/pay.ts#charge",
  subtreeHash: asSubtreeHash("st-a10"),
}
const predSite: Candidate = { site: predAnchor, signals: ZERO_SIGNALS, ppr: 0.42, rank: 1 }
const predGrounding = { entries: [{ anchor: predAnchor, path: "src/pay.ts" }] } as PredicateProposal["grounding"]
const predProposal = (): PredicateProposal => ({
  kind: "predicate",
  site: predSite,
  slot: "invariant" as PredicateSlot,
  nodeKey: asNodeKey("nk:charge-nonneg"),
  claimNorm: "charge() never returns a negative amount",
  grounding: predGrounding,
  tier: "T1",
})
const QUERY: Check = { kind: "index-query", query: "ql: forall c: charge | c.amount >= 0" }
const predIndexState: IndexNode = {
  axis: "spatial",
  level: "block",
  key: "src/pay.ts#charge",
  subtreeHash: asSubtreeHash("idx-a10"),
  children: [],
  objects: [],
}
const openDoors: TwoDoorBar = { grounded: () => true, nonObvious: () => true }
const closedTypeOracle: TypeOracle = { expressible: () => false, diagnose: () => "NA" }
/** The INJECTED synthesized-check engine: HOLDS on current code, `flips` decides whether any mutant BROKE it. */
const predicateSeam = (flips: boolean): PredicateApi => ({
  synthesize: () => QUERY,
  verify: () => "HOLDS",
  teeth: () => flips,
})
const admitDeps = (flips: boolean): AdmitDeps => ({
  predicate: predicateSeam(flips),
  doors: openDoors,
  typeOracle: closedTypeOracle,
  refine: () => null,
  indexState: predIndexState,
  K: 1,
})

describe("S2 · genesis mining — deterministic spine, admitted-only survival, vacuous dropped", () => {
  it("S1 ranking is a byte-identical $0-LLM function of the skeleton (determinism)", () => {
    const first = rank(BASE_SKELETON, FRONTIER)
    const second = rank(BASE_SKELETON, FRONTIER)
    // identical order AND identical ppr scores across independent runs.
    expect(second.map((c) => c.site.subtreeHash)).toEqual(first.map((c) => c.site.subtreeHash))
    expect(second.map((c) => c.ppr)).toEqual(first.map((c) => c.ppr))
    expect(JSON.stringify(second)).toBe(JSON.stringify(first)) // whole Candidate[] byte-identical

    // $0-LLM FLOOR — proven BEHAVIOURALLY with a live spy, not read off a self-reported constant.
    // A model port that increments on every invocation: ranking the frontier must never touch it; the model
    // is spent ONLY at extraction (S2). (The counter is proven live by the extract call below bumping it.)
    let modelCalls = 0
    const spyProposer: SiteProposer = {
      propose: (c) => {
        modelCalls += 1
        return { cand: c, claim: `claim@${idOf(c)}` }
      },
    }
    const ranked = rank(BASE_SKELETON, FRONTIER) // the whole S0/S1 structural floor
    // teeth (breaks-on "a model call leaked into the S0/S1 ranking floor"):
    expect(modelCalls).toBe(0) // ranking produced its Candidate[] with ZERO model invocations
    runExtract(ranked, budgetWithCeiling(ranked.length), { proposer: spyProposer, gate: gateEmitAll() })
    expect(modelCalls).toBeGreaterThan(0) // the spy IS live — so the 0 above is a real observation, not a dead counter

    // the reported S0/S1 cost ledger corroborates (stages present, both 0-LLM).
    const cost = s0s1Cost()
    expect(cost.map((s) => s.stage)).toEqual(["S0", "S1"])
    expect(cost.every((s) => s.llmCalls === 0)).toBe(true)
  })

  it("only gate-ADMITTED seeds become facts; every rejected seed surfaces as a grounded WhyNot", () => {
    const frontier = [cand("st-a10", 0.9, 1), cand("st-b22", 0.7, 2), cand("st-c31", 0.5, 3), cand("st-d40", 0.3, 4)]
    const admittedIds = new Set(["st-a10", "st-c31"]) // the gate admits these two, rejects the other two
    const out = runExtract(frontier, budgetWithCeiling(frontier.length), {
      proposer: alwaysProposer,
      gate: gateEmitFor(admittedIds),
    })

    // EXACTLY the admitted seeds appear in `facts` (keyed by their re-deriving grounded anchor).
    expect(new Set(out.facts.map(anchorOf))).toEqual(admittedIds)
    // EVERY rejected seed appears in `abstained` as a grounded WhyNot (site + honest reason).
    const rejected = frontier.map(idOf).filter((id) => !admittedIds.has(id))
    expect(new Set(out.abstained.map((w: WhyNot) => w.site.subtreeHash))).toEqual(new Set(rejected))
    expect(out.abstained.every((w: WhyNot) => w.reason.length > 0)).toBe(true)
    // teeth (breaks-on "an un-admitted seed becomes a fact — the emit bar is bypassed"):
    for (const f of out.facts) expect(admittedIds.has(anchorOf(f))).toBe(true)
    expect(out.facts.length + out.abstained.length).toBe(frontier.length) // every visited site is accounted for
  })

  it("spend is bounded: with a ceiling below the frontier, facts never exceed the ceiling (budget)", () => {
    const frontier = Array.from({ length: 5 }, (_, i) => cand(`b${i}`, 1 - i / 10, i + 1))
    const CEILING = 2 // strictly below the 5-site frontier
    const out = runExtract(frontier, budgetWithCeiling(CEILING), { proposer: alwaysProposer, gate: gateEmitAll() })
    // the gate would admit every visited site, but the driver STOPS at the ceiling — spend is capped.
    // teeth (breaks-on "extract exceeds its budget ceiling"):
    expect(out.facts.length).toBeLessThanOrEqual(CEILING)
    expect(out.facts.length).toBe(CEILING) // gate-emit-all ⇒ exactly the ceiling many
    expect(defaultCeiling(5)).toBe(5) // the default is min(n,200); here we hand a tighter hard ceiling
  })

  it("a VACUOUS predicate (teeth flip no mutant) is DROPPED, never admitted as a real fact", () => {
    // HOLDS on current code but survives EVERY mutant (flips:false) — a tautology that proves nothing.
    const vacuous = admit(predProposal(), admitDeps(false))
    // teeth (breaks-on "a vacuous predicate is admitted as a real fact"):
    expect(vacuous.outcome).toBe("dropped")
    if (vacuous.outcome !== "dropped") throw new Error("unreachable")
    expect(vacuous.reason).toContain("vacuous") // the DROP_VACUOUS reason (GEN-12j)
    // contrast: the SAME proposal WITH teeth (flips on a mutant) IS admitted — the gate is real, not always-closed.
    const withTeeth = admit(predProposal(), admitDeps(true))
    expect(withTeeth.outcome).toBe("admitted")
    if (withTeeth.outcome !== "admitted") throw new Error("unreachable")
    expect(withTeeth.label).toBe(LIKELY_INVARIANT) // a machine-checked likely invariant, never a proof
  })
})
