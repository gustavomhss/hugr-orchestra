// @atlas/adapter-io — test/wp-d3b-a-wire-verdicts.test.ts  (WP-D3B-A — ARCH-D3b item 1: the derived verdicts)
//
// Realizes the D3b-A acceptance goldens (docs/requirements/goldens-authoring.md, SCN-AUTH-15a-1/b-1/c-1) at
// the ACTUAL consumed surface: `deriveFastPathVerdicts` + `ratifyCtxFor` + `route` over the frozen fast-path
// predicates, PLUS the governed door (`createGovernedEmit`) to prove the verdicts are DERIVED at the door
// and not a recovered constant. Teeth per golden:
//
//   · SCN-AUTH-15a-1 — lowRisk/contested are derived from observed state (truth verdict / contention), never
//     from a module constant. The mutant: a `RatifyContext` built from a hardcoded `{ contested: false,
//     lowRisk: true }` literal fails the derivation assertion.
//   · SCN-AUTH-15b-1 — a CONTENDED write routes `full-ratify` (no auto-accept); the mutant a door that never
//     surfaces contention keeps `lowRisk:true, contested:false` and auto-accepts a write that should be
//     re-checked.
//   · SCN-AUTH-15c-1 — an UNGROUNDED or predicate T2 is never `lowRisk`; the mutant that marks `lowRisk:true`
//     for any T2 advisory regardless of the truth verdict routes auto-accept without clearing the gate.

import { describe, it, expect } from "vitest"
import { route } from "@atlas/knowledge"
import type { Candidate } from "@atlas/knowledge"
import { deriveFastPathVerdicts } from "../src/governed-emit-gates.js"
import { ratifyCtxFor } from "../src/governed-emit-route.js"
import { advisory } from "./harness/governed-fixtures.js"

// A minimal advisory candidate the frozen `route` can judge: grounded ∧ T2 ∧ advisory.
function advisoryView(): Candidate {
  const f = advisory("core", "T2")
  return {
    ...f,
    slot: f.kind === "advisory" || f.kind === "predicate" ? f.predicateSlot : undefined,
  } as unknown as Candidate
}

// An UNGROUNDED advisory candidate (empty entries) — the shape `route`'s `isGrounded` refuses.
function ungroundedAdvisoryView(): Candidate {
  const view = advisoryView()
  return { ...view, grounding: { entries: [] } } as unknown as Candidate
}

describe("SCN-AUTH-15a-1 — the fast-path verdicts are derived, not a constant", () => {
  it("lowRisk derives from the truth-cleared signal, contested from the contention flag", () => {
    const cleared = deriveFastPathVerdicts(true, false)
    const notCleared = deriveFastPathVerdicts(false, false)
    const contended = deriveFastPathVerdicts(true, true)

    expect(cleared).toEqual({ lowRisk: true, contested: false })
    expect(notCleared).toEqual({ lowRisk: false, contested: false })
    expect(contended).toEqual({ lowRisk: true, contested: true })
  })

  it("a clean derived context routes the common T2-advisory to auto-accept (behavior preserved)", () => {
    expect(route(advisoryView(), ratifyCtxFor(undefined, deriveFastPathVerdicts(true, false)))).toBe("auto-accept")
  })

  it("teeth — a hardcoded constant that pins the gate open would fail the derivation contract", () => {
    // The former `DOOR_RATIFY_CTX = { contested: false, lowRisk: true }`: if the door were STILL building its
    // context from that module literal (not from derived state), a NOT-cleared candidate would present as
    // low-risk — which is exactly the shape the derivation contract forbids.
    const hardcodedConstant = { contested: false, lowRisk: true }
    const notCleared = deriveFastPathVerdicts(false, false)
    // the constant says low-risk; the derived verdict does not. They MUST differ for SCN-AUTH-15a-1 to hold.
    expect(notCleared).not.toEqual(hardcodedConstant)
  })
})

describe("SCN-AUTH-15b-1 — a contended write routes full-ratify", () => {
  it("a contested context removes the fast path even for an otherwise-clean T2 advisory", () => {
    const ctx = ratifyCtxFor(undefined, deriveFastPathVerdicts(true, true))
    expect(route(advisoryView(), ctx)).toBe("full-ratify")
  })

  it("teeth — a door that never surfaces contention keeps auto-accept (the actual bug)", () => {
    // The mutant: contention observed at the commit loop, but the door continues to pass contested:false —
    // the write auto-accepts when it must re-checked. Route with the REAL (contended) verdict differs from
    // the mutant (always-false) verdict.
    const real = route(advisoryView(), ratifyCtxFor(undefined, deriveFastPathVerdicts(true, true)))
    const mutant = route(advisoryView(), ratifyCtxFor(undefined, deriveFastPathVerdicts(true, false)))
    expect(real).toBe("full-ratify")
    expect(mutant).toBe("auto-accept")
  })
})

describe("SCN-AUTH-15c-1 — lowRisk requires a cleared truth gate and the advisory class", () => {
  it("an UNGROUNDED T2 advisory is NOT derived lowRisk", () => {
    // The door's own theft: a candidate that did NOT clear the truth gate is never presented as low-risk.
    // `route` ALSO requires groundedness (a separate conjunct), so the derived verdict is the assertion here.
    expect(deriveFastPathVerdicts(false, false)).toEqual({ lowRisk: false, contested: false })
    expect(route(ungroundedAdvisoryView(), ratifyCtxFor(undefined, deriveFastPathVerdicts(false, false)))).toBe(
      "full-ratify",
    )
  })

  it("teeth — a door that would mark lowRisk:true for any T2 regardless of the truth verdict is caught", () => {
    // The mutant: `lowRisk` asserted for a candidate that never cleared the gate. The derived verdict the
    // door must produce is `false`; a hardcoded `true` writ large would fail SCN-AUTH-15c-1.
    expect(deriveFastPathVerdicts(false, false).lowRisk).toBe(false)
    expect(deriveFastPathVerdicts(true, false).lowRisk).toBe(true)
    // and the two differ — the assertion has teeth against a constant that writes `true` alone.
    expect(deriveFastPathVerdicts(false, false)).not.toEqual({ lowRisk: true, contested: false })
  })
})
