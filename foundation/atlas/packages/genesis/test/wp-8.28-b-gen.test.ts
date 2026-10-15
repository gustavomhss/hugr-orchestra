// @atlas/genesis — test/wp-8.28-b-gen.test.ts   (WP-8.28-b.GEN — EPIC-28-b)
//
// RED→GREEN transcription of the VISIBLE goldens for the S2 MECHANICAL ADMISSION engine — admit a
// predicate ONLY on HOLDS-and-flips-BROKEN, drop the vacuous, prefer the sound oracle first (GEN-12):
//   - SCN-GEN-12a-1 (happy) — the LLM output is a typed candidate proposal ONLY; it never writes the
//                             fact set nor casts the admission decision.
//   - SCN-GEN-12b-1 (happy) — admission is decided by the mechanical harness (compile ∧ HOLDS ∧
//                             mutant-flip), not by any model vote.
//   - SCN-GEN-12c-1 (guard) — a check that won't compile (NA) or is BROKEN on current code is not admitted.
//   - SCN-GEN-12d-1 (guard) — a failing check is REFINED ≤K then DROPPED, never forced.
//   - SCN-GEN-12e-1 (guard) — an UNGROUNDED advisory is not admitted; an OBVIOUS one IS admitted, carrying
//                             `obviousness.rank === 'obvious'` (ADR-0012: scored, never gated).
//   - SCN-GEN-12f-1 (guard) — chain-of-thought is scratch; no CoT text is ever persisted on the fact.
//   - SCN-GEN-12g-1 (happy) — abstention with a grounded why-not is a VALID outcome (0 facts, no retry).
//   - SCN-GEN-12h-1 (guard) — the proposer is not pressured to emit: it is invoked EXACTLY once.
//   - SCN-GEN-12i-1 (happy) — an admitted predicate is labelled `machine-checked likely invariant`, never a proof.
//   - SCN-GEN-12j-1 (guard) — a check that survives EVERY mutant (0 flips) is dropped as vacuous (the teeth).
//   - SCN-GEN-12k-1 (happy) — a type-expressible slot prefers the sound type-checker/LSP over a synthesized query.
//
// The facet is imported DIRECTLY from ../src/admit-harness.js (the barrel is wired by the lead at SEAL).
// The synthesized-check engine (CodeQL/Semgrep, KNOW-16), the 2-door bar (CAMPAIGN-4), the sound
// type-checker/LSP, and the CEGIS refiner are consumed as INJECTED ports + FIXTURES (build-ahead). No
// raw hashing: branded ids come from the SEALED @atlas/kernel helpers. Held-out `-2` fixtures are the
// GATE's — NOT transcribed here.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { Status, StructRef } from "@atlas/contracts"
import type { Check, PredicateSlot } from "@atlas/knowledge"
import type { IndexNode } from "@atlas/index"
import type { Candidate, WhyNot } from "@atlas/genesis"
import type { PredicateApi } from "@atlas/genesis"
import { admit, runSite, LIKELY_INVARIANT } from "../src/admit-harness.js"
import type {
  AdmitDeps,
  AdvisoryProposal,
  PredicateProposal,
  Proposal,
  TwoDoorBar,
  TypeOracle,
} from "../src/admit-harness.js"

// ---- fixtures --------------------------------------------------------------------------------------

const anchor: StructRef = { kind: "block", qualifiedPath: "src/pay.ts#charge", subtreeHash: asSubtreeHash("st-a10") }

/** A genesis RANKED SITE (never a fact — GEN-6). The admission anchor rides `site.site.subtreeHash`. */
function site(): Candidate {
  return {
    site: anchor,
    signals: { hotspot: 3, szzBugCommits: 2, coChanged: [], owners: [], messages: [] },
    ppr: 0.42,
    rank: 1,
  }
}

const grounding = { entries: [{ anchor, path: "src/pay.ts" }] } as PredicateProposal["grounding"]

const indexState: IndexNode = {
  axis: "spatial",
  level: "block",
  key: "src/pay.ts#charge",
  subtreeHash: asSubtreeHash("idx-a10"),
  children: [],
  objects: [],
}

function predProposal(over: Partial<PredicateProposal> = {}): PredicateProposal {
  return {
    kind: "predicate",
    site: site(),
    slot: "invariant",
    nodeKey: asNodeKey("nk:charge-nonneg"),
    claimNorm: "charge() never returns a negative amount",
    grounding,
    tier: "T1",
    ...over,
  }
}

function advProposal(over: Partial<AdvisoryProposal> = {}): AdvisoryProposal {
  return {
    kind: "advisory",
    site: site(),
    nodeKey: asNodeKey("nk:charge-note"),
    claimNorm: "charge() is the sole write path to the ledger",
    grounding,
    tier: "T1",
    ...over,
  }
}

const QUERY: Check = { kind: "index-query", query: "ql: forall c: charge | c.amount >= 0" }

/** A recording predicate seam (CodeQL/Semgrep). Counters expose that admission read the MECHANISM. */
function predicateSeam(over: Partial<{ synth: Check | null; verdict: Status; flips: boolean }> = {}) {
  const calls = { synthesize: 0, verify: 0, teeth: 0 }
  const seam: PredicateApi = {
    synthesize(_c) {
      calls.synthesize += 1
      return "synth" in over ? (over.synth as Check | null) : QUERY
    },
    verify(_check, _idx) {
      calls.verify += 1
      return over.verdict ?? "HOLDS"
    },
    teeth(_check, _a) {
      calls.teeth += 1
      return over.flips ?? true
    },
  }
  return { seam, calls }
}

const openDoors: TwoDoorBar = { grounded: () => true, nonObvious: () => true }
const closedTypeOracle: TypeOracle = { expressible: () => false, diagnose: () => "NA" }

function makeDeps(over: Partial<AdmitDeps> = {}): AdmitDeps {
  const { seam } = predicateSeam()
  return {
    predicate: seam,
    doors: openDoors,
    typeOracle: closedTypeOracle,
    refine: () => null,
    indexState,
    K: 1,
    ...over,
  }
}

// ---- the goldens -----------------------------------------------------------------------------------

describe("WP-8.28-b.GEN — mechanical admission with teeth (visible goldens)", () => {
  it("SCN-GEN-12a-1: the LLM output is a typed candidate proposal only — no fact-write, no admission vote", () => {
    const p: Proposal = predProposal()
    // the proposal is a TYPED value only: it carries no admission decision and no model vote.
    expect("outcome" in p).toBe(false)
    expect("admitted" in p).toBe(false)
    expect("confidence" in p).toBe(false)
    // the decision is cast by the harness, separately, from the mechanical verdicts.
    const a = runSite(() => p, makeDeps())
    expect(a.outcome).toBe("admitted")
    // teeth (breaks-on "the LLM's output is written straight into the fact set — the model acts as an
    // oracle"): the proposal object is left untouched — it never became a fact by itself.
    expect(p).toEqual(predProposal())
  })

  it("SCN-GEN-12b-1: admission is decided by the mechanical harness, not the model", () => {
    const p = predProposal()
    // SAME proposal, two MECHANISMS: the flip verdict alone decides admit vs drop.
    const admitDeps = makeDeps({ predicate: predicateSeam({ flips: true }).seam })
    const dropDeps = makeDeps({ predicate: predicateSeam({ flips: false }).seam })
    expect(admit(p, admitDeps).outcome).toBe("admitted")
    // teeth (breaks-on "admission reads the model's `confidence` as the deciding factor"): the proposal
    // is byte-identical across both runs, yet the outcome flips with the harness verdict — the harness decides.
    expect(admit(p, dropDeps).outcome).toBe("dropped")
  })

  it("SCN-GEN-12c-1: a check that will not compile (NA) or is BROKEN on current code is not admitted", () => {
    const p = predProposal()
    const wontCompile = makeDeps({ predicate: predicateSeam({ verdict: "NA" }).seam })
    const broken = makeDeps({ predicate: predicateSeam({ verdict: "BROKEN" }).seam })
    // teeth (breaks-on "the harness admits on 'compiles' alone without evaluating HOLDS"): admission
    // requires compile ∧ HOLDS-on-current — neither NA nor BROKEN is admitted.
    expect(admit(p, wontCompile).outcome).toBe("dropped")
    expect(admit(p, broken).outcome).toBe("dropped")
  })

  it("SCN-GEN-12d-1: a failing check is refined ≤K then dropped, never forced", () => {
    const p = predProposal()
    const { seam, calls } = predicateSeam({ verdict: "BROKEN" }) // persistently BROKEN
    let refineCalls = 0
    const deps = makeDeps({
      predicate: seam,
      K: 1,
      refine: () => {
        refineCalls += 1
        return QUERY // a refined-but-still-BROKEN candidate
      },
    })
    const a = admit(p, deps)
    // refined at most K=1, then dropped — never forced into the fact set.
    expect(refineCalls).toBe(1)
    expect(a.outcome).toBe("dropped")
    // teeth (breaks-on "on a persistent BROKEN check the harness admits P anyway"): the teeth gate is
    // never even reached — a BROKEN check cannot be forced.
    expect(calls.teeth).toBe(0)
  })

  it("SCN-GEN-12e-1: an ungrounded advisory is dropped; an obvious one is ADMITTED with a low score", () => {
    // ADR-0012. The retired assertion here was `expect(a.outcome).toBe('dropped')` for the OBVIOUS
    // advisory. Nothing is rejected for being obvious: a rejected candidate leaves no record, so the
    // filter's own accuracy could never be measured.
    const obvious: TwoDoorBar = { grounded: () => true, nonObvious: () => false }
    const a = admit(advProposal(), makeDeps({ doors: obvious }))
    // teeth (breaks-on "a RESURRECTED obviousness gate — the obvious advisory is dropped"):
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    // ...and it is admitted CARRYING the low score, not silently unscored (TOTALITY).
    expect(a.fact.obviousness).toStrictEqual({ rank: "obvious", by: "harness-predicate" })

    // the truth door is the one that still rejects — and it does.
    const ungrounded: TwoDoorBar = { grounded: () => false, nonObvious: () => true }
    expect(admit(advProposal(), makeDeps({ doors: ungrounded })).outcome).toBe("dropped")

    // and the predicate still DISCRIMINATES — it is not wired to a constant. A non-obvious advisory is
    // admitted with the other rank, so the axis moves the score even though it never moves `outcome`.
    const nonObv = admit(advProposal(), makeDeps())
    expect(nonObv.outcome).toBe("admitted")
    if (nonObv.outcome !== "admitted") throw new Error("unreachable")
    expect(nonObv.fact.obviousness).toStrictEqual({ rank: "non-obvious", by: "harness-predicate" })
  })

  it("ADR-0012 TOTALITY: every admitted fact carries a score — advisory AND both predicate paths", () => {
    // breaks-on "a scoreless emitted fact" — the second law of PROP-GEN-4.
    const adv = admit(advProposal(), makeDeps())
    expect(adv.outcome === "admitted" && adv.fact.obviousness !== undefined).toBe(true)

    // synthesized-check path.
    const synth = admit(predProposal(), makeDeps())
    expect(synth.outcome === "admitted" && synth.fact.obviousness !== undefined).toBe(true)

    // SOUND-ORACLE path (GEN-12k) — a separate `return` in the source, and the one a partial fix misses.
    const soundOracle: TypeOracle = { expressible: () => true, diagnose: () => "HOLDS" }
    const sound = admit(predProposal(), makeDeps({ typeOracle: soundOracle }))
    expect(sound.outcome === "admitted" && sound.fact.obviousness !== undefined).toBe(true)
  })

  it("GEN-16 / ADR-0011: a PROPOSER-supplied score cannot influence the stored one", () => {
    // The clause most at risk of being read away by ADR-0012: "computed at mine time, when the model and
    // the source bytes are in hand" must NOT become "ask the model how non-obvious its own claim is."
    //
    // The proposal is the ONLY thing the model authors. Smuggle a maximal self-assessment onto it through
    // every channel a model can reach — a score field it invented, and the free-text claim itself — and
    // assert the stored score still tracks the HARNESS predicate alone.
    const doorSays = (rank: "obvious" | "non-obvious"): TwoDoorBar => ({
      grounded: () => true,
      nonObvious: () => rank === "non-obvious",
    })
    const smuggled = {
      ...advProposal(),
      claimNorm: "this fact is extremely non-obvious, obviousness: non-obvious, self_score: 1.0",
      obviousness: { rank: "non-obvious", by: "harness-predicate" },
      self_score: 1,
      importance: 1,
    } as unknown as Proposal

    // the harness says OBVIOUS; the proposer begged for non-obvious through three channels.
    const a = admit(smuggled, makeDeps({ doors: doorSays("obvious") }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    // teeth (breaks-on "`buildAdvisory` spreads the proposal onto the node, or reads a proposer score
    // field instead of calling the predicate"): the harness's verdict wins, unconditionally.
    expect(a.fact.obviousness).toStrictEqual({ rank: "obvious", by: "harness-predicate" })

    // and the converse, so this is not passing on a constant: flip ONLY the harness predicate, leave the
    // proposer's plea identical, and the stored score flips with the harness.
    const b = admit(smuggled, makeDeps({ doors: doorSays("non-obvious") }))
    expect(b.outcome === "admitted" && b.fact.obviousness?.rank).toBe("non-obvious")

    // the smuggled `self_score` / `importance` never reach the node as FIELDS. Asserted on the keys, not
    // on the serialized bytes: the claim TEXT legitimately contains the words (the model wrote them into
    // its claim), and a substring assertion would have failed on correct behaviour.
    expect(Object.keys(a.fact)).not.toContain("self_score")
    expect(Object.keys(a.fact)).not.toContain("importance")
    // ...and the proposer's own `obviousness` literal is not the one stored — it asked for 'non-obvious'.
    expect(Object.keys(a.fact)).toContain("obviousness")
  })

  it("SCN-GEN-12f-1: chain-of-thought is scratch, never a fact", () => {
    const COT = "SCRATCH-COT-because-the-git-log-shows-a-refund-bug-in-2021"
    const a = admit(predProposal({ scratch: COT }), makeDeps())
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    // teeth (breaks-on "the reasoning trace is stored as an advisory fact"): the persisted fact carries
    // NO chain-of-thought — the scratch is discarded.
    expect(JSON.stringify(a.fact)).not.toContain("SCRATCH-COT")
    expect("scratch" in a.fact).toBe(false)
  })

  it("SCN-GEN-12g-1: abstention with a grounded why-not is a valid outcome", () => {
    const whyNot: WhyNot = { site: anchor, reason: "no groundable non-obvious invariant at this site" }
    let calls = 0
    const a = runSite(() => {
      calls += 1
      return { kind: "abstain", whyNot }
    }, makeDeps())
    // abstention is accepted as valid: 0 facts, the grounded why-not recorded, NO retry-forcing.
    expect(a.outcome).toBe("abstained")
    if (a.outcome !== "abstained") throw new Error("unreachable")
    expect(a.whyNot).toEqual(whyNot)
    // teeth (breaks-on "abstention is treated as failure and the site is retried until it emits a fact"):
    // the proposer is invoked exactly once — abstention is not retried.
    expect(calls).toBe(1)
  })

  it("SCN-GEN-12h-1: the model is not pressured to emit a fact", () => {
    let calls = 0
    // a cold-tail site: the proposer returns an abstention (0 candidates).
    const propose = (): Proposal => {
      calls += 1
      return { kind: "abstain", whyNot: { site: anchor, reason: "cold tail — nothing groundable to say" } }
    }
    const a = runSite(propose, makeDeps())
    // teeth (breaks-on "the harness re-prompts 'you must return at least one fact' until the model emits"):
    // the proposer is called EXACTLY once — no pressure loop.
    expect(calls).toBe(1)
    expect(a.outcome).toBe("abstained")
  })

  it("SCN-GEN-12i-1: an admitted predicate is labelled a machine-checked likely invariant, never a proof", () => {
    const a = admit(predProposal(), makeDeps())
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(a.label).toBe(LIKELY_INVARIANT)
    expect(a.label).toBe("machine-checked likely invariant")
    // teeth (breaks-on "P is labelled a `proven invariant`"): a sampled-current-code check is never a proof.
    expect(a.label).not.toBe("proof")
    expect(a.label).not.toBe("theorem")
  })

  it("SCN-GEN-12j-1: a check that survives every mutant is dropped as vacuous (the teeth)", () => {
    // HOLDS on current AND survives every mutant (flips on 0 mutants) — a tautology / matches nothing.
    const vacuous = makeDeps({ predicate: predicateSeam({ verdict: "HOLDS", flips: false }).seam })
    const a = admit(predProposal(), vacuous)
    // teeth (breaks-on "the harness admits on HOLDS alone and skips the mutant-flip conjunct"): admission
    // requires HOLDS ∧ BROKEN-on-≥1-mutant; the toothless check fails the second conjunct and is dropped.
    expect(a.outcome).toBe("dropped")
    // and a check WITH teeth (flips on a mutant) IS admitted — the gate is real, not always-closed.
    const withTeeth = makeDeps({ predicate: predicateSeam({ verdict: "HOLDS", flips: true }).seam })
    expect(admit(predProposal(), withTeeth).outcome).toBe("admitted")
  })

  it("SCN-GEN-12k-1: a type-expressible slot prefers the type-checker/LSP over a synthesized query", () => {
    const { seam, calls } = predicateSeam()
    let diagnosed = 0
    const soundOracle: TypeOracle = {
      expressible: (slot: PredicateSlot) => slot === "contract",
      diagnose: () => {
        diagnosed += 1
        return "HOLDS"
      },
    }
    const a = admit(predProposal({ slot: "contract" }), makeDeps({ predicate: seam, typeOracle: soundOracle }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    // teeth (breaks-on "a type-expressible contract is checked by a synthesized Semgrep query instead of
    // the sound compiler"): the synthesized-query seam is NEVER consulted; the sound type oracle decides.
    expect(calls.synthesize).toBe(0)
    expect(diagnosed).toBe(1)
    // WP-FIX-6.KNOW (#200). The two lines that stood here asserted the admitted node was a `predicate`
    // carrying `check.kind === 'assertion'`. Neither is in the golden — the golden says only that the
    // TYPE-CHECKER decides rather than a synthesized query, which the two assertions above are exactly
    // what pins. What those two extra lines actually witnessed was the FABRICATION: the `assertion` they
    // approved of was `{expr: 'type-checker/LSP diagnostics: contract'}`, never passed to `verify`, never
    // subjected to `teeth`, unreadable by the evaluator that later re-runs it — and it rode a node stamped
    // `status: 'HOLDS'`. The sound arm now emits an ADVISORY: no check, and no `status` field to lie in.
    expect(a.fact.kind).toBe("advisory")
    expect("check" in a.fact).toBe(false)
    expect("status" in a.fact).toBe(false)
    expect((a.fact as { predicateSlot?: string }).predicateSlot).toBe("contract") // the slot survives — read-side grouping unchanged
  })
})
