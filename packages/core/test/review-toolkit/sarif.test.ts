import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ReviewItem } from "../../src/review-toolkit/item"
import { ReviewSarif } from "../../src/review-toolkit/sarif"

const lookup: ReviewSarif.Lookup = (pack, rule) =>
  pack === "opengrep" && rule === "js.eval"
    ? { class: "injection", lens: "security", severity: "P1", status: "active", triage: "eval of request data" }
    : pack === "gitleaks" && rule === "aws-access-token"
      ? { class: "secret", lens: "security", severity: "P0", status: "probation", triage: "live credential in source" }
      : undefined

const sarif = (results: unknown[]) =>
  JSON.stringify({
    version: "2.1.0",
    runs: [{ tool: { driver: { name: "opengrep", rules: [{ id: "js.eval" }, { id: "js.unknown" }] } }, results }],
  })

const result = (line: number, snippet: string, extra: Record<string, unknown> = {}) => ({
  ruleId: "js.eval",
  message: { text: "eval of untrusted input" },
  locations: [{
    physicalLocation: {
      artifactLocation: { uri: "file:///repo/src/app%20main.ts" },
      region: { startLine: line, endLine: line + 1, snippet: { text: snippet } },
    },
  }],
  ...extra,
})

const items = (text: string) => {
  const parsed = ReviewSarif.parseSarif(text, { pack: "opengrep", root: "/repo" })
  if (parsed.status !== "ok") throw new Error(parsed.reason)
  return ReviewSarif.toItems(parsed.results, lookup, (path, line) => path === "src/app main.ts" && line === 10)
}

describe("review sarif", () => {
  test("normalizes a SARIF result into a ToolItem", () => {
    const out = items(sarif([result(10, "  eval(req.body)\n")]))
    expect(out.excluded).toEqual([])
    expect(out.items).toHaveLength(1)
    const item = out.items[0].item
    expect(Schema.decodeUnknownSync(ReviewItem.ToolItem)(item)).toEqual(item)
    expect(item).toMatchObject({
      class: "injection",
      lens: "security",
      pack: "opengrep",
      rule: "js.eval",
      ruleStatus: "active",
      severity: "P1",
      path: "src/app main.ts",
      line: 10,
      endLine: 11,
      sources: [{ pack: "opengrep", rule: "js.eval" }],
      triage: "eval of request data",
      onChangedLine: true,
      snippetDigest: ReviewItem.snippetDigest("eval(req.body)"),
    })
    expect(out.items[0].suppressions).toEqual([])
  })

  test("the fingerprint survives a line shift and reindentation", () => {
    const before = items(sarif([result(10, "eval(req.body)")])).items[0].item
    const after = items(sarif([result(42, "    eval(req.body)  ")])).items[0].item
    expect(after.line).toBe(42)
    expect(after.fingerprint).toBe(before.fingerprint)
  })

  test("the fingerprint changes when the snippet changes", () => {
    const before = items(sarif([result(10, "eval(req.body)")])).items[0].item
    const after = items(sarif([result(10, "eval(req.query)")])).items[0].item
    expect(after.fingerprint).not.toBe(before.fingerprint)
    expect(after.snippetDigest).not.toBe(before.snippetDigest)
  })

  test("suppressions are marked on the entry", () => {
    const out = items(sarif([
      result(10, "eval(a)", { suppressions: [{ kind: "inSource", justification: "trusted" }] }),
      result(20, "eval(b)", { suppressions: [{ kind: "external", status: "accepted" }] }),
    ]))
    expect(out.items.map((entry) => entry.suppressions)).toEqual([
      [{ kind: "inSource", justification: "trusted" }],
      [{ kind: "external", status: "accepted" }],
    ])
  })

  test("unknown rules, missing locations and non-findings are counted, never guessed", () => {
    const out = items(sarif([
      result(10, "eval(a)"),
      { ...result(11, "x()"), ruleId: undefined, ruleIndex: 1 },
      { ...result(12, "y()"), ruleId: undefined, ruleIndex: 1 },
      { ruleId: "js.eval", message: { text: "no location" } },
      { ...result(13, "z()"), kind: "pass" },
      { message: { text: "no rule" } },
    ]))
    expect(out.items.map((entry) => entry.item.line)).toEqual([10])
    expect(out.excluded).toEqual([{ reason: "unknown-rule", rule: "js.unknown", count: 2 }])
    const parsed = ReviewSarif.parseSarif(sarif([
      { ruleId: "js.eval", message: { text: "no location" } },
      { ...result(13, "z()"), kind: "pass" },
      { message: { text: "no rule" } },
    ]), { pack: "opengrep" })
    expect(parsed).toEqual({
      status: "ok",
      results: [],
      excluded: [
        { reason: "no-location", rule: "js.eval", count: 1 },
        { reason: "not-a-finding", rule: "js.eval", count: 1 },
        { reason: "no-rule", count: 1 },
      ],
    })
  })

  test("the tool's own fingerprint stands in when there is no snippet", () => {
    const bare = (line: number, fingerprint: string) => ({
      ruleId: "js.eval",
      message: { text: `eval at line ${line}` },
      locations: [{ physicalLocation: { artifactLocation: { uri: "src/a.ts" }, region: { startLine: line } } }],
      partialFingerprints: { primaryLocationLineHash: fingerprint },
    })
    const before = items(sarif([bare(3, "abc:1")])).items[0].item
    const after = items(sarif([bare(9, "abc:1")])).items[0].item
    expect(after.fingerprint).toBe(before.fingerprint)
    expect(before.path).toBe("src/a.ts")
    expect(before.endLine).toBeUndefined()
  })

  test("malformed input is an acquisition error, never an empty result", () => {
    expect(ReviewSarif.parseSarif("{not json", { pack: "opengrep" })).toEqual({
      status: "acquisition-error",
      reason: "malformed-json",
    })
    expect(ReviewSarif.parseSarif(JSON.stringify({ version: "2.0.0", runs: [] }), { pack: "opengrep" })).toEqual({
      status: "acquisition-error",
      reason: "not-sarif-2.1.0",
    })
    expect(ReviewSarif.parseSarif(JSON.stringify({ version: "2.1.0", runs: [{ tool: { driver: {} }, results: null }] }), {
      pack: "opengrep",
    })).toEqual({ status: "acquisition-error", reason: "not-sarif-2.1.0" })
    expect(ReviewSarif.parseJson("gitleaks", "", { pack: "gitleaks" })).toEqual({
      status: "acquisition-error",
      reason: "malformed-json",
    })
    expect(ReviewSarif.parseJson("gitleaks", JSON.stringify({ findings: [] }), { pack: "gitleaks" })).toEqual({
      status: "acquisition-error",
      reason: "not-gitleaks-json",
    })
    expect(ReviewSarif.parseJson("trivy", "[]", { pack: "trivy" })).toEqual({
      status: "acquisition-error",
      reason: "unknown-parser:trivy",
    })
  })

  test("a gitleaks JSON report normalizes to the same raw shape", () => {
    const report = (line: number, match: string) =>
      JSON.stringify([{
        RuleID: "aws-access-token",
        Description: "AWS access token",
        File: "/repo/config/.env",
        StartLine: line,
        EndLine: line,
        StartColumn: 5,
        EndColumn: 25,
        Match: match,
        Secret: "REDACTED",
        Fingerprint: `config/.env:aws-access-token:${line}`,
      }, { RuleID: "generic-api-key", File: "/repo/a.txt", StartLine: 1, Match: "key=REDACTED" }])
    const run = (text: string) => {
      const parsed = ReviewSarif.parseJson("gitleaks", text, { pack: "gitleaks", root: "/repo" })
      if (parsed.status !== "ok") throw new Error(parsed.reason)
      return { parsed, out: ReviewSarif.toItems(parsed.results, lookup) }
    }
    const before = run(report(3, "AWS_KEY=REDACTED"))
    expect(before.parsed.results[0]).toEqual({
      pack: "gitleaks",
      rule: "aws-access-token",
      path: "config/.env",
      line: 3,
      endLine: 3,
      snippet: "AWS_KEY=REDACTED",
      message: "AWS access token",
      suppressions: [],
    })
    expect(before.out.items.map((entry) => entry.item)).toMatchObject([
      { class: "secret", severity: "P0", ruleStatus: "probation", path: "config/.env", line: 3, onChangedLine: false },
    ])
    expect(before.out.excluded).toEqual([{ reason: "unknown-rule", rule: "generic-api-key", count: 1 }])
    const shifted = run(report(8, "AWS_KEY=REDACTED"))
    expect(shifted.out.items[0].item.fingerprint).toBe(before.out.items[0].item.fingerprint)
    expect(run(report(3, "AWS_SECRET=REDACTED")).out.items[0].item.fingerprint).not.toBe(
      before.out.items[0].item.fingerprint,
    )
    expect(ReviewSarif.parseJson("gitleaks", "[]", { pack: "gitleaks" })).toEqual({ status: "ok", results: [], excluded: [] })
  })
})
