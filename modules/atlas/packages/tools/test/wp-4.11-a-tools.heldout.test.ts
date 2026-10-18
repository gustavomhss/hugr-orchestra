// @atlas/tools — test/wp-4.11-a-tools.heldout.test.ts   (WP-4.11-a.TOOLS — HELD-OUT GATE)
//
// Cold held-out transcription of the `-2` goldens the builder did NOT see, run against the EXISTING
// src/emit.ts (no impl change). Same re-derive-at-`source@sha` + fail-closed behaviour, different node +
// source (`claim:acme-ceo` @ reference/people.md@f7e8d9):
//   - SCN-TOOLS-7a-2 (held-out · happy) — N3 "ACME CEO = Jane Roe" IS present at @f7e8d9 ⇒ emitted.
//   - SCN-TOOLS-7b-2 (held-out · guard) — N3′ "ACME CEO = John Doe" is NOT present at @f7e8d9 ⇒
//                                          {emitted:false}, nothing persisted (store byte-identical).

import { describe, it, expect } from "vitest"
import { id, asHash, asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { Cas, CasObject } from "@atlas/kernel"
import type { Hash, Status } from "@atlas/contracts"
import type { AdvisoryNode, GroundedFact } from "@atlas/knowledge"
import type { Grounding } from "@atlas/grounding"
import { createEmit } from "../src/emit.js"
import type { TruthGate } from "../src/emit.js"

// A grounding receipt anchoring the CEO claim to a people-reference block.
const grounding: Grounding = {
  entries: [
    {
      anchor: { kind: "block", qualifiedPath: "reference/people.md#acme-ceo", subtreeHash: asSubtreeHash("st-ceo") },
      path: "reference/people.md",
    },
  ],
}

function ceoClaim(claimNorm: string): AdvisoryNode {
  return {
    kind: "advisory",
    id: asNodeKey("nk:claim:acme-ceo"),
    tier: "T1",
    claimNorm,
    grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }
}

// Fixture gate: HOLDS iff the claim body is present at the pinned source@sha snapshot (caller citation NOT trusted).
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

const PEOPLE_SHA = asHash("f7e8d9")

describe("WP-4.11-a.TOOLS — held-out (-2) goldens", () => {
  it("SCN-TOOLS-7a-2: N3 (claim:acme-ceo = Jane Roe) re-derives at @f7e8d9 ⇒ emitted", () => {
    const n3 = ceoClaim("ACME CEO = Jane Roe") // IS present at @f7e8d9
    const store: Cas = new Map<Hash, CasObject>()
    const gate = gateWithPresent(new Set([n3.claimNorm]))

    const out = createEmit(store, gate).emit(n3, PEOPLE_SHA)

    expect(out.emitted).toBe(true)
    expect(out.rejected).toBeUndefined()
    expect(out.id).toBe(id(n3 as CasObject))
    expect(store.get(id(n3 as CasObject))).toEqual(n3)
  })

  it("SCN-TOOLS-7b-2: N3′ (claim:acme-ceo = John Doe) does not re-derive ⇒ rejected, nothing persisted", () => {
    const n3prime = ceoClaim("ACME CEO = John Doe") // NOT present at @f7e8d9 (wrong CEO)
    const prior = ceoClaim("ACME CEO = Jane Roe")
    const store: Cas = new Map<Hash, CasObject>([[id(prior as CasObject), prior]])
    const before = new Map(store)
    const gate = gateWithPresent(new Set([prior.claimNorm])) // n3prime absent ⇒ fails closed

    const out = createEmit(store, gate).emit(n3prime, PEOPLE_SHA)

    expect(out.emitted).toBe(false)
    expect(out.id).toBeUndefined()
    expect(out.rejected).toBeTruthy()
    expect(store).toEqual(before)
    expect(store.size).toBe(1)
    expect(store.has(id(n3prime as CasObject))).toBe(false)
  })
})
