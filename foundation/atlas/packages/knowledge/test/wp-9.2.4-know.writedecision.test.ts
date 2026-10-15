// @atlas/knowledge — test/wp-9.2.4-know.writedecision.test.ts  (WP-9.2.4.KNOWLEDGE)
//
// The un-parked composed write-decision FRONT DOOR `writeDecision(candidate, store)`: the
// owner-RATIFIED reversal of the s05 PARK. This drives the COMPOSED front door across a store
// projection to hit each route — DEDUP / CREATE / UPDATE / SUPERSEDE — proving it COMPOSES the sealed
// legs (contentHash via the kernel `id` seam · nodeKey · routeWrite — write-time dedup is D0 contentHash /
// D1 nodeKey only; a `claimNorm` collision is reported, not merged) rather than reimplementing routing.
// Every golden NAMES the mutant that flips it (no vacuous goldens).
//
// SEAM: identity is minted through the SEALED @atlas/kernel seam — the projection is seeded from the
// SAME `nodeKey(candidate)` / `id(candidate)` the front door computes, so hits/misses are real, not faked.

import { describe, it, expect } from "vitest"
import { writeDecision, nodeKey, emptyStore } from "../src/write/router.js"
import type { CurrentNode, StoreProjection } from "../src/write/router.js"
import type { Candidate, Check, PredicateSlot } from "@atlas/knowledge"
import type { StructRef } from "@atlas/contracts"
import { asSubtreeHash, id } from "@atlas/kernel"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────
function sym(qualifiedPath: string): StructRef {
  return { kind: "symbol", qualifiedPath, subtreeHash: asSubtreeHash(`sh:${qualifiedPath}`) }
}
interface CandOpts {
  readonly claimNorm?: string
  readonly slot?: PredicateSlot
  readonly check?: Check
  readonly path?: string
}
function cand(o: CandOpts = {}): Candidate {
  const base = {
    claimText: "the claim body prose",
    claimNorm: o.claimNorm ?? "cn-body",
    slot: o.slot ?? ("invariant" as PredicateSlot),
    grounding: { entries: [{ anchor: sym(o.path ?? "pkg/mod::fn"), path: "p" }] },
    provenance: { source: "agent://forge", trusted: true },
    tier: "T2" as const,
  }
  return o.check ? { ...base, check: o.check } : base
}

/** Seed one current node at `key` (a real computed nodeKey), family + claims as given, with an OPTIONAL
 *  `primaryAnchor` so the anchor-scoped `claimNorm`-collision report has a structural neighbor to reference
 *  (structural near-dup is the derived-on-read `subsumes` relation, not a write-time merge). */
function nodeAt(
  key: string,
  family: "advisory" | "predicate",
  claims: readonly string[],
  primaryAnchor?: string,
): CurrentNode {
  return {
    nodeKey: key,
    family,
    contentHash: `ch:${key}`,
    claims,
    ...(primaryAnchor !== undefined ? { primaryAnchor } : {}),
  }
}
function projection(nodes: readonly CurrentNode[], cas: readonly string[]): StoreProjection {
  return { current: new Map(nodes.map((n) => [n.nodeKey, n])), cas: new Set(cas) }
}

describe("WP-9.2.4.KNOWLEDGE — writeDecision composed front door (un-parked)", () => {
  it("is exported (the un-park flips the barrel surface to present)", () => {
    expect(typeof writeDecision).toBe("function")
  })

  it("DEDUP — a contentHash already in CAS short-circuits, regardless of the nodeKey leg", () => {
    const c = cand({ claimNorm: "cn-dd" })
    const key = nodeKey(c) as string
    // cas contains id(c); ALSO seed the nodeKey present (advisory) — DEDUP must win over UPDATE.
    const store = projection([nodeAt(key, "advisory", ["cn-prior"])], [id(c) as string])
    expect(writeDecision(c, store)).toBe("DEDUP")
    // teeth (MUTANT: drop the `if (contentHashHit) return 'DEDUP'` short-circuit) → would fall through
    // to routeWrite with a nodeKey hit + advisory ⇒ UPDATE, flipping this golden off DEDUP.
  })

  it("CREATE — a fresh subject (cas miss, nodeKey miss, no claim collision) mints a new node", () => {
    const c = cand({ claimNorm: "cn-fresh" })
    // an unrelated node with a DIFFERENT claim body — no collision, no shared nodeKey/contentHash.
    const store = projection([nodeAt("other-key", "advisory", ["cn-unrelated"])], ["ch-unrelated"])
    expect(writeDecision(c, store)).toBe("CREATE")
    // teeth (MUTANT: near-dup probe over-fires — e.g. drop the `route === 'CREATE'` no-collision
    // guard and always override) → this clean CREATE would flip to UPDATE.
  })

  it("CREATE (WP-DEDUP-1 un-merge) — a claimNorm collision at an ADJACENT-anchor node stays a CREATE", () => {
    const c = cand({ claimNorm: "cn-dup", path: "pkg/mod::fn" }) // nodeKey MISS; primaryAnchor = pkg/mod::fn
    // a node at the ANCESTOR unit `pkg/mod` (a structural prefix of `pkg/mod::fn`) already carries this exact
    // claimNorm. Under ADJACENCY-B this forced door-2 UPDATE; the always-merge is REMOVED (WP-DEDUP-1), so a
    // routed CREATE stays a CREATE — the adjacent fact keeps its own grounding (A2). Adjacency is now a
    // derived-on-read `subsumes` relation (WP-DEDUP-2), not a write-time merge.
    const store = projection([nodeAt("sibling-key", "advisory", ["cn-dup"], "pkg/mod")], [])
    expect(writeDecision(c, store)).toBe("CREATE")
    // teeth (MUTANT: re-introduce a door-2 near-dup override) → this would flip back to UPDATE.
  })

  it("UPDATE — an advisory whose nodeKey is present set-unions in place", () => {
    const c = cand({ claimNorm: "cn-adv" })
    const key = nodeKey(c) as string // its OWN nodeKey is seeded present (advisory)
    const store = projection([nodeAt(key, "advisory", ["cn-prior"])], []) // cas miss ⇒ no DEDUP
    expect(writeDecision(c, store)).toBe("UPDATE")
    // teeth (MUTANT: swap the family derivation to `'predicate'`) → checkSame becomes true ⇒ SUPERSEDE,
    // flipping UPDATE↔SUPERSEDE.
  })

  it("SUPERSEDE — a predicate whose nodeKey is present, same check re-evidenced, mints new + lineage", () => {
    const check: Check = { kind: "assertion", expr: "balance >= 0" }
    const c = cand({ claimNorm: "cn-prd", check })
    const key = nodeKey(c) as string // predicate nodeKey folds normalize(check) ⇒ hit ⟺ same check
    const store = projection([nodeAt(key, "predicate", ["cn-prior"])], []) // cas miss ⇒ no DEDUP
    expect(writeDecision(c, store)).toBe("SUPERSEDE")
    // teeth (MUTANT: swap the family derivation to `'advisory'`) → the nodeKey hit routes UPDATE,
    // flipping SUPERSEDE↔UPDATE.
  })

  it("a different predicate check is a DIFFERENT nodeKey ⇒ miss ⇒ CREATE (sibling never retired)", () => {
    const prior = cand({ claimNorm: "cn-prd", check: { kind: "assertion", expr: "x == 1" } })
    const priorKey = nodeKey(prior) as string
    const store = projection([nodeAt(priorKey, "predicate", ["cn-prior"])], [])
    // a DIFFERENT check on the same anchor/slot ⇒ a different nodeKey ⇒ not present ⇒ CREATE.
    const different = cand({ claimNorm: "cn-prd2", check: { kind: "assertion", expr: "x == 2" } })
    expect(nodeKey(different) as string).not.toBe(priorKey) // distinct identity by construction
    expect(writeDecision(different, store)).toBe("CREATE")
    // teeth (MUTANT: drop normalize(check) from the nodeKey preimage) → the two checks would collide
    // on one nodeKey ⇒ a hit ⇒ SUPERSEDE, retiring a still-valid sibling. (Guards the 5.13-b leg reuse.)
  })

  it("is PURE + deterministic — identical inputs repeat, the projection is untouched", () => {
    const c = cand({ claimNorm: "cn-adv" })
    const key = nodeKey(c) as string
    const store = projection([nodeAt(key, "advisory", ["cn-prior"])], [])
    const before = store.current.size
    expect(writeDecision(c, store)).toBe(writeDecision(c, store)) // deterministic
    expect(store.current.size).toBe(before) // no mutation of the input projection
  })

  it("every family × hit-state cell lands in a valid upsert route (never REJECT/throw)", () => {
    const valid = new Set(["DEDUP", "CREATE", "UPDATE", "SUPERSEDE"])
    for (const withCheck of [false, true])
      for (const seedNode of [false, true])
        for (const seedCas of [false, true]) {
          const check: Check | undefined = withCheck ? { kind: "assertion", expr: "p" } : undefined
          const c = cand({ claimNorm: "cn-x", ...(check ? { check } : {}) })
          const key = nodeKey(c) as string
          const store = emptyStore()
          const current = seedNode
            ? new Map([[key, nodeAt(key, withCheck ? "predicate" : "advisory", ["cn-p"])]])
            : store.current
          const cas = seedCas ? new Set([id(c) as string]) : store.cas
          expect(valid.has(writeDecision(c, { current, cas }))).toBe(true)
        }
  })
})
