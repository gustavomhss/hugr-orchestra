import { boardChromiumRequired } from "./board-chromium-required"

// Validate the evidence-bearing subset of Playwright 1.59's JSON report, not just its aggregate counters.
export function validateBoardChromiumReport(input: unknown) {
  const report = record(input, "report")
  const required = Object.values(boardChromiumRequired)
  if (!required.length) throw new Error("Board Chromium: required journeys are empty")
  const stats = record(report.stats, "stats")
  if (stats.expected !== required.length || stats.unexpected !== 0 || stats.flaky !== 0 || stats.skipped !== 0)
    throw new Error("Board Chromium: unsuccessful or missing aggregate results")
  if (array(report.errors, "errors").length) throw new Error("Board Chromium: report errors")
  const specs = array(report.suites, "suites").flatMap(suiteSpecs)
  if (specs.length !== required.length) throw new Error("Board Chromium: missing or extra specs")
  required.forEach((journey) => {
    const matches = specs.filter((spec) => typeof spec.file === "string" && spec.file.replaceAll("\\", "/") === journey.file && spec.title === journey.title)
    if (matches.length !== 1) throw new Error(`Board Chromium: required journey missing or duplicated: ${journey.file}`)
    const spec = matches[0]!
    const tests = array(spec.tests, `${journey.file} tests`)
    if (spec.ok !== true || tests.length !== 1) throw new Error(`Board Chromium: unsuccessful spec: ${journey.file}`)
    const test = record(tests[0], `${journey.file} test`)
    if (test.projectName !== "chromium" || test.expectedStatus !== "passed" || test.status !== "expected")
      throw new Error(`Board Chromium: wrong project or test status: ${journey.file}`)
    const results = array(test.results, `${journey.file} results`)
    if (results.length !== 1) throw new Error(`Board Chromium: missing or retried execution: ${journey.file}`)
    const result = record(results[0], `${journey.file} result`)
    if (result.status !== "passed" || result.retry !== 0 || result.error != null || array(result.errors, `${journey.file} errors`).length)
      throw new Error(`Board Chromium: unsuccessful execution: ${journey.file}`)
  })
  return required.map((journey) => journey.file)
}

function suiteSpecs(value: unknown): Record<string, unknown>[] {
  const suite = record(value, "suite")
  return [
    ...array(suite.specs, "suite specs").map((spec) => record(spec, "spec")),
    ...(suite.suites === undefined ? [] : array(suite.suites, "nested suites").flatMap(suiteSpecs)),
  ]
}

function record(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Board Chromium: malformed ${label}`)
  return value as Record<string, unknown>
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Board Chromium: malformed ${label}`)
  return value
}
