// @atlas/adapter-io — test/governed-link-retract-disclosure.test.ts  (A-D3 / task #83)
//
// SPLIT OUT OF `governed-link-retract.test.ts`, and the reason is worth recording because the seam is real
// rather than arithmetic. That file proves the retraction mode is PRICED like the assertion mode — the gate
// ladder, the T0 leg, the pair-state discriminants. This one proves the mode DISCLOSES no more than the
// assertion mode, and persists exactly what it claims to. Pricing and disclosure are different failure
// classes: a door can charge the right toll and still leak, and it can refuse correctly and still write.
//
//   R4  — PRECEDENCE: the pair state is never disclosed before the governance gates are cleared.
//   R4b — the ENDPOINT authz gate is a DISCLOSURE gate in the retract mode too (added after a surviving
//         mutant; the note in the block below is the record of that, kept deliberately).
//   R5  — APPEND, NEVER DELETE: what the door persists keeps the assertion AND the retraction.
//   R6  — a refused retraction persists NOTHING.
//
// The split was forced by the 400-LOC ceiling, which `godfile-guard` could not see while the file was still
// untracked — recorded in task #141, because a gate blind to new files is blind exactly while a file is
// being written.

import { describe, it, expect } from "vitest"
import { reasonOf } from "./door-regression-support.js"
import { addressOf, blindTo, fact, fixture, POLICY } from "./governed-link-support.js"
import type { AtlasPolicy } from "../src/policy.js"
import type { DiskStore } from "../src/store.js"
import { RETRACT_NOT_LINKED } from "../src/governed-link-retract.js"
import { createGovernedLink } from "../src/governed-link.js"
import type { LinkFixture } from "./governed-link-support.js"

const T2_A = fact({ claim: "alpha", scope: "core", tier: "T2" })
const T2_B = fact({ claim: "beta", scope: "core", tier: "T2" })

/** The door over a fixture, with the actor/ratifier under test. */
function door(fx: LinkFixture, actor: string, ratifyToken: string) {
  return createGovernedLink({ store: fx.store, policy: POLICY, actor, ratifyToken })
}

/** A fixture in which `n0 ≡ n1` has already been ASSERTED through the real door (never hand-written), so a
 *  retraction under test has something real to withdraw. */
function linked(facts: readonly (typeof T2_A)[] = [T2_A, T2_B]): LinkFixture {
  const fx = fixture(facts)
  const out = door(fx, "alice", "lead").link("n0", "n1")
  expect(out.linked, "setup: the assertion itself must land").toBe(true)
  return fx
}

// ── R4 — precedence: the pair state is not an oracle ──────────────────────────────────────────────────────

describe("R4 — PRECEDENCE: the pair state is never disclosed before the governance gates are cleared", () => {
  it("an UNAUTHORIZED caller retracting an unasserted pair learns `unauthorized`, not `not-linked`", () => {
    // Whether {a,b} is linked is a fact about the stored relation. Answering it before authz would hand a
    // caller a probe over pairs it has no authority on, at keys it can name freely — the same one-bit
    // oracle the door's 3-before-3.25 rule exists to close. Kills a mutant that hoists gate 4.5.
    const fx = fixture([T2_A, T2_B])
    const out = door(fx, "mallory", "lead").link("n0", "n1", true)
    expect(reasonOf(out.rejected)).toBe("unauthorized")
    expect(reasonOf(out.rejected)).not.toBe(RETRACT_NOT_LINKED)
  })

  it("an UNRATIFIED caller retracting an unasserted pair learns `unratified`, not `not-linked`", () => {
    const fx = fixture([T2_A, T2_B])
    const out = door(fx, "alice", "").link("n0", "n1", true)
    expect(reasonOf(out.rejected)).toBe("unratified")
  })

  it("an UNAUTHORIZED caller RE-ASSERTING a retracted pair learns `unauthorized`, not `retracted-pair`", () => {
    const fx = linked()
    expect(door(fx, "alice", "lead").link("n0", "n1", true).linked).toBe(true)
    const out = door(fx, "mallory", "lead").link("n0", "n1")
    expect(reasonOf(out.rejected)).toBe("unauthorized")
  })
})

// ── R4b — the ENDPOINT authz gate is a DISCLOSURE gate in the RETRACT mode too ────────────────────────────
//
// ADDED AFTER A SURVIVING MUTANT, and recorded as such rather than quietly slipped in. The first battery ran
// `!retract && (!rowAuthorized(a) || !rowAuthorized(b))` — i.e. "the retract path skips the ENDPOINT authz
// gate" — and the whole suite above stayed GREEN (35/35). It was not an equivalent mutant: the CLASS authz
// walk at 3.5 still refuses an out-of-scope caller, so the `unauthorized` verdict survived and every
// assertion I had was satisfied. What did NOT survive is the ORDERING the door's header calls a gate: with
// the endpoint check gone, a stranger reaches the 3.25 CAS read-back and is handed `unverifiable endpoint`
// when the bytes are pruned and `unauthorized` when they are healthy — a one-bit storage-health oracle over
// a node it may not touch, at a key it can name freely (SCN-GL-14 / CARRIER-5, and the reason gate 3 runs
// before gate 3.25 at all). My R1 table could not see it because it only ever probed a HEALTHY store.
//
// So this is the retract-mode twin of SCN-GL-15/16/17, and it is the case that kills that mutant.

/** alice holds BOTH scopes (the anti-vacuity witness); mallory holds `other` only — legitimately authorized
 *  over her OWN node and a total stranger to alice's. */
const TWO_SCOPE: AtlasPolicy = { ...POLICY, authz: { scopes: { core: ["alice"], other: ["mallory", "alice"] } } }
const ALICE_NODE = fact({ claim: "alpha", scope: "core", tier: "T2" }) // n0 — mallory has NO authority here
const MALLORY_NODE = fact({ claim: "mu", scope: "other", tier: "T2" }) // n1 — mallory IS in scope here

/** THE ADVERSARY'S INSTRUMENT, in RETRACT mode: mallory names two keys and reads the refusal BYTES back. If
 *  the two byte-states of the store yield two different buffers she has learned one bit about a node she may
 *  not touch. `billy` so the ratify gate can never be what refuses her. */
function retractProbe(store: DiskStore, a: string, b: string): Buffer {
  const door = createGovernedLink({ store, policy: TWO_SCOPE, actor: "mallory", ratifyToken: "billy" })
  const out = door.link(a, b, true)
  expect(out.linked).toBe(false) // the write must never land either
  return Buffer.from(out.rejected ?? "", "utf8")
}

describe("R4b — a RETRACTION discloses no more storage health than an assertion does", () => {
  for (const [name, first, second] of [
    ["endpoint A out of reach", "n0", "n1"],
    ["endpoint B out of reach (the mirror)", "n1", "n0"],
  ] as const) {
    it(`${name}: the refusal is byte-identical whether or not the stranger's endpoint is pruned`, () => {
      const fx = fixture([ALICE_NODE, MALLORY_NODE])
      const healthy = retractProbe(fx.store, first, second)
      const pruned = retractProbe(blindTo(fx.store, addressOf(ALICE_NODE)), first, second)

      expect(healthy.length).toBeGreaterThan(0) // anti-vacuity: two EMPTY buffers also compare equal
      expect(reasonOf(healthy.toString("utf8"))).toBe("unauthorized")
      // Discriminant first, so a failure reads as the oracle it is rather than as a byte-count diff.
      expect(reasonOf(pruned.toString("utf8"))).toBe(reasonOf(healthy.toString("utf8")))
      expect(Buffer.compare(healthy, pruned)).toBe(0) // …and not one BYTE of the prose differs either
      expect(fx.persists()).toHaveLength(0)
    })
  }

  it("ANTI-VACUITY: the pruned state IS observable in retract mode, to the actor entitled to observe it", () => {
    // Without this, the two cases above could pass because the prune never took effect — i.e. because the
    // two byte-states are indistinguishable to EVERYONE — rather than because the gate withholds the
    // difference from a stranger. alice holds both scopes, so she has earned the honest storage answer.
    const fx = fixture([ALICE_NODE, MALLORY_NODE])
    const alice = createGovernedLink({
      store: blindTo(fx.store, addressOf(ALICE_NODE)),
      policy: TWO_SCOPE,
      actor: "alice",
      ratifyToken: "billy",
    })
    const out = alice.link("n0", "n1", true)
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unverifiable endpoint") // ≠ the `unauthorized` mallory was handed
  })
})

// ── R5/R6 — what actually lands ──────────────────────────────────────────────────────────────────────────

describe("R5 — a landed retraction is an APPEND: both the assertion and the withdrawal survive", () => {
  it("the PERSISTED projection keeps `sameAs` and adds `sameAsRetracted`, symmetrically", () => {
    // Asserted against what the DOOR published, not against the pure reducer — a reducer-level fix never
    // exercised through the composed decision has not been shown to hold where it has to.
    const fx = linked()
    const out = door(fx, "alice", "lead").link("n0", "n1", true)
    expect(out).toEqual({ linked: true, a: "n0", b: "n1", retracted: true })

    const published = fx.persists()[fx.persists().length - 1]!
    expect(published.current.get("n0")?.sameAs).toEqual(["n1"]) // the assertion is still on the row
    expect(published.current.get("n1")?.sameAs).toEqual(["n0"])
    expect(published.current.get("n0")?.sameAsRetracted).toEqual(["n1"]) // and so is the withdrawal
    expect(published.current.get("n1")?.sameAsRetracted).toEqual(["n0"])
  })

  it("an ASSERTION still returns the pre-existing record shape — `retracted` is ABSENT, not false", () => {
    // Back-compat: every existing consumer of `LinkOut` reads byte-identical bytes on the assert path.
    const fx = fixture([T2_A, T2_B])
    expect(door(fx, "alice", "lead").link("n0", "n1")).toEqual({ linked: true, a: "n0", b: "n1" })
  })
})

describe("R6 — every refused retraction persists NOTHING", () => {
  it("across the whole refusal vocabulary, the store is never written", () => {
    for (const [actor, token, a, b] of [
      ["alice", "lead", "n0", "n0"],
      ["alice", "lead", "n0", "n-nope"],
      ["mallory", "lead", "n0", "n1"],
      ["alice", "", "n0", "n1"],
      ["alice", "lead", "n0", "n1"], // not-linked
    ] as const) {
      const fx = fixture([T2_A, T2_B])
      expect(door(fx, actor, token).link(a, b, true).linked).toBe(false)
      expect(fx.persists(), `${actor}/${token}/${a}/${b}`).toHaveLength(0)
    }
  })
})
