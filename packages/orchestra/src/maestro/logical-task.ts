export * as LogicalTask from "./logical-task"

import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { and, eq, sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Identifier } from "@/id/id"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { canonicalMemberId } from "./roster"

// F2.11: the logical task an execution Session carries. The Task `task_id` the model sees for a bound Session is this
// `taskId`, never the child Session ID; the binding is host-written and durable, so a resume or a replay finds it.

export type Binding = Schema.Schema.Type<typeof MaestroEvent.Task.Bound.data>
export type Source = Binding["source"]

export class Denied extends Schema.TaggedErrorClass<Denied>()("LogicalTaskDenied", {
  stage: Schema.Literals(["resume", "binding"]),
  reason: Schema.String,
}) {
  override get message() {
    return `Task ${this.stage} denied: ${this.reason}`
  }
}

// A user-named task (F2-D1 direct use) is validated before it binds; a Session ID can never name a logical task.
const USER_TASK_ID = /^(?!ses_)[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const decode = Schema.decodeUnknownSync(MaestroEvent.Task.Bound.data)

/**
 * Bind the execution Session to its logical task, once. Re-binding with the same fields returns the stored binding
 * (replays and resumes); any different binding on the same Session fails `task-binding-mismatch`. Without `taskId`
 * the host generates one, or keeps the one already bound.
 */
export const ensure = Effect.fn("LogicalTask.ensure")(function* (input: {
  executionSessionID: string
  authoritySessionID: string
  projectID: string
  memberID: string
  source: Source
  taskId?: string
}) {
  if (input.source === "user" && !USER_TASK_ID.test(input.taskId ?? ""))
    return yield* new Denied({ stage: "binding", reason: "task-id-invalid" })
  const existing = yield* read(input.executionSessionID)
  if (existing) {
    if (matches(existing, input)) return existing
    return yield* new Denied({ stage: "binding", reason: "task-binding-mismatch" })
  }
  const events = yield* EventV2Bridge.Service
  const binding = {
    taskId: input.taskId ?? Identifier.create("tsk", "ascending"),
    projectID: input.projectID,
    memberID: input.memberID,
    executionSessionID: input.executionSessionID,
    authoritySessionID: input.authoritySessionID,
    source: input.source,
  }
  return yield* events.publish(MaestroEvent.Task.Bound, binding, { id: eventID(input.executionSessionID) }).pipe(
    Effect.map((event) => event.data),
    // A concurrent bind of the same Session won the insert: the stored binding decides.
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        const stored = yield* read(input.executionSessionID)
        if (!stored) return yield* Effect.failCause(cause)
        if (matches(stored, input)) return stored
        return yield* new Denied({ stage: "binding", reason: "task-binding-mismatch" })
      }),
    ),
  )
})

export const read = Effect.fn("LogicalTask.read")(function* (executionSessionID: string) {
  const database = yield* Database.Service
  const row = yield* database.db
    .select({ data: EventTable.data })
    .from(EventTable)
    .where(eq(EventTable.id, eventID(executionSessionID)))
    .get()
    .pipe(Effect.orDie)
  return row ? decode(row.data) : undefined
})

/**
 * Resolve a Task `task_id` to the child Session it resumes. Lenient callers keep the generic lookup and see only
 * direct children of their Session: an unknown, malformed or foreign id resolves to nothing. Strict callers (F2-D2:
 * the backend seat and governed or authorized dispatch) resume only existing retained work of the same project and
 * member, and refuse anything else before a child exists.
 * A Session ID is accepted there as an execution reference to the logical task bound to it, or to a child created
 * before bindings existed.
 */
export const resolveResume = Effect.fn("LogicalTask.resolveResume")(function* (input: {
  taskID?: string
  strict: boolean
  parentSessionID: string
  projectID: string
  memberID: string
}) {
  const taskID = input.taskID
  if (!taskID) return undefined
  const sessions = yield* Session.Service
  const session = input.strict
    ? yield* strictSession({ ...input, taskID })
    : // SessionID.make throws on ids without the session prefix, so the lookup is suspended to catch it.
      yield* Effect.suspend(() => sessions.get(SessionID.make(taskID))).pipe(
        Effect.map((found) => (found.parentID === input.parentSessionID ? found : undefined)),
        Effect.catchCause(() => Effect.succeed(undefined)),
      )
  if (session && (session.parentID !== input.parentSessionID || canonicalMemberId(session.agent) !== input.memberID))
    return yield* new Denied({ stage: "resume", reason: "task is not direct child for selected agent" })
  return session
})

// Governed and authorized dispatch reserve a deterministic child Session per reservation; its logical task reuses the
// reservation hash, so every replay of the reservation binds the same `taskId`. Other Task work gets a host id.
export function origin(reservedChildID: string | undefined, governed: boolean): { source: Source; taskId?: string } {
  if (!reservedChildID) return { source: "host" }
  return {
    source: governed ? "governed" : "dispatch",
    taskId: `tsk_${reservedChildID.slice(reservedChildID.lastIndexOf("_") + 1)}`,
  }
}

const strictSession = Effect.fnUntraced(function* (input: { taskID: string; projectID: string; memberID: string }) {
  const database = yield* Database.Service
  const sessions = yield* Session.Service
  const named = yield* database.db
    .select({ data: EventTable.data })
    .from(EventTable)
    .where(
      and(
        eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.Bound.type, 1)),
        sql`json_extract(${EventTable.data}, '$.taskId') = ${input.taskID}`,
      ),
    )
    .all()
    .pipe(Effect.orDie)
  // No path binds a replacement Session to an existing task yet, so more than one binding is never guessed between.
  if (named.length > 1) return yield* new Denied({ stage: "resume", reason: "task-binding-ambiguous" })
  const binding = named[0] ? decode(named[0].data) : yield* read(input.taskID)
  if (binding && binding.projectID !== input.projectID)
    return yield* new Denied({ stage: "resume", reason: "task-project-mismatch" })
  if (binding && canonicalMemberId(binding.memberID) !== input.memberID)
    return yield* new Denied({ stage: "resume", reason: "task-member-mismatch" })
  const id = binding?.executionSessionID ?? input.taskID
  const session = yield* Effect.suspend(() => sessions.get(SessionID.make(id))).pipe(
    Effect.catchCause(() => Effect.succeed(undefined)),
  )
  if (!session) return yield* new Denied({ stage: "resume", reason: "unknown-task" })
  if (session.projectID !== input.projectID)
    return yield* new Denied({ stage: "resume", reason: "task-project-mismatch" })
  return session
})

function matches(stored: Binding, input: Omit<Binding, "taskId"> & { taskId?: string }) {
  return isDeepStrictEqual(stored, {
    taskId: input.taskId ?? stored.taskId,
    projectID: input.projectID,
    memberID: input.memberID,
    executionSessionID: input.executionSessionID,
    authoritySessionID: input.authoritySessionID,
    source: input.source,
  })
}

function eventID(executionSessionID: string) {
  return EventV2.ID.make(
    `evt_maestro_task_bound_${createHash("sha256").update(executionSessionID, "utf8").digest("hex")}`,
  )
}
