export * as GovernanceBackgroundV2 from "./background"

import { createHash } from "node:crypto"
import { Cause, Context, DateTime, Effect, Layer, Option, Schedule, Scope } from "effect"
import { Node } from "@orchestra/core/effect/app-node"
import type { EventV2 } from "@orchestra/core/event"
import { SessionSchema, SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/schema/session-event"
import { SessionMessage } from "@orchestra/schema/session-message"
import { TaskTool } from "@orchestra/core/tool/task"
import type { Tool } from "@orchestra/core/tool/tool"

// A background Task returns at once; when its child goes idle the parent receives the child's reply as a new prompt,
// as V1's `TaskBackground` delivers it. The return prompt's id is derived from the call, so a repeated watch (or a
// retried Task call) admits the same durable input at most once. A delivery that keeps failing is retried a bounded
// number of times (V1 reconciles once), then held: a durable notice in the parent's history names the task_id to resume.

/** Delivery attempts after the first, before the return is held. */
export const RETRIES = 2

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

/**
 * Record a held return in the parent's history once, so the parent (and Maestro reading it) sees that the child's result
 * did not arrive and how to read it. The parent must still exist; a removed parent leaves only the log line.
 */
export const hold = Effect.fn("GovernanceBackgroundV2.hold")(function* (
  sessions: SessionV2.Interface,
  events: EventV2.Interface,
  input: Watch,
  cause: Cause.Cause<unknown>,
) {
  yield* Effect.logWarning("Background Task delivery HOLD", {
    parentID: input.parentID,
    childID: input.childID,
    promptID: input.promptID,
    cause: Cause.pretty(cause),
  })
  yield* sessions.get(input.parentID)
  const messageID = holdID(input)
  if (yield* sessions.message({ sessionID: input.parentID, messageID })) return
  yield* events.publish(SessionEvent.Synthetic, {
    sessionID: input.parentID,
    messageID,
    timestamp: yield* DateTime.now,
    text: [
      `Background task result not delivered (HOLD): ${input.description}`,
      `task_id: ${input.childID}`,
      "The host could not return this task's result to this Session. Resume it with its task_id to read its result.",
    ].join("\n"),
  })
})

/** Watches registered background children; each child is watched at most once per process. */
export const make = Effect.fnUntraced(function* (events: EventV2.Interface) {
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
          // Every cause but a shutdown is retried; an exact retry reconciles the same durable return.
          Effect.sandbox,
          Effect.retry({ times: RETRIES, schedule: Schedule.exponential("100 millis"), while: (cause) => !Cause.hasInterrupts(cause) }),
          Effect.catch((cause) => (Cause.hasInterrupts(cause) ? Effect.failCause(cause) : hold(sessions, events, input, cause))),
          // A removed parent has nowhere to show the hold; the child's reply stays in its own Session.
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.logWarning("Background Task hold not recorded", { childID, cause: Cause.pretty(cause) }),
          ),
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

export function holdID(input: Watch) {
  return SessionMessage.ID.make(
    `msg_${createHash("sha256").update(JSON.stringify(["task-background-hold", input.promptID]), "utf8").digest("hex")}`,
  )
}
