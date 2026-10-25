export * as WorkflowRecordsV2 from "./records"

import { createHash } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import type { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import type { Event } from "@orchestra/schema/event"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import type { RelayArm } from "@orchestra/schema/relay-arm"
import { GovernanceRecordsV2 } from "../governance/records"
import { WorkflowGateV2 } from "../governance/workflow"
import { MaestroReviewRecords } from "../tools/review-records"

// V2 port of V1's durable workflow Task records (`apps/orchestra/src/maestro/workflow-binding.ts`): the binding a Task
// stored for its execution Session, a settlement that held for a code review, the grade of a held reply, and the move of
// an arm to the child that took it. Their ids are V1's, so a retried write records nothing new.

type Db = Database.Interface["db"]
type Services = { readonly db: Db; readonly events: EventV2.Interface }

/** The workflow binding stored for an execution Session, or undefined; a row that is not one holds. */
export const read = Effect.fn("WorkflowRecordsV2.read")(function* (db: Db, executionSessionID: string) {
  const found = yield* GovernanceRecordsV2.row(db, WorkflowGateV2.eventID(executionSessionID))
  if (!found) return undefined
  const bound =
    found.type === EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1)
      ? Option.getOrUndefined(Schema.decodeUnknownOption(MaestroEvent.Task.WorkflowBound.data)(found.data))
      : undefined
  if (!bound || bound.executionSessionID !== executionSessionID || bound.binding.executionSessionID !== executionSessionID)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
  return bound
})

/** Records that one settlement held for a code review before the arm graded it; the same reply at the same position records once. */
export const recordReviewHeld = Effect.fn("WorkflowRecordsV2.recordReviewHeld")(function* (
  services: Services,
  input: { readonly executionSessionID: string; readonly token: RelayArm.Token; readonly settlement: RelayArm.WorkflowSettlement },
) {
  const expected = input.settlement.expected
  yield* write(
    services,
    MaestroEvent.Task.WorkflowReviewHeld,
    {
      executionSessionID: input.executionSessionID,
      token: input.token,
      assistantMessageID: input.settlement.assistantMessageID,
      expected,
    },
    `evt_maestro_workflow_review_held_${digest([input.executionSessionID, input.token, input.settlement.assistantMessageID, expected.position, expected.attempt, expected.ledgerSeq])}`,
  )
})

/** Records that a code review graded the held reply, leaving the step at `expected`; one record per step attempt. */
export const recordReviewFindings = Effect.fn("WorkflowRecordsV2.recordReviewFindings")(function* (
  services: Services,
  input: Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowReviewFindings.data>,
) {
  yield* write(
    services,
    MaestroEvent.Task.WorkflowReviewFindings,
    input,
    `evt_maestro_workflow_review_findings_${digest([input.executionSessionID, input.token, input.expected.position, input.expected.attempt, input.expected.ledgerSeq])}`,
  )
})

/** Records that an arm moved from an execution Session that never ran a provider turn to the child that took it. */
export const recordMove = Effect.fn("WorkflowRecordsV2.recordMove")(function* (
  services: Services,
  input: Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowRebound.data>,
) {
  yield* write(
    services,
    MaestroEvent.Task.WorkflowRebound,
    input,
    `evt_maestro_workflow_rebound_${digest([input.token, input.from, input.executionSessionID])}`,
  )
})

/** The execution Session's held settlements, newest first. */
export const reviewHolds = Effect.fn("WorkflowRecordsV2.reviewHolds")(function* (db: Db, executionSessionID: string) {
  return (yield* rows(db, executionSessionID, MaestroEvent.Task.WorkflowReviewHeld.type)).flatMap((data) =>
    Option.toArray(Schema.decodeUnknownOption(MaestroEvent.Task.WorkflowReviewHeld.data)(data)),
  )
})

/** The execution Session's graded holds, newest first. */
export const findingsRecords = Effect.fn("WorkflowRecordsV2.findingsRecords")(function* (db: Db, executionSessionID: string) {
  return (yield* rows(db, executionSessionID, MaestroEvent.Task.WorkflowReviewFindings.type)).flatMap((data) =>
    Option.toArray(Schema.decodeUnknownOption(MaestroEvent.Task.WorkflowReviewFindings.data)(data)),
  )
})

/** The review the newest grade of this step names: its findings ride every later attempt until a new review decides. */
export const graded = Effect.fn("WorkflowRecordsV2.graded")(function* (
  db: Db,
  input: { readonly executionSessionID: string; readonly token: RelayArm.Token; readonly position: string },
) {
  return (yield* findingsRecords(db, input.executionSessionID)).find(
    (record) => record.token === input.token && record.expected.position === input.position,
  )?.reviewID
})

/** A code-stage review receipt by id, or undefined when the id names none. */
export const review = Effect.fn("WorkflowRecordsV2.review")(function* (db: Db, reviewID: string) {
  const found = yield* GovernanceRecordsV2.row(db, reviewID)
  if (!found || found.type !== EventV2.versionedType(MaestroEvent.Review.ReceivedV2.type, 2)) return undefined
  return Option.getOrUndefined(Schema.decodeUnknownOption(MaestroEvent.Review.ReceivedV2.data)(found.data))
})

/**
 * The findings of the code review that graded an earlier attempt at this step, as the text that rides after the step's
 * own instructions; undefined while no review that did not approve graded it.
 */
export const stepFindings = Effect.fn("WorkflowRecordsV2.stepFindings")(function* (
  db: Db,
  input: { readonly executionSessionID: string; readonly token: RelayArm.Token; readonly position: string },
) {
  const reviewID = yield* graded(db, input)
  const found = reviewID ? yield* review(db, reviewID) : undefined
  if (!found || found.stage !== "code" || found.verdict === "APPROVE") return undefined
  return [
    `Orchestra's code review of an earlier attempt at this step is ${found.verdict} (${reviewID}). Fix the defects its findings describe in this attempt, inside the approved writePaths, and leave the result uncommitted; the new result is reviewed again.`,
    ...MaestroReviewRecords.renderFindings(found.findings),
  ].join("\n")
})

// A write that loses a race to the same id still holds the record; only a record that is still absent fails.
const write = <D extends Event.Definition>(services: Services, definition: D, data: Event.Data<D>, id: string) =>
  Effect.gen(function* () {
    if (yield* GovernanceRecordsV2.row(services.db, id)) return
    yield* services.events.publish(definition, data, { id: EventV2.ID.make(id) }).pipe(
      Effect.catchCause((cause) =>
        GovernanceRecordsV2.row(services.db, id).pipe(Effect.flatMap((row) => (row ? Effect.void : Effect.failCause(cause)))),
      ),
    )
  })

const rows = (db: Db, executionSessionID: string, type: string) =>
  db
    .select({ data: EventV2.EventTable.data })
    .from(EventV2.EventTable)
    .where(and(eq(EventV2.EventTable.aggregate_id, executionSessionID), eq(EventV2.EventTable.type, EventV2.versionedType(type, 1))))
    .orderBy(desc(EventV2.EventTable.seq))
    .limit(1024)
    .all()
    .pipe(
      Effect.orDie,
      Effect.map((found) => found.map((row) => row.data)),
    )

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
