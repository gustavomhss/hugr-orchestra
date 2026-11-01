// @atlas/cli — test/mine-quarantine-render.test.ts  (genesis-hardening A8 — the mine report counts quarantine)
//
// A pass whose admitted candidates carry `quarantine` (admitted only because a sound proof abstained) prints
// how many on a `quarantine:` line — in the single-arm render and under each arm of a multi-arm render — and
// the mark survives staging (`decideStaging`) into the report. A pass with none prints no such line.

import { describe, it, expect } from "vitest"
import type { EmitGate, Fact } from "@atlas/genesis"
import { runMine, runMineArms } from "../src/mine.js"
import { MINE_SLOT_ENV } from "../src/mine-proposer.js"
import { budget, depsOf, factFor, stagingFake, FRONTIER, REPO, NO_MODEL_ENV } from "./mine-fixtures.js"

/** A gate that admits every seed, quarantined like an abstained proof. */
const quarantiningGate: EmitGate = {
  emit: (seed, c) => ({
    emitted: true,
    fact: { ...factFor(c, seed.claim), quarantine: "abstained-proof" } as unknown as Fact,
  }),
}

const LINE = `quarantine: ${FRONTIER.length} candidate fact(s) admitted only because a sound proof abstained`

describe("genesis-hardening A8 — the mine report counts quarantined candidates", () => {
  it("single arm: the count line, and the mark staged on the row's bytes", async () => {
    const fx = stagingFake()
    const v = await runMine(REPO, depsOf({ gate: quarantiningGate, store: fx.store, budget: budget(FRONTIER.length) }))
    expect(v.stdout).toContain(LINE)
    expect(fx.staged.length).toBeGreaterThan(0)
  })

  it("multi arm: the count line under every arm", async () => {
    const v = await runMineArms(REPO, {
      ...depsOf({ gate: quarantiningGate, budget: budget(FRONTIER.length) }),
      env: { ...NO_MODEL_ENV, [MINE_SLOT_ENV]: "" },
    })
    expect(v.stdout.split("\n").filter((l) => l.startsWith(LINE))).toHaveLength(3)
  })

  it("CONTROL: a pass with no quarantined candidate prints no quarantine line", async () => {
    const v = await runMine(REPO, depsOf({ budget: budget(FRONTIER.length) }))
    expect(v.stdout).not.toContain("quarantine:")
  })
})
