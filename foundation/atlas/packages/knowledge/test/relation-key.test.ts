// @atlas/knowledge — test/relation-key.test.ts  (SEAT ANCHOR — ADR-0015 D2 / #99a relation identity)
//
// THE CRUX this file pins: a relation spans two units in DIFFERENT files, which is exactly the shape the
// intrinsic identity path REFUSES (`nodeKey → deepestCommonUnit → DegenerateAnchorError`, the #103 wildcard
// fix). `relationKey` gives that shape a collision-free address by naming BOTH endpoints instead of their
// (empty) common ancestor. The first test is the whole point of #99a: the same two anchors that THROW through
// `nodeKey` MINT a stable key through `relationKey`. The rest pins direction, kind, and the fail-closed refusals.

import { describe, expect, it } from "vitest"
import {
  MALFORMED_RELATION_REASON,
  MalformedRelationError,
  RELATION_KINDS,
  isKnownRelationKind,
  nodeKey,
  relationKey,
  routeWrite,
  DegenerateAnchorError,
} from "../src/write/router.js"
import type { Candidate, RelationKind } from "../src/types.js"

const A = "src/billing.ts::7:fn:charge"
const B = "src/ledger.ts::7:fn:post"

/** A `Candidate` view grounding a claim at TWO symbols in two files — the shape the intrinsic door refuses. */
function crossFileCand(): Candidate {
  const sym = (p: string): unknown => ({ anchor: { kind: "symbol", qualifiedPath: p, subtreeHash: "st" }, path: p })
  return {
    claimText: "c",
    claimNorm: "c",
    slot: "dependency",
    tier: "T2",
    provenance: { source: "test", trusted: true },
    grounding: { entries: [sym(A), sym(B)] },
  } as unknown as Candidate
}

describe("relation identity — the cross-file pair the intrinsic door refuses now MINTS (SEAT ANCHOR)", () => {
  it("THE CRUX: nodeKey THROWS on the cross-file pair, relationKey mints a stable key for it", () => {
    expect(() => nodeKey(crossFileCand())).toThrow(DegenerateAnchorError) // the #103 refusal, unchanged
    const k = relationKey(A, "depends-on", B)
    expect(typeof k).toBe("string")
    expect((k as string).length).toBeGreaterThan(0)
    // Determinism: same triple ⇒ same key (pure, no clock/seq).
    expect(relationKey(A, "depends-on", B)).toBe(k)
  })

  it("FORMULA PIN: the digest is locked, so a canonicalForm/preimage change is caught (not silently migrated)", () => {
    // Captured from this build. A relation store is new (no pre-existing data to migrate), but pinning one
    // literal locks the preimage `{a, k, b}` + kernel encoder against a silent formula drift — the same
    // discipline degenerate-anchor.test.ts applies to nodeKey.
    expect(relationKey(A, "depends-on", B)).toBe("a1bd7057b18649144d9a5fcf4e2ad097f979114c5c6644e62294cfd234f7bb6b")
  })

  it("DIRECTED: (A,k,B) ≠ (B,k,A) — direction is meaningful, endpoints are never sorted", () => {
    expect(relationKey(A, "depends-on", B)).not.toBe(relationKey(B, "depends-on", A))
  })

  it("KIND discriminates: (A,depends-on,B) ≠ (A,calls,B)", () => {
    expect(relationKey(A, "depends-on", B)).not.toBe(relationKey(A, "calls", B))
  })

  it("COLLISION-FREE: distinct endpoint pairs mint distinct keys (no wildcard collapse)", () => {
    const victim = relationKey("src/a.ts::f", "depends-on", "src/b.ts::g")
    const attacker = relationKey("vendor/evil.ts::pwn", "depends-on", "docs/x.ts::y")
    expect(victim).not.toBe(attacker) // pre-#99a both cross-file facts collided onto ONE nodeKey address
  })

  describe("fail-closed refusals — MalformedRelationError, never a raw TypeError", () => {
    it("self-relation (a === b) is refused", () => {
      expect(() => relationKey(A, "depends-on", A)).toThrow(MalformedRelationError)
    })
    it("empty / non-string endpoint is refused, TOTAL over unknown", () => {
      for (const bad of ["", 42, null, undefined, {}, [], Symbol("x")] as unknown[]) {
        expect(() => relationKey(bad, "depends-on", B)).toThrow(MalformedRelationError)
        expect(() => relationKey(A, "depends-on", bad)).toThrow(MalformedRelationError)
      }
    })
    it("off-vocabulary kind is refused", () => {
      for (const bad of ["implements", "DEPENDS-ON", "", 1, null, {}] as unknown[]) {
        expect(() => relationKey(A, bad, B)).toThrow(MalformedRelationError)
      }
    })
    it("the reason names the mechanism and tells the author what to do", () => {
      expect(MALFORMED_RELATION_REASON).toMatch(/^malformed relation: /)
      expect(MALFORMED_RELATION_REASON).toMatch(/DISTINCT/)
      expect(MALFORMED_RELATION_REASON).toMatch(/Re-state the relation naming both units/)
    })
  })

  describe("the closed relation vocabulary", () => {
    it("RELATION_KINDS is the two seeded kinds", () => {
      expect([...RELATION_KINDS].sort()).toEqual(["calls", "depends-on"])
    })
    it("isKnownRelationKind is total over unknown, fail-closed", () => {
      for (const k of RELATION_KINDS) expect(isKnownRelationKind(k)).toBe(true)
      for (const bad of ["x", "", 1, null, undefined, {}, [], Symbol("s")] as unknown[]) {
        expect(isKnownRelationKind(bad)).toBe(false)
      }
    })
  })
})

describe("routeWrite — the relation family cell (ADR-0015 D2)", () => {
  const kinds: readonly RelationKind[] = RELATION_KINDS // vocabulary is exercised elsewhere; here we route
  void kinds
  it("a relation nodeKey MISS ⇒ CREATE", () => {
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: false, family: "relation", checkSame: false })).toBe(
      "CREATE",
    )
  })
  it("a relation nodeKey HIT ⇒ UPDATE (claim set-union), never SUPERSEDE — a relation has no check", () => {
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: true, family: "relation", checkSame: false })).toBe("UPDATE")
  })
  it("byte-identical relation ⇒ DEDUP (idempotent), regardless of nodeKey", () => {
    expect(routeWrite({ contentHashHit: true, nodeKeyHit: true, family: "relation", checkSame: false })).toBe("DEDUP")
  })
  it("the advisory/predicate cells are UNCHANGED by the relation widening", () => {
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: true, family: "advisory", checkSame: false })).toBe("UPDATE")
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: true, family: "predicate", checkSame: true })).toBe(
      "SUPERSEDE",
    )
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: true, family: "predicate", checkSame: false })).toBe(
      "CREATE",
    )
  })
})
