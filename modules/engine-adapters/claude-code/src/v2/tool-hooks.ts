import type { HookCallback } from "@anthropic-ai/claude-agent-sdk"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { Effect } from "effect"

/** One decision shared by PreToolUse and canUseTool. Only hosted built-ins can carry an after hook. */
export type Decision =
  | { readonly allow: true; readonly tool?: string; readonly input?: Record<string, unknown>; readonly after?: ExecutionHost.Authorization["after"] }
  | { readonly allow: false; readonly reason: string }

export function settleHook(decisions: ReadonlyMap<string, Promise<Decision>>): HookCallback {
  const completed = new Set<string>()
  return async (input, _toolUseID, options) => {
    if (input.hook_event_name !== "PostToolUse" && input.hook_event_name !== "PostToolUseFailure") return {}
    const id = input.tool_use_id
    const decision = await decisions.get(id)
    if (!decision?.allow || decision.tool !== input.tool_name || completed.has(id)) return {}
    const after = decision.after
    if (!after) return {}
    // Claim the callback before running the hook. An interrupted hook may already have recorded a decision.
    completed.add(id)
    const outcome = input.hook_event_name === "PostToolUse"
      ? { succeeded: true as const, response: input.tool_response }
      : { succeeded: false as const }
    return Effect.runPromise(
      Effect.suspend(() => after(outcome)).pipe(Effect.catch((denied) => Effect.succeed([denied.message]))),
      { signal: options.signal },
    ).then(
      (notes) => notes.length
        ? { hookSpecificOutput: { hookEventName: input.hook_event_name, additionalContext: notes.join("\n") } }
        : {},
      () => ({}),
    )
  }
}
