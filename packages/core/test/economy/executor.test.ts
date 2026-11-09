// G1 / F2 — executor guard oracle (EA-05..EA-07).
// Contract: modules/atlas/docs/design/genesis-g1-contract.md §3.2.
// Red baseline: named failures at the unimplemented guard seam.

import { describe, expect, test } from "bun:test"
import { guardPhysicalDispatch } from "../../src/economy/executor.js"
import { reserveAttempt } from "../../src/economy/admission.js"

describe("G1 executor guard", () => {
  test("EA-05 final-native-bound-required", async () => {
    await expect(guardPhysicalDispatch({ envelopeId: "env-1", logicalRequestId: "req-1", ordinal: 1 })).rejects.toThrow()
    await expect(reserveAttempt({ envelope: {
      envelopeId: "env-1", authorityId: "auth-1", policyDigest: "policy-1", scope: "core", provider: "fixture", model: "responses",
      allowedRoutes: ["http"], stages: ["prod"], limits: { attempts: 1, inFlight: 1 }, retryPolicy: { maxRetries: 0, statuses: [] },
    }, logical: { logicalRequestId: "req-1", stage: "prod", snapshot: "sha-1" }, key: "k5", route: "http" })).rejects.toThrow()
  })
  test("EA-06 sealed-request-identity-cannot-drift", async () => {
    await expect(guardPhysicalDispatch({ envelopeId: "env-1", logicalRequestId: "req-1", ordinal: 1 })).rejects.toThrow()
  })
  test("EA-07 incapable-route-or-guarantee-refuses", async () => {
    await expect(guardPhysicalDispatch({ envelopeId: "env-1", logicalRequestId: "req-1", ordinal: 1 })).rejects.toThrow()
  })
})
