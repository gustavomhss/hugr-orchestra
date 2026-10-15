// @atlas/adapter-io — test/support/test-vacuity-scorer.ts  (#95 WP-A4-TV — the two co-primaries)
//
// The A4 test-vacuity scorer: the SAME two formulas as `bench-scorer.ts`, on the single test-vacuity shape
// (there are no arms here — one shape, one oracle):
//   · falseAdmit = |admitted ∧ label=FALSE| / |label=FALSE|   (SOUNDNESS headline — MUST be 0)
//   · recallTrue = |admitted ∧ label=TRUE|  / |label=TRUE|     (COVERAGE co-primary — k/M across idioms)
//
// INDEPENDENCE (the AC-6 analogue): this module imports NO symbol from `test-vacuity.ts`. It reads a PLAIN
// boolean `admitted` the TEST derives from `scanTestVacuity`'s result; no oracle type crosses this seam.

import type { Label } from "./test-vacuity-corpus.js"

/** One scored decision: the row's planted label and whether the oracle ADMITTED (proved the shape). */
export interface Decision {
  readonly label: Label
  readonly admitted: boolean
}

/** The two co-primaries plus population sizes. A `null` rate means an empty population — never a fabricated 0. */
export interface TvScore {
  readonly falseAdmit: number | null // admitted∧FALSE / FALSE
  readonly recallTrue: number | null // admitted∧TRUE  / TRUE
  readonly falseAdmitNum: number
  readonly falseAdmitDen: number
  readonly recallNum: number
  readonly recallDen: number
  readonly n: number
}

/** SCORE a run. Pure + total. `admittedFalse` is the soundness numerator; if it is > 0 the caller must treat
 *  it as a REAL oracle bug (a FALSE mutant proved vacuous), never smooth it over. */
export function score(decisions: readonly Decision[]): TvScore {
  let faNum = 0,
    faDen = 0,
    rNum = 0,
    rDen = 0
  for (const d of decisions) {
    if (d.label === "FALSE") {
      faDen += 1
      if (d.admitted) faNum += 1
    } else {
      rDen += 1
      if (d.admitted) rNum += 1
    }
  }
  return {
    falseAdmit: faDen === 0 ? null : faNum / faDen,
    recallTrue: rDen === 0 ? null : rNum / rDen,
    falseAdmitNum: faNum,
    falseAdmitDen: faDen,
    recallNum: rNum,
    recallDen: rDen,
    n: decisions.length,
  }
}
