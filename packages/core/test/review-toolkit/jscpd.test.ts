import { expect, test } from "bun:test"
import { ReviewPackJscpd } from "../../src/review-toolkit/packs/jscpd"
import { ReviewSarif } from "../../src/review-toolkit/sarif"
import type { ResearchProcess } from "../../src/research-toolkit/process"

const ROOT = "/review/root"
const HASH = "0123456789abcdef"
const lookup: ReviewSarif.Lookup = (pack, rule) =>
  pack === "jscpd" && rule === ReviewPackJscpd.RULE
    ? { class: "change.duplication", lens: "change", severity: "P3", status: "probation", triage: "candidate" }
    : undefined

test("argv is the closed sarif invocation", () => {
  expect(ReviewPackJscpd.argv("/opt/jscpd", "/review/root", "/host/out")).toEqual([
    "/opt/jscpd", "/review/root", "--reporters", "sarif", "--output", "/host/out",
  ])
  expect(ReviewPackJscpd.argv("/opt/jscpd", "/review/root", "/host/out").join(" ")).not.toMatch(/exit-code|threshold|semantic|blame|config/)
  const env = ReviewPackJscpd.environment("/host/cwd")
  expect(env.HOME).toBe("/host/cwd")
  expect(env.XDG_CONFIG_HOME).toBe("/host/cwd")
  expect(env.TMPDIR).toBe("/host/cwd")
  expect(Object.keys(env).some((key) => key.startsWith("JSCPD_"))).toBe(false)
})

test("parse keeps both sides and a line-shift-stable clone fingerprint", () => {
  const first = ReviewPackJscpd.parse(report(), ROOT)
  const shifted = ReviewPackJscpd.parse(report({ line: 40, end: 48 }), ROOT)
  if (first.status !== "ok" || shifted.status !== "ok") throw new Error("valid clone refused")
  expect(first.excluded).toEqual([])
  expect(first.results.map((row) => row.path)).toEqual(["a.js", "b.js"])
  expect(first.results.map((row) => row.toolFingerprint)).toEqual([HASH, HASH])
  expect(first.results.every((row) => row.snippet === undefined && row.message.includes("Duplicated code block"))).toBe(true)
  expect(first.results.every((row) => row.rule === ReviewPackJscpd.RULE && row.nativeSeverity === "warning")).toBe(true)
  const early = fingerprints(first.results)
  const later = fingerprints(shifted.results)
  expect(early).toEqual(later)
  expect(early[0]).not.toBe(early[1])
  expect(first.results.map((row) => row.line)).toEqual([4, 4])
  expect(shifted.results.map((row) => row.line)).toEqual([40, 40])
})

test("malformed, spoofed, escaping, and unknown reports fail closed", () => {
  expect(ReviewPackJscpd.parse("{", ROOT)).toEqual({ status: "acquisition-error", reason: "malformed-json" })
  expect(ReviewPackJscpd.parse("x".repeat(4 * 1024 * 1024 + 1), ROOT)).toMatchObject({ status: "acquisition-error", reason: "report-too-large" })
  expect(ReviewPackJscpd.parse(report({ rule: "jscpd/semantic-code" }), ROOT)).toMatchObject({ status: "acquisition-error", reason: "unknown-rule" })
  expect(ReviewPackJscpd.parse(report({ driver: "not-jscpd" }), ROOT)).toMatchObject({ status: "acquisition-error", reason: "native-driver-mismatch" })
  expect(ReviewPackJscpd.parse(report({ version: "5.4.2" }), ROOT)).toMatchObject({ status: "acquisition-error", reason: "native-driver-mismatch" })
  expect(ReviewPackJscpd.parse(report({ semantic: "9.9.9" }), ROOT)).toMatchObject({ status: "acquisition-error", reason: "native-version-mismatch" })
  expect(ReviewPackJscpd.parse(report({ primary: "../outside.js" }), ROOT).status).toBe("acquisition-error")
  expect(ReviewPackJscpd.parse(report({ counterpart: "https://example.com/a.js" }), ROOT).status).toBe("acquisition-error")
  expect(ReviewPackJscpd.parse(report({ counterpart: "file:///etc/passwd" }), ROOT)).toMatchObject({ status: "acquisition-error", reason: "native-uri-invalid" })
  expect(ReviewPackJscpd.parse(report({ primary: "a/%2e%2e/b.js" }), ROOT)).toMatchObject({ status: "acquisition-error", reason: "native-uri-invalid" })
  expect(ReviewPackJscpd.parse(report({ base: "file:///etc/" }), ROOT)).toMatchObject({ status: "acquisition-error", reason: "wrong-baseid" })
  expect(ReviewPackJscpd.parse(report({ baseId: "%OTHER%" }), ROOT)).toMatchObject({ status: "acquisition-error", reason: "wrong-baseid" })
  expect(ReviewPackJscpd.parse(report({ omitLocation: true }), ROOT)).toMatchObject({ status: "acquisition-error", reason: "native-location-invalid" })
  expect(ReviewPackJscpd.parse(report({ blame: true }), ROOT)).toMatchObject({ status: "acquisition-error", reason: "native-config-spoof" })
  expect(ReviewPackJscpd.parse(emptyReport(), ROOT)).toEqual({ status: "ok", results: [], excluded: [] })
})

test("nonzero, signal, cap, and missing report are never clean; empty valid is", () => {
  expect(ReviewPackJscpd.settle(ran({ exitCode: 0 }), emptyReport(), ROOT)).toEqual({ status: "ok", results: [], excluded: [] })
  expect(ReviewPackJscpd.settle(ran({ exitCode: 2 }), emptyReport(), ROOT)).toEqual({ status: "acquisition-error", reason: "exit 2" })
  expect(ReviewPackJscpd.settle(ran({ exitCode: 0 }), "", ROOT)).toEqual({ status: "acquisition-error", reason: "missing-report" })
  expect(ReviewPackJscpd.settle(ran({ exitCode: null }), emptyReport(), ROOT)).toEqual({ status: "acquisition-error", reason: "signal" })
  expect(ReviewPackJscpd.settle(ran({ timedOut: true, exitCode: null }), emptyReport(), ROOT)).toEqual({ status: "not-run", reason: "timeout" })
  expect(ReviewPackJscpd.settle(ran({ memoryExceeded: true, exitCode: null }), report(), ROOT)).toEqual({ status: "not-run", reason: "memory cap" })
  expect(ReviewPackJscpd.settle(ran({ overflow: true }), emptyReport(), ROOT)).toEqual({ status: "acquisition-error", reason: "output cap" })
  expect(ReviewPackJscpd.settle(ran({ failure: "spawn-failed", exitCode: null }), report(), ROOT)).toEqual({ status: "acquisition-error", reason: "spawn-failed" })
})

function fingerprints(results: ReviewSarif.Raw[]) {
  const bound = ReviewSarif.bind(results, lookup)
  if ("failed" in bound) throw new Error(bound.failed)
  return bound.items.map((entry) => entry.item.fingerprint)
}

function ran(patch: Partial<ResearchProcess.Outcome>): ResearchProcess.Outcome {
  return {
    exitCode: 0,
    durationMs: 1,
    timedOut: false,
    overflow: false,
    memoryExceeded: false,
    stdout: { data: Buffer.alloc(0), bytes: 0, truncated: false },
    stderr: { data: Buffer.alloc(0), bytes: 0, truncated: false },
    ...patch,
  }
}

function emptyReport() {
  return JSON.stringify({
    version: "2.1.0",
    runs: [{ tool: { driver: { name: "jscpd", version: "5.4.3", rules: [{ id: ReviewPackJscpd.RULE }] } }, results: [] }],
  })
}

function report(patch: {
  rule?: string
  driver?: string
  version?: string
  semantic?: string
  line?: number
  end?: number
  primary?: string
  counterpart?: string
  base?: string
  baseId?: string
  omitLocation?: boolean
  blame?: boolean
} = {}) {
  const line = patch.line ?? 4
  const end = patch.end ?? 12
  const physical = (uri: string) => ({
    artifactLocation: { uri, uriBaseId: patch.baseId ?? "%SRCROOT%", index: 0 },
    region: { startLine: line, startColumn: 1, endLine: end, endColumn: 2 },
  })
  return JSON.stringify({
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: patch.driver ?? "jscpd",
          version: patch.version ?? "5.4.3",
          ...(patch.semantic === undefined ? {} : { semanticVersion: patch.semantic }),
          rules: [{ id: ReviewPackJscpd.RULE }],
        },
      },
      originalUriBaseIds: { "%SRCROOT%": { uri: patch.base ?? "file:///review/root/" } },
      results: [{
        ruleId: patch.rule ?? ReviewPackJscpd.RULE,
        level: "warning",
        message: { text: "Duplicated code block (60 tokens), duplicated at [b.js:4](0)" },
        ...(patch.omitLocation ? {} : { locations: [{ physicalLocation: physical(patch.primary ?? "a.js") }] }),
        relatedLocations: [{ id: 0, message: { text: "Duplicated at b.js:4" }, physicalLocation: physical(patch.counterpart ?? "b.js") }],
        partialFingerprints: { "jscpdCloneHash/v1": HASH },
        properties: { token_count: 60, clone_hash: HASH, ...(patch.blame ? { blame: { sha: "deadbeef" } } : {}) },
      }],
    }],
  })
}
