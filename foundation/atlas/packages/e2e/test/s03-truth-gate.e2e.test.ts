// @atlas/e2e — S3 · Truth-gate: an ungrounded fact cannot become truth
// AXIS: SECURITY (the core Atlas invariant — "a fact is truth only if grounded ∧ FRESH", fail-closed).
//
// STORY. A fact is only ever served as truth when it is anchored to real code (grounded) AND that code has
// not moved under it (FRESH). This story drives the REAL truth-gate (@atlas/grounding `bindGate` over the
// concrete `isGrounded`/`driftDetect` oracles) and the REAL fail-closed write (@atlas/knowledge `bindEmit`)
// across the package seam, and proves the gate cannot be tricked:
//   • a grounded ∧ FRESH claim HOLDS,
//   • the same claim, once the cited code changes (DRIFTED), is downgraded to NA — never served stale,
//   • an ungrounded claim is downgraded to NA even when it arrives asserting HOLDS,
//   • a non-Status value can never launder itself into a HOLDS (coerce fail-closed),
//   • an ungrounded node is REFUSED by atlas-emit with NOTHING written to the store.
//
// INJECTED PORT (legitimate seam, not a blocker): `EmitDeps.persist` is the CAS sink the emit facet defers
// to (the store is OWNER-DEFINE, consume-only). We wire it to the REAL sealed @atlas/kernel CAS (`createStore`)
// — the truest possible double — and spy on it to prove the ungrounded path writes zero bytes. The gate's
// grounded/FRESH oracles are the concrete `isGrounded`/`driftDetect` exports, not fakes, so the teeth are real.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey, createStore, id } from "@atlas/kernel"
import { bindGate, isGrounded, driftDetect } from "@atlas/grounding"
import type { Grounding } from "@atlas/grounding"
import { bindEmit } from "@atlas/knowledge"
import type { GroundedFact } from "@atlas/knowledge"
import type { Axes, Axis, IndexNode } from "@atlas/index"

// ── the cited unit + built-index snapshots ──────────────────────────────────────────────────────────
const ANCHOR = "billing.ts#computeArr"
const leaf = (key: string, sh: string): IndexNode => ({
  axis: "spatial",
  level: "item",
  key,
  subtreeHash: asSubtreeHash(sh),
  children: [],
  objects: [],
})
const emptyAxis = (axis: Axis): IndexNode => ({
  axis,
  level: "root",
  key: axis,
  subtreeHash: asSubtreeHash("empty"),
  children: [],
  objects: [],
})
/** A built-index snapshot in which ANCHOR currently hashes to `sh`. */
const srcWhereAnchorIs = (sh: string): Axes => ({
  spatial: {
    axis: "spatial",
    level: "repo",
    key: "repo",
    subtreeHash: asSubtreeHash("root"),
    children: [leaf(ANCHOR, sh)],
    objects: [],
  },
  territory: emptyAxis("territory"),
  dependency: emptyAxis("dependency"),
  edges: [],
})

// ── groundings ──────────────────────────────────────────────────────────────────────────────────────
const groundingAt = (sh: string): Grounding => ({
  entries: [{ anchor: { kind: "symbol", qualifiedPath: ANCHOR, subtreeHash: asSubtreeHash(sh) }, path: "billing.ts" }],
})
const UNGROUNDED: Grounding = { entries: [] } // 0 entries — GROUND-2 says this is never grounded

const advisory = (grounding: Grounding): GroundedFact => ({
  kind: "advisory",
  id: asNodeKey("fact:billing.computeArr"),
  tier: "T2",
  claimNorm: "computeArr is a pure function of its inputs",
  grounding,
  freshness: "FRESH",
  claims: [],
  authoring: "ADVISORY",
})

describe("S3 · truth-gate — grounded ∧ FRESH or nothing (fail-closed)", () => {
  const gate = bindGate({ isGrounded, driftDetect }) // the REAL oracles, composed across the seam
  const FRESH_SRC = srcWhereAnchorIs("sh-1")
  const grounded = groundingAt("sh-1") // anchor recorded at sh-1, matches FRESH_SRC

  it("serves HOLDS for a grounded claim whose cited code is unchanged (FRESH)", () => {
    expect(driftDetect(grounded, FRESH_SRC)).toBe("FRESH")
    // teeth (breaks-on "the gate refuses a genuinely grounded+fresh claim — false-negative truth"):
    expect(gate.gateHolds("HOLDS", grounded, FRESH_SRC)).toBe("HOLDS")
  })

  it("downgrades a claim to NA once the cited code changes underneath it — never served stale", () => {
    // the code at ANCHOR moved from sh-1 → sh-2; the grounding still records sh-1 ⇒ DRIFTED.
    const driftedSrc = srcWhereAnchorIs("sh-2")
    expect(driftDetect(grounded, driftedSrc)).toBe("DRIFTED")
    // teeth (breaks-on "a drifted (stale) claim is still served as HOLDS"):
    expect(gate.gateHolds("HOLDS", grounded, driftedSrc)).toBe("NA")
  })

  it("downgrades an UNGROUNDED claim to NA even when it arrives asserting HOLDS", () => {
    expect(isGrounded(UNGROUNDED)).toBe(false)
    // teeth (breaks-on "an ungrounded claim can assert itself into HOLDS"):
    expect(gate.gateHolds("HOLDS", UNGROUNDED, FRESH_SRC)).toBe("NA")
  })

  it("never lets a non-Status value launder into HOLDS, and never upgrades a lesser verdict", () => {
    // a non-Status candidate is coerced fail-closed to NA (cannot fabricate HOLDS).
    expect(gate.gateHolds({ pretending: "HOLDS" } as unknown, grounded, FRESH_SRC)).toBe("NA")
    // downgrade-only: a non-HOLDS verdict passes through unchanged (the gate never upgrades to HOLDS).
    expect(gate.gateHolds("advisory", grounded, FRESH_SRC)).toBe("advisory")
    expect(gate.gateHolds("BROKEN", grounded, FRESH_SRC)).toBe("BROKEN")
  })

  describe("atlas-emit — the fail-closed store admission (ungrounded writes zero bytes)", () => {
    it("REFUSES an ungrounded node and persists NOTHING (the security keystone)", () => {
      const store = createStore()
      let writes = 0
      const emit = bindEmit({
        isGrounded,
        persist: (n) => {
          writes += 1
          return store.put(n)
        },
      })

      const verdict = emit.admit(advisory(UNGROUNDED))

      // teeth (breaks-on "an ungrounded fact enters the store — the trust boundary is bypassed"):
      expect(verdict.emitted).toBe(false)
      expect(verdict.id).toBeUndefined()
      expect(writes).toBe(0) // the CAS sink was NEVER called — nothing written
    })

    it("admits a grounded node exactly once, with the receipt carrying the real sealed CAS id", () => {
      const store = createStore()
      let writes = 0
      const emit = bindEmit({
        isGrounded,
        persist: (n) => {
          writes += 1
          return store.put(n)
        },
      })

      const node = advisory(grounded)
      const verdict = emit.admit(node)

      expect(verdict.emitted).toBe(true)
      expect(writes).toBe(1) // persisted exactly once
      // the receipt id is the sealed kernel content-address of the node — re-derived, not fabricated.
      expect(verdict.id).toBe(id(node))
      expect(store.get(verdict.id!)).toEqual(node) // and it is genuinely retrievable from the CAS
    })
  })
})
