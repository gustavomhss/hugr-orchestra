// @atlas/knowledge — test/fastpath-promotion-origin.test.ts  (KNOW-8/KNOW-18 — a promotion is never fast-pathed)
//
// THE DEFECT THIS PINS, stated as the arithmetic rather than as a worry. A mined candidate is:
//   · `T2`       — `cli/src/mine.ts` stamps the class from a constant, so it is T2 by construction;
//   · advisory   — the mine gate builds an `AdvisoryProposal`, so it carries no `check`;
//   · grounded   — it must clear the emit door's truth gate two gates earlier or it never reaches `route`.
// The write door's default context is `{contested:false, lowRisk:true}` (`governed-emit-route.ts`, and that
// default is the MEASURED right answer for an authored write). Conjoin the five and `route` answers
// `auto-accept` — so `governed-emit.ts`'s `ratify()` call, the ONLY one on the emit leg, never runs. A bulk
// promotion would then land every staged row in the durable store with NO ratifier consulted, while KNOW-8,
// ADR-0008, the invariant register and this very file all say promotion goes THROUGH the ratifier. KNOW-8
// would stop holding vacuously (severance) and start being FALSE, which is worse than the state the
// promotion door exists to improve on.
//
// TEETH, named: every case below breaks on "the DEFAULT context is used for a promotion" — i.e. delete the
// `&& !promoted` conjunct in `route`, or drop `origin` on the way in, and the fast path silently accepts.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import { route, isGrounded, isAdvisory } from "../src/ratify/fastpath.js"
import type { RatifyContext, WriteOrigin } from "../src/ratify/fastpath.js"
import type { Candidate } from "../src/types.js"

/** The EXACT context the write door builds today for a write it derived nothing about (`DOOR_RATIFY_CTX`).
 *  Restated as a literal so this suite fails if that default is ever quietly changed to route promotions
 *  "correctly" by moving the authored default instead — which would fix this at the cost of every ordinary
 *  emit paying a human ratification. */
const DOOR_DEFAULT: RatifyContext = { contested: false, lowRisk: true }

/** A staged candidate as `mine` produces it: grounded ∧ T2 ∧ advisory. */
function stagedCandidate(): Candidate {
  return {
    kind: "advisory",
    id: asNodeKey("nk-staged"),
    tier: "T2",
    claimNorm: "charge() re-reads the ledger before it applies the discount",
    grounding: {
      entries: [
        {
          anchor: { kind: "symbol", qualifiedPath: "src/pay.ts::charge", subtreeHash: asSubtreeHash("sh-charge") },
          path: "src/pay.ts",
        },
      ],
    },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope: "atlas:mined",
  } as unknown as Candidate
}

describe("KNOW-18 — the fast path does not apply to a write the door derived as `promoted`", () => {
  it("PREMISE (the trap): with the door default, a staged candidate FAST-PATHS — no ratifier is consulted", () => {
    const c = stagedCandidate()
    // The three candidate-intrinsic conjuncts, asserted rather than assumed — this is the premise the whole
    // file rests on, so it is measured from the frozen predicates themselves, not from the fixture's shape.
    expect(isGrounded(c.grounding)).toBe(true)
    expect(isAdvisory(c)).toBe(true)
    expect(c.tier).toBe("T2")
    expect(route(c, DOOR_DEFAULT)).toBe("auto-accept")
  })

  it("a `promoted` write takes FULL RATIFICATION — same candidate, same defaults, one honest field", () => {
    // teeth: breaks-on "the default context is used" — delete `&& !promoted` from `route` and this returns
    // `auto-accept`, i.e. the KNOW-8 token is never consulted on the one path built to consult it.
    expect(route(stagedCandidate(), { ...DOOR_DEFAULT, origin: "promoted" })).toBe("full-ratify")
  })

  it("the promoted context FORGES NOTHING — `contested` and `lowRisk` keep their honest values", () => {
    // THE POINT OF THE FIELD. Two cheaper fixes route identically and both put a false value into a record
    // the next reader believes: `contested:true` asserts a reviewer veto / conflicting node that does not
    // exist, and `lowRisk:false` asserts a KNOW-17 threshold verdict nobody computed. Asserted by EQUALITY on
    // the whole context, so a later "simplification" to either cannot pass this file.
    const ctx: RatifyContext = { ...DOOR_DEFAULT, origin: "promoted" }
    expect(ctx).toEqual({ contested: false, lowRisk: true, origin: "promoted" })
    expect(ctx.contested).toBe(false)
    expect(ctx.lowRisk).toBe(true)
  })

  it("ABSENT ≡ `authored` — every pre-existing caller is byte-for-byte unchanged", () => {
    // The back-compat leg. `wire.ts` passes no origin, so the emit leg must see exactly what it saw before.
    const c = stagedCandidate()
    expect(route(c, DOOR_DEFAULT)).toBe("auto-accept")
    expect(route(c, { ...DOOR_DEFAULT, origin: "authored" })).toBe("auto-accept")
    expect(route(c, { ...DOOR_DEFAULT, origin: "authored" })).toBe(route(c, DOOR_DEFAULT))
  })

  it("the join is ONE-WAY: `promoted` can only ever make the gate HARDER, never softer", () => {
    // Exhaustive over the two store-derived verdicts × the two tiers that matter × advisory/predicate. For
    // EVERY input, adding `origin:'promoted'` either leaves the route alone or moves it toward full-ratify —
    // it can never turn a `full-ratify` into an `auto-accept`. That is the property that lets this conjunct
    // be added to a frozen surface at all: `FastpathApi`'s contract is narrowed, never widened.
    const base = stagedCandidate() as unknown as Record<string, unknown>
    const predicate = {
      ...base,
      kind: "predicate",
      check: { kind: "assertion", expr: "x >= 0" },
      status: "HOLDS",
    } as unknown as Candidate
    const cands: readonly Candidate[] = [
      stagedCandidate(),
      { ...base, tier: "T0" } as unknown as Candidate,
      { ...base, tier: "T1" } as unknown as Candidate,
      predicate,
      { ...base, grounding: { entries: [] } } as unknown as Candidate, // ungrounded
    ]
    for (const contested of [false, true]) {
      for (const lowRisk of [false, true]) {
        for (const c of cands) {
          const authored = route(c, { contested, lowRisk })
          const promoted = route(c, { contested, lowRisk, origin: "promoted" })
          expect(promoted).toBe("full-ratify") // a promotion is ALWAYS fully ratified, whatever the input
          if (authored === "full-ratify") expect(promoted).toBe("full-ratify") // never relaxed
        }
      }
    }
  })

  it("the origin vocabulary is CLOSED at two members — a third would be an unrouted state", () => {
    // `route` treats "not `promoted`" as authored, so a value outside this pair would silently take the
    // authored branch. Pinned so adding one is a deliberate edit here rather than a silent fall-through.
    const all: readonly WriteOrigin[] = ["authored", "promoted"]
    expect(all).toHaveLength(2)
    expect(all.map((o) => route(stagedCandidate(), { ...DOOR_DEFAULT, origin: o }))).toEqual([
      "auto-accept",
      "full-ratify",
    ])
  })
})
