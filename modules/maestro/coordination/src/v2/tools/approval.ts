export * as MaestroApprovalTools from "./approval"

import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
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
import { taskHash } from "../../task-hash"
import { GovernanceDispatchV2 } from "../governance/dispatch"
import { GovernanceEvidenceV2 } from "../governance/evidence"
import { GovernanceRecordsV2 } from "../governance/records"
import { MaestroChainTools } from "./chain"
import { MaestroToolGate } from "./gate"
import { MaestroReviewRecords } from "./review-records"

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

export function tools(input: { readonly services: MaestroChainTools.Services; readonly gate: MaestroToolGate.Gate }) {
  const services = input.services
  return {
    [names.present]: Tool.make({
      description:
        "Present exact task intent for direct user approval. Requires native Maestro, same-Session/project durable plan and VALID validation, current clean context, and cold-review (`lucy`) APPROVE. Runtime computes the task hash; an optional supplied hash must match. End the turn after presenting: the owner's reply counts only as the very first user message after it. To present again, use a new methodVersion.",
      input: PresentationInput,
      output: Schema.String,
      execute: (params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, AgentV2.defaultID, "Approval presentation requires Maestro")
          if (!params.planRevisionID.startsWith("evt_") || !params.validationRecordID.startsWith("evt_"))
            return yield* new Tool.Failure({
              message: "Approval presentation requires durable plan revision and validation event IDs",
            })
          const plan = yield* GovernanceRecordsV2.readPlanRevision(services.db, params.planRevisionID)
          const validation = yield* GovernanceRecordsV2.readValidation(services.db, params.validationRecordID)
          const record = yield* GovernanceRecordsV2.readContext(
            services.db,
            params.contextRecordID ?? params.contextHash,
          )
          if (!plan || !validation || !record)
            return yield* new Tool.Failure({ message: "Approval presentation evidence not found" })
          if (
            plan.sessionID !== context.sessionID ||
            validation.sessionID !== context.sessionID ||
            record.sessionID !== context.sessionID
          )
            return yield* new Tool.Failure({ message: "Approval presentation session mismatch" })
          if (validation.outcome !== "VALID")
            return yield* new Tool.Failure({ message: "Approval presentation requires VALID validation" })
          if (!(yield* GovernanceEvidenceV2.contextIsCurrent(services, record)))
            return yield* new Tool.Failure({
              message: `Approval presentation context is stale: ${MaestroChainTools.STALE_CONTEXT_NEXT_STEP}`,
            })
          if (record.changedPaths.length > 0)
            return yield* new Tool.Failure({
              message: `Approval presentation context is dirty: ${MaestroChainTools.DIRTY_CONTEXT_NEXT_STEP}`,
            })
          if (
            validation.planRevisionID !== plan.id ||
            validation.contextRecordID !== record.id ||
            validation.contextHash !== record.contextHash ||
            record.planRevisionID !== plan.id
          )
            return yield* new Tool.Failure({ message: "Approval evidence chain mismatch" })
          const session = yield* services.store.get(context.sessionID)
          if (
            !session ||
            plan.sessionID !== session.id ||
            validation.projectID !== session.projectID ||
            record.projectID !== session.projectID
          )
            return yield* new Tool.Failure({ message: "Approval project binding mismatch" })
          const review = yield* MaestroReviewRecords.findReview(services, context.sessionID, validation.id)
          if (review?.verdict !== "APPROVE")
            return yield* new Tool.Failure({ message: "Approval presentation requires lucy APPROVE" })
          // V1 revalidates a workflow binding against the native Relay host, which V2 does not wire yet.
          if (plan.revision === "v3" && plan.workflowBinding)
            return yield* MaestroToolGate.hold(
              "workflow-binding-unavailable",
              "this plan revision binds a Relay workflow, and V2 cannot revalidate it against the native host yet.",
            )
          const validationHash = MaestroReviewRecords.hash(validation)
          const canonicalTaskHash = taskHash({
            ...params.intent,
            planRevisionID: plan.id,
            revisionHash: plan.revisionHash,
            validationRecordID: validation.id,
            validationHash,
            contextHash: record.contextHash,
            policyHash: validation.reviewPolicyHash,
          })
          if (params.taskHash !== undefined && params.taskHash !== canonicalTaskHash)
            return yield* new Tool.Failure({
              message: "Approval presentation task hash does not match intent and durable evidence",
            })
          const presentation = yield* presentApproval(services, {
            sessionID: context.sessionID,
            assistantMessageID: context.assistantMessageID,
            callID: context.toolCallID,
            projectID: session.projectID,
            memberID: "maestro",
            planRevisionID: plan.id,
            validationRecordID: validation.id,
            revisionHash: plan.revisionHash,
            validationHash,
            contextHash: record.contextHash,
            policyHash: validation.reviewPolicyHash,
            taskHash: canonicalTaskHash,
            intent: params.intent,
            methodVersion: params.methodVersion,
            plan: plan.goal.value,
            provenance: `admission ${plan.admissionMessageID}`,
            assumptions: plan.assumptions.map((item) => item.value),
            validationLedger: validation.checks
              .map((check) => `${check.id}: ${check.status} (${check.detail})`)
              .join("\n"),
            contextState: "CURRENT",
          })
          return renderPresentation(presentation)
        }),
    }),
    [names.record]: Tool.make({
      description: "Record direct user approval or decline for current exact Maestro plan presentation. Maestro only.",
      input: Schema.Struct({}),
      output: RecordOutput,
      toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
      execute: (_params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, AgentV2.defaultID, "Approval decision requires Maestro")
          const result = yield* recordApproval(services, context.sessionID)
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
      execute: (params, context) =>
        input
          .gate(context, AgentV2.defaultID, "Authorization requires Maestro")
          .pipe(
            Effect.andThen(grantAuthorization(services, { ...params, sessionID: context.sessionID })),
            Effect.map((receipt) => receipt.id),
          ),
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

type PresentInput = Omit<ApprovalPresentation, "id" | "assistantMessageID" | "actor"> & {
  readonly sessionID: Tool.Context["sessionID"]
  readonly assistantMessageID: string
  readonly callID: string
  readonly projectID: string
  readonly memberID: string
}

/** Record one presentation once; an exact retry replays it unless the owner wrote since, as V1 does. */
export const presentApproval = Effect.fn("MaestroApprovalTools.present")(function* (
  services: MaestroChainTools.Services,
  input: PresentInput,
) {
  // Reject malformed producers here; invalid historical presentations make the whole Session ineligible.
  const fields = {
    sessionID: input.sessionID,
    assistantMessageID: input.assistantMessageID,
    callID: input.callID,
    projectID: input.projectID,
    memberID: input.memberID,
    planRevisionID: input.planRevisionID,
    validationRecordID: input.validationRecordID,
    revisionHash: input.revisionHash,
    validationHash: input.validationHash,
    contextHash: input.contextHash,
    policyHash: input.policyHash,
    taskHash: input.taskHash,
    subagentType: input.intent.subagentType,
    prompt: input.intent.prompt,
    ...(input.intent.model !== undefined ? { model: input.intent.model } : {}),
    ...(input.intent.taskID !== undefined ? { taskID: input.intent.taskID } : {}),
    methodVersion: input.methodVersion,
  }
  const malformed = Object.entries(fields).find(([, value]) => typeof value !== "string" || value.trim().length === 0)
  if (malformed)
    return yield* new Tool.Failure({ message: `Malformed approval presentation: ${malformed[0]} must be nonblank` })
  const presentation: Presented = {
    id: `apr_${sha256([input.sessionID, input.planRevisionID, input.validationRecordID, input.methodVersion])}`,
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
  const id = EventV2.ID.make(
    `evt_maestro_approval_presentation_${sha256([input.sessionID, input.planRevisionID, input.validationRecordID, input.methodVersion])}`,
  )
  const existing = yield* services.db
    .select({ type: EventV2.EventTable.type, data: EventV2.EventTable.data })
    .from(EventV2.EventTable)
    .where(eq(EventV2.EventTable.id, id))
    .get()
    .pipe(Effect.orDie)
  if (existing) {
    const recorded = Schema.decodeUnknownSync(MaestroEvent.Approval.Presented.data)(existing.data)
    if (
      existing.type === EventV2.versionedType(MaestroEvent.Approval.Presented.type, 1) &&
      recorded.sessionID === presentation.sessionID &&
      recorded.planRevisionID === presentation.planRevisionID &&
      recorded.validationRecordID === presentation.validationRecordID &&
      recorded.methodVersion === presentation.methodVersion &&
      isDeepStrictEqual(
        { ...recorded, id: "", assistantMessageID: "", callID: "" },
        { ...presentation, id: "", assistantMessageID: "", callID: "" },
      )
    ) {
      // A retried tool call replays the earlier presentation; after an owner message it would be a silent no-op.
      if (yield* ownerSpokeBetween(services, input.sessionID, recorded.assistantMessageID, input.assistantMessageID))
        return yield* new Tool.Failure({
          message: `MaestroApprovalMethodReused: methodVersion ${presentation.methodVersion} was already presented in message ${recorded.assistantMessageID}, and the owner has written since, so this call did not present again and a new reply would still be checked against that earlier presentation. Present again with a new methodVersion, then end the turn and wait for the owner's exact reply.`,
        })
      return presentationFromEvent(recorded)
    }
    return yield* new Tool.Failure({
      message:
        "MaestroApprovalConflict: this plan revision, validation and methodVersion were already presented with different content. Present again with a new methodVersion.",
    })
  }
  const published = yield* services.events.publish(MaestroEvent.Approval.Presented, presentation, { id })
  return presentationFromEvent(published.data)
})

// Same ordering as recordApproval: a user message strictly between the presented message and the calling one.
const ownerSpokeBetween = Effect.fn("MaestroApprovalTools.ownerSpokeBetween")(function* (
  services: MaestroChainTools.Services,
  sessionID: Tool.Context["sessionID"],
  presentedMessageID: string,
  callingMessageID: string,
) {
  if (presentedMessageID === callingMessageID) return false
  const ordered = (yield* services.store.context(sessionID).pipe(Effect.orDie)).filter(
    (message) => message.type === "user" || message.type === "synthetic" || message.type === "assistant",
  )
  const presented = ordered.findIndex((message) => message.id === presentedMessageID)
  const calling = ordered.findIndex((message) => message.id === callingMessageID)
  if (presented < 0 || calling < 0) return false
  return ordered.slice(presented + 1, calling).some((message) => message.type !== "assistant")
})

// Each failed precondition names the one step that can satisfy it.
const authorizationNextSteps: Record<string, string> = {
  "validation-not-found": "Pass the validationRecordID from the maestro_record_validation Bindings line.",
  "session-mismatch": "Authorize only a validation recorded in this Session.",
  "validation-not-valid":
    "Only a VALID validation can be authorized; fix the failing or held checks and record a new validation with a new workCardID.",
  "validation-unbound":
    "This validation has no plan revision or context binding; record a new validation with a new workCardID.",
  "validation-evidence-mismatch":
    "The validation no longer matches its plan revision or context; record a new validation from the current ones with a new workCardID.",
  "context-not-current": MaestroChainTools.STALE_CONTEXT_NEXT_STEP,
  "context-dirty": MaestroChainTools.DIRTY_CONTEXT_NEXT_STEP,
  "review-not-approved":
    "Authorization needs a cold-review (`lucy`) APPROVE plan-stage receipt for this validation and work card; call maestro_request_review, and after FIX_FIRST or REJECT fix the plan or its committed spec and validate again with a new workCardID.",
  "approval-not-current":
    "The owner's latest message must still be the exact approve reply to the newest presentation; any later user message, even an instruction to continue, makes it not current. Record approval and grant authorization in the turn that answers the owner's reply; call maestro_record_approval to see why it is not current.",
  "approval-binding-mismatch":
    "Pass approvalMessageID from the maestro_record_approval Bindings line and the validationRecordID that was presented.",
  "presentation-not-found": "Present again with a new methodVersion and wait for the owner's exact reply.",
  "presentation-binding-mismatch":
    "The approved presentation no longer matches this validation; present again with a new methodVersion and wait for the owner's exact reply.",
}

function authorizationRejected(reason: string) {
  const next = authorizationNextSteps[reason]
  return new Tool.Failure({
    message: next ? `MaestroAuthorizationRejected: ${reason}. ${next}` : `MaestroAuthorizationRejected: ${reason}`,
  })
}

/** Grant execution authority once from a current direct approval and a plan-stage APPROVE receipt, as V1 does. */
export const grantAuthorization = Effect.fn("MaestroApprovalTools.grant")(function* (
  services: MaestroChainTools.Services,
  input: {
    readonly sessionID: Tool.Context["sessionID"]
    readonly validationRecordID: string
    readonly approvalMessageID: string
  },
) {
  const validation = yield* GovernanceRecordsV2.readValidation(services.db, input.validationRecordID)
  if (!validation) return yield* authorizationRejected("validation-not-found")
  if (validation.sessionID !== input.sessionID) return yield* authorizationRejected("session-mismatch")
  if (validation.outcome !== "VALID") return yield* authorizationRejected("validation-not-valid")
  if (!validation.planRevisionID || !validation.contextRecordID || !validation.contextHash)
    return yield* authorizationRejected("validation-unbound")
  const plan = yield* GovernanceRecordsV2.readPlanRevision(services.db, validation.planRevisionID)
  const record = yield* GovernanceRecordsV2.readContext(services.db, validation.contextRecordID)
  if (
    !plan ||
    !record ||
    plan.sessionID !== input.sessionID ||
    record.sessionID !== input.sessionID ||
    record.planRevisionID !== plan.id ||
    record.contextHash !== validation.contextHash ||
    record.projectID !== validation.projectID
  )
    return yield* authorizationRejected("validation-evidence-mismatch")
  if (!(yield* GovernanceEvidenceV2.contextIsCurrent(services, record)))
    return yield* authorizationRejected("context-not-current")
  if (record.changedPaths.length > 0) return yield* authorizationRejected("context-dirty")
  const review = yield* MaestroReviewRecords.findReview(
    services,
    input.sessionID,
    input.validationRecordID,
    validation.workCardHash,
  )
  if (review?.verdict !== "APPROVE") return yield* authorizationRejected("review-not-approved")
  const approval = yield* recordApproval(services, input.sessionID)
  if (approval.status !== "APPROVED") return yield* authorizationRejected("approval-not-current")
  const validationHash = MaestroReviewRecords.hash(validation)
  if (
    approval.decision.approvalMessageID !== input.approvalMessageID ||
    approval.decision.planRevisionID !== plan.id ||
    approval.decision.validationRecordID !== input.validationRecordID ||
    approval.decision.actor.projectId !== validation.projectID ||
    approval.decision.actor.sessionId !== input.sessionID ||
    approval.decision.actor.memberId !== "maestro" ||
    approval.decision.revisionHash !== plan.revisionHash ||
    approval.decision.validationHash !== validationHash ||
    approval.decision.contextHash !== record.contextHash ||
    approval.decision.policyHash !== validation.reviewPolicyHash
  )
    return yield* authorizationRejected("approval-binding-mismatch")
  const presentation = (yield* sessionEvents(services, input.sessionID))
    .filter((row) => row.type === EventV2.versionedType(MaestroEvent.Approval.Presented.type, 1))
    .map((row) => Schema.decodeUnknownSync(MaestroEvent.Approval.Presented.data)(row.data))
    .find((row) => row.id === approval.decision.presentationID)
  if (!presentation) return yield* authorizationRejected("presentation-not-found")
  if (
    presentation.planRevisionID !== plan.id ||
    presentation.validationRecordID !== validation.id ||
    presentation.projectID !== validation.projectID ||
    presentation.memberID !== "maestro" ||
    presentation.revisionHash !== plan.revisionHash ||
    presentation.validationHash !== validationHash ||
    presentation.contextHash !== record.contextHash ||
    presentation.policyHash !== validation.reviewPolicyHash ||
    presentation.taskHash !== approval.decision.taskHash
  )
    return yield* authorizationRejected("presentation-binding-mismatch")
  // The roster loads lazily; a grant recorded before the backend seat's rename routes to its former id.
  const roster = yield* Effect.tryPromise(() => import("../../roster")).pipe(Effect.orDie)
  const id = `evt_maestro_authorization_${createHash("sha256")
    .update(`${input.sessionID}\0${input.validationRecordID}\0${input.approvalMessageID}`, "utf8")
    .digest("hex")}`
  const existing = yield* GovernanceRecordsV2.readAuthorization(services.db, id, roster.canonicalMemberId)
  if (existing) return existing
  const published = yield* services.events.publish(
    MaestroEvent.Authorization.Granted,
    {
      sessionID: input.sessionID,
      projectID: validation.projectID,
      approvalMessageID: input.approvalMessageID,
      validationRecordID: input.validationRecordID,
      workCardHash: validation.workCardHash,
      routedMemberID: roster.canonicalMemberId(validation.routedMemberID),
      rosterHash: validation.rosterHash,
      grantHash: validation.grantHash,
      reviewPolicyHash: validation.reviewPolicyHash,
      actor: validation.actor,
      reviewerID: "lucy" as const,
      taskIntentHash: GovernanceDispatchV2.taskIntentHash(presentation.intent),
      methodVersion: "authorization-v1",
    },
    { id: EventV2.ID.make(id) },
  )
  return { id: published.id, ...published.data }
})

function sessionEvents(services: MaestroChainTools.Services, sessionID: string) {
  return services.db
    .select({ type: EventV2.EventTable.type, data: EventV2.EventTable.data })
    .from(EventV2.EventTable)
    .where(eq(EventV2.EventTable.aggregate_id, sessionID))
    .orderBy(asc(EventV2.EventTable.seq))
    .all()
    .pipe(Effect.orDie)
}

function sha256(parts: readonly string[]) {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex")
}

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
