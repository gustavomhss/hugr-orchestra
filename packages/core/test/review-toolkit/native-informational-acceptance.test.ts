import { expect, test } from "bun:test"
import zizmor from "../../src/backend-toolkit/packs/zizmor"
import { ReviewNativeSarif } from "../../src/review-toolkit/native-sarif"
import { ReviewSarif } from "../../src/review-toolkit/sarif"
import { ReviewZizmorResult } from "../../src/review-toolkit/packs/zizmor-result"

// Pinned output/sarif.rs:14-32 maps informational findings to review/note, not pass.
const options = {
  pack: zizmor.id, version: zizmor.version, root: "/native",
  paths: [{ file: "input.yml", path: "reviewed/workflow.yml" }], rules: ["zizmor/anonymous-definition"],
}
const row = {
  kind: "review", level: "note", ruleId: "zizmor/anonymous-definition", message: { text: "job definition without a name" },
  partialFingerprints: { fixture: "original-fingerprint" },
  suppressions: [{ kind: "inSource", status: "underReview", justification: "retain original metadata" }],
  locations: [{ physicalLocation: { artifactLocation: { uri: "input.yml" }, region: { startLine: 3, endLine: 4, snippet: { text: "original snippet" } } } }],
} as const
const report = (result: unknown = row) => JSON.stringify({ version: "2.1.0", runs: [{ tool: { driver: { name: zizmor.id, version: zizmor.version } }, results: [result] }] })
const raw = {
  pack: zizmor.id, rule: row.ruleId, path: "reviewed/workflow.yml", line: 3, endLine: 4,
  snippet: "original snippet", toolFingerprint: JSON.stringify([["fixture", "original-fingerprint"]]),
  message: row.message.text, suppressions: row.suppressions, nativeSeverity: "note",
}

test("J0 legacy review/note interpretation remains unchanged", () => {
  expect(ReviewSarif.parseSarif(report(), { pack: zizmor.id, root: options.root })).toEqual({ status: "ok", excluded: [], results: [{ ...raw, path: "input.yml" }] })
})

test("J1 native review/note findings retain raw metadata without a severity or verdict", () => {
  const parsed = ReviewNativeSarif.parse(report(), options)
  expect(parsed).toEqual({ status: "ok", nativeErrors: 0, excluded: [], results: [raw] })
  if (parsed.status !== "ok") throw new Error(parsed.reason)
  expect(parsed.results).toHaveLength(1)
  for (const field of ["severity", "verdict", "confirmation", "confirmed", "status"]) expect(field in parsed.results[0]).toBe(false)
  expect("verdict" in parsed).toBe(false)
  expect(ReviewNativeSarif.parse(report({ ...row, kind: undefined }), options)).toEqual({ status: "ok", nativeErrors: 0, excluded: [], results: [raw] })
  const mixed = JSON.parse(report())
  mixed.runs[0].results.push({ ...row, kind: "fail", level: "error", ruleId: "zizmor/unpinned-uses", message: { text: "second finding" } })
  expect(ReviewNativeSarif.parse(JSON.stringify(mixed), { ...options, rules: [...options.rules, "zizmor/unpinned-uses"] })).toEqual({ status: "ok", nativeErrors: 1, excluded: [], results: [raw, { ...raw, rule: "zizmor/unpinned-uses", message: "second finding", nativeSeverity: "error" }] })
  const fixture = JSON.parse(report())
  fixture.runs[0].tool.driver = { name: "host-fixture", version: "host-version" }
  expect(ReviewNativeSarif.parse(JSON.stringify(fixture), { ...options, pack: "host-fixture", version: "host-version" })).toMatchObject({ status: "ok", nativeErrors: 0, results: [{ pack: "host-fixture", rule: row.ruleId }] })
})

test("J2 informational settlement preserves strict kind, identity, rule and path refusal", () => {
  const stdout = Buffer.from(report())
  const outcome = { exitCode: 0, durationMs: 1, timedOut: false, overflow: false, memoryExceeded: false, stdout: { data: stdout, bytes: stdout.length, truncated: false }, stderr: { data: Buffer.alloc(0), bytes: 0, truncated: false } }
  expect(ReviewZizmorResult.settle(outcome, options)).toMatchObject({ status: "ok", excluded: [], results: [{ rule: row.ruleId, path: "reviewed/workflow.yml" }] })
  for (const kind of ["pass", "open", "notApplicable", "informational", "unexpected"]) {
    expect(ReviewNativeSarif.parse(report({ ...row, kind }), options).status).toBe("acquisition-error")
  }
  for (const level of [undefined, "warning", "error", "none", "unexpected"]) {
    expect(ReviewNativeSarif.parse(report({ ...row, level }), options).status).toBe("acquisition-error")
  }
  expect(ReviewNativeSarif.parse(report({ ...row, kind: "fail", level: "error" }), options)).toMatchObject({ status: "ok", nativeErrors: 1 })
  expect(ReviewNativeSarif.parse(report({ ...row, kind: "fail" }), options)).toMatchObject({ status: "ok", nativeErrors: 0 })
  for (const paths of [[{ file: "other.yml", path: "reviewed/workflow.yml" }], [{ file: "input.yml", path: "../escape.yml" }]]) {
    expect(ReviewNativeSarif.parse(report(), { ...options, paths }).status).toBe("acquisition-error")
  }
  expect(ReviewNativeSarif.parse(report(), { ...options, rules: ["unknown"] }).status).toBe("acquisition-error")
  expect(ReviewNativeSarif.parse(report(), { ...options, version: "wrong" }).status).toBe("acquisition-error")
  expect(ReviewZizmorResult.settle({ ...outcome, exitCode: 1 }, options).status).toBe("acquisition-error")
})
