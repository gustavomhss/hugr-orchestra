import { expect, test } from "bun:test"
import type { ReviewAnalyze } from "@orchestra/core/review-toolkit/analyze"
import type { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewRouting } from "@orchestra/core/review/routing"
import type { ReviewSettings } from "@orchestra/core/review/settings"
import type { ReviewResultV2 } from "../src/v2/governance/review-result"
import { ReviewCardV2 } from "../src/v2/workflow/review-card"
import { ReviewChecksV2 } from "../src/v2/workflow/review-checks"

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
const collected = (
  route: ReviewRouting.Record,
  checks: ReadonlyArray<ReviewAnalyze.Check> = [],
  settings?: ReviewSettings.Input,
  entryBlockers?: ReviewChecksV2.Facts["blockers"],
  probes?: ReadonlyArray<ReviewProbe.Observed>,
) => ReviewChecksV2.collect({
  routing: route,
  checks,
  catalog: ReviewCatalog.current,
  settings,
  ...(entryBlockers ? { entryBlockers } : {}),
  ...(probes ? { probes } : {}),
})
const host = (route: ReviewRouting.Record, extra: { confirmed?: typeof confirmed; verdictRequired?: boolean } = {}) => ({
  routing: route, scope, checkFacts: collected(route), ...extra,
})
const expected = host(routing, { confirmed })
const invalid = (value: unknown, reason: string, wanted: Parameters<typeof ReviewCardV2.validate>[1] = expected) =>
  expect(() => ReviewCardV2.validate(reply(value), wanted)).toThrow(reason)

test("accepts Quick quote evidence without a host confirmed list", () => {
  const quick = { ...routing, tier: { ...routing.tier, id: "quick" } }
  const value = { ...card, routing: quick, tier: "quick" }
  expect(ReviewCardV2.validate(reply(value), host(quick))).toEqual(value)
  invalid({ ...value, findings: [{ ...finding, severity: "P2" }] }, "unverified-finding", host(quick, { confirmed: [] }))
  expect(() => ReviewCardV2.validate(reply({ ...value, findings: [{ ...finding, evidence: { ...finding.evidence, startLine: 3 } }] }), host(quick))).toThrow("unverified-finding")
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
  expect(ReviewCardV2.validate(reply(value), host(route, { confirmed: [] }))).toEqual(value)
  invalid({ ...value, overlays: ["docs"] }, "routing-mismatch", host(route, { confirmed: [] }))
  invalid({ ...value, overlays: ["concurrency", "docs"] }, "routing-mismatch", host(route, { confirmed: [] }))
})

test("Quick cannot approve a resolved new P0 finding", () => {
  const quick = { ...routing, tier: { ...routing.tier, id: "quick" } }
  invalid({ ...card, routing: quick, tier: "quick", verdict: "APPROVE", findings: [{ ...finding, severity: "P0", status: "resolved" }] },
    "unverified-finding", host(quick))
})

test("Quick with an authoritative host list cannot omit its P1", () => {
  const quick = { ...routing, tier: { ...routing.tier, id: "quick" } }
  invalid({ ...card, routing: quick, tier: "quick", verdict: "APPROVE", findings: [] },
    "unverified-finding", host(quick, { confirmed }))
})

test("Quick with an authoritative host list rejects substituted identity or evidence", () => {
  const quick = { ...routing, tier: { ...routing.tier, id: "quick" } }
  for (const changed of [
    { ...finding, lens: "security" }, { ...finding, rule: "other" }, { ...finding, trigger: "other" },
    { ...finding, evidence: { ...finding.evidence, endLine: 3 } },
  ]) invalid({ ...card, routing: quick, tier: "quick", findings: [changed] },
    "unverified-finding", host(quick, { confirmed }))
  invalid({ ...card, routing: quick, tier: "quick" }, "unverified-finding", host(quick, { confirmed: [] }))
})

test("Quick accepts a finding matching its supplied host list", () => {
  const quick = { ...routing, tier: { ...routing.tier, id: "quick" } }
  const value = { ...card, routing: quick, tier: "quick" }
  expect(ReviewCardV2.validate(reply(value), host(quick, { confirmed }))).toEqual(value)
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

const requiredRoute: ReviewRouting.Record = {
  ...routing,
  packs: [{ id: "repo", lane: "repo", status: "routed", source: "catalog" }],
}
const unavailable: ReviewAnalyze.Check = {
  id: "typecheck", pack: "repo", version: "base-revision", lane: "ci", status: "not-run",
  reason: "bun absent", workspaceExecuted: false,
}
const identity = (check: { pack?: string; lane?: string; id: string }) =>
  JSON.stringify([check.pack ?? "", check.lane ?? "", check.id])
const settled = (
  route: ReviewRouting.Record,
  facts: ReviewChecksV2.Facts,
  patch: Record<string, unknown> = {},
) => ({
  ...card,
  routing: route,
  overlays: route.overlays.map((overlay) => overlay.id),
  findings: [],
  verdict: facts.blockers.length === 0 ? "APPROVE" as const : undefined,
  outcome: facts.blockers.length === 0 ? "done" as const : "blocked" as const,
  checks: facts.checks,
  blockers: facts.blockers,
  ...patch,
})
const bound = (
  route: ReviewRouting.Record,
  facts: ReviewChecksV2.Facts,
  extra: { confirmed?: typeof confirmed } = {},
) => ({ routing: route, scope, checkFacts: facts, confirmed: [], ...extra })

test("a routed pack with no host check is one required unavailable check, and zero packs are not", () => {
  const missing = collected(requiredRoute)
  expect(missing.checks).toContainEqual({
    id: "repo", lane: "repo", pack: "repo", version: "unknown", status: "check-unavailable",
    reason: "required pack produced no host check", workspaceExecuted: false, accepted: false,
  })
  expect(missing.required).toContain(identity({ pack: "repo", lane: "repo", id: "repo" }))
  expect(missing.blockers).toContainEqual({
    kind: "check-unavailable", reason: "required pack produced no host check",
    ref: identity({ pack: "repo", lane: "repo", id: "repo" }),
  })
  invalid(settled(requiredRoute, missing, { outcome: "done", verdict: "APPROVE", blockers: [] }), "checks-blocked", bound(requiredRoute, missing))
  const none = collected(routing)
  expect(none.required).toEqual([])
  expect(none.checks).toEqual([])
  expect(ReviewCardV2.validate(reply(settled(routing, none)), bound(routing, none)).verdict).toBe("APPROVE")
})

test("omitted, invented, altered and duplicate required checks are rejected; order is not", () => {
  const second: ReviewAnalyze.Check = { ...unavailable, id: "lint", reason: "eslint absent" }
  const facts = collected(requiredRoute, [unavailable, second])
  const wanted = bound(requiredRoute, facts)
  const value = settled(requiredRoute, facts)
  expect(ReviewCardV2.validate(reply(value), wanted)).toEqual(value)
  invalid({ ...value, checks: [] }, "checks-mismatch", wanted)
  invalid({ ...value, checks: [...facts.checks, { id: "invented", status: "pass" }] }, "checks-mismatch", wanted)
  invalid({ ...value, checks: facts.checks.map((check) => ({ ...check, id: "other-gate" })) }, "checks-mismatch", wanted)
  invalid({ ...value, checks: facts.checks.map((check) => ({ ...check, lane: "no-build" })) }, "checks-mismatch", wanted)
  invalid({ ...value, checks: facts.checks.map((check) => ({ ...check, status: "pass" })) }, "checks-mismatch", wanted)
  invalid({ ...value, checks: facts.checks.map((check) => ({ ...check, accepted: true })) }, "checks-mismatch", wanted)
  invalid({ ...value, checks: [...facts.checks, facts.checks[0]] }, "checks-mismatch", wanted)
  const reversed = [...facts.checks].reverse()
  expect(reversed).not.toEqual(facts.checks)
  expect(ReviewCardV2.validate(reply({ ...value, checks: reversed }), wanted).checks).toEqual(reversed)
})

test("exact check id or lane may be accepted; a pack name, near-match, or acquisition error may not", () => {
  const accept = (acceptedUnavailable: readonly string[]) => collected(requiredRoute, [unavailable], {
    review: { acceptedUnavailable },
  })
  const byId = accept(["typecheck"])
  const byLane = accept(["ci"])
  expect(byId.checks.every((check) => check.accepted === true)).toBe(true)
  expect(byLane.blockers).toEqual([])
  expect(ReviewCardV2.validate(reply(settled(requiredRoute, byId)), bound(requiredRoute, byId)).verdict).toBe("APPROVE")
  const packName = accept(["repo"])
  const near = accept(["typecheck-extra"])
  expect(packName.blockers.some((blocker) => blocker.kind === "check-unavailable")).toBe(true)
  expect(near.checks.some((check) => check.accepted === true)).toBe(false)
  invalid(settled(requiredRoute, packName, { outcome: "done", verdict: "APPROVE", blockers: [] }), "checks-blocked", bound(requiredRoute, packName))
  const acquired: ReviewAnalyze.Check = { ...unavailable, status: "acquisition-error", reason: "exit 2" }
  const waived = collected(requiredRoute, [acquired], { review: { acceptedUnavailable: ["typecheck", "ci"] } })
  expect(waived.checks.some((check) => check.accepted === true)).toBe(false)
  expect(waived.blockers).toContainEqual({
    kind: "acquisition-error", reason: "exit 2", ref: identity(acquired),
  })
  invalid(settled(requiredRoute, waived, { outcome: "done", verdict: "APPROVE", blockers: [] }), "checks-blocked", bound(requiredRoute, waived))
})

test("a host-blocked entry rejects a fabricated APPROVE and keeps each host blocker once", () => {
  const entryBlockers = [{ kind: "entry", reason: "unavailable" }]
  const facts = collected(routing, [], undefined, entryBlockers)
  expect(facts.blockers).toEqual(entryBlockers)
  const wanted = bound(routing, facts)
  invalid(settled(routing, facts, { outcome: "done", verdict: "APPROVE", blockers: [] }), "checks-blocked", wanted)
  invalid({ ...settled(routing, facts), blockers: [] }, "verdict-mismatch", wanted)
  invalid({ ...settled(routing, facts), blockers: [{ kind: "unrelated", reason: "not the host blocker" }] }, "checks-blocked", wanted)
  invalid({ ...settled(routing, facts), blockers: [...entryBlockers, entryBlockers[0]] }, "checks-blocked", wanted)
  const extra = { kind: "model", reason: "noted" }
  expect(ReviewCardV2.validate(reply({ ...settled(routing, facts), blockers: [...entryBlockers, extra] }), wanted).blockers).toEqual([
    ...entryBlockers, extra,
  ])
})

test("a failed required check cannot approve and does not become a finding; a failed probe can", () => {
  const failed: ReviewAnalyze.Check = { ...unavailable, status: "fail", reason: "exit 1" }
  const facts = collected(requiredRoute, [failed])
  expect(facts.checks.some((check) => check.status === "fail")).toBe(true)
  expect(facts.blockers.some((blocker) => blocker.kind === "check-unavailable")).toBe(false)
  invalid(settled(requiredRoute, facts, { outcome: "done", verdict: "APPROVE" }), "checks-blocked", bound(requiredRoute, facts))
  const rejected = settled(requiredRoute, facts, { outcome: "done", verdict: "REJECT", findings: [] })
  expect(ReviewCardV2.validate(reply(rejected), bound(requiredRoute, facts)).findings).toEqual([])
  const probe: ReviewProbe.Observed = {
    candidate: "C9", option: "probe:test",
    result: { status: "fail", reason: "red", durationMs: 1, excerpt: "", uri: "review:probe/1", tree: "abc" },
  }
  const probed = collected(routing, [], undefined, undefined, [probe])
  expect(probed.checks.some((check) => check.id === "probe:C9:probe:test:review:probe/1" && check.status === "fail")).toBe(true)
  expect(probed.blockers).toEqual([])
  expect(ReviewCardV2.validate(reply(settled(routing, probed)), bound(routing, probed)).verdict).toBe("APPROVE")
})
