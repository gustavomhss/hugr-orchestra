// @atlas/adapter-io — test/door-regression-scope-wellformed.test.ts  (DOOR-LEVEL, defect 2)
//
// DEFECT. `scope` is declared `string | undefined` on `GroundedFact`, but nothing VALIDATES it at runtime:
// `atlas emit` is `JSON.parse` plus a cast and the MCP `node` schema declares a bare object, exactly as the
// door's own gate 0 says of `tier`. A JSON-reachable ARRAY scope (`"scope": ["core"]`) then walks straight
// through both scope gates by COERCION — `actorInScope` looks the value up with `hasOwnProperty`, and
// `["core"]` stringifies to the declared scope name — while the relocation gate compares `node.scope !==
// stored.scope` BY REFERENCE. A fresh array is a fresh object on every JSON.parse, so after ONE such write
// NOTHING ever equals the stored value again: the `(anchor, slot)` becomes permanently unwritable by ANYONE,
// billy included. `nodeKey` is deterministic over public code structure, so an attacker can PRE-COMPUTE the
// key of a symbol nobody has claimed yet and squat it.
//
// TWO CASES ON PURPOSE. DOOR-SCOPE-1 pins the refusal (the door must reject a malformed scope at the
// well-formedness gate). DOOR-SCOPE-2 pins THE BRICK, and it is the one that matters: it does not care what
// verdict the squat write gets — it records it and then asserts a LEGITIMATE write to the same anchor still
// succeeds. That case stays green under either remedy (refuse the value, or normalize it), and it is the
// property whose loss is unrecoverable — a refused write is an error message, a bricked anchor is a node
// nobody can ever author again.
//
// NEIGHBOURING-GUARD CONTROL. The squat write is the FIRST write at its identity, so there is no incumbent
// and the incumbent gates cannot fire at all; and the coercion premise is asserted DIRECTLY against
// `actorInScope`, which documents that the authz gate is not, and cannot be, the refusing gate.

import { afterEach, describe, expect, it } from "vitest"
import { createGovernedEmit } from "../src/governed-emit.js"
import { actorInScope } from "../src/policy.js"
import { rehydrateProjection } from "../src/store.js"
import { AT, HOLDS, advisoryFact, freshWorkspace, hashOf, keyOf, policyOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

const ANCHOR = "src/core.ts::settle"

let ws: Workspace | undefined

function cleanup(): void {
  if (ws !== undefined) ws.dispose()
  ws = undefined
}
afterEach(cleanup)

describe("DOOR REGRESSION — a malformed scope must be refused, and must never brick an anchor", () => {
  it("DOOR-SCOPE-1 — a JSON-reachable array scope is refused at the door, nothing persisted", () => {
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice"] })
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "lead" })

    // PREMISE — the authz gate CANNOT be the refuser: it says yes to the array by coercion. Asserted
    // against the real seam so this is a fact about the product, not a claim in a comment.
    const arrayScope = ["core"] as unknown as string
    expect(actorInScope(policy, "alice", arrayScope)).toBe(true)

    const squat = advisoryFact({ anchor: ANCHOR, claimNorm: "squatted claim", scope: ["core"], gen: 1 })
    // PREMISE — this is the FIRST write at that identity, so NO incumbent exists and none of the incumbent
    // gates (unverifiable / unauthorized-for-target / relocation / downgrade) can be what refuses it.
    expect(rehydrateProjection(ws.store).current.has(keyOf(squat))).toBe(false)

    const out = alice.emit(squat, AT)

    // TEETH — refused, and refused FOR THE SCOPE. The reason must not be one of the neighbouring refusals.
    expect(out.emitted).toBe(false)
    expect(out.rejected ?? "").toMatch(/scope/i)
    expect(out.rejected ?? "").not.toMatch(/ungrounded/)
    expect(out.rejected ?? "").not.toMatch(/unratified/)
    expect(out.rejected ?? "").not.toMatch(/malformed tier/)
    // and nothing landed: no node at the squatted key, no fact bytes in CAS.
    expect(rehydrateProjection(ws.store).current.has(keyOf(squat))).toBe(false)
  })

  it("DOOR-SCOPE-2 — after a malformed-scope write, the same anchor is STILL writable (no brick)", () => {
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice", "billy"] })
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "lead" })
    const billy = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "billy", ratifyToken: "billy" })

    const squat = advisoryFact({ anchor: ANCHOR, claimNorm: "squatted claim", scope: ["core"], gen: 1 })
    const legit = advisoryFact({ anchor: ANCHOR, claimNorm: "the real claim", scope: "core", gen: 2 })
    // PREMISE — the squat targets the SAME node the legitimate author will: `nodeKey` carries no scope, so
    // an attacker can pre-compute this key from public code structure alone.
    expect(keyOf(squat)).toBe(keyOf(legit))

    // Drive the squat and RECORD its verdict without judging it — this case is about what happens NEXT.
    const squatted = alice.emit(squat, AT)
    expect(typeof squatted.emitted).toBe("boolean")

    // TEETH — the legitimate, correctly-scoped, authorized write still lands.
    const out = alice.emit(legit, AT)
    expect(out.rejected ?? "").not.toMatch(/governance-relocation/)
    expect(out.emitted).toBe(true)

    // and it landed as the node the read side will serve — the anchor was never captured.
    const node = rehydrateProjection(ws.store).current.get(keyOf(legit))
    expect(node?.contentHash).toBe(hashOf(legit))
    expect(node?.claims).toContain("the real claim")

    // The unrecoverable shape is that NOBODY can write the anchor again — so the strictest signer in the
    // same scope is checked too: a brick locks out billy exactly as it locks out its own author.
    const byBilly = advisoryFact({ anchor: ANCHOR, claimNorm: "a ratified claim", scope: "core", gen: 3 })
    const rescue = billy.emit(byBilly, AT)
    expect(rescue.rejected ?? "").not.toMatch(/governance-relocation/)
    expect(rescue.emitted).toBe(true)
  })
})
