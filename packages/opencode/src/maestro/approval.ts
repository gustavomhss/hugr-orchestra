export type ApprovalMessage = {
  id: string
  sessionID: string
  seq: number
  role: "user" | "assistant" | "tool"
  text: string
  synthetic: boolean
}

export type ComposedActor = {
  projectId: string
  sessionId: string
  memberId: string
}

export type ApprovalPresentation = {
  id: string
  sessionID: string
  assistantMessageID: string
  planRevisionID: string
  validationRecordID: string
  actor: ComposedActor
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
  assumptions: readonly string[]
  validationLedger: string
  contextState: "CURRENT"
}

export type ApprovalDecision = {
  presentationID: string
  approvalMessageID: string
  sessionID: string
  planRevisionID: string
  validationRecordID: string
  actor: ComposedActor
  revisionHash: string
  validationHash: string
  contextHash: string
  policyHash: string
  taskHash: string
  methodVersion: string
  outcome: "APPROVED" | "DECLINED"
  time: { created: number }
}

export type ApprovalResult =
  | { status: "APPROVED" | "DECLINED"; decision: ApprovalDecision }
  | { status: "PENDING"; kind: "question" | "ambiguous" }
  | { status: "HOLD"; reason: HoldReason }

type HoldReason =
  | "presentation-message-mismatch"
  | "presentation-not-current"
  | "reply-not-found"
  | "reply-session-mismatch"
  | "reply-not-direct-user"
  | "reply-synthetic"
  | "reply-not-after-presentation"
  | "reply-not-immediate"
  | "reply-already-bound"
  | "presentation-identity-invalid"

export type EvaluateReplyInput = {
  presentation: ApprovalPresentation
  presentations: readonly ApprovalPresentation[]
  messages: readonly ApprovalMessage[]
  replyMessageID: string
  decisions: readonly ApprovalDecision[]
  presentationCurrent: boolean
  decisionTime: number
}

export function renderPresentation(input: ApprovalPresentation) {
  return [
    "Maestro plan approval",
    `Plan revision: ${input.planRevisionID}`,
    `Validation record: ${input.validationRecordID}`,
    `Project ID: ${input.actor.projectId}`,
    `Stakeholder session: ${input.actor.sessionId}`,
    `Executor: ${input.actor.memberId}`,
    "Plan:",
    input.plan,
    "Provenance:",
    input.provenance,
    "Assumptions:",
    ...input.assumptions.map((assumption) => `- ${assumption}`),
    "Validation ledger:",
    input.validationLedger,
    `Context state: ${input.contextState}`,
    `Revision hash: ${input.revisionHash}`,
    `Validation hash: ${input.validationHash}`,
    `Context hash: ${input.contextHash}`,
    `Policy hash: ${input.policyHash}`,
    `Task hash: ${input.taskHash}`,
    `Task intent: ${JSON.stringify(input.intent)}`,
    `Method version: ${input.methodVersion}`,
    "Reply approve or aprovo to approve this exact plan. Reply decline, declino, cancel, or cancelar to decline.",
  ].join("\n")
}

export function evaluateReply(input: EvaluateReplyInput): ApprovalResult {
  const ordered = [...input.messages].sort((left, right) => left.seq - right.seq || left.id.localeCompare(right.id))
  if (!validPresentation(input.presentation) || !validDecisionTime(input.decisionTime)) {
    return { status: "HOLD", reason: "presentation-identity-invalid" }
  }
  const presentationMessages = ordered.filter((message) => message.id === input.presentation.assistantMessageID)
  const presentationMessage = presentationMessages[0]
  if (
    presentationMessages.length !== 1 ||
    !presentationMessage ||
    presentationMessage.sessionID !== input.presentation.sessionID ||
    presentationMessage.role !== "assistant" ||
    presentationMessage.text !== renderPresentation(input.presentation)
  ) {
    return { status: "HOLD", reason: "presentation-message-mismatch" }
  }

  if (!input.presentationCurrent || !isNewestPresentation(input.presentation, input.presentations, ordered)) {
    return { status: "HOLD", reason: "presentation-not-current" }
  }

  const reply = ordered.find((message) => message.id === input.replyMessageID)
  if (!reply) return { status: "HOLD", reason: "reply-not-found" }
  if (reply.sessionID !== input.presentation.sessionID) return { status: "HOLD", reason: "reply-session-mismatch" }
  if (reply.role !== "user") return { status: "HOLD", reason: "reply-not-direct-user" }
  if (reply.synthetic) return { status: "HOLD", reason: "reply-synthetic" }
  if (reply.seq <= presentationMessage.seq) return { status: "HOLD", reason: "reply-not-after-presentation" }
  if (ordered.some((message) => message.role === "user" && message.seq > presentationMessage.seq && message.seq < reply.seq)) {
    return { status: "HOLD", reason: "reply-not-immediate" }
  }

  const existing = input.decisions.find(
    (decision) =>
      decision.approvalMessageID === reply.id && decision.methodVersion === input.presentation.methodVersion,
  )
  if (existing) {
    if (sameBinding(existing, input.presentation)) return { status: existing.outcome, decision: existing }
    return { status: "HOLD", reason: "reply-already-bound" }
  }

  const outcome = classifyReply(reply.text)
  if (!outcome) return { status: "PENDING", kind: reply.text.includes("?") ? "question" : "ambiguous" }

  return {
    status: outcome,
    decision: {
      presentationID: input.presentation.id,
      approvalMessageID: reply.id,
      sessionID: input.presentation.sessionID,
      planRevisionID: input.presentation.planRevisionID,
      validationRecordID: input.presentation.validationRecordID,
      actor: input.presentation.actor,
      revisionHash: input.presentation.revisionHash,
      validationHash: input.presentation.validationHash,
      contextHash: input.presentation.contextHash,
      policyHash: input.presentation.policyHash,
      taskHash: input.presentation.taskHash,
      methodVersion: input.presentation.methodVersion,
      outcome,
      time: { created: input.decisionTime },
    },
  }
}

function isNewestPresentation(
  presentation: ApprovalPresentation,
  presentations: readonly ApprovalPresentation[],
  messages: readonly ApprovalMessage[],
) {
  if (
    new Set(presentations.map((candidate) => candidate.id)).size !== presentations.length ||
    new Set(presentations.map((candidate) => candidate.assistantMessageID)).size !== presentations.length
  ) {
    return false
  }
  const candidates = presentations.map((candidate) => ({
    candidate,
    messages: messages.filter((message) => message.id === candidate.assistantMessageID),
  }))
  if (
    !candidates.some((entry) => entry.candidate.id === presentation.id) ||
    candidates.some(
      (entry) =>
        !validPresentation(entry.candidate) ||
        entry.messages.length !== 1 ||
        entry.messages[0]?.sessionID !== presentation.sessionID ||
        entry.messages[0]?.role !== "assistant" ||
        entry.messages[0]?.text !== renderPresentation(entry.candidate),
    )
  ) {
    return false
  }
  const newest = candidates
    .map((entry) => ({ candidate: entry.candidate, message: entry.messages[0]! }))
    .sort((left, right) => right.message.seq - left.message.seq || right.message.id.localeCompare(left.message.id))[0]
  return newest?.candidate.id === presentation.id
}

function sameBinding(decision: ApprovalDecision, presentation: ApprovalPresentation) {
  return (
    decision.presentationID === presentation.id &&
    decision.sessionID === presentation.sessionID &&
    decision.planRevisionID === presentation.planRevisionID &&
    decision.validationRecordID === presentation.validationRecordID &&
    decision.actor.projectId === presentation.actor.projectId &&
    decision.actor.sessionId === presentation.actor.sessionId &&
    decision.actor.memberId === presentation.actor.memberId &&
    decision.revisionHash === presentation.revisionHash &&
    decision.validationHash === presentation.validationHash &&
    decision.contextHash === presentation.contextHash &&
    decision.policyHash === presentation.policyHash &&
    decision.taskHash === presentation.taskHash &&
    decision.methodVersion === presentation.methodVersion
  )
}

function validPresentation(presentation: ApprovalPresentation) {
  if (presentation.actor.sessionId !== presentation.sessionID) return false
  const fields = [
    presentation.id,
    presentation.sessionID,
    presentation.assistantMessageID,
    presentation.planRevisionID,
    presentation.validationRecordID,
    presentation.actor.projectId,
    presentation.actor.memberId,
    presentation.revisionHash,
    presentation.validationHash,
    presentation.contextHash,
    presentation.policyHash,
    presentation.taskHash,
    presentation.intent.subagentType,
    presentation.intent.prompt,
    presentation.methodVersion,
  ]
  if (presentation.intent.model !== undefined) fields.push(presentation.intent.model)
  if (presentation.intent.taskID !== undefined) fields.push(presentation.intent.taskID)
  return fields.every((field) => field.trim().length > 0)
}

function validDecisionTime(time: number) {
  return Number.isSafeInteger(time) && time >= 0
}

function classifyReply(text: string): ApprovalDecision["outcome"] | undefined {
  const normalized = text.trim().toLocaleLowerCase("en-US")
  if (/^(approve|aprovo)[.!]?$/.test(normalized)) return "APPROVED"
  if (/^(decline|declino|cancel|cancelar)[.!]?$/.test(normalized)) return "DECLINED"
}
