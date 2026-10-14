// @atlas/genesis — test/admit-harness.relation-leg.test.ts  (#99 sound relation, ADR-0018 — WP-96-R2)
//
// The relation SOUND-ADMIT leg of `admitRelation`. The `deps.verifyRelation` leg is threaded from the REAL
// `verifyRelation` oracle over an in-memory `SymbolReverseApi` fake (NOT a re-implemented gate — the memory
// "rules-from-honest-data-are-not-rules"), so AR-1 (proven→sealed) and AR-5 (calls→advisory) are decided by the
// SAME oracle on the SAME feed with only the kind differing. Owns: AR-1 (proven seal + witness), AR-3
// (unresolvable target → advisory, no seal), AR-4 (directed identity + self-edge refused), AR-5 (calls never
// proven), AR-6 (witness round-trips; claimNorm derives from the witness, not endpoint/model prose).

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { Hash, StructRef } from "@atlas/contracts"
import type { IndexNode, SymbolReverseApi } from "@atlas/index"
import type { RelationKind, RelationWitness } from "@atlas/knowledge"
import { relationKey, MalformedRelationError } from "@atlas/knowledge"
import type { Candidate } from "@atlas/genesis"
import { verifyRelation } from "../src/verify-fact.js"
import { relationClaimNormFromWitness } from "../src/admit-relation.js"
import { admit } from "../src/admit-harness.js"
import type { AdmitDeps, RelationProposal, TypeOracle } from "../src/admit-harness.js"

// ---- fixtures ------------------------------------------------------------------------------------------

const TARGET = "scip:B#" // the global SCIP symbol under endpointB
const SOURCE = "src/a" // endpointA's verify-scope

const anchorA: StructRef = { kind: "block", qualifiedPath: "src/a.ts#A", subtreeHash: asSubtreeHash("st-a") }
const anchorB: StructRef = { kind: "block", qualifiedPath: "src/b.ts#B", subtreeHash: asSubtreeHash("st-b") }

function site(): Candidate {
  return {
    site: anchorA,
    signals: { hotspot: 3, szzBugCommits: 2, coChanged: [], owners: [], messages: [] },
    ppr: 0.42,
    rank: 1,
  }
}

const grounding = {
  entries: [
    { anchor: anchorA, path: "src/a.ts" },
    { anchor: anchorB, path: "src/b.ts" },
  ],
} as RelationProposal["grounding"]

const indexState: IndexNode = {
  axis: "spatial",
  level: "block",
  key: "src/a.ts#A",
  subtreeHash: asSubtreeHash("idx-a"),
  children: [],
  objects: [],
}

/** A well-formed depends-on relation proposal carrying the resolved oracle legs (proven-ready). */
const relProposal = (over: Partial<RelationProposal> = {}): RelationProposal => ({
  kind: "relation",
  site: site(),
  relationKind: "depends-on",
  // endpointA is the caller the feed witnesses referencing TARGET; endpointB is the file the feed DEFINES TARGET
  // in (`definesAt` → 'src/b.ts'). The oracle binds BOTH endpoint FILES to the witnessed edge.
  endpointA: "src/a/uses-b.ts",
  endpointB: "src/b.ts",
  target: TARGET,
  sourceScope: SOURCE,
  grounding,
  tier: "T1",
  ...over,
})

// ---- the REAL oracle threaded as the leg (no re-implemented gate) --------------------------------------

const pathOfHash = (h: Hash): string | undefined => String(h)
const isLocal = (sym: string): boolean => sym.startsWith("local ")

/** A feed where TARGET resolves and is referenced from `src/a` — so depends-on PROVES, calls abstains. */
function feed(opts: { callers?: readonly string[]; resolvesTarget?: boolean } = {}): SymbolReverseApi {
  const { callers = ["src/a/uses-b.ts"], resolvesTarget = true } = opts
  return {
    reverseCallers: (sym: string) => (sym === TARGET ? (callers as unknown as readonly Hash[]) : []),
    holeSources: () => [],
    opaqueRefSources: () => [],
    resolves: (sym: string) => sym === TARGET && resolvesTarget,
    definesAt: (sym: string) => (sym === TARGET && resolvesTarget ? ("src/b.ts" as unknown as Hash) : undefined),
  }
}

const typeOracle: TypeOracle = { expressible: () => false, diagnose: () => "NA" }

function makeDeps(over: Partial<AdmitDeps> = {}, reverse: SymbolReverseApi = feed()): AdmitDeps {
  return {
    predicate: { synthesize: () => null, verify: () => "NA", teeth: () => false },
    doors: { grounded: () => true, nonObvious: () => true },
    typeOracle,
    // the REAL oracle, adapted to the leg signature — the sound gate decides, not the test. Carries the
    // endpoints so the oracle binds BOTH endpoint FILES to the witnessed edge (endpointA referrer, endpointB definer).
    verifyRelation: (kind: RelationKind, target: string, sourceScope: string, endpointA: string, endpointB: string) =>
      verifyRelation({ relationKind: kind, target, sourceScope, endpointA, endpointB }, reverse, pathOfHash, isLocal)
        .verdict,
    refine: () => null,
    indexState,
    K: 1,
    ...over,
  }
}

describe("admitRelation — the sound relation admit leg (#99, ADR-0018)", () => {
  it('AR-1 proven depends-on ⇒ admitted RELATION sealed "proven" with a re-runnable witness', () => {
    const a = admit(relProposal(), makeDeps())
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(a.fact.kind).toBe("relation")
    expect((a.fact as { seal?: string }).seal).toBe("proven")
    expect((a.fact as { witness?: unknown }).witness).toEqual({
      relationKind: "depends-on",
      target: TARGET,
      sourceScope: SOURCE,
    })
  })

  it("AR-6 witness round-trips; claimNorm/obviousness derives from the WITNESS, not endpoint/model prose", () => {
    const a = admit(relProposal(), makeDeps())
    if (a.outcome !== "admitted") throw new Error("unreachable")
    const witness = (a.fact as { witness?: RelationWitness }).witness
    expect(witness).toEqual({ relationKind: "depends-on", target: TARGET, sourceScope: SOURCE })
    // the derived sentence is a PURE function of the witness legs (sourceScope + kind + target), NOT the
    // endpoint unitKeys (`src/a/uses-b.ts` / `src/b.ts`) — so a re-verifier holding only the witness re-derives it.
    const derived = relationClaimNormFromWitness(witness!)
    expect(derived).toContain(SOURCE)
    expect(derived).toContain(TARGET)
    expect(derived).not.toContain("src/a/uses-b.ts")
    expect(derived).toBe(
      relationClaimNormFromWitness({ relationKind: "depends-on", target: TARGET, sourceScope: SOURCE }),
    )
  })

  it("AR-5 a `calls` relation NEVER obtains a proven seal — falls through to advisory (grounded, unsealed)", () => {
    // Same feed that proves depends-on — only the kind changes. The oracle abstains on `calls`, so the admit
    // falls through to the advisory build: admitted, but with NO proven seal.
    const a = admit(relProposal({ relationKind: "calls" }), makeDeps())
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(a.fact.kind).toBe("relation")
    expect((a.fact as { seal?: string }).seal).toBeUndefined()
    expect((a.fact as { witness?: unknown }).witness).toBeUndefined()
  })

  it("AR-3 an unresolvable (phantom) target ⇒ oracle abstains ⇒ advisory relation, no proven seal", () => {
    const a = admit(relProposal(), makeDeps({}, feed({ resolvesTarget: false })))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect((a.fact as { seal?: string }).seal).toBeUndefined()
  })

  it("AR-3 a relation with NO oracle legs (advisory relation) ⇒ advisory build, no proven seal", () => {
    const { target: _t, sourceScope: _s, ...noLegs } = relProposal() // omit the optional oracle legs entirely
    const a = admit(noLegs, makeDeps())
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect((a.fact as { seal?: string }).seal).toBeUndefined()
    expect((a.fact as { witness?: unknown }).witness).toBeUndefined()
  })

  it("unwired: no verifyRelation leg supplied ⇒ advisory relation (abstain is NOT a drop, never a proven seal)", () => {
    const deps = makeDeps()
    const { verifyRelation: _leg, ...withoutLeg } = deps // drop the leg
    const a = admit(relProposal(), withoutLeg as AdmitDeps)
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect((a.fact as { seal?: string }).seal).toBeUndefined()
  })

  it("AR-4 directed identity: A→B ≠ B→A, and a self-edge A→A is refused (MalformedRelationError / dropped)", () => {
    // directed identity — the relationKey preimage is the ORDERED pair.
    const ab = relationKey("src/a.ts#A", "depends-on", "src/b.ts#B")
    const ba = relationKey("src/b.ts#B", "depends-on", "src/a.ts#A")
    expect(ab).not.toBe(ba)
    // self-edge at the identity leg THROWS (MalformedRelationError)…
    expect(() => relationKey("src/a.ts#A", "depends-on", "src/a.ts#A")).toThrow(MalformedRelationError)
    // …and admitRelation stays TOTAL: a self-edge proposal drops malformed, never throws.
    const a = admit(relProposal({ endpointA: "src/a.ts#A", endpointB: "src/a.ts#A" }), makeDeps())
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("malformed relation")
  })
})
