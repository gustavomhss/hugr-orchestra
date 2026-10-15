// @atlas/cli — test/mine-gate-shape-dispatch.test.ts  (WP-96-SEAM2 · the propose-side seam for #96)
//
// THE SEAM. WP-96-SEAM widened the genesis `Proposal` union (advisory / predicate / relation / negation) and
// wired the admit switch; but the PROPOSE side stayed advisory-only — `SeedProposal` carried only `{cand,
// claim,…}` and `makeAdmitGate` HARDCODED a `kind:'advisory'` proposal, so a mine pass could only ever emit
// advisory. WP-96-SEAM2 makes the SEED carry its fact FAMILY (`kind`) and the gate DISPATCH on it, building
// the matching typed proposal and handing it to the frozen `admit`. After this seam P/R/N are disjoint.
//
// This suite injects a proposer that supplies EACH shape and proves the gate routes it to the MATCHING admit
// arm: advisory → admitAdvisory (unchanged), predicate → admitPredicate (REAL — synthesize+HOLDS+teeth ⇒ it
// ADMITS), relation → admitRelation (REAL since WP-96-R — grounds+mints a RelationNode, direction preserved),
// negation → admitNegation (REAL since WP-96-N — mints negationKey over the witness scope, hands over a
// CANDIDATE the door grounds at admit). The default proposer still emits advisory, so the whole existing mine +
// genesis suite is the back-compat control — advisory is byte-identical.

import { describe, it, expect } from "vitest"
import { makeAdmitGate } from "../src/mine.js"
import { asSubtreeHash } from "@atlas/kernel"
import { negationKey } from "@atlas/knowledge"
import type { RelationKind } from "@atlas/knowledge"
import type { StructRef, Status } from "@atlas/contracts"
import type { Check } from "@atlas/knowledge"
import type { IndexNode } from "@atlas/index"
import type { AdmitDeps, Candidate, SeedProposal } from "@atlas/genesis"

// ── the site + candidate the seeds are proposed at ─────────────────────────────────────────────────────
const site: StructRef = { kind: "symbol", qualifiedPath: "pkg/svc.ts::svc", subtreeHash: asSubtreeHash("st-svc") }
const cand: Candidate = {
  site,
  rank: 0,
  ppr: 1,
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
}
const indexNode: IndexNode = {
  axis: "dependency",
  level: "symbol",
  key: "svc",
  subtreeHash: asSubtreeHash("svc"),
  children: [],
  objects: [],
}

/**
 * An `AdmitDeps` whose every mechanism ADMITS on the paths this suite drives: the truth door grounds, the
 * synthesized-check path compiles+HOLDS+has-teeth. `synthesize` is COUNTED so the predicate case proves it
 * really reached `admitPredicate` (not a mislabelled advisory). The slot is NOT type-expressible, so the
 * predicate takes the synthesized-check arm — the one the DoD asks to admit end-to-end through the gate.
 */
const admitAllDeps = (): { deps: AdmitDeps; synthCalls: () => number } => {
  let synth = 0
  const held: Check = { kind: "index-query", query: "exists|svc" }
  return {
    synthCalls: () => synth,
    deps: {
      predicate: {
        synthesize: () => {
          synth += 1
          return held
        },
        verify: (): Status => "HOLDS",
        teeth: () => true,
      },
      doors: { grounded: () => true, nonObvious: () => true },
      typeOracle: { expressible: () => false, diagnose: (): Status => "HOLDS" },
      refine: () => null,
      indexState: indexNode,
      K: 1,
    },
  }
}

const factKind = (f: unknown): string => (f as { kind: string }).kind
const factStatus = (f: unknown): string | undefined => (f as { status?: string }).status

describe("WP-96-SEAM2 — the gate dispatches on the seed's fact FAMILY", () => {
  it("an ADVISORY seed (no kind) → admitted advisory, byte-identical to the pre-widening path", () => {
    const { deps } = admitAllDeps()
    const gate = makeAdmitGate(deps) // no reground — the raw-seed grounding branch, exactly as today
    const seed: SeedProposal = { cand, claim: "svc coordinates the pipeline" }

    const v = gate.emit(seed, cand)
    expect(v.emitted).toBe(true)
    if (!v.emitted) throw new Error("unreachable")
    expect(factKind(v.fact)).toBe("advisory")
    // scored by the harness, never self-scored (ADR-0012 TOTALITY) — the same advisory shape the suite ships.
    expect((v.fact as unknown as { obviousness?: { by: string } }).obviousness?.by).toBe("harness-predicate")
  })

  it("a PREDICATE seed → reaches admitPredicate (REAL) and ADMITS a HOLDS predicate node end-to-end", () => {
    const { deps, synthCalls } = admitAllDeps()
    const gate = makeAdmitGate(deps)
    const seed: SeedProposal = { kind: "predicate", cand, claim: "svc holds its invariant", slot: "invariant" }

    const v = gate.emit(seed, cand)
    expect(synthCalls()).toBe(1) //                    the synthesized-check arm ran — this is admitPredicate
    expect(v.emitted).toBe(true)
    if (!v.emitted) throw new Error("unreachable")
    expect(factKind(v.fact)).toBe("predicate") //      a PredicateNode, not a mislabelled advisory
    expect(factStatus(v.fact)).toBe("HOLDS") //        earned through verify+teeth, the live predicate path
  })

  it("a RELATION seed → reaches admitRelation (REAL, WP-96-R) and ADMITS a relation node end-to-end", () => {
    const { deps, synthCalls } = admitAllDeps()
    const gate = makeAdmitGate(deps)
    const seed: SeedProposal = {
      kind: "relation",
      cand,
      claim: "svc depends on repo",
      relationKind: "depends-on",
      endpointA: "pkg/svc.ts::svc",
      endpointB: "pkg/repo.ts::repo",
    }

    const v = gate.emit(seed, cand)
    expect(v.emitted).toBe(true)
    if (!v.emitted) throw new Error("unreachable")
    expect(factKind(v.fact)).toBe("relation") //       a RelationNode, not a mislabelled advisory
    const r = v.fact as unknown as {
      endpointA: string
      endpointB: string
      relationKind: string
      obviousness?: { by: string }
    }
    expect(r.endpointA).toBe("pkg/svc.ts::svc") //     direction preserved: A is the SUBJECT
    expect(r.endpointB).toBe("pkg/repo.ts::repo") //   B is the OBJECT
    expect(r.relationKind).toBe("depends-on")
    expect(r.obviousness?.by).toBe("harness-predicate") // scored, never self-scored (ADR-0012)
    expect(synthCalls()).toBe(0) //                    relation never touches the predicate check engine
  })

  it("a NEGATION seed → reaches admitNegation (REAL, WP-96-N) and ADMITS a negation CANDIDATE end-to-end", () => {
    const { deps, synthCalls } = admitAllDeps()
    const gate = makeAdmitGate(deps)
    const seed: SeedProposal = {
      kind: "negation",
      cand,
      claim: "no caller reaches svc",
      relationKind: "calls",
      target: "pkg/svc.ts::svc",
      scope: "pkg/",
    }

    const v = gate.emit(seed, cand)
    expect(v.emitted).toBe(true)
    if (!v.emitted) throw new Error("unreachable")
    expect(factKind(v.fact)).toBe("negation") //       a NegationNode candidate, not a mislabelled advisory
    const n = v.fact as unknown as {
      relationKind: string
      target: string
      scope: string
      id: string
      grounding: { entries: unknown[] }
    }
    expect(n.target).toBe("pkg/svc.ts::svc") //        the location-free target the negative is ABOUT
    expect(n.scope).toBe("pkg/") //                    the WITNESS scope, preserved as the identity leg
    expect(n.relationKind).toBe("calls")
    expect(n.id).toBe(String(negationKey("calls", "pkg/svc.ts::svc", "pkg/"))) // MINTED, never trusted
    expect(n.grounding.entries).toHaveLength(0) //     the DOOR constructs the §3 grounding at admit, not genesis
    expect(synthCalls()).toBe(0) //                    negation never touches the predicate check engine
  })

  it("a MALFORMED negation seed (off-vocabulary relationKind) → the honest genesis DROP, never a forced fact", () => {
    const { deps } = admitAllDeps()
    const gate = makeAdmitGate(deps)
    const seed: SeedProposal = {
      kind: "negation",
      cand,
      claim: "x",
      relationKind: "implements" as unknown as RelationKind,
      target: "pkg/svc.ts::svc",
      scope: "pkg/",
    }

    const v = gate.emit(seed, cand)
    expect(v.emitted).toBe(false)
    if (v.emitted) throw new Error("unreachable")
    expect(v.whyNot.reason).toContain("malformed negation") // DROP_NEGATION_MALFORMED — no address to mint
  })

  it("threads rawAnswer (#195b) onto the admitted fact for a shape that carries it", () => {
    const { deps } = admitAllDeps()
    const gate = makeAdmitGate(deps)
    const seed: SeedProposal = {
      kind: "predicate",
      cand,
      claim: "svc holds its invariant",
      slot: "invariant",
      rawAnswer: "  svc holds its invariant\n",
    }

    const v = gate.emit(seed, cand)
    expect(v.emitted).toBe(true)
    if (!v.emitted) throw new Error("unreachable")
    expect((v.fact as unknown as { rawAnswer?: string }).rawAnswer).toBe("  svc holds its invariant\n")
  })
})

// compile-time proof the widened union is present and disjoint on `kind`.
const _shapes: readonly SeedProposal["kind"][] = ["advisory", "predicate", "relation", "negation", undefined]
void _shapes
