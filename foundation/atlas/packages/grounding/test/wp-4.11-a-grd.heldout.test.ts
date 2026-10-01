// @atlas/grounding — test/wp-4.11-a-grd.heldout.test.ts   (COLD-REVIEW held-out gate, WP-4.11-a.GROUND)
//
// Authored by the reviewer against the EXISTING src (../src/emit-guard.js) WITHOUT the builder's sight.
// Independent-data legs of the two in-scope conformance goldens whose held-out sibling exists and lands
// on THIS facet's surface:
//   - SCN-GROUND-6-2 (held_out) — an ungrounded fact (`g_partial2`, one empty-subtreeHash entry) fails the
//     emit truth door ⇒ 0 bytes persist. Independent data vs 6-1's single-entry `g_partial`.
//   - SCN-GROUND-9-3 (held_out) — a DIFFERENT free-prose fact (a raw markdown paragraph blob) is rejected
//     by the template validator. Independent data vs 9-1's prose string.
// Out of this facet's held-out surface: 4-1/4-2 (PBT, held-out subsumed by the property corpus), 4-3/9-2
// (DEFINE-parametric residues), 8-2 (GROUND-8 untrusted-source, owned by WP-4.11-b.GROUND). NOT authored.
//
// isGrounded is 4.10's runtime (build-ahead) — injected here as the frozen `GateDeps` seam; `g_partial2`
// is modeled by `isGrounded → false` (its empty-subtreeHash entry makes GROUND-2 real-grounding false).

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { Freshness } from "@atlas/contracts"
import type { Axes } from "@atlas/index"
import type { Grounding } from "../src/types.js"
import { bindGate } from "../src/gate.js"
import type { GateDeps } from "../src/gate.js"
import { validateTemplate, truthDoorHolds } from "../src/emit-guard.js"

const SRC = {} as Axes

// g_partial2 = { E_tax(sh-tax-01), E_empty2("") } — one empty-subtreeHash entry ⇒ isGrounded = false.
const partial2: Grounding = {
  entries: [
    {
      anchor: { kind: "block", qualifiedPath: "pricing.ts#computeVat", subtreeHash: asSubtreeHash("sh-tax-01") },
      path: "pricing.ts",
    },
    {
      anchor: { kind: "block", qualifiedPath: "pricing.ts#empty", subtreeHash: asSubtreeHash("") },
      path: "pricing.ts",
    },
  ],
}

function deps(grounded: boolean, freshness: Freshness): GateDeps {
  return { isGrounded: () => grounded, driftDetect: () => freshness }
}

describe("WP-4.11-a.GROUND — HELD-OUT gate (independent-data legs)", () => {
  it("SCN-GROUND-6-2: an ungrounded (g_partial2) fact fails the emit truth door ⇒ nothing persists", () => {
    // isGrounded(g_partial2) = false is the only miss (freshness held FRESH to isolate the grounding leg).
    const gate = bindGate(deps(false, "FRESH"))
    expect(gate.gateHolds("HOLDS", partial2, SRC)).toBe("NA")
    expect(truthDoorHolds(gate, "HOLDS", partial2, SRC)).toBe(false)

    // "0 bytes persisted": the guard-gated write is skipped — store byte-identical before/after.
    const store = new Map<string, unknown>()
    const before = new Map(store)
    if (truthDoorHolds(gate, "HOLDS", partial2, SRC)) store.set("nk", {})
    expect(store).toEqual(before)
    expect(store.size).toBe(0)
  })

  it("SCN-GROUND-9-3: a second free-prose fact (a raw markdown paragraph blob) is rejected", () => {
    const blob = "## ACME\n\nRevenue is expected to keep climbing through the next few quarters.\n"
    expect(validateTemplate(blob)).toBe(false)
    // control: a structured template record still admits at the coarse gate.
    expect(validateTemplate({ claimNorm: "ACME VAT 2024 = 20%", grounding: partial2 })).toBe(true)
  })
})
