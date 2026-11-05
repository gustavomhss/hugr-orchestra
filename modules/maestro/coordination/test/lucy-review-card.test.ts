import { expect, test } from "bun:test"
import { ReviewRouting } from "@orchestra/core/review/routing"
import type { ReviewResultV2 } from "../src/v2/governance/review-result"
import { ReviewCardV2 } from "../src/v2/workflow/review-card"

const routing: ReviewRouting.Record = {
  version: "route-v1", catalog: "a".repeat(64),
  profile: { id: "pr", source: "request" }, tier: { id: "standard", source: "risk", signals: [] },
  overlays: [{ id: "docs", source: "path", signal: "docs/a.md" }], languages: [], lenses: [], packs: [],
  budget: { lensChildren: 1, samples: 1, verifiers: 1, itemsPerLens: 1, loadsPerSession: 1,
    candidatesPerChild: 1, candidatesPerVerifier: 1, toolCallsPerSession: 1, probeAttempts: 1 },
  deviations: [],
}
const scope = { base: "base", head: "head", files: 1, changedLines: 2 }
const finding = {
  id: "C1", path: "src/a.ts", line: 2, severity: "P1", confidence: "high", lens: "correctness-logic",
  class: "logic.invariant", node: "lucy-lens-correctness-logic", rule: "invariant", trigger: "bad input",
  rungs: ["quote"], evidence: { kind: "quote", path: "src/a.ts", startLine: 2, endLine: 2 }, status: "open",
} as const
const confirmed = [{ id: finding.id, path: finding.path, line: finding.line, severity: finding.severity,
  class: finding.class, node: finding.node, lens: finding.lens, rule: finding.rule, trigger: finding.trigger,
  rungs: finding.rungs, evidence: finding.evidence }]
const card = {
  outcome: "done", verdict: "FIX_FIRST", profile: "pr", tier: "standard", overlays: ["docs"], routing, scope,
  findings: [finding], questions: [], checks: [], coverage: { examined: [], notExamined: [] },
  handoffs: [], blockers: [], risks: [], nextActions: [],
} satisfies ReviewResultV2.Card
const reply = (value: unknown) => `\`\`\`review-result\n${JSON.stringify(value)}\n\`\`\``
const expected = { routing, scope, confirmed }
const invalid = (value: unknown, reason: string, wanted: Parameters<typeof ReviewCardV2.validate>[1] = expected) =>
  expect(() => ReviewCardV2.validate(reply(value), wanted)).toThrow(reason)

test("accepts Quick quote evidence without a host confirmed list", () => {
  const quick = { ...routing, tier: { ...routing.tier, id: "quick" } }
  const value = { ...card, routing: quick, tier: "quick" }
  expect(ReviewCardV2.validate(reply(value), { routing: quick, scope })).toEqual(value)
  invalid({ ...value, findings: [{ ...finding, severity: "P2" }] }, "unverified-finding", { routing: quick, scope, confirmed: [] })
  expect(() => ReviewCardV2.validate(reply({ ...value, findings: [{ ...finding, evidence: { ...finding.evidence, startLine: 3 } }] }), { routing: quick, scope })).toThrow("unverified-finding")
})

test("accepts a Standard finding bound to the host's confirmed record", () => {
  expect(ReviewCardV2.validate(reply(card), expected)).toEqual(card)
})

test("accepts an empty APPROVE and does not promote questions to findings", () => {
  const value = { ...card, verdict: "APPROVE", findings: [], questions: [{ question: "Unverified?", severity: "P1" }] } satisfies ReviewResultV2.Card
  expect(ReviewCardV2.validate(reply(value), { ...expected, confirmed: [] })).toEqual(value)
})

test("blocked requires a blocker and cannot have a verdict", () => {
  const value = { ...card, outcome: "blocked", verdict: undefined, findings: [], blockers: [{ kind: "entry", reason: "unavailable" }] }
  expect(ReviewCardV2.validate(reply(value), { ...expected, confirmed: [] }).outcome).toBe("blocked")
  invalid({ ...value, blockers: [] }, "verdict-mismatch", { ...expected, confirmed: [] })
  invalid({ ...value, verdict: "APPROVE" }, "malformed-card")
})

test("rejects malformed and duplicated result blocks", () => {
  expect(() => ReviewCardV2.validate("```review-result\n{\n```", expected)).toThrow("malformed-card")
  expect(() => ReviewCardV2.validate(`${reply(card)}\n${reply(card)}`, expected)).toThrow("malformed-card")
  invalid({ ...card, findings: [{ ...finding, evidence: undefined }] }, "malformed-card")
})

test("rejects routing, profile, tier, overlay, catalog and scope mismatches", () => {
  for (const value of [
    { ...card, profile: "code" }, { ...card, tier: "quick" }, { ...card, overlays: [] },
    { ...card, routing: { ...routing, catalog: "b".repeat(64) } },
    { ...card, routing: { ...routing, deviations: [{ kind: "changed", stage: "finish", detail: "x" }] } },
  ]) invalid(value, "routing-mismatch")
  invalid({ ...card, scope: { ...scope, head: "other" } }, "scope-mismatch")
})

test("rejects an invented finding and fabricated evidence even with a valid id", () => {
  for (const changed of [
    { ...finding, id: "C2" }, { ...finding, evidence: { ...finding.evidence, endLine: 3 } },
    { ...finding, path: "src/b.ts" }, { ...finding, rungs: ["quote", "probe:test"] },
  ]) invalid({ ...card, findings: [changed] }, "unverified-finding")
  invalid(card, "unverified-finding", { ...expected, confirmed: [] })
})

test("APPROVE cannot carry an open blocking finding", () => {
  invalid({ ...card, verdict: "APPROVE" }, "verdict-mismatch")
})

test("every host-confirmed finding must appear exactly once and remain open", () => {
  invalid({ ...card, verdict: "APPROVE", findings: [] }, "unverified-finding", {
    ...expected, confirmed: [{ ...confirmed[0], severity: "P0" }],
  })
  const p2 = { ...confirmed[0], id: "C2", severity: "P2" }
  invalid(card, "unverified-finding", { ...expected, confirmed: [...confirmed, p2] })
  invalid({ ...card, findings: [finding, finding] }, "unverified-finding")
  invalid({ ...card, findings: [{ ...finding, status: "resolved" }] }, "unverified-finding")
  expect(ReviewCardV2.validate(reply({ ...card, verdict: "APPROVE", findings: [] }), { ...expected, confirmed: [] }).verdict).toBe("APPROVE")
})

test("done requires a verdict by default, with an explicit future non-verdict opt-out", () => {
  const value = { ...card, verdict: undefined, findings: [] }
  invalid(value, "verdict-mismatch", { ...expected, confirmed: [] })
  expect(ReviewCardV2.validate(reply(value), { ...expected, confirmed: [], verdictRequired: false }).verdict).toBeUndefined()
})

test("overlay summary retains declined routing metadata in host order, without asserting coverage", () => {
  const route: ReviewRouting.Record = { ...routing, overlays: [
    ...routing.overlays,
    { id: "concurrency", source: "content", signal: "src/a.ts:2", declined: "not applicable" },
  ] }
  const value = { ...card, routing: route, overlays: ["docs", "concurrency"], findings: [], verdict: "APPROVE" } satisfies ReviewResultV2.Card
  expect(ReviewCardV2.validate(reply(value), { routing: route, scope, confirmed: [] })).toEqual(value)
  invalid({ ...value, overlays: ["docs"] }, "routing-mismatch", { routing: route, scope, confirmed: [] })
  invalid({ ...value, overlays: ["concurrency", "docs"] }, "routing-mismatch", { routing: route, scope, confirmed: [] })
})

test("Quick cannot approve a resolved new P0 finding", () => {
  const quick = { ...routing, tier: { ...routing.tier, id: "quick" } }
  invalid({ ...card, routing: quick, tier: "quick", verdict: "APPROVE", findings: [{ ...finding, severity: "P0", status: "resolved" }] },
    "unverified-finding", { routing: quick, scope })
})

test("Quick with an authoritative host list cannot omit its P1", () => {
  const quick = { ...routing, tier: { ...routing.tier, id: "quick" } }
  invalid({ ...card, routing: quick, tier: "quick", verdict: "APPROVE", findings: [] },
    "unverified-finding", { routing: quick, scope, confirmed })
})

test("Quick with an authoritative host list rejects substituted identity or evidence", () => {
  const quick = { ...routing, tier: { ...routing.tier, id: "quick" } }
  for (const changed of [
    { ...finding, lens: "security" }, { ...finding, rule: "other" }, { ...finding, trigger: "other" },
    { ...finding, evidence: { ...finding.evidence, endLine: 3 } },
  ]) invalid({ ...card, routing: quick, tier: "quick", findings: [changed] },
    "unverified-finding", { routing: quick, scope, confirmed })
  invalid({ ...card, routing: quick, tier: "quick" }, "unverified-finding", { routing: quick, scope, confirmed: [] })
})

test("Quick accepts a finding matching its supplied host list", () => {
  const quick = { ...routing, tier: { ...routing.tier, id: "quick" } }
  const value = { ...card, routing: quick, tier: "quick" }
  expect(ReviewCardV2.validate(reply(value), { routing: quick, scope, confirmed })).toEqual(value)
})

test("host-confirmed lens, rule and trigger are immutable", () => {
  for (const changed of [
    { ...finding, lens: "security" }, { ...finding, rule: "different" }, { ...finding, trigger: "different" },
  ]) invalid({ ...card, findings: [changed] }, "unverified-finding")
})

test("duplicate host-confirmed IDs are ambiguous even if the card matches one", () => {
  invalid(card, "unverified-finding", { ...expected, confirmed: [...confirmed, { ...confirmed[0], trigger: "different" }] })
  invalid(card, "unverified-finding", { ...expected, confirmed: [...confirmed, confirmed[0]] })
})

test("FIX_FIRST requires an open P0 or P1, while REJECT is not finding-dependent", () => {
  invalid({ ...card, findings: [], questions: [{ question: "Possible P1?", severity: "P1" }] }, "verdict-mismatch", { ...expected, confirmed: [] })
  const p2 = { ...finding, severity: "P2" }
  invalid({ ...card, findings: [p2] }, "verdict-mismatch", { ...expected, confirmed: [{ ...confirmed[0], severity: "P2" }] })
  expect(ReviewCardV2.validate(reply({ ...card, verdict: "REJECT", findings: [] }), { ...expected, confirmed: [] }).verdict).toBe("REJECT")
})
