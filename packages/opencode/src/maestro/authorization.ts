import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { asc, eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { EventV2Bridge } from "@/event-v2-bridge"
import { readValidation, validationRecordHash, type ReviewReceipt } from "./validation-record"
import { recordApproval } from "./approval-record"
import { readPlanRevision } from "./plan-revision"
import { contextIsCurrent, readContext } from "./context-record"

export class AuthorizationRejectedError extends Schema.TaggedErrorClass<AuthorizationRejectedError>()(
  "MaestroAuthorizationRejected",
  { reason: Schema.String },
) {}

export type AuthorizationInput = {
  sessionID: string
  validationRecordID: string
  approvalMessageID: string
}

export type AuthorizationReceipt = Schema.Schema.Type<typeof MaestroEvent.Authorization.Granted.data> & { id: string }

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function authorizationTaskIntentHash(input: { subagentType: string; prompt: string; model?: string }) {
  return hash(`${input.subagentType}\0${input.prompt}\0${input.model ?? ""}`)
}

function eventID(input: AuthorizationInput) {
  return EventV2.ID.make(
    `evt_maestro_authorization_${hash(`${input.sessionID}\0${input.validationRecordID}\0${input.approvalMessageID}`)}`,
  )
}

export const readAuthorization = Effect.fn("MaestroAuthorization.read")(function* (id: string) {
  const { db } = yield* Database.Service
  const row = yield* db
    .select()
    .from(EventTable)
    .where(eq(EventTable.id, EventV2.ID.make(id)))
    .get()
    .pipe(Effect.orDie)
  if (!row || row.type !== EventV2.versionedType(MaestroEvent.Authorization.Granted.type, 1)) return undefined
  return { id: row.id, ...Schema.decodeUnknownSync(MaestroEvent.Authorization.Granted.data)(row.data) }
})

export const grantAuthorization = Effect.fn("MaestroAuthorization.grant")(function* (input: AuthorizationInput) {
  const validation = yield* readValidation(input.validationRecordID)
  if (!validation) return yield* new AuthorizationRejectedError({ reason: "validation-not-found" })
  if (validation.sessionID !== input.sessionID)
    return yield* new AuthorizationRejectedError({ reason: "session-mismatch" })
  if (validation.outcome !== "VALID") return yield* new AuthorizationRejectedError({ reason: "validation-not-valid" })
  if (!validation.planRevisionID || !validation.contextRecordID || !validation.contextHash) {
    return yield* new AuthorizationRejectedError({ reason: "validation-unbound" })
  }
  const plan = yield* readPlanRevision(validation.planRevisionID)
  const context = yield* readContext(validation.contextRecordID)
  if (
    !plan ||
    !context ||
    plan.sessionID !== input.sessionID ||
    context.sessionID !== input.sessionID ||
    context.planRevisionID !== plan.id ||
    context.contextHash !== validation.contextHash ||
    context.projectID !== validation.projectID
  ) {
    return yield* new AuthorizationRejectedError({ reason: "validation-evidence-mismatch" })
  }
  if (!(yield* contextIsCurrent(context))) {
    return yield* new AuthorizationRejectedError({ reason: "context-not-current" })
  }
  if (context.changedPaths.length > 0) {
    return yield* new AuthorizationRejectedError({ reason: "context-dirty" })
  }
  const review = yield* findReview(input.sessionID, input.validationRecordID, validation.workCardHash)
  if (!review || review.verdict !== "APPROVE")
    return yield* new AuthorizationRejectedError({ reason: "review-not-approved" })
  const approval = yield* recordApproval(input.sessionID)
  if (approval.status !== "APPROVED") return yield* new AuthorizationRejectedError({ reason: "approval-not-current" })
  if (
    approval.decision.approvalMessageID !== input.approvalMessageID ||
    approval.decision.planRevisionID !== plan.id ||
    approval.decision.validationRecordID !== input.validationRecordID ||
    approval.decision.actor.projectId !== validation.projectID ||
    approval.decision.actor.sessionId !== input.sessionID ||
    approval.decision.actor.memberId !== "maestro" ||
    approval.decision.revisionHash !== plan.revisionHash ||
    approval.decision.validationHash !== validationRecordHash(validation) ||
    approval.decision.contextHash !== context.contextHash ||
    approval.decision.policyHash !== validation.reviewPolicyHash
  ) {
    return yield* new AuthorizationRejectedError({ reason: "approval-binding-mismatch" })
  }
  const presentation = yield* findPresentation(input.sessionID, approval.decision.presentationID)
  if (!presentation) return yield* new AuthorizationRejectedError({ reason: "presentation-not-found" })
  if (
    presentation.planRevisionID !== plan.id ||
    presentation.validationRecordID !== validation.id ||
    presentation.projectID !== validation.projectID ||
    presentation.memberID !== "maestro" ||
    presentation.revisionHash !== plan.revisionHash ||
    presentation.validationHash !== validationRecordHash(validation) ||
    presentation.contextHash !== context.contextHash ||
    presentation.policyHash !== validation.reviewPolicyHash ||
    presentation.taskHash !== approval.decision.taskHash
  ) {
    return yield* new AuthorizationRejectedError({ reason: "presentation-binding-mismatch" })
  }
  const wanted = {
    sessionID: input.sessionID,
    projectID: validation.projectID,
    approvalMessageID: input.approvalMessageID,
    validationRecordID: input.validationRecordID,
    workCardHash: validation.workCardHash,
    routedMemberID: validation.routedMemberID,
    rosterHash: validation.rosterHash,
    grantHash: validation.grantHash,
    reviewPolicyHash: validation.reviewPolicyHash,
    actor: validation.actor,
    reviewerID: "lucy" as const,
    taskIntentHash: authorizationTaskIntentHash(presentation.intent),
    methodVersion: "authorization-v1",
  }
  const id = eventID(input)
  const existing = yield* readAuthorization(id)
  if (existing) return existing
  const events = yield* EventV2Bridge.Service
  return yield* events
    .publish(MaestroEvent.Authorization.Granted, wanted, { id })
    .pipe(Effect.map((event) => ({ id: event.id, ...event.data })))
})

function findPresentation(sessionID: string, presentationID: string) {
  return Effect.gen(function* () {
    const { db } = yield* Database.Service
    const rows = yield* db
      .select({ type: EventTable.type, data: EventTable.data })
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, sessionID))
      .orderBy(asc(EventTable.seq))
      .all()
      .pipe(Effect.orDie)
    return rows
      .filter((row) => row.type === EventV2.versionedType(MaestroEvent.Approval.Presented.type, 1))
      .map((row) => Schema.decodeUnknownSync(MaestroEvent.Approval.Presented.data)(row.data))
      .find((row) => row.id === presentationID)
  })
}

function findReview(sessionID: string, validationRecordID: string, workCardHash: string) {
  return Effect.gen(function* () {
    const { db } = yield* Database.Service
    const rows = yield* db
      .select({ id: EventTable.id, type: EventTable.type, data: EventTable.data })
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, sessionID))
      .orderBy(asc(EventTable.seq))
      .all()
      .pipe(Effect.orDie)
    for (const row of rows.reverse()) {
      if (row.type === EventV2.versionedType(MaestroEvent.Review.Received.type, 1) && row.data) {
        const review = Schema.decodeUnknownSync(MaestroEvent.Review.Received.data)(row.data) as ReviewReceipt
        if (review.validationRecordID === validationRecordID && review.workCardHash === workCardHash) return review
      }
    }
    return undefined
  })
}

export * as Authorization from "./authorization"
