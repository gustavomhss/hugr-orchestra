// @atlas/tools — test/wp-4.11-a-tools.test.ts   (WP-4.11-a.TOOLS)
//
// RED→GREEN transcription of the VISIBLE goldens for `atlas-emit`'s re-derive-at-`source@sha` +
// fail-closed reject path (TOOLS-7a / TOOLS-7b, GROUND-6):
//   - SCN-TOOLS-7a-1 (happy) — emit re-derives the claim at the pinned sha ⇒ the node is emitted.
//   - SCN-TOOLS-7b-1 (guard) — a non-re-deriving node ⇒ `{emitted:false}`, nothing persisted
//                              (store byte-identical before/after).
// The facet is imported DIRECTLY from ../src/emit.js (the barrel is wired by the lead at SEAL). The
// re-derivation is the GROUND truth-gate seam (WP-4.11-a.GROUND) consumed as an injected `TruthGate`
// port + FIXTURES (build-ahead). Content-addressed persistence uses the SEALED @atlas/kernel `id` seam
// (never a hand-rolled digest); golden ids are SYMBOLIC so every assertion is RELATIONAL / round-trip.
// Held-out `-2` fixtures (SCN-TOOLS-7a-2 / 7b-2) are NOT transcribed — the GATE runs those.

import { describe, it, expect } from "vitest"
import { id, asHash, asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { Cas, CasObject } from "@atlas/kernel"
import type { Hash, Status } from "@atlas/contracts"
import type { AdvisoryNode, GroundedFact } from "@atlas/knowledge"
import type { Grounding } from "@atlas/grounding"
import { createEmit } from "../src/emit.js"
import type { TruthGate } from "../src/emit.js"

// A grounding receipt anchoring a finance claim to a structural block (subtreeHash is the drift oracle).
const grounding: Grounding = {
  entries: [
    {
      anchor: { kind: "block", qualifiedPath: "reference/finance.md#arr", subtreeHash: asSubtreeHash("st-arr") },
      path: "reference/finance.md",
    },
  ],
}

/** A minimal grounded advisory claim (the templated candidate `atlas-emit` consumes). */
function claim(claimNorm: string): AdvisoryNode {
  return {
    kind: "advisory",
    id: asNodeKey(`nk:${claimNorm}`),
    tier: "T1",
    claimNorm,
    grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }
}

/**
 * A FIXTURE truth-gate standing in for GROUND's `gateHolds` (build-ahead): a claim re-derives (`HOLDS`)
 * iff its `claimNorm` body is present at the pinned `source@sha` snapshot, else it fails closed (`NA`).
 * This models "re-derive the citation at `source@sha`" — the caller's citation is NOT trusted.
 */
function gateWithPresent(present: ReadonlySet<string>): TruthGate {
  return {
    gateHolds(node: GroundedFact, _at: Hash): Status {
      // `claimNorm` is an AdvisoryNode field; `GroundedFact` also admits PredicateNode, which has none.
      // The un-narrowed read evaluated to `undefined` for a predicate, so `present.has(undefined)` was false
      // and the gate FAILED CLOSED. That disposition is preserved verbatim, now stated instead of accidental.
      return node.kind === "advisory" && present.has(node.claimNorm) ? "HOLDS" : "NA"
    },
  }
}

const SHA = asHash("a1b2c3")

describe("WP-4.11-a.TOOLS — atlas-emit re-derives at source@sha, fails closed (visible goldens)", () => {
  it("SCN-TOOLS-7a-1: emit re-derives the claim at the pinned sha ⇒ the node is emitted", () => {
    const n1 = claim("ACME ARR 2024 = $4.2M") // IS present at @a1b2c3
    const store: Cas = new Map<Hash, CasObject>()
    const gate = gateWithPresent(new Set([n1.claimNorm]))

    const out = createEmit(store, gate).emit(n1, SHA)

    // the derivation matches ⇒ emitted, with the CAS id of the persisted object.
    expect(out.emitted).toBe(true)
    expect(out.rejected).toBeUndefined()
    expect(out.id).toBe(id(n1 as CasObject))
    // the node actually landed under its content id (persisted through the sealed seam).
    expect(store.get(id(n1 as CasObject))).toEqual(n1)
  })

  it("SCN-TOOLS-7b-1: a non-re-deriving node is rejected, nothing persisted (store byte-identical)", () => {
    // "$9.9M" is NOT present at @a1b2c3 — the caller's citation does not re-derive.
    const n1prime = claim("ACME ARR 2024 = $9.9M")
    // a pre-existing entry so "byte-identical before/after" is a real, non-trivial assertion.
    const prior = claim("ACME ARR 2023 = $3.1M")
    const store: Cas = new Map<Hash, CasObject>([[id(prior as CasObject), prior]])
    const before = new Map(store) // snapshot
    const gate = gateWithPresent(new Set([prior.claimNorm])) // n1prime absent ⇒ fails closed

    const out = createEmit(store, gate).emit(n1prime, SHA)

    // fail-closed: emitted:false, a structured reason, no CAS id.
    expect(out.emitted).toBe(false)
    expect(out.id).toBeUndefined()
    expect(out.rejected).toBeTruthy()
    // teeth (breaks-on "the non-re-deriving node is persisted anyway (emitted:true) — an ungrounded
    // fact lands"): the store is byte-identical before/after — nothing was written.
    expect(store).toEqual(before)
    expect(store.size).toBe(1)
    expect(store.has(id(n1prime as CasObject))).toBe(false)
  })
})
