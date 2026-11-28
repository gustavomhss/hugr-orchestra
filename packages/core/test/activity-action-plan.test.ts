import { describe, expect, test } from "bun:test"
import { ActivityActionPlan } from "../src/activity-action-plan"

const row: ActivityActionPlan.Input = {
  id: "one",
  owner: "owner",
  label: "object",
  request: "quarantine",
  agentRequested: false,
  claimant: "absent",
  proof: "proved",
}

describe("activity action plan", () => {
  test("summarizes durable receipts before current proof or agent request", () => {
    const result = ActivityActionPlan.summarize([
      { ...row, id: "armed", receipt: "armed", agentRequested: true, claimant: "present", proof: "held" },
      { ...row, id: "refused", receipt: "refused" },
      { ...row, id: "out", receipt: "verified-out" },
      { ...row, id: "unknown", receipt: "unknown" },
    ])
    expect(result.steps.map((step) => step.state)).toEqual(["Armed", "Refused", "Out", "Unknown"])
    expect(result.agentRequests).toEqual([])
    expect(result.counts).toEqual({ Ready: 0, Armed: 1, Held: 0, Refused: 1, Out: 1, Unknown: 1 })
  })

  test("keeps unarmed agent requests outside steps and counts, including duplicate ids", () => {
    const request = { ...row, agentRequested: true }
    const result = ActivityActionPlan.summarize([row, request])
    expect(result.steps).toEqual([{ ...row, state: "Ready" }])
    expect(result.agentRequests).toEqual([request])
    expect(result.counts).toEqual({ Ready: 1, Armed: 0, Held: 0, Refused: 0, Out: 0, Unknown: 0 })
  })

  test("holds a claimant or incomplete proof and never fabricates Out", () => {
    const result = ActivityActionPlan.summarize([
      { ...row, claimant: "present" },
      { ...row, claimant: "unknown" },
      { ...row, proof: "held" },
      { ...row, request: "move" },
      { ...row, request: "keep" },
    ])
    expect(result.steps.map((step) => step.state)).toEqual(["Held", "Held", "Held", "Ready", "Ready"])
    expect(result.counts).toEqual({ Ready: 2, Armed: 0, Held: 3, Refused: 0, Out: 0, Unknown: 0 })
  })
})
