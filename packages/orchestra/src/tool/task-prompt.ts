import type { SessionV1 } from "@orchestra/core/v1/session"
import { Effect } from "effect"
import type { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { GroundedSkills } from "@/maestro/grounded-skills"
import type { SessionPrompt } from "@/session/prompt"
import { PromptGuard } from "@/session/prompt-guard"
import type { SessionID } from "@/session/schema"

export interface TaskPromptOps {
  cancel(sessionID: SessionID): Effect.Effect<void>
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(
    input: SessionPrompt.PromptInput,
    options?: { beforeModel: Effect.Effect<void, unknown> },
  ): Effect.Effect<SessionV1.WithParts>
}

export function bind(
  ops: Pick<SessionPrompt.Interface, "cancel" | "resolvePromptParts" | "prompt">,
  nativeHost: Pick<Effect.Success<typeof ArsenalBindings.make>, "withSession">,
): TaskPromptOps {
  return {
    cancel: (sessionID) => ops.cancel(sessionID),
    resolvePromptParts: (template) => ops.resolvePromptParts(template),
    prompt: (input, options) => nativeHost.withSession(input.sessionID, PromptGuard.wrap(ops.prompt)(input, options)),
  }
}

export const parts = Effect.fn("TaskPrompt.parts")(function* (
  ops: TaskPromptOps,
  template: string,
  authorizationID?: string,
) {
  // A brief names other agents as plain text. As an @mention, an agent part would tell the child to
  // delegate to that agent and skip its own task permission prompt.
  const brief = (yield* ops.resolvePromptParts(template)).filter((part) => part.type !== "agent")
  const own = authorizationID ? yield* GroundedSkills.parts(authorizationID) : []
  return [...brief, ...own]
})

export * as TaskPrompt from "./task-prompt"
