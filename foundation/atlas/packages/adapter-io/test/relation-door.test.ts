// @atlas/adapter-io — test/relation-door.test.ts  (ADR-0015 D2 / #99a — the governed emit door on a RELATION)
//
// THE CRUX of #99a, proven at the COMPOSED door (real DiskStore, real gates), not just the pure identity:
// a relation grounds TWO endpoints in DIFFERENT files, and the intrinsic identity path
// (`nodeKey → primaryAnchorId → deepestCommonUnit`) THROWS `DegenerateAnchorError` on exactly that shape
// (the #103 wildcard fix). This suite shows the door EMITS the relation while an INTRINSIC advisory grounded
// at the same two anchors is refused — the relation is addressed by `relationKey`, never the common ancestor.
// It also pins the two new gate-0 refusals (malformed / self relation) and confirms the existing governance
// gates (authz) still apply to a relation.

import { describe, it, expect, afterEach } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import { DegenerateAnchorError } from "@atlas/knowledge"
import type { GroundedFact, RelationKind } from "@atlas/knowledge"
import type { Tier } from "@atlas/contracts"
import { createGovernedEmit } from "../src/governed-emit.js"
import { REJECTED_MALFORMED_RELATION } from "../src/governed-emit-reasons.js"
import { AT, HOLDS, advisoryFact, freshWorkspace, policyOf, reasonOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

// Two units in DIFFERENT files — the pair the intrinsic door refuses and the relation door must accept.
const A = "src/payments/charge.ts::charge"
const B = "src/vendor/lodash.ts::debounce"

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
})

/** A grounded RELATION fact — TWO grounding entries (both endpoints), so `driftDetect` AND-folds them. */
function relationFact(opts: {
  a?: string
  b?: string
  kind?: RelationKind
  scope?: string
  tier?: Tier
  gen?: number
}): GroundedFact {
  const a = opts.a ?? A
  const b = opts.b ?? B
  const entry = (p: string) => ({
    anchor: { kind: "symbol" as const, qualifiedPath: p, subtreeHash: asSubtreeHash("sh-door") },
    path: "x",
  })
  return {
    kind: "relation",
    id: asNodeKey("gen-" + String(opts.gen ?? 1)),
    tier: opts.tier ?? "T2",
    relationKind: opts.kind ?? "depends-on",
    endpointA: a,
    endpointB: b,
    grounding: { entries: [entry(a), entry(b)] },
    freshness: "FRESH",
    claims: [],
    authoring: "RELATED",
    scope: opts.scope ?? "core",
  } as unknown as GroundedFact
}

/** A door whose `actor` owns `core` (the relation's scope), gate held open, billy token present. */
function coreDoor(actor = "bob"): ReturnType<typeof createGovernedEmit> {
  ws ??= freshWorkspace()
  return createGovernedEmit({
    store: ws.store,
    gate: HOLDS,
    policy: policyOf({ core: ["bob"] }),
    actor,
    ratifyToken: "billy",
  })
}

describe("governed emit door — RELATION (ADR-0015 D2, SEAT ANCHOR)", () => {
  it("THE CRUX: a cross-file relation EMITS, while an intrinsic advisory at the SAME two anchors is refused", () => {
    // The relation writes durably through the whole 16-gate door.
    const out = coreDoor().emit(relationFact({}), AT)
    expect(out.emitted).toBe(true)

    // The contrast — an INTRINSIC advisory citing both cross-file symbols hits the #103 degenerate-anchor
    // refusal (its identity is the EMPTY common prefix). Same store, same gates; only the fact SHAPE differs.
    const intrinsic = advisoryFact({ anchor: A, scope: "core", claimNorm: "x" })
    const twoFile = {
      ...(intrinsic as object),
      grounding: {
        entries: [
          { anchor: { kind: "symbol", qualifiedPath: A, subtreeHash: asSubtreeHash("sh") }, path: "x" },
          { anchor: { kind: "symbol", qualifiedPath: B, subtreeHash: asSubtreeHash("sh") }, path: "x" },
        ],
      },
    } as unknown as GroundedFact
    expect(() => coreDoor().emit(twoFile, AT)).toThrow(DegenerateAnchorError)
  })

  it("re-emitting the SAME relation is idempotent (DEDUP), never a second node", () => {
    const door = coreDoor()
    expect(door.emit(relationFact({ gen: 1 }), AT).emitted).toBe(true)
    // Byte-identical fact ⇒ contentHash hit ⇒ DEDUP short-circuit; still reports emitted (idempotent no-op).
    expect(door.emit(relationFact({ gen: 1 }), AT).emitted).toBe(true)
  })

  describe("gate-0 relation well-formedness (the 2-ended analogue of `malformed family`)", () => {
    it("an off-vocabulary relationKind is REJECTED, fail-closed", () => {
      const out = coreDoor().emit(relationFact({ kind: "implements" as unknown as RelationKind }), AT)
      expect(out.emitted).toBe(false)
      expect(reasonOf(out.rejected)).toBe(reasonOf(REJECTED_MALFORMED_RELATION))
    })
    it("a self-relation (endpointA === endpointB) is REJECTED", () => {
      const out = coreDoor().emit(relationFact({ a: A, b: A }), AT)
      expect(out.emitted).toBe(false)
      expect(reasonOf(out.rejected)).toBe(reasonOf(REJECTED_MALFORMED_RELATION))
    })
    it("an empty endpoint is REJECTED", () => {
      const out = coreDoor().emit(relationFact({ b: "" }), AT)
      expect(out.emitted).toBe(false)
      expect(reasonOf(out.rejected)).toBe(reasonOf(REJECTED_MALFORMED_RELATION))
    })
  })

  it("the governance gates STILL apply — an actor not in the relation scope is denied", () => {
    // mallory owns nothing in `core`; the relation is well-formed but authz refuses it (fail-closed v1).
    const out = coreDoor("mallory").emit(relationFact({}), AT)
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unauthorized")
  })
})
