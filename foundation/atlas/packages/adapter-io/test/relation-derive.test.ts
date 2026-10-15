// @atlas/adapter-io — test/relation-derive.test.ts  (#99 sound relation, ADR-0018 — WP-R3)
//
// The MECHANICAL projection `deriveRelations` — resolved cross-unit references → PROVEN `depends-on` relations,
// no LLM. The `admit` seam is the FROZEN R2 `admit` (@atlas/genesis) closing over `AdmitDeps` whose
// `verifyRelation` leg is the REAL `verifyRelation` oracle over the SAME fixture `ScipOutput`
// (`createVerifyFactLeg`) — NOT a re-implemented gate ("rules-from-honest-data-are-not-rules"), so a proven
// seal is decided by the real oracle on the real index. Owns: AR-2, AR-15, AR-16, AR-18, AR-19, AR-20, AR-21,
// AR-23, AR-28, AR-29, AR-30.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { IndexNode, ScipOutput } from "@atlas/index"
import { relationKey } from "@atlas/knowledge"
import { admit } from "@atlas/genesis"
import type { AdmitDeps, FactGrounding, RelationProposal } from "@atlas/genesis"
import { createVerifyFactLeg } from "../src/verify-fact-source.js"
import { deriveRelations, deriveRelationEdges, RelationBudgetExceededError } from "../src/relation-derive.js"

// ---- fixture index with a KNOWN resolved-edge set ------------------------------------------------------
//
// Global (non-`local`) SCIP symbols: S_B/S2_B defined in pkg/b, S_C defined in pkg/c. EXT is a node_modules
// symbol referenced from pkg/a but DEFINED NOWHERE in the index (external).
//   - pkg/a/mod.ts references S_B (x2) + S2_B + EXT           ⇒ edge a→b (only; EXT excluded, AR-15)
//   - pkg/b/mod.ts defines S_B + S2_B, references S_C          ⇒ edge b→c
//   - pkg/c/mod.ts defines S_C, references S_C (same document) ⇒ intra-unit, excluded (AR-16)
// KNOWN resolved distinct-edge set = { a→b, b→c }. b→a is NOT resolved (b references nothing defined in a).
const S_B = "scip fixture 1.0.0 `symB`()."
const S2_B = "scip fixture 1.0.0 `symB2`()."
const S_C = "scip fixture 1.0.0 `symC`()."
const EXT = "scip node_modules dep 2.1.0 `helper`()."

const A = "pkg/a/mod.ts"
const B = "pkg/b/mod.ts"
const C = "pkg/c/mod.ts"

const scip: ScipOutput = {
  documents: [
    {
      relativePath: A,
      occurrences: [
        { symbol: S_B, role: "reference" },
        { symbol: S_B, role: "reference" },
        { symbol: S2_B, role: "reference" },
        { symbol: EXT, role: "reference" },
      ],
    },
    {
      relativePath: B,
      occurrences: [
        { symbol: S_B, role: "definition" },
        { symbol: S2_B, role: "definition" },
        { symbol: S_C, role: "reference" },
      ],
    },
    {
      relativePath: C,
      occurrences: [
        { symbol: S_C, role: "definition" },
        { symbol: S_C, role: "reference" },
      ],
    },
  ],
}

// ---- the injected R2 admit path + grounding seam -------------------------------------------------------

// `verifyRelation` threaded from the REAL oracle over the SAME fixture — the sound arm's generator = verifier.
const leg = createVerifyFactLeg(scip, { indexerName: "scip-typescript" })

// A minimal well-formed IndexNode for `doors.grounded`'s ignored 2nd arg (the door stub returns true — R3 does
// not re-test the truth door; that is R2/R4). Mirrors the R2 relation-leg test's `indexState`.
const indexState: IndexNode = {
  axis: "spatial",
  level: "file",
  key: A,
  subtreeHash: asSubtreeHash("idx-root"),
  children: [],
  objects: [],
}

const admitDeps: AdmitDeps = {
  doors: { grounded: () => true, nonObvious: () => false },
  predicate: { synthesize: () => null, verify: () => "NA", teeth: () => false },
  typeOracle: { expressible: () => false, diagnose: () => "NA" },
  verifyRelation: (relationKind, target, sourceScope, endpointA, endpointB) =>
    leg({ kind: "relation", claim: { relationKind, target, sourceScope, endpointA, endpointB } }).verdict === "proven"
      ? "proven"
      : "abstain",
  refine: () => null,
  indexState,
  K: 0,
}

/** The R2 admit path — the caller's ONE responsibility (door + oracle wired), byte-identical to production. */
const admitSeam = (p: RelationProposal) => admit(p, admitDeps)

/** A real 2-entry relation grounding receipt: entry[0] anchors A, entry[1] anchors B. Stands in for the
 *  `ground`/`reground`-over-Axes builder R7 wires — deriveRelations reads only `entries[0].anchor` for the site. */
const groundFor = (endpointA: string, endpointB: string): FactGrounding => {
  const anchorA: StructRef = { kind: "file", qualifiedPath: endpointA, subtreeHash: asSubtreeHash(`st-${endpointA}`) }
  const anchorB: StructRef = { kind: "file", qualifiedPath: endpointB, subtreeHash: asSubtreeHash(`st-${endpointB}`) }
  return {
    entries: [
      { anchor: anchorA, path: endpointA },
      { anchor: anchorB, path: endpointB },
    ],
  } as FactGrounding
}

const derive = (maxRelations = 100) =>
  deriveRelations({ scipOutput: scip, indexerName: "scip-typescript", admit: admitSeam, groundFor, maxRelations })

const keyOf = (n: { readonly id: unknown }) => String(n.id)
const KEY_AB = String(relationKey(A, "depends-on", B))
const KEY_BC = String(relationKey(B, "depends-on", C))
const KEY_BA = String(relationKey(B, "depends-on", A))

// ---- AR-18: anti-vacuous — a SPECIFIC expected pair proven present -------------------------------------

describe("AR-18 — exhaustive lower bound (anti-vacuous)", () => {
  it("proves the specific pair pkg/a/mod.ts --depends-on--> pkg/b/mod.ts (fails if projection proves nothing)", () => {
    const { proven } = derive()
    const ab = proven.find((r) => r.endpointA === A && r.endpointB === B)
    expect(ab).toBeDefined()
    expect(ab?.seal).toBe("proven")
    expect(ab?.relationKind).toBe("depends-on")
    // teeth: proving nothing (0 == 0) cannot pass — a non-empty proven set with THIS pair is required.
    expect(proven.length).toBeGreaterThan(0)
  })
})

// ---- AR-2: exhaustive upper — every resolved edge ≤ one proven relation, none dropped, no dup -----------

describe("AR-2 — exhaustive upper bound + no dup within a run", () => {
  it("the two known resolved edges {a→b, b→c} each become exactly one proven relation", () => {
    const { proven, resolvedEdgeCount } = derive()
    const keys = proven.map(keyOf).sort()
    expect(resolvedEdgeCount).toBe(2)
    expect(keys).toEqual([KEY_AB, KEY_BC].sort())
    expect(new Set(keys).size).toBe(keys.length) // no duplicate row within the run
  })
})

// ---- AR-19: multi-ref dedup (D-b) ----------------------------------------------------------------------

describe("AR-19 — N references A→B collapse to one relation", () => {
  it("a→b appears exactly once despite three references (symB x2 + symB2)", () => {
    const { proven } = derive()
    const ab = proven.filter((r) => r.endpointA === A && r.endpointB === B)
    expect(ab).toHaveLength(1)
  })
})

// ---- AR-15: external target excluded (D-c) -------------------------------------------------------------

describe("AR-15 — a resolved edge to a non-repo (node_modules) symbol yields no proven relation", () => {
  it("the external EXT reference from pkg/a produces no outbound edge — a has exactly one (a→b)", () => {
    const { proven, resolvedEdgeCount } = derive()
    const fromA = proven.filter((r) => r.endpointA === A)
    expect(fromA).toHaveLength(1)
    expect(fromA[0]?.endpointB).toBe(B)
    // EXT never resolves to a repo endpoint, so no relation names it and the count excludes it.
    expect(resolvedEdgeCount).toBe(2)
    expect(proven.every((r) => r.endpointB !== EXT)).toBe(true)
  })
})

// ---- AR-16: cross-unit only (D-c/D-e) — same document excluded -----------------------------------------

describe("AR-16 — two symbols resolving to the same document yield no proven depends-on", () => {
  it("pkg/c references its own symC (same doc) ⇒ no c→c relation", () => {
    const { proven } = derive()
    // No self-relation in the set (relationKey itself refuses one — this pins the projection never mints it).
    expect(proven.some((r) => r.endpointA === r.endpointB)).toBe(false)
    expect(proven.some((r) => r.endpointA === C && r.endpointB === C)).toBe(false)
  })
})

// ---- AR-29: asymmetric-emit soundness ------------------------------------------------------------------

describe("AR-29 — only A→B resolved ⇒ A→B proven and NO proven B→A in the set", () => {
  it("a→b is present and b→a (a fabricated reverse) is absent from the proven SET", () => {
    const { proven } = derive()
    const keys = new Set(proven.map(keyOf))
    expect(keys.has(KEY_AB)).toBe(true)
    expect(keys.has(KEY_BA)).toBe(false)
  })
})

// ---- AR-21: advisory→proven supersede (D-a) — identity, no downgrade -----------------------------------

describe("AR-21 — a proven derive supersedes an advisory A→B by identity (no dup, no downgrade)", () => {
  it("the derived proven a→b carries the SAME relationKey identity an advisory a→b would, sealed proven", () => {
    const { proven } = derive()
    const ab = proven.find((r) => r.endpointA === A && r.endpointB === B)
    // Same identity ⇒ the store upsert supersedes the advisory row rather than adding a second (identity is the
    // dedup key; the end-to-end durable supersede is R4/R7). No downgrade: the surviving row is sealed `proven`.
    expect(keyOf(ab!)).toBe(KEY_AB)
    expect(ab?.seal).toBe("proven")
  })
})

// ---- AR-20: idempotent re-derive -----------------------------------------------------------------------

describe("AR-20 — deriving twice over an unchanged index yields the same set (no doubled rows)", () => {
  it("two runs produce identical relationKey sets and identical lengths", () => {
    const first = derive().proven.map(keyOf).sort()
    const second = derive().proven.map(keyOf).sort()
    expect(second).toEqual(first)
    expect(second).toHaveLength(2)
    // the pure edge core is likewise byte-stable
    expect(deriveRelationEdges(scip, "scip-typescript")).toEqual(deriveRelationEdges(scip, "scip-typescript"))
  })
})

// ---- AR-23: NO-LLM -------------------------------------------------------------------------------------

describe("AR-23 — the derive path produces proven relations with no model anywhere", () => {
  it("deriveRelations takes no model adapter and still proves — model-independent by construction", () => {
    // There is no model seam to stub-to-throw: the whole input is deterministic index data + the oracle program.
    const { proven } = derive()
    expect(proven.length).toBe(2)
    expect(proven.every((r) => r.seal === "proven" && r.witness !== undefined)).toBe(true)
  })
})

// ---- AR-28: budget within (recorded, not silently unbounded) -------------------------------------------

describe("AR-28 — exhaustive projection records its row count within a stated budget", () => {
  it("resolvedEdgeCount is recorded and within the ceiling; the run is not flagged incomplete", () => {
    const res = derive(10)
    expect(res.resolvedEdgeCount).toBe(2)
    expect(res.resolvedEdgeCount).toBeLessThanOrEqual(10)
    expect(res.incomplete).toBe(false)
  })
})

// ---- AR-30: budget fail-loud ---------------------------------------------------------------------------

describe("AR-30 — over-budget projection errors, never a partial set labelled complete", () => {
  it("a ceiling below the resolved-edge count throws RelationBudgetExceededError (no partial result leaks)", () => {
    let leaked: unknown
    expect(() => {
      leaked = derive(1) // 2 edges > ceiling 1
    }).toThrow(RelationBudgetExceededError)
    expect(leaked).toBeUndefined()
    try {
      derive(1)
    } catch (e) {
      expect(e).toBeInstanceOf(RelationBudgetExceededError)
      expect((e as RelationBudgetExceededError).resolvedEdgeCount).toBe(2)
      expect((e as RelationBudgetExceededError).maxRelations).toBe(1)
    }
  })
})
