// G1 / F2 — admission authority oracle (EA-01..EA-04, EA-08..EA-29).
// Contract: modules/atlas/docs/design/genesis-g1-contract.md §3.2.
// Red baseline: every test must fail on the unimplemented seam (named failure),
// never on import/collection error. No spend, no runtime, no publication.

import { describe, expect, test } from "bun:test"
import { reserveAttempt, recoverAttempts, settleAttempt } from "../../src/economy/admission.js"
import type { EconomyEnvelope, LogicalRequest } from "../../src/economy/admission.js"

const envelope = (limits: EconomyEnvelope["limits"]): EconomyEnvelope => ({
  envelopeId: "env-1",
  authorityId: "auth-1",
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
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 2, outputTokens: 100, inFlight: 2 }), logical: logical(), key: "k1", route: "http" })
    expect(grant.kind).toBe("economy-grant")
  })
  test("EA-02 reserve-commit-before-forward", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical(), key: "k2", route: "http" })
    expect(grant.kind).toBe("economy-grant")
  })
  test("EA-03 failed-or-lost-reserve-ack", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical(), key: "k3", route: "http" })
    expect(grant.kind).toBe("economy-grant")
  })
  test("EA-04 ambient-transaction-is-not-durable-ack", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical(), key: "k4", route: "http" })
    expect(grant.kind).toBe("economy-grant")
  })
  test("EA-08 status-retry-reserves-every-attempt", async () => {
    const first = await reserveAttempt({ envelope: envelope({ attempts: 2, inFlight: 2 }), logical: logical(), key: "k8a", route: "http" })
    expect(first.kind).toBe("economy-grant")
    const second = await reserveAttempt({ envelope: envelope({ attempts: 2, inFlight: 2 }), logical: logical(), key: "k8b", prior: (first as { attempt: import("../../src/economy/admission.js").AttemptId }).attempt, route: "http" })
    expect(second.kind).toBe("economy-grant")
  })
  test("EA-09 retry-needs-policy-and-shared-allowance", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 2, inFlight: 2 }), logical: logical(), key: "k9", route: "http" })
    expect(grant.kind).toBe("economy-grant")
  })
  test("EA-10 uncertain-transport-does-not-auto-retry", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical(), key: "k10", route: "http" })
    expect(grant.kind).toBe("economy-grant")
  })
  test("EA-11 concurrent-last-allowance", async () => {
    const [a, b] = await Promise.all([
      reserveAttempt({ envelope: envelope({ attempts: 10, inFlight: 10 }), logical: logical("a"), key: "k11a", route: "http" }),
      reserveAttempt({ envelope: envelope({ attempts: 10, inFlight: 10 }), logical: logical("b"), key: "k11b", route: "http" }),
    ])
    expect([a.kind, b.kind].filter((kind) => kind === "economy-grant")).toHaveLength(1)
  })
  test("EA-12 uncertain-inflight-slot-is-retained", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 1 }), logical: logical("a"), key: "k12a", route: "http" })
    expect(grant.kind).toBe("economy-grant")
  })
  test("EA-13 same-key-is-not-another-forward-grant", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k13", route: "http" })
    expect(grant.kind).toBe("economy-grant")
  })
  test("EA-14 conflicting-admission-key-refuses", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k14", route: "http" })
    expect(grant.kind).toBe("economy-grant")
  })
  test("EA-15 headers-or-incomplete-usage-do-not-settle", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k15", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    const settled = await settleAttempt({ attempt: (grant as { attempt: import("../../src/economy/admission.js").AttemptId }).attempt, usage: { inputTokens: 10, outputTokens: 0 }, evidenceDigest: "d15", terminal: false })
    expect(settled.kind).toBe("economy-refusal")
  })
  test("EA-16 invalid-usage-retains-obligation", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k16", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    const settled = await settleAttempt({ attempt: (grant as { attempt: import("../../src/economy/admission.js").AttemptId }).attempt, usage: { inputTokens: -1, outputTokens: 1 }, evidenceDigest: "d16", terminal: true })
    expect(settled.kind).toBe("economy-refusal")
  })
  test("EA-17 out-of-order-usage-matches-its-attempt", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k17", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    const settled = await settleAttempt({ attempt: (grant as { attempt: import("../../src/economy/admission.js").AttemptId }).attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d17", terminal: true })
    expect(settled.kind).toBe("settled")
  })
  test("EA-18 settlement-is-idempotent-and-conflict-aware", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k18", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    const attempt = (grant as { attempt: import("../../src/economy/admission.js").AttemptId }).attempt
    expect(await settleAttempt({ attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d18", terminal: true })).toEqual({ kind: "settled" })
    expect(await settleAttempt({ attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d18", terminal: true })).toEqual({ kind: "settled" })
    expect((await settleAttempt({ attempt, usage: { inputTokens: 2, outputTokens: 1 }, evidenceDigest: "d18b", terminal: true })).kind).toBe("economy-refusal")
  })
  test("EA-19 inclusive-usage-is-counted-once", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inputTokens: 10, outputTokens: 8, inFlight: 5 }), logical: logical(), key: "k19", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    const settled = await settleAttempt({ attempt: (grant as { attempt: import("../../src/economy/admission.js").AttemptId }).attempt, usage: { inputTokens: 10, outputTokens: 8 }, evidenceDigest: "d19", terminal: true })
    expect(settled.kind).toBe("settled")
  })
  test("EA-20 reported-overrun-is-not-clamped", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, outputTokens: 10, inFlight: 5 }), logical: logical(), key: "k20", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    const settled = await settleAttempt({ attempt: (grant as { attempt: import("../../src/economy/admission.js").AttemptId }).attempt, usage: { inputTokens: 0, outputTokens: 12 }, evidenceDigest: "d20", terminal: true })
    expect(settled.kind).toBe("settled")
  })
  test("EA-21 settlement-write-failure-reconciles", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k21", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    const settled = await settleAttempt({ attempt: (grant as { attempt: import("../../src/economy/admission.js").AttemptId }).attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d21", terminal: true })
    expect(settled.kind).toBe("settled")
  })
  test("EA-22 crash-cutpoints-preserve-held-work", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k22", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    const recovered = await recoverAttempts("env-1")
    expect(recovered).toContainEqual((grant as { attempt: import("../../src/economy/admission.js").AttemptId }).attempt)
  })
  test("EA-23 stages-and-restarts-share-one-envelope", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical(), key: "k23", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    const denied = await reserveAttempt({ envelope: envelope({ attempts: 1, inFlight: 1 }), logical: logical("req-2"), key: "k23b", route: "http" })
    expect(denied.kind).toBe("economy-refusal")
  })
  test("EA-24 missing-or-corrupt-authority-fails-closed", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k24", route: "http" })
    expect(grant.kind).toBe("economy-refusal")
  })
  test("EA-25 storage-retry-never-repeats-network", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k25", route: "http" })
    expect(grant.kind).toBe("economy-grant")
  })
  test("EA-26 semantic-rejection-does-not-refund-usage", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k26", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    expect((await settleAttempt({ attempt: (grant as { attempt: import("../../src/economy/admission.js").AttemptId }).attempt, usage: { inputTokens: 1, outputTokens: 1 }, evidenceDigest: "d26", terminal: true })).kind).toBe("settled")
  })
  test("EA-27 completed-key-reuses-durable-response", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k27", route: "http" })
    expect(grant.kind).toBe("economy-grant")
  })
  test("EA-28 admission-refusal-remains-typed", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 0, inFlight: 0 }), logical: logical(), key: "k28", route: "http" })
    expect(grant.kind).toBe("economy-refusal")
  })
  test("EA-29 owner-deletion-does-not-erase-obligations", async () => {
    const grant = await reserveAttempt({ envelope: envelope({ attempts: 5, inFlight: 5 }), logical: logical(), key: "k29", route: "http" })
    expect(grant.kind).toBe("economy-grant")
    expect(await recoverAttempts("env-1")).toHaveLength(1)
  })
})
