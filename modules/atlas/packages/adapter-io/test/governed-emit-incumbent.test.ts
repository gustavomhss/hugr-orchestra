// @atlas/adapter-io — test/governed-emit-incumbent.test.ts  (task #84 — the CONFUSED DEPUTY at the emit door)
//
// Split out of `governed-emit.test.ts` (the 400-LOC ceiling), and cohesive on its own: every case here is
// about ONE question — does the door derive the gate a write must clear from the NODE it targets, or from
// what the write says about itself? The fixtures are shared via `harness/governed-fixtures.ts`.
//
// Two independent cold-review seats reproduced bypasses against earlier versions of this guard. Each of
// those reproductions is now a case below, so the same attack cannot come back silently.

import { describe, it, expect } from "vitest"
import { asHash, id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { GroundedFact } from "@atlas/knowledge"
import { createGovernedEmit } from "../src/governed-emit.js"
import type { DiskStore } from "../src/store.js"
import type { AtlasPolicy } from "../src/policy.js"
import { makeStoreSpy, HOLDS_GATE, POLICY, advisory, mkAdvisory, realKey, AT } from "./harness/governed-fixtures.js"
// The refusal DISCRIMINANT, not a substring. `REJECTED_UNVERIFIABLE_TARGET`'s prose quotes
// `unauthorized for target` BY NAME (deliberately — it documents that a caller without authority gets that
// reason in both byte-states), so `toContain('unauthorized for target')` is ALSO satisfied by the
// `unverifiable target` string. The assertions below therefore could not see a downgrade from the former to
// the latter — which is precisely the oracle ADR-0007 exists to prevent. Measured: a mutant survived the
// battery until these became discriminant EQUALITY. See `reasonOf`.
import { reasonOf } from "./door-regression-support.js"

describe("COMPOSE-A — the incumbent guard (a write's gate comes from its target)", () => {
  // ── INCUMBENT GUARD (task #84) — the CONFUSED DEPUTY the ratify gate alone does NOT close ────────────
  //
  // THE HOLE (reproduced on master before this guard existed): the gate a write must clear was chosen from
  // the write's OWN self-declared `tier`/`scope`, while WHICH NODE it lands on is the recomputed
  // `nodeKey = hash(primaryAnchorId ‖ slot[‖ check])` — which contains NEITHER. So the two disagree, and the
  // author picks the side that suits them: declare `T2`+advisory ⇒ `route` says auto-accept ⇒ NO token is
  // consulted ⇒ `upsert` set-unions the claim straight into a billy-ratified T0 node. Capability gating
  // ("which gate applies") is not authorization ("may THIS write touch THAT node") — the literature name is
  // a confused deputy; the fix is to derive the required gate from the RESOURCE, never from the request.
  //
  // MUTANT: delete the incumbent-guard block in governed-emit.ts and SCN-GE-I1/I2/I5 all go RED (a tokenless
  // T2 write mutates a T0 node / an out-of-scope actor writes another scope's node / a node whose stored
  // fact is unreadable is written blind). SCN-GE-I3/I4 pin that the guard does NOT over-block: re-emitting
  // at the SAME class still works, and RAISING strictness is always allowed.

  it("SCN-GE-I1 — a tokenless T2 write CANNOT touch a billy-ratified T0 node at the same identity", () => {
    const spy = makeStoreSpy()
    const ANCHOR = "src/auth.ts::verify"

    // 1) billy ratifies a T0 fact — the node now carries the strictest governance class.
    const ratified = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "billy",
    })
    const t0 = mkAdvisory({
      id: "nk-t0",
      anchor: ANCHOR,
      claimNorm: "billy-ratified T0 claim",
      scope: "core",
      tier: "T0",
    })
    expect(ratified.emit(t0, AT).emitted).toBe(true)

    // 2) the attack: SAME anchor ⇒ SAME minted nodeKey, but the payload DECLARES T2 so `route` fast-paths
    //    and never consults a token. No ratify token is supplied at all.
    const attacker = mkAdvisory({
      id: "nk-t2",
      anchor: ANCHOR,
      claimNorm: "UNRATIFIED injected claim",
      scope: "core",
      tier: "T2",
    })
    expect(realKey(attacker)).toBe(realKey(t0)) // PREMISE: the identity collides — tier is not in the nodeKey
    const noToken = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const out = noToken.emit(attacker, AT)

    // TEETH: the write must be refused because the NODE IT TARGETS requires billy — not because of anything
    // the payload says about itself.
    expect(out.emitted).toBe(false)
    expect(out.rejected ?? "").toContain("governance-downgrade")
    expect(spy.puts()).toHaveLength(1) // only the ratified T0 fact ever landed
    expect(spy.persists()).toHaveLength(1)
    const node = spy.persists()[0]!.current.get(realKey(t0))!
    expect(node.claims).toEqual(["billy-ratified T0 claim"])
    expect(node.claims).not.toContain("UNRATIFIED injected claim")
  })

  it("SCN-GE-I2 — an actor authorized in its OWN scope cannot re-scope and write ANOTHER scope's node", () => {
    const spy = makeStoreSpy()
    const ANCHOR = "src/auth.ts::secret"
    // alice owns `core`; mallory owns `public`. Neither is in the other's scope.
    const TWO_SCOPE: AtlasPolicy = { ...POLICY, authz: { scopes: { core: ["alice"], public: ["mallory"] } } }

    const alice = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: TWO_SCOPE, actor: "alice" })
    const owned = mkAdvisory({ id: "nk-core", anchor: ANCHOR, claimNorm: "core-scoped claim", scope: "core" })
    expect(alice.emit(owned, AT).emitted).toBe(true)

    // The attack: mallory declares the scope SHE is authorized for. Authz on the DECLARED scope passes —
    // but the node the write lands on lives in `core`, which mallory may not write.
    const mallory = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: TWO_SCOPE, actor: "mallory" })
    const reScoped = mkAdvisory({ id: "nk-pub", anchor: ANCHOR, claimNorm: "INJECTED by mallory", scope: "public" })
    expect(realKey(reScoped)).toBe(realKey(owned)) // PREMISE: scope is not in the nodeKey either
    const out = mallory.emit(reScoped, AT)

    expect(out.emitted).toBe(false)
    // The reason names the REAL defect: not that she declared a different scope, but that she has no
    // authority over the scope the node actually lives in.
    expect(reasonOf(out.rejected)).toBe("unauthorized for target")
    expect(spy.puts()).toHaveLength(1)
    expect(spy.persists()[0]!.current.get(realKey(owned))!.claims).toEqual(["core-scoped claim"])
  })

  it("SCN-GE-I3 — re-emitting at the SAME class still set-unions (the guard does NOT over-block)", () => {
    const spy = makeStoreSpy()
    const ANCHOR = "src/util.ts::greet"
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    expect(emit(mkAdvisory({ id: "a", anchor: ANCHOR, claimNorm: "claim one", scope: "core" }), AT).emitted).toBe(true)
    expect(emit(mkAdvisory({ id: "b", anchor: ANCHOR, claimNorm: "claim two", scope: "core" }), AT).emitted).toBe(true)
    const node = spy
      .persists()
      [
        spy.persists().length - 1
      ]!.current.get(realKey(mkAdvisory({ id: "a", anchor: ANCHOR, claimNorm: "x", scope: "core" })))!
    expect(node.claims).toEqual(["claim one", "claim two"])
  })

  it("SCN-GE-I4 — RAISING strictness (T2 node ← a T0 write) is allowed, and still requires billy", () => {
    const spy = makeStoreSpy()
    const ANCHOR = "src/util.ts::greet"
    const open = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    expect(
      open.emit(mkAdvisory({ id: "a", anchor: ANCHOR, claimNorm: "the T2 claim", scope: "core" }), AT).emitted,
    ).toBe(true)

    const escalate = mkAdvisory({
      id: "b",
      anchor: ANCHOR,
      claimNorm: "now security-critical",
      scope: "core",
      tier: "T0",
    })
    // no token ⇒ the T0 write is refused by the EXISTING ratify gate (not the downgrade guard)…
    const refused = open.emit(escalate, AT)
    expect(refused.emitted).toBe(false)
    expect(refused.rejected ?? "").toContain("unratified")
    // …and with billy it lands: strictness only ever ratchets UP.
    const signed = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "billy",
    })
    expect(signed.emit(escalate, AT).emitted).toBe(true)
  })

  // ── THE OFF-LATTICE CLASS (billy F1) — the guard above, defeated by one character ──────────────────────
  //
  // `Tier` is a TYPE-ONLY union. Nothing validates it at runtime: `atlas emit` is JSON.parse + a cast, and the
  // MCP `node` schema is a bare `object`. So `TIER_STRICTNESS['T3']` is `undefined`, `0 < undefined` is
  // `false`, and the downgrade guard read "not a downgrade" — the SCN-GE-I1 attack, re-armed by typing one
  // extra character. A cold review reproduced the full erasure end-to-end through the real CLI with no billy
  // token: T0 → T3 (guard passes) → T2 (guard passes), and T2 is bounded OUT of every pack, so the ratified
  // invariant vanished from every read as surely as if it had been deleted.
  //
  // MUTANTS — stated precisely, because the first draft of this comment was WRONG and a cold review caught
  // it. The two legs are INDEPENDENT and each has its own killer; neither one alone reds both tests:
  //   · drop the gate-0 `isTier` block            ⇒ SCN-GE-I7 only (the CREATE leg is unguarded)
  //   · weaken `isTier` to `v in TIER_STRICTNESS` ⇒ SCN-GE-I6 (prototype members walk in)
  //   · de-totalise `isWeakerTier`/`strictestTier` back to `Record<Tier, number>` indexing
  //                                               ⇒ SCN-GL-9 in governed-link.test.ts
  // Claiming a disjunction that only holds as a conjunction is the same overclaim these tests exist to
  // prevent, one level up.

  it("SCN-GE-I6 — an OFF-LATTICE tier cannot walk past the downgrade guard onto a T0 node", () => {
    const ANCHOR = "src/auth.ts::verify"
    // Every shape a payload can carry that is not one of the three real classes. `'t0'`/`' T0'` are the
    // near-misses; `'toString'`/`'__proto__'` probe the prototype chain; `null`/`0`/absent probe the
    // JSON-shaped holes. NONE of them may be treated as "not weaker than T0".
    const OFF_LATTICE = ["T3", "t0", " T0", "toString", "__proto__", "valueOf", null, 0, undefined, ""]
    for (const bogus of OFF_LATTICE) {
      const spy = makeStoreSpy()
      const billy = createGovernedEmit({
        store: spy.store,
        gate: HOLDS_GATE,
        policy: POLICY,
        actor: "alice",
        ratifyToken: "billy",
      })
      const t0 = mkAdvisory({
        id: "nk-t0",
        anchor: ANCHOR,
        claimNorm: "billy-ratified T0 claim",
        scope: "core",
        tier: "T0",
      })
      expect(billy.emit(t0, AT).emitted).toBe(true)

      const attacker = {
        ...mkAdvisory({ id: "nk-x", anchor: ANCHOR, claimNorm: "EVIL", scope: "core" }),
        tier: bogus,
      } as unknown as GroundedFact
      const out = createGovernedEmit({
        store: spy.store,
        gate: HOLDS_GATE,
        policy: POLICY,
        actor: "alice",
        ratifyToken: "lead",
      }).emit(attacker, AT)

      expect(out.emitted, `tier=${JSON.stringify(bogus)} must not be emittable`).toBe(false)
      expect(spy.persists()[spy.persists().length - 1]!.current.get(realKey(t0))!.claims).toEqual([
        "billy-ratified T0 claim",
      ])
    }
  })

  it("SCN-GE-I7 — an OFF-LATTICE tier cannot be MINTED either (no incumbent ⇒ no lattice guard runs)", () => {
    // The CREATE leg is the other half of the same hole and it is NOT covered by the downgrade comparison:
    // with no incumbent there is nothing to compare against, yet the read side bounds a pack with
    // `inv.tier !== 'T2'` — so a node minted at `'T3'` would be SERVED as though it were ratified T1-or-
    // stricter. Garbage in the class field is the same defect one step earlier.
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "billy",
    })
    const bogus = {
      ...mkAdvisory({ id: "nk-new", anchor: "src/fresh.ts::f", claimNorm: "minted", scope: "core" }),
      tier: "T3",
    } as unknown as GroundedFact
    const out = emit(bogus, AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected ?? "").toContain("malformed tier")
    expect(spy.puts()).toHaveLength(0)
    expect(spy.persists()).toHaveLength(0)
  })

  it("SCN-GE-I8 — an UNOWNED node (no stored scope) cannot be captured by an actor holding any scope", () => {
    // billy F4, and a REGRESSION my own F2 fix caused. Mined facts carry no scope. While their CAS bytes were
    // absent the incumbent guard refused every write to them (fail-closed, the DoS). The moment I made mine
    // put its bytes, `stored.scope === undefined` hit the carve-out `stored.scope !== undefined &&` — so
    // `reScoped` was false and ANY actor in ANY scope could adopt the node with NO ratify token, rewrite its
    // scope to their own, then promote it T2→T1 — and T1 is INSIDE the pack bound, i.e. an injected served
    // invariant. Availability bug traded for an integrity bug. An unowned node has no owner to authorize a
    // write, so the write is refused — not "authorized by default".
    //
    // MUTANT: restore `stored.scope !== undefined &&` and this goes RED.
    const spy = makeStoreSpy()
    const unowned = advisory(undefined, "T2") // no scope, exactly as a mined fact used to be
    const key = realKey(unowned)
    spy.store.put(unowned as unknown as CasObject)
    spy.store.persistProjection({
      current: new Map([
        [
          key,
          {
            nodeKey: key,
            family: "advisory" as const,
            contentHash: id(unowned as CasObject) as unknown as string,
            claims: ["the unowned claim"],
          },
        ],
      ]),
      cas: new Set([id(unowned as CasObject) as unknown as string]),
    })

    const capture = mkAdvisory({
      id: "nk-grab",
      anchor: "src/util.ts::greet",
      claimNorm: "MALLORY OWNS THIS NOW",
      scope: "core",
    })
    expect(realKey(capture)).toBe(key) // premise: it lands on the unowned node
    const out = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" }).emit(
      capture,
      AT,
    )

    expect(out.emitted).toBe(false)
    // An unowned node has no scope to authorize anyone, so `actorInScope` denies (KNOW-11a) — fail-closed
    // by the ordinary rule, with no special case for `undefined`.
    expect(reasonOf(out.rejected)).toBe("unauthorized for target")
    expect(spy.persists()[spy.persists().length - 1]!.current.get(key)!.claims).toEqual(["the unowned claim"])
  })

  it("SCN-GE-I9 — the class is read ONCE: a value that changes between gates cannot clear one and route as another", () => {
    // billy F7. The door read `node.tier` at several gates. Over the CLI and MCP wires that is unreachable
    // (both are `JSON.parse`, which cannot produce an accessor), but `createGovernedEmit` is an EXPORTED
    // library entry point, so an in-process embedder can hand it an object whose `tier` differs per read:
    // `'T2'` at gate 0, something else at the ratify route. Reproduced — the T0 invariant was overwritten
    // with no token. The door now gates a SNAPSHOT and persists that same snapshot.
    //
    // MUTANT: read `raw.tier` at the gates again instead of the `tier` const, and this goes RED.
    const spy = makeStoreSpy()
    const ANCHOR = "src/auth.ts::verify"
    const billy = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "billy",
    })
    const t0 = mkAdvisory({ id: "nk-t0", anchor: ANCHOR, claimNorm: "the T0 invariant", scope: "core", tier: "T0" })
    expect(billy.emit(t0, AT).emitted).toBe(true)

    let reads = 0
    const shifty = { ...mkAdvisory({ id: "nk-x", anchor: ANCHOR, claimNorm: "ERASED BY TOCTOU", scope: "core" }) }
    // SEQUENCE MATTERS, and the first draft of this test got it wrong — a cold review proved the test VACUOUS
    // (it passed against the unfixed source). With `T0,T2,T2` the third read lands in `isWeakerTier`, where
    // `T2 < T0` trips the DOWNGRADE guard, so the case went green for a reason that has nothing to do with
    // snapshotting. `T0,T2,T0` is the real attack: gate 0 sees T0, the ratify route sees T2 (auto-accept, no
    // token consulted), and the downgrade comparison sees T0 again so it finds nothing weaker. That is what
    // overwrote the node before the snapshot existed.
    Object.defineProperty(shifty, "tier", { get: () => (reads++ === 1 ? "T2" : "T0"), enumerable: true })

    const out = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" }).emit(
      shifty as GroundedFact,
      AT,
    )
    expect(out.emitted).toBe(false) // gate 0 saw T0 ⇒ every later gate must ALSO see T0 ⇒ needs billy
    expect(spy.persists()[spy.persists().length - 1]!.current.get(realKey(t0))!.claims).toEqual(["the T0 invariant"])
  })

  // ── SCOPE MONOTONICITY — the half the membership fix deleted ──────────────────────────────────────────
  //
  // SCN-GE-I2 covers DISJOINT membership (mallory is in no scope of the node's). The DUAL-membership case had
  // no test, and it is the one that matters: after the equality test was replaced by `actorInScope(policy,
  // actor, stored.scope)`, BOTH scope gates asked "is the actor in SOME scope" and NEITHER asked whether the
  // scope the write DECLARES is a legitimate destination. So an actor in two scopes moved a node between them
  // and permanently evicted every co-owner — reproduced end-to-end before this gate existed:
  //   alice creates a T1 in `shared` ⇒ emitted; bob re-emits it declaring `bob-priv` ⇒ emitted, node moved;
  //   alice re-writes HER OWN served T1 invariant ⇒ `unauthorized for target`.
  // A T1 needs only a non-empty ratifier (only T0 requires billy), and T1 is INSIDE the pack bound.
  //
  // MUTANT: delete the `node.scope !== stored.scope` gate and SCN-GE-I10 goes RED.

  it("SCN-GE-I10 — an actor in TWO scopes cannot MOVE a node between them (relocation is re-classification)", () => {
    const spy = makeStoreSpy()
    const ANCHOR = "src/auth.ts::verify"
    // bob is legitimately in BOTH scopes; alice is a co-owner of `shared` only.
    const DUAL: AtlasPolicy = { ...POLICY, authz: { scopes: { shared: ["alice", "bob"], "bob-priv": ["bob"] } } }
    const alice = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: DUAL,
      actor: "alice",
      ratifyToken: "lead",
    })
    const bob = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: DUAL,
      actor: "bob",
      ratifyToken: "lead",
    })

    const t1 = mkAdvisory({
      id: "nk-shared",
      anchor: ANCHOR,
      claimNorm: "the T1 invariant",
      scope: "shared",
      tier: "T1",
    })
    expect(alice.emit(t1, AT).emitted).toBe(true)

    // The attack: bob declares `bob-priv`. Gate 2 passes (he owns it) and the target-authority gate passes
    // (he owns `shared` too) — the membership rule alone has nothing left to refuse with.
    const moved = mkAdvisory({
      id: "nk-priv",
      anchor: ANCHOR,
      claimNorm: "bob addendum",
      scope: "bob-priv",
      tier: "T1",
    })
    expect(realKey(moved)).toBe(realKey(t1)) // PREMISE: scope is not in the nodeKey
    const out = bob.emit(moved, AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected ?? "").toContain("governance-relocation")

    // TEETH 1 — the node did not move: its stored scope is still the one it was created in.
    const storedScope = (): string | undefined => {
      const cur = spy.persists()[spy.persists().length - 1]!.current.get(realKey(t1))!
      return (spy.store.get(asHash(cur.contentHash)) as GroundedFact).scope
    }
    expect(storedScope()).toBe("shared")
    // TEETH 2 — the author is NOT locked out of her own served invariant (the eviction the move caused).
    expect(
      alice.emit(
        mkAdvisory({ id: "nk-a2", anchor: ANCHOR, claimNorm: "alice update", scope: "shared", tier: "T1" }),
        AT,
      ).emitted,
    ).toBe(true)
    // TEETH 3 — and the gate refuses RELOCATION, not co-ownership: bob still writes it at its real scope.
    expect(
      bob.emit(mkAdvisory({ id: "nk-b2", anchor: ANCHOR, claimNorm: "bob addendum", scope: "shared", tier: "T1" }), AT)
        .emitted,
    ).toBe(true)
    expect(storedScope()).toBe("shared")
  })

  // ── GATE PRECEDENCE — a hidden invariant no `emitted` assertion can see ────────────────────────────────
  //
  // No pair of these gates changes `emitted` when swapped: every one of them refuses. What the order decides
  // is the `rejected` string — which is the door's user-visible contract AND a disclosure channel about a
  // node the caller may have no authority over. `unauthorized for target` therefore runs BEFORE both
  // re-classification gates, so a refusal never tells a stranger the incumbent's scope or its governance
  // class. Swap those lines and the door leaks with the WHOLE SUITE GREEN — hence this case.
  //
  // MUTANT: move the `unauthorizedForTarget` check below the tier check ⇒ leg 1 goes RED (`governance-
  // downgrade` leaks the incumbent's class to mallory). Move it below the relocation check ⇒ leg 1 goes RED
  // on `governance-relocation`. Move the relocation gate below the tier gate ⇒ leg 2 goes RED.

  it("SCN-GE-I11 — a DOUBLY-violating write is refused by the LEAST-disclosing gate (precedence is pinned)", () => {
    const spy = makeStoreSpy()
    const ANCHOR = "src/auth.ts::verify"
    const THREE: AtlasPolicy = {
      ...POLICY,
      authz: { scopes: { shared: ["alice", "bob"], "bob-priv": ["bob"], mallory: ["mallory"] } },
    }
    const alice = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: THREE,
      actor: "alice",
      ratifyToken: "lead",
    })
    const t1 = mkAdvisory({
      id: "nk-shared",
      anchor: ANCHOR,
      claimNorm: "the T1 invariant",
      scope: "shared",
      tier: "T1",
    })
    expect(alice.emit(t1, AT).emitted).toBe(true)

    // LEG 1 — mallory violates ALL THREE: no authority over `shared`, a different declared scope, AND a
    // weaker class (T2 < T1). She must learn only that she has no authority over the target.
    const mallory = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: THREE,
      actor: "mallory",
      ratifyToken: "lead",
    })
    const triple = mkAdvisory({ id: "nk-m", anchor: ANCHOR, claimNorm: "INJECTED", scope: "mallory", tier: "T2" })
    const leaky = mallory.emit(triple, AT)
    expect(leaky.emitted).toBe(false)
    expect(reasonOf(leaky.rejected)).toBe("unauthorized for target")
    expect(leaky.rejected ?? "").not.toContain("governance-downgrade") // would disclose the incumbent's tier
    expect(leaky.rejected ?? "").not.toContain("governance-relocation") // would disclose its scope

    // LEG 2 — bob HAS authority over the target, and violates the other two at once. Between the two
    // re-classification gates the SCOPE one wins: it answers whether this write belongs to this node at all.
    const bob = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: THREE,
      actor: "bob",
      ratifyToken: "lead",
    })
    const both = mkAdvisory({
      id: "nk-b",
      anchor: ANCHOR,
      claimNorm: "moved AND lowered",
      scope: "bob-priv",
      tier: "T2",
    })
    const out = bob.emit(both, AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected ?? "").toContain("governance-relocation")
    expect(out.rejected ?? "").not.toContain("governance-downgrade")
    expect(spy.puts()).toHaveLength(1) // only alice's original fact ever landed
  })

  it("SCN-GE-I5 — an incumbent whose stored fact is NOT readable from CAS fails closed (never written blind)", () => {
    const spy = makeStoreSpy()
    const ANCHOR = "src/util.ts::greet"
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const first = mkAdvisory({ id: "a", anchor: ANCHOR, claimNorm: "the original claim", scope: "core" })
    expect(emit(first, AT).emitted).toBe(true)

    // The projection still names the node, but its content-addressed bytes are gone (pruned CAS / partial
    // restore). The door cannot READ the class it must clear ⇒ it must refuse, not assume the write's own.
    const blindStore: DiskStore = { ...spy.store, get: () => undefined }
    const blind = createGovernedEmit({ store: blindStore, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const out = blind.emit(mkAdvisory({ id: "b", anchor: ANCHOR, claimNorm: "written blind", scope: "core" }), AT)
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unverifiable target")
  })
})
