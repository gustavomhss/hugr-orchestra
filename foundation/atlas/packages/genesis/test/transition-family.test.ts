// @atlas/genesis — test/transition-family.test.ts  (#234 · ADR-0015 D4 — the transition family acceptance suite)
//
// AT-1..AT-7 of the #234 acceptance set (AT-8 reachability + AT-9 blackbox e2e live in adapter-io / e2e-blackbox,
// where the shipped producer + the real 2-rev git fixture are). Written RED-first against the design:
//   AT-1 proposed transition → admitted TransitionNode sealed `justified` + derivation.
//   AT-2 identity distinct + directed + grounding = exactly the 2 rev-pair entries.
//   AT-3 supersession on same lineage (incumbent → SUPERSEDED, no dup).
//   AT-4 never `proven`.
//   AT-5 no HEAD re-check (mutating current index does not change a stored transition).
//   AT-6 malformed refused (missing legs / shaBefore === shaAfter).
//   AT-7 rename NOT reconciled (different unitKey before/after ⇒ not silently linked).

import { describe, it, expect } from "vitest"
import { asSubtreeHash, id } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { CasObject } from "@atlas/kernel"
import type { IndexNode } from "@atlas/index"
import { admit } from "../src/admit-harness.js"
import type { AdmitDeps } from "../src/admit-harness.js"
import type { TransitionProposal } from "../src/admit-proposals.js"
import { transitionKey, transitionsOf, upsert, emptyStore } from "@atlas/knowledge"
import type { StoreProjection, TransitionNode, WriteRequest } from "@atlas/knowledge"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────────

const UNIT = "src/pay.ts::charge"

/** A grounding entry anchoring `unit` at a rev whose content hash is `sha`. */
function entry(unit: string, sha: string): { anchor: StructRef; path: string } {
  return { anchor: { kind: "block", qualifiedPath: unit, subtreeHash: asSubtreeHash(sha) }, path: unit.split("::")[0]! }
}

/** A well-formed transition proposal on `unit` spanning `shaBefore` → `shaAfter`. */
function proposal(unit: string, shaBefore: string, shaAfter: string): TransitionProposal {
  return {
    kind: "transition",
    unitKey: unit,
    refBefore: entry(unit, shaBefore),
    refAfter: entry(unit, shaAfter),
    tier: "T2",
    derivation: `unit ${unit} returned A at ${shaBefore}, returns B at ${shaAfter}`,
  }
}

const indexState: IndexNode = {
  axis: "spatial",
  level: "block",
  key: UNIT,
  subtreeHash: asSubtreeHash("idx"),
  children: [],
  objects: [],
}

/** A minimal AdmitDeps — the transition arm reads NONE of it (D-T1: no oracle, no door), but `admit` is total
 *  over the whole union, so the shape must be present. Every leg is a benign stub. */
const deps: AdmitDeps = {
  predicate: { synthesize: () => null, verify: () => "NA", teeth: () => false },
  doors: { grounded: () => true, nonObvious: () => true },
  typeOracle: { expressible: () => false, diagnose: () => "NA" },
  refine: () => null,
  indexState,
  K: 1,
}

/** Persist an admitted transition into a projection exactly as the shipped producer does (nodeKey=fact.id,
 *  contentHash=id(fact), the transition carriers on the row) — so `transitionsOf` reads it back. */
function persist(store: StoreProjection, fact: TransitionNode): StoreProjection {
  const req: WriteRequest = {
    nodeKey: String(fact.id),
    contentHash: String(id(fact as unknown as CasObject)),
    family: "transition",
    claimNorm: fact.derivation ?? "transition",
    primaryAnchor: fact.unitKey,
    unitKey: fact.unitKey,
    shaBefore: fact.shaBefore,
    shaAfter: fact.shaAfter,
    tier: fact.tier,
    ...(fact.seal !== undefined ? { seal: fact.seal } : {}),
  }
  return upsert(store, req).store
}

function admittedFact(p: TransitionProposal): TransitionNode {
  const a = admit(p, deps)
  if (a.outcome !== "admitted") throw new Error(`expected admitted, got ${a.outcome}`)
  if (a.fact.kind !== "transition") throw new Error(`expected a transition, got ${a.fact.kind}`)
  return a.fact
}

// ── AT-1 ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("AT-1 — a proposed transition is admitted as a justified TransitionNode", () => {
  it("admits kind:transition, seal:justified, carrying its derivation — via the harness dispatch", () => {
    const a = admit(proposal(UNIT, "sha-A", "sha-B"), deps)
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(a.fact.kind).toBe("transition")
    const t = a.fact as TransitionNode
    expect(t.seal).toBe("justified")
    expect(t.derivation).toBeTruthy()
    expect(t.authoring).toBe("TRANSITIONED")
    // no LIKELY_INVARIANT label (that is the sound/proven arm) — a justified fact carries none.
    expect(a.label).toBeUndefined()
  })
})

// ── AT-2 ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("AT-2 — identity is distinct + directed, grounding is exactly the 2 rev-pair entries", () => {
  it("id === transitionKey(unit, shaBefore, shaAfter) and grounding carries the two rev entries in order", () => {
    const t = admittedFact(proposal(UNIT, "sha-A", "sha-B"))
    expect(String(t.id)).toBe(String(transitionKey(UNIT, "sha-A", "sha-B")))
    expect(t.shaBefore).toBe("sha-A")
    expect(t.shaAfter).toBe("sha-B")
    expect(t.grounding.entries).toHaveLength(2)
    expect(String(t.grounding.entries[0]!.anchor.subtreeHash)).toBe("sha-A")
    expect(String(t.grounding.entries[1]!.anchor.subtreeHash)).toBe("sha-B")
  })

  it("is DIRECTED — before→after is a different node than after→before", () => {
    const fwd = admittedFact(proposal(UNIT, "sha-A", "sha-B"))
    const rev = admittedFact(proposal(UNIT, "sha-B", "sha-A"))
    expect(String(fwd.id)).not.toBe(String(rev.id))
    expect(String(transitionKey(UNIT, "sha-A", "sha-B"))).not.toBe(String(transitionKey(UNIT, "sha-B", "sha-A")))
  })
})

// ── AT-3 ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("AT-3 — a later transition on the same lineage supersedes the incumbent (no dup)", () => {
  it("reads back the chain A→B (SUPERSEDED) and B→C (TRANSITIONED), two distinct retained nodes", () => {
    let store = emptyStore()
    store = persist(store, admittedFact(proposal(UNIT, "sha-A", "sha-B")))
    store = persist(store, admittedFact(proposal(UNIT, "sha-B", "sha-C")))

    const rows = transitionsOf(store, UNIT)
    // both retained — supersession is not a delete (D-T3).
    expect(rows).toHaveLength(2)
    // no duplicate nodeKeys.
    expect(new Set(rows.map((r) => r.nodeKey)).size).toBe(2)

    const ab = rows.find((r) => r.shaBefore === "sha-A" && r.shaAfter === "sha-B")
    const bc = rows.find((r) => r.shaBefore === "sha-B" && r.shaAfter === "sha-C")
    expect(ab?.authoring).toBe("SUPERSEDED") // its shaAfter is bc's shaBefore ⇒ continued ⇒ superseded
    expect(bc?.authoring).toBe("TRANSITIONED") // the lineage HEAD (tip of the chain)
  })

  it("re-admitting the SAME sha-pair is an in-place UPDATE — never a duplicate row", () => {
    let store = emptyStore()
    store = persist(store, admittedFact(proposal(UNIT, "sha-A", "sha-B")))
    store = persist(store, admittedFact(proposal(UNIT, "sha-A", "sha-B")))
    expect(transitionsOf(store, UNIT)).toHaveLength(1)
  })
})

// ── AT-4 ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("AT-4 — a transition is NEVER sealed proven", () => {
  it("every admitted transition seals justified, never proven (there is no HEAD oracle — D-T1)", () => {
    const t = admittedFact(proposal(UNIT, "sha-A", "sha-B"))
    expect(t.seal).toBe("justified")
    expect(t.seal).not.toBe("proven")
  })
})

// ── AT-5 ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("AT-5 — no HEAD re-check (freshness stamped at emit, never re-derived)", () => {
  it("the read fold consults NO index — the stored revs + FRESH verdict are invariant under any index change", () => {
    let store = emptyStore()
    store = persist(store, admittedFact(proposal(UNIT, "sha-A", "sha-B")))
    // transitionsOf takes NO freshness oracle / index (unlike negationsOf) — so no HEAD state can move it.
    const first = transitionsOf(store, UNIT)
    const second = transitionsOf(store, UNIT)
    expect(first).toEqual(second)
    expect(first[0]!.freshness).toBe("FRESH") // stamped, never re-checked (D-T2)
    expect(first[0]!.shaBefore).toBe("sha-A") // the PAST rev, unchanged by any current index
    expect(first[0]!.shaAfter).toBe("sha-B")
  })
})

// ── AT-6 ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("AT-6 — a malformed transition is refused (no address to mint)", () => {
  it("drops a proposal with a missing unitKey leg", () => {
    const a = admit({ ...proposal(UNIT, "sha-A", "sha-B"), unitKey: "" }, deps)
    expect(a.outcome).toBe("dropped")
  })

  it("drops a zero-interval proposal (shaBefore === shaAfter — the unit did not change)", () => {
    const a = admit(proposal(UNIT, "sha-SAME", "sha-SAME"), deps)
    expect(a.outcome).toBe("dropped")
  })

  it("transitionKey itself throws MalformedTransitionError on shaBefore === shaAfter (never a raw TypeError)", () => {
    expect(() => transitionKey(UNIT, "x", "x")).toThrowError(/malformed transition/i)
    expect(() => transitionKey("", "a", "b")).toThrowError(/malformed transition/i)
  })
})

// ── AT-7 ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("AT-7 — rename is NOT reconciled (different unitKey ⇒ a separate lineage, never silently linked)", () => {
  it("a transition on unitKey B is not linked to unitKey A — distinct identity + distinct lineage read", () => {
    const before = "src/pay.ts::charge"
    const after = "src/pay.ts::chargeCard" // a rename — a DIFFERENT unit key
    // identity is bound to ONE unit lineage: the same rev-pair on two different units mints DIFFERENT ids.
    expect(String(transitionKey(before, "sha-A", "sha-B"))).not.toBe(String(transitionKey(after, "sha-A", "sha-B")))

    let store = emptyStore()
    store = persist(store, admittedFact(proposal(before, "sha-A", "sha-B")))
    store = persist(store, admittedFact(proposal(after, "sha-B", "sha-C")))

    // reading lineage `before` returns ONLY before's transition — after's is NOT folded into the chain.
    const beforeRows = transitionsOf(store, before)
    expect(beforeRows).toHaveLength(1)
    expect(beforeRows[0]!.unitKey).toBe(before)
    // and `before`'s A→B is NOT superseded by `after`'s B→C: supersession is per-unit-lineage, so `before` reads
    // as the current head of its own (single-entry) lineage — the rename did not silently continue it.
    expect(beforeRows[0]!.authoring).toBe("TRANSITIONED")
  })
})
