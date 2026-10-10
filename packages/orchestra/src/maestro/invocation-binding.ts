import type { InvocationBinding } from "@orchestra/plugin"
import { Database } from "@orchestra/core/database/database"
import { SessionStore } from "@orchestra/core/session/store"
import { Effect, Schema } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import type { Tool } from "@/tool/tool"
import { LogicalTask } from "./logical-task"
import { SessionAuthority } from "./session-authority"
import { Session } from "@/session/session"

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
  const legacySessions = yield* Session.Service
  const resolveAuthority = SessionAuthority.make(sessions.get)

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
    const authority = yield* resolveAuthority(context.sessionID, instance.project.id).pipe(
      Effect.mapError((error) => new Denied({ reason: error.reason })),
    )
    const session = authority.execution
    const task = yield* LogicalTask.read(context.sessionID).pipe(
      Effect.provideService(Database.Service, database),
      Effect.provideService(Session.Service, legacySessions),
      Effect.catchCause(() => Effect.fail(new Denied({ reason: "logical-task-unreadable" }))),
    )
    if (
      task &&
      (task.projectID !== instance.project.id ||
        task.memberID !== context.agentID ||
        task.executionSessionID !== context.sessionID ||
        task.authoritySessionID !== authority.rootID)
    )
      return yield* new Denied({ reason: "logical-task-mismatch" })
    return Object.freeze({
      projectId: instance.project.id,
      directory: session.location.directory,
      worktree: instance.worktree,
      ...(session.location.workspaceID ? { workspaceID: session.location.workspaceID } : {}),
      memberId: context.agentID,
      executionSessionId: context.sessionID,
      authoritySessionId: authority.rootID,
      assistantMessageID: context.messageID,
      callID: context.callID,
      ...(task ? { taskId: task.taskId } : {}),
    } satisfies InvocationBinding)
  })
})

export * as InvocationBindingHost from "./invocation-binding"
