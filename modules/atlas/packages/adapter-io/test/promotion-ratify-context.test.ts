// @atlas/adapter-io — test/promotion-ratify-context.test.ts  (the CONTEXT the write door hands to `route`)
//
// `governed-emit-route.ts` is the seam that answers "which gate does this write owe". Two fields on it are
// DOOR-DERIVED (ARCH-9): `derivedTier` (pinned by `arch9-door-derivation.test.ts`) and `origin`. This file
// pins the second, at the seam itself rather than at a literal a test wrote — because the door calls
// `ratifyCtxFor`, and a test that agrees with its own hand-built context proves nothing about the door.

import { describe, it, expect } from "vitest"
import { route } from "@atlas/knowledge"
import type { Candidate } from "@atlas/knowledge"
import { ratifyCtxFor } from "../src/governed-emit-route.js"
import { minedFact } from "./harness/promote-fixtures.js"

const staged = (): Candidate =>
  minedFact({ anchor: "src/pay.ts::charge", claimNorm: "a mined claim" }) as unknown as Candidate

describe("ARCH-9/KNOW-8 — `ratifyCtxFor` carries the verdicts + origin without forging store state", () => {
  const AUTO = { lowRisk: true, contested: false }
  it("the AUTHORED context is byte-identical to what it always was (no origin key at all)", () => {
    // Back-compat: with the derived verdicts supplied (a clean T2 advisory that cleared the truth gate),
    // the context is exactly the pre-existing `{contested:false, lowRisk:true}` — no origin key, no default.
    expect(ratifyCtxFor(undefined, AUTO)).toEqual({ contested: false, lowRisk: true })
    expect("origin" in ratifyCtxFor(undefined, AUTO)).toBe(false)
    expect(ratifyCtxFor("T0", AUTO)).toEqual({ contested: false, lowRisk: true, derivedTier: "T0" })
  })

  it("the PROMOTED context adds ONE true field and changes nothing else", () => {
    // teeth: breaks-on "route the promotion by forging `contested:true`" and on "…by forging `lowRisk:false`".
    expect(ratifyCtxFor(undefined, AUTO, "promoted")).toEqual({ contested: false, lowRisk: true, origin: "promoted" })
    expect(ratifyCtxFor("T2", AUTO, "promoted")).toEqual({
      contested: false,
      lowRisk: true,
      derivedTier: "T2",
      origin: "promoted",
    })
  })

  it("and that context really does take a mined candidate to FULL RATIFICATION", () => {
    expect(route(staged(), ratifyCtxFor(undefined, AUTO))).toBe("auto-accept") // clean derived → auto
    expect(route(staged(), ratifyCtxFor(undefined, AUTO, "promoted"))).toBe("full-ratify") // promoted → ratify
    expect(route(staged(), ratifyCtxFor(undefined, { lowRisk: false, contested: false }))).toBe("full-ratify") // ungrounded → ratify
  })
})
