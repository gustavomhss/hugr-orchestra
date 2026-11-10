import { expect, test } from "bun:test"
import type { MaestroEvent } from "@orchestra/schema/maestro-event"
import { ReviewCardV2 } from "../src/v2/workflow/review-card"

type Findings = ReadonlyArray<MaestroEvent.Review.Finding>

const quote = { kind: "quote" as const, path: "src/a.ts", startLine: 2, endLine: 2 }
const finding = {
  path: "src/a.ts",
  line: 2,
  message: "bad input",
  id: "C1",
  severity: "P1" as const,
  confidence: "high" as const,
  lens: "correctness-logic",
  class: "logic.invariant",
  node: "lucy-lens-correctness-logic",
  rule: "invariant",
  trigger: "bad input",
  rungs: ["quote"],
  evidence: quote,
  status: "open" as const,
} satisfies MaestroEvent.Review.Finding
const confirmed: ReviewCardV2.Confirmed = {
  id: finding.id, path: finding.path, line: finding.line, severity: finding.severity,
  class: finding.class, node: finding.node, lens: finding.lens, rule: finding.rule,
  trigger: finding.trigger, rungs: finding.rungs, evidence: finding.evidence,
}

const accept = (findings: Findings, expected: Parameters<typeof ReviewCardV2.validateFindings>[1]) =>
  expect(() => ReviewCardV2.validateFindings(findings, expected)).not.toThrow()
const reject = (findings: Findings, expected: Parameters<typeof ReviewCardV2.validateFindings>[1]) =>
  expect(() => ReviewCardV2.validateFindings(findings, expected)).toThrow("unverified-finding")

test("a Standard finding matches the host list exactly, including an empty list", () => {
  accept([finding], { quick: false, confirmed: [confirmed] })
  accept([], { quick: false, confirmed: [] })
  const ranged = { ...finding, endLine: 4, evidence: { ...quote, endLine: 4 } }
  accept([ranged], { quick: false, confirmed: [{ ...confirmed, endLine: 4, evidence: ranged.evidence }] })
})

test("Standard requires an explicit host list, and each confirmed finding appears once", () => {
  reject([], { quick: false })
  reject([finding], { quick: false })
  reject([], { quick: false, confirmed: [confirmed] })
  reject([finding, { ...finding, id: "C2" }], { quick: false, confirmed: [confirmed] })
  reject([finding, finding], { quick: false, confirmed: [confirmed] })
  reject([finding], { quick: false, confirmed: [confirmed, confirmed] })
  reject([{ ...finding, id: "C9" }], { quick: false, confirmed: [confirmed] })
  reject([{ ...finding, status: "resolved" }], { quick: false, confirmed: [confirmed] })
  reject([{ ...finding, status: "dismissed" }], { quick: false, confirmed: [confirmed] })
})

test("every host-confirmed field is immutable", () => {
  for (const changed of [
    { ...finding, id: "C2" },
    { ...finding, path: "src/b.ts" },
    { ...finding, line: 9 },
    { ...finding, endLine: 4 },
    { ...finding, severity: "P0" as const },
    { ...finding, class: "other.class" },
    { ...finding, node: "other-node" },
    { ...finding, lens: "security" },
    { ...finding, rule: "other" },
    { ...finding, trigger: "other" },
    { ...finding, rungs: ["quote", "probe:test"] },
    { ...finding, evidence: { ...quote, endLine: 3 } },
  ]) reject([changed], { quick: false, confirmed: [confirmed] })
})

test("Quick accepts a quote-only P0 or P1 and a supplied host list, and rejects a fabricated quote", () => {
  accept([finding], { quick: true })
  accept([{ ...finding, severity: "P0" }], { quick: true })
  accept([finding], { quick: true, confirmed: [confirmed] })
  reject([], { quick: true, confirmed: [confirmed] })
  reject([{ ...finding, severity: "P2" }], { quick: true })
  reject([{ ...finding, severity: "P3" }], { quick: true })
  reject([{ ...finding, rungs: [] }], { quick: true })
  reject([{ ...finding, rungs: ["probe:test"] }], { quick: true })
  reject([{ ...finding, rungs: ["quote", "probe:test"] }], { quick: true })
  reject([{ ...finding, evidence: { ...quote, path: "src/b.ts" } }], { quick: true })
  reject([{ ...finding, evidence: { ...quote, startLine: 3 } }], { quick: true })
  reject([{ ...finding, evidence: { ...quote, endLine: 3 } }], { quick: true })
  reject([{
    ...finding,
    evidence: { kind: "probe", option: "probe:test", command: "bun test", result: "fail" },
    rungs: ["probe:test"],
  }], { quick: true })
  reject([{ ...finding, evidence: { ...quote, endLine: 9 } }], { quick: true })
})

test("a missing required receipt field fails, and a missing message does not get invented", () => {
  const { confidence: _confidence, ...withoutConfidence } = finding
  reject([withoutConfidence], { quick: false, confirmed: [confirmed] })
  const { severity: _severity, ...withoutSeverity } = finding
  reject([withoutSeverity], { quick: true })
  const { message: _message, ...withoutMessage } = finding
  expect(() => Reflect.apply(ReviewCardV2.validateFindings, undefined, [[withoutMessage], { quick: false, confirmed: [confirmed] }])).not.toThrow()
  const extra = JSON.parse(JSON.stringify({ ...finding, invented: true }))
  expect(() => Reflect.apply(ReviewCardV2.validateFindings, undefined, [[extra], { quick: false, confirmed: [confirmed] }])).toThrow("unverified-finding")
})
