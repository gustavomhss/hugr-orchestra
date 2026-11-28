import { describe, expect, test } from "bun:test"
import { ActivityObjectProof } from "../src/activity-object-proof"

const objectID = "object-a"
const checks = ActivityObjectProof.methods.map((method) => ({ objectID, method, outcome: "clear" as const }))
const receipt = { objectID, matched: true, claimant: "absent" as const, checks }

describe("per-object use proof", () => {
  test("accepts only all four clear methods for the matched object", () => {
    const result = ActivityObjectProof.evaluate(receipt)
    expect(result.state).toBe("idle")
    expect(result.checks).toHaveLength(4)
    checks.forEach(({ method, outcome }) => expect(result.checks).toContainEqual({ method, outcome }))
    expect(Object.keys(result).sort()).toEqual(["checks", "state"])
    result.checks.forEach((check) => expect(Object.keys(check).sort()).toEqual(["method", "outcome"]))
  })

  test("holds every missing, unavailable, failed, partial or occupied method", () => {
    ActivityObjectProof.methods.forEach((method) => {
      expect(ActivityObjectProof.evaluate({ ...receipt, checks: checks.filter((check) => check.method !== method) }).state).toBe("held")
      ;(["unavailable", "failed", "partial", "holder"] as const).forEach((outcome) => {
        const result = ActivityObjectProof.evaluate({ ...receipt, checks: checks.map((check) => check.method === method ? { ...check, outcome } : check) })
        expect(result.state).toBe("held")
        if (outcome === "unavailable") expect(result.checks).not.toContainEqual({ method, outcome })
        if (outcome !== "unavailable") expect(result.checks).toContainEqual({ method, outcome })
      })
    })
  })

  test("holds duplicate and foreign evidence without transferring it between objects", () => {
    expect(ActivityObjectProof.evaluate({ ...receipt, checks: [...checks, checks[0]!] }).state).toBe("held")
    expect(ActivityObjectProof.evaluate({ ...receipt, checks: [...checks, { ...checks[0]!, outcome: "holder" }] }).state).toBe("held")
    const foreign = { ...checks[0]!, objectID: "object-b" }
    expect(ActivityObjectProof.evaluate({ ...receipt, checks: [...checks, foreign] }).state).toBe("held")
    const result = ActivityObjectProof.evaluate({ ...receipt, checks: [foreign, ...checks.slice(1)] })
    expect(result.state).toBe("held")
    expect(result.checks).not.toContainEqual({ method: foreign.method, outcome: foreign.outcome })
    expect(ActivityObjectProof.evaluate({ ...receipt, objectID: "object-b" }).state).toBe("held")
  })

  test("holds unmatched or unidentified objects and present or unknown claimants", () => {
    expect(ActivityObjectProof.evaluate({ ...receipt, objectID: "" }).state).toBe("held")
    expect(ActivityObjectProof.evaluate({ ...receipt, matched: false }).state).toBe("held")
    expect(ActivityObjectProof.evaluate({ ...receipt, claimant: "present" }).state).toBe("held")
    expect(ActivityObjectProof.evaluate({ ...receipt, claimant: "unknown" }).state).toBe("held")
  })
})
