export * as ClaudeHostResearchResult from "./research-result"

import { Effect } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Research } from "@orchestra/schema/research"
import type { SessionID } from "@/session/schema"
import type { ClaudeHostJoin } from "./join"
import type { ClaudeHostResearch } from "./research"

export type Port = {
  readonly settle?: ClaudeHostResearch.Runtime["settle"]
  readonly stopReason?: ClaudeHostResearch.Runtime["stopReason"]
  readonly status?: ClaudeHostResearch.Runtime["status"]
}

/** SDK diagnostics are untrusted even when delivered by a host-owned callback. */
export const diagnostic = (text: string) => ToolSafety.inspect(text).pipe(
  Effect.as(text),
  Effect.catchCause(() => Effect.succeed("HOLD: native diagnostic refused by ToolSafety inspection")),
)

/** Called under the admitted dispatch's terminal lock, before any diagnostic projection. */
export const close = Effect.fn("ClaudeHostResearchResult.close")(function* (
  child: SessionID,
  callID: string,
  join: ClaudeHostJoin.Join,
  research: Port | undefined,
) {
  if (!research) return undefined
  if (research.settle) yield* research.settle(child)
  const reason = research.stopReason ? yield* research.stopReason(child).pipe(
    Effect.flatMap((text) => text === undefined ? Effect.succeed(undefined) : diagnostic(text)),
  ) : undefined
  const state = research.status ? yield* research.status(child) : undefined
  const stopError = state?.nativeStop.status === "failed" ? {
    name: state.nativeStop.error._tag,
    reason: state.nativeStop.error.reason,
    message: yield* diagnostic(state.nativeStop.error.message),
  } : undefined
  const joined = join.get(callID)
  const agrees = joined?.child === child && joined.seat === "jimmy" && !joined.hold
  return {
    version: 1 as const,
    source: "claude-code-host-research" as const,
    dispatchCallID: callID,
    executionSessionID: child,
    seat: "jimmy" as const,
    admission: state ? state.closed ? "closed" as const : "open" as const : "unobserved" as const,
    ...(state ? { deadlineActive: state.deadlineActive } : {}),
    ...(reason ? { exhaustionCode: "budget_exhausted" as const, exhaustionReason: reason } : {}),
    ...(state?.allowance ? { nativeBudget: {
      tier: state.allowance.tier,
      deadlineSeconds: state.allowance.deadlineSeconds,
      tools: { limit: state.allowance.toolLimit, admission: "pre-execution" as const },
      retainedBytes: { limit: state.allowance.byteLimit, admission: "pre-retention" as const },
      provider: {
        accounting: "observed-sdk-response-ids" as const,
        limit: state.allowance.providerLimit,
        maxTurns: Research.Tiers.deep.providerCalls,
        bound: "native-agentic-api-round-trips" as const,
        physicalPreProviderAdmission: "unavailable" as const,
        hiddenWork: "unmeasured" as const,
      },
    } } : {}),
    nativeJoin: {
      status: !joined ? "missing" : !agrees ? "conflict" : joined.taskID ? "joined" : "pending",
      ...(agrees && joined.taskID ? { taskID: joined.taskID } : {}),
    },
    nativeStop: {
      status: state?.nativeStop.status ?? "unobserved",
      evidence: "sdk-control-status" as const,
      physicalCompletion: "unobserved" as const,
      ...(stopError ? { error: stopError } : {}),
    },
  }
})

export type Diagnostic = NonNullable<Effect.Success<ReturnType<typeof close>>>

export function terminal(control: Diagnostic | undefined) {
  if (control?.exhaustionReason) return { reason: "interrupted" as const, hostDetail: control.exhaustionReason }
  if (control?.nativeStop.error) return { reason: "failed" as const, hostDetail: control.nativeStop.error.message }
  return undefined
}

export function report(text: string, ended: { reason: "failed" | "interrupted"; hostDetail: string }) {
  return `Orchestra research ${ended.reason}: ${ended.hostDetail}\nSDK stop control does not establish physical completion. Retained authored report follows; do not treat it as unqualified successful work.\n\n${text}`
}
