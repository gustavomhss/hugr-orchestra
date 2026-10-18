export * as TaskWorkflow from "./task-workflow"

import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { SessionInputTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { BackgroundJob } from "@/background/job"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { WorkflowBinding } from "@/maestro/workflow-binding"
import { SessionStatus } from "@/session/status"
import { SessionID } from "@/session/schema"
import { MessageV2 } from "@/session/message-v2"

// The Task tool's workflow dispatch and held-step decisions, kept out of task.ts so the tool reads as one flow.

type Completion = Effect.Success<typeof ArsenalCompletion.make>

/**
 * The workflow checks of a Task call before an authorized dispatch reserves its child: a workflow needs an approval
 * binding, and an unarmed workflow holds before the reservation. A resume of the authorization's own bound child reads
 * the owner decision already observed (the continuation phase); any other call is a dispatch and needs the owner's
 * immediate approve. A call without a workflow is a dispatch with nothing to prepare.
 */
export const prepare = Effect.fn("TaskWorkflow.prepare")(function* (input: {
  readonly completion: Completion
  readonly workflow?: WorkflowBinding.Selection
  readonly governed: boolean
  readonly authorizationID?: string
  readonly resumed?: { readonly id: string; readonly parentID?: string }
  readonly sessionID: string
  readonly assistantMessageID: string
  readonly callID: string
  readonly directory: string
  readonly projectID: string
  readonly writePaths: readonly string[]
  readonly subagentType: string
  readonly prompt: string
  readonly model?: string
}) {
  const workflow = input.workflow
  if (!workflow) return { phase: "dispatch" as const, ready: undefined }
  if (!input.governed && !input.authorizationID)
    return yield* Effect.fail(new Error("Tool safety HOLD: WORKFLOW_APPROVAL_BINDING_MISSING"))
  yield* input.completion.beforeReserve({ sessionID: input.sessionID, directory: input.directory })
  const phase = WorkflowBinding.phaseFor({ parentSessionID: input.sessionID, authorizationID: input.authorizationID,
    resumed: input.resumed, bound: input.resumed ? yield* WorkflowBinding.read(input.resumed.id) : undefined })
  const ready = yield* WorkflowBinding.beforeTask({ sessionID: input.sessionID, assistantMessageID: input.assistantMessageID,
    callID: input.callID, directory: input.directory, projectID: input.projectID, writePaths: input.writePaths,
    subagentType: input.subagentType, prompt: input.prompt, model: input.model, workflow }, phase).pipe(Effect.orDie)
  return { phase, ready }
})

/** WorkflowBinding.Activity in this process: a child runs while its Task job runs or its Session is busy or retrying. */
export function activity(background: BackgroundJob.Interface, status: SessionStatus.Interface) {
  return (executionSessionID: string) => Effect.gen(function* () {
    if ((yield* background.get(executionSessionID))?.status === "running") return true
    return (yield* status.get(SessionID.make(executionSessionID))).type !== "idle"
  })
}

/**
 * How an authorized call treats the child its authorization reserved.
 *
 * `neverPrompted`: the reserved child exists before completion.beforeDispatch, so a dispatch held there leaves an
 * authorized child that was never prompted, and replaying it would hold forever. This applies to every authorized
 * dispatch, not only workflow ones. Running it now is still the reservation's one dispatch: the same child, reserved
 * permissions and authorization. The dispatch lock serializes callers in this process, and the background job record
 * guards a run that is still starting or ran in the background. Any message, admitted input or job means a run started,
 * and that child keeps the strict replay. Residual risk: a restart empties the job map, so a run that died before
 * writing any message or input runs again, and its session-start hooks could run twice.
 *
 * `continues`: a resume of a step held for code review re-prompts the same child to settle it again
 * (WorkflowBinding.resumesHeldStep), with the held settlement and whether a resume already graded it.
 */
export const reservedChild = Effect.fn("TaskWorkflow.reservedChild")(function* (input: {
  readonly database: Database.Interface
  readonly background: BackgroundJob.Interface
  readonly completion: Completion
  readonly receipt: ArsenalCompletion.Receipt | undefined
  readonly reservedID?: SessionID
  readonly authorizationID?: string
  readonly workflow: boolean
  readonly resumedID?: string
  readonly phase: "dispatch" | "continuation"
}) {
  const reservedID = input.reservedID
  const neverPrompted = input.authorizationID !== undefined && reservedID !== undefined &&
    (yield* MessageV2.stream(reservedID)).length === 0 &&
    !(yield* input.background.get(reservedID)) &&
    !(yield* input.database.db.select({ id: SessionInputTable.id }).from(SessionInputTable)
      .where(eq(SessionInputTable.session_id, reservedID)).get().pipe(Effect.orDie)) &&
    !(yield* input.database.db.select({ id: SessionMessageTable.id }).from(SessionMessageTable)
      .where(eq(SessionMessageTable.session_id, reservedID)).get().pipe(Effect.orDie))
  const continues = input.workflow && reservedID && !neverPrompted ? yield* WorkflowBinding.resumesHeldStep({
    reservedID, resumedID: input.resumedID, phase: input.phase, job: yield* input.background.get(reservedID),
    view: yield* input.completion.workflowView(input.receipt) }) : undefined
  return { neverPrompted, continues }
})
