// @atlas/grounding — test/wp-4.10-b-grd.test.ts   (WP-4.10-b.GROUND · EPIC-10-b)
//
// RED→GREEN transcription of the VISIBLE goldens for the transitive freshness fold (GROUND-11): a fact's
// freshness folds BOTH (a) its own grounding-set `subtreeHash` AND (b) its forward-closure's INTERFACE-
// level `rState` (INDEX-12 dependency axis) — NEVER the callee's full body. A callee contract change
// drifts every caller; a pure-body refactor drifts none. Freshness is a STRUCTURAL predicate, never a
// truth claim (FRESH ≠ true).
//   - SCN-GROUND-11a-1 (happy) — folds BOTH own hash AND closure interface: (i) both unchanged ⇒ FRESH,
//                                 (ii) own hash changed ⇒ DRIFTED, (iii) callee interface changed ⇒ DRIFTED.
//   - SCN-GROUND-11b-1 (guard) — the callee FULL-BODY hash is NOT folded: body-only refactor ⇒ FRESH.
//   - SCN-GROUND-11c-1 (happy) — a callee SIGNATURE change (interface rState flips) drifts every caller.
//   - SCN-GROUND-11d-1 (guard) — a pure-body refactor leaves callers FRESH (11b applied at the outcome).
//   - SCN-GROUND-11e-1 (guard) — a FRESH-but-false fact is NOT asserted true: the verdict is the
//                                 structural `Freshness` union, never a boolean/truth value.
//   - SCN-GROUND-11f-1 (happy) — a FRESH verdict RENDERS as "structurally unchanged", never "the claim is true".
//
// The facet is imported DIRECTLY from ../src/freshness.js (the barrel is wired by the lead at SEAL).
// The fold is a PURE structural comparison of a PINNED snapshot vs the CURRENT snapshot — it does NO
// hashing (the subtreeHash / interface-rState compute is the sealed kernel seam / INDEX-12, upstream);
// it only compares already-derived branded values. Held-out `-2` fixtures are NOT read.
//
// [FLAG — simulated freeze digest] The card's `content_hash: <filled-at-freeze>` was never filled and no
// co-located frozen oracle (`src/types.ts`) declares a `freshness` symbol (drift.ts owns `driftDetect`, a SIBLING facet).
// The fold's concrete SHAPE is therefore authored by disciplined judgment against atlas-grounding#ground-11
// + these goldens, binding ONLY pinned types (SubtreeHash/Hash/Freshness, InterfaceRState = Rollup.rState).

import { describe, it, expect } from "vitest"
import { asHash, asSubtreeHash } from "@atlas/kernel"
import type { Freshness } from "@atlas/contracts"
import { freshness, describeFreshness } from "../src/freshness.js"
import type { FreshnessSnapshot, ClosureMember } from "../src/freshness.js"

// ── Fixture vocabulary (transcribed from the goldens' symbolic hashes) ───────────────────────────────
const SH_CALL_01 = asSubtreeHash("sh-call-01") // F_call's own grounding-set subtreeHash
const SH_CALL_02 = asSubtreeHash("sh-call-02") // ... after a real change to the cited unit
const IR_CHG_01 = "ir-chg-01" // callee U_charge INTERFACE rState (signature-level)
const IR_CHG_02 = "ir-chg-02" // ... after a signature/contract change
const SH_CHG_01 = asSubtreeHash("sh-chg-01") // callee U_charge FULL-BODY subtreeHash
const SH_CHG_01R = asSubtreeHash("sh-chg-01r") // ... after a pure-body refactor (interface untouched)
const U_CHARGE = asHash("u-charge") // the callee node (dependency-axis member)

// A closure member: the callee carries BOTH an interface rState (folded) and a full body (never folded).
const chargeMember = (interfaceRState: string, bodySubtreeHash = SH_CHG_01): ClosureMember => ({
  node: U_CHARGE,
  interfaceRState,
  bodySubtreeHash,
})

// F_call pinned at authoring: own hash sh-call-01, forward-closure {U_charge} at interface ir-chg-01.
const PINNED: FreshnessSnapshot = {
  ownSubtreeHashes: [SH_CALL_01],
  closure: [chargeMember(IR_CHG_01)],
}

describe("WP-4.10-b.GROUND — transitive freshness fold (GROUND-11)", () => {
  // SCN-GROUND-11a-1 — freshness folds BOTH own subtreeHash AND closure interface.
  it("folds both own hash and closure interface (11a: FRESH / own-drift / interface-drift)", () => {
    // (i) both unchanged ⇒ FRESH
    expect(freshness(PINNED, PINNED)).toBe<Freshness>("FRESH")
    // (ii) own hash sh-call-01 → sh-call-02 ⇒ DRIFTED (own-fold arm)
    const ownChanged: FreshnessSnapshot = { ...PINNED, ownSubtreeHashes: [SH_CALL_02] }
    expect(freshness(PINNED, ownChanged)).toBe<Freshness>("DRIFTED")
    // (iii) callee interface ir-chg-01 → ir-chg-02 ⇒ DRIFTED (interface-fold arm) — the teeth: an impl
    // that folds ownSubtreeHash alone leaves this FRESH (under-drift).
    const ifaceChanged: FreshnessSnapshot = { ...PINNED, closure: [chargeMember(IR_CHG_02)] }
    expect(freshness(PINNED, ifaceChanged)).toBe<Freshness>("DRIFTED")
  })

  // SCN-GROUND-11b-1 — the callee full-body hash is NOT folded (body-only refactor ⇒ FRESH).
  it("never folds the callee full-body subtreeHash (11b)", () => {
    // callee body sh-chg-01 → sh-chg-01r; interface ir-chg-01 UNCHANGED.
    const bodyOnly: FreshnessSnapshot = { ...PINNED, closure: [chargeMember(IR_CHG_01, SH_CHG_01R)] }
    // The teeth: an impl that folds the callee body over-drifts this to DRIFTED.
    expect(freshness(PINNED, bodyOnly)).toBe<Freshness>("FRESH")
  })

  // SCN-GROUND-11c-1 — a callee signature change drifts every caller.
  it("a callee signature/contract change drifts callers (11c)", () => {
    const sigChanged: FreshnessSnapshot = { ...PINNED, closure: [chargeMember(IR_CHG_02)] }
    expect(freshness(PINNED, sigChanged)).toBe<Freshness>("DRIFTED")
  })

  // SCN-GROUND-11d-1 — a pure-body refactor leaves callers FRESH (11b at the caller outcome).
  it("a pure-body refactor leaves callers FRESH (11d)", () => {
    const bodyRefactor: FreshnessSnapshot = { ...PINNED, closure: [chargeMember(IR_CHG_01, SH_CHG_01R)] }
    expect(freshness(PINNED, bodyRefactor)).toBe<Freshness>("FRESH")
  })

  // A fact with an EMPTY forward closure is unaffected by the closure arm (acceptance §9).
  it("an empty forward closure folds on own hash alone", () => {
    const empty: FreshnessSnapshot = { ownSubtreeHashes: [SH_CALL_01], closure: [] }
    expect(freshness(empty, empty)).toBe<Freshness>("FRESH")
    const emptyDrift: FreshnessSnapshot = { ownSubtreeHashes: [SH_CALL_02], closure: [] }
    expect(freshness(empty, emptyDrift)).toBe<Freshness>("DRIFTED")
  })

  // SCN-GROUND-11e-1 — a FRESH-but-false fact is NOT asserted true: the verdict is the structural
  // `Freshness` union, never a truth value. The teeth: emitting/typing freshness as a boolean truth.
  it("freshness is a structural predicate, never a truth value (11e)", () => {
    const verdict = freshness(PINNED, PINNED)
    expect(verdict).toBe<Freshness>("FRESH") // structurally unchanged...
    expect(typeof verdict).toBe("string") // ...as a `Freshness` string, NOT a boolean
    expect([true, false] as unknown[]).not.toContain(verdict)
    // The rendering never asserts truth, even for a FRESH-but-false claim.
    expect(describeFreshness(verdict).toLowerCase()).not.toContain("the claim is true")
  })

  // SCN-GROUND-11f-1 — a FRESH verdict renders as "structurally unchanged", never "the claim is true".
  it("renders FRESH as structural-unchange, never a truth guarantee (11f)", () => {
    const rendered = describeFreshness("FRESH").toLowerCase()
    expect(rendered).toContain("structurally unchanged")
    expect(rendered).toContain("interface") // "...and its dependencies' interfaces..."
    expect(rendered).not.toContain("true")
    // DRIFTED / STALE also stay purely structural.
    expect(describeFreshness("DRIFTED").toLowerCase()).not.toContain("true")
    expect(describeFreshness("STALE").toLowerCase()).not.toContain("true")
  })
})
