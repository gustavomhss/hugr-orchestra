import { afterEach, expect, test } from "bun:test"
import type { ExecutionReport, Page } from "@/orchestra/chapters/board/model"
import { createComponent, render } from "./lean-dom.test-helper"
import { solidDom } from "./solid-dom"

const { ExecutionMetrics, ExecutionReceipt, IssueExecutions }: typeof import("@/orchestra/chapters/board/executions") = await import(solidDom("@/orchestra/chapters/board/executions", import.meta.dir))
const { LanguageProvider }: typeof import("@/context/language") = await import(solidDom("@/context/language", import.meta.dir))
const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))
const mounted: (() => void)[] = []
afterEach(() => mounted.splice(0).forEach((dispose) => dispose()))

const metrics: ExecutionReport["metrics"] = { tokens: null, modelUsd: null, ciUsd: null, ciMs: null, ciRuns: 0, providerMs: null, toolUses: null, partial: true }

function mount(children: () => ReturnType<typeof createComponent>) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return createComponent(LanguageProvider, { locale: "en", get children() { return children() } }) },
  }), host)
  mounted.push(() => { dispose(); host.remove() })
  return host
}

test("unknown telemetry never renders invented zeros, while measured counters retain zero", () => {
  const unknown = mount(() => createComponent(ExecutionMetrics, { metrics }))
  expect(unknown.textContent).toContain("Not recorded")
  expect(unknown.textContent).toContain("Cost unavailable")
  expect(unknown.textContent).not.toContain("USD 0")
  const zero = mount(() => createComponent(ExecutionMetrics, { metrics: { ...metrics, tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, toolUses: 0, providerMs: 0 } }))
  expect([...zero.querySelectorAll("dd")].map((value) => value.textContent)).toEqual(["0", "0", "0", "0", "0", "Cost unavailable", "0 s", "0"])
})

test("small measured costs do not round down to a fictitious free call", () => {
  const host = mount(() => createComponent(ExecutionMetrics, { metrics: { ...metrics, modelUsd: 0.000001 } }))
  expect(host.textContent).toContain("USD 0.000001")
})

test("old CI amounts without rate provenance never masquerade as attested measurements", () => {
  const host = mount(() => createComponent(ExecutionMetrics, { metrics: { ...metrics, partial: false, ciRuns: 1, ciUsd: 123.456, ciMs: 654321 } }))
  expect(host.textContent).toContain("Partial measurements")
  expect(host.textContent).not.toContain("USD 123.456")
  expect(host.textContent).not.toContain("654.321")
  expect([...host.querySelectorAll("dt")].find((node) => node.textContent === "CI runner time")?.nextElementSibling?.textContent).toBe("Unavailable")
  const known = mount(() => createComponent(ExecutionMetrics, { metrics: { ...metrics, ciRuns: 1, ciUsd: 123.456, ciMs: 654321, ciRateBasis: "standard-x64-2026-11" } }))
  expect(known.textContent).toContain("USD 123.456")
  expect(known.textContent).toContain("654.321 s")
})

test("CI is an estimate and complete receipts still explain parallel turn time", () => {
  const report: ExecutionReport = { ref: "NEW-1", asOf: 1000, creator: null, models: [], participants: [], attempts: [], metrics, leadTimeMs: 1000, receipts: [{ closedAt: 1000, stage: "shipped", leadTimeMs: 1000, attempts: 1, metrics: { ...metrics, partial: false, providerMs: 3000, ciRuns: 1, ciMs: 1000, ciUsd: 0.01, ciRateBasis: "standard-x64-2026-11" } }], unattributedSessions: [], unassignedSessions: [] }
  const host = mount(() => createComponent(ExecutionReceipt, { report, stage: "shipped", stageEnteredAt: 1000, time: String }))
  expect(host.textContent).toContain("CI estimate")
  expect(host.textContent).toContain("published runner rates")
  expect(host.textContent).toContain("sums parallel sessions")
  expect(host.textContent).toContain("1 s")
  expect(host.textContent).not.toContain("Missing timing")
  const undone = mount(() => createComponent(ExecutionReceipt, { report: { ...report, receipts: [{ ...report.receipts[0], undoneBy: "bac_undo" }] }, stage: "shipped", stageEnteredAt: 1000, time: String }))
  expect(undone.textContent).toContain("No receipt was recorded at closure")
})

test("pending execution reports never claim recorded attempts are unavailable", () => {
  const page = { issue: { id: "issue" }, notes: [{ id: "doc", kind: "brief", attempt: 1, body: "Original briefing", author: "backend", timeCreated: 1 }] } as Page
  const host = mount(() => createComponent(IssueExecutions, { page, failed: false, time: String, retry() {} }))
  expect(host.textContent).toContain("Loading…")
  expect(host.textContent).not.toContain("execution details are unavailable")
  expect(host.querySelector("[data-recorded-attempt]")).toBeNull()
})

test("historical terminal cards do not manufacture a receipt from current measurements", () => {
  const report: ExecutionReport = { ref: "OLD-1", asOf: 1000, creator: null, models: [], participants: [], attempts: [], metrics: { ...metrics, modelUsd: 42 }, leadTimeMs: 1000, receipts: [], unattributedSessions: [], unassignedSessions: [] }
  const host = mount(() => createComponent(ExecutionReceipt, { report, stage: "shipped", stageEnteredAt: 0, time: String }))
  expect(host.textContent).toContain("No receipt was recorded at closure")
  expect(host.textContent).not.toContain("USD 42")
  const previous = { ...report, receipts: [{ closedAt: 100, stage: "shipped" as const, leadTimeMs: 100, attempts: 1, metrics: report.metrics }] }
  const reopened = mount(() => createComponent(ExecutionReceipt, { report: previous, stage: "shipped", stageEnteredAt: 200, time: String }))
  expect(reopened.textContent).toContain("No receipt was recorded at closure")
  expect(reopened.textContent).not.toContain("USD 42")
})
