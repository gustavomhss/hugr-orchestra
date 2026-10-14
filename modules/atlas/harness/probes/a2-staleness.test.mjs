// harness/probes/a2-staleness.test.mjs — calibration of the A2 instrument itself.
//
// Same posture as `adjudicate/adjudicate.test.mjs` and `concurrency-report.test.mjs`: this is not a gate
// over the PRODUCT, it is the proof that the INSTRUMENT (`a2-staleness.mjs` driving the real `reDerives`)
// measures what it claims to. It exercises the full corpus through real git + the real oracle — no mock,
// no forked drift logic — so it is genuinely slow (one throwaway repo + two commits + one AST-folded index
// build per entry) but it is the one probe file `npm test` actually runs, so it can never go stale silently.

import { describe, it, expect } from "vitest"
import { scoreCorpus, scoreEntry, resolveQualifiedPath } from "./a2-staleness.mjs"
import { CORPUS } from "./a2-corpus/index.mjs"

describe("A2 staleness probe — corpus scored against the real reDerives oracle", () => {
  it("the corpus has both classes, non-empty, and no id collisions", () => {
    const ids = CORPUS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(CORPUS.filter((e) => e.class === "preserving").length).toBeGreaterThan(0)
    expect(CORPUS.filter((e) => e.class === "invalidating").length).toBeGreaterThan(0)
    // no callee/interface-fold case: none of the descriptions may claim a cross-unit/caller-facing edit
    for (const e of CORPUS) {
      expect(e.description.toLowerCase()).not.toMatch(/callee|interface.fold|caller/)
    }
  })

  it("every PRESERVING entry re-derives FRESH (zero false-stale) and every INVALIDATING entry re-derives DRIFTED (zero true-stale miss)", () => {
    const { matrix, unresolved, errored, rows } = scoreCorpus(CORPUS)
    // A corpus bug (unresolved anchor / thrown error) must fail loudly, not silently shrink the matrix.
    expect(unresolved, `unresolved: ${JSON.stringify(unresolved)}`).toEqual([])
    expect(errored, `errored: ${JSON.stringify(errored)}`).toEqual([])

    const invalidatingTotal = matrix.true_stale_caught + matrix.true_stale_missed
    const preservingTotal = matrix.correct_fresh + matrix.false_stale
    expect(invalidatingTotal).toBe(CORPUS.filter((e) => e.class === "invalidating").length)
    expect(preservingTotal).toBe(CORPUS.filter((e) => e.class === "preserving").length)

    // The honest, measured claim of this instrument: on THIS corpus, own-anchor byte-granularity drift
    // detection catches every true-stale case and raises zero false-stales.
    expect(matrix.true_stale_missed, `rows: ${JSON.stringify(rows, null, 2)}`).toBe(0)
    expect(matrix.false_stale, `rows: ${JSON.stringify(rows, null, 2)}`).toBe(0)
  }, 60_000)

  it("resolveQualifiedPath refuses an ambiguous/absent needle rather than guessing [teeth: match on substring not trailing-name ⇒ RED]", () => {
    const axes = {
      spatial: { key: "src/u.ts", children: [{ key: "src/u.ts::function_declaration:0:foo", children: [] }] },
      territory: { key: ".", children: [] },
    }
    expect(resolveQualifiedPath(axes, { anchor: { needle: "foo" }, file: "src/u.ts" })).toBe(
      "src/u.ts::function_declaration:0:foo",
    )
    expect(resolveQualifiedPath(axes, { anchor: { needle: "bar" }, file: "src/u.ts" })).toBeUndefined()
    // MUTANT: if the match were `.includes(needle)` instead of `.endsWith(':'+needle)`, a needle that is a
    // substring of an unrelated name (e.g. 'oo' inside 'foo') would falsely resolve. Guard it here.
    expect(resolveQualifiedPath(axes, { anchor: { needle: "oo" }, file: "src/u.ts" })).toBeUndefined()
  })

  it("scoreEntry reports UNRESOLVED (not a false verdict) for a needle absent from the base rev", () => {
    const badEntry = {
      id: "bad-needle",
      class: "preserving",
      description: "a needle that never matches",
      file: "src/u.ts",
      base: "export function foo() { return 1; }\n",
      mutated: "export function foo() { return 1; }\n",
      anchor: { needle: "nonexistentSymbol" },
      expected: "FRESH",
    }
    const row = scoreEntry(badEntry)
    expect(row.unresolved).toBe(true)
    expect(row.actual).toBeUndefined()
    // MUTANT: if an unresolved anchor were silently coerced into a verdict, this would report a class
    // ('FRESH'/'DRIFTED') instead of staying undefined+unresolved.
  })
})
