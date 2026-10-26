export * as WorkflowGateV2 from "./workflow"

import { createHash } from "node:crypto"
import { ToolFailure } from "@orchestra/llm"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { MaestroEvent } from "@orchestra/schema/maestro-event"

/**
 * The earlier runtime's workflow Task holds: a Session bound to a workflow step never starts a Task of its own, and a resumed child
 * bound to a workflow continues only as that workflow's Task.
 */
export const check = Effect.fn("WorkflowGateV2.check")(function* (
  database: Database.Interface,
  input: { readonly parentID: string; readonly taskID?: string; readonly workflow: boolean },
) {
  if (yield* bound(database, input.parentID))
    return yield* new ToolFailure({ message: "Tool safety HOLD: WORKFLOW_NESTED_TASK_REFUSED" })
  if (input.taskID && !input.workflow && (yield* bound(database, input.taskID)))
    return yield* new ToolFailure({ message: "Tool safety HOLD: WORKFLOW_TASK_BINDING_REQUIRED" })
})

/**
 * Whether the execution Session carries a workflow binding; a row of another type holds. The workflow admission that
 * continues a bound Session decodes the binding itself.
 */
export const bound = Effect.fn("WorkflowGateV2.bound")(function* (database: Database.Interface, executionSessionID: string) {
  const row = yield* database.db
    .select({ type: EventV2.EventTable.type })
    .from(EventV2.EventTable)
    .where(eq(EventV2.EventTable.id, eventID(executionSessionID)))
    .get()
    .pipe(Effect.orDie)
  if (!row) return false
  if (row.type !== EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1))
    return yield* new ToolFailure({ message: "Tool safety HOLD: WORKFLOW_TASK_BINDING_MISMATCH" })
  return true
})

export function eventID(executionSessionID: string) {
  return EventV2.ID.make(`evt_maestro_workflow_bound_${createHash("sha256").update(executionSessionID).digest("hex")}`)
}
