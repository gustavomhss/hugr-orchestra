// @atlas/adapter-io — test/door-regression-supersede-sameas.test.ts  (DOOR-LEVEL, defect 1)
//
// DEFECT. `upsert`'s SUPERSEDE arm reconstructs the `CurrentNode` from scratch instead of spreading
// `...prior` first, so every field the arm does not name is DROPPED — and `sameAs` is such a field. Two
// ORDINARY governed re-evidence writes (same scope, same class, same check, an ordinary non-billy
// ratifier) therefore erase a human-asserted, billy-signed equivalence. Reproduced at the reducer; NEVER
// pinned through the composed doors, which is where it matters, because the read fold and the link door
// both consume the STORED relation off the rehydrated projection.
//
// WHY THE CLASS, AND NOT ONLY THE EDGE. `governed-link.ts` prices BOTH its authz gate and its KNOW-8
// ratify gate over `sameAsClassOf` — the transitive class, not the named edge. A SMALLER class therefore
// UNDER-CHARGES a signature: a link that had to be signed by billy (because a T0 node was reachable) becomes
// signable by any ratifier once the path to that T0 node is gone. Shrinkage is the bypass direction, so
// DOOR-SAMEAS-2 asserts the class AND the price, not just the read-surface edge.
//
// ROUTE IS ASSERTED BEFORE OUTCOME. Both cases assert WHICH route the re-evidence write took (a SUPERSEDE:
// the node count is unchanged, the contentHash advanced, `supersededBy` points at the prior bytes) before
// asserting the sameAs outcome — so a write that quietly became a CREATE, a DEDUP no-op or an UPDATE can
// never masquerade as a passing regression test.

import { afterEach, describe, expect, it } from "vitest"
import { deriveSameAs, sameAsClassOf } from "@atlas/knowledge"
import { createGovernedEmit } from "../src/governed-emit.js"
import { createGovernedLink } from "../src/governed-link.js"
import { rehydrateProjection } from "../src/store.js"
import { AT, HOLDS, freshWorkspace, hashOf, keyOf, policyOf, predicateFact } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

let ws: Workspace | undefined

function cleanup(): void {
  if (ws !== undefined) ws.dispose()
  ws = undefined
}
afterEach(cleanup)

describe("DOOR REGRESSION — a SUPERSEDE must not destroy a sameAs edge", () => {
  it("DOOR-SAMEAS-1 — two ordinary re-evidence writes keep the signed edge on the read surface", () => {
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice"] })
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "lead" })

    const a1 = predicateFact({ anchor: "src/pay.ts::charge", expr: "amount >= 0", scope: "core", gen: 1 })
    const b1 = predicateFact({ anchor: "src/ship.ts::send", expr: "weight >= 0", scope: "core", gen: 1 })
    expect(alice.emit(a1, AT).emitted).toBe(true)
    expect(alice.emit(b1, AT).emitted).toBe(true)
    const ka = keyOf(a1)
    const kb = keyOf(b1)
    expect(ka).not.toBe(kb)

    // billy signs the equivalence through the REAL governed link door.
    const signed = createGovernedLink({ store: ws.store, policy, actor: "alice", ratifyToken: "billy" })
    expect(signed.link(ka, kb).linked).toBe(true)
    const before = deriveSameAs(rehydrateProjection(ws.store))
    expect(before).toHaveLength(1) // PREMISE: the edge really is on the read surface before the re-evidence

    // Two ORDINARY governed re-evidence writes: same anchor, same check, same scope, same class, and an
    // ordinary non-billy ratifier. Nothing about either write asks to touch the equivalence.
    const a2 = predicateFact({ anchor: "src/pay.ts::charge", expr: "amount >= 0", scope: "core", gen: 2 })
    const b2 = predicateFact({ anchor: "src/ship.ts::send", expr: "weight >= 0", scope: "core", gen: 2 })
    expect(alice.emit(a2, AT).emitted).toBe(true)
    expect(alice.emit(b2, AT).emitted).toBe(true)

    // INTERMEDIATE — WHICH ROUTE was taken, asserted BEFORE the outcome so a misroute cannot pass as a fix.
    const proj = rehydrateProjection(ws.store)
    expect(proj.current.size).toBe(2) // no CREATE minted a third node at a new key
    const nodeA = proj.current.get(ka)
    const nodeB = proj.current.get(kb)
    expect(nodeA?.contentHash).toBe(hashOf(a2)) // not a DEDUP no-op — the bytes advanced
    expect(nodeB?.contentHash).toBe(hashOf(b2))
    expect(nodeA?.supersededBy).toBe(hashOf(a1)) // SUPERSEDE — lineage points at the prior generation
    expect(nodeB?.supersededBy).toBe(hashOf(b1))

    // TEETH — the human-asserted equivalence survives an ordinary re-evidence of BOTH of its endpoints.
    expect(deriveSameAs(proj)).toEqual(before)
    expect(nodeA?.sameAs).toContain(kb)
    expect(nodeB?.sameAs).toContain(ka)
  })

  it("DOOR-SAMEAS-2 — re-evidence must not shrink the class a link signature is priced over", () => {
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice"] })
    const byBilly = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "billy" })
    const byLead = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "lead" })

    const a1 = predicateFact({
      anchor: "src/auth.ts::verify",
      expr: "token is valid",
      scope: "core",
      tier: "T0",
      gen: 1,
    })
    const b1 = predicateFact({ anchor: "src/util.ts::pad", expr: "len >= 0", scope: "core", tier: "T2", gen: 1 })
    const m1 = predicateFact({ anchor: "src/mine.ts::own", expr: "mine holds", scope: "core", tier: "T2", gen: 1 })
    expect(byBilly.emit(a1, AT).emitted).toBe(true) // a T0 fact commits ONLY under the billy token
    expect(byLead.emit(b1, AT).emitted).toBe(true)
    expect(byLead.emit(m1, AT).emitted).toBe(true)
    const ka = keyOf(a1)
    const kb = keyOf(b1)
    const km = keyOf(m1)

    const signed = createGovernedLink({ store: ws.store, policy, actor: "alice", ratifyToken: "billy" })
    const cheap = createGovernedLink({ store: ws.store, policy, actor: "alice", ratifyToken: "lead" })
    expect(signed.link(ka, kb).linked).toBe(true)

    // PREMISE — the price of a link is the CLASS. With the T0 node A reachable from B, a link onto B is a
    // T0 act: an ordinary ratifier is refused. This is the exact charge the defect would let a caller dodge.
    expect(sameAsClassOf(rehydrateProjection(ws.store), kb)).toContain(ka)
    const pricedBefore = cheap.link(kb, km)
    expect(pricedBefore.linked).toBe(false)
    expect(pricedBefore.rejected ?? "").toContain("unratified")

    // Ordinary re-evidence of BOTH endpoints of the signed edge — B by any ratifier, A by billy (a T0 node
    // may only be re-evidenced with the billy token, so this is the ROUTINE act of its own ratifier).
    const b2 = predicateFact({ anchor: "src/util.ts::pad", expr: "len >= 0", scope: "core", tier: "T2", gen: 2 })
    const a2 = predicateFact({
      anchor: "src/auth.ts::verify",
      expr: "token is valid",
      scope: "core",
      tier: "T0",
      gen: 2,
    })
    expect(byLead.emit(b2, AT).emitted).toBe(true)
    expect(byBilly.emit(a2, AT).emitted).toBe(true)

    // INTERMEDIATE — both writes really took the SUPERSEDE route (asserted before the outcome).
    const proj = rehydrateProjection(ws.store)
    expect(proj.current.size).toBe(3)
    expect(proj.current.get(kb)?.supersededBy).toBe(hashOf(b1))
    expect(proj.current.get(ka)?.supersededBy).toBe(hashOf(a1))

    // TEETH — the class did not shrink, and the link onto B is STILL priced as the T0 act it is.
    expect(sameAsClassOf(proj, kb)).toContain(ka)
    const pricedAfter = cheap.link(kb, km)
    expect(pricedAfter.linked).toBe(false)
    expect(pricedAfter.rejected ?? "").toContain("unratified")
  })
})
