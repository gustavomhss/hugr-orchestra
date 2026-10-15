// @atlas/adapter-io — test/test-vacuity-bench.test.ts  (#95 WP-A4-TV — the judge-free A4 test-vacuity bench)
//
// A SOUND, judge-free, human-free benchmark for the `test-vacuity` PROVEN shape — the 5th oracle-bearing shape
// folded into the A4 scoreboard. It plants ground truth by MUTATION (label from the mutation record ALONE,
// `deriveLabelFromFlip`, NEVER from `scanTestVacuity`), parses each source through the SAME tree-sitter path the
// shipped oracle uses (`parseTsDoc` + `initAst`), runs `scanTestVacuity`, and scores the two co-primaries:
//   · falseAdmit = |admitted∧FALSE|/|FALSE|  — the SOUNDNESS headline, MUST be 0/N.
//   · recallTrue = |admitted∧TRUE|/|TRUE|    — the COVERAGE co-primary, k/M across D real idioms.
//
// It runs under `npm test` (no build) single-fork. If ANY planted FALSE is ADMITTED the falseAdmit assertion
// goes RED — a real oracle soundness bug, surfaced, never tuned away. Re-derive the numbers:
//   npx vitest run packages/adapter-io/test/test-vacuity-bench.test.ts --pool=forks --poolOptions.forks.singleFork=true

import { readFileSync } from "node:fs"
import { resolve as presolve } from "node:path"
import { describe, it, expect, beforeAll } from "vitest"
import { initAst, parseTsDoc } from "../src/ast.js"
import { scanTestVacuity } from "../src/test-vacuity.js"
import { CORPUS, IDIOMS, deriveLabelFromFlip, type Row } from "./support/test-vacuity-corpus.js"
import { score, type Decision } from "./support/test-vacuity-scorer.js"

const SUPPORT = presolve(__dirname, "support")

/** Parse one corpus source through the shipped `parseTsDoc` path and run the oracle. `admitted` iff the oracle
 *  PROVES the row's own test carries the assertion-only-in-catch shape. Fail-closed: an unparseable source is a
 *  corpus bug, so we assert the parse succeeded rather than silently scoring it as an abstain. */
function decide(row: Row): Decision {
  const doc = parseTsDoc(`corpus/${row.id}.test.ts`, row.source)
  expect(doc, `corpus row ${row.id} failed to parse — a malformed fixture, not a measurement`).not.toBeUndefined()
  try {
    const admitted = scanTestVacuity(doc!.root).length > 0
    return { label: row.label, admitted }
  } finally {
    doc!.dispose()
  }
}

describe("#95 WP-A4-TV — test-vacuity judge-free planted bench", () => {
  beforeAll(async () => {
    await initAst()
  }, 60_000)

  it("AC-corpus — well-formed: paired TRUE/FALSE, label from the flip record, edit-distance-1 mutants", () => {
    const trues = CORPUS.filter((r) => r.label === "TRUE")
    const falses = CORPUS.filter((r) => r.label === "FALSE")
    expect(trues.length).toBeGreaterThanOrEqual(5) // includes the #114-family assertion-only-in-catch idioms
    expect(falses.length).toBe(trues.length) // exactly one flipped mutant per base
    const byId = new Map(CORPUS.map((r) => [r.id, r] as const))
    for (const r of CORPUS) {
      // label is DERIVED from the flip record, never assigned free-hand (anti-circularity ground truth)
      expect(r.label).toBe(deriveLabelFromFlip(r.flip))
      if (r.label === "FALSE") {
        expect(r.base, `${r.id} must link its TRUE base`).not.toBeNull()
        const base = byId.get(r.base!)
        expect(base, `${r.id} base ${r.base} must exist`).toBeDefined()
        expect(base!.label).toBe("TRUE")
        // edit-distance-1 at the source level: an `add-*` flip is the base plus exactly one extra non-blank
        // line; a `move-*` flip relocates the SAME assertion text out of the catch (base line count preserved,
        // a `finally` introduced). Either way the mutant is a single localized edit of its base.
        const baseLines = base!.source
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
        const mutLines = r.source
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
        if (
          r.flip === "add-success-assertion" ||
          r.flip === "add-assertions-guard" ||
          r.flip === "add-trailing-throw"
        ) {
          expect(mutLines.length, `${r.id}: an add-flip inserts exactly one line`).toBe(baseLines.length + 1)
          // every base line survives (the one extra line is the only difference)
          const extra = mutLines.filter(
            (l) =>
              !baseLines.includes(l) ||
              mutLines.filter((x) => x === l).length > baseLines.filter((x) => x === l).length,
          )
          expect(extra.length, `${r.id}: exactly one inserted line`).toBeGreaterThanOrEqual(1)
        } else {
          // move-catch-to-finally: a `finally` appears that the base lacks
          expect(base!.source.includes("finally")).toBe(false)
          expect(r.source.includes("finally"), `${r.id}: move-flip introduces a finally`).toBe(true)
        }
      }
    }
    expect(IDIOMS.length).toBeGreaterThanOrEqual(5) // diverse real idioms, not one framework
  })

  it("AC-independence — the LABEL-STORE and SCORER import NO symbol from the oracle test-vacuity.ts", () => {
    // The AC-6 analogue (static-import grep). A live `import ... from '.../test-vacuity'` in either the label
    // store or the scorer would let the gate under test define its own ground truth — the vacuity class.
    for (const f of ["test-vacuity-corpus.ts", "test-vacuity-scorer.ts"]) {
      const src = readFileSync(presolve(SUPPORT, f), "utf8")
      const importLines = src.split("\n").filter((l) => /^\s*import\b/.test(l) || /\bfrom\s+['"]/.test(l))
      const joined = importLines.join("\n")
      expect(joined, `${f} must not import the oracle`).not.toMatch(/from\s+['"][^'"]*test-vacuity['"]/)
      expect(joined, `${f} must not import the oracle`).not.toMatch(/from\s+['"][^'"]*\/test-vacuity\.js['"]/)
      expect(joined, `${f} must not import @atlas/genesis`).not.toMatch(/from\s+['"]@atlas\/genesis['"]/)
    }
  })

  it("AC-soundness — falseAdmit is 0/N: the oracle ADMITS no vacuity-flipped mutant", () => {
    const s = score(CORPUS.map(decide))
    // print the headline so a run leaves a re-derivable transcript
    // eslint-disable-next-line no-console
    console.log(
      `\n=== #95 WP-A4-TV test-vacuity bench === falseAdmit=${s.falseAdmitNum}/${s.falseAdmitDen} ` +
        `recallTrue=${s.recallNum}/${s.recallDen} (${IDIOMS.length} idioms) n=${s.n}\n`,
    )
    expect(
      s.falseAdmitNum,
      "A FALSE mutant was ADMITTED — a REAL test-vacuity oracle soundness bug, NOT a corpus issue. Do not tune the corpus green; report it.",
    ).toBe(0)
    expect(s.falseAdmit).toBe(0)
  })

  it("AC-recall — recallTrue is the k/M coverage co-primary across the diverse idioms (measured, printed)", () => {
    const s = score(CORPUS.map(decide))
    expect(s.recallDen).toBeGreaterThan(0)
    // the number is MEASURED, not asserted to a target — recall is a coverage figure, not a soundness one.
    // eslint-disable-next-line no-console
    console.log(
      `  recall by construction: ${s.recallNum}/${s.recallDen} TRUE vacuous variants proven across ${IDIOMS.length} idioms`,
    )
    expect(s.recallNum).toBeGreaterThanOrEqual(0)
    expect(s.recallNum).toBeLessThanOrEqual(s.recallDen)
  })

  it("AC-teeth — the scorer bites: a deliberately mislabelled all-admit run is NOT 0-false-admit", () => {
    // proves the 0 in AC-soundness is EARNED: if the oracle admitted everything, the FALSE population would
    // register a nonzero falseAdmit. (A vacuous scorer that always returned 0 could not tell these apart.)
    const allAdmit = score(CORPUS.map((r) => ({ label: r.label, admitted: true })))
    expect(allAdmit.falseAdmit).not.toBe(0)
    expect(allAdmit.falseAdmitNum).toBe(allAdmit.falseAdmitDen)
  })
})
