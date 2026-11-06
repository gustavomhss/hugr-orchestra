import { expect, test } from "bun:test"
import type { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewNativeSarif } from "../../src/review-toolkit/native-sarif"
import { ReviewOxlintResult } from "../../src/review-toolkit/packs/oxlint-result"
import { ReviewZizmorResult } from "../../src/review-toolkit/packs/zizmor-result"

// Minimized native-shaped data; full native reports are exercised separately in confined conformance tests.
const engines = [
  { pack: "zizmor", version: "1.32.0", rule: "zizmor/unpinned-uses", file: ".github/workflows/ci.yml", line: 8 },
  { pack: "oxlint", version: "1.91.0", rule: "eslint(no-debugger)", file: "nested/broken.js", line: 1 },
]
const options = (engine: (typeof engines)[number]): ReviewNativeSarif.Options => ({
  pack: engine.pack, version: engine.version, root: "/native",
  paths: [{ file: engine.file, path: "original/source.txt" }], rules: [engine.rule],
})
const report = (engine: (typeof engines)[number], level = "error", found = true) => ({
  version: "2.1.0",
  runs: [{
    tool: { driver: { name: engine.pack, version: engine.version } },
    results: found ? [{
      ruleId: engine.rule, level, message: { text: "native fixture" },
      locations: [{ physicalLocation: { artifactLocation: { uri: engine.file }, region: { startLine: engine.line } } }],
    }] : [],
  }],
})
const outcome = (text: string, exitCode: number, stderr = ""): ResearchProcess.Outcome => ({
  exitCode, durationMs: 1, timedOut: false, memoryExceeded: false, overflow: false,
  stdout: { data: Buffer.from(text), bytes: Buffer.byteLength(text), truncated: false },
  stderr: { data: Buffer.from(stderr), bytes: Buffer.byteLength(stderr), truncated: false },
})

test("P1 native reports map every known diagnostic to the host source", () => {
  for (const engine of engines) {
    const parsed = ReviewNativeSarif.parse(JSON.stringify(report(engine)), options(engine))
    expect(parsed).toMatchObject({ status: "ok", excluded: [], nativeErrors: 1, results: [{ pack: engine.pack, rule: engine.rule, path: "original/source.txt", line: engine.line }] })
    if (parsed.status !== "ok") throw new Error(parsed.reason)
    expect(parsed.results).toHaveLength(1)
    expect(parsed.excluded).toEqual([])
    expect("verdict" in parsed).toBe(false)
    expect("severity" in parsed.results[0]).toBe(false)
    expect(ReviewNativeSarif.parse(JSON.stringify(report(engine, "warning")), options(engine))).toMatchObject({ status: "ok", nativeErrors: 0 })
    const original = report(engine)
    const row = original.runs[0].results[0]
    expect(ReviewNativeSarif.parse(JSON.stringify({ ...original, runs: [{ ...original.runs[0], results: [{ ...row, level: undefined }] }] }), options(engine))).toMatchObject({ status: "ok", nativeErrors: 0 })
    const mixed = ReviewNativeSarif.parse(JSON.stringify({ ...original, runs: [{ ...original.runs[0], results: [row, { ...row, level: "warning" }] }] }), options(engine))
    expect(mixed).toMatchObject({ status: "ok", nativeErrors: 1 })
    if (mixed.status !== "ok") throw new Error(mixed.reason)
    expect(mixed.results).toHaveLength(2)
    expect(mixed.excluded).toEqual([])
    expect(ReviewNativeSarif.parse(JSON.stringify(report(engine, "error", false)), options(engine))).toEqual({ status: "ok", results: [], excluded: [], nativeErrors: 0 })
  }
  const windows = { ...engines[1], file: "INPUT.JS" }
  expect(ReviewNativeSarif.parse(JSON.stringify(report(windows)), { ...options(windows), root: "C:\\projection", paths: [{ file: "Input.js", path: "SRC/Original.js" }] })).toMatchObject({ status: "ok", results: [{ path: "SRC/Original.js" }] })
  const posix = { ...engines[1], file: "literal\\name.js" }
  expect(ReviewNativeSarif.parse(JSON.stringify(report(posix)), { ...options(posix), paths: [{ file: posix.file, path: "src/literal\\name.js" }] })).toMatchObject({ status: "ok", results: [{ path: "src/literal\\name.js" }] })
})

test("P2 malformed or incomplete reports and unsafe host contexts never pass", () => {
  const engine = engines[0]
  const valid = report(engine)
  // Positive control prevents an always-refusing implementation from satisfying the negative cases.
  expect(ReviewNativeSarif.parse(JSON.stringify(valid), options(engine)).status).toBe("ok")
  const badReports = [
    { ...valid, version: "1.0.0" },
    { ...valid, runs: [] },
    { ...valid, runs: [valid.runs[0], valid.runs[0]] },
    { ...valid, runs: [{ tool: valid.runs[0].tool }] },
    { ...valid, runs: [{ ...valid.runs[0], results: null }] },
    { ...valid, runs: [{ ...valid.runs[0], tool: { driver: { name: "wrong", version: engine.version } } }] },
    { ...valid, runs: [{ ...valid.runs[0], tool: { driver: { name: engine.pack, version: "wrong" } } }] },
    { ...valid, runs: [{ ...valid.runs[0], tool: { driver: { name: engine.pack, version: engine.version, semanticVersion: "wrong" } } }] },
    { ...valid, runs: [{ ...valid.runs[0], invocations: [{ executionSuccessful: false }] }] },
    { ...valid, runs: [{ ...valid.runs[0], invocations: [{ executionSuccessful: true, toolExecutionNotifications: [{ level: "error", message: { text: "failure" } }] }] }] },
    { ...valid, runs: [{ ...valid.runs[0], invocations: [{ executionSuccessful: true, toolConfigurationNotifications: [{ level: "error", message: { text: "failure" } }] }] }] },
    { ...valid, runs: [{ ...valid.runs[0], results: [{ ...valid.runs[0].results[0], ruleId: "unknown" }] }] },
    { ...valid, runs: [{ ...valid.runs[0], results: [{ ...valid.runs[0].results[0], kind: "pass" }] }] },
    { ...valid, runs: [{ ...valid.runs[0], results: [{ ...valid.runs[0].results[0], kind: "unexpected" }] }] },
    { ...valid, runs: [{ ...valid.runs[0], results: [{ ...valid.runs[0].results[0], level: "unexpected" }] }] },
    { ...valid, runs: [{ ...valid.runs[0], results: [{ ruleId: engine.rule, message: { text: "unlocated" } }] }] },
    { ...valid, runs: [{ ...valid.runs[0], results: [{ ...valid.runs[0].results[0], locations: [{ physicalLocation: { artifactLocation: { uri: "../outside.yml" }, region: { startLine: 1 } } }] }] }] },
    { ...valid, runs: [{ ...valid.runs[0], results: [{ ...valid.runs[0].results[0], locations: [{ physicalLocation: { artifactLocation: { uri: "unselected.yml" }, region: { startLine: 1 } } }] }] }] },
  ]
  for (const region of [{ startLine: 0 }, { startLine: -1 }, { startLine: 8, endLine: 7 }, { startLine: 8, startColumn: 0 }, { startLine: 8, endColumn: 0 }, { startLine: 8, startColumn: 3, endColumn: 2 }]) {
    badReports.push({ ...valid, runs: [{ ...valid.runs[0], results: [{ ...valid.runs[0].results[0], locations: [{ physicalLocation: { artifactLocation: { uri: engine.file }, region } }] }] }] })
  }
  for (const input of badReports) expect(ReviewNativeSarif.parse(JSON.stringify(input), options(engine)).status).toBe("acquisition-error")
  for (const input of ["", "{", "null"]) expect(ReviewNativeSarif.parse(input, options(engine)).status).toBe("acquisition-error")
  for (const input of [
    { ...options(engine), root: "relative" },
    { ...options(engine), root: "" },
    { ...options(engine), pack: "" },
    { ...options(engine), version: "" },
    { ...options(engine), paths: [] },
    { ...options(engine), rules: [] },
    { ...options(engine), rules: [engine.rule, engine.rule] },
    { ...options(engine), paths: [{ file: engine.file, path: "../outside" }] },
    { ...options(engine), paths: [...options(engine).paths, ...options(engine).paths] },
    { ...options(engine), paths: [...options(engine).paths, { file: "other.yml", path: "original/source.txt" }] },
  ]) expect(ReviewNativeSarif.parse(JSON.stringify(valid), input).status).toBe("acquisition-error")
  const text = JSON.stringify(valid)
  const bounded = text + " ".repeat(4 * 1024 * 1024 - Buffer.byteLength(text))
  expect(ReviewNativeSarif.parse(bounded, options(engine)).status).toBe("ok")
  expect(ReviewNativeSarif.parse(bounded + " ", options(engine)).status).toBe("acquisition-error")
  const multibyte = JSON.stringify({ ...valid, padding: "é".repeat(2 * 1024 * 1024) })
  expect(ReviewNativeSarif.parse(multibyte, options(engine)).status).toBe("acquisition-error")
})

test("P3 zizmor SARIF findings use exit zero without masking process failures", () => {
  const engine = engines[0]
  const text = JSON.stringify(report(engine))
  const info = " INFO zizmor: native fixture\n INFO audit: native fixture\n"
  expect(ReviewZizmorResult.settle(outcome(text, 0, info), options(engine))).toMatchObject({ status: "ok", results: [{ rule: engine.rule, path: "original/source.txt" }] })
  expect(ReviewZizmorResult.settle(outcome(JSON.stringify(report(engine, "error", false)), 0), options(engine))).toEqual({ status: "ok", results: [], excluded: [] })
  expect(ReviewZizmorResult.settle({ ...outcome(text, 0), failure: "spawn" }, options(engine)).status).toBe("not-run")
  expect(ReviewZizmorResult.settle({ ...outcome(text, 0), timedOut: true }, options(engine)).status).toBe("not-run")
  expect(ReviewZizmorResult.settle({ ...outcome(text, 0), memoryExceeded: true }, options(engine)).status).toBe("not-run")
  expect(ReviewZizmorResult.settle({ ...outcome(text, 0), overflow: true }, options(engine)).status).toBe("acquisition-error")
  expect(ReviewZizmorResult.settle(outcome(text, 1), options(engine)).status).toBe("acquisition-error")
  expect(ReviewZizmorResult.settle(outcome(text, 0, "ERROR fixture failed"), options(engine)).status).toBe("acquisition-error")
  expect(ReviewZizmorResult.settle(outcome(text, 0, info + "WARN unexpected\n"), options(engine)).status).toBe("acquisition-error")
  for (const input of [
    { ...outcome(text, 0), exitCode: null },
    outcome(text, 99),
    outcome("{", 0),
    outcome(" ".repeat(4 * 1024 * 1024 + 1), 0),
    { ...outcome(text, 0), stdout: { data: Buffer.from([255]), bytes: 1, truncated: false } },
    { ...outcome(text, 0), stderr: { data: Buffer.from([255]), bytes: 1, truncated: false } },
    { ...outcome(text, 0), stdout: { ...outcome(text, 0).stdout, truncated: true } },
    { ...outcome(text, 0), stderr: { ...outcome(text, 0).stderr, truncated: true } },
  ]) expect(ReviewZizmorResult.settle(input, options(engine)).status).toBe("acquisition-error")
})

test("P4 oxlint exit settlement distinguishes warnings from errors and tool failures", () => {
  const engine = engines[1]
  const text = JSON.stringify(report(engine))
  expect(ReviewOxlintResult.settle(outcome(text, 1), options(engine))).toMatchObject({ status: "ok", results: [{ rule: engine.rule, path: "original/source.txt" }] })
  expect(ReviewOxlintResult.settle(outcome(JSON.stringify(report(engine, "warning")), 0), options(engine)).status).toBe("ok")
  expect(ReviewOxlintResult.settle(outcome(JSON.stringify(report(engine, "warning")), 1), options(engine)).status).toBe("acquisition-error")
  expect(ReviewOxlintResult.settle(outcome(text, 0), options(engine)).status).toBe("acquisition-error")
  expect(ReviewOxlintResult.settle(outcome(JSON.stringify(report(engine, "error", false)), 0), options(engine))).toEqual({ status: "ok", results: [], excluded: [] })
  expect(ReviewOxlintResult.settle(outcome(JSON.stringify(report(engine, "error", false)), 1), options(engine)).status).toBe("acquisition-error")
  expect(ReviewOxlintResult.settle(outcome(text, 1, "unexpected stderr"), options(engine)).status).toBe("acquisition-error")
  expect(ReviewOxlintResult.settle({ ...outcome(text, 1), timedOut: true }, options(engine)).status).toBe("not-run")
  expect(ReviewOxlintResult.settle({ ...outcome(text, 1), failure: "spawn" }, options(engine)).status).toBe("not-run")
  expect(ReviewOxlintResult.settle({ ...outcome(text, 1), memoryExceeded: true }, options(engine)).status).toBe("not-run")
  for (const input of [
    { ...outcome(text, 1), overflow: true },
    { ...outcome(text, 1), exitCode: null },
    outcome(text, 99),
    outcome("{", 1),
    outcome(" ".repeat(4 * 1024 * 1024 + 1), 1),
    { ...outcome(text, 1), stdout: { data: Buffer.from([255]), bytes: 1, truncated: false } },
    { ...outcome(text, 1), stderr: { data: Buffer.from([255]), bytes: 1, truncated: false } },
    { ...outcome(text, 1), stdout: { ...outcome(text, 1).stdout, truncated: true } },
    { ...outcome(text, 1), stderr: { ...outcome(text, 1).stderr, truncated: true } },
  ]) expect(ReviewOxlintResult.settle(input, options(engine)).status).toBe("acquisition-error")
})
