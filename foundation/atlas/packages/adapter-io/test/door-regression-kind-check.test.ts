// @atlas/adapter-io — test/door-regression-kind-check.test.ts  (DOOR-LEVEL, defect 4)
//
// DEFECT. Three separate places on the write path ask "is this a predicate?" and they ask DIFFERENT
// questions: `nodeKey` discriminates the family by the PRESENCE OF `check`, `upsert` is handed
// `family: node.kind`, and `route` consults `check` again. All three inputs are author-controlled, and
// nothing reconciles them. Keeping the `check` while DECLARING `kind:'advisory'` therefore mints the
// PREDICATE identity — landing squarely on an existing predicate node — and then routes the write as an
// UPDATE instead of a SUPERSEDE. Two things follow, and both are silent: the advisory `claimNorm` (free
// text) is set-unioned onto a node the read side treats as a predicate, and the node's bytes advance
// WITHOUT a new `supersededBy` generation, so a link in the supersede lineage is skipped rather than
// recorded. A fact is either checkable or it is not; a payload that claims both is not a fact.
//
// TWO CASES. DOOR-KIND-1 pins the refusal and the untouched incumbent. DOOR-KIND-2 pins the LEGITIMATE
// side, which is the half a refusal-only test would let rot: an honest re-evidence must still advance the
// lineage exactly one generation per write, so a fix cannot be "refuse everything that carries a check".
//
// ROUTE ASSERTED BEFORE OUTCOME. The identity collision is asserted (`keyOf(liar) === keyOf(p1)`) and the
// incumbent's family is read off the projection BEFORE the write is driven, so a contradiction that merely
// missed the node — and was refused, or harmlessly created its own node elsewhere — can never be mistaken
// for the door having refused the contradiction.

import { afterEach, describe, expect, it } from "vitest"
import { createGovernedEmit } from "../src/governed-emit.js"
import { rehydrateProjection } from "../src/store.js"
import { AT, HOLDS, freshWorkspace, hashOf, keyOf, policyOf, predicateFact } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { GroundedFact } from "@atlas/knowledge"

const ANCHOR = "src/ledger.ts::post"
const EXPR = "balance is never negative"
const FREE_TEXT = "injected free text on a checkable node"

/** The contradictory payload: it DECLARES the advisory family while KEEPING the `check`, so the three
 *  family questions on the write path disagree with each other. Typed through `unknown` because the TS
 *  union forbids the shape — which is the point: `atlas emit` is JSON.parse plus a cast, so the wire can
 *  produce exactly this and the type system is not in the path. */
function contradiction(): GroundedFact {
  const raw = {
    kind: "advisory",
    id: asNodeKey("gen-liar"),
    tier: "T2",
    claimNorm: FREE_TEXT,
    check: { kind: "assertion", expr: EXPR },
    grounding: {
      entries: [
        { anchor: { kind: "symbol", qualifiedPath: ANCHOR, subtreeHash: asSubtreeHash("sh-door") }, path: "x" },
      ],
    },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    predicateSlot: "invariant",
    scope: "core",
  }
  return raw as unknown as GroundedFact
}

let ws: Workspace | undefined

function cleanup(): void {
  if (ws !== undefined) ws.dispose()
  ws = undefined
}
afterEach(cleanup)

describe("DOOR REGRESSION — a declared kind must not contradict the check the payload carries", () => {
  it("DOOR-KIND-1 — a checkable payload declaring the advisory family is refused, incumbent untouched", () => {
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice"] })
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "lead" })

    const p1 = predicateFact({ anchor: ANCHOR, expr: EXPR, scope: "core", gen: 1 })
    const p2 = predicateFact({ anchor: ANCHOR, expr: EXPR, scope: "core", gen: 2 })
    expect(alice.emit(p1, AT).emitted).toBe(true)
    expect(alice.emit(p2, AT).emitted).toBe(true)

    const liar = contradiction()
    const key = keyOf(p1)
    // PREMISE — the contradiction mints the PREDICATE identity, so it lands on the predicate node. If this
    // were false the case would be testing a write that misses its target, which proves nothing.
    expect(keyOf(liar)).toBe(key)
    const beforeNode = rehydrateProjection(ws.store).current.get(key)
    expect(beforeNode?.family).toBe("predicate") // PREMISE — the incumbent is checkable
    expect(beforeNode?.contentHash).toBe(hashOf(p2))
    expect(beforeNode?.supersededBy).toBe(hashOf(p1))

    const out = alice.emit(liar, AT)

    // TEETH, DAMAGE FIRST — the node the read side serves as a predicate must be untouched: no free text
    // unioned onto it, and its bytes not replaced by an advisory blob. Asserted before the verdict so the
    // failure output NAMES the injection rather than reporting a bare boolean.
    const afterNode = rehydrateProjection(ws.store).current.get(key)
    expect(afterNode?.family).toBe("predicate")
    expect(afterNode?.claims).not.toContain(FREE_TEXT)
    expect(afterNode?.contentHash).not.toBe(hashOf(liar))
    expect(afterNode?.contentHash).toBe(hashOf(p2))
    // and no generation of supersede lineage was skipped: the pointer still names the generation it did.
    expect(afterNode?.supersededBy).toBe(hashOf(p1))

    // TEETH, VERDICT — refused, and refused on the contradiction rather than on a neighbouring gate.
    expect(out.emitted).toBe(false)
    expect(out.rejected ?? "").not.toMatch(/ungrounded/)
    expect(out.rejected ?? "").not.toMatch(/unauthorized/)
    expect(out.rejected ?? "").not.toMatch(/unratified/)
  })

  it("DOOR-KIND-2 — an honest re-evidence still advances the lineage exactly one generation per write", () => {
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice"] })
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "lead" })

    const p1 = predicateFact({ anchor: ANCHOR, expr: EXPR, scope: "core", gen: 1 })
    const p2 = predicateFact({ anchor: ANCHOR, expr: EXPR, scope: "core", gen: 2 })
    const p3 = predicateFact({ anchor: ANCHOR, expr: EXPR, scope: "core", gen: 3 })
    expect(alice.emit(p1, AT).emitted).toBe(true)
    expect(alice.emit(p2, AT).emitted).toBe(true)
    expect(alice.emit(p3, AT).emitted).toBe(true)

    const key = keyOf(p1)
    const proj = rehydrateProjection(ws.store)
    expect(proj.current.size).toBe(1) // one node per identity, three generations of bytes
    const node = proj.current.get(key)
    expect(node?.family).toBe("predicate")
    expect(node?.contentHash).toBe(hashOf(p3))
    expect(node?.supersededBy).toBe(hashOf(p2)) // the generation the third write superseded
    expect(proj.cas.has(hashOf(p1))).toBe(true) // every prior generation stays addressable
    expect(proj.cas.has(hashOf(p2))).toBe(true)
    expect(proj.cas.has(hashOf(p3))).toBe(true)
  })
})
