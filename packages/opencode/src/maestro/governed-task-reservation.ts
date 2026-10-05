import { Agent } from "../agent/agent"
import { deriveSubagentSessionPermission } from "../agent/subagent-permissions"
import { Session } from "../session/session"
import { SessionID } from "../session/schema"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { and, asc, eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { EventV2Bridge } from "../event-v2-bridge"
import { verifyGovernedTask } from "./governed-task"
import { taskHash } from "./task-hash"
import { recordApproval } from "./approval-record"

export function childPermissions(input: { parent: Session.Info; next: Agent.Info; primaryTools?: string[] }) {
  const inherited = deriveSubagentSessionPermission({
    parentSessionPermission: input.parent.permission ?? [],
    subagent: input.next,
  })
  const denies = [
    ...(input.next.permission.some((rule) => rule.permission === "todowrite")
      ? []
      : [{ permission: "todowrite" as const, pattern: "*" as const, action: "deny" as const }]),
    ...(input.next.permission.some((rule) => rule.permission === "task")
      ? []
      : [{ permission: "task" as const, pattern: "*" as const, action: "deny" as const }]),
    ...(input.primaryTools?.map((permission) => ({ permission, pattern: "*" as const, action: "deny" as const })) ??
      []),
  ]
  return [
    ...inherited,
    ...denies.filter(
      (deny) =>
        !inherited.some(
          (rule) => rule.permission === deny.permission && rule.pattern === deny.pattern && rule.action === deny.action,
        ),
    ),
  ]
}

type GovernedRequest = {
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

export const reserve = Effect.fn("MaestroGovernedTaskReservation.reserve")(function* (input: {
  governed: GovernedRequest
  subagentType: string
  prompt: string
  model?: string
  taskID?: string
  sessionID: SessionID
  agent: string
  agentID?: string
  callID?: string
  parent: Session.Info
  nextID: string
  permission: ReturnType<typeof childPermissions>
  agentService: Agent.Interface
  database: Database.Interface
  events: EventV2.Interface
  sessions: Session.Interface
}) {
  const caller = yield* input.agentService.get(input.agentID ?? input.agent)
  if (caller?.id !== "maestro" || caller.native !== true) {
    return yield* Effect.fail(new Error("Governed Task requires Maestro"))
  }
  if (!input.callID) return yield* Effect.fail(new Error("Governed Task denied: missing-call-id"))
  if (input.governed.sessionID !== input.sessionID || input.governed.projectID !== input.parent.projectID) {
    return yield* Effect.fail(new Error("Governed Task denied: request-context-mismatch"))
  }
  if (input.governed.memberID !== caller.id) {
    return yield* Effect.fail(new Error("Governed Task denied: request-actor-mismatch"))
  }
  if (
    input.governed.taskHash !==
    taskHash({
      subagentType: input.subagentType,
      prompt: input.prompt,
      model: input.model,
      ...input.governed,
    })
  ) {
    return yield* Effect.fail(new Error("Governed Task denied: task-hash-mismatch"))
  }
  const directApproval = yield* recordApproval(input.sessionID).pipe(
    Effect.provideService(Database.Service, input.database),
    Effect.provideService(EventV2Bridge.Service, input.events),
  )
  if (directApproval.status !== "APPROVED") {
    return yield* Effect.fail(new Error("Governed Task denied: direct-approval-not-approved"))
  }
  const directDecision = directApproval.decision
  if (
    directDecision.sessionID !== input.governed.sessionID ||
    directDecision.actor.projectId !== input.governed.projectID ||
    directDecision.actor.memberId !== input.governed.memberID ||
    directDecision.approvalMessageID !== input.governed.approvalMessageID ||
    directDecision.planRevisionID !== input.governed.planRevisionID ||
    directDecision.revisionHash !== input.governed.revisionHash ||
    directDecision.validationRecordID !== input.governed.validationRecordID ||
    directDecision.validationHash !== input.governed.validationHash ||
    directDecision.contextHash !== input.governed.contextHash ||
    directDecision.policyHash !== input.governed.policyHash ||
    directDecision.taskHash !== input.governed.taskHash
  ) {
    return yield* Effect.fail(new Error("Governed Task denied: direct-approval-binding-mismatch"))
  }
  const decisions = yield* input.database.db
    .select({ data: EventTable.data })
    .from(EventTable)
    .where(
      and(
        eq(EventTable.aggregate_id, input.governed.sessionID),
        eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.Decided.type, 1)),
      ),
    )
    .orderBy(asc(EventTable.seq))
    .all()
    .pipe(Effect.orDie)
  const presentations = yield* input.database.db
    .select({ data: EventTable.data })
    .from(EventTable)
    .where(
      and(
        eq(EventTable.aggregate_id, input.governed.sessionID),
        eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.Presented.type, 1)),
      ),
    )
    .orderBy(asc(EventTable.seq))
    .all()
    .pipe(Effect.orDie)
  const decisionEvents = decisions.map((decision) =>
    Schema.decodeUnknownSync(MaestroEvent.Approval.Decided.data)(decision.data),
  )
  const newestPresentation = presentations.at(-1)
  const newestPresentationID = newestPresentation
    ? Schema.decodeUnknownSync(MaestroEvent.Approval.Presented.data)(newestPresentation.data).id
    : undefined
  const verdict = verifyGovernedTask({
    request: input.governed,
    decisions: decisionEvents,
    newestPresentationID,
  })
  if (verdict.status !== "APPROVED") return yield* Effect.fail(new Error(`Governed Task denied: ${verdict.reason}`))
  const approvedDecision = decisionEvents.find(
    (decision) =>
      decision.outcome === "APPROVED" &&
      decision.approvalMessageID === input.governed.approvalMessageID &&
      decision.presentationID === newestPresentationID &&
      decision.planRevisionID === input.governed.planRevisionID &&
      decision.revisionHash === input.governed.revisionHash &&
      decision.validationRecordID === input.governed.validationRecordID &&
      decision.validationHash === input.governed.validationHash &&
      decision.contextHash === input.governed.contextHash &&
      decision.policyHash === input.governed.policyHash &&
      decision.taskHash === input.governed.taskHash,
  )
  if (!approvedDecision) return yield* Effect.fail(new Error("Governed Task denied: approved-decision-missing"))
  const consumed = yield* input.database.db
    .select({ data: EventTable.data })
    .from(EventTable)
    .where(
      and(
        eq(EventTable.aggregate_id, input.governed.sessionID),
        eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.Consumed.type, 1)),
      ),
    )
    .all()
    .pipe(Effect.orDie)
  if (
    consumed.some((event) => {
      const data = Schema.decodeUnknownSync(MaestroEvent.Approval.Consumed.data)(event.data)
      return data.presentationID === approvedDecision.presentationID && data.taskHash === input.governed.taskHash
    })
  ) {
    return yield* Effect.fail(new Error("Governed Task denied: approval-consumed"))
  }
  const reservationHash = createHash("sha256")
    .update([input.governed.sessionID, approvedDecision.presentationID, input.governed.taskHash].join("\u0000"))
    .digest("hex")
  const reservationID = EventV2.ID.make(`evt_maestro_approval_reserved_${reservationHash}`)
  const childSessionID = SessionID.make(`ses_maestro_approval_${reservationHash}`)
  if (input.taskID && input.taskID !== childSessionID) {
    return yield* Effect.fail(new Error("Governed Task denied: reservation-child-mismatch"))
  }
  const reservation = {
    sessionID: input.governed.sessionID,
    presentationID: approvedDecision.presentationID,
    approvalMessageID: input.governed.approvalMessageID,
    projectID: input.governed.projectID,
    memberID: input.governed.memberID,
    planRevisionID: input.governed.planRevisionID,
    validationRecordID: input.governed.validationRecordID,
    revisionHash: input.governed.revisionHash,
    validationHash: input.governed.validationHash,
    contextHash: input.governed.contextHash,
    policyHash: input.governed.policyHash,
    taskHash: input.governed.taskHash,
    callID: input.callID,
    childSessionID,
    parentSessionID: input.sessionID,
    agent: input.nextID,
    permission: input.permission,
  }
  const existingReservation = yield* input.database.db
    .select({ data: EventTable.data, type: EventTable.type })
    .from(EventTable)
    .where(eq(EventTable.id, reservationID))
    .get()
    .pipe(Effect.orDie)
  const existingPermission = existingReservation
    ? requireReservation(existingReservation, reservation)
    : yield* input.events.publish(MaestroEvent.Approval.ReservedV2, reservation, { id: reservationID }).pipe(
        Effect.as(input.permission),
        Effect.catchCause(() =>
          input.database.db
            .select({ data: EventTable.data, type: EventTable.type })
            .from(EventTable)
            .where(eq(EventTable.id, reservationID))
            .get()
            .pipe(
              Effect.orDie,
              Effect.flatMap((event) => {
                if (!event) return Effect.fail(new Error("Governed Task denied: reservation-hold"))
                return Effect.succeed(requireReservation(event, reservation))
              }),
            ),
        ),
      )
  const consumeID = EventV2.ID.make(`evt_maestro_approval_consumed_${reservationHash}`)
  const existingReceipt = yield* input.database.db
    .select({ data: EventTable.data })
    .from(EventTable)
    .where(eq(EventTable.id, consumeID))
    .get()
    .pipe(Effect.orDie)
  if (!existingReceipt) {
    return {
      childSessionID,
      presentationID: approvedDecision.presentationID,
      callID: input.callID,
      permission: existingPermission,
      replayReserved: false,
    }
  }
  const receipt = Schema.decodeUnknownSync(MaestroEvent.Approval.ConsumedV2.data)(existingReceipt.data)
  if (
    receipt.sessionID !== input.governed.sessionID ||
    receipt.presentationID !== approvedDecision.presentationID ||
    receipt.approvalMessageID !== input.governed.approvalMessageID ||
    receipt.taskHash !== input.governed.taskHash ||
    receipt.callID !== input.callID ||
    receipt.childSessionID !== childSessionID
  ) {
    return yield* Effect.fail(new Error("Governed Task denied: receipt-binding-mismatch"))
  }
  const child = yield* input.sessions.get(childSessionID).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
  if (!child) return yield* Effect.fail(new Error("Governed Task denied: consumed-child-missing"))
  return {
    childSessionID,
    presentationID: approvedDecision.presentationID,
    callID: input.callID,
    permission: existingPermission,
    replayReserved: true,
  }
})

function requireReservation(
  event: { data: unknown; type: string },
  reservation: Schema.Schema.Type<typeof MaestroEvent.Approval.ReservedV2.data>,
) {
  if (event.type !== EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2)) {
    throw new Error("Governed Task denied: reservation-missing-permission-snapshot")
  }
  const existing = Schema.decodeUnknownSync(MaestroEvent.Approval.ReservedV2.data)(event.data)
  if (
    existing.sessionID !== reservation.sessionID ||
    existing.presentationID !== reservation.presentationID ||
    existing.approvalMessageID !== reservation.approvalMessageID ||
    existing.projectID !== reservation.projectID ||
    existing.memberID !== reservation.memberID ||
    existing.planRevisionID !== reservation.planRevisionID ||
    existing.validationRecordID !== reservation.validationRecordID ||
    existing.revisionHash !== reservation.revisionHash ||
    existing.validationHash !== reservation.validationHash ||
    existing.contextHash !== reservation.contextHash ||
    existing.policyHash !== reservation.policyHash ||
    existing.taskHash !== reservation.taskHash ||
    existing.callID !== reservation.callID ||
    existing.childSessionID !== reservation.childSessionID ||
    existing.parentSessionID !== reservation.parentSessionID ||
    existing.agent !== reservation.agent
  ) {
    throw new Error("Governed Task denied: reservation-binding-mismatch")
  }
  return existing.permission
}

export const consume = Effect.fn("MaestroGovernedTaskReservation.consume")(function* (input: {
  governed: {
    sessionID: string
    approvalMessageID: string
    taskHash: string
  }
  presentationID: string
  childSessionID: SessionID
  callID: string
  database: Database.Interface
  events: EventV2.Interface
}) {
  const id = EventV2.ID.make(
    `evt_maestro_approval_consumed_${createHash("sha256")
      .update([input.governed.sessionID, input.presentationID, input.governed.taskHash].join("\u0000"))
      .digest("hex")}`,
  )
  const receipt = {
    sessionID: input.governed.sessionID,
    presentationID: input.presentationID,
    approvalMessageID: input.governed.approvalMessageID,
    taskHash: input.governed.taskHash,
    callID: input.callID,
    childSessionID: input.childSessionID,
  }
  yield* input.events.publish(MaestroEvent.Approval.ConsumedV2, receipt, { id }).pipe(
    Effect.catchCause(() =>
      input.database.db
        .select({ data: EventTable.data })
        .from(EventTable)
        .where(eq(EventTable.id, id))
        .get()
        .pipe(
          Effect.orDie,
          Effect.flatMap((event) => {
            if (!event) return Effect.fail(new Error("Governed Task denied: receipt-hold"))
            const existing = Schema.decodeUnknownSync(MaestroEvent.Approval.ConsumedV2.data)(event.data)
            if (
              existing.sessionID !== receipt.sessionID ||
              existing.presentationID !== receipt.presentationID ||
              existing.approvalMessageID !== receipt.approvalMessageID ||
              existing.taskHash !== receipt.taskHash ||
              existing.callID !== receipt.callID ||
              existing.childSessionID !== receipt.childSessionID
            ) {
              return Effect.fail(new Error("Governed Task denied: receipt-binding-mismatch"))
            }
            return Effect.void
          }),
        ),
    ),
  )
})

export * as GovernedTaskReservation from "./governed-task-reservation"
