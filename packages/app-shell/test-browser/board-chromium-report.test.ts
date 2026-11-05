import { expect, test } from "bun:test"
import { boardChromiumRequired } from "./board-chromium-required"
import { validateBoardChromiumReport } from "./board-chromium-report"

const clean = () => ({
  stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0 },
  errors: [],
  suites: Object.values(boardChromiumRequired).map((journey) => ({
    file: journey.file, specs: [{ ...journey, ok: true, tests: [{
      projectName: "chromium", expectedStatus: "passed", status: "expected",
      results: [{ status: "passed", retry: 0, errors: [] }],
    }] }],
  })),
})

test("Board Chromium evidence accepts both actual journey identities, including nested suites and Windows paths", () => {
  expect(validateBoardChromiumReport(clean())).toEqual(Object.values(boardChromiumRequired).map((item) => item.file))
  const report = clean()
  report.suites[0]!.specs[0]!.file = boardChromiumRequired.document.file.replaceAll("/", "\\")
  expect(validateBoardChromiumReport({ ...report, suites: [{ specs: [], suites: report.suites }] })).toHaveLength(2)
})

test("Board Chromium evidence refuses malformed and empty reports rather than a vacuous pass", () => {
  for (const report of [undefined, null, {}, [], "{}", { stats: {} }, { ...clean(), errors: null }, { ...clean(), suites: [] }, { ...clean(), suites: [{}] }])
    expect(() => validateBoardChromiumReport(report)).toThrow("Board Chromium:")
})

test("Board Chromium evidence refuses substituted, missing, duplicate and wrong-title journeys even with green totals", () => {
  const substituted = clean()
  substituted.suites[1]!.specs[0]!.file = "orchestra/unrelated.spec.ts"
  expect(() => validateBoardChromiumReport(substituted)).toThrow(boardChromiumRequired.notice.file)
  const duplicate = clean()
  duplicate.suites[1] = duplicate.suites[0]!
  expect(() => validateBoardChromiumReport(duplicate)).toThrow("duplicated")
  const renamed = clean()
  renamed.suites[0]!.specs[0]!.title = "different test in the same file"
  expect(() => validateBoardChromiumReport(renamed)).toThrow(boardChromiumRequired.document.file)
  expect(() => validateBoardChromiumReport({ ...clean(), suites: clean().suites.slice(0, 1) })).toThrow("missing or extra")
})

test("Board Chromium evidence refuses skipped, expected failures, wrong projects and absent/retried results", () => {
  for (const change of [
    { status: "skipped" }, { status: "flaky" }, { expectedStatus: "failed" }, { projectName: "firefox" },
    { results: [] }, { results: [{ status: "skipped", retry: 0, errors: [] }] },
    { results: [{ status: "passed", retry: 1, errors: [] }] },
    { results: [{ status: "passed", retry: 0, errors: [{ message: "error" }] }] },
    { results: [{ status: "passed", retry: 0, error: { message: "standalone error" }, errors: [] }] },
    ...["failed", "timedOut", "interrupted"].map((status) => ({ results: [{ status, retry: 0, errors: [] }] })),
    { results: [{ status: "passed", retry: 0 }] },
  ]) {
    const report = clean()
    Object.assign(report.suites[0]!.specs[0]!.tests[0]!, change)
    expect(() => validateBoardChromiumReport(report)).toThrow(boardChromiumRequired.document.file)
  }
  const unsuccessful = clean()
  unsuccessful.suites[0]!.specs[0]!.ok = false
  expect(() => validateBoardChromiumReport(unsuccessful)).toThrow("unsuccessful spec")
  expect(() => validateBoardChromiumReport({ ...clean(), errors: [{ message: "global failure" }] })).toThrow("report errors")
  expect(() => validateBoardChromiumReport({ ...clean(), stats: { ...clean().stats, skipped: 1 } })).toThrow("aggregate")
})
