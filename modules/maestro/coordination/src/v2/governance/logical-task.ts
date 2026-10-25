export * as LogicalTaskV2 from "./logical-task"

import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { ToolFailure } from "@orchestra/llm"
import { and, eq, sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { SessionSchema, type SessionStore } from "@orchestra/core/session"
import { ascending } from "@orchestra/schema/identifier"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { SessionAuthority } from "../../session-authority"
import { GovernanceRecordsV2 } from "./records"

// V2 port of V1's logical task (`apps/orchestra/src/maestro/logical-task.ts`): the durable `tsk_` identity an execution
// Session carries, and the resolution of a Task `task_id` to the child it resumes. The binding records are V1's.

export type Binding = Schema.Schema.Type<typeof MaestroEvent.Task.Bound.data>
export type Source = Binding["source"]

export type Services = {
  readonly db: Database.Interface["db"]
  readonly events: EventV2.Interface
  readonly store: SessionStore.Interface
  readonly canonical: (id: string) => string
}

// A user-named task is validated before it binds; a Session ID can never name a logical task.
const USER_TASK_ID = /^(?!ses_)[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const decode = Schema.decodeUnknownSync(MaestroEvent.Task.Bound.data)

/**
 * Bind the execution Session to its logical task, once. Re-binding with the same fields returns the stored binding;
 * any different binding on the same Session fails `task-binding-mismatch`. Without `taskId` the host generates one.
 */
export const ensure = Effect.fn("LogicalTaskV2.ensure")(function* (
  services: Services,
  input: {
    executionSessionID: string
    authoritySessionID: string
    projectID: string
    memberID: string
    source: Source
    taskId?: string
  },
) {
  if (input.source === "user" && !USER_TASK_ID.test(input.taskId ?? "")) return yield* denied("binding", "task-id-invalid")
  const existing = yield* readStored(services, input.executionSessionID)
  if (existing) return yield* reconcile(services, existing, input)
  const authority = yield* SessionAuthority.make(services.store.get)(input.executionSessionID, input.projectID).pipe(
    Effect.mapError((error) => denied("binding", error.reason)),
  )
  if (input.authoritySessionID !== authority.rootID) return yield* denied("binding", "task-authority-mismatch")
  const binding = {
    taskId: input.taskId ?? `tsk_${ascending()}`,
    projectID: input.projectID,
    memberID: input.memberID,
    executionSessionID: input.executionSessionID,
    authoritySessionID: authority.rootID,
    source: input.source,
  }
  return yield* services.events.publish(MaestroEvent.Task.Bound, binding, { id: eventID(input.executionSessionID) }).pipe(
    Effect.map((event) => event.data),
    // A concurrent bind of the same Session won the insert: the stored binding decides.
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        const stored = yield* readStored(services, input.executionSessionID)
        if (!stored) return yield* Effect.failCause(cause)
        return yield* reconcile(services, stored, input)
      }),
    ),
  )
})

export const read = Effect.fn("LogicalTaskV2.read")(function* (services: Services, executionSessionID: string) {
  const stored = yield* readStored(services, executionSessionID)
  return stored ? yield* reconcile(services, stored) : undefined
})

/**
 * Resolve a Task `task_id` to the child Session it resumes. Lenient callers see only direct children of their Session:
 * an unknown, malformed or foreign id resolves to nothing. Strict callers (the strict-resume seats and governed or
 * authorized dispatch) resume only retained work of the same project and member, by `tsk_` id or Session ID.
 */
export const resolveResume = Effect.fn("LogicalTaskV2.resolveResume")(function* (
  services: Services,
  input: { taskID?: string; strict: boolean; parentSessionID: string; projectID: string; memberID: string },
) {
  const taskID = input.taskID
  if (!taskID) return undefined
  const session = input.strict
    ? yield* strictSession(services, { ...input, taskID })
    : yield* lenientSession(services, taskID, input.parentSessionID)
  if (session && (session.parentID !== input.parentSessionID || services.canonical(session.agent) !== input.memberID))
    return yield* denied("resume", "task is not direct child for selected agent")
  return session
})

// Governed and authorized dispatch reserve a deterministic child per reservation; its logical task reuses the
// reservation hash, so every replay of the reservation binds the same `taskId`. Other Task work gets a host id.
export function origin(reservedChildID: string | undefined, governed: boolean): { source: Source; taskId?: string } {
  if (!reservedChildID) return { source: "host" }
  return {
    source: governed ? "governed" : "dispatch",
    taskId: `tsk_${reservedChildID.slice(reservedChildID.lastIndexOf("_") + 1)}`,
  }
}

function denied(stage: "resume" | "binding", reason: string) {
  return new ToolFailure({ message: `Task ${stage} denied: ${reason}` })
}

const lenientSession = Effect.fnUntraced(function* (services: Services, taskID: string, parentSessionID: string) {
  if (!Schema.is(SessionSchema.ID)(taskID)) return undefined
  const found = yield* services.store.get(taskID)
  return found?.parentID === parentSessionID ? found : undefined
})

const readStored = Effect.fnUntraced(function* (services: Services, executionSessionID: string) {
  const row = yield* GovernanceRecordsV2.row(services.db, eventID(executionSessionID))
  const binding = row ? decode(row.data) : undefined
  if (binding && binding.executionSessionID !== executionSessionID)
    return yield* denied("binding", "task-binding-mismatch")
  return binding
})

const strictSession = Effect.fnUntraced(function* (
  services: Services,
  input: { taskID: string; projectID: string; memberID: string },
) {
  const named = yield* services.db
    .select({ data: EventV2.EventTable.data })
    .from(EventV2.EventTable)
    .where(
      and(
        eq(EventV2.EventTable.type, EventV2.versionedType(MaestroEvent.Task.Bound.type, 1)),
        sql`json_extract(${EventV2.EventTable.data}, '$.taskId') = ${input.taskID}`,
      ),
    )
    .all()
    .pipe(Effect.orDie)
  // No path binds a replacement Session to an existing task yet, so more than one binding is never guessed between.
  if (named.length > 1) return yield* denied("resume", "task-binding-ambiguous")
  const binding = named[0] ? decode(named[0].data) : yield* read(services, input.taskID)
  if (binding && binding.projectID !== input.projectID) return yield* denied("resume", "task-project-mismatch")
  if (binding && services.canonical(binding.memberID) !== input.memberID)
    return yield* denied("resume", "task-member-mismatch")
  if (binding) yield* reconcile(services, binding)
  const id = binding?.executionSessionID ?? input.taskID
  const session = Schema.is(SessionSchema.ID)(id) ? yield* services.store.get(id) : undefined
  if (!session) return yield* denied("resume", "unknown-task")
  if (session.projectID !== input.projectID) return yield* denied("resume", "task-project-mismatch")
  return session
})

// Read compatibility never rewrites the event. Only the actual immediate parent is a historical authority spelling;
// any other ancestor is refused. New producers must supply the root.
const reconcile = Effect.fnUntraced(function* (
  services: Services,
  stored: Binding,
  input?: Omit<Binding, "taskId"> & { taskId?: string },
) {
  if (
    input &&
    !isDeepStrictEqual(stored, {
      taskId: input.taskId ?? stored.taskId,
      projectID: input.projectID,
      memberID: input.memberID,
      executionSessionID: input.executionSessionID,
      authoritySessionID: stored.authoritySessionID,
      source: input.source,
    })
  )
    return yield* denied("binding", "task-binding-mismatch")
  const authority = yield* SessionAuthority.make(services.store.get)(stored.executionSessionID, stored.projectID).pipe(
    Effect.mapError((error) => denied("binding", error.reason)),
  )
  if (stored.authoritySessionID !== authority.rootID && stored.authoritySessionID !== authority.execution.parentID)
    return yield* denied("binding", "task-authority-mismatch")
  if (input && input.authoritySessionID !== authority.rootID && input.authoritySessionID !== stored.authoritySessionID)
    return yield* denied("binding", "task-binding-mismatch")
  return { ...stored, authoritySessionID: authority.rootID }
})

function eventID(executionSessionID: string) {
  return EventV2.ID.make(`evt_maestro_task_bound_${createHash("sha256").update(executionSessionID, "utf8").digest("hex")}`)
}
