export * as MaestroApprovalTools from "./approval"

import { createHash } from "node:crypto"
import { asc, eq } from "drizzle-orm"
import { DateTime, Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import type { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import type { SessionStore } from "@orchestra/core/session"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import type { SessionMessage } from "@orchestra/schema/session-message"
import {
  evaluateReply,
  renderPresentation,
  type ApprovalDecision,
  type ApprovalMessage,
  type ApprovalPresentation,
  type ApprovalResult,
} from "../../approval"
import { MaestroToolGate } from "./gate"

export const names = {
  present: "maestro_present_approval",
  record: "maestro_record_approval",
  grant: "maestro_grant_authorization",
} as const

type Presented = Schema.Schema.Type<typeof MaestroEvent.Approval.Presented.data>
type Decided = Schema.Schema.Type<typeof MaestroEvent.Approval.Decided.data>

const PresentationInput = Schema.Struct({
  planRevisionID: Schema.String,
  validationRecordID: Schema.String,
  revisionHash: Schema.String,
  validationHash: Schema.String,
  contextHash: Schema.String,
  contextRecordID: Schema.optional(Schema.String),
  policyHash: Schema.String,
  taskHash: Schema.optional(
    Schema.NonEmptyString.annotate({
      description:
        "Optional matching task binding hash. Runtime computes the canonical hash from intent and durable evidence.",
    }),
  ),
  intent: Schema.Struct({
    subagentType: Schema.String,
    prompt: Schema.String,
    model: Schema.optional(Schema.String),
    taskID: Schema.optional(Schema.String),
  }),
  methodVersion: Schema.String,
  plan: Schema.String,
  provenance: Schema.String,
  assumptions: Schema.Array(Schema.String),
  validationLedger: Schema.String,
  contextState: Schema.Literal("CURRENT"),
})

const RecordOutput = Schema.Struct({ status: Schema.String, approvalMessageID: Schema.String, text: Schema.String })

export function tools(input: {
  readonly db: Database.Interface["db"]
  readonly events: EventV2.Interface
  readonly store: SessionStore.Interface
  readonly gate: MaestroToolGate.Gate
}) {
  return {
    [names.present]: Tool.make({
      description:
        "Present exact task intent for direct user approval. Requires native Maestro, same-Session/project durable plan and VALID validation, current clean context, and cold-review (`lucy`) APPROVE. Runtime computes the task hash; an optional supplied hash must match. End the turn after presenting: the owner's reply counts only as the very first user message after it. To present again, use a new methodVersion.",
      input: PresentationInput,
      output: Schema.String,
      execute: (_params, context) =>
        input
          .gate(context, AgentV2.defaultID, "Approval presentation requires Maestro")
          .pipe(Effect.andThen(Effect.fail(MaestroToolGate.chainHold("Approval presentation")))),
    }),
    [names.record]: Tool.make({
      description: "Record direct user approval or decline for current exact Maestro plan presentation. Maestro only.",
      input: Schema.Struct({}),
      output: RecordOutput,
      toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
      execute: (_params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, AgentV2.defaultID, "Approval decision requires Maestro")
          const result = yield* recordApproval(input, context.sessionID)
          // Short bounded outputs; the Bindings line must reach the model even under tiny truncation limits.
          switch (result.status) {
            case "APPROVED":
            case "DECLINED": {
              const bindings = {
                approvalMessageID: result.decision.approvalMessageID,
                planRevisionID: result.decision.planRevisionID,
              }
              return {
                status: result.status,
                approvalMessageID: bindings.approvalMessageID,
                text: `${result.status}: exact plan revision ${bindings.planRevisionID}\n\nBindings: ${JSON.stringify(bindings)}`,
              }
            }
            case "HOLD":
              return {
                status: result.status,
                approvalMessageID: "",
                text: `HOLD: ${result.reason}. ${holdNextSteps[result.reason]}`,
              }
            case "PENDING":
              return {
                status: result.status,
                approvalMessageID: "",
                text: `PENDING: ${result.kind}. ${pendingNextSteps[result.kind]}`,
              }
          }
        }),
    }),
    [names.grant]: Tool.make({
      description:
        "Grant execution authority from one direct user approval and an independent cold-review (`lucy`) receipt.",
      input: Schema.Struct({ validationRecordID: Schema.String, approvalMessageID: Schema.String }),
      output: Schema.String,
      execute: (_params, context) =>
        input
          .gate(context, AgentV2.defaultID, "Authorization requires Maestro")
          .pipe(Effect.andThen(Effect.fail(MaestroToolGate.chainHold("Authorization")))),
    }),
  }
}

/**
 * Decide the owner's latest reply against the newest presentation still shown exactly as rendered, and record the
 * decision once. The reply must be the very first user message after that presentation.
 */
export const recordApproval = Effect.fn("MaestroApprovalTools.record")(function* (
  services: {
    readonly db: Database.Interface["db"]
    readonly events: EventV2.Interface
    readonly store: SessionStore.Interface
  },
  sessionID: Tool.Context["sessionID"],
) {
  const rows = yield* services.db
    .select({ type: EventV2.EventTable.type, data: EventV2.EventTable.data })
    .from(EventV2.EventTable)
    .where(eq(EventV2.EventTable.aggregate_id, sessionID))
    .orderBy(asc(EventV2.EventTable.seq))
    .all()
    .pipe(Effect.orDie)
  const presented = rows
    .filter((row) => row.type === EventV2.versionedType(MaestroEvent.Approval.Presented.type, 1))
    .map((row) => Schema.decodeUnknownSync(MaestroEvent.Approval.Presented.data)(row.data))
  const decisions = rows
    .filter((row) => row.type === EventV2.versionedType(MaestroEvent.Approval.Decided.type, 1))
    .map((row) => decisionFromEvent(Schema.decodeUnknownSync(MaestroEvent.Approval.Decided.data)(row.data)))
  if (new Set(presented.map((event) => event.assistantMessageID)).size !== presented.length)
    return { status: "HOLD", reason: "presentation-not-current" } as const
  const messages = (yield* services.store.context(sessionID).pipe(Effect.orDie)).flatMap((message) =>
    message.type === "user" || message.type === "synthetic" || message.type === "assistant" ? [message] : [],
  )
  const visible = new Map(presented.map((event) => [event.assistantMessageID, isVisible(event, messages)] as const))
  const presentations = presented.map(presentationFromEvent)
  const conversation: ApprovalMessage[] = messages.map((message, index) => {
    const presentation = presentations.find((item) => item.assistantMessageID === message.id)
    return {
      id: message.id,
      sessionID,
      seq: index,
      role: message.type === "assistant" ? "assistant" : "user",
      text:
        presentation && visible.get(message.id)
          ? renderPresentation(presentation)
          : message.type === "assistant"
            ? message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")
            : message.text,
      // A Task result or other host-written message is not the owner speaking.
      synthetic: message.type === "synthetic",
    }
  })
  const reply = conversation.findLast((message) => message.role === "user")
  const current = presentations
    .flatMap((presentation) => {
      const message = conversation.find((item) => item.id === presentation.assistantMessageID)
      return message ? [{ presentation, message }] : []
    })
    .sort((left, right) => right.message.seq - left.message.seq || right.message.id.localeCompare(left.message.id))[0]
  if (!reply) return { status: "HOLD", reason: "reply-not-found" } as const
  if (!current) return { status: "HOLD", reason: "presentation-not-current" } as const
  const replied = messages.find((message) => message.id === reply.id)
  const result = evaluateReply({
    presentation: current.presentation,
    presentations,
    messages: conversation,
    replyMessageID: reply.id,
    decisions,
    presentationCurrent: visible.get(current.presentation.assistantMessageID) === true,
    decisionTime: replied ? DateTime.toEpochMillis(replied.time.created) : -1,
  })
  if (result.status === "PENDING" || result.status === "HOLD") return result
  if (
    decisions.some(
      (decision) =>
        decision.presentationID === result.decision.presentationID &&
        decision.approvalMessageID === result.decision.approvalMessageID &&
        decision.methodVersion === result.decision.methodVersion,
    )
  )
    return result
  yield* services.events.publish(
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

// A presentation counts only while its assistant message still shows the completed presenting call's exact rendering.
function isVisible(presentation: Presented, messages: readonly SessionMessage.Message[]) {
  const message = messages.find((item) => item.id === presentation.assistantMessageID)
  if (message?.type !== "assistant") return false
  const rendered = renderPresentation(presentationFromEvent(presentation))
  return message.content.some(
    (part) =>
      part.type === "tool" &&
      part.name === names.present &&
      part.id === presentation.callID &&
      part.state.status === "completed" &&
      part.state.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("") === rendered,
  )
}

function presentationFromEvent(input: Presented): ApprovalPresentation {
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

function decisionFromEvent(input: Decided): ApprovalDecision {
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

function decisionEventID(input: Pick<ApprovalDecision, "sessionID" | "approvalMessageID" | "methodVersion">) {
  const hash = createHash("sha256")
    .update([input.sessionID, input.approvalMessageID, input.methodVersion].join("\u0000"))
    .digest("hex")
  return EventV2.ID.make(`evt_maestro_approval_decision_${hash}`)
}

// One next step per result that records no decision, checked against evaluateReply and recordApproval.
const holdNextSteps: Record<Extract<ApprovalResult, { status: "HOLD" }>["reason"], string> = {
  "presentation-message-mismatch":
    "The newest presentation is not shown exactly as rendered in its message; present again with a new methodVersion, then end the turn and wait for the owner's exact reply.",
  "presentation-not-current":
    "Present again with a new methodVersion and end the turn; if it holds again, an earlier presentation shares its assistant message with another or was aborted or removed, which is permanent for this Session, so tell the owner.",
  "reply-not-found": "No owner message exists yet; end the turn and wait for the owner's reply.",
  "reply-session-mismatch": "Record approval only in the Session that presented.",
  "reply-not-direct-user": "Only a direct owner message can answer; end the turn and wait for the owner's reply.",
  "reply-synthetic":
    "The latest user message is synthetic (a task result or compaction), not the owner's reply; if it arrived after the presentation, present again with a new methodVersion, then end the turn and wait for the owner's exact reply.",
  "reply-not-after-presentation":
    "The owner has not replied since the presentation; end the turn and wait for the owner.",
  "reply-not-immediate":
    "Another user message arrived between the presentation and this reply. The approve word only counts as the very first user message after the presentation; an instruction, a follow-up or an earlier approve in between voids it, by design. Present again with a new methodVersion (the same methodVersion replays the earlier presentation), then end the turn and wait for the owner's exact reply.",
  "reply-already-bound":
    "This owner reply already decided another presentation; present again with a new methodVersion, then end the turn and wait for a new reply.",
  "presentation-identity-invalid":
    "The newest presentation record is malformed; present again with a new methodVersion, then end the turn and wait for the owner's exact reply.",
}

const pendingNextSteps: Record<Extract<ApprovalResult, { status: "PENDING" }>["kind"], string> = {
  question:
    "The owner asked a question instead of replying approve, aprovo, decline, declino, cancel or cancelar; answer it, then present again with a new methodVersion and ask for the exact word.",
  ambiguous:
    "The reply is not exactly approve, aprovo, decline, declino, cancel or cancelar; present again with a new methodVersion and ask for the exact word.",
}
