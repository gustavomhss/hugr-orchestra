export * as GovernanceReservationV2 from "./reservation"

import { createHash } from "node:crypto"
import { ToolFailure } from "@orchestra/llm"
import { and, asc, eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import type { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { SessionSchema, type SessionStore } from "@orchestra/core/session"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { verifyGovernedTask } from "../../governed-task"
import { taskHash, type TaskHashBinding } from "../../task-hash"
import { MaestroApprovalTools } from "../tools/approval"
import type { GovernanceDispatchV2 } from "./dispatch"
import type { GovernanceInputV2 } from "./input"
import { GovernanceRecordsV2 } from "./records"
import { WriteRootsV2 } from "./write-roots"

// The governed Task reservation. One approved
// presentation reserves exactly one child Session, write-once, with the permission snapshot it runs under, and is
// consumed once before that child's first provider turn. Records and refusals are V1's, so V1 reservations replay here.

export type Services = {
  readonly db: Database.Interface["db"]
  readonly events: EventV2.Interface
  readonly store: SessionStore.Interface
  readonly canonical: (id: string) => string
}

export type Governed = NonNullable<GovernanceInputV2.Input["governed"]>

export const CHILD_PREFIX = "ses_maestro_approval_"

export const reserve = Effect.fn("GovernanceReservationV2.reserve")(function* (
  services: Services,
  input: {
    governed: Governed
    subagentType: string
    prompt: string
    model?: string
    taskID?: string
    sessionID: string
    projectID: string
    caller: string
    callID: string
    target: string
    permission: ReadonlyArray<GovernanceDispatchV2.Rule>
    /** A workflow Task's approved binding, which its approval's task hash covers. */
    workflow?: Pick<TaskHashBinding, "workflowBinding" | "writePaths">
  },
) {
  // On V2 the caller is the Session's selected agent; only the native conductor is ever selected under its fixed id.
  if (input.caller !== AgentV2.defaultID) return yield* new ToolFailure({ message: "Governed Task requires Maestro" })
  if (!input.callID) return yield* denied("missing-call-id")
  if (input.governed.sessionID !== input.sessionID || input.governed.projectID !== input.projectID)
    return yield* denied("request-context-mismatch")
  if (input.governed.memberID !== input.caller) return yield* denied("request-actor-mismatch")
  if (
    input.governed.taskHash !==
    taskHash({ subagentType: input.subagentType, prompt: input.prompt, model: input.model, ...input.governed, ...input.workflow })
  )
    return yield* denied("task-hash-mismatch")
  const direct = yield* MaestroApprovalTools.recordApproval(services, SessionSchema.ID.make(input.sessionID))
  if (direct.status !== "APPROVED") return yield* denied("direct-approval-not-approved")
  if (
    direct.decision.sessionID !== input.governed.sessionID ||
    direct.decision.actor.projectId !== input.governed.projectID ||
    direct.decision.actor.memberId !== input.governed.memberID ||
    direct.decision.approvalMessageID !== input.governed.approvalMessageID ||
    direct.decision.planRevisionID !== input.governed.planRevisionID ||
    direct.decision.revisionHash !== input.governed.revisionHash ||
    direct.decision.validationRecordID !== input.governed.validationRecordID ||
    direct.decision.validationHash !== input.governed.validationHash ||
    direct.decision.contextHash !== input.governed.contextHash ||
    direct.decision.policyHash !== input.governed.policyHash ||
    direct.decision.taskHash !== input.governed.taskHash
  )
    return yield* denied("direct-approval-binding-mismatch")
  const decisions = (yield* rows(services.db, input.governed.sessionID, MaestroEvent.Approval.Decided.type, 1)).map(
    (row) => Schema.decodeUnknownSync(MaestroEvent.Approval.Decided.data)(row.data),
  )
  const newest = (yield* rows(services.db, input.governed.sessionID, MaestroEvent.Approval.Presented.type, 1)).at(-1)
  const newestPresentationID = newest
    ? Schema.decodeUnknownSync(MaestroEvent.Approval.Presented.data)(newest.data).id
    : undefined
  const verdict = verifyGovernedTask({ request: input.governed, decisions, newestPresentationID })
  if (verdict.status !== "APPROVED") return yield* denied(verdict.reason)
  const approved = decisions.find(
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
  if (!approved) return yield* denied("approved-decision-missing")
  const consumed = yield* rows(services.db, input.governed.sessionID, MaestroEvent.Approval.Consumed.type, 1)
  if (
    consumed.some((row) => {
      const data = Schema.decodeUnknownSync(MaestroEvent.Approval.Consumed.data)(row.data)
      return data.presentationID === approved.presentationID && data.taskHash === input.governed.taskHash
    })
  )
    return yield* denied("approval-consumed")
  const suffix = reservationHash(input.governed.sessionID, approved.presentationID, input.governed.taskHash)
  const childSessionID = SessionSchema.ID.make(`${CHILD_PREFIX}${suffix}`)
  if (input.taskID && input.taskID !== childSessionID) return yield* denied("reservation-child-mismatch")
  const reservation = {
    sessionID: input.governed.sessionID,
    presentationID: approved.presentationID,
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
    agent: input.target,
    permission: input.permission.map((rule) => ({ ...rule })),
  }
  const id = reservedID(suffix)
  const existing = yield* GovernanceRecordsV2.row(services.db, id)
  const permission = existing
    ? yield* replayed(services, existing, reservation)
    : yield* services.events.publish(MaestroEvent.Approval.ReservedV2, reservation, { id }).pipe(
        Effect.as(reservation.permission),
        // A concurrent call won the insert: the stored reservation decides.
        Effect.catchCause(() =>
          Effect.gen(function* () {
            const stored = yield* GovernanceRecordsV2.row(services.db, id)
            if (!stored) return yield* denied("reservation-hold")
            return yield* replayed(services, stored, reservation)
          }),
        ),
      )
  const result = { childSessionID, presentationID: approved.presentationID, callID: input.callID, permission }
  const receipt = yield* GovernanceRecordsV2.row(services.db, consumedID(suffix))
  if (!receipt) return { ...result, replayReserved: false }
  const data = Schema.decodeUnknownSync(MaestroEvent.Approval.ConsumedV2.data)(receipt.data)
  if (
    data.sessionID !== input.governed.sessionID ||
    data.presentationID !== approved.presentationID ||
    data.approvalMessageID !== input.governed.approvalMessageID ||
    data.taskHash !== input.governed.taskHash ||
    data.callID !== input.callID ||
    data.childSessionID !== childSessionID
  )
    return yield* denied("receipt-binding-mismatch")
  if (!(yield* services.store.get(childSessionID))) return yield* denied("consumed-child-missing")
  return { ...result, replayReserved: true }
})

/**
 * Consume the approval a reserved child runs under, once, before its first provider turn. A repeat with the same
 * receipt is a no-op; a different stored receipt holds.
 */
export const consume = Effect.fn("GovernanceReservationV2.consume")(function* (
  services: Services,
  childSessionID: string,
) {
  const suffix = childSessionID.slice(CHILD_PREFIX.length)
  const stored = yield* GovernanceRecordsV2.row(services.db, reservedID(suffix))
  if (!stored || stored.type !== EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2))
    return yield* denied("reservation-hold")
  const reservation = Schema.decodeUnknownSync(MaestroEvent.Approval.ReservedV2.data)(stored.data)
  if (reservation.childSessionID !== childSessionID) return yield* denied("reservation-child-mismatch")
  const id = consumedID(suffix)
  const receipt = {
    sessionID: reservation.sessionID,
    presentationID: reservation.presentationID,
    approvalMessageID: reservation.approvalMessageID,
    taskHash: reservation.taskHash,
    callID: reservation.callID,
    childSessionID: reservation.childSessionID,
  }
  const existing = yield* GovernanceRecordsV2.row(services.db, id)
  if (existing) return yield* sameReceipt(existing, receipt)
  yield* services.events.publish(MaestroEvent.Approval.ConsumedV2, receipt, { id }).pipe(
    Effect.catchCause(() =>
      Effect.gen(function* () {
        const raced = yield* GovernanceRecordsV2.row(services.db, id)
        if (!raced) return yield* denied("receipt-hold")
        return yield* sameReceipt(raced, receipt)
      }),
    ),
  )
})

function denied(reason: string) {
  return new ToolFailure({ message: `Governed Task denied: ${reason}` })
}

function reservationHash(sessionID: string, presentationID: string, hash: string) {
  return createHash("sha256").update([sessionID, presentationID, hash].join("\u0000")).digest("hex")
}

function reservedID(suffix: string) {
  return EventV2.ID.make(`evt_maestro_approval_reserved_${suffix}`)
}

function consumedID(suffix: string) {
  return EventV2.ID.make(`evt_maestro_approval_consumed_${suffix}`)
}

const rows = Effect.fnUntraced(function* (db: Services["db"], sessionID: string, type: string, version: number) {
  return yield* db
    .select({ data: EventV2.EventTable.data })
    .from(EventV2.EventTable)
    .where(
      and(
        eq(EventV2.EventTable.aggregate_id, sessionID),
        eq(EventV2.EventTable.type, EventV2.versionedType(type, version)),
      ),
    )
    .orderBy(asc(EventV2.EventTable.seq))
    .all()
    .pipe(Effect.orDie)
})

const replayed = Effect.fnUntraced(function* (
  services: Services,
  event: { readonly type: string; readonly data: unknown },
  reservation: Schema.Schema.Type<typeof MaestroEvent.Approval.ReservedV2.data>,
) {
  if (event.type !== EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2))
    return yield* denied("reservation-missing-permission-snapshot")
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
    services.canonical(existing.agent) !== reservation.agent
  )
    return yield* denied("reservation-binding-mismatch")
  // The reservation binds the write roots; a replay that asks for others is refused, never widened.
  if (JSON.stringify(roots(existing.permission)) !== JSON.stringify(roots(reservation.permission)))
    return yield* denied("reservation-write-roots-mismatch")
  return existing.permission
})

function roots(permission: ReadonlyArray<GovernanceDispatchV2.Rule>) {
  return WriteRootsV2.read(
    permission.map((rule) => ({ action: rule.permission, resource: rule.pattern, effect: rule.action })),
  )
}

const sameReceipt = Effect.fnUntraced(function* (
  event: { readonly data: unknown },
  receipt: Schema.Schema.Type<typeof MaestroEvent.Approval.ConsumedV2.data>,
) {
  const existing = Schema.decodeUnknownSync(MaestroEvent.Approval.ConsumedV2.data)(event.data)
  if (
    existing.sessionID !== receipt.sessionID ||
    existing.presentationID !== receipt.presentationID ||
    existing.approvalMessageID !== receipt.approvalMessageID ||
    existing.taskHash !== receipt.taskHash ||
    existing.callID !== receipt.callID ||
    existing.childSessionID !== receipt.childSessionID
  )
    return yield* denied("receipt-binding-mismatch")
})
