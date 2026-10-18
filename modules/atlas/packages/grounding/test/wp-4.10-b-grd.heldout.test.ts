// @atlas/grounding — test/wp-4.10-b-grd.heldout.test.ts   (WP-4.10-b.GROUND · HELD-OUT gate)
//
// COLD-REVIEW held-out leg for the transitive freshness fold (GROUND-11). No formal SCN-GROUND-11a-2
// … 11f-2 exists — the goldens explicitly SKIP the held-out surface for the PBT SCNs 11a–11f (subsumed
// by the property corpus, goldens-grd.md:498-499). This file therefore transcribes the GENUINELY-
// INDEPENDENT Wave-H fixture family the builder never saw (goldens-grd.md:512-513): callee `U_ship`
// (shipRate) in `F_disc`'s forward-closure — DIFFERENT anchors/subtrees/interface-rStates exercising the
// SAME fold branches. Authored against EXISTING src (../src/freshness.js), NO source edits.

import { describe, it, expect } from "vitest"
import { asHash, asSubtreeHash } from "@atlas/kernel"
import type { Freshness } from "@atlas/contracts"
import { freshness, describeFreshness } from "../src/freshness.js"
import type { FreshnessSnapshot, ClosureMember } from "../src/freshness.js"

// ── Independent fixture vocabulary (Wave-H held-out data family) ──────────────────────────────────────
const SH_DISC_01 = asSubtreeHash("sh-disc-01") // F_disc's own grounding-set subtreeHash
const SH_DISC_02 = asSubtreeHash("sh-disc-02") // ... after a real change to the cited unit
const IR_SHP_01 = "ir-shp-01" // callee U_ship INTERFACE rState (signature-level)
const IR_SHP_02 = "ir-shp-02" // ... after a signature change (param added)
const SH_SHP_01 = asSubtreeHash("sh-shp-01") // callee U_ship FULL-BODY subtreeHash
const SH_SHP_01R = asSubtreeHash("sh-shp-01r") // ... after a pure-body refactor (interface untouched)
const U_SHIP = asHash("u-ship") // the callee node

const shipMember = (interfaceRState: string, bodySubtreeHash = SH_SHP_01): ClosureMember => ({
  node: U_SHIP,
  interfaceRState,
  bodySubtreeHash,
})

// F_disc pinned: own hash sh-disc-01, forward-closure {U_ship} at interface ir-shp-01.
const PINNED: FreshnessSnapshot = {
  ownSubtreeHashes: [SH_DISC_01],
  closure: [shipMember(IR_SHP_01)],
}

describe("WP-4.10-b.GROUND — HELD-OUT (Wave-H F_disc/U_ship family)", () => {
  // 11a — folds BOTH own hash AND closure interface.
  it("folds both own hash and closure interface", () => {
    expect(freshness(PINNED, PINNED)).toBe<Freshness>("FRESH")
    const ownChanged: FreshnessSnapshot = { ...PINNED, ownSubtreeHashes: [SH_DISC_02] }
    expect(freshness(PINNED, ownChanged)).toBe<Freshness>("DRIFTED")
    const ifaceChanged: FreshnessSnapshot = { ...PINNED, closure: [shipMember(IR_SHP_02)] }
    expect(freshness(PINNED, ifaceChanged)).toBe<Freshness>("DRIFTED")
  })

  // 11b/11d — callee full-body hash is NEVER folded; a pure-body refactor stays FRESH.
  it("never folds the callee full-body subtreeHash (body refactor ⇒ FRESH)", () => {
    const bodyOnly: FreshnessSnapshot = { ...PINNED, closure: [shipMember(IR_SHP_01, SH_SHP_01R)] }
    expect(freshness(PINNED, bodyOnly)).toBe<Freshness>("FRESH")
  })

  // 11c — a callee signature/contract change drifts the caller.
  it("a callee signature change drifts callers", () => {
    const sigChanged: FreshnessSnapshot = { ...PINNED, closure: [shipMember(IR_SHP_02, SH_SHP_01R)] }
    // interface flipped even though body also moved ⇒ DRIFTED via the interface arm.
    expect(freshness(PINNED, sigChanged)).toBe<Freshness>("DRIFTED")
  })

  // teeth: a dependency vanishing/appearing is structural drift (membership keyed by node Hash).
  it("closure membership change drifts (callee dropped)", () => {
    const dropped: FreshnessSnapshot = { ...PINNED, closure: [] }
    expect(freshness(PINNED, dropped)).toBe<Freshness>("DRIFTED")
  })

  // empty forward closure folds on own hash alone.
  it("empty forward closure folds on own hash alone", () => {
    const empty: FreshnessSnapshot = { ownSubtreeHashes: [SH_DISC_01], closure: [] }
    expect(freshness(empty, empty)).toBe<Freshness>("FRESH")
    const emptyDrift: FreshnessSnapshot = { ownSubtreeHashes: [SH_DISC_02], closure: [] }
    expect(freshness(empty, emptyDrift)).toBe<Freshness>("DRIFTED")
  })

  // 11e/11f — verdict is the structural Freshness union, never a truth value; rendering stays structural.
  it("verdict is the structural union, never a boolean/truth", () => {
    const verdict = freshness(PINNED, PINNED)
    expect(typeof verdict).toBe("string")
    expect([true, false] as unknown[]).not.toContain(verdict)
    expect(describeFreshness("FRESH").toLowerCase()).toContain("structurally unchanged")
    expect(describeFreshness("FRESH").toLowerCase()).not.toContain("true")
  })
})
