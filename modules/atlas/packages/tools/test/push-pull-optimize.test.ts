// @atlas/tools — test/push-pull-optimize.test.ts   (TOOLS-14c — `pullOptimize`, the optimisation branch)
//
// `PhaseHook.pullOptimize` is a PUBLISHED method of the TOOLS-14 surface with, at this commit, ZERO call
// sites anywhere in the repo — no product code, no test. It was therefore free to mean anything: the mutant
// `harness.nativePull === 'available'` → `!==` (which uses the pull port on precisely the harnesses that do
// NOT offer native pull, and ignores it on the ones that do) survived the whole `packages/tools` suite.
// That is not an equivalent mutant — it INVERTS the branch — it was simply unexercised.
//
// THE CONTRACT, as `src/push.ts` publishes it: "use native pull when the harness offers it, else fall back
// to the same push materialization. Grounding never DEPENDS on this (it always yields a fresh pack)." Both
// halves are asserted below, on all four combinations of (harness offers pull) × (a pull port is wired) —
// the truth table the `&&` actually encodes. A mutant of either operand flips at least one row.
//
// Provenance is observable rather than inferred: the pull port returns a pack tagged `from-pull` and the
// injected `FreshPackSource` one tagged `from-push`, so an assertion names WHICH path produced the result
// instead of merely checking that something came back.

import { describe, expect, it } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { OwnPack, OwnUnit } from "@atlas/retrieval"
import { createPhaseHook } from "../src/push.js"
import type { FreshInjection, FreshPackSource, Harness, PullPort, SeatGrounding } from "../src/push.js"

/** A minimal valid `OwnPack` (RETR-12 shape) tagged by `marker`, so the PROVENANCE of an injection is a
 *  value in the result rather than something the test has to assume. */
const ownPack = (marker: string): OwnPack => ({
  unit: `role:${marker}`,
  invariants: [{ nodeId: asNodeKey(`n:${marker}`), tier: "T1", claim: `claim ${marker}`, freshness: "FRESH" }],
  shape: { contents: [], owner: "team", tier: "T1" },
  edges: { dependents: [], dependencies: [] },
  gotchas: [],
  memory: null,
  drill: { finer: [], refresh: { pull: "poke" }, complement: { pull: "relate" } },
})

const UNIT: OwnUnit = { level: "feature", id: "payments", grounding: undefined }
const GROUNDING: SeatGrounding = { via: "own", unit: UNIT }

const PUSH_SOURCE: FreshPackSource = {
  own: () => ownPack("from-push"),
  pack: () => ({
    territory: "T",
    axisHash: "h" as never,
    invariants: [],
    advisory: [],
    advisoryDropped: 0,
    tokenEstimate: 0,
    stale: false,
  }),
}

const OFFERS_PULL: Harness = { id: "H_native", nativePull: "available" }
const NO_NATIVE_PULL: Harness = { id: "H_agents", nativePull: "unavailable" }

/** The marker on the pack that actually arrived — `from-pull` or `from-push`. */
const provenance = (i: FreshInjection): string => (i.via === "own" ? i.pack.unit : `query:${i.pack.territory}`)

/** A pull port that TAGS its output and counts its invocations. */
function countingPull(): { port: PullPort; calls: () => number } {
  let calls = 0
  const port: PullPort = () => {
    calls += 1
    return { via: "own", pack: ownPack("from-pull") }
  }
  return { port, calls: () => calls }
}

describe("TOOLS-14c — `pullOptimize` uses native pull ONLY where the harness offers it", () => {
  it("harness OFFERS pull + a port is wired ⇒ the PULL port produces the injection", () => {
    const { port, calls } = countingPull()
    const hook = createPhaseHook(PUSH_SOURCE, { pull: port })

    const injected = hook.pullOptimize(GROUNDING, OFFERS_PULL)

    expect(provenance(injected)).toBe("role:from-pull") // the optimisation ran…
    expect(calls()).toBe(1) // …exactly once
  })

  it("harness does NOT offer pull ⇒ the port is NEVER called and push materialises the pack", () => {
    const { port, calls } = countingPull()
    const hook = createPhaseHook(PUSH_SOURCE, { pull: port })

    const injected = hook.pullOptimize(GROUNDING, NO_NATIVE_PULL)

    // The row the `!==` mutant inverts: a pull-unavailable harness must NOT be handed to the pull port.
    expect(calls()).toBe(0)
    expect(provenance(injected)).toBe("role:from-push") // still a FRESH pack — grounding never depends on pull
  })

  it("harness OFFERS pull but NO port is wired ⇒ the push fall-back still yields a fresh pack", () => {
    const hook = createPhaseHook(PUSH_SOURCE) // `opts.pull` absent — the second operand of the `&&`

    expect(provenance(hook.pullOptimize(GROUNDING, OFFERS_PULL))).toBe("role:from-push")
  })

  it("harness does NOT offer pull and NO port is wired ⇒ the same push fall-back", () => {
    const hook = createPhaseHook(PUSH_SOURCE)

    expect(provenance(hook.pullOptimize(GROUNDING, NO_NATIVE_PULL))).toBe("role:from-push")
  })

  it("the fall-back RE-MATERIALISES every call — it is never a cached carry-over (TOOLS-14a freshness)", () => {
    let materialisations = 0
    const counting: FreshPackSource = {
      own: () => {
        materialisations += 1
        return ownPack("from-push")
      },
      pack: PUSH_SOURCE.pack,
    }
    const hook = createPhaseHook(counting)

    hook.pullOptimize(GROUNDING, NO_NATIVE_PULL)
    hook.pullOptimize(GROUNDING, NO_NATIVE_PULL)

    expect(materialisations).toBe(2) // one fresh materialisation per call, not one memoised pack
  })
})
