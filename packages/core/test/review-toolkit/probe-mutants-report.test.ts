import { expect, test } from "bun:test"
import { ReviewMutantsReport } from "../../src/review-toolkit/probe-mutants-report"

const mutant = { name: "src/lib.rs:2:5 replace + with -", file: "src/lib.rs", span: { start: { line: 2, column: 5 }, end: { line: 2, column: 10 } } }
const report = (summary = "CaughtMutant") => ({
  cargo_mutants_version: "27.1.0", total_mutants: 1, caught: summary === "CaughtMutant" ? 1 : 0,
  missed: summary === "MissedMutant" ? 1 : 0, timeout: 0, unviable: 0, success: 0,
  outcomes: [{ scenario: "Baseline", summary: "Success" }, { scenario: { Mutant: mutant }, summary }],
})

test("native mutation report requires coherent version, baseline, counts, scope and exit", () => {
  expect(ReviewMutantsReport.parse(JSON.stringify(report()), [mutant], 0).status).toBe("pass")
  expect(ReviewMutantsReport.parse(JSON.stringify(report("MissedMutant")), [mutant], 2).status).toBe("fail")
  const invalid = [
    { ...report(), cargo_mutants_version: "27.0.0" },
    { ...report(), total_mutants: 2 },
    { ...report(), caught: 2 },
    { ...report(), success: 1 },
    { ...report(), outcomes: [report().outcomes[1]] },
    { ...report(), outcomes: [...report().outcomes, report().outcomes[1]] },
    { ...report(), outcomes: [{ scenario: "Baseline", summary: "Success" }, { scenario: { Mutant: { ...mutant, file: "other.rs" } }, summary: "CaughtMutant" }] },
  ]
  for (const value of invalid) expect(ReviewMutantsReport.parse(JSON.stringify(value), [mutant], 0)).toMatchObject({ status: "not-run", reason: "invalid-report" })
  expect(ReviewMutantsReport.parse(JSON.stringify(report()), [mutant], 2)).toMatchObject({ status: "not-run", reason: "incoherent-exit" })
})

test("unreadable, malformed, partial or unknown native evidence never passes", () => {
  for (const text of ["", "no json", "null", "{}", "[]", JSON.stringify({ ...report(), outcomes: [] }), JSON.stringify(report("invented"))])
    expect(ReviewMutantsReport.parse(text, [mutant], 0)).toMatchObject({ status: "not-run", reason: "invalid-report" })
})

test("baseline failure, native timeout and unviable-only runs are unavailable evidence", () => {
  const baseline = { ...report(), total_mutants: 0, caught: 0, outcomes: [{ scenario: "Baseline", summary: "Failure" }] }
  expect(ReviewMutantsReport.parse(JSON.stringify(baseline), [mutant], 4)).toMatchObject({ status: "not-run", reason: "baseline-failed" })
  const timed = { ...report(), caught: 0, timeout: 1, outcomes: [{ scenario: "Baseline", summary: "Success" }, { scenario: { Mutant: mutant }, summary: "Timeout" }] }
  expect(ReviewMutantsReport.parse(JSON.stringify(timed), [mutant], 3)).toMatchObject({ status: "not-run", reason: "timeout" })
  const unviable = { ...report(), caught: 0, unviable: 1, outcomes: [{ scenario: "Baseline", summary: "Success" }, { scenario: { Mutant: mutant }, summary: "Unviable" }] }
  expect(ReviewMutantsReport.parse(JSON.stringify(unviable), [mutant], 0)).toMatchObject({ status: "not-run", reason: "no-viable-mutants" })
})
