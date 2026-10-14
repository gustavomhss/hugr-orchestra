// harness/probes/a2-staleness-teeth.test.mjs — calibration of the dumb mutants themselves.
//
// Pure and fast (no throwaway git repo, no product process, no subprocess) — unlike `a2-staleness.test.mjs`
// this file never touches the real oracle, so it just pins the MEASURED matrix each dumb verdict function
// produces against the frozen corpus (docs/design/95b-staleness-a2-methodology.md §6). A change to either
// the corpus or a mutant's logic that shifts these numbers must show up here, not just in eyeballed stdout.

import { describe, it, expect } from "vitest"
import { CORPUS } from "./a2-corpus/index.mjs"
import { MUTANTS, scoreVerdictFn } from "./a2-staleness-teeth.mjs"

const EXPECTED = {
  "naive any-byte-in-file-changed": { true_stale_caught: 6, true_stale_missed: 0, correct_fresh: 0, false_stale: 4 },
  "always-DRIFTED (trivial constant)": { true_stale_caught: 6, true_stale_missed: 0, correct_fresh: 0, false_stale: 4 },
  "always-FRESH (trivial constant)": { true_stale_caught: 0, true_stale_missed: 6, correct_fresh: 4, false_stale: 0 },
  "naive declaration-slice (no NFC, no doc-comment binding)": {
    true_stale_caught: 4,
    true_stale_missed: 2,
    correct_fresh: 3,
    false_stale: 1,
  },
  "line-range oracle (line-count-changed heuristic)": {
    true_stale_caught: 1,
    true_stale_missed: 5,
    correct_fresh: 3,
    false_stale: 1,
  },
}

describe("A2 mutation-teeth matrix — pinned against the frozen corpus", () => {
  it("the corpus is the same 10-entry, 4-preserving/6-invalidating shape the matrix assumes", () => {
    expect(CORPUS.length).toBe(10)
    expect(CORPUS.filter((e) => e.class === "preserving").length).toBe(4)
    expect(CORPUS.filter((e) => e.class === "invalidating").length).toBe(6)
  })

  it("every mutant is exercised and every expectation covers a real mutant (no drift between the two lists)", () => {
    expect(new Set(MUTANTS.map(([label]) => label))).toEqual(new Set(Object.keys(EXPECTED)))
  })

  for (const [label, fn] of MUTANTS) {
    it(`${label} scores its documented row (95b-staleness-a2-methodology.md §6)`, () => {
      expect(scoreVerdictFn(fn, CORPUS)).toEqual(EXPECTED[label])
    })
  }
})
