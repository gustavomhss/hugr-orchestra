// @atlas/adapter-io — test/governed-link-endpoint-authz.test.ts  (WP-SAMEAS — the ENDPOINT authz gate)
//
// ── WHY THIS FILE EXISTS: A NAMED MUTANT THAT DID NOT HOLD ──────────────────────────────────────────────
// `governed-link.ts` gate 3 is a CONJUNCTION — `!rowAuthorized(a) || !rowAuthorized(b)` — and SCN-GL-3 in
// `governed-link.test.ts` carried this comment above it:
//
//     "TEETH: drop EITHER half of the both-endpoints authz check and a one-sided actor links across scopes."
//
// MEASURED, one half at a time, against the FULL suite: 221 files / 1614 tests / exit 0, BOTH times. The
// comment was wrong twice over, and each error is worth stating separately because they call for different
// repairs.
//
//   WRONG IN FIXTURE — SCN-GL-3's mallory is in NEITHER endpoint's scope, so whichever half of the
//     conjunction survives still fires on her. That case cannot detect a one-sided gate by construction; no
//     amount of assertion strengthening inside it would have helped. A one-sided GATE needs a one-sided
//     ACTOR, which needs TWO SCOPES, and no fixture in the suite had one. That is what this file builds.
//
//   WRONG IN KIND — a one-sided actor does NOT "link across scopes" even with a half deleted. Measured:
//     `linked` stays `false` and nothing persists under both mutants. The class walk at gate 3.5 re-checks
//     `rowAuthorized` over every CURRENT member of the merged class, and `sameAsClassOf` includes its own
//     argument, so both endpoints are ALWAYS re-covered. The endpoint gate is `linked`-EQUIVALENT.
//
// SO IS THE GATE DEAD CODE? NO — and the door's own header already says why, which is how the true mutant
// was found. "A refusal may never tell the caller more about nodes it has no authority over than the gates
// it already CLEARED entitle it to." The endpoint gate is a DISCLOSURE gate: it runs BEFORE the 3.25 CAS
// read-back so an unauthorized caller is answered from the ROWS alone. Delete a half and the caller walks
// into the read-back holding an endpoint it was never checked against — and the refusal it gets back then
// depends on whether THAT endpoint's bytes are still in CAS. That is a 1-bit storage-health oracle over
// someone else's node, at keys the caller can enumerate freely: exactly the leak ADR-0007 exists to close,
// and exactly what CARRIER-4 / CARRIER-5 pin for a caller who is a stranger to BOTH endpoints.
//
// DELETING THE WHOLE CONJUNCTION was already caught — but NOT, as reported, by SCN-GL-14. Measured:
// SCN-GL-14 stays GREEN under the full deletion, because it prunes a CLASS MEMBER, and the class walk runs
// its own authz-before-bytes ordering that keeps that case honest without the endpoint gate. What actually
// dies is CARRIER-5 and CARRIER-8 — the two cases that prune an ENDPOINT and compare the stranger's refusal
// bytes across both storage states. They are this file's direct ancestors, and they are ALSO the reason the
// one-sided mutants survived: their mallory is a stranger to BOTH endpoints, so either surviving half of the
// conjunction still fires on her. Strangers-to-both cannot see a one-sided gate. Hence: two scopes.
//
// One case per half, because one refusal point per endpoint is the header's own claim:
//   SCN-GL-15 kills the `a`-half — mallory holds B's scope, not A's.
//   SCN-GL-16 kills the `b`-half — mallory holds A's scope, not B's.
// Neither case kills the other's mutant (verified), which is the point: a single case here would leave one
// endpoint unpinned all over again, in precisely the way SCN-GL-2's missing mirror did.

import { describe, it, expect } from "vitest"
import { reasonOf } from "./door-regression-support.js"
import { addressOf, blindTo, fact, fixture, POLICY } from "./governed-link-support.js"
import { createGovernedLink } from "../src/governed-link.js"
import type { DiskStore } from "../src/store.js"
import type { AtlasPolicy } from "../src/policy.js"

// ── the TWO-SCOPE, ONE-SIDED fixture ─────────────────────────────────────────────────────────────────
//
// alice holds BOTH scopes (so she is the anti-vacuity witness: someone entitled to the honest storage
// answer). mallory holds `other` ONLY — she is legitimately authorized over her OWN node and a total
// stranger to alice's, which is the actor shape the whole suite was missing.
const TWO_SCOPE: AtlasPolicy = {
  ...POLICY,
  authz: { scopes: { core: ["alice"], other: ["mallory", "alice"] } },
}

const ALICE_NODE = fact({ claim: "alpha", scope: "core", tier: "T2" }) //  n0 — mallory has NO authority here
const MALLORY_NODE = fact({ claim: "mu", scope: "other", tier: "T2" }) //  n1 — mallory IS in scope here

/** THE ADVERSARY'S INSTRUMENT. mallory names two keys and reads the refusal back. The value returned is the
 *  full refusal BYTES — if the two byte-states of the store yield two different buffers, she has read one
 *  bit about a node she may not touch, and the door has an oracle. */
function probeBytes(store: DiskStore, a: string, b: string): Buffer {
  const door = createGovernedLink({ store, policy: TWO_SCOPE, actor: "mallory", ratifyToken: "billy" })
  const out = door.link(a, b)
  // The write must never land either — recorded here so the LINKED-equivalence claim above is measured by
  // this file rather than asserted in a comment. (Under both mutants this stays false: the class walk.)
  expect(out.linked).toBe(false)
  return Buffer.from(out.rejected ?? "", "utf8")
}

describe("WP-SAMEAS — the endpoint authz gate is a DISCLOSURE gate, one refusal point per endpoint", () => {
  it("SCN-GL-15 — a one-sided actor learns NOTHING about endpoint A's storage (kills the `a` half)", () => {
    const fx = fixture([ALICE_NODE, MALLORY_NODE])
    // mallory links alice's node (A = n0, out of her reach) to her own (B = n1, in her scope). The `a` half
    // of the conjunction is the ONLY thing standing between her and the 3.25 read-back.
    const healthy = probeBytes(fx.store, "n0", "n1")
    const pruned = probeBytes(blindTo(fx.store, addressOf(ALICE_NODE)), "n0", "n1")

    expect(healthy.length).toBeGreaterThan(0) // anti-vacuity: two empty buffers also compare equal
    // THE MUTANT DIES HERE. With `!rowAuthorized(deps, nodeA, factA)` dropped, mallory clears the endpoint
    // gate on B alone, reaches 3.25 with A's bytes missing, and is handed `unverifiable endpoint` — while
    // the healthy store hands her `unauthorized` from the class walk. Two states, two strings, one bit.
    expect(reasonOf(healthy.toString("utf8"))).toBe("unauthorized")
    // The DISCRIMINANT comparison first, so a failure here reads as the oracle it is
    // (`expected 'unverifiable endpoint' to be 'unauthorized'`) rather than as `-1 is not +0`.
    expect(reasonOf(pruned.toString("utf8"))).toBe(reasonOf(healthy.toString("utf8")))
    expect(Buffer.compare(healthy, pruned)).toBe(0) // …and not one BYTE of the prose differs either
    expect(fx.persists()).toHaveLength(0) // and no probe ever wrote anything
  })

  it("SCN-GL-16 — …and NOTHING about endpoint B's storage either (kills the `b` half)", () => {
    const fx = fixture([ALICE_NODE, MALLORY_NODE])
    // The MIRROR: the same two nodes, named the other way round, so alice's node is now the SECOND endpoint.
    // SCN-GL-15 cannot see this one — with the `b` half dropped, the surviving `a` half checks mallory's own
    // node in SCN-GL-15's ordering and passes, but here it checks alice's node and fires. Two cases, or one
    // endpoint stays unpinned.
    const healthy = probeBytes(fx.store, "n1", "n0")
    const pruned = probeBytes(blindTo(fx.store, addressOf(ALICE_NODE)), "n1", "n0")

    expect(healthy.length).toBeGreaterThan(0)
    expect(reasonOf(healthy.toString("utf8"))).toBe("unauthorized")
    expect(reasonOf(pruned.toString("utf8"))).toBe(reasonOf(healthy.toString("utf8")))
    expect(Buffer.compare(healthy, pruned)).toBe(0)
    expect(fx.persists()).toHaveLength(0)
  })

  it("SCN-GL-17 — ANTI-VACUITY: the pruned state IS observable, to the actor entitled to observe it", () => {
    // Without this, SCN-GL-15/16 could pass because the two byte-states are indistinguishable to EVERYONE —
    // i.e. because the prune never took effect — rather than because the gate withholds the difference. It
    // is the SCN-GL-7 distinction, and it is what makes the byte-comparison above a security property rather
    // than an accident of the fixture.
    const fx = fixture([ALICE_NODE, MALLORY_NODE])
    const blindStore = blindTo(fx.store, addressOf(ALICE_NODE))
    const alice = createGovernedLink({ store: blindStore, policy: TWO_SCOPE, actor: "alice", ratifyToken: "billy" })

    // alice holds BOTH scopes, so she has cleared the endpoint gate and is entitled to the honest, actionable
    // storage answer — a pruned CAS is not a policy gap an admin should try to fix by granting a scope.
    const owner = alice.link("n0", "n1")
    expect(owner.linked).toBe(false)
    expect(reasonOf(owner.rejected)).toBe("unverifiable endpoint")

    // …and that string is NOT the one mallory was handed for the very same store. The oracle exists; the
    // gate is what keeps it on the authorized side of the door.
    const strangerSaw = probeBytes(blindStore, "n0", "n1")
    expect(reasonOf(strangerSaw.toString("utf8"))).not.toBe(reasonOf(owner.rejected))
    expect(Buffer.compare(Buffer.from(owner.rejected ?? "", "utf8"), strangerSaw)).not.toBe(0)

    // CONTROL — the gate is MEMBERSHIP, not a blanket ban: on the HEALTHY store alice's link is hers to make,
    // so neither refusal above is an over-block masquerading as a control.
    const fx2 = fixture([ALICE_NODE, MALLORY_NODE])
    const healthyAlice = createGovernedLink({
      store: fx2.store,
      policy: TWO_SCOPE,
      actor: "alice",
      ratifyToken: "billy",
    })
    expect(healthyAlice.link("n0", "n1").linked).toBe(true)
    expect(fx2.persists()).toHaveLength(1)
    expect(fx.persists()).toHaveLength(0)
  })
})
