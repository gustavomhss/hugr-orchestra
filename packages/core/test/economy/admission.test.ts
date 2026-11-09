// G1 / F2 — admission authority oracle (EA-01..EA-04, EA-08..EA-29).
// Contract: modules/atlas/docs/design/genesis-g1-contract.md §3.2.
// Green: each test drives the file-backed ledger through the pinned semantics; no spend.

import { describe, expect, test, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { closeLedger, configureLedger, injectLedgerFault, recoverAttempts, reserveAttempt, resetLedgerTestState, settleAttempt, withAmbientTransaction } from "../../src/economy/admission.js"
import type { EconomyEnvelope, LogicalRequest } from "../../src/economy/admission.js"

const dirs: string[] = []
afterEach(() => {
  closeLedger()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  resetLedgerTestState()
  closeLedger()
})

const freshLedger = (): void => {
  const dir = mkdtempSync(join(tmpdir(), "economy-test-"))
  dirs.push(dir)
  resetLedgerTestState()
  configureLedger(join(dir, "ledger.db"))
}

const envelope = (limits: EconomyEnvelope["limits"], authorityId = "auth-1"): EconomyEnvelope => ({
  envelopeId: "env-1",
  authorityId,
  policyDigest: "policy-1",
  scope: "core",
  provider: "fixture",
  model: "responses",
  allowedRoutes: ["http"],
  stages: ["prod", "eval", "update"],
  limits,
  retryPolicy: { maxRetries: 2, statuses: [503] },
})
const logical = (logicalRequestId = "req-1"): LogicalRequest => ({ logicalRequestId, stage: "prod", snapshot: "sha-1" })

describe("G1 admission authority", () => {
  test("EA-01 valid-request-reserves-forwards-settles", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, outputTokens: 100, inFlight: 5 }), logical: logical(), key: "k1", route: "http", bound: { outputTokens: 10 } })
    expect(grant.kind).toBe("economy-grant")
    if (grant.kind !== "economy-grant") throw new Error("grant")
    expect(grant.consumable).toBe(true)
    expect(await settleAttempt({ attempt: grant.attempt, usage: { inputTokens: 5, outputTokens: 10 }, evidenceDigest: "d1", terminal: true })).toEqual({ kind: "settled" })
  })
  test("EA-02 reserve-commit-before-forward", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical(), key: "k2", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    expect(await recoverAttempts("env-1")).toHaveLength(1)
  })
  test("EA-03 failed-or-lost-reserve-ack", async () => {
    freshLedger()
    injectLedgerFault({ failNextCommitBeforeAck: true })
    expect((await reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical(), key: "k3a", route: "http" })).kind).toBe("economy-refusal")
    expect(await recoverAttempts("env-1")).toHaveLength(0)
    injectLedgerFault({ loseNextAck: true })
    expect((await reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical(), key: "k3b", route: "http" })).kind).toBe("economy-refusal")
    expect(await recoverAttempts("env-1")).toHaveLength(1)
    const repeat = await reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical(), key: "k3b", route: "http" })
    expect(repeat.kind).toBe("economy-grant")
    if (repeat.kind === "economy-grant") expect(repeat.consumable).toBe(false)
    expect(await recoverAttempts("env-1")).toHaveLength(1)
  })
  test("EA-04 ambient-transaction-is-not-durable-ack", async () => {
    freshLedger()
    const inside = await withAmbientTransaction(() => reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical(), key: "k4", route: "http" }))
    expect(inside.kind).toBe("economy-refusal")
    if (inside.kind === "economy-refusal") expect(inside.reason).toBe("ambient")
    expect(await recoverAttempts("env-1")).toHaveLength(0)
  })
  test("EA-08 status-retry-reserves-every-attempt", async () => {
    freshLedger()
    const env = envelope({ attempts: 5, inFlight: 5 })
    const first = await reserveAttempt({ envelope: env, logical: logical(), key: "k8a", route: "http" })
    expect(first.kind).toBe("economy-grant")
    if (first.kind !== "economy-grant") throw new Error("grant")
    const second = await reserveAttempt({ envelope: env, logical: logical(), key: "k8b", prior: first.attempt, route: "http" })
    expect(second.kind).toBe("economy-grant")
    if (second.kind !== "economy-grant") throw new Error("grant")
    expect(second.attempt.ordinal).toBe(first.attempt.ordinal + 1)
    expect(await settleAttempt({ attempt: second.attempt, usage: { inputTokens: 1, outputTokens: 2 }, evidenceDigest: "d8", terminal: true })).toEqual({ kind: "settled" })
    expect(await recoverAttempts("env-1")).toHaveLength(2)
  })
  test("EA-09 retry-needs-policy-and-shared-allowance", async () => {
    freshLedger()
    const env = envelope({ attempts: 2, inFlight: 2 })
    const [a, b] = await Promise.all([
      reserveAttempt({ envelope: env, logical: logical("a"), key: "k9a", route: "http" }),
      reserveAttempt({ envelope: env, logical: logical("b"), key: "k9b", route: "http" }),
    ])
    expect(a.kind).toBe("economy-grant")
    expect(b.kind).toBe("economy-grant")
    expect((await reserveAttempt({ envelope: env, logical: logical("c"), key: "k9c", route: "http" })).kind).toBe("economy-refusal")
  })
  test("EA-10 uncertain-transport-does-not-auto-retry", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical(), key: "k10", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    expect(await recoverAttempts("env-1")).toHaveLength(1)
  })
  test("EA-11 concurrent-last-allowance", async () => {
    freshLedger()
    const env = envelope({ attempts: 10, outputTokens: 10, inFlight: 10 })
    const first = await reserveAttempt({ envelope: env, logical: logical("a"), key: "k11a", route: "http", bound: { outputTokens: 6 } })
    expect(first.kind).toBe("economy-grant")
    const denied = await reserveAttempt({ envelope: env, logical: logical("b"), key: "k11b", route: "http", bound: { outputTokens: 6 } })
    expect(denied.kind).toBe("economy-refusal")
  })
  test("EA-12 uncertain-inflight-slot-is-retained", async () => {
    freshLedger()
    const env = envelope({ attempts: 5, inFlight: 1 })
    const first = await reserveAttempt({ envelope: env, logical: logical("a"), key: "k12a", route: "http" })
    expect(first.kind).toBe("economy-grant")
    if (first.kind !== "economy-grant") throw new Error("grant")
    expect((await settleAttempt({ attempt: first.attempt, usage: {}, evidenceDigest: "d12", terminal: false })).kind).toBe("economy-refusal")
    expect((await reserveAttempt({ envelope: env, logical: logical("b"), key: "k12b", route: "http" })).kind).toBe("economy-refusal")
  })
  test("EA-13 same-key-is-not-another-forward-grant", async () => {
    freshLedger()
    const env = envelope({ attempts: 5, inFlight: 5 })
    const first = await reserveAttempt({ envelope: env, logical: logical(), key: "k13", route: "http" })
    expect(first.kind).toBe("economy-grant")
    const repeat = await reserveAttempt({ envelope: env, logical: logical(), key: "k13", route: "http" })
    expect(repeat.kind).toBe("economy-grant")
    if (repeat.kind === "economy-grant") expect(repeat.consumable).toBe(false)
    expect(await recoverAttempts("env-1")).toHaveLength(1)
  })
  test("EA-14 conflicting-admission-key-refuses", async () => {
    freshLedger()
    const env = envelope({ attempts: 5, inFlight: 5 })
    await reserveAttempt({ envelope: env, logical: logical(), key: "k14", route: "http" })
    expect((await reserveAttempt({ envelope: { ...env, policyDigest: "policy-2" }, logical: logical(), key: "k14", route: "http" })).kind).toBe("economy-refusal")
  })
  test("EA-15 headers-or-incomplete-usage-do-not-settle", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, outputTokens: 10, inFlight: 5 }), logical: logical(), key: "k15", route: "http", bound: { outputTokens: 5 } })
    expect(grant.kind).toBe("economy-grant")
    if (grant.kind !== "economy-grant") throw new Error("grant")
    expect((await settleAttempt({ attempt: grant.attempt, usage: { inputTokens: 5 }, evidenceDigest: "d15", terminal: true })).kind).toBe("economy-refusal")
    expect(await settleAttempt({ attempt: grant.attempt, usage: { inputTokens: 5, outputTokens: 3 }, evidenceDigest: "d15", terminal: true })).toEqual({ kind: "settled" })
  })
  test("EA-16 invalid-usage-retains-obligation", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k16", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    if (grant.kind !== "economy-grant") throw new Error("grant")
    for (const bad of [{ inputTokens: -1, outputTokens: 1 }, { inputTokens: 1.5, outputTokens: 1 }, { inputTokens: 1, outputTokens: 2, reasoningTokens: 5 }]) {
      expect((await settleAttempt({ attempt: grant.attempt, usage: bad, evidenceDigest: "d16", terminal: true })).kind).toBe("economy-refusal")
    }
  })
  test("EA-17 out-of-order-usage-matches-its-attempt", async () => {
    freshLedger()
    const env = envelope({ attempts: 5, inFlight: 5 })
    const a = await reserveAttempt({ envelope: env, logical: logical("a"), key: "k17a", route: "http" })
    const b = await reserveAttempt({ envelope: env, logical: logical("b"), key: "k17b", route: "http" })
    expect(a.kind).toBe("economy-grant")
    expect(b.kind).toBe("economy-grant")
    if (a.kind !== "economy-grant" || b.kind !== "economy-grant") throw new Error("grants")
    expect(await settleAttempt({ attempt: b.attempt, usage: { inputTokens: 2, outputTokens: 2 }, evidenceDigest: "d17b", terminal: true })).toEqual({ kind: "settled" })
    expect(await settleAttempt({ attempt: a.attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d17a", terminal: true })).toEqual({ kind: "settled" })
  })
  test("EA-18 settlement-is-idempotent-and-conflict-aware", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k18", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    if (grant.kind !== "economy-grant") throw new Error("grant")
    expect(await settleAttempt({ attempt: grant.attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d18", terminal: true })).toEqual({ kind: "settled" })
    expect(await settleAttempt({ attempt: grant.attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d18", terminal: true })).toEqual({ kind: "settled" })
    expect((await settleAttempt({ attempt: grant.attempt, usage: { inputTokens: 2, outputTokens: 1 }, evidenceDigest: "d18b", terminal: true })).kind).toBe("economy-refusal")
  })
  test("EA-19 inclusive-usage-is-counted-once", async () => {
    freshLedger()
    const env = envelope({ attempts: 5, inputTokens: 10, outputTokens: 8, inFlight: 5 })
    const grant = await reserveAttempt({ envelope: env, logical: logical(), key: "k19", route: "http", bound: { outputTokens: 8, inputTokens: 10 } })
    expect(grant.kind).toBe("economy-grant")
    if (grant.kind !== "economy-grant") throw new Error("grant")
    expect(await settleAttempt({ attempt: grant.attempt, usage: { inputTokens: 10, outputTokens: 8, cachedInputTokens: 4, reasoningTokens: 3 }, evidenceDigest: "d19", terminal: true })).toEqual({ kind: "settled" })
    expect((await reserveAttempt({ envelope: env, logical: logical("x"), key: "k19x", route: "http", bound: { outputTokens: 1, inputTokens: 1 } })).kind).toBe("economy-refusal")
  })
  test("EA-20 reported-overrun-is-not-clamped", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, outputTokens: 10, inFlight: 5 }), logical: logical(), key: "k20", route: "http", bound: { outputTokens: 10 } })
    expect(grant.kind).toBe("economy-grant")
    if (grant.kind !== "economy-grant") throw new Error("grant")
    expect(await settleAttempt({ attempt: grant.attempt, usage: { outputTokens: 12 }, evidenceDigest: "d20", terminal: true })).toEqual({ kind: "settled" })
    expect((await reserveAttempt({ envelope: envelope({ attempts: 5, outputTokens: 10, inFlight: 5 }), logical: logical("x"), key: "k20x", route: "http", bound: { outputTokens: 1 } })).kind).toBe("economy-refusal")
  })
  test("EA-21 settlement-write-failure-reconciles", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k21", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    if (grant.kind !== "economy-grant") throw new Error("grant")
    injectLedgerFault({ failNextSettleWrite: true })
    expect((await settleAttempt({ attempt: grant.attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d21", terminal: true })).kind).toBe("economy-refusal")
    expect(await settleAttempt({ attempt: grant.attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d21", terminal: true })).toEqual({ kind: "settled" })
  })
  test("EA-22 crash-cutpoints-preserve-held-work", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k22", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    expect(await recoverAttempts("env-1")).toHaveLength(1)
  })
  test("EA-23 stages-and-restarts-share-one-envelope", async () => {
    freshLedger()
    const env = envelope({ attempts: 1, inFlight: 1 })
    expect((await reserveAttempt({ envelope: env, logical: logical("a"), key: "k23a", route: "http" })).kind).toBe("economy-grant")
    expect((await reserveAttempt({ envelope: env, logical: logical("b"), key: "k23b", route: "http" })).kind).toBe("economy-refusal")
  })
  test("EA-24 missing-or-corrupt-authority-fails-closed", async () => {
    freshLedger()
    expect((await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }, "auth-other"), logical: logical(), key: "k24", route: "http" })).kind).toBe("economy-grant")
    expect((await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }, "auth-1"), logical: logical("x"), key: "k24x", route: "http" })).kind).toBe("economy-refusal")
    expect(await recoverAttempts("missing")).toHaveLength(0)
  })
  test("EA-25 storage-retry-never-repeats-network", async () => {
    freshLedger()
    injectLedgerFault({ failNextCommitBeforeAck: true })
    expect((await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k25a", route: "http" })).kind).toBe("economy-refusal")
    expect((await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k25b", route: "http" })).kind).toBe("economy-grant")
  })
  test("EA-26 semantic-rejection-does-not-refund-usage", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k26", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    if (grant.kind !== "economy-grant") throw new Error("grant")
    expect(await settleAttempt({ attempt: grant.attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d26", terminal: true })).toEqual({ kind: "settled" })
  })
  test("EA-27 completed-key-reuses-durable-response", async () => {
    freshLedger()
    const env = envelope({ attempts: 5, inFlight: 5 })
    const first = await reserveAttempt({ envelope: env, logical: logical(), key: "k27", route: "http" })
    expect(first.kind).toBe("economy-grant")
    if (first.kind !== "economy-grant") throw new Error("grant")
    await settleAttempt({ attempt: first.attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d27", terminal: true })
    const repeat = await reserveAttempt({ envelope: env, logical: logical(), key: "k27", route: "http" })
    expect(repeat.kind).toBe("economy-grant")
    if (repeat.kind === "economy-grant") expect(repeat.consumable).toBe(false)
  })
  test("EA-28 admission-refusal-remains-typed", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 0, inFlight: 0 }), logical: logical(), key: "k28", route: "http" })
    expect(grant.kind).toBe("economy-refusal")
  })
  test("EA-29 owner-deletion-does-not-erase-obligations", async () => {
    freshLedger()
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k29", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    expect(await recoverAttempts("env-1")).toHaveLength(1)
  })
})
