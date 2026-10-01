// @atlas/cli — test/mine-arms-isolation.test.ts  (SOUND-DEFAULT-MINE AC-B3 — the bench's per-axis isolation teeth)
//
// The DEFAULT run mines the full union, but an EXPLICIT `ATLAS_MINE_SLOT` MUST still isolate to a single arm —
// the benchmark measures one axis per invocation, and that guarantee is the reason `runMineArms` never becomes
// an always-3-passes loop. SPY on the per-arm pass runner: unset ⇒ 3 passes {advisory,dependency,count};
// explicit `dependency` ⇒ EXACTLY ONE pass with slot 'dependency' (advisory/count NEVER run).

import { describe, it, expect } from "vitest"
import { driveMineArms } from "../src/mine.js"
import type { MineDeps } from "../src/mine.js"
import type { MinePass } from "../src/mine-render.js"
import { MINE_SLOT_ENV } from "../src/mine-proposer.js"

// A spy pass runner — records the `slot` threaded on each call and returns an empty finished pass.
const spyPass = (): {
  run: (repo: string, deps?: Partial<MineDeps>) => MinePass
  slots: () => (string | undefined)[]
} => {
  const slots: (string | undefined)[] = []
  const empty: MinePass = {
    report: { seeded: [], ratified: [], open: [], llmCalls: 0, budgetSpent: 0 },
    seed: {
      mission: { content: "UN-SEEDED: mission", grounding: [], state: "UN-SEEDED" },
      constitution: { content: "UN-SEEDED: constitution", grounding: [], state: "UN-SEEDED" },
      terrain: { content: "UN-SEEDED: terrain", grounding: [], state: "UN-SEEDED" },
      ontology: { content: "UN-SEEDED: ontology", grounding: [], state: "UN-SEEDED" },
      taste: { content: "UN-SEEDED: taste", grounding: [], state: "UN-SEEDED" },
    },
    modelWired: false,
    seedsDropped: 0,
  }
  return {
    run: (_repo, deps) => {
      slots.push(deps?.slot)
      return empty
    },
    slots: () => slots,
  }
}

describe("AC-B3 — explicit ATLAS_MINE_SLOT isolates to ONE pass; unset drives all three", () => {
  it("unset env ⇒ the pass runs 3× with slots {advisory, dependency, count}", () => {
    const spy = spyPass()
    driveMineArms("fix-repo", { env: {} }, spy.run)
    expect(spy.slots()).toEqual(["advisory", "dependency", "count"])
  })

  it("ATLAS_MINE_SLOT=dependency ⇒ the pass runs EXACTLY ONCE with slot dependency (advisory/count NOT run)", () => {
    const spy = spyPass()
    driveMineArms("fix-repo", { env: { [MINE_SLOT_ENV]: "dependency" } }, spy.run)
    expect(spy.slots()).toEqual(["dependency"])
  })

  it("ATLAS_MINE_SLOT=count ⇒ the pass runs EXACTLY ONCE with slot count", () => {
    const spy = spyPass()
    driveMineArms("fix-repo", { env: { [MINE_SLOT_ENV]: "count" } }, spy.run)
    expect(spy.slots()).toEqual(["count"])
  })
})
