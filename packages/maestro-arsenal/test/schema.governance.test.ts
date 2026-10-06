import { expect, test } from "bun:test"
import { validateArgs } from "../src/validate.ts"
import { GOVERNANCE_CAPABILITIES, GOVERNANCE_TEST_TRACE } from "../src/governance/capabilities.ts"
import governance, { GOVERNANCE_OPERATIONS } from "../src/tools/governance.ts"
import profile from "../src/tools/profile.ts"
import relay from "../src/tools/relay-arm.ts"
import ledger from "../src/tools/wave-ledger.ts"
import scheduler from "../src/tools/wave-scheduler.ts"
import { capture, check, fixture, operation } from "./fixtures.governance.ts"
import { rethrow } from "./rejection.ts"
test("native exact operation schemas accept real contracts, reject unknown capabilities/prose greens", async () => {
  const f = await fixture()
  const valid = { operation: "acceptance", baseline: capture(check("new", "fail")), final: capture(check("new")), acceptance: [{ name: "new", mode: "red-green" }] }
  expect(validateArgs(governance.inputSchema, valid).ok).toBe(true)
  expect(validateArgs(governance.inputSchema, { ...valid, green: true }).ok).toBe(false)
  expect(validateArgs(governance.inputSchema, { operation: "not-implemented" }).ok).toBe(false)
  expect(validateArgs(governance.inputSchema, { operation: "cost-estimate", estimates: [], prices: [] }).ok).toBe(false)
  expect(validateArgs(profile.inputSchema, { action: "set", patch: { neverTouch: [1] } }).ok).toBe(false)
  expect(validateArgs(ledger.inputSchema, { action: "record", wave: "../escape" }).ok).toBe(false)
  expect(validateArgs(relay.inputSchema, { action: "arm", contract: { label: "raw-shell", chain: [{ cmd: "true" }] } }).ok).toBe(false)
  expect(validateArgs(scheduler.inputSchema, { wps: [], events: [], cap: 0 }).ok).toBe(true)
  expect((await scheduler.handler({ wps: [], events: [], cap: 0 })).content.length).toBe(1)
  expect(await rethrow(operation({ operation: "audit", observations: { complete: false, actions: [], usage: [] } }, f.context))).toThrow("OBSERVATION_ACQUISITION_INCOMPLETE")
  expect(await rethrow(governance.handler({ operation: "ruleset-propose", repository: "owner/project" }))).toThrow("NATIVE_CONTEXT_REQUIRED")
})
test("source capability trace covers native operation enum and resolves actual targets/tests", async () => {
  const mapped = new Set(GOVERNANCE_CAPABILITIES.flatMap((entry) => [...entry.capabilities]))
  expect(GOVERNANCE_OPERATIONS.length).toBeGreaterThan(0)
  GOVERNANCE_OPERATIONS.forEach((name) => expect(mapped.has(name)).toBe(true))
  const root = new URL("../", import.meta.url)
  await Promise.all(GOVERNANCE_CAPABILITIES.map(async (entry) => {
    expect(await Bun.file(new URL(entry.target, root)).exists()).toBe(true)
    if ("operatorTarget" in entry) expect(await Bun.file(new URL(entry.operatorTarget, root)).exists()).toBe(true)
    expect(await Bun.file(new URL(entry.tests, root)).exists()).toBe(true)
    expect(entry.host.length).toBeGreaterThan(0)
  }))
  await Promise.all(GOVERNANCE_TEST_TRACE.map(async ([source, target]) => {
    expect(source.length).toBeGreaterThan(0)
    expect(await Bun.file(new URL(target, root)).exists()).toBe(true)
  }))
})
