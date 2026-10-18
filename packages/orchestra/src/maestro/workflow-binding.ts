export * as WorkflowBinding from "./workflow-binding"

import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Context, Effect, FileSystem, Option, Schema } from "effect"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { RelayArm } from "@orchestra/schema/relay-arm"
import type { RelaySprint } from "@orchestra/schema/relay-sprint"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { Event } from "@orchestra/schema/event"
import { ProjectID } from "@orchestra/schema/project-id"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { Relay } from "@orchestra/core/relay"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { MessageTable, PartTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { SessionMessage } from "@orchestra/schema/session-message"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { MessageID, SessionID } from "@/session/schema"
import { MessageV2 } from "@/session/message-v2"
import { LogicalTask } from "./logical-task"
import { SessionAuthority } from "./session-authority"
import { WriteRoots } from "./write-roots"
import { readWorkflowRevision } from "./plan-revision"
import { ToolSafety } from "@orchestra/core/tool-safety"
import type { Agent } from "@/agent/agent"
import type { ArsenalCompletion } from "./arsenal-completion"
import { canonicalMemberId } from "./roster"
import { readAuthorization } from "./authorization"
import { childSessionID } from "./dispatch"
import { readReview, readValidation } from "./validation-record"
import { CodeReview } from "./code-review"

// Selection is a reference, never model-supplied binding/attribution/approval. The host acquires every bound byte.
export const Selection = Schema.Struct({ documentID: Schema.NonEmptyString, planRevisionID: Event.ID,
  parameters: Schema.Record(Schema.String, Schema.String) })
export type Selection = typeof Selection.Type

export interface Dispatch {
  readonly sessionID: string
  readonly taskID: string
  readonly callID: string
  readonly assistantMessageID: string
  readonly directory: string
  readonly projectID: string
  readonly logicalTaskID: string
  readonly writePaths: readonly string[]
  readonly subagentType: string
  readonly prompt: string
  readonly model?: string
  readonly workflow: Selection
}

export interface Host {
  readonly publication: (placement: { directory: string; projectID: ProjectID }) =>
    Effect.Effect<RelayWorkflowBinding.PublicationPort, RelayWorkflowBinding.Held>
  // Exact reviewed upstream verifier, referenced by persisted V3 Event.ID. DTO decoding cannot fulfill this port.
  readonly verifyUpstream: (planRevisionID: Event.ID) => Effect.Effect<void, RelayWorkflowBinding.Held>
  // Existing direct-owner/native lifecycle, including current revision/context and exact extended Task hash payload.
   readonly approve: (input: Omit<Dispatch, "taskID" | "logicalTaskID">, definition: RelayArm.WorkflowDefinition,
     phase: "dispatch" | "continuation") => Effect.Effect<void, RelayWorkflowBinding.Held>
  // Full chain, global acceptance and cold review, from existing native host evidence. Local worker done grants none.
  readonly complete: (binding: RelayArm.WorkflowBinding) => Effect.Effect<void, RelayWorkflowBinding.Held>
}
export const NativeHost = Context.Reference<Host | undefined>("@orchestra/WorkflowBinding/Host", { defaultValue: () => undefined })

/** Global acceptance a workflow Task requires: the last work package carries these host checks. */
export const GLOBAL_ACCEPTANCE = ["package-verification", "cold-review"]

/** What the host attaches to every workflow plan as it materializes it, so the plan the owner approves carries them. */
export const ACCEPTANCE_CONTROLS = GLOBAL_ACCEPTANCE.map((name) => ({ id: name, host_check: name }))

export function accepts(sprint: RelaySprint.Sprint) {
  return GLOBAL_ACCEPTANCE.every((name) => sprint.work_packages.at(-1)?.checklist?.some((control) => control.host_check === name))
}

/** The plan's global acceptance checks as the completion contract arms them: same id and host check. */
export function acceptance(sprint: RelaySprint.Sprint) {
  return (sprint.work_packages.at(-1)?.checklist ?? []).flatMap((control) =>
    control.host_check && GLOBAL_ACCEPTANCE.includes(control.host_check) ? [{ id: control.id, hostCheck: control.host_check }] : [])
}

export const beforeTask = Effect.fn("WorkflowBinding.beforeTask")(function* (input: Omit<Dispatch, "taskID" | "logicalTaskID">,
  phase: "dispatch" | "continuation" = "dispatch") {
  const host = yield* NativeHost
  if (!host) return yield* new RelayWorkflowBinding.Held({ reason: "UPSTREAM_ATTRIBUTION_MISSING" })
  const sessions = yield* Session.Service
  const parent = yield* sessions.get(SessionID.make(input.sessionID))
  if (parent.projectID !== input.projectID || parent.directory !== input.directory)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_LINEAGE_MISMATCH" })
   const call = yield* taskCall(parent.id, input.assistantMessageID, input.callID)
   const selected = yield* Schema.decodeUnknownEffect(Schema.Struct({ subagent_type: Schema.String, prompt: Schema.String,
     model: Schema.optional(Schema.String), writePaths: Schema.optional(Schema.Array(Schema.String)), workflow: Selection }))(call.input)
     .pipe(Effect.mapError(() => new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_CALL_MISMATCH" })))
   if (selected.subagent_type !== input.subagentType || selected.prompt !== input.prompt || selected.model !== input.model ||
     !isDeepStrictEqual(selected.writePaths ?? [], input.writePaths) || !isDeepStrictEqual(selected.workflow, input.workflow))
     return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_CALL_MISMATCH" })
  const revision = yield* readWorkflowRevision(input.workflow.planRevisionID)
  if (revision.sessionID !== parent.id || revision.workflowBinding.publication.projectID !== parent.projectID ||
    revision.workflowBinding.publication.documentID !== input.workflow.documentID)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_REVISION_MISMATCH" })
  if (!isDeepStrictEqual(revision.workflowBinding.parameters, input.workflow.parameters))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVED_SCOPE_MISMATCH",
      detail: `Plan revision ${revision.id} approved workflow parameters ${JSON.stringify(revision.workflowBinding.parameters)}; this Task passed ${JSON.stringify(input.workflow.parameters)}. Retry with exactly the approved parameters.` })
  if (!isDeepStrictEqual(revision.workflowBinding.writePaths, input.writePaths))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVED_SCOPE_MISMATCH",
      detail: `Plan revision ${revision.id} approved writePaths ${JSON.stringify(revision.workflowBinding.writePaths)}; this Task passed ${JSON.stringify(input.writePaths)}. Retry with exactly the approved writePaths, in the same order.` })
  const port = yield* host.publication({ directory: parent.directory, projectID: ProjectID.make(parent.projectID) })
  const materialized = yield* RelayWorkflowBinding.revalidate(port, revision.workflowBinding)
  yield* host.verifyUpstream(input.workflow.planRevisionID)
   yield* host.approve(input, materialized.definition, phase)
  return { host, port, materialized, revision, parent }
})

export const prepare = Effect.fn("WorkflowBinding.prepare")(function* (input: Dispatch, phase: "dispatch" | "continuation" = "dispatch") {
   const ready = yield* beforeTask(input, phase)
  const sessions = yield* Session.Service
  const child = yield* sessions.get(SessionID.make(input.taskID))
  const logical = yield* LogicalTask.read(child.id)
  if (child.projectID !== ready.parent.projectID || child.directory !== ready.parent.directory || child.parentID !== ready.parent.id)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_LINEAGE_MISMATCH" })
  const authority = yield* SessionAuthority.make(sessions.get)(ready.parent.id, ready.parent.projectID).pipe(
    Effect.mapError(() => new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_LINEAGE_MISMATCH" })),
  )
  if (!logical || logical.taskId !== input.logicalTaskID || logical.executionSessionID !== child.id ||
    logical.authoritySessionID !== authority.rootID || logical.projectID !== ready.parent.projectID || logical.memberID !== child.agent)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_LOGICAL_TASK_MISMATCH" })
   const approvedRoots = WriteRoots.read(yield* WriteRoots.bind(child.agent ?? input.subagentType,
     input.writePaths, child.permission ?? []))
   if (!approvedRoots || !isDeepStrictEqual(WriteRoots.read(child.permission), approvedRoots))
     return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVED_SCOPE_MISMATCH" })
   const database = yield* Database.Service
   const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, ready.parent.id))
     .all().pipe(Effect.orDie)
   const reservations = rows.filter((row) => row.data.childSessionID === child.id &&
     (row.type === EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2) ||
       row.type === EventV2.versionedType(MaestroEvent.Dispatch.ReservedV2.type, 2)))
   if (reservations.length !== 1)
     return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVAL_RESERVATION_MISSING" })
   const reserved = reservations[0].type === EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2)
     ? Schema.decodeUnknownSync(MaestroEvent.Approval.ReservedV2.data)(reservations[0].data)
     : Schema.decodeUnknownSync(MaestroEvent.Dispatch.ReservedV2.data)(reservations[0].data)
   if (reserved.projectID !== child.projectID || reserved.sessionID !== ready.parent.id ||
     !isDeepStrictEqual(reserved.permission, child.permission ?? []))
     return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVED_SCOPE_MISMATCH" })
  const binding = Schema.decodeUnknownSync(RelayArm.WorkflowBinding)({
    definition: ready.materialized.definition, planRevisionID: ready.revision.id,
    // Publication/reservation authority is the actual caller; logical root scope is checked separately above.
    executionSessionID: child.id, authoritySessionID: ready.parent.id, logicalTaskID: logical.taskId,
  })
  return { binding, ...ready }
})

export const taskCall = Effect.fn("WorkflowBinding.taskCall")(function* (sessionID: string, messageID: string, callID: string) {
  const database = yield* Database.Service
  const modern = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id,
    SessionMessage.ID.make(messageID))).get().pipe(Effect.orDie)
  if (modern) {
    const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...modern.data, id: modern.id, type: modern.type })
    if (modern.session_id !== sessionID || message.type !== "assistant" || message.agent !== "maestro")
      return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_CALL_MISMATCH" })
    const calls = message.content.filter((part) => part.type === "tool" && part.id === callID)
    if (calls.length !== 1 || calls[0].type !== "tool" || calls[0].name !== "task" || calls[0].provider?.executed)
      return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_CALL_MISMATCH" })
    return { input: calls[0].state.input }
  }
  const message = yield* MessageV2.get({ sessionID: SessionID.make(sessionID), messageID: MessageID.make(messageID) })
  const calls = message.parts.filter((part) => part.type === "tool" && part.callID === callID)
  if (message.info.role !== "assistant" || message.info.agent !== "maestro" || calls.length !== 1 ||
    calls[0].type !== "tool" || calls[0].tool !== "task" || calls[0].metadata?.providerExecuted)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_CALL_MISMATCH" })
  return { input: calls[0].state.input }
})

export const adopt = Effect.fn("WorkflowBinding.adopt")(function* (input: {
  readonly dispatch: Dispatch
  readonly token: RelayArm.Token
  readonly relay: Relay.Interface
  readonly globalChecks: readonly { readonly id: string; readonly hostCheck: string }[]
  readonly availableChecks: ReadonlySet<string>
}) {
   const existing = yield* read(input.dispatch.taskID)
   const ready = yield* prepare(input.dispatch, existing ? "continuation" : "dispatch")
  const context = yield* Effect.context<Database.Service | Session.Service | EventV2Bridge.Service | FileSystem.FileSystem>()
  const controls = ready.materialized.sprint.work_packages.flatMap((wp) => wp.checklist ?? [])
   if (!input.globalChecks.length || !accepts(ready.materialized.sprint) ||
     input.globalChecks.some((check) =>
    !controls.some((control) => control.id === check.id && control.host_check === check.hostCheck)))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_GLOBAL_ACCEPTANCE_MISSING",
      detail: `The approved plan's last step carries ${JSON.stringify(acceptance(ready.materialized.sprint))}; the armed contract checks ${JSON.stringify(input.globalChecks)} must be among them.` })
  if (controls.some((control) => control.host_check && !input.availableChecks.has(control.host_check)))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_CHECK_UNBOUND" })
  if (existing && (!isDeepStrictEqual(existing.binding, ready.binding) || existing.token !== input.token))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
  const arm = { token: input.token, sprint: ready.materialized.sprint, agentID: ready.binding.executionSessionID,
    meta: { workdir: input.dispatch.directory, token: input.token,
      project_id: input.dispatch.projectID, session_id: ready.binding.executionSessionID, workflow: ready.binding } }
  // An arm already bound to another child moves here only when that child never ran (moveArm); a child that ran keeps
  // it, and this dispatch holds before the Task tool consumes anything.
  if (!existing) yield* input.relay.create(arm).pipe(
    Effect.catchIf((error) => error._tag === "ArmCreate.Conflict", () => Effect.succeed("conflict" as const)),
    Effect.flatMap((created) => created === "created" ? Effect.void
      : moveArm({ ...input, arm, conflict: created === "conflict" })),
    Effect.mapError((error) => error instanceof RelayWorkflowBinding.Held ? error
      : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_BINDING_MISMATCH" })),
  )
  if (!existing) {
    const events = yield* EventV2Bridge.Service
    yield* events.publish(MaestroEvent.Task.WorkflowBound, { executionSessionID: ready.binding.executionSessionID,
      token: input.token, binding: ready.binding, authorityMessageID: SessionMessage.ID.make(input.dispatch.assistantMessageID),
      authorityCallID: input.dispatch.callID }, { id: eventID(ready.binding.executionSessionID) }).pipe(
      Effect.catchCause((cause) => Effect.gen(function* () {
        const stored = yield* read(ready.binding.executionSessionID)
        if (!stored) return yield* Effect.failCause(cause)
        if (stored.token !== input.token || !isDeepStrictEqual(stored.binding, ready.binding))
          return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
      })),
    )
  }
  const view = yield* input.relay.currentStep(input.token, ready.binding)
  if (view.state === "awaiting-human" && !view.pending)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_PARKED" })
  return { ...ready, token: input.token, relay: input.relay, dispatch: input.dispatch, view,
    verifySettlement: (assistantMessageID: string) => Effect.gen(function* () {
      const database = yield* Database.Service
      const modern = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id,
        SessionMessage.ID.make(assistantMessageID))).get().pipe(Effect.orDie)
      if (modern) {
        const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...modern.data, id: modern.id, type: modern.type })
        if (modern.session_id !== ready.binding.executionSessionID || message.type !== "assistant" || message.error ||
          message.time.completed === undefined || !message.finish || ["unknown", "error", "content-filter"].includes(message.finish) ||
          message.content.some((part) => part.type === "tool" && part.state.status !== "completed"))
          return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ASSISTANT_NOT_SETTLED" })
        return
      }
      const message = yield* MessageV2.get({ sessionID: ready.binding.executionSessionID,
        messageID: MessageID.make(assistantMessageID) })
      if (message.info.role !== "assistant" || message.info.error || message.info.time.completed === undefined || !message.info.finish ||
        ["unknown", "error", "content-filter"].includes(message.info.finish) ||
        message.parts.some((part) => part.type === "tool" && part.state.status !== "completed"))
        return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ASSISTANT_NOT_SETTLED" })
    }).pipe(Effect.provide(context), Effect.mapError((error) => error instanceof RelayWorkflowBinding.Held ? error
      : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ASSISTANT_NOT_SETTLED" }))),
    recordReviewHeld: (settlement: RelayArm.WorkflowSettlement) => recordReviewHeld({
      executionSessionID: ready.binding.executionSessionID, token: input.token,
      assistantMessageID: settlement.assistantMessageID, expected: settlement.expected,
    }).pipe(Effect.provide(context)),
    readReview: (id: string) => readReview(id).pipe(Effect.provide(context)),
    recordReviewFindings: (reviewID: string, settlement: RelayArm.WorkflowSettlement, expected: RelayArm.WorkflowPosition) =>
      recordReviewFindings({ executionSessionID: ready.binding.executionSessionID, token: input.token, reviewID,
        assistantMessageID: settlement.assistantMessageID, expected }).pipe(Effect.provide(context)),
    gradedReview: (position: string) => latestFindings({ executionSessionID: ready.binding.executionSessionID,
      token: input.token, position }).pipe(Effect.map((record) => record?.reviewID), Effect.provide(context)),
    stepFindings: (position: string) => stepFindings({
      executionSessionID: ready.binding.executionSessionID, token: input.token, position,
    }).pipe(Effect.provide(context)),
    revalidate: () => prepare(input.dispatch, "continuation").pipe(Effect.flatMap((current) =>
      isDeepStrictEqual(current.binding, ready.binding) ? Effect.void
        : Effect.fail(new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" }))),
      Effect.provide(context), Effect.mapError((error) => error instanceof RelayWorkflowBinding.Held ? error
        : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_BINDING_ACQUISITION" }))),
  }
})

/**
 * Moves the arm to `input.arm`'s child when the child it is bound to never ran. A dispatch can hold after its binding
 * and before its child's first provider turn (a pre-model check, a crash), leaving the content-addressed arm bound to
 * a child that did nothing; the identical re-arm returns the same token, so only a move frees it.
 *
 * The guarantee is the holder check at every turn, not this one: every provider turn of a bound child reads its step
 * first (RelayWorkflowSession.current), and RelayWorkflowCurrentStep.read refuses a child that is not the arm's holder,
 * so a child the arm moved away from, in any process or on any later wake, never calls the model again on it.
 * ranProviderTurn is only the best-effort courtesy of not taking the arm from a child that produced output or runs in
 * this process now: no reply of that child carries a finish or any part (the prompt loop persists an empty reply before
 * the pre-model check, so a reply's existence proves nothing), no code-review hold was recorded for it, and Activity
 * says it is not running. Relay then moves the arm only if it graded nothing and is held by that child (ArmCreate.rebind).
 *
 * Moves only go forward: a child moved from never takes the arm again. Each move is recorded as WorkflowRebound on the
 * child that took the arm; the old child's WorkflowBound stays. The arm's `agent_id` is the holder, and `records` reads
 * the holder Orchestra recorded. They differ only when a move stopped between Relay and its record, so every dispatch
 * that reaches here records that move first, as its `recoveredBy`. A retry of the same authorization reaches the same
 * child (Dispatch.childSessionID), finds the arm already its own (`create` is unchanged) and only records it; another
 * authorization records it, then moves the arm on.
 */
const moveArm = Effect.fn("WorkflowBinding.moveArm")(function* (input: {
  readonly token: RelayArm.Token
  readonly relay: Relay.Interface
  readonly dispatch: Dispatch
  readonly arm: Omit<Parameters<Relay.Interface["rebind"]>[0], "from">
  readonly conflict: boolean
}) {
  const held = Option.getOrUndefined(yield* input.relay.holder(input.token))
  const recorded = yield* records(input.token)
  if (held && recorded.holder && held !== recorded.holder && !recorded.movedFrom.has(held))
    yield* recordMove({ ...input, from: recorded.holder, to: held, recovered: true })
  if (!input.conflict) return
  if (!held || held === input.arm.agentID || recorded.movedFrom.has(input.arm.agentID))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_BINDING_MISMATCH" })
  if (yield* ranProviderTurn(held))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_BINDING_MISMATCH",
      detail: `This arm is bound to Task session ${held}, which ran or is running. Arm a new contract for this Task.` })
  yield* input.relay.rebind({ ...input.arm, from: held })
  yield* recordMove({ ...input, from: held, to: input.arm.agentID, recovered: false })
})

/**
 * Whether an execution Session runs in this process right now. The Task tool provides it from the child's background
 * job and Session status; without it every child counts as running, so no arm moves.
 */
export const Activity = Context.Reference<(executionSessionID: string) => Effect.Effect<boolean>>(
  "@orchestra/WorkflowBinding/Activity", { defaultValue: () => () => Effect.succeed(true) })

/**
 * The token's bindings and moves. Since a child moved from never takes the arm again, the holder Orchestra recorded is
 * the single child bound or moved to that was never moved from; anything else is no recorded holder.
 */
const records = Effect.fn("WorkflowBinding.records")(function* (token: string) {
  const database = yield* Database.Service
  const rows = yield* database.db.select({ data: EventTable.data }).from(EventTable).where(and(
    inArray(EventTable.type, [EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1),
      EventV2.versionedType(MaestroEvent.Task.WorkflowRebound.type, 1)]),
    sql`json_extract(${EventTable.data}, '$.token') = ${token}`,
  )).all().pipe(Effect.orDie)
  const decoded = rows.flatMap((row) => Option.toArray(Schema.decodeUnknownOption(Schema.Struct({
    executionSessionID: Schema.String, from: Schema.optional(Schema.String) }))(row.data)))
  const movedFrom = new Set(decoded.flatMap((record) => record.from === undefined ? [] : [record.from]))
  const holders = [...new Set(decoded.map((record) => record.executionSessionID))].filter((id) => !movedFrom.has(id))
  return { holder: holders.length === 1 ? holders[0] : undefined, movedFrom }
})

// `recovered`: this call records a move it did not make, so it is named as the recorder, not as the mover.
const recordMove = Effect.fn("WorkflowBinding.recordMove")(function* (input: {
  readonly token: RelayArm.Token
  readonly dispatch: Dispatch
  readonly from: string
  readonly to: string
  readonly recovered: boolean
}) {
  const database = yield* Database.Service
  const id = EventV2.ID.make(`evt_maestro_workflow_rebound_${createHash("sha256")
    .update(JSON.stringify([input.token, input.from, input.to])).digest("hex")}`)
  const stored = database.db.select({ id: EventTable.id }).from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
  if (yield* stored) return
  const authority = { authorityMessageID: SessionMessage.ID.make(input.dispatch.assistantMessageID),
    authorityCallID: input.dispatch.callID }
  const events = yield* EventV2Bridge.Service
  yield* events.publish(MaestroEvent.Task.WorkflowRebound, { executionSessionID: SessionID.make(input.to),
    from: SessionID.make(input.from), token: input.token, ...(input.recovered ? { recoveredBy: authority } : authority) },
  { id }).pipe(Effect.catchCause((cause) => stored.pipe(Effect.flatMap((found) => found ? Effect.void : Effect.failCause(cause)))))
})

const ranProviderTurn = Effect.fn("WorkflowBinding.ranProviderTurn")(function* (executionSessionID: string) {
  const running = yield* Activity
  if (yield* running(executionSessionID)) return true
  if ((yield* reviewHolds(executionSessionID)).length > 0) return true
  if ((yield* MessageV2.stream(SessionID.make(executionSessionID))).some((message) =>
    message.info.role === "assistant" && (message.info.finish !== undefined || message.parts.length > 0))) return true
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(SessionMessageTable).where(and(
    eq(SessionMessageTable.session_id, SessionID.make(executionSessionID)), eq(SessionMessageTable.type, "assistant"),
  )).all().pipe(Effect.orDie)
  // An undecodable reply counts as a run: the move must never be the guess.
  return rows.some((row) => Option.match(Schema.decodeUnknownOption(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type }), {
    onNone: () => true,
    onSome: (message) => message.type !== "assistant" || message.finish !== undefined || message.content.length > 0,
  }))
})

/**
 * A workflow Task call continues only when it resumes, by task_id, the child its own authorization reserved under this
 * parent, and that child carries the workflow binding. Every other call is a dispatch.
 */
export function phaseFor(input: {
  readonly parentSessionID: string
  readonly authorizationID?: string
  readonly resumed?: { readonly id: string; readonly parentID?: string }
  readonly bound?: { readonly executionSessionID: string }
}) {
  if (!input.authorizationID || !input.resumed || !input.bound) return "dispatch" as const
  if (input.resumed.id !== childSessionID(input.authorizationID) || input.resumed.parentID !== input.parentSessionID ||
    input.bound.executionSessionID !== input.resumed.id) return "dispatch" as const
  return "continuation" as const
}

/**
 * An authorized resume continues the reserved child's current workflow step, instead of replaying the child, only when
 * all of these hold; any other resume replays strictly:
 * (a) the resumed child is the one this authorization reserved, and it carries the workflow binding;
 * (b) the arm is active: not complete, not parked or escalated, and holds no pending settlement;
 * (c) the child's newest reply settled the current step and held for a code review before the arm graded it, so the
 *     durable hold record still names the current position, attempt and ledger sequence: no ledger entry was spent
 *     ("held"); or the authorized resume already graded that reply for a FIX_FIRST and the child has not replied since,
 *     so the findings record names the current position, attempt and ledger sequence ("graded": run, do not grade);
 * (d) the call passed the workflow approval in the continuation phase (the exact approved Task input);
 * (e) no run of the child is still going: its background job, if any, is not running. The held run's own job ended in
 *     an error, so only a running job (a continuation already under way) refuses; a second prompt would extend it.
 * The continuation settles the current step again through the same host, which re-runs the cold review against the
 * working tree; a tree that changed after the review needs a review again.
 */
export function continuesHeldStep(input: {
  readonly reservedID?: string
  readonly resumedID?: string
  readonly bound?: { readonly executionSessionID: string; readonly token: string }
  readonly view?: RelayArm.WorkflowPosition & { readonly state: RelayArm.State; readonly pending?: unknown }
  readonly held: readonly Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowReviewHeld.data>[]
  readonly graded?: readonly Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowReviewFindings.data>[]
  readonly lastAssistantID?: string
  readonly phase: "dispatch" | "continuation"
  readonly job?: { readonly status: string }
}) {
  const bound = input.bound
  if (!input.reservedID || !bound || input.resumedID !== input.reservedID || bound.executionSessionID !== input.reservedID)
    return false
  if (input.job?.status === "running") return false
  const view = input.view
  if (!view || view.pending !== undefined || view.state !== "active") return false
  const last = input.lastAssistantID
  const current = (record: { executionSessionID: string; token: string; assistantMessageID: string;
    expected: RelayArm.WorkflowPosition }) => record.executionSessionID === bound.executionSessionID &&
    record.token === bound.token && record.assistantMessageID === last && record.expected.position === view.position &&
    record.expected.attempt === view.attempt && record.expected.ledgerSeq === view.ledgerSeq
  const matched = !last ? undefined : input.held.some(current) ? "held" as const
    : (input.graded ?? []).some(current) ? "graded" as const : undefined
  if (!matched || input.phase !== "continuation") return false
  return matched
}

/**
 * The Task tool's read of `continuesHeldStep` for an authorized workflow resume of its reserved child: when it
 * continues, the held settlement (the newest reply at the current position) and whether a resume already graded it;
 * otherwise undefined. Continuing reuses that child, its reservation and its arm: the approved prompt runs the workflow
 * loop again, which settles the current step through the same host and so runs its cold review again. Every other
 * resume keeps the strict replay.
 */
export const resumesHeldStep = Effect.fn("WorkflowBinding.resumesHeldStep")(function* (input: {
  readonly reservedID: SessionID
  readonly resumedID?: string
  readonly view?: RelayArm.WorkflowPosition & { readonly state: RelayArm.State; readonly pending?: unknown }
  readonly phase: "dispatch" | "continuation"
  readonly job?: { readonly status: string }
}) {
  // Newest first. MessageV2.stream reads the legacy message table only: a child run by the V2 runner has no reply there,
  // so (c) fails and it keeps the strict replay.
  const lastAssistantID = (yield* MessageV2.stream(input.reservedID)).find((message) => message.info.role === "assistant")?.info.id
  const view = input.view
  const matched = view && lastAssistantID ? continuesHeldStep({ ...input, bound: yield* read(input.reservedID),
    held: yield* reviewHolds(input.reservedID), graded: yield* findingsRecords(input.reservedID), lastAssistantID }) : false
  if (!matched || !view || !lastAssistantID) return undefined
  return { graded: matched === "graded", settlement: { assistantMessageID: SessionMessage.ID.make(lastAssistantID),
    expected: { position: view.position, attempt: view.attempt, ledgerSeq: view.ledgerSeq } } satisfies RelayArm.WorkflowSettlement }
})

/**
 * Records that one settlement held for a code review before the arm graded it. The record is keyed by the reply and
 * its expected position, so settling the same reply at the same position again records nothing new.
 */
export const recordReviewHeld = Effect.fn("WorkflowBinding.recordReviewHeld")(function* (
  data: Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowReviewHeld.data>,
) {
  const id = reviewHeldID(data)
  const database = yield* Database.Service
  const stored = database.db.select({ id: EventTable.id }).from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
  if (yield* stored) return
  const events = yield* EventV2Bridge.Service
  // A concurrent settle of the same reply may write the same ID first; that row is this record, so the caller still
  // returns the review hold rather than a defect.
  yield* events.publish(MaestroEvent.Task.WorkflowReviewHeld, data, { id }).pipe(Effect.catchCause((cause) =>
    stored.pipe(Effect.flatMap((row) => row ? Effect.void : Effect.failCause(cause)))))
})

/** The code-review holds recorded for one workflow-bound execution Session, newest first (at most 1024). */
export const reviewHolds = Effect.fn("WorkflowBinding.reviewHolds")(function* (executionSessionID: string) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, executionSessionID),
    eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.WorkflowReviewHeld.type, 1))))
    .orderBy(desc(EventTable.seq)).limit(1024).all().pipe(Effect.orDie)
  return rows.flatMap((row) => Option.toArray(Schema.decodeUnknownOption(MaestroEvent.Task.WorkflowReviewHeld.data)(row.data)))
})

/**
 * Records that a code review which did not approve graded a held reply, leaving the step at `expected`. Keyed by that
 * position, so grading the same reply again (a replayed disposition) records nothing new.
 */
export const recordReviewFindings = Effect.fn("WorkflowBinding.recordReviewFindings")(function* (
  data: Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowReviewFindings.data>,
) {
  const id = reviewFindingsID({ ...data, view: data.expected })
  const database = yield* Database.Service
  const stored = database.db.select({ id: EventTable.id }).from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
  if (yield* stored) return
  const events = yield* EventV2Bridge.Service
  yield* events.publish(MaestroEvent.Task.WorkflowReviewFindings, data, { id }).pipe(Effect.catchCause((cause) =>
    stored.pipe(Effect.flatMap((row) => row ? Effect.void : Effect.failCause(cause)))))
})

/** The review-findings records of one workflow-bound execution Session, newest first (at most 1024). */
export const findingsRecords = Effect.fn("WorkflowBinding.findingsRecords")(function* (executionSessionID: string) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, executionSessionID),
    eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.WorkflowReviewFindings.type, 1))))
    .orderBy(desc(EventTable.seq)).limit(1024).all().pipe(Effect.orDie)
  return rows.flatMap((row) => Option.toArray(Schema.decodeUnknownOption(MaestroEvent.Task.WorkflowReviewFindings.data)(row.data)))
})

/** The newest grade of this arm's step at `position` by a review that did not approve, if any. */
const latestFindings = Effect.fn("WorkflowBinding.latestFindings")(function* (input: {
  readonly executionSessionID: string
  readonly token: string
  readonly position: string
}) {
  return (yield* findingsRecords(input.executionSessionID)).find((record) =>
    record.token === input.token && record.expected.position === input.position)
})

/**
 * The text every attempt of a step carries after its instructions once a code review that did not approve graded it:
 * a fixed host sentence, then the newest such review's recorded findings read from the durable receipt and quoted as data
 * (CodeReview.renderFindings), never the reviewer's free text. They ride each later attempt, also one whose result left
 * the reviewed tree unchanged, until a new review decides. Undefined for a step no such review graded.
 */
export const stepFindings = Effect.fn("WorkflowBinding.stepFindings")(function* (input: {
  readonly executionSessionID: string
  readonly token: string
  readonly position: string
}) {
  const record = yield* latestFindings(input)
  if (!record) return undefined
  const review = yield* readReview(record.reviewID)
  if (!review || review.stage !== "code" || review.verdict === "APPROVE") return undefined
  return [
    `Orchestra's code review of an earlier attempt at this step is ${review.verdict} (${review.id}). Fix the defects its findings describe in this attempt, inside the approved writePaths, and leave the result uncommitted; the new result is reviewed again.`,
    ...CodeReview.renderFindings(review.findings),
  ].join("\n")
})

export const read = Effect.fn("WorkflowBinding.read")(function* (executionSessionID: string) {
  const database = yield* Database.Service
  const row = yield* database.db.select().from(EventTable).where(eq(EventTable.id, eventID(executionSessionID))).get().pipe(Effect.orDie)
  if (!row) return
  if (row.type !== EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
  return yield* Schema.decodeUnknownEffect(MaestroEvent.Task.WorkflowBound.data)(row.data).pipe(
    Effect.mapError(() => new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })),
  )
})

/** Native reservation acquisition shared by dispatch and durable workflow reconstruction. */
export const approvedTask = Effect.fn("WorkflowBinding.approvedTask")(function* (input: ArsenalCompletion.Dispatch,
  deps: { database: Database.Interface; sessions: Session.Interface; agents: Agent.Interface;
    parent: (input: ArsenalCompletion.Dispatch) => Effect.Effect<Session.Info, ToolSafety.Denied> }) {
  const session = yield* deps.parent(input)
  const child = yield* deps.sessions.get(SessionID.make(input.taskID)).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "completion-native-child-missing" })),
  )
  if (child.parentID !== session.id || child.projectID !== session.projectID || child.directory !== session.directory)
    return yield* new ToolSafety.Denied({ reason: "completion-native-child-mismatch" })
  const calls = input.workflow ? [] : yield* deps.database.db.select({ data: PartTable.data }).from(PartTable)
    .innerJoin(MessageTable, and(eq(MessageTable.id, PartTable.message_id), eq(MessageTable.session_id, PartTable.session_id)))
    .where(and(eq(PartTable.session_id, session.id), sql`json_extract(${PartTable.data}, '$.callID') = ${input.callID}`,
      sql`json_extract(${MessageTable.data}, '$.role') = 'assistant'`)).limit(2).all().pipe(Effect.orDie)
  if (!input.workflow && calls.length !== 1)
    return yield* new ToolSafety.Denied({ reason: "completion-native-task-call-missing-or-ambiguous" })
  const call = Schema.decodeUnknownOption(Schema.Struct({ subagent_type: Schema.String }))(
    input.workflow ? (yield* taskCall(session.id, input.workflow.assistantMessageID, input.callID)).input
      : Schema.decodeUnknownSync(Schema.Struct({ type: Schema.Literal("tool"), tool: Schema.Literal("task"),
        state: Schema.Struct({ input: Schema.Unknown }) }))(calls[0].data).state.input,
  )
  if (Option.isNone(call)) return yield* new ToolSafety.Denied({ reason: "completion-native-task-call-invalid" })
  const actor = yield* deps.agents.get(call.value.subagent_type).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "completion-native-task-agent-missing" })),
  )
  if ((actor.id ?? actor.name) !== canonicalMemberId(child.agent))
    return yield* new ToolSafety.Denied({ reason: "completion-native-task-agent-mismatch" })
  const rows = yield* deps.database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, session.id))
    .orderBy(asc(EventTable.seq)).limit(4097).all().pipe(Effect.orDie)
  if (rows.length > 4096) return yield* new ToolSafety.Denied({ reason: "completion-authority-history-overflow" })
  const direct = rows.findLast((row) => row.type === EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2) &&
    row.data.childSessionID === child.id)
  if (direct) {
    const reserved = Schema.decodeUnknownSync(MaestroEvent.Approval.ReservedV2.data)(direct.data)
    if (reserved.callID !== input.callID || reserved.sessionID !== session.id || reserved.parentSessionID !== session.id ||
      reserved.projectID !== session.projectID || canonicalMemberId(reserved.agent) !== canonicalMemberId(child.agent) ||
      (input.planID !== undefined && reserved.planRevisionID !== input.planID) || !isDeepStrictEqual(reserved.permission, child.permission))
      return yield* new ToolSafety.Denied({ reason: "completion-approved-task-mismatch" })
    return { session, child, planID: reserved.planRevisionID, permission: reserved.permission }
  }
  const dispatch = rows.findLast((row) => row.type === EventV2.versionedType(MaestroEvent.Dispatch.ReservedV2.type, 2) &&
    row.data.childSessionID === child.id)
  if (dispatch) {
    const reserved = Schema.decodeUnknownSync(MaestroEvent.Dispatch.ReservedV2.data)(dispatch.data)
    const authorization = yield* readAuthorization(reserved.authorizationID)
    const validation = authorization ? yield* readValidation(authorization.validationRecordID) : undefined
    if (!authorization || !validation || validation.outcome !== "VALID" || validation.sessionID !== session.id ||
      validation.projectID !== session.projectID || reserved.sessionID !== session.id || reserved.projectID !== session.projectID ||
      canonicalMemberId(reserved.routedMemberID) !== canonicalMemberId(child.agent) || authorization.sessionID !== session.id ||
      authorization.projectID !== session.projectID || (input.planID !== undefined && validation.planRevisionID !== input.planID) ||
      !isDeepStrictEqual(reserved.permission, child.permission))
      return yield* new ToolSafety.Denied({ reason: "completion-authorization-mismatch" })
    return { session, child, planID: validation.planRevisionID, permission: reserved.permission }
  }
  if (input.planID) return yield* new ToolSafety.Denied({ reason: "completion-plan-authority-missing" })
  return { session, child, planID: undefined, permission: child.permission }
}, (effect, _input, deps) => effect.pipe(Effect.provideService(Database.Service, deps.database),
  Effect.mapError((error) => error instanceof ToolSafety.Denied ? error : new ToolSafety.Denied({
    reason: error instanceof RelayWorkflowBinding.Held ? error.reason : "completion-native-task-call-missing",
  }))))

function reviewHeldID(data: Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowReviewHeld.data>) {
  return EventV2.ID.make(`evt_maestro_workflow_review_held_${createHash("sha256").update(JSON.stringify([data.executionSessionID,
    data.token, data.assistantMessageID, data.expected.position, data.expected.attempt, data.expected.ledgerSeq])).digest("hex")}`)
}

function reviewFindingsID(input: { executionSessionID: string; token: string; view: RelayArm.WorkflowPosition }) {
  return EventV2.ID.make(`evt_maestro_workflow_review_findings_${createHash("sha256").update(JSON.stringify([input.executionSessionID,
    input.token, input.view.position, input.view.attempt, input.view.ledgerSeq])).digest("hex")}`)
}

function eventID(executionSessionID: string) {
  return EventV2.ID.make(`evt_maestro_workflow_bound_${createHash("sha256").update(executionSessionID).digest("hex")}`)
}
