// @atlas/adapter-io — test/governed-link.test.ts  (WP-SAMEAS — the governed sameAs write door)
//
// The SECOND governed write door had NO unit test: it was covered only end-to-end (s16-sameas.blackbox),
// which exercises the happy path through a real CLI and cannot plant a gate-level mutant. A governed write
// door with no gate-level teeth is a door nobody can prove is shut, so these cases pin all five gates with a
// fake DiskStore + a literal policy, each with the mutant it kills named.
//
// The tier gate (task #84) is the one that was DEFERRED here while emit ran it: a `sameAs` was signed by any
// non-empty ratifier even when an endpoint was a billy-ratified `T0` node. `sameAs` being non-destructive was
// the reason given, but "non-destructive" is not "ungoverned" — the edge is symmetric and read-side folds
// walk it, so a link is a way to reach a T0 node. The door now runs the SAME KNOW-8 law emit runs, over the
// JOIN of the two endpoints' tiers.

import { describe, it, expect } from "vitest"
import { reasonOf } from "./door-regression-support.js"
import { addressOf, blindTo, fact, fixture, POLICY } from "./governed-link-support.js"
import type { AdvisoryNode } from "@atlas/knowledge"
import { createGovernedLink } from "../src/governed-link.js"
import type { DiskStore } from "../src/store.js"
import type { AtlasPolicy } from "../src/policy.js"

// ── fixture ──────────────────────────────────────────────────────────────────────────────────────────
// The builders live in `governed-link-support.ts` (see its header). `POLICY`: alice owns `core`, mallory
// owns `other`.

const T2_A = fact({ claim: "alpha", scope: "core", tier: "T2" })
const T2_B = fact({ claim: "beta", scope: "core", tier: "T2" })
const T0_C = fact({ claim: "gamma", scope: "core", tier: "T0" })

// ── cases ────────────────────────────────────────────────────────────────────────────────────────────

describe("WP-SAMEAS — createGovernedLink (distinct · both-known · class read-back · authz · KNOW-8 ratify)", () => {
  it("SCN-GL-1 — a node never names itself", () => {
    const fx = fixture([T2_A, T2_B])
    const { link } = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "lead" })
    const out = link("n0", "n0")
    expect(out.linked).toBe(false)
    // DISCRIMINANT EQUALITY, not a substring. This reason carries no `:`, so the discriminant IS the whole
    // string; pinned literally so a mutant that swaps it for another door's refusal cannot pass by sharing a
    // word with it. (See `reasonOf`: refusal prose quotes OTHER refusals by name, which makes `toContain`
    // vacuous in one direction.)
    expect(reasonOf(out.rejected)).toBe("sameAs requires two distinct nodes")
    expect(fx.persists()).toHaveLength(0)
  })

  // ── THE ENDPOINT-EXISTENCE FOLD LIVES IN ITS OWN FILE (task #144) ───────────────────────────────────
  // SCN-GL-2 / 2b / 2c used to sit here and pin a distinct `unknown node: <key>` refusal for an absent
  // endpoint. That refusal was an existence oracle — it ran BEFORE authz, so any caller, an empty actor
  // included, could tell it from `unauthorized` and thereby learn whether a nodeKey names a current node.
  // It is folded into `unauthorized`, and the cases that pin the fold (totality, no echoed key, byte
  // identity with the out-of-scope refusal) moved to `governed-link-endpoint-existence.test.ts` together
  // with the oracle matrix, because the property they test is a BYTE-COMPARISON across states and needs the
  // two-scope fixture this file's single-scope `POLICY` cannot express. Same seam, same reason, as
  // `governed-link-endpoint-authz.test.ts`.

  it("SCN-GL-3 — an actor outside EITHER endpoint's scope is denied (KNOW-11, both endpoints)", () => {
    const fx = fixture([T2_A, T2_B])
    // mallory owns `other`; both endpoints live in `core`.
    const { link } = createGovernedLink({ store: fx.store, policy: POLICY, actor: "mallory", ratifyToken: "lead" })
    const out = link("n0", "n1")
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unauthorized") // discriminant EQUALITY — see reasonOf
    // THIS CASE HAS NO TEETH ON THE CONJUNCTION, AND THE COMMENT THAT SAID IT DID WAS WRONG TWICE.
    // It read: "drop EITHER half of the both-endpoints authz check and a one-sided actor links across
    // scopes." MEASURED, both halves, full suite: dropping either half alone leaves 221/221 green, and this
    // case CANNOT detect it — mallory is in NEITHER endpoint's scope, so whichever half survives still fires
    // on her. A fixture with no one-sided actor in it can never see a one-sided gate.
    // The second error is in KIND: a one-sided actor does NOT link across scopes even with a half gone. The
    // class walk below re-checks `rowAuthorized` over every CURRENT member of the merged class, and
    // `sameAsClassOf` includes its own argument, so both endpoints are always re-covered — the endpoint gate
    // is `linked`-EQUIVALENT. What it is not is REASON-equivalent: it is a DISCLOSURE gate, and dropping a
    // half opens a storage-health oracle over the endpoint it stopped checking.
    // The real teeth, one genuine two-scope one-sided actor per endpoint, are in
    // `governed-link-endpoint-authz.test.ts` (SCN-GL-15 / SCN-GL-16).
    expect(fx.persists()).toHaveLength(0)
  })

  it("SCN-GL-4 — no ratifier token ⇒ refused, nothing persisted", () => {
    const fx = fixture([T2_A, T2_B])
    const { link } = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice" })
    const out = link("n0", "n1")
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unratified")
    expect(fx.persists()).toHaveLength(0)
  })

  it("SCN-GL-5 — two T2 endpoints + any ratifier ⇒ linked SYMMETRICALLY and persisted", () => {
    const fx = fixture([T2_A, T2_B])
    const { link } = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "lead" })
    const out = link("n0", "n1")
    expect(out.linked).toBe(true)
    expect(fx.persists()).toHaveLength(1)
    const next = fx.persists()[0]!
    // symmetric: the edge is readable from EITHER end (the union-find read fold is local from either side).
    expect(next.current.get("n0")!.sameAs).toContain("n1")
    expect(next.current.get("n1")!.sameAs).toContain("n0")
  })

  // ── THE TIER GATE (task #84) — the deferral this door carried while emit ran the same law ──────────────
  // MUTANT: replace the `ratify(stage({tier: strictestTier(...)}))` call with the old non-empty-token check
  // and SCN-GL-6 goes RED — a 'lead' token links a billy-ratified T0 node.

  it("SCN-GL-6 — a link touching a T0 endpoint requires BILLY, not merely a ratifier", () => {
    const fx = fixture([T2_A, T0_C])
    // A generic ratifier is enough for a T2↔T2 link (SCN-GL-5) but NOT once an endpoint is T0: the join of
    // the two classes is T0, and a T0 act is billy's. Otherwise the T2 endpoint is a side door onto the T0 one.
    const lead = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "lead" })
    const refused = lead.link("n0", "n1")
    expect(refused.linked).toBe(false)
    expect(reasonOf(refused.rejected)).toBe("unratified")
    expect(fx.persists()).toHaveLength(0)

    const billy = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "billy" })
    expect(billy.link("n0", "n1").linked).toBe(true)
    expect(fx.persists()).toHaveLength(1)
  })

  // ── THE TRANSITIVE CLASS (billy F3) — gating the EDGE is not gating the BOUNDARY ──────────────────────
  //
  // `deriveSameAs` folds the relation with a union-find, so it is TRANSITIVE. Joining only the two endpoints'
  // tiers gated one edge of a graph whose reachability the link was extending: billy legitimately equates a
  // T0 node with a T2 node, and afterwards ANY in-scope actor with ANY non-empty ratifier links that T2 node
  // to their own — landing inside the T0 node's equivalence class with no billy signature. Reproduced.
  //
  // MUTANT: revert the join to `strictestTier(factA.tier, factB.tier)` over the two endpoints and this
  // goes RED while every other case here stays green.

  it("SCN-GL-8 — the T0 class cannot be joined via a TWO-HOP link through a T2 node", () => {
    const fx = fixture([T2_A, T0_C, T2_B]) // n0 = T2, n1 = T0, n2 = the attacker's own T2 node
    // 1) billy legitimately equates the T2 node n0 with the T0 node n1. This link is correct and allowed.
    const billy = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "billy" })
    expect(billy.link("n0", "n1").linked).toBe(true)

    // 2) the attack: link n2 to n0. Both ENDPOINTS are T2, so an endpoint-only join reads this as a T2 act —
    //    but n0 is now in n1's class, so the link puts n2 inside the T0 class.
    const lead = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "lead" })
    const out = lead.link("n2", "n0")
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unratified")

    // …and billy CAN sign it, because the act is honestly a T0 act, not because it is forbidden.
    expect(billy.link("n2", "n0").linked).toBe(true)
  })

  it("SCN-GL-9 — an OFF-LATTICE tier on an endpoint cannot DILUTE the join (fails closed to T0)", () => {
    // billy F1 reaches this door too: `strictestTier` returning the *other* argument on garbage would let a
    // node declassified with `tier:'T3'` be linked by anyone. An unreadable-or-bogus class must read T0.
    const bogus = { ...fact({ claim: "delta", scope: "core", tier: "T2" }), tier: "T3" } as unknown as AdvisoryNode
    const fx = fixture([T2_A, bogus])
    const lead = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "lead" })
    expect(lead.link("n0", "n1").linked).toBe(false)
    expect(
      createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "billy" }).link("n0", "n1")
        .linked,
    ).toBe(true)
  })

  it("SCN-GL-7 — an endpoint whose stored fact is unreadable fails closed (class never assumed)", () => {
    const fx = fixture([T2_A, T2_B])
    const blind: DiskStore = { ...fx.store, get: () => undefined }
    const { link } = createGovernedLink({ store: blind, policy: POLICY, actor: "alice", ratifyToken: "billy" })
    const out = link("n0", "n1")
    expect(out.linked).toBe(false)
    // TEETH: previously an unreadable fact degraded to `undefined` scope and was reported merely
    // "unauthorized" — which reads as a policy problem an admin would try to fix by GRANTING a scope.
    expect(reasonOf(out.rejected)).toBe("unverifiable endpoint")
    expect(fx.persists()).toHaveLength(0)
  })

  // ── ONE-SIDED BLINDNESS — the read-back gate is a DISJUNCTION, and only its `&&` collapse was tested ───
  //
  // SCN-GL-7 blinds the WHOLE store (`get: () => undefined`), so BOTH endpoints are unreadable at once —
  // the one input on which `factA === undefined || factB === undefined` and `factA === undefined &&
  // factB === undefined` agree. Flipping that `||` to `&&` therefore left the suite green, while the
  // realistic failure is exactly the asymmetric one: CAS is content-addressed, so a prune, a partial
  // restore or a half-fetched pack drops SOME objects, never all of them. Under the `&&` the door then
  // walks past the gate holding an `undefined` fact and dereferences it at the authz gate.
  //
  // MUTANT: `factA === undefined && factB === undefined` and BOTH cases below go RED.

  it("SCN-GL-10 — endpoint A readable, endpoint B blind ⇒ still unverifiable, and the door never throws", () => {
    const fx = fixture([T2_A, T2_B])
    const halfBlind = blindTo(fx.store, addressOf(T2_B)) // the ONE object the store has lost
    const { link } = createGovernedLink({ store: halfBlind, policy: POLICY, actor: "alice", ratifyToken: "billy" })

    // TOTALITY FIRST: a write door reports a rejection, it does not throw. Under the `&&` mutant the
    // unreadable fact survives the gate and `factB.scope` is a TypeError at the authz line below it.
    expect(() => link("n0", "n1")).not.toThrow()
    const out = link("n0", "n1")
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unverifiable endpoint")
    expect(fx.persists()).toHaveLength(0)
  })

  it("SCN-GL-11 — endpoint A blind, endpoint B readable ⇒ identically refused (the gate is symmetric)", () => {
    const fx = fixture([T2_A, T2_B])
    const halfBlind = blindTo(fx.store, addressOf(T2_A))
    const { link } = createGovernedLink({ store: halfBlind, policy: POLICY, actor: "alice", ratifyToken: "billy" })

    expect(() => link("n0", "n1")).not.toThrow()
    const out = link("n0", "n1")
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unverifiable endpoint")
    expect(fx.persists()).toHaveLength(0)
  })

  // ── THE CLASS JOIN OVER A NON-CURRENT MEMBER — over-blocking is a failure mode too ────────────────────
  //
  // `sameAsClassOf` is DELIBERATELY wider than the read fold: it keeps dangling peers, because a retired
  // key is how two live nodes can belong to one governed class (SCN-SA-4 in wp-sameas.test.ts). So the
  // join below iterates keys that are NOT current nodes, and it must skip them: everything reachable
  // THROUGH a retired peer is itself in `merged` and priced on its own stored class, while the retired key
  // has no readable class, is served by no read fold, and is nobody's governance weight.
  //
  // MUTANT: `if (member === undefined) return 'T0';` and this goes RED — every link involving a node that
  // ever had a peer retired would demand billy forever. That is not "fail-closed", it is a gate that says
  // no to the legitimate case, which is how a governance gate gets routed around.

  it("SCN-GL-9b — a RETIRED peer in the class contributes NO class of its own (the join does not over-block)", () => {
    const fx = fixture([T2_A, T2_B], { n0: ["nRETIRED"] }) // n0 keeps a stored edge to a superseded node
    const lead = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "lead" })
    const out = lead.link("n0", "n1")
    expect(out.linked).toBe(true) // T2 ∨ T2 ∨ (nothing) = T2 ⇒ any ratifier signs it
    expect(fx.persists()).toHaveLength(1)
  })

  // ── THE SAME TRANSITIVITY, ONE GATE OVER — authz was still endpoint-only ──────────────────────────────
  //
  // SCN-GL-8 fixed the RATIFY gate to join over the whole merged class. The AUTHZ gate two lines above it
  // still read `factA.scope`/`factB.scope` only — the identical defect, and live. Reproduced against the
  // fixed ratify gate, so the tier join did not catch it:
  //   policy {secure:[alice], shared:[alice,mallory], mallory:[mallory]}
  //   1 alice links A~B   ⇒ linked   (A is T1 in `secure`, B is T2 in `shared`)
  //   2 mallory links B~M ⇒ linked   (mallory is NOT in `secure`)
  //   3 deriveSameAs      ⇒ [{A,B},{A,M},{B,M}] — mallory's node is inside alice's `secure` class
  // The tier join stayed quiet because nothing here is T0: a plain `lead` ratifier signs a T1 class. Scope,
  // not tier, was the boundary being crossed.
  //
  // MUTANT: revert the class-wide authz check to the two endpoints and SCN-GL-12 goes RED.

  it("SCN-GL-12 — an actor cannot link INTO a class whose scope it has no authority over (transitive authz)", () => {
    const CLASS_POLICY: AtlasPolicy = {
      ...POLICY,
      authz: { scopes: { secure: ["alice"], shared: ["alice", "mallory"], mallory: ["mallory"] } },
    }
    const A = fact({ claim: "A", scope: "secure", tier: "T1" })
    const B = fact({ claim: "B", scope: "shared", tier: "T2" })
    const M = fact({ claim: "M", scope: "mallory", tier: "T2" })
    const fx = fixture([A, B, M]) // n0 = A, n1 = B, n2 = mallory's own node

    // 1) alice legitimately equates her `secure` node with the `shared` one. She owns both scopes.
    const alice = createGovernedLink({ store: fx.store, policy: CLASS_POLICY, actor: "alice", ratifyToken: "lead" })
    expect(alice.link("n0", "n1").linked).toBe(true)

    // 2) the attack: mallory links the `shared` node to her own. BOTH ENDPOINTS are scopes she holds — but
    //    n1 is now in n0's class, so the link puts her node inside `secure`, where she has no authority.
    const mallory = createGovernedLink({ store: fx.store, policy: CLASS_POLICY, actor: "mallory", ratifyToken: "lead" })
    const out = mallory.link("n1", "n2")
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unauthorized") // discriminant EQUALITY — see reasonOf
    expect(fx.persists()).toHaveLength(1) // only alice's link ever landed
    expect(fx.persists()[0]!.current.get("n2")?.sameAs).toBeUndefined() // her node never joined the class

    // …and the gate is MEMBERSHIP, not a blanket ban: the moment an admin grants mallory `secure`, the very
    // same link is hers to make. (An over-blocking gate is a gate that gets routed around.)
    const GRANTED: AtlasPolicy = {
      ...CLASS_POLICY,
      authz: { scopes: { ...CLASS_POLICY.authz.scopes, secure: ["alice", "mallory"] } },
    }
    expect(
      createGovernedLink({ store: fx.store, policy: GRANTED, actor: "mallory", ratifyToken: "lead" }).link("n1", "n2")
        .linked,
    ).toBe(true)
  })

  it("SCN-GL-13 — a CLASS MEMBER whose bytes are unreadable fails closed, even for billy", () => {
    // The read-back gate covered the two ENDPOINTS only. Once authz spans the class, a member whose scope
    // cannot be READ cannot be shown to authorize anyone — so it is refused, and refused as `unverifiable`
    // (a pruned CAS is not a policy gap an admin should try to fix by granting a scope: the SCN-GL-7
    // distinction). This is strictly stronger than the old tier-only treatment, which merely priced an
    // unreadable member at T0 and let billy through.
    //
    // MUTANT: skip unreadable members in the class walk (treat them as contributing nothing) ⇒ RED.
    const T2_E = fact({ claim: "epsilon", scope: "core", tier: "T2" })
    const fx = fixture([T2_A, T2_B, T2_E])
    const alice = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "billy" })
    expect(alice.link("n0", "n2").linked).toBe(true) // n0 and n2 are now one class

    // Now n2's bytes are gone. n0/n1 are both perfectly readable, so the ENDPOINT gate cannot see this.
    const halfBlind = blindTo(fx.store, addressOf(T2_E))
    const blindLink = createGovernedLink({ store: halfBlind, policy: POLICY, actor: "alice", ratifyToken: "billy" })
    expect(() => blindLink.link("n0", "n1")).not.toThrow()
    const out = blindLink.link("n0", "n1")
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unverifiable endpoint")
    expect(fx.persists()).toHaveLength(1) // still only the first, legitimate link
  })

  it("SCN-GL-14 — a DOUBLY-violating link is refused by the ENDPOINT gate (precedence is pinned)", () => {
    // No pair of these gates changes `linked` when swapped — the order fixes the `rejected` string, which is
    // the door's contract and a disclosure channel. An actor with no authority over the two nodes it NAMED
    // must learn `unauthorized` and nothing about the class behind them (its size, membership, or CAS
    // health). MUTANT: move the class walk above the endpoint authz check and this goes RED — mallory,
    // who may not touch either endpoint, is told that a node she cannot even name has lost its bytes.
    const T2_E = fact({ claim: "epsilon", scope: "core", tier: "T2" })
    const fx = fixture([T2_A, T2_B, T2_E])
    const alice = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "billy" })
    expect(alice.link("n0", "n2").linked).toBe(true)

    const halfBlind = blindTo(fx.store, addressOf(T2_E))
    // mallory owns `other`; both endpoints live in `core`, AND the class member n2 is unreadable.
    const out = createGovernedLink({ store: halfBlind, policy: POLICY, actor: "mallory", ratifyToken: "billy" }).link(
      "n0",
      "n1",
    )
    expect(out.linked).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unauthorized") // discriminant EQUALITY — see reasonOf
    expect(out.rejected ?? "").not.toContain("unverifiable")
  })

  it("SCN-GL-9c — …while a LIVE T0 member reached THROUGH that retired peer still forces billy", () => {
    // The control that keeps SCN-GL-9b from being a licence to under-price: the retired key BRIDGES n0 to
    // the T0 node n2, so n2 is in the merged class, is a current node, and is priced off its OWN stored
    // fact. Skipping the unreadable member costs nothing precisely because the members that matter are
    // still there. MUTANT: revert the join to the two endpoints and this goes RED (n0/n1 are both T2).
    const fx = fixture([T2_A, T2_B, T0_C], { n0: ["nRETIRED"], n2: ["nRETIRED"] })
    const lead = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "lead" })
    expect(lead.link("n0", "n1").linked).toBe(false)
    expect(fx.persists()).toHaveLength(0)
    const billy = createGovernedLink({ store: fx.store, policy: POLICY, actor: "alice", ratifyToken: "billy" })
    expect(billy.link("n0", "n1").linked).toBe(true)
  })
})
