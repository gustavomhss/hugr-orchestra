// @atlas/knowledge — test/wp-196a-seal.test.ts  (WP-196a.SEAL — the additive two-seal provenance field)
//
// ADR-0017's two-seal vocabulary (`proven` | `validated`) is ADDITIVE + absent-tolerant on the node,
// mirroring `obviousness` (ADR-0012) byte-for-byte: this WP only makes the field EXIST — it never sets
// it (that is a sibling admit-path WP). Three legs pinned here:
//   SCN-196a-1 — `seal` is a legal, absent-tolerant field on every obviousness-carrying node shape
//                (AdvisoryNode / PredicateNode / RelationNode / NegationNode); a pre-existing seal-less
//                literal still type-checks and reads `undefined`.
//   SCN-196a-2 — nodeKey (KNOW-15b/15c, the write-routing identity) does NOT read `seal`: two candidates
//                identical except for a `seal` value collide on the SAME nodeKey. `seal` is provenance
//                metadata, never an identity leg — unlike `predicateSlot`, which already IS in nodeKey.
//
// [RED before this WP] Before the `Seal`/`seal?` widening, a `seal:'proven'` object literal typed as
// `AdvisoryNode`/`PredicateNode`/`RelationNode`/`NegationNode` fails TS2353 (excess property) — the type
// error IS the RED signal this test's SCN-196a-1 flips to GREEN once `seal?: Seal` exists on each shape.

import { describe, it, expect } from "vitest"
import { nodeKey } from "../src/write/router.js"
import type { AdvisoryNode, PredicateNode, RelationNode, NegationNode, Candidate, Check } from "@atlas/knowledge"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"

const groundingOf = (qualifiedPath: string) => ({
  entries: [
    {
      anchor: { kind: "symbol" as const, qualifiedPath, subtreeHash: asSubtreeHash(`sh:${qualifiedPath}`) },
      path: "p",
    },
  ],
})

describe("WP-196a.SEAL — `seal` is additive + absent-tolerant on every obviousness-carrying shape", () => {
  it("SCN-196a-1a: AdvisoryNode accepts an absent seal (legacy shape, unchanged) and a present one", () => {
    const legacy: AdvisoryNode = {
      kind: "advisory",
      id: asNodeKey("nk-legacy"),
      tier: "T2",
      claimNorm: "a legacy claim, minted before this WP",
      grounding: groundingOf("pkg::mod::fn"),
      freshness: "FRESH",
      claims: [],
      authoring: "ADVISORY",
    }
    expect(legacy.seal).toBeUndefined() // absent-tolerant: no crash, no fabricated default

    const sealed: AdvisoryNode = { ...legacy, seal: "proven" }
    expect(sealed.seal).toBe("proven")
  })

  it("SCN-196a-1b: PredicateNode accepts `seal` the same way", () => {
    const check: Check = { kind: "assertion", expr: "x > 0" }
    const node: PredicateNode = {
      kind: "predicate",
      id: asNodeKey("nk-pred"),
      tier: "T2",
      check,
      grounding: groundingOf("pkg::mod::guard"),
      status: "HOLDS",
      freshness: "FRESH",
      claims: [],
      authoring: "PREDICATED",
      seal: "proven",
    }
    expect(node.seal).toBe("proven")
  })

  it("SCN-196a-1c: RelationNode accepts `seal` the same way", () => {
    const node: RelationNode = {
      kind: "relation",
      id: asNodeKey("nk-rel"),
      tier: "T2",
      relationKind: "calls",
      endpointA: "pkg::a",
      endpointB: "pkg::b",
      grounding: {
        entries: [
          { anchor: { kind: "symbol", qualifiedPath: "pkg::a", subtreeHash: asSubtreeHash("sh:a") }, path: "a" },
          { anchor: { kind: "symbol", qualifiedPath: "pkg::b", subtreeHash: asSubtreeHash("sh:b") }, path: "b" },
        ],
      },
      freshness: "FRESH",
      claims: [],
      authoring: "RELATED",
      seal: "proven",
    }
    expect(node.seal).toBe("proven")
  })

  it("SCN-196a-1d: NegationNode accepts `seal` the same way", () => {
    const node: NegationNode = {
      kind: "negation",
      id: asNodeKey("nk-neg"),
      tier: "T2",
      relationKind: "calls",
      target: "pkg::x",
      scope: "src/payments",
      grounding: groundingOf("src/payments"),
      edgeModel: "v1",
      freshness: "FRESH",
      claims: [],
      authoring: "NEGATED",
      seal: "proven",
    }
    expect(node.seal).toBe("proven")
  })
})

describe("WP-196a.SEAL — nodeKey (KNOW-15b/15c write-routing identity) does NOT read `seal`", () => {
  // `Candidate` itself carries no `seal` field (it is not part of the frozen candidate record); mirror
  // exactly how `governed-emit.ts` builds its `candidateView` — a structurally-wider object narrowed
  // through `as unknown as Candidate` — so this asserts what `nodeKey` is actually handed in production,
  // not merely what the `Candidate` type declares.
  function candWithSeal(seal: "proven" | undefined): Candidate {
    const base = {
      claimText: "the claim body prose",
      claimNorm: "cn-fixed",
      slot: "contract" as const,
      grounding: groundingOf("pkg::mod::fn"),
      provenance: { source: "agent://forge", trusted: true },
      tier: "T2" as const,
    }
    return { ...base, ...(seal !== undefined ? { seal } : {}) } as unknown as Candidate
  }

  it("SCN-196a-2: advisory nodeKey is IDENTICAL whether `seal` is absent or `proven`", () => {
    const noSeal = candWithSeal(undefined)
    const proven = candWithSeal("proven")
    expect(nodeKey(proven)).toBe(nodeKey(noSeal))
  })
})
