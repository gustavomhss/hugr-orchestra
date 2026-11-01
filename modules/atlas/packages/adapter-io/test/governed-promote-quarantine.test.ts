// @atlas/adapter-io — test/governed-promote-quarantine.test.ts  (genesis-hardening A8, owner decision D1)
//
// A staged candidate whose fact carries `quarantine` (admitted only because a sound proof abstained) is
// refused `quarantined` by the REAL promotion door over the REAL governed emit leg, under a policy and token
// that DO promote an unmarked candidate. The row stays staged and nothing reaches the projection — which is
// the only thing `own-export` reads, so the promote refusal is also what keeps it out of an export.

import { describe, it, expect } from "vitest"
import { asHash } from "@atlas/kernel"
import type { GroundedFact } from "@atlas/knowledge"
import { createGovernedEmit } from "../src/governed-emit.js"
import { createGovernedPromote, REJECTED_QUARANTINED } from "../src/governed-promote.js"
import { HOLDS_GATE } from "./harness/governed-fixtures.js"
import { CURATOR, CURATOR_POLICY, makePromoteFixture, minedFact, realKey } from "./harness/promote-fixtures.js"
import { reasonOf } from "./door-regression-support.js"

const AT = asHash("deadbeef")

const promote = (fx: ReturnType<typeof makePromoteFixture>) =>
  createGovernedPromote({
    store: fx.store,
    emit: createGovernedEmit({
      store: fx.store,
      gate: HOLDS_GATE,
      policy: CURATOR_POLICY,
      actor: CURATOR,
      origin: "promoted",
      ratifyToken: CURATOR,
    }).emit,
  }).promote(AT)

describe("genesis-hardening A8 — `atlas promote` refuses a quarantined candidate", () => {
  it("a marked row is refused `quarantined`, stays staged, and never reaches the projection", () => {
    const fx = makePromoteFixture()
    const marked = {
      ...minedFact({ anchor: "src/pay.ts::charge", claimNorm: "charge() depends on the ledger" }),
      quarantine: "abstained-proof",
    } as GroundedFact
    fx.stage(marked)

    const out = promote(fx)

    expect(out.candidates).toBe(1)
    expect(out.promoted).toBe(0)
    expect(out.rows[0]!.rejected).toBe(REJECTED_QUARANTINED)
    expect(reasonOf(out.rows[0]!.rejected)).toBe("quarantined")
    expect(fx.persists()).toHaveLength(0) //                          nothing published
    expect(fx.projection().current.get(realKey(marked))).toBeUndefined() // so own-export cannot see it
    // still staged: a second pass presents (and refuses) it again
    expect(promote(fx).rows[0]!.rejected).toBe(REJECTED_QUARANTINED)
  })

  it("CONTROL — the same candidate WITHOUT the mark promotes under the same policy and token", () => {
    const fx = makePromoteFixture()
    const plain = minedFact({ anchor: "src/pay.ts::charge", claimNorm: "charge() depends on the ledger" })
    fx.stage(plain)

    const out = promote(fx)

    expect(out.promoted).toBe(1)
    expect(fx.projection().current.get(realKey(plain))).toBeDefined()
  })
})
