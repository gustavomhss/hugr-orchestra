import type { InvocationBinding } from "@orchestra/plugin"
import { Database } from "@orchestra/core/database/database"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionStore } from "@orchestra/core/session/store"
import { Effect, Schema } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import type { Tool } from "@/tool/tool"
import { LogicalTask } from "./logical-task"

export class Denied extends Schema.TaggedErrorClass<Denied>()("InvocationBindingDenied", {
  reason: Schema.String,
}) {
  override get message() {
    return `Plugin invocation binding denied: ${this.reason}`
  }
}

/** V1 host adapter only: no provider/storage acquisition and no synthesized logical task. */
export const make = Effect.gen(function* () {
  const sessions = yield* SessionStore.Service
  const database = yield* Database.Service
  const root = Effect.fn("InvocationBinding.root")(function* (
    id: SessionSchema.ID,
    projectId: string,
    seen: Set<string>,
  ): Effect.fn.Return<string, Denied> {
    if (seen.has(id)) return yield* new Denied({ reason: "session-parent-cycle" })
    seen.add(id)
    const session = yield* sessions
      .get(id)
      .pipe(Effect.catchCause(() => Effect.fail(new Denied({ reason: "session-unreadable" }))))
    if (!session) return yield* new Denied({ reason: "session-missing" })
    if (session.projectID !== projectId) return yield* new Denied({ reason: "session-project-mismatch" })
    if (!session.parentID) return session.id
    return yield* root(session.parentID, projectId, seen)
  })

  return Effect.fn("InvocationBinding.resolve")(function* (
    context: Pick<Tool.Context, "sessionID" | "messageID" | "callID" | "agentID">,
    required: boolean,
  ) {
    if (
      !context.agentID?.trim() ||
      !context.callID?.trim() ||
      !context.messageID?.trim() ||
      !context.sessionID?.trim()
    ) {
      if (required) return yield* new Denied({ reason: "invocation-identity-missing" })
      return undefined
    }
    const instance = yield* InstanceRef
    if (!instance?.directory || !instance.worktree || !instance.project.id) {
      if (required) return yield* new Denied({ reason: "placement-missing" })
      return undefined
    }
    const id = yield* Schema.decodeUnknownEffect(SessionSchema.ID)(context.sessionID).pipe(
      Effect.mapError(() => new Denied({ reason: "session-id-invalid" })),
    )
    const authoritySessionId = yield* root(id, instance.project.id, new Set())
    const session = yield* sessions
      .get(id)
      .pipe(Effect.catchCause(() => Effect.fail(new Denied({ reason: "session-unreadable" }))))
    if (!session) return yield* new Denied({ reason: "session-missing" })
    const task = yield* LogicalTask.read(context.sessionID).pipe(
      Effect.provideService(Database.Service, database),
      Effect.catchCause(() => Effect.fail(new Denied({ reason: "logical-task-unreadable" }))),
    )
    if (
      task &&
      (task.projectID !== instance.project.id ||
        task.memberID !== context.agentID ||
        task.executionSessionID !== context.sessionID ||
        task.authoritySessionID !== authoritySessionId)
    )
      return yield* new Denied({ reason: "logical-task-mismatch" })
    return Object.freeze({
      projectId: instance.project.id,
      directory: session.location.directory,
      worktree: instance.worktree,
      ...(session.location.workspaceID ? { workspaceID: session.location.workspaceID } : {}),
      memberId: context.agentID,
      executionSessionId: context.sessionID,
      authoritySessionId,
      assistantMessageID: context.messageID,
      callID: context.callID,
      ...(task ? { taskId: task.taskId } : {}),
    } satisfies InvocationBinding)
  })
})

export * as InvocationBindingHost from "./invocation-binding"
