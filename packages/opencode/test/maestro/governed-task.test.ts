import { describe, expect, test } from "bun:test"
import {
  verifyGovernedTask,
  type ApprovalDecisionEvent,
  type GovernedTaskRequest,
} from "../../src/maestro/governed-task"

const request: GovernedTaskRequest = {
  sessionID: "ses_01",
  projectID: "prj_01",
  memberID: "maestro",
  approvalMessageID: "msg_user_approve",
  planRevisionID: "plan_v3",
  revisionHash: "revision-v3-hash",
  validationRecordID: "val_v3",
  validationHash: "validation-v3-hash",
  contextHash: "context-v3-hash",
  policyHash: "policy-v3-hash",
  taskHash: "task-v3-hash",
}

const decision: ApprovalDecisionEvent = {
  ...request,
  presentationMessageID: "msg_presentation",
  presentationID: "apr_01",
  outcome: "APPROVED",
}

describe("Maestro governed Task guard", () => {
  test("permits exact approved decision", () => {
    expect(verifyGovernedTask({ request, decisions: [decision] })).toEqual({ status: "APPROVED" })
  })

  test("holds missing, declined, duplicate, and mismatched decisions", () => {
    expect(verifyGovernedTask({ request, decisions: [] })).toEqual({ status: "HOLD", reason: "approval-missing" })
    expect(verifyGovernedTask({ request, decisions: [{ ...decision, outcome: "DECLINED" }] })).toEqual({
      status: "HOLD",
      reason: "approval-ambiguous",
    })
    expect(verifyGovernedTask({ request, decisions: [decision, decision] })).toEqual({
      status: "HOLD",
      reason: "approval-ambiguous",
    })
    expect(verifyGovernedTask({ request: { ...request, revisionHash: "other" }, decisions: [decision] })).toEqual({
      status: "HOLD",
      reason: "approval-missing",
    })
    expect(verifyGovernedTask({ request: { ...request, contextHash: "other" }, decisions: [decision] })).toEqual({
      status: "HOLD",
      reason: "approval-missing",
    })
    expect(verifyGovernedTask({ request, decisions: [decision], newestPresentationID: "apr_newer" })).toEqual({
      status: "HOLD",
      reason: "approval-stale",
    })
    expect(verifyGovernedTask({ request: { ...request, taskHash: "other" }, decisions: [decision] })).toEqual({
      status: "HOLD",
      reason: "approval-missing",
    })
  })
})
