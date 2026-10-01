// @atlas/adapter-io — test/arch-d3b-claim-launder.test.ts  (ARCH-D3b security regression)
//
// THE HOLE (reproduced, then closed): the CREATE leg's ratification routing is SOUND — a tokenless actor
// cannot mint a node at a governing class (T0/T1); the one-way `strictestTier` join sends any such
// declaration to full ratification (CONTROL below). But the node carries ONE governance tier over a SET of
// claims, and `upsert`'s UPDATE branch used to UNION claims unconditionally. So a tokenless actor could seed
// a T2 advisory at an (anchor, slot), and a LATER, legitimate tier-RAISE by a ratifier at the SAME address
// would relabel the seeded weaker-tier claim as ratified at the new tier and serve it in the tier≥T1
// governing band (TOOLS-6). Intra-scope, poison-and-wait — the ratifier vouches for a DIFFERENT proposition,
// and the union silently promoted the attacker's.
//
// THE FIX (upsert.ts UPDATE branch): a write that RAISES the node to a governing class REPLACES the claim set
// with the raiser's own assertion instead of unioning — a raise is a supersession point for the place, and
// the raiser vouches only for what they (re-)assert. Same-tier accretion is unchanged (still unioned); that
// invariant is covered by the rest of the door suite, which this fix leaves green.
//
// Drives the REAL createGovernedEmit over a REAL createDiskStore, read back through the REAL
// createProjectionQueryIndex + the REAL @atlas/tools `atLeastT1` governing-band predicate.

import { describe, it, expect, afterEach } from "vitest"
import type { Hash } from "@atlas/contracts"
import { atLeastT1 } from "@atlas/tools"
import { createGovernedEmit } from "../src/governed-emit.js"
import { createProjectionQueryIndex } from "../src/projection-query-index.js"
import type { QueryIndex } from "@atlas/tools"
import { AT, HOLDS, advisoryFact, keyOf, policyOf, freshWorkspace } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
})

const structuralStub: QueryIndex = {
  cover: () => ({ territory: "t", axisHash: "ax" as unknown as Hash, invariants: [], stale: false }),
}

const ANCHOR = "src/auth.ts::verify"
const POISON = "verify() returns true when NODE_ENV=test"
const LEGIT = "verify() checks the request signature"

describe("ARCH-D3b — a tokenless T2 squat cannot be laundered into the governing band by a later tier-raise", () => {
  it("CONTROL: a tokenless CREATE declaring T1 or T0 is refused (the direct privileged mint is fail-closed)", () => {
    ws = freshWorkspace()
    const tokenless = createGovernedEmit({
      store: ws.store,
      gate: HOLDS,
      policy: policyOf({ core: ["mallory"] }),
      actor: "mallory",
    })
    expect(
      tokenless.emit(advisoryFact({ anchor: ANCHOR, scope: "core", tier: "T1", claimNorm: "x" }), AT).emitted,
    ).toBe(false)
    expect(
      tokenless.emit(advisoryFact({ anchor: ANCHOR, scope: "core", tier: "T0", claimNorm: "x" }), AT).emitted,
    ).toBe(false)
  })

  it("FIX: mallory (no token) pre-seeds a T2 claim; billy raises the SAME address to T0; the poison is SEVERED, not served", () => {
    ws = freshWorkspace()
    const policy = policyOf({ core: ["mallory", "billy"] })

    // STEP 1 — mallory, holding NO ratify token, mints a T2 advisory at the auth anchor. Auto-accepts (T2 floor).
    const mallory = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "mallory" })
    const poison = advisoryFact({ anchor: ANCHOR, scope: "core", tier: "T2", claimNorm: POISON })
    expect(mallory.emit(poison, AT).emitted).toBe(true)

    // STEP 2 — billy legitimately ratifies a T0 fact at the SAME (anchor, slot). Advisory family ⇒ UPDATE, and
    // because this RAISES the class T2→T0 the claim set is REPLACED, not unioned.
    const billy = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "billy", ratifyToken: "billy" })
    const legit = advisoryFact({ anchor: ANCHOR, scope: "core", tier: "T0", claimNorm: LEGIT, gen: 2 })
    expect(billy.emit(legit, AT).emitted).toBe(true)

    // READ — the real projection query index, then the real governing-band predicate.
    const targetKey = keyOf(poison) // == keyOf(legit): same anchor+slot ⇒ one nodeKey
    const cover = createProjectionQueryIndex(structuralStub, ws.store).cover("src")
    const served = cover.invariants.find((i) => (i.nodeId as unknown as string) === targetKey)

    // The node IS served in the governing band — it is a legitimately-ratified T0 fact now...
    expect(served).toBeDefined()
    expect(served!.tier).toBe("T0")
    expect(atLeastT1(served!)).toBe(true)
    // ...but it carries ONLY what billy ratified. Mallory's tokenless proposition was severed by the raise.
    expect(served!.claim).toContain(LEGIT)
    expect(served!.claim).not.toContain(POISON)
  })
})
