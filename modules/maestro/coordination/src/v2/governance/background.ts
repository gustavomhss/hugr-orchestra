export * as GovernanceBackgroundV2 from "./background"

import { createHash } from "node:crypto"
import { Context, Effect, Layer, Option, Scope } from "effect"
import { Node } from "@orchestra/core/effect/app-node"
import { SessionSchema, SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/schema/session-message"
import { TaskTool } from "@orchestra/core/tool/task"
import type { Tool } from "@orchestra/core/tool/tool"

// A background Task returns at once; when its child goes idle the parent receives the child's reply as a new prompt,
// as V1's `TaskBackground` delivers it. The return prompt's id is derived from the call, so a repeated watch (or a
// retried Task call) admits the same durable input at most once.

/** The process-global Session service, when the host exports one; without it a background Task is refused. */
export class Sessions extends Context.Service<Sessions, Option.Option<SessionV2.Interface>>()(
  "@orchestra/maestro/governance/Sessions",
) {}

export const sessionsNode = Node.makeGlobalNode({
  // A capture, never a fresh Session graph: the Location reads the process's own Session service when it has one.
  name: "maestro/governance/global/sessions",
  layer: Layer.effect(Sessions, Effect.serviceOption(SessionV2.Service)),
  deps: [],
})

export type Watch = {
  readonly parentID: SessionSchema.ID
  readonly childID: SessionSchema.ID
  readonly description: string
  readonly promptID: SessionMessage.ID
}

export function watch(input: {
  parentID: SessionSchema.ID
  childID: SessionSchema.ID
  description: string
  context: Tool.Context
}): Watch {
  return {
    parentID: input.parentID,
    childID: input.childID,
    description: input.description,
    promptID: TaskTool.taskPromptID(input.context, input.childID),
  }
}

/**
 * Wait for the child to go idle, then deliver its reply (or its failure) to the parent once. A lost watcher (a host
 * restart) leaves the child's reply in its own Session, readable by resuming it with its task_id.
 */
export const deliver = Effect.fn("GovernanceBackgroundV2.deliver")(function* (sessions: SessionV2.Interface, input: Watch) {
  yield* sessions.wait(input.childID)
  const reply = TaskTool.completedReply(
    yield* sessions.messages({ sessionID: input.childID, order: "asc" }),
    input.promptID,
  )
  const result = reply?.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
  const text = [
    result === undefined
      ? `Background task failed: ${input.description}`
      : `Background task completed: ${input.description}`,
    `task_id: ${input.childID}`,
    "",
    "<task_result>",
    result ?? "The task ended without a completed reply; resume it with its task_id to read where it stopped.",
    "</task_result>",
  ].join("\n")
  yield* sessions.prompt({ id: returnID(input), sessionID: input.parentID, prompt: { text } })
})

/** Watches registered background children; each child is watched at most once per process. */
export const make = Effect.fnUntraced(function* () {
  const scope = yield* Scope.Scope
  const registered = new Map<string, Watch>()
  const started = new Set<string>()
  return {
    register: (input: Watch) => registered.set(input.childID, input),
    has: (childID: string) => registered.has(childID),
    start: (sessions: SessionV2.Interface, childID: string) =>
      Effect.gen(function* () {
        const input = registered.get(childID)
        if (!input || started.has(childID)) return
        started.add(childID)
        yield* deliver(sessions, input).pipe(
          // The parent may be gone or the child removed; the reply then stays where it is.
          Effect.catchCause(() => Effect.void),
          Effect.forkIn(scope),
        )
      }),
  }
})

export function returnID(input: Watch) {
  return SessionMessage.ID.make(
    `msg_${createHash("sha256").update(JSON.stringify(["task-background-return", input.promptID]), "utf8").digest("hex")}`,
  )
}
