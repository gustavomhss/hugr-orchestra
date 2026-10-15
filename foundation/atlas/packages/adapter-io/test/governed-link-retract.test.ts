// @atlas/adapter-io — test/governed-link-retract.test.ts  (A-D3 / task #83 — the RETRACTION MODE of the door)
//
// `atlas-link --retract` withdraws an asserted `sameAs` equivalence. It is a MODE of the EXISTING governed
// door, so the thing that has to be proved here is not "retraction works" but "retraction is priced exactly
// as assertion is". An asymmetry in this ladder is a governance hole: it would let an actor who could never
// have MADE a merge UNDO one, or — worse in this repo's threat model — let an unratified actor undo a
// billy-ratified one.
//
// The teeth, each naming the mutant it kills:
//   R1 — GATE SYMMETRY. Every one of the door's governance gates refuses a RETRACTION exactly as it refuses
//        an ASSERTION, with the SAME discriminant, over the SAME inputs. Driven as a table so a gate added
//        to one mode and not the other cannot pass.
//   R2 — the T0 leg of that symmetry, spelled out: retracting a link whose merged class contains a `T0`
//        node requires the billy token, exactly as asserting it did.
//   R3 — the pair-state gate: `not-linked` / `already-retracted` / `retracted-pair`, by DISCRIMINANT
//        EQUALITY (never substring — these three reasons discuss each other's concepts).
//
// R4 / R4b / R5 / R6 live in `governed-link-retract-disclosure.test.ts`. The split is a real seam, not an
// arithmetic one: THIS file proves the mode is PRICED like assertion; that one proves it DISCLOSES no more
// than assertion and persists exactly what it claims. A door can charge the right toll and still leak.

import { describe, it, expect } from "vitest"
import { deriveSameAs } from "@atlas/knowledge"
import { reasonOf } from "./door-regression-support.js"
import { addressOf, blindTo, fact, fixture, POLICY } from "./governed-link-support.js"
import type { AtlasPolicy } from "../src/policy.js"
import type { DiskStore } from "../src/store.js"
import { RETRACT_ALREADY_RETRACTED, RETRACT_NOT_LINKED, RETRACT_RETRACTED_PAIR } from "../src/governed-link-retract.js"
import { createGovernedLink } from "../src/governed-link.js"
import type { LinkFixture } from "./governed-link-support.js"

const T2_A = fact({ claim: "alpha", scope: "core", tier: "T2" })
const T2_B = fact({ claim: "beta", scope: "core", tier: "T2" })
const T0_C = fact({ claim: "gamma", scope: "core", tier: "T0" })

/** The scope a fixture row DECLARES (the ADR-0007 carrier the authz gates read). Used to assert the premise
 *  of the class-gate cases below — that the actor really does clear the endpoint gates — instead of assuming
 *  it, which is precisely the assumption that let the class-walk mutant survive. */
function rowScopeOf(fx: LinkFixture, key: string): string | undefined {
  const proj = fx.store.loadProjection()
  return proj?.current.get(key)?.scope
}

/** The door over a fixture, with the actor/ratifier under test. */
function door(fx: LinkFixture, actor: string, ratifyToken: string) {
  return createGovernedLink({ store: fx.store, policy: POLICY, actor, ratifyToken })
}

/** A fixture in which `n0 ≡ n1` has already been ASSERTED through the real door (never hand-written), so a
 *  retraction under test has something real to withdraw. Returns the fixture and its door factory. */
function linked(facts: readonly (typeof T2_A)[] = [T2_A, T2_B]): LinkFixture {
  const fx = fixture(facts)
  const out = door(fx, "alice", "lead").link("n0", "n1")
  expect(out.linked, "setup: the assertion itself must land").toBe(true)
  return fx
}

// ── R1/R2 — GATE SYMMETRY ────────────────────────────────────────────────────────────────────────────────

describe("R1 — every governance gate refuses a RETRACTION exactly as it refuses an ASSERTION", () => {
  // Each row: a name, the door's inputs, and the discriminant BOTH modes must come back with. Driven over
  // {assert, retract} so a gate that exists in one ladder and not the other fails here. Kills the mutant
  // that gives retraction its own (shorter) ladder — the shape that would let an unratified or unauthorized
  // actor undo a merge nobody would have let them make.
  const cases: ReadonlyArray<{
    readonly name: string
    readonly actor: string
    readonly token: string
    readonly a: string
    readonly b: string
    readonly discriminant: string
  }> = [
    {
      name: "DISTINCT",
      actor: "alice",
      token: "lead",
      a: "n0",
      b: "n0",
      discriminant: "sameAs requires two distinct nodes",
    },
    // [task #144] These two used to expect `unknown node`. An absent endpoint is now refused with the
    // ENDPOINT-AUTHZ bytes, because telling the two apart is an existence oracle over keys any caller can
    // name (see `governed-link-endpoint-existence.test.ts`). What this table pins is unchanged and is the
    // point of the file: whatever the refusal is, RETRACTING gets the identical one — the fold did not give
    // the retraction mode a different ladder.
    { name: "ENDPOINT (b absent)", actor: "alice", token: "lead", a: "n0", b: "n-nope", discriminant: "unauthorized" },
    { name: "ENDPOINT (a absent)", actor: "alice", token: "lead", a: "n-nope", b: "n1", discriminant: "unauthorized" },
    {
      name: "AUTHZ (actor outside both scopes)",
      actor: "mallory",
      token: "lead",
      a: "n0",
      b: "n1",
      discriminant: "unauthorized",
    },
    {
      name: "AUTHZ (empty actor — fail-closed)",
      actor: "",
      token: "lead",
      a: "n0",
      b: "n1",
      discriminant: "unauthorized",
    },
    { name: "RATIFY (empty ratifier)", actor: "alice", token: "", a: "n0", b: "n1", discriminant: "unratified" },
  ]

  for (const c of cases) {
    it(`${c.name} — identical discriminant on assert and on retract`, () => {
      const seen: Record<string, string> = {}
      for (const retract of [false, true]) {
        // A FRESH fixture per mode: the assertion mode must not be judged against a store the retraction
        // mode already touched (and vice versa).
        const fx = fixture([T2_A, T2_B])
        const out = door(fx, c.actor, c.token).link(c.a, c.b, retract)
        expect(out.linked, `${c.name} / retract=${String(retract)} must be refused`).toBe(false)
        expect(fx.persists(), `${c.name} / retract=${String(retract)} persists nothing`).toHaveLength(0)
        seen[String(retract)] = reasonOf(out.rejected)
      }
      expect(seen["false"]).toBe(c.discriminant) // assertion: the shipped refusal
      expect(seen["true"]).toBe(seen["false"]) // retraction: byte-identical discriminant
    })
  }
})

// ── R1b — THE CLASS-AUTHZ GATE, IN RETRACT MODE (the blocker a cold review found) ─────────────────────────
//
// WHY THIS EXISTS, STATED AS THE MISS IT WAS. Every AUTHZ row in the R1 table above uses `mallory` or `''` —
// actors with authority over NEITHER endpoint. They are refused by the ENDPOINT leg (`governed-link.ts` gate
// 3) and NEVER REACH the class walk (gate 3.5). So mutating the class walk to `!retract && !members.every(…)`
// survived the ENTIRE suite — 1981 tests, the blackbox stories, `tsc -b` and all five gates — while opening
// exactly the hole the door's own header names: an actor undoing a merge she could never have made, across a
// scope she has no authority in.
//
// It is the M8 finding ONE GATE FURTHER IN. R4b patched the endpoint gate and then also only probed the
// endpoint gate. What was missing in both cases is an actor who CLEARS the gates in front and is judged by
// the one under test. That is the shape below, and it is the shape to reach for whenever a ladder is added to.
//
// THE EXPLOIT the clean code refuses: policy `{core:[alice,eve], other:[alice,eve], vault:[alice]}`, class
// `n0(core) ~ n1(other) ~ n2(vault)` built by alice. eve is authorized on BOTH endpoints she names (n0, n1)
// and on NEITHER the class member n2 nor its scope. Under the mutant her retraction lands and the class
// collapses `{n0,n1,n2}` → `{n1,n2}` — she has destroyed an equivalence inside `vault` without ever holding
// `vault`.

/** THREE scopes: alice holds all of them; eve holds the two ENDPOINT scopes and NOT `vault`. */
const THREE_SCOPE: AtlasPolicy = {
  ...POLICY,
  authz: { scopes: { core: ["alice", "eve"], other: ["alice", "eve"], vault: ["alice"] } },
}
const CORE_NODE = fact({ claim: "alpha", scope: "core", tier: "T2" }) //  n0 — endpoint, eve authorized
const OTHER_NODE = fact({ claim: "mu", scope: "other", tier: "T2" }) //   n1 — endpoint, eve authorized
const VAULT_NODE = fact({ claim: "psi", scope: "vault", tier: "T2" }) //  n2 — CLASS ONLY, eve is a stranger

/** The class `n0 ~ n1 ~ n2`, built by alice through the REAL door (never a hand-seeded `edges` map), so the
 *  membership the gate walks is membership the product actually produced. */
function threeScopeClass(): LinkFixture {
  const fx = fixture([CORE_NODE, OTHER_NODE, VAULT_NODE])
  const alice = createGovernedLink({ store: fx.store, policy: THREE_SCOPE, actor: "alice", ratifyToken: "lead" })
  expect(alice.link("n0", "n1").linked, "setup: alice links the two endpoints").toBe(true)
  expect(alice.link("n1", "n2").linked, "setup: alice pulls the vault node into the class").toBe(true)
  return fx
}

describe("R1b — an actor who CLEARS both endpoint gates is still judged on CLASS membership, in BOTH modes", () => {
  it("eve, authorized on both ENDPOINTS but not on a CLASS member, is refused — identically on assert and retract", () => {
    for (const retract of [false, true]) {
      const fx = threeScopeClass()
      const persistedBefore = fx.persists().length
      const eve = createGovernedLink({ store: fx.store, policy: THREE_SCOPE, actor: "eve", ratifyToken: "lead" })

      // Premise, asserted rather than assumed: eve really does clear the ENDPOINT gates. If she did not,
      // this case would be a duplicate of R1's `unauthorized` row and would prove nothing about gate 3.5.
      expect(rowScopeOf(fx, "n0"), "premise: n0 is in a scope eve holds").toBe("core")
      expect(rowScopeOf(fx, "n1"), "premise: n1 is in a scope eve holds").toBe("other")
      expect(THREE_SCOPE.authz.scopes["core"]).toContain("eve")
      expect(THREE_SCOPE.authz.scopes["other"]).toContain("eve")
      expect(THREE_SCOPE.authz.scopes["vault"] ?? []).not.toContain("eve")

      const out = eve.link("n0", "n1", retract)
      expect(out.linked, `retract=${String(retract)} must be refused on the CLASS gate`).toBe(false)
      expect(reasonOf(out.rejected)).toBe("unauthorized")
      expect(fx.persists(), "a refused act publishes nothing").toHaveLength(persistedBefore)
    }
  })

  it("ANTI-VACUITY: the very same retraction LANDS for alice, who does hold the class member's scope", () => {
    // Without this, the case above could pass because the retraction is refused for EVERYONE — e.g. because
    // the fixture never built the class, or because retraction is broken here — rather than because eve
    // lacks `vault`. It also pins the exploit's payload: the class really does collapse when it is allowed to.
    const fx = threeScopeClass()
    const alice = createGovernedLink({ store: fx.store, policy: THREE_SCOPE, actor: "alice", ratifyToken: "lead" })
    const out = alice.link("n0", "n1", true)
    expect(out).toEqual({ linked: true, a: "n0", b: "n1", retracted: true })

    const published = fx.persists()[fx.persists().length - 1]!
    expect(published.current.get("n0")?.sameAsRetracted).toEqual(["n1"])
    expect(deriveSameAs(published).map((e) => `${e.a}=${e.b}`)).toEqual(["n1=n2"]) // {n0,n1,n2} → {n1,n2}
  })

  it("the ENDPOINT read-back gate is reached before the class walk — pruned endpoint bytes ≠ a class refusal", () => {
    // The twin miss, and the mutant it kills: `!retract && (factA === undefined || …)` at gate 3.25 also
    // survives the whole suite, caught only incidentally by `tsc -b` (the guard narrows `factA`/`factB` for
    // the tier join). It needs an actor who clears the endpoint AUTHZ gate and then fails TWO different
    // gates depending on the order — which is exactly eve with one endpoint's bytes pruned:
    //   · clean  ⇒ gate 3.25 fires on the pruned ENDPOINT  ⇒ `unverifiable endpoint`
    //   · mutant ⇒ gate 3.25 skipped, class AUTHZ fires    ⇒ `unauthorized`
    // Two discriminants, one input: the ordering is observable, so it can be pinned.
    for (const retract of [false, true]) {
      const fx = threeScopeClass()
      const eve = createGovernedLink({
        store: blindTo(fx.store, addressOf(CORE_NODE)), // n0's bytes are gone — an endpoint eve DOES hold
        policy: THREE_SCOPE,
        actor: "eve",
        ratifyToken: "lead",
      })
      const out = eve.link("n0", "n1", retract)
      expect(out.linked).toBe(false)
      expect(reasonOf(out.rejected), `retract=${String(retract)}`).toBe("unverifiable endpoint")
    }
  })
})

describe("R2 — the T0 leg: retracting a link into a T0 class needs billy, exactly as asserting it did", () => {
  it("a non-billy ratifier can neither ASSERT nor RETRACT across a T0 class", () => {
    // `n2` is the T0 node. Asserting n0≡n2 needs billy (the class join is T0); so must withdrawing it.
    // Kills the mutant that skips `strictestTier`/`ratify` in the retract branch — the asymmetry that would
    // let any non-empty ratifier undo a merge only billy could have made.
    const fx = fixture([T2_A, T2_B, T0_C])
    expect(door(fx, "alice", "lead").link("n0", "n2").linked).toBe(false) // assert refused
    expect(reasonOf(door(fx, "alice", "lead").link("n0", "n2").rejected)).toBe("unratified")

    const withBilly = door(fx, "alice", "billy")
    expect(withBilly.link("n0", "n2").linked).toBe(true) // billy CAN assert it

    // and now the whole point: `lead` must NOT be able to take it back.
    const out = door(fx, "alice", "lead").link("n0", "n2", true)
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unratified")

    // …while billy can. (Without this the case above would also pass on a door that refuses ALL retractions.)
    const undone = withBilly.link("n0", "n2", true)
    expect(undone.linked).toBe(true)
    expect(undone.retracted).toBe(true)
  })

  it("the TRANSITIVE leg: a T0 node reached only through the CLASS still forces billy on a retraction", () => {
    // billy links the T2 `n1` to the T0 `n2`, then alice links n0≡n1 (billy-signed, since the class is now
    // T0). Retracting n0≡n1 touches a class containing a T0 node THROUGH n1 — the two-hop shape the door's
    // class-wide tier join exists for. Kills a mutant that prices a retraction on the two ENDPOINTS' tiers.
    const fx = fixture([T2_A, T2_B, T0_C])
    expect(door(fx, "alice", "billy").link("n1", "n2").linked).toBe(true)
    expect(door(fx, "alice", "billy").link("n0", "n1").linked).toBe(true)

    const out = door(fx, "alice", "lead").link("n0", "n1", true) // neither endpoint is itself T0
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unratified")
  })
})

// ── R3 — the pair-state gate ─────────────────────────────────────────────────────────────────────────────

describe("R3 — the pair-state gate, by DISCRIMINANT EQUALITY", () => {
  it("retracting a pair that was NEVER asserted is refused `not-linked`, and persists nothing", () => {
    // Refusal, not a no-op success: accepting it would durably record the withdrawal of an assertion nobody
    // made, AND would pre-emptively latch the pair so a later legitimate link could never merge it.
    const fx = fixture([T2_A, T2_B])
    const out = door(fx, "alice", "lead").link("n0", "n1", true)
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe(RETRACT_NOT_LINKED)
    expect(fx.persists()).toHaveLength(0)
  })

  it("retracting an ALREADY-retracted pair is refused `already-retracted`, and persists nothing", () => {
    const fx = linked()
    expect(door(fx, "alice", "lead").link("n0", "n1", true).linked).toBe(true) // first retraction lands
    const persistsAfterFirst = fx.persists().length

    const out = door(fx, "alice", "lead").link("n0", "n1", true)
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe(RETRACT_ALREADY_RETRACTED)
    expect(fx.persists()).toHaveLength(persistsAfterFirst) // nothing further published
  })

  it("RE-ASSERTING a retracted pair is refused `retracted-pair` — the door never reports a no-op as a win", () => {
    // THE branch that would otherwise make the door lie. `linkSameAs`'s `withPeer` is idempotent and a
    // retraction never removes the peer from `sameAs`, so WITHOUT this gate a re-link is a structural no-op
    // reported as `linked:true` while `deriveSameAs` goes on ignoring the edge. Delete the gate and this
    // goes red on the `linked` assertion — the mutant is not equivalent.
    const fx = linked()
    expect(door(fx, "alice", "lead").link("n0", "n1", true).linked).toBe(true)
    const persistsAfterRetract = fx.persists().length

    const out = door(fx, "alice", "lead").link("n0", "n1") // assert mode, retracted pair
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe(RETRACT_RETRACTED_PAIR)
    expect(fx.persists()).toHaveLength(persistsAfterRetract)
  })

  it("THE ASYMMETRY, PINNED: re-asserting an ALREADY-ASSERTED pair still succeeds and republishes", () => {
    // This case exists because a cold review caught the refusal above being justified by a rule the code does
    // not keep — "`linked:true` means this act changed the stored relation". It does not. Measured here so
    // the corrected comment in `governed-link-retract.ts` cannot drift back into the false version: the
    // assert path is IDEMPOTENT-SUCCESS and publishes a fresh, byte-identical generation each time.
    //
    // The behaviour is deliberately UNCHANGED (aligning the two paths is a behaviour change to a governed
    // door, and is a follow-up decision, not a comment fix). What this pins is that the two paths DIFFER, and
    // that the difference is a recorded choice rather than an accident nobody measured.
    const fx = linked()
    const before = fx.persists().length
    for (let i = 0; i < 3; i++) {
      expect(door(fx, "alice", "lead").link("n0", "n1")).toEqual({ linked: true, a: "n0", b: "n1" })
    }
    expect(fx.persists()).toHaveLength(before + 3) // three redundant re-links ⇒ three published generations
    const all = fx.persists()
    const bytes = (p: (typeof all)[number]): string => JSON.stringify([...p.current])
    expect(bytes(all[all.length - 1]!)).toBe(bytes(all[all.length - 2]!)) // …each byte-identical to the last
  })

  it("the three pair-state discriminants are mutually DISTINCT and none is a prefix of another", () => {
    // Anti-vacuity for every `reasonOf(...) === <discriminant>` assertion above: if two of these collapsed,
    // the cases would pass while the door reported the wrong thing.
    const all = [RETRACT_NOT_LINKED, RETRACT_ALREADY_RETRACTED, RETRACT_RETRACTED_PAIR]
    expect(new Set(all).size).toBe(3)
    for (const x of all) for (const y of all) if (x !== y) expect(x.startsWith(y)).toBe(false)
  })
})
