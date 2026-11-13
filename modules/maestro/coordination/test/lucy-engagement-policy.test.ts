import { expect, test } from "bun:test"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { Schema } from "effect"
import { ReviewCardV2 } from "../src/v2/workflow/review-card"
import { ReviewChecksV2 } from "../src/v2/workflow/review-checks"
import { ReviewEngagementPolicyV2 } from "../src/v2/workflow/review-engagement-policy"

// Future home: modules/maestro/coordination/test/lucy-engagement-policy.test.ts
// Expectations are the frozen contract, not the scaffold. Rows marked control already pass the shape stub.

const decode = Schema.decodeUnknownSync(ReviewEngagementPolicyV2.Input)
const hex64 = "ab".repeat(32)
const now = 1_700_000_000_000
const minuteMs = 60_000
const profiles = ["audit", "diligence", "artifact", "compliance"] as const
const policy = (run: () => unknown) => expect(run).toThrow(/engagement-policy/)
const inputPolicy = (run: () => unknown) => expect(run).toThrow(Schema.SchemaError)

const valid = {
  kind: "engagement" as const,
  requestID: "req-1",
  profile: "audit",
  brief: "Read the tree.",
  timeBoxMinutes: 15,
  revision: "abc123",
  paths: [".", "src/文件.ts"],
  fixReview: { reportID: hex64, findingIDs: ["C1", "C2"] },
}

const routingFor = (id: string): ReviewRouting.Record => ({
  version: "route-v1",
  catalog: "a".repeat(64),
  profile: { id, source: "request" },
  tier: { id: "standard", source: "risk", signals: [] },
  overlays: [{ id: "docs", source: "path", signal: "docs/a.md" }],
  languages: [],
  lenses: [],
  packs: [],
  budget: {
    lensChildren: 1, samples: 1, verifiers: 1, itemsPerLens: 1, loadsPerSession: 1,
    candidatesPerChild: 1, candidatesPerVerifier: 1, toolCallsPerSession: 1, probeAttempts: 1,
  },
  deviations: [],
})
const scope = { base: "base", head: "head", files: 1, changedLines: 2 }
const finding = {
  id: "C1", path: "src/a.ts", line: 2, severity: "P1", confidence: "high", lens: "correctness-logic",
  class: "logic.invariant", node: "lucy-lens-correctness-logic", rule: "invariant", trigger: "bad input",
  rungs: ["quote"], evidence: { kind: "quote", path: "src/a.ts", startLine: 2, endLine: 2 }, status: "open",
} as const
const confirmed = [{
  id: finding.id, path: finding.path, line: finding.line, severity: finding.severity,
  class: finding.class, node: finding.node, lens: finding.lens, rule: finding.rule, trigger: finding.trigger,
  rungs: finding.rungs, evidence: finding.evidence,
}]
const reply = (value: unknown) => "```review-result\n" + JSON.stringify(value) + "\n```"
const facts = (routing: ReviewRouting.Record) =>
  ReviewChecksV2.collect({ routing, catalog: ReviewCatalog.current, checks: [], settings: undefined })
const host = (id: string, extra: { confirmed?: typeof confirmed } = {}) => ({
  routing: routingFor(id),
  scope,
  checkFacts: facts(routingFor(id)),
  confirmed: extra.confirmed ?? [],
})
const cardFor = (id: string, verdict?: "APPROVE" | "FIX_FIRST" | "REJECT") => ({
  outcome: "done" as const,
  ...(verdict ? { verdict } : {}),
  profile: id,
  tier: "standard",
  overlays: ["docs"],
  routing: routingFor(id),
  scope,
  findings: verdict === "FIX_FIRST" ? [finding] : [],
  questions: [],
  checks: [],
  coverage: {
    examined: [],
    notExamined: id === "artifact" ? [{ item: "artifact:behavioral-eval", reason: "owner-permission" }] : [],
  },
  handoffs: [],
  blockers: [],
  risks: [],
  nextActions: [],
})

test("F1 control: decodes a valid engagement with dot, unicode path, and optional fields", () => {
  expect(decode(valid)).toEqual(valid)
  expect(decode({ kind: "engagement", requestID: "r", profile: "diligence", brief: "b", timeBoxMinutes: 1 })).toEqual({
    kind: "engagement", requestID: "r", profile: "diligence", brief: "b", timeBoxMinutes: 1,
  })
  expect(decode({ ...valid, requestID: "r".repeat(128), timeBoxMinutes: 120, profile: "compliance" }).timeBoxMinutes).toBe(120)
  expect(decode({ ...valid, brief: "é".repeat(32768), profile: "artifact" }).brief.length).toBe(32768)
  expect(decode({ ...valid, paths: ["."] }).paths).toEqual(["."])
  expect(decode({
    ...valid,
    fixReview: { reportID: hex64, findingIDs: Array.from({ length: 64 }, (_, index) => `F${index}`) },
  }).fixReview?.findingIDs.length).toBe(64)
})

test("F1 control: rejects empty strings, wrong kind, and governed excess fields", () => {
  expect(() => decode({ ...valid, requestID: "" })).toThrow()
  expect(() => decode({ ...valid, kind: "pr" })).toThrow()
  expect(() => decode({ ...valid, paths: [""] })).toThrow()
  for (const field of ["validationRecordID", "workCard", "reviewMethodVersion", "unknown"]) {
    expect(() => decode({ ...valid, [field]: "no" })).toThrow()
  }
})

test("F1 refuses untrusted bounds, profiles, revisions, paths, and fix identity", () => {
  inputPolicy(() => decode({ ...valid, profile: "pr" }))
  inputPolicy(() => decode({ ...valid, profile: "Audit" }))
  for (const timeBoxMinutes of [0, 121, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    inputPolicy(() => decode({ ...valid, timeBoxMinutes }))
  }
  inputPolicy(() => decode({ ...valid, requestID: "r".repeat(129) }))
  inputPolicy(() => decode({ ...valid, brief: "x".repeat(65537) }))
  inputPolicy(() => decode({ ...valid, brief: `${"é".repeat(32768)}x` }))
  inputPolicy(() => decode({ ...valid, revision: `${"r".repeat(1025)}` }))
  for (const revision of ["\0abc", "abc\n", "-head", "\n", "-"]) inputPolicy(() => decode({ ...valid, revision }))
  for (const paths of [
    ["/abs"], ["C:/win"], ["a\\b"], ["a\0b"], ["foo//bar"], [".."], ["foo/../bar"], ["foo/./bar"], ["./x"], ["foo/.."], ["a", "a"],
  ]) {
    inputPolicy(() => decode({ ...valid, paths }))
  }
  inputPolicy(() => decode({ ...valid, paths: [] }))
  inputPolicy(() => decode({ ...valid, paths: Array.from({ length: 257 }, (_, index) => `f${index}.ts`) }))
  inputPolicy(() => decode({ ...valid, fixReview: { ...valid.fixReview, extra: true } }))
  inputPolicy(() => decode({ ...valid, fixReview: { reportID: "g".repeat(64), findingIDs: ["C1"] } }))
  inputPolicy(() => decode({ ...valid, fixReview: { reportID: "A".repeat(64), findingIDs: ["C1"] } }))
  inputPolicy(() => decode({ ...valid, fixReview: { reportID: "ab".repeat(31), findingIDs: ["C1"] } }))
  inputPolicy(() => decode({ ...valid, fixReview: { reportID: hex64, findingIDs: [] } }))
  inputPolicy(() => decode({ ...valid, fixReview: { reportID: hex64, findingIDs: ["C1", "C1"] } }))
  inputPolicy(() => decode({ ...valid, fixReview: { reportID: hex64, findingIDs: Array.from({ length: 65 }, (_, index) => `F${index}`) } }))
})

test("F2 host budget milliseconds, audit generation cap, and unsafe bounds", () => {
  const budget = [
    ["audit", 1, 3],
    ["audit", 120, 3],
    ["diligence", 30, 0],
    ["artifact", 30, 0],
    ["compliance", 30, 0],
  ] as const
  for (const [profile, timeBoxMinutes, maxGenerations] of budget) {
    expect(ReviewEngagementPolicyV2.createBudget({ profile, timeBoxMinutes }, now)).toEqual({
      startedAt: now,
      deadlineAt: now + timeBoxMinutes * minuteMs,
      maxGenerations,
    })
  }
  expect(ReviewEngagementPolicyV2.createBudget({ profile: "audit", timeBoxMinutes: 1 }, 0).deadlineAt).toBe(minuteMs)
  for (const instant of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    policy(() => ReviewEngagementPolicyV2.createBudget({ profile: "audit", timeBoxMinutes: 1 }, instant))
  }
  policy(() => ReviewEngagementPolicyV2.createBudget({ profile: "audit", timeBoxMinutes: 1 }, Number.MAX_SAFE_INTEGER))
  policy(() => ReviewEngagementPolicyV2.createBudget({ profile: "pr", timeBoxMinutes: 1 }, now))
  for (const timeBoxMinutes of [0, 121, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    policy(() => ReviewEngagementPolicyV2.createBudget({ profile: "audit", timeBoxMinutes }, now))
  }
})

test("F3 next generation boundaries, half noise, and malformed counts", () => {
  const allow = { profile: "audit", completed: 2, matches: 3, noise: 1, now: 10, deadlineAt: 11 }
  expect(ReviewEngagementPolicyV2.nextGeneration(allow)).toBe(true)
  const stop = [
    { ...allow, noise: 2, matches: 4 },
    { ...allow, matches: 0, noise: 0 },
    { ...allow, completed: 3 },
    { ...allow, now: 11 },
    { ...allow, completed: 0, matches: 1, noise: 0, now: 12, deadlineAt: 12 },
  ]
  for (const row of stop) expect(ReviewEngagementPolicyV2.nextGeneration(row)).toBe(false)
  for (const profile of profiles.filter((profile) => profile !== "audit")) {
    expect(ReviewEngagementPolicyV2.nextGeneration({ ...allow, profile })).toBe(false)
  }
  policy(() => ReviewEngagementPolicyV2.nextGeneration({ ...allow, profile: "pr" }))
  for (const row of [
    { ...allow, completed: -1 },
    { ...allow, matches: -1 },
    { ...allow, noise: -1 },
    { ...allow, noise: 4 },
    { ...allow, matches: 1.5 },
    { ...allow, now: -1 },
    { ...allow, deadlineAt: -1 },
    { ...allow, now: Number.NaN },
    { ...allow, deadlineAt: Number.POSITIVE_INFINITY },
    { ...allow, completed: Number.MAX_SAFE_INTEGER + 1 },
  ]) policy(() => ReviewEngagementPolicyV2.nextGeneration(row))
})

test("F4 control: no-verdict host-bound card is accepted; ordinary governed verdict stays on ReviewCard", () => {
  const expected = host("audit")
  const card = cardFor("audit")
  expect(ReviewEngagementPolicyV2.validateReport(reply(card), expected)).toEqual(card)
  expect(ReviewEngagementPolicyV2.validateReport(reply(cardFor("artifact")), host("artifact"))).toEqual(cardFor("artifact"))
  expect(() => ReviewEngagementPolicyV2.validateReport(reply({ ...card, profile: "diligence" }), expected)).toThrow("routing-mismatch")
  expect(() => ReviewEngagementPolicyV2.validateReport(reply({ ...card, findings: [finding] }), expected)).toThrow("unverified-finding")
  expect(() => ReviewEngagementPolicyV2.validateReport(reply({ ...card, checks: [{ id: "ghost", status: "pass" }] }), expected)).toThrow("checks-mismatch")
  const governed = cardFor("code", "FIX_FIRST")
  expect(ReviewCardV2.validate(reply(governed), { ...host("code", { confirmed }), verdictRequired: true })).toEqual(governed)
})

test("F4 refuses present verdicts, reclassification, mismatches, and missing artifact R20", () => {
  const audit = host("audit")
  policy(() => ReviewEngagementPolicyV2.validateReport(reply(cardFor("audit", "APPROVE")), audit))
  policy(() => ReviewEngagementPolicyV2.validateReport(reply(cardFor("audit", "REJECT")), audit))
  policy(() => ReviewEngagementPolicyV2.validateReport(reply(cardFor("audit", "FIX_FIRST")), host("audit", { confirmed })))
  policy(() => ReviewEngagementPolicyV2.validateReport(reply(cardFor("pr")), host("pr")))
  const artifact = cardFor("artifact")
  policy(() => ReviewEngagementPolicyV2.validateReport(reply({ ...artifact, coverage: { examined: [], notExamined: [{ item: "other", reason: "owner-permission" }] } }), host("artifact")))
  policy(() => ReviewEngagementPolicyV2.validateReport(reply({ ...artifact, coverage: { examined: [], notExamined: [] } }), host("artifact")))
  policy(() => ReviewEngagementPolicyV2.validateReport(reply({
    ...artifact,
    coverage: { examined: [], notExamined: [{ item: "artifact:behavioral-eval", reason: "time box" }] },
  }), host("artifact")))
})

test("F5 severity maps audit and diligence and keeps other accepted P-codes", () => {
  const mapped = [
    ["audit", "P0", "material weakness"],
    ["audit", "P1", "significant deficiency"],
    ["audit", "P2", "deficiency"],
    ["audit", "P3", "observation"],
    ["diligence", "P0", "deal-breaker"],
    ["diligence", "P1", "price or structure item"],
    ["diligence", "P2", "condition or remediation"],
    ["diligence", "P3", "observation"],
    ["artifact", "P0", "P0"],
    ["compliance", "P3", "P3"],
  ] as const
  for (const [profile, value, label] of mapped) {
    expect(ReviewEngagementPolicyV2.severity(profile, value)).toBe(label)
  }
  policy(() => ReviewEngagementPolicyV2.severity("pr", "P0"))
  policy(() => ReviewEngagementPolicyV2.severity("Audit", "P1"))
})
