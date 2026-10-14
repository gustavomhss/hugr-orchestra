// @atlas/adapter-io — test/arch9-door-derivation.test.ts  (ARCH-9 at the DOOR — ADR-0010 items 1 and 3)
//
// ADR-0010 closed ARCH-9 at the REDUCER and opened a SEAM at the door (`RatifyContext.derivedTier`) that no
// caller filled. It says so in as many words: "the door must actually supply `derivedTier` … until then
// `route` still gates on the declared class and ARCH-9 is a seam here, not a closure." This suite is that
// caller's test, and it is deliberately split into three parts of very different strength — because two of
// the three things ADR-0010 leaves open are NOT closed by this work, and a suite that blurred them would be
// worse than no suite.
//
//   §1  THE SCOPE BINDING (ADR-0010 open item 3) — a REAL, reachable confused deputy on the CREATE leg,
//       reproduced end to end, then NARROWED by an admin-declared binding. §1c pins what is still open.
//   §2  THE DERIVED CLASS (ADR-0010 open item 1) — wired, and HONESTLY reported: at this door it changes no
//       outcome today, because ARCH-10's incumbent guard already refuses every input that could distinguish
//       the two. What it removes is a DEPENDENCE on gate order. The seam is pinned directly.
//   §3  THE CREATE LEG (ARCH-D3b) — pinned as the OPEN owner DEFINE it is, so it cannot be mistaken for
//       coverage by anyone reading the green checkmarks.
//
// Every refusal is asserted through `reasonOf` — equality on the discriminant, never a substring of prose.

import { describe, it, expect, afterEach } from "vitest"
import type { Hash } from "@atlas/contracts"
import type { QueryIndex } from "@atlas/tools"
import { route } from "@atlas/knowledge"
import type { Candidate, GroundedFact } from "@atlas/knowledge"
import { createGovernedEmit } from "../src/governed-emit.js"
import { ratifyCtxFor } from "../src/governed-emit-route.js"
import { incumbentDecision } from "../src/governed-emit-incumbent.js"
import { createProjectionQueryIndex } from "../src/projection-query-index.js"
import { anchorOwner, scopeOwnsAnchor } from "../src/policy.js"
import type { AtlasPolicy } from "../src/policy.js"
import { AT, HOLDS, advisoryFact, freshWorkspace, keyOf, policyOf, reasonOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

/** The anchor the whole §1 story turns on: code that lives in the payments territory. */
const PAY_ANCHOR = "src/payments/charge.ts::charge"
const PAY_CLAIM = "charges are never negative"

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
})

/** alice owns `public`; bob owns `payments`. Neither is in the other's scope. */
function twoScopePolicy(anchors?: Record<string, string>): AtlasPolicy {
  const base = policyOf({ public: ["alice"], payments: ["bob"] })
  return anchors === undefined ? base : { ...base, authz: { ...base.authz, anchors } }
}

function doorFor(policy: AtlasPolicy, actor: string): ReturnType<typeof createGovernedEmit> {
  ws ??= freshWorkspace()
  return createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor, ratifyToken: "billy" })
}

/** The structural leg STUB — it NEVER supplies invariants, so anything in the pack came from the projection
 *  readback, i.e. from the scoping rule under examination. */
const structuralStub: QueryIndex = {
  cover: () => ({ territory: "t", axisHash: "ax" as unknown as Hash, invariants: [], stale: false }),
}

/** What `atlas query <scope>` would serve for `scope`, read through the REAL read-side scoping decorator. */
function servedClaimsUnder(scope: string): readonly string[] {
  return createProjectionQueryIndex(structuralStub, ws!.store)
    .cover(scope)
    .invariants.map((i) => i.claim)
}

describe("§1 ARCH-9 for `scope` — the authz gate and the read projection are bound (ADR-0010 item 3)", () => {
  it("RED: an actor holding ONLY `public` publishes into the payments territory by declaring `public`", () => {
    // No binding declared: the pre-ADR-0010 shape, and the reproduction. Authz asks "is alice in the scope
    // this write NAMES" — alice picked that string. Nothing asks whether `public` may own `src/payments`.
    const out = doorFor(twoScopePolicy(), "alice").emit(
      advisoryFact({ anchor: PAY_ANCHOR, scope: "public", tier: "T1", claimNorm: PAY_CLAIM }),
      AT,
    )
    expect(out.emitted).toBe(true)
    // …and it is not merely stored, it is SERVED: `atlas query src/payments` scopes the pack by the fact's
    // DERIVED primary anchor and never looks at the declared scope at all. T1 is inside the TOOLS-6 bound.
    expect(servedClaimsUnder("src/payments")).toContain(PAY_CLAIM)
  })

  it("the SAME write is refused once an admin binds the prefix — `unauthorized for anchor`", () => {
    const out = doorFor(twoScopePolicy({ "src/payments": "payments" }), "alice").emit(
      advisoryFact({ anchor: PAY_ANCHOR, scope: "public", tier: "T1", claimNorm: PAY_CLAIM }),
      AT,
    )
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unauthorized for anchor")
    expect(servedClaimsUnder("src/payments")).toEqual([]) // nothing persisted, nothing served
  })

  it("the LEGITIMATE owner is unaffected: bob, in `payments`, writes the same anchor", () => {
    const out = doorFor(twoScopePolicy({ "src/payments": "payments" }), "bob").emit(
      advisoryFact({ anchor: PAY_ANCHOR, scope: "payments", tier: "T1", claimNorm: PAY_CLAIM }),
      AT,
    )
    expect(out.emitted).toBe(true)
    expect(servedClaimsUnder("src/payments")).toContain(PAY_CLAIM)
  })

  it("an UNBOUND prefix still stands aside — this is a NARROWING, not a closure, and says so", () => {
    // The binding covers `src/payments` only; a fact anchored elsewhere is judged exactly as before. This is
    // the residual, pinned as a TEST rather than left in prose: an admin who declares nothing gets the
    // unbound product. Which scope owns which prefix is the owner DEFINE ADR-0010 item 3 names.
    const out = doorFor(twoScopePolicy({ "src/payments": "payments" }), "alice").emit(
      advisoryFact({ anchor: "src/shipping/send.ts::send", scope: "public", tier: "T1", claimNorm: "unbound" }),
      AT,
    )
    expect(out.emitted).toBe(true)
    expect(servedClaimsUnder("src/shipping")).toContain("unbound")
  })

  it("LONGEST declared prefix wins, regardless of key order, and coverage is the READ side's predicate", () => {
    const p = twoScopePolicy({ src: "public", "src/payments": "payments" })
    expect(anchorOwner(p, PAY_ANCHOR)).toBe("payments")
    expect(anchorOwner(p, "src/other.ts::x")).toBe("public")
    expect(anchorOwner(p, "lib/x.ts::y")).toBeUndefined() // undeclared ⇒ unbound
    // Segment-wise, never `startsWith`: `src/paymentsX` is NOT under `src/payments`.
    expect(anchorOwner(p, "src/paymentsX/y.ts::z")).toBe("public")
    expect(scopeOwnsAnchor(p, "payments", PAY_ANCHOR)).toBe(true)
    expect(scopeOwnsAnchor(p, "public", PAY_ANCHOR)).toBe(false)
    expect(scopeOwnsAnchor(twoScopePolicy(), "anything", PAY_ANCHOR)).toBe(true) // no map ⇒ no binding
  })
})

describe("§2 ARCH-9 for `tier` — the door supplies the class it DERIVED, not the one declared", () => {
  it("the ctx builder is real: a derived T0 sends a DECLARED-T2 advisory to full ratification", () => {
    // The seam ADR-0010 opened, exercised at the exact point the door calls it. Without `derivedTier` this
    // candidate auto-accepts and the KNOW-8 token is never consulted.
    const declaredT2 = advisoryFact({ anchor: "src/a.ts::a", scope: "core", tier: "T2", claimNorm: "x" })
    const view = {
      ...declaredT2,
      slot: declaredT2.kind === "advisory" || declaredT2.kind === "predicate" ? declaredT2.predicateSlot : undefined,
    } as unknown as Candidate
    expect(route(view, ratifyCtxFor(undefined, { lowRisk: true, contested: false }))).toBe("auto-accept")
    expect(route(view, ratifyCtxFor("T0", { lowRisk: true, contested: false }))).toBe("full-ratify")
    expect(route(view, ratifyCtxFor("T1", { lowRisk: true, contested: false }))).toBe("full-ratify")
    // The join is ONE-WAY: a derived T2 can never make a declared T0's gate easier.
    const declaredT0 = advisoryFact({ anchor: "src/a.ts::a", scope: "core", tier: "T0", claimNorm: "x" })
    const t0View = {
      ...declaredT0,
      slot: declaredT0.kind === "advisory" || declaredT0.kind === "predicate" ? declaredT0.predicateSlot : undefined,
    } as unknown as Candidate
    expect(route(t0View, ratifyCtxFor("T2", { lowRisk: true, contested: false }))).toBe("full-ratify")
    // ARCH-D3b: absent means the door DID NOT SPEAK, and it must stay absent rather than defaulting.
    expect(ratifyCtxFor(undefined, { lowRisk: true, contested: false })).not.toHaveProperty("derivedTier")
    expect(ratifyCtxFor("T0", { lowRisk: true, contested: false }).derivedTier).toBe("T0")
  })

  it("stage 2.25 RETURNS the derived class off the incumbent — row-carried, and legacy-row-from-bytes", () => {
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice"] })
    const deps = { store: ws.store, policy, actor: "alice" }
    const stored = advisoryFact({ anchor: "src/a.ts::a", scope: "core", tier: "T0", claimNorm: "ratified" })
    const contentHash = String(ws.store.put(stored as never))
    const row = { nodeKey: keyOf(stored), family: "advisory" as const, contentHash, claims: ["ratified"] }

    // Carried row: the class is the JOIN of row and bytes — a row that disagrees may only make it HARDER.
    expect(incumbentDecision(deps, { ...row, scope: "core", tier: "T0" }, stored, "T0").derivedTier).toBe("T0")
    expect(incumbentDecision(deps, { ...row, scope: "core", tier: "T2" }, stored, "T0").derivedTier).toBe("T0")
    // Legacy row (no governance carrier): the authenticated BYTES stand alone.
    expect(incumbentDecision(deps, row, stored, "T0").derivedTier).toBe("T0")
    // A refusal carries NO derived class — a write that never reaches `route` owes it nothing.
    const weaker = incumbentDecision(deps, { ...row, scope: "core", tier: "T0" }, stored, "T2")
    expect(reasonOf(weaker.refusal)).toBe("governance-downgrade")
    expect(weaker.derivedTier).toBeUndefined()
  })

  it("STATED PROPERTY, not a claim of new teeth: at THIS door the derivation changes no outcome today", () => {
    // Measured, and recorded so nobody re-derives it: ARCH-10 refuses every write declaring a class weaker
    // than the incumbent's, so by the time `route` runs, declared ⊒ derived and the join is the declared
    // class. The T2-over-T0 takeover is refused `governance-downgrade` — by the INCUMBENT gate, not by the
    // route. What the wiring removes is the DEPENDENCE on that gate running first: delete the downgrade
    // branch and the write is still refused, now `unratified`, because the derived T0 routes to
    // full-ratify. That mutant is the only input that can tell the two apart, which is why this test states
    // the equivalence instead of pretending to a behavioural difference it cannot show.
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice", "billy"] })
    const door = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "billy" })
    const t0 = advisoryFact({ anchor: "src/auth.ts::verify", scope: "core", tier: "T0", claimNorm: "ratified truth" })
    expect(door.emit(t0, AT).emitted).toBe(true)
    const takeover = advisoryFact({
      anchor: "src/auth.ts::verify",
      scope: "core",
      tier: "T2",
      claimNorm: "weaker",
      gen: 2,
    })
    expect(reasonOf(door.emit(takeover, AT).rejected)).toBe("governance-downgrade")
  })
})

describe("§3 ARCH-D3b — the CREATE leg is OPEN, and is pinned as open", () => {
  it("on a CREATE the DECLARED class still selects the gate: a self-declared T2 auto-accepts, tokenless", () => {
    ws = freshWorkspace()
    const door = createGovernedEmit({
      store: ws.store,
      gate: HOLDS,
      policy: policyOf({ core: ["alice"] }),
      actor: "alice",
      // NO ratify token at all. A T0 fact would be refused; a self-declared T2 is not, because on a CREATE
      // there is no incumbent to derive a class from and `derivedTier` is deliberately ABSENT.
    })
    const fresh: GroundedFact = advisoryFact({
      anchor: "src/new.ts::mint",
      scope: "core",
      tier: "T2",
      claimNorm: "minted",
    })
    expect(door.emit(fresh, AT).emitted).toBe(true)
    // The other half of the same open question, for contrast: declaring T0 makes the author's OWN gate
    // harder (the join is one-way), so the class is not a free choice in the permissive direction only.
    const strict = advisoryFact({ anchor: "src/new2.ts::mint", scope: "core", tier: "T0", claimNorm: "strict" })
    expect(reasonOf(door.emit(strict, AT).rejected)).toBe("unratified")
  })
})
