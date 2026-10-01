import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { asc, eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { MessageV2 } from "../session/message-v2"
import { Session } from "../session/session"
import { SessionID } from "../session/schema"
import { EventV2Bridge } from "@/event-v2-bridge"
import {
  evaluateReply,
  renderPresentation,
  type ApprovalDecision,
  type ApprovalMessage,
  type ApprovalPresentation,
  type ApprovalResult,
} from "./approval"

type PresentApprovalInput = Omit<ApprovalPresentation, "id" | "assistantMessageID" | "actor"> & {
  sessionID: string
  assistantMessageID: string
  callID: string
  projectID: string
  memberID: string
}

type PresentedData = Schema.Schema.Type<typeof MaestroEvent.Approval.Presented.data>
type DecidedData = Schema.Schema.Type<typeof MaestroEvent.Approval.Decided.data>

export class ApprovalConflictError extends Schema.TaggedErrorClass<ApprovalConflictError>()("MaestroApprovalConflict", {
  sessionID: Schema.String,
  assistantMessageID: Schema.String,
  callID: Schema.String,
}) {}

function hash(parts: readonly string[]) {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex")
}

function presentationEventID(
  input: Pick<PresentApprovalInput, "sessionID" | "planRevisionID" | "validationRecordID" | "methodVersion">,
) {
  return EventV2.ID.make(
    `evt_maestro_approval_presentation_${hash([
      input.sessionID,
      input.planRevisionID,
      input.validationRecordID,
      input.methodVersion,
    ])}`,
  )
}

function decisionEventID(input: Pick<ApprovalDecision, "sessionID" | "approvalMessageID" | "methodVersion">) {
  return EventV2.ID.make(
    `evt_maestro_approval_decision_${hash([input.sessionID, input.approvalMessageID, input.methodVersion])}`,
  )
}

function presentationFromEvent(input: PresentedData): ApprovalPresentation {
  return {
    id: input.id,
    sessionID: input.sessionID,
    assistantMessageID: input.assistantMessageID,
    planRevisionID: input.planRevisionID,
    validationRecordID: input.validationRecordID,
    actor: { projectId: input.projectID, sessionId: input.sessionID, memberId: input.memberID },
    revisionHash: input.revisionHash,
    validationHash: input.validationHash,
    contextHash: input.contextHash,
    policyHash: input.policyHash,
    taskHash: input.taskHash,
    intent: input.intent,
    methodVersion: input.methodVersion,
    plan: input.plan,
    provenance: input.provenance,
    assumptions: input.assumptions,
    validationLedger: input.validationLedger,
    contextState: input.contextState,
  }
}

function decisionFromEvent(input: DecidedData): ApprovalDecision {
  return {
    presentationID: input.presentationID,
    approvalMessageID: input.approvalMessageID,
    sessionID: input.sessionID,
    planRevisionID: input.planRevisionID,
    validationRecordID: input.validationRecordID,
    actor: { projectId: input.projectID, sessionId: input.sessionID, memberId: input.memberID },
    revisionHash: input.revisionHash,
    validationHash: input.validationHash,
    contextHash: input.contextHash,
    policyHash: input.policyHash,
    taskHash: input.taskHash,
    methodVersion: input.methodVersion,
    outcome: input.outcome,
    time: { created: input.decisionTime },
  }
}

function text(parts: ReadonlyArray<{ type: string; text?: string }>) {
  return parts.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("")
}

function visiblePresentation(input: { presentation: PresentedData; message: SessionV1.WithParts | undefined }) {
  const { presentation, message } = input
  return (
    message?.info.role === "assistant" &&
    message.info.id === presentation.assistantMessageID &&
    message.parts.some(
      (part) =>
        part.type === "tool" &&
        part.tool === "maestro_present_approval" &&
        part.callID === presentation.callID &&
        part.state.status === "completed" &&
        part.state.output === renderPresentation(presentationFromEvent(presentation)),
    )
  )
}

export const presentApproval = Effect.fn("MaestroApproval.present")(function* (input: PresentApprovalInput) {
  const presentationID = `apr_${hash([
    input.sessionID,
    input.planRevisionID,
    input.validationRecordID,
    input.methodVersion,
  ])}`
  const presentation: PresentedData = {
    id: presentationID,
    sessionID: input.sessionID,
    assistantMessageID: input.assistantMessageID,
    callID: input.callID,
    planRevisionID: input.planRevisionID,
    validationRecordID: input.validationRecordID,
    projectID: input.projectID,
    memberID: input.memberID,
    revisionHash: input.revisionHash,
    validationHash: input.validationHash,
    contextHash: input.contextHash,
    policyHash: input.policyHash,
    taskHash: input.taskHash,
    intent: input.intent,
    methodVersion: input.methodVersion,
    plan: input.plan,
    provenance: input.provenance,
    assumptions: [...input.assumptions],
    validationLedger: input.validationLedger,
    contextState: input.contextState,
  }
  const { db } = yield* Database.Service
  const existing = yield* db
    .select({ type: EventTable.type, data: EventTable.data })
    .from(EventTable)
    .where(eq(EventTable.id, presentationEventID(input)))
    .get()
    .pipe(Effect.orDie)
  if (existing) {
    const recorded = Schema.decodeUnknownSync(MaestroEvent.Approval.Presented.data)(existing.data)
    const sameRevision =
      recorded.sessionID === presentation.sessionID &&
      recorded.planRevisionID === presentation.planRevisionID &&
      recorded.validationRecordID === presentation.validationRecordID &&
      recorded.methodVersion === presentation.methodVersion
    if (
      existing.type === EventV2.versionedType(MaestroEvent.Approval.Presented.type, 1) &&
      sameRevision &&
      isDeepStrictEqual(
        { ...recorded, id: "", assistantMessageID: "", callID: "" },
        { ...presentation, id: "", assistantMessageID: "", callID: "" },
      )
    ) {
      return presentationFromEvent(recorded)
    }
    return yield* new ApprovalConflictError(input)
  }
  const events = yield* EventV2Bridge.Service
  const recorded = yield* events.publish(MaestroEvent.Approval.Presented, presentation, {
    id: presentationEventID(input),
  })
  return presentationFromEvent(recorded.data)
})

export const recordApproval = Effect.fn("MaestroApproval.record")(function* (sessionID: string) {
  const { db } = yield* Database.Service
  const rows = yield* db
    .select({ type: EventTable.type, data: EventTable.data })
    .from(EventTable)
    .where(eq(EventTable.aggregate_id, sessionID))
    .orderBy(asc(EventTable.seq))
    .all()
    .pipe(Effect.orDie)
  const presented = rows
    .filter((row) => row.type === EventV2.versionedType(MaestroEvent.Approval.Presented.type, 1))
    .map((row) => Schema.decodeUnknownSync(MaestroEvent.Approval.Presented.data)(row.data))
  const decisions = rows
    .filter((row) => row.type === EventV2.versionedType(MaestroEvent.Approval.Decided.type, 1))
    .map((row) => decisionFromEvent(Schema.decodeUnknownSync(MaestroEvent.Approval.Decided.data)(row.data)))
  const messages = yield* MessageV2.stream(SessionID.make(sessionID))
  if (new Set(presented.map((event) => event.assistantMessageID)).size !== presented.length) {
    return { status: "HOLD", reason: "presentation-not-current" } as const
  }
  const visible = new Map<string, boolean>()
  for (const event of presented) {
    visible.set(
      event.assistantMessageID,
      visiblePresentation({
        presentation: event,
        message: messages.find((message) => message.info.id === event.assistantMessageID),
      }),
    )
  }
  const presentations = presented.map(presentationFromEvent)
  const conversation: ApprovalMessage[] = messages
    .filter((message) => message.info.role === "user" || message.info.role === "assistant")
    .sort(
      (left, right) => left.info.time.created - right.info.time.created || left.info.id.localeCompare(right.info.id),
    )
    .map((message, index) => {
      const presentation = presentations.find((item) => item.assistantMessageID === message.info.id)
      return {
        id: message.info.id,
        sessionID: message.info.sessionID,
        seq: index,
        role: message.info.role,
        text: presentation && visible.get(message.info.id) ? renderPresentation(presentation) : text(message.parts),
        synthetic: message.parts.some((part) => "synthetic" in part && part.synthetic === true),
      }
    })
  const reply = conversation.findLast((message) => message.role === "user")
  const current = presentations
    .map((presentation) => ({
      presentation,
      message: conversation.find((message) => message.id === presentation.assistantMessageID),
    }))
    .filter(
      (item): item is { presentation: ApprovalPresentation; message: ApprovalMessage } => item.message !== undefined,
    )
    .sort((left, right) => right.message.seq - left.message.seq || right.message.id.localeCompare(left.message.id))[0]
  if (!reply) return { status: "HOLD", reason: "reply-not-found" } as const
  if (!current) return { status: "HOLD", reason: "presentation-not-current" } as const
  const result = evaluateReply({
    presentation: current.presentation,
    presentations,
    messages: conversation,
    replyMessageID: reply.id,
    decisions,
    presentationCurrent: visible.get(current.presentation.assistantMessageID) === true,
    decisionTime: messages.find((message) => message.info.id === reply.id)?.info.time.created ?? -1,
  })
  if (result.status === "PENDING" || result.status === "HOLD") return result
  if (
    decisions.some(
      (decision) =>
        decision.presentationID === result.decision.presentationID &&
        decision.approvalMessageID === result.decision.approvalMessageID &&
        decision.methodVersion === result.decision.methodVersion,
    )
  ) {
    return result
  }

  const events = yield* EventV2Bridge.Service
  yield* events.publish(
    MaestroEvent.Approval.Decided,
    {
      sessionID: result.decision.sessionID,
      projectID: result.decision.actor.projectId,
      memberID: result.decision.actor.memberId,
      presentationID: result.decision.presentationID,
      presentationMessageID: current.presentation.assistantMessageID,
      approvalMessageID: result.decision.approvalMessageID,
      planRevisionID: result.decision.planRevisionID,
      validationRecordID: result.decision.validationRecordID,
      revisionHash: result.decision.revisionHash,
      validationHash: result.decision.validationHash,
      contextHash: result.decision.contextHash,
      policyHash: result.decision.policyHash,
      taskHash: result.decision.taskHash,
      methodVersion: result.decision.methodVersion,
      outcome: result.decision.outcome,
      decisionTime: result.decision.time.created,
    },
    { id: decisionEventID(result.decision) },
  )
  return result
})

export const presentApprovalFromSession = Effect.fn("MaestroApproval.presentFromSession")(function* (
  input: Omit<PresentApprovalInput, "projectID">,
) {
  const sessions = yield* Session.Service
  const session = yield* sessions.get(SessionID.make(input.sessionID))
  return yield* presentApproval({ ...input, projectID: session.projectID })
})
