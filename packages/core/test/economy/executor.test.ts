// G1 / F2 — executor guard oracle (EA-05..EA-07).
// Contract: modules/atlas/docs/design/genesis-g1-contract.md §3.2.
// Green: typed refusals before open/send/forward; no monetary hard-cap without price contract.

import { describe, expect, test, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { closeLedger, configureLedger, resetLedgerTestState } from "../../src/economy/admission.js"
import type { EconomyEnvelope } from "../../src/economy/admission.js"
import { EconomyDispatchRefused, authorizedForward } from "../../src/economy/executor.js"

const dirs: string[] = []
afterEach(() => {
  closeLedger()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  resetLedgerTestState()
  closeLedger()
})

const freshLedger = (): void => {
  const dir = mkdtempSync(join(tmpdir(), "economy-exec-"))
  dirs.push(dir)
  resetLedgerTestState()
  configureLedger(join(dir, "ledger.db"))
}

const envelope = (limits: EconomyEnvelope["limits"]): EconomyEnvelope => ({
  envelopeId: "env-1",
  authorityId: "auth-1",
  policyDigest: "policy-1",
  scope: "core",
  provider: "fixture",
  model: "responses",
  allowedRoutes: ["http"],
  stages: ["prod"],
  limits,
  retryPolicy: { maxRetries: 0, statuses: [] },
})

describe("G1 executor guard", () => {
  test("EA-05 final-native-bound-required", async () => {
    freshLedger()
    let forwarded = 0
    await expect(
      authorizedForward({ envelope: envelope({ attempts: 5, outputTokens: 100, inFlight: 5 }), logical: { logicalRequestId: "req-1", stage: "prod", snapshot: "sha-1" }, key: "k5bad", route: "http", forward: async () => { forwarded += 1 } }),
    ).rejects.toThrow()
    expect(forwarded).toBe(0)
    let ok = 0
    await authorizedForward({ envelope: envelope({ attempts: 5, outputTokens: 100, inFlight: 5 }), logical: { logicalRequestId: "req-1", stage: "prod", snapshot: "sha-1" }, key: "k5ok", route: "http", request: { bound: { outputTokens: 10 }, finalBytes: "{}", fingerprint: "fp-1", provider: "fixture", model: "responses" }, forward: async () => { ok += 1 } })
    expect(ok).toBe(1)
  })
  test("EA-06 sealed-request-identity-cannot-drift", async () => {
    freshLedger()
    let forwarded = 0
    await authorizedForward({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: { logicalRequestId: "req-1", stage: "prod", snapshot: "sha-1" }, key: "k6", route: "http", forward: async () => { forwarded += 1 } })
    await expect(
      authorizedForward({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: { logicalRequestId: "req-1", stage: "prod", snapshot: "sha-different" }, key: "k6", route: "http", forward: async () => { forwarded += 1 } }),
    ).rejects.toThrow(EconomyDispatchRefused)
    expect(forwarded).toBe(1)
  })
  test("EA-07 incapable-route-or-guarantee-refuses", async () => {
    freshLedger()
    let forwarded = 0
    await expect(
      authorizedForward({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: { logicalRequestId: "req-1", stage: "prod", snapshot: "sha-1" }, key: "k7", route: "websocket", forward: async () => { forwarded += 1 } }),
    ).rejects.toThrow(EconomyDispatchRefused)
    expect(forwarded).toBe(0)
  })
})
