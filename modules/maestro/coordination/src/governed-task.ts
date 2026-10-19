export type GovernedTaskRequest = {
  sessionID: string
  projectID: string
  memberID: string
  approvalMessageID: string
  planRevisionID: string
  revisionHash: string
  validationRecordID: string
  validationHash: string
  contextHash: string
  policyHash: string
  taskHash: string
}

export type ApprovalDecisionEvent = GovernedTaskRequest & {
  presentationMessageID: string
  presentationID: string
  validationRecordID: string
  validationHash: string
  contextHash: string
  policyHash: string
  outcome: "APPROVED" | "DECLINED"
}

export function verifyGovernedTask(input: {
  request: GovernedTaskRequest
  decisions: readonly ApprovalDecisionEvent[]
  newestPresentationID?: string
}): { status: "APPROVED" } | { status: "HOLD"; reason: "approval-missing" | "approval-ambiguous" | "approval-stale" } {
  const matches = input.decisions.filter(
    (decision) =>
      decision.sessionID === input.request.sessionID &&
      decision.projectID === input.request.projectID &&
      decision.memberID === input.request.memberID &&
      decision.approvalMessageID === input.request.approvalMessageID &&
      decision.planRevisionID === input.request.planRevisionID &&
      decision.revisionHash === input.request.revisionHash &&
      decision.validationRecordID === input.request.validationRecordID &&
      decision.validationHash === input.request.validationHash &&
      decision.contextHash === input.request.contextHash &&
      decision.policyHash === input.request.policyHash &&
      decision.taskHash === input.request.taskHash,
  )
  if (matches.length === 0) return { status: "HOLD", reason: "approval-missing" }
  if (matches.length !== 1 || matches[0]?.outcome !== "APPROVED") {
    return { status: "HOLD", reason: "approval-ambiguous" }
  }
  if (input.newestPresentationID !== undefined && matches[0].presentationID !== input.newestPresentationID) {
    return { status: "HOLD", reason: "approval-stale" }
  }
  return { status: "APPROVED" }
}
