export * as WorkflowBinding from "./workflow-binding"

import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Context, Effect, Schema } from "effect"
import { eq } from "drizzle-orm"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { Event } from "@orchestra/schema/event"
import { ProjectID } from "@orchestra/schema/project-id"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { Relay } from "@orchestra/core/relay"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { SessionMessageTable } from "@orchestra/core/session/sql"
import { SessionMessage } from "@orchestra/schema/session-message"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { MessageID, SessionID } from "@/session/schema"
import { MessageV2 } from "@/session/message-v2"
import { LogicalTask } from "./logical-task"
import { WriteRoots } from "./write-roots"
import { readWorkflowRevision } from "./plan-revision"

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
  if (!isDeepStrictEqual(revision.workflowBinding.parameters, input.workflow.parameters) ||
    !isDeepStrictEqual(revision.workflowBinding.writePaths, input.writePaths))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVED_SCOPE_MISMATCH" })
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
   if (!logical || logical.taskId !== input.logicalTaskID || logical.executionSessionID !== child.id ||
    logical.authoritySessionID !== ready.parent.id || logical.projectID !== ready.parent.projectID || logical.memberID !== child.agent)
     return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_LOGICAL_TASK_MISMATCH" })
   const approvedRoots = WriteRoots.read(yield* WriteRoots.bind(child.agent ?? input.subagentType,
     input.writePaths, child.permission ?? []))
   if (!approvedRoots || !isDeepStrictEqual(WriteRoots.read(child.permission), approvedRoots))
     return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVED_SCOPE_MISMATCH" })
  const binding = Schema.decodeUnknownSync(RelayArm.WorkflowBinding)({
    definition: ready.materialized.definition, planRevisionID: ready.revision.id,
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
  const context = yield* Effect.context<Database.Service | Session.Service | EventV2Bridge.Service>()
  const controls = ready.materialized.sprint.work_packages.flatMap((wp) => wp.checklist ?? [])
   if (!input.globalChecks.length || !["package-verification", "cold-review"].every((name) =>
     ready.materialized.sprint.work_packages.at(-1)?.checklist?.some((control) => control.host_check === name)) ||
     input.globalChecks.some((check) =>
    !controls.some((control) => control.id === check.id && control.host_check === check.hostCheck)))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_GLOBAL_ACCEPTANCE_MISSING" })
  if (controls.some((control) => control.host_check && !input.availableChecks.has(control.host_check)))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_CHECK_UNBOUND" })
  if (existing && (!isDeepStrictEqual(existing.binding, ready.binding) || existing.token !== input.token))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
  yield* input.relay.create({ token: input.token, sprint: ready.materialized.sprint,
    agentID: ready.binding.executionSessionID,
    meta: { workdir: input.dispatch.directory, token: input.token,
      project_id: input.dispatch.projectID, session_id: ready.binding.executionSessionID, workflow: ready.binding },
  }).pipe(Effect.mapError(() => new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_BINDING_MISMATCH" })))
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
    }).pipe(Effect.provide(context)),
    revalidate: () => prepare(input.dispatch, "continuation").pipe(Effect.flatMap((current) =>
      isDeepStrictEqual(current.binding, ready.binding) ? Effect.void
        : Effect.fail(new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" }))),
      Effect.provide(context)),
  }
})

export const read = Effect.fn("WorkflowBinding.read")(function* (executionSessionID: string) {
  const database = yield* Database.Service
  const row = yield* database.db.select().from(EventTable).where(eq(EventTable.id, eventID(executionSessionID))).get().pipe(Effect.orDie)
  if (!row) return
  if (row.type !== EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
  return Schema.decodeUnknownSync(MaestroEvent.Task.WorkflowBound.data)(row.data)
})

function eventID(executionSessionID: string) {
  return EventV2.ID.make(`evt_maestro_workflow_bound_${createHash("sha256").update(executionSessionID).digest("hex")}`)
}
