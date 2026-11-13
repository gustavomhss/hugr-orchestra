import type {
  MaestroContextToolPlan,
  MaestroGrounding,
  MaestroLoadedOwnSkill,
  MaestroUpstreamAttributionV1,
  MaestroUpstreamAttributionV2,
} from "./maestro"

import type {
  RelayArmWorkflowBinding,
  RelayArmWorkflowDefinition,
} from "./relay"

export type EventMaestroAdmissionDecided = {
  id: string
  type: "maestro.admission.decided"
  properties: {
    sessionID: string
    messageID: string
    methodVersion: string
    outcome: "ORIENT" | "CLARIFY" | "READY_TO_DRAFT"
    reason?: "invalid-assessment" | "missing-usable-goal" | "material-blocker" | "active-work-conflict"
    assessment?: {
      kind: "orient" | "work"
      goal?: string
      known: Array<{
        text: string
        source: "stakeholder" | "orientation"
      }>
      proposals: Array<{
        text: string
        source: "maestro"
      }>
      unknowns: Array<string>
      uncertainty: string
      activeWorkEffect: "none" | "new-scope-or-revision"
      reason: string
    }
  }
}
export type EventMaestroApprovalConsumed = {
  id: string
  type: "maestro.approval.consumed"
  properties: {
    sessionID: string
    presentationID: string
    approvalMessageID: string
    taskHash: string
    callID: string
    childSessionID: string
  }
}
export type EventMaestroApprovalDecided = {
  id: string
  type: "maestro.approval.decided"
  properties: {
    sessionID: string
    projectID: string
    memberID: string
    presentationID: string
    presentationMessageID: string
    approvalMessageID: string
    planRevisionID: string
    validationRecordID: string
    revisionHash: string
    validationHash: string
    contextHash: string
    policyHash: string
    taskHash: string
    methodVersion: string
    outcome: "APPROVED" | "DECLINED"
    decisionTime: number
  }
}
export type EventMaestroApprovalPresented = {
  id: string
  type: "maestro.approval.presented"
  properties: {
    id: string
    sessionID: string
    assistantMessageID: string
    callID: string
    planRevisionID: string
    validationRecordID: string
    projectID: string
    memberID: string
    revisionHash: string
    validationHash: string
    contextHash: string
    policyHash: string
    taskHash: string
    intent: {
      subagentType: string
      prompt: string
      model?: string
      taskID?: string
    }
    methodVersion: string
    plan: string
    provenance: string
    assumptions: Array<string>
    validationLedger: string
    contextState: "CURRENT"
  }
}
export type EventMaestroApprovalReserved = {
  id: string
  type: "maestro.approval.reserved"
  properties: {
    sessionID: string
    presentationID: string
    approvalMessageID: string
    projectID: string
    memberID: string
    planRevisionID: string
    validationRecordID: string
    revisionHash: string
    validationHash: string
    contextHash: string
    policyHash: string
    taskHash: string
    callID: string
    childSessionID: string
    parentSessionID: string
    agent: string
    permission: Array<{
      permission: string
      pattern: string
      action: "allow" | "deny" | "ask"
    }>
  }
}
export type EventMaestroAuthorizationGranted = {
  id: string
  type: "maestro.authorization.granted"
  properties: {
    sessionID: string
    projectID: string
    approvalMessageID: string
    validationRecordID: string
    workCardHash: string
    routedMemberID: string
    rosterHash: string
    grantHash: string
    reviewPolicyHash: string
    actor: {
      version: "rfc8785-v1"
      bytes: string
      sha256: string
    }
    reviewerID: "lucy"
    taskIntentHash: string
    methodVersion: string
  }
}
export type EventMaestroClarificationDecided = {
  id: string
  type: "maestro.clarification.decided"
  properties: {
    sessionID: string
    projectID: string
    mode: "maestro"
    predecessorID: string
    methodVersion: string
    decision: string
    question: string
  }
}
export type EventMaestroContextRecorded = {
  id: string
  type: "maestro.context.recorded"
  properties: {
    id: string
    sessionID: string
    planRevisionID: string
    projectID: string
    directory: string
    mode: "GROUNDED"
    branch: string
    headSHA: string
    changedPaths: Array<string>
    currentEvidenceIdentityHash: string
    contextHash: string
    status: "CURRENT"
    createdAt: number
    planRevisionHash: string
    sourceIdentityHash: string
    toolPlan: MaestroContextToolPlan
    skills: Array<MaestroLoadedOwnSkill>
  }
}
export type EventMaestroDispatchReserved = {
  id: string
  type: "maestro.dispatch.reserved"
  properties: {
    sessionID: string
    authorizationID: string
    childSessionID: string
    projectID: string
    routedMemberID: string
    taskIntentHash: string
    permission: Array<{
      permission: string
      pattern: string
      action: "allow" | "deny" | "ask"
    }>
  }
}
export type EventMaestroHeldEntered = {
  id: string
  type: "maestro.held.entered"
  properties: {
    sessionID: string
    projectID: string
    mode: "maestro"
    predecessorID: string
    reason: string
  }
}
export type EventMaestroPlanRevisionRecorded = {
  id: string
  type: "maestro.plan_revision.recorded"
  properties: {
    id: string
    sessionID: string
    admissionMessageID: string
    methodVersion: string
    revision: "v3"
    goal: {
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }
    acceptance: Array<{
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }>
    scope: Array<{
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }>
    constraints: Array<{
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }>
    reviewRequirement: {
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }
    contextRequirement: "PENDING"
    assumptions: Array<{
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }>
    risks: Array<{
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }>
    status: "PROPOSED"
    revisionHash: string
    createdAt: number
    workflowBinding?: RelayArmWorkflowDefinition
    upstreamAttribution?: MaestroUpstreamAttributionV1 | MaestroUpstreamAttributionV2
    grounding?: MaestroGrounding
  }
}
export type EventMaestroScopeDecided = {
  id: string
  type: "maestro.scope.decided"
  properties: {
    sessionID: string
    projectID: string
    mode: "maestro"
    predecessorID: string
    methodVersion: string
    scopeID: string
  }
}
export type EventMaestroTaskBound = {
  id: string
  type: "maestro.task.bound"
  properties: {
    taskId: string
    projectID: string
    memberID: string
    executionSessionID: string
    authoritySessionID: string
    source: "host" | "user" | "dispatch" | "governed"
  }
}
export type EventMaestroTaskWorkflowBound = {
  id: string
  type: "maestro.task.workflow_bound"
  properties: {
    executionSessionID: string
    authorityMessageID: string
    authorityCallID: string
    token: string
    binding: RelayArmWorkflowBinding
  }
}
export type EventMaestroValidationRecorded = {
  id: string
  type: "maestro.validation.recorded"
  properties: {
    sessionID: string
    planRevisionID: string
    contextRecordID: string
    contextHash: string
    reviewBaseSHA: string
    projectID: string
    workCardID: string
    workCard: string
    workCardHash: string
    routedMemberID: string
    rosterHash: string
    grantHash: string
    reviewPolicyHash: string
    actor: {
      version: "rfc8785-v1"
      bytes: string
      sha256: string
    }
    validatorID: "maestro"
    validatorVersion: string
    checks: Array<{
      id: string
      status: "PASS" | "FAIL" | "HOLD"
      detail: string
    }>
    outcome: "VALID" | "INVALID" | "HOLD"
  }
}
export type EventMaestroWorkResultDecided = {
  id: string
  type: "maestro.work_result.decided"
  properties: {
    projectID: string
    memberID: "backend"
    taskId: string
    authoritySessionID: string
    executionSessionID: string
    resultRef: {
      parentSessionID: string
      messageID: string
      partID: string
      callID: string
    }
    workResultHash: string
    decision: "accepted" | "rejected"
    verificationState: "not-host-verified" | "host-verified" | "host-failed" | "host-incomplete"
    terminalReason: "ended" | "blocked" | "failed" | "interrupted"
    reason?: string
  }
}
