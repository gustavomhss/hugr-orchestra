// @atlas/adapter-io — test/door-regression-reject-disclosure.test.ts  (DOOR-LEVEL, defect 3)
//
// DEFECT. The emit door's own header states the precedence rule it is built on: a refusal may never tell
// the caller more about the incumbent than the gates it has already CLEARED entitle it to, and therefore
// `unauthorized for target` runs BEFORE the reasons that answer questions ABOUT THE STORED FACT, "because
// only an actor with authority in the incumbent's scope has earned those answers". The body does not do
// that: the CAS read-back is checked first, so an actor with authority in NO scope the node lives in gets
// `unverifiable target` when the incumbent's bytes are pruned and `unauthorized for target` when they are
// healthy. Those two strings are an oracle. A caller authorized only in `public` can stand outside a `core`
// node and read off whether its CAS bytes are intact — a probe it has no authority to run, repeatable over
// any anchor whose `nodeKey` it can compute, which is all of them.
//
// THIS IS WRITTEN AS AN INFORMATION-DISCLOSURE ASSERTION, NOT A REFUSAL ASSERTION. Both states already
// refuse; refusal is not the property. The property is INDISTINGUISHABILITY: the unauthorized caller must
// receive the SAME refusal in both states, so the door leaks no bit. Hence the teeth is an EQUALITY between
// the two `rejected` strings.
//
// ANTI-VACUITY. An equality can be satisfied by deleting the informative reason for everyone, which would be
// a worse door: an admin who reads `unauthorized` will try to fix a pruned CAS by granting a scope. So the
// last block asserts the CONVERSE for an actor who HAS earned the answer — the incumbent's own author still
// gets the honest `unverifiable target`, and that reason is NOT the one the stranger sees.

import { rmSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { Hash } from "@atlas/contracts"
import { createGovernedEmit } from "../src/governed-emit.js"
import { actorInScope } from "../src/policy.js"
import { rehydrateProjection } from "../src/store.js"
import { AT, HOLDS, advisoryFact, freshWorkspace, keyOf, policyOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

const ANCHOR = "src/core.ts::secret"

let ws: Workspace | undefined

function cleanup(): void {
  if (ws !== undefined) ws.dispose()
  ws = undefined
}
afterEach(cleanup)

describe("DOOR REGRESSION — a refusal must not disclose the health of a node the caller cannot touch", () => {
  it("DOOR-LEAK-1 — an unauthorized caller gets the SAME refusal whether or not the CAS bytes survive", () => {
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice"], public: ["mallory"] })
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "lead" })
    const mallory = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "mallory", ratifyToken: "lead" })

    const owned = advisoryFact({ anchor: ANCHOR, claimNorm: "a core-scoped claim", scope: "core", gen: 1 })
    expect(alice.emit(owned, AT).emitted).toBe(true)
    const key = keyOf(owned)

    // The probe: mallory declares the scope it DOES hold, at an identity it does not own. `nodeKey` carries
    // neither tier nor scope, so the probe lands on alice's node by construction.
    const probe = advisoryFact({ anchor: ANCHOR, claimNorm: "probe", scope: "public", gen: 9 })
    expect(keyOf(probe)).toBe(key) // PREMISE — the probe reaches the incumbent
    expect(actorInScope(policy, "mallory", "public")).toBe(true) // PREMISE — it clears the door's authz gate
    expect(actorInScope(policy, "mallory", "core")).toBe(false) //  PREMISE — and holds nothing over the node

    // STATE A — the incumbent is healthy: its bytes are in CAS and its class is confirmable.
    const stored = rehydrateProjection(ws.store).current.get(key)
    const addr = (stored?.contentHash ?? "") as unknown as Hash
    expect(ws.store.get(addr)).toBeDefined()
    const healthy = mallory.emit(probe, AT)
    expect(healthy.emitted).toBe(false)

    // STATE B — the same node, its CAS bytes pruned (a real prune: the value file is removed). The node is
    // still NAMED by the projection, so the door still resolves an incumbent — only its bytes are gone.
    rmSync(join(ws.casPath, String(addr).slice(0, 2), String(addr)))
    expect(ws.store.get(addr)).toBeUndefined() // PREMISE — the two states really do differ
    expect(rehydrateProjection(ws.store).current.has(key)).toBe(true)
    const pruned = mallory.emit(probe, AT)
    expect(pruned.emitted).toBe(false)

    // TEETH — indistinguishable, not merely both-refused: the stranger learns nothing about the incumbent.
    expect(pruned.rejected).toBe(healthy.rejected)

    // ANTI-VACUITY — an actor WITH authority in the incumbent's scope still earns the honest answer, and
    // that answer is NOT the one the stranger is handed.
    const reEvidence = advisoryFact({ anchor: ANCHOR, claimNorm: "a core-scoped claim", scope: "core", gen: 2 })
    const owner = alice.emit(reEvidence, AT)
    expect(owner.emitted).toBe(false)
    expect(owner.rejected ?? "").toMatch(/unverifiable/)
    expect(owner.rejected).not.toBe(healthy.rejected)
  })
})
