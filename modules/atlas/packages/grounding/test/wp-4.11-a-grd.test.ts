// @atlas/grounding — test/wp-4.11-a-grd.test.ts   (WP-4.11-a.GROUND)
//
// RED→GREEN transcription of the VISIBLE goldens for the truth-gate (grounded ∧ FRESH, fail-closed at
// emit — GROUND-4/6/9):
//   - SCN-GROUND-4-1 (happy · PBT) — `gateHolds` serves HOLDS iff grounded ∧ FRESH; a drifted grounding
//                                     downgrades HOLDS→NA.
//   - SCN-GROUND-4-2 (happy · PBT) — downgrade-only monotonicity, idempotence, non-HOLDS pass-through.
//   - SCN-GROUND-6-1 (guard)       — an ungrounded fact fails the emit truth door ⇒ nothing persists
//                                     (a guard-gated store stays byte-identical).
//   - SCN-GROUND-9-1 (guard)       — a raw free-prose fact is rejected by the template validator.
//
// The facet is imported DIRECTLY from ../src/*.js (the barrel is wired by the lead at SEAL). `gateHolds`
// consumes GROUND's drift-oracle seam (isGrounded + driftDetect, WP-4.10-a.GROUND) as INJECTED fixtures
// (build-ahead: `@atlas/grounding` ships zero runtime yet). The PBT laws (4-1/4-2) are proven EXHAUSTIVELY
// over the finite (Status × grounded × Freshness) space — the reference gate automaton (method-tags-grd
// §INV-GROUND-4) is the oracle. NOT transcribed: the DEFINE-parametric residues SCN-GROUND-4-3 (Θ_A1
// downgrade threshold) and SCN-GROUND-9-2 (A-13 required-field-set / cap) — both [NEEDS RECONCILIATION],
// out of this facet. Held-out `-2` fixtures are NOT read.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { Status, Freshness } from "@atlas/contracts"
import type { Axes } from "@atlas/index"
import type { Grounding } from "../src/types.js"
import { bindGate } from "../src/gate.js"
import type { GateDeps } from "../src/gate.js"
import { validateTemplate, truthDoorHolds } from "../src/emit-guard.js"

// The source-of-truth snapshot is passed straight through to the injected drift oracle, which ignores it
// in these fixtures — a symbolic `Axes` keeps every assertion RELATIONAL (Owner-DEFINE pin: src = Axes).
const SRC = {} as Axes

// A real (grounded) receipt: one entry carrying a non-empty subtreeHash (GROUND-2 real grounding).
const groundedReceipt: Grounding = {
  entries: [
    {
      anchor: { kind: "block", qualifiedPath: "reference/finance.md#arr", subtreeHash: asSubtreeHash("st-arr") },
      path: "reference/finance.md",
    },
  ],
}
// g_partial: one empty-subtreeHash entry ⇒ ungrounded (SCN-GROUND-6-1).
const partialReceipt: Grounding = {
  entries: [
    {
      anchor: { kind: "block", qualifiedPath: "reference/finance.md#arr", subtreeHash: asSubtreeHash("") },
      path: "reference/finance.md",
    },
  ],
}

/** Build the injected drift-oracle seam (build-ahead stand-in for WP-4.10-a.GROUND). */
function deps(grounded: boolean, freshness: Freshness): GateDeps {
  return { isGrounded: () => grounded, driftDetect: () => freshness }
}

const ALL_STATUS: readonly Status[] = ["HOLDS", "BROKEN", "NA", "advisory"]
const ALL_FRESH: readonly Freshness[] = ["FRESH", "DRIFTED", "STALE"]

describe("WP-4.11-a.GROUND — truth-gate: HOLDS iff grounded ∧ FRESH, fail-closed at emit (visible goldens)", () => {
  it("SCN-GROUND-4-1: HOLDS is served iff grounded ∧ FRESH; a drifted grounding downgrades HOLDS→NA", () => {
    const holdWhenFresh = bindGate(deps(true, "FRESH")).gateHolds("HOLDS", groundedReceipt, SRC)
    const naWhenDrift = bindGate(deps(true, "DRIFTED")).gateHolds("HOLDS", groundedReceipt, SRC)

    expect(holdWhenFresh).toBe("HOLDS") // grounded ∧ FRESH ⇒ HOLDS
    // teeth (breaks-on "the gate is FRESH-blind — c_drift is served HOLDS on a drifted grounding"):
    expect(naWhenDrift).toBe("NA")

    // law (a) HOLDS-iff-grounded∧FRESH, proven EXHAUSTIVELY over the reference automaton's input space.
    for (const g of [true, false]) {
      for (const f of ALL_FRESH) {
        const out = bindGate(deps(g, f)).gateHolds("HOLDS", groundedReceipt, SRC)
        expect(out).toBe(g && f === "FRESH" ? "HOLDS" : "NA")
      }
    }
  })

  it("SCN-GROUND-4-2: downgrade-only monotonicity, idempotence, and non-HOLDS pass-through", () => {
    for (const g of [true, false]) {
      for (const f of ALL_FRESH) {
        const gate = bindGate(deps(g, f)).gateHolds
        for (const s of ALL_STATUS) {
          const once = gate(s, groundedReceipt, SRC)

          // (d) non-HOLDS pass-through: a non-HOLDS verdict is returned UNCHANGED.
          if (s !== "HOLDS") expect(once).toBe(s)

          // (b) downgrade-only: the gate NEVER upgrades — the only move it makes is HOLDS→NA.
          if (s !== "HOLDS") {
            expect(once).toBe(s) // never becomes HOLDS from a non-HOLDS input
          } else {
            expect(once === "HOLDS" || once === "NA").toBe(true)
          }

          // (c) idempotence: re-gating a gated verdict is a no-op — feeding the result back never
          // launders an NA up to HOLDS. teeth (breaks-on "the gate upgrades on re-gate").
          const twice = gate(once, groundedReceipt, SRC)
          expect(twice).toBe(once)
        }
      }
    }
  })

  it("SCN-GROUND-6-1: an ungrounded fact fails the emit truth door ⇒ nothing persists", () => {
    const gate = bindGate(deps(false, "FRESH")) // g_partial ⇒ isGrounded=false (grounded is the only miss)
    // The truth door blocks: gateHolds serves NA (not HOLDS) for the ungrounded receipt.
    expect(gate.gateHolds("HOLDS", partialReceipt, SRC)).toBe("NA")
    expect(truthDoorHolds(gate, "HOLDS", partialReceipt, SRC)).toBe(false)

    // "0 bytes persisted": a guard-gated write is SKIPPED — the store is byte-identical before/after.
    const store = new Map<string, unknown>()
    const before = new Map(store)
    if (truthDoorHolds(gate, "HOLDS", partialReceipt, SRC)) store.set("nk", {})
    // teeth (breaks-on "admit returns true when isGrounded is false — an ungrounded fact is written"):
    expect(store).toEqual(before)
    expect(store.size).toBe(0)

    // A grounded ∧ FRESH fact, by contrast, passes the truth door (the door is not vacuously closed).
    const open = bindGate(deps(true, "FRESH"))
    expect(truthDoorHolds(open, "HOLDS", groundedReceipt, SRC)).toBe(true)
  })

  it("SCN-GROUND-9-1: a raw free-prose fact is rejected by the template validator", () => {
    // teeth (breaks-on "the validator is free-prose-tolerant — a raw prose fact is persisted"):
    expect(validateTemplate("ACME will probably grow fast next year")).toBe(false)
    expect(validateTemplate(42)).toBe(false)
    expect(validateTemplate(null)).toBe(false)
    expect(validateTemplate(["a", "b"])).toBe(false)
    // a structured (templated) fact carries the fixed record shape ⇒ admitted at the coarse gate.
    expect(validateTemplate({ claimNorm: "ACME ARR 2024 = $4.2M", grounding: groundedReceipt })).toBe(true)
  })
})
