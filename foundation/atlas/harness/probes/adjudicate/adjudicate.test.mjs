// harness/probes/adjudicate/adjudicate.test.mjs — proves the adjudication MATH on SYNTHETIC verdicts, with
// NO model call. This is what lets the calibration report be trusted: the arithmetic that turns judge
// verdicts into κ / catch-rate / false-alarm is pinned against hand-computed and textbook values here, so a
// live-judge run only supplies the verdicts, never the math.
//
// Run under the repo's vitest (`harness/**/*.test.mjs` is in vitest.config.ts include).

import { describe, it, expect } from "vitest"
import { fleissKappa, countsFromVerdicts, majority, detectionRates, CATEGORIES } from "./fleiss.mjs"
import { parseVerdict } from "./adjudicate.mjs"
import { FIXTURES, renderPrompt } from "./fixtures.mjs"

describe("Fleiss κ — pinned against the canonical Fleiss (1971) worked example", () => {
  // The textbook matrix (Wikipedia "Fleiss' kappa" worked example): N=10 subjects, n=14 raters, k=5
  // categories. Published result: P̄=0.378, P_e=0.213, κ=0.210. Hand-verified column/row sums in J1.
  const M = [
    [0, 0, 0, 0, 14],
    [0, 2, 6, 4, 2],
    [0, 0, 3, 5, 6],
    [0, 3, 9, 2, 0],
    [2, 2, 8, 1, 1],
    [7, 7, 0, 0, 0],
    [3, 2, 6, 3, 0],
    [2, 5, 3, 2, 2],
    [6, 5, 2, 1, 0],
    [0, 2, 2, 3, 7],
  ]
  const r = fleissKappa(M)

  it("reproduces the published κ, P̄ and P_e to 3 decimals", () => {
    expect(r.kappa).toBeCloseTo(0.21, 3)
    expect(r.pBar).toBeCloseTo(0.378, 3)
    expect(r.pE).toBeCloseTo(0.213, 3)
  })
})

describe("Fleiss κ — boundary cases with known answers", () => {
  it("perfect agreement across two used categories ⇒ κ = 1", () => {
    // Every rater agrees on every item; items split across two categories so P_e ≠ 1.
    const counts = [
      [4, 0],
      [4, 0],
      [0, 4],
      [0, 4],
    ]
    expect(fleissKappa(counts).kappa).toBeCloseTo(1, 10)
  })

  it("exactly-chance agreement ⇒ κ = 0", () => {
    // n=2 raters, k=2, prevalence 0.5/0.5 ⇒ P_e=0.5. Half the items agree (P_i=1), half disagree (P_i=0),
    // so P̄=0.5=P_e ⇒ κ=0. All values hand-computed.
    const counts = [
      [2, 0],
      [0, 2],
      [1, 1],
      [1, 1],
    ]
    const r = fleissKappa(counts)
    expect(r.pE).toBeCloseTo(0.5, 10)
    expect(r.pBar).toBeCloseTo(0.5, 10)
    expect(r.kappa).toBeCloseTo(0, 10)
  })

  it("below-chance agreement ⇒ κ < 0 (hand-computed −1/3)", () => {
    // 4 raters split 2/2 on every item: P_i=(4+4−4)/(4·3)=1/3, P_e=0.5 ⇒ κ=(1/3−1/2)/(1/2)=−1/3.
    const r = fleissKappa([
      [2, 2],
      [2, 2],
      [2, 2],
    ])
    expect(r.pBar).toBeCloseTo(1 / 3, 10)
    expect(r.pE).toBeCloseTo(0.5, 10)
    expect(r.kappa).toBeCloseTo(-1 / 3, 10)
  })

  it("flags the degenerate single-category matrix instead of quoting a number", () => {
    const r = fleissKappa([
      [3, 0],
      [3, 0],
    ])
    expect(r.degenerate).toBe(true)
    expect(r.kappa).toBe(1) // observed agreement also perfect ⇒ conventional 1, but degenerate is flagged
  })

  it("rejects ragged / uneven-n matrices loudly", () => {
    expect(() =>
      fleissKappa([
        [2, 1],
        [3, 0],
        [1, 1],
      ]),
    ).toThrow(/sum to the same n/)
  })
})

describe("countsFromVerdicts", () => {
  it("tallies category labels into a fixed-width counts matrix", () => {
    const counts = countsFromVerdicts([
      ["GROUNDED_TRUE", "GROUNDED_TRUE", "HALLUCINATED"],
      ["HALLUCINATED", "HALLUCINATED", "ABSTAIN"],
    ])
    expect(counts).toEqual([
      [2, 1, 0],
      [0, 2, 1],
    ])
  })

  it("refuses a varying rater count (Fleiss needs fixed n)", () => {
    expect(() => countsFromVerdicts([["GROUNDED_TRUE"], ["HALLUCINATED", "ABSTAIN"]])).toThrow(/fixed rater count/)
  })

  it("refuses an out-of-vocabulary verdict", () => {
    expect(() => countsFromVerdicts([["MAYBE", "GROUNDED_TRUE"]])).toThrow(/not one of/)
  })
})

describe("majority vote", () => {
  it("picks the plurality category", () => {
    expect(majority([3, 1, 0])).toBe("GROUNDED_TRUE")
    expect(majority([1, 3, 0])).toBe("HALLUCINATED")
  })
  it("returns ABSTAIN on a tie", () => {
    expect(majority([2, 2, 0])).toBe("ABSTAIN")
    expect(majority([1, 1, 1])).toBe("ABSTAIN")
  })
})

describe("detectionRates — catch and false-alarm on hand-built panels", () => {
  it("perfect panel: catch = all falses, false-alarm = 0", () => {
    // 2 true fixtures (majority GROUNDED_TRUE), 2 false fixtures (majority HALLUCINATED).
    const counts = [
      [3, 0, 0], // T majority true
      [2, 1, 0], // T majority true
      [0, 3, 0], // F majority halluc
      [1, 2, 0], // F majority halluc
    ]
    const labels = ["true", "true", "false", "false"]
    const d = detectionRates(counts, labels)
    expect(d.catch).toEqual({ caught: 2, total: 2, rate: 1 })
    expect(d.falseAlarm).toEqual({ alarmed: 0, total: 2, rate: 0 })
  })

  it("counts a missed false (majority not HALLUCINATED) against catch-rate", () => {
    const counts = [
      [0, 3, 0], // F caught
      [2, 1, 0], // F MISSED (majority GROUNDED_TRUE)
      [1, 1, 1], // F undecided ⇒ ABSTAIN majority ⇒ not caught
    ]
    const labels = ["false", "false", "false"]
    const d = detectionRates(counts, labels)
    expect(d.catch).toEqual({ caught: 1, total: 3, rate: 1 / 3 })
    expect(d.falseAlarm.total).toBe(0)
    expect(d.falseAlarm.rate).toBe(null)
  })

  it("counts a wrongly-flagged true as a false alarm", () => {
    const counts = [
      [0, 3, 0], // T but majority HALLUCINATED ⇒ false alarm
      [3, 0, 0], // T correct
    ]
    const d = detectionRates(counts, ["true", "true"])
    expect(d.falseAlarm).toEqual({ alarmed: 1, total: 2, rate: 0.5 })
  })
})

describe("parseVerdict — pulling one token out of a chatty judge answer", () => {
  it("takes the last bare-token line (the instructed contract)", () => {
    expect(parseVerdict("Let me think...\nThe constant differs.\nHALLUCINATED")).toBe("HALLUCINATED")
    expect(parseVerdict("reasons\nGROUNDED_TRUE\n")).toBe("GROUNDED_TRUE")
  })
  it("normalizes hyphens/formatting around the token", () => {
    expect(parseVerdict("**GROUNDED-TRUE**")).toBe("GROUNDED_TRUE")
    expect(parseVerdict("> HALLUCINATED.")).toBe("HALLUCINATED")
  })
  it("falls back to a unique token appearing in prose", () => {
    expect(parseVerdict("I judge this HALLUCINATED because the callee is wrong.")).toBe("HALLUCINATED")
  })
  it("ABSTAINs when the answer names two different verdicts and no bare-token line", () => {
    expect(parseVerdict("could be GROUNDED_TRUE or HALLUCINATED, unsure")).toBe("ABSTAIN")
  })
  it("ABSTAINs on an empty / garbage answer", () => {
    expect(parseVerdict("")).toBe("ABSTAIN")
    expect(parseVerdict("no idea")).toBe("ABSTAIN")
  })
})

describe("fixtures — the calibration ground-truth is well-formed", () => {
  it("has ~10 true and ~10 planted-false pairs", () => {
    const t = FIXTURES.filter((f) => f.label === "true").length
    const f = FIXTURES.filter((f) => f.label === "false").length
    expect(t).toBe(10)
    expect(f).toBe(10)
  })
  it("every planted-false names a falseKind; trues do not", () => {
    for (const fx of FIXTURES) {
      if (fx.label === "false") expect(typeof fx.falseKind).toBe("string")
      else expect(fx.falseKind).toBeUndefined()
    }
  })
  it("ids are unique and prefixed T/F by label", () => {
    const ids = new Set(FIXTURES.map((f) => f.id))
    expect(ids.size).toBe(FIXTURES.length)
    for (const fx of FIXTURES) expect(fx.id.startsWith(fx.label === "true" ? "T" : "F")).toBe(true)
  })
  it("renderPrompt shows anchor, code and fact, and demands the token vocabulary", () => {
    const p = renderPrompt(FIXTURES[0])
    expect(p).toContain(FIXTURES[0].anchor)
    expect(p).toContain(FIXTURES[0].fact)
    for (const cat of CATEGORIES) expect(p).toContain(cat)
  })
})

describe("end-to-end through the real driver with the fake ORACLE judge (no model call)", () => {
  it("drives κ=1, catch=10/10, false-alarm=0/10 — proving the pipeline, not a real judge", async () => {
    const { runPanel } = await import("./adjudicate.mjs")
    const { fileURLToPath } = await import("node:url")
    const { dirname, join } = await import("node:path")
    const here = dirname(fileURLToPath(import.meta.url))
    const judge = { cmd: "node", args: [join(here, "fake-judge.mjs")] }
    process.env.FAKE_JUDGE_MODE = "oracle"
    const promptFn = (fx) => `FIXTURE_ID: ${fx.id}\n${renderPrompt(fx)}`
    const r = runPanel(FIXTURES, promptFn, judge, { passes: 2 })
    expect(r.detection.catch).toEqual({ caught: 10, total: 10, rate: 1 })
    expect(r.detection.falseAlarm).toEqual({ alarmed: 0, total: 10, rate: 0 })
    expect(r.fleiss.kappa).toBeCloseTo(1, 10)
  }, 60_000)
})
