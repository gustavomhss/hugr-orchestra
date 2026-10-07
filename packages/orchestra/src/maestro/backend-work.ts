export * as BackendWork from "./backend-work"

import { Effect } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { MessageV2 } from "@/session/message-v2"
import type { SessionID } from "@/session/schema"
import { BackendResult } from "./backend-result"

// F4 cl.6: the backend seat's work result, streamed onto the Task tool part as `metadata.workResult`. Every operation
// is a no-op for other seats.
export function track(input: {
  readonly enabled: boolean
  readonly sessionID: SessionID
  // Host fact: the logical task bound to the child (F2.11); absent for a seat without a binding.
  readonly taskId?: string
  // Host fact: the write roots ToolSafety enforces for the child (F2.14); empty means read-only.
  readonly writeRoots?: ReadonlyArray<string>
  readonly publish: (workResult: BackendResult.WorkResult) => Effect.Effect<void>
}) {
  const evidence: { value?: BackendResult.WorkResult } = {}
  // The shell fact is what the child's commands actually got; before any ran, what this host would give them now.
  const bound = Effect.fnUntraced(function* (result: BackendResult.WorkResult) {
    const task = input.taskId ? { ...result, taskId: input.taskId } : result
    if (!input.writeRoots) return task
    const shell = ToolSafety.shellFact(input.sessionID) ?? (yield* ToolSafetySandbox.status())
    return { ...task, writeRoots: [...input.writeRoots], ...shell }
  })
  const history = () => MessageV2.stream(input.sessionID)

  return {
    attach: <T extends object>(metadata: T) => ({
      ...metadata,
      ...(evidence.value ? { workResult: evidence.value } : {}),
    }),
    record: Effect.fn("BackendWork.record")(function* (message: SessionV1.WithParts) {
      if (!input.enabled) return
      evidence.value = yield* bound(BackendResult.assemble(message, yield* history()))
      yield* input.publish(evidence.value)
    }),
    // When the host ends the Task before or instead of the child's final message, stream the work result it can
    // stand behind: the card already assembled, else the child's last assistant message, else no card.
    hostEnded: Effect.fn("BackendWork.hostEnded")(function* (
      reason: "failed" | "interrupted" | "running",
      detail: string,
    ) {
      if (!input.enabled) return
      const session = evidence.value ? [] : yield* history()
      evidence.value = evidence.value
        ? { ...evidence.value, terminal: { reason, hostDetail: detail } }
        : yield* bound(BackendResult.hostEnded({ message: lastAssistant(session), session, reason, detail }))
      yield* input.publish(evidence.value)
    }),
    // F4 cl.6/35: the Task part already completed with terminal `running`, so the background completion notice carries
    // the final work result, read from the child's durable last assistant message (a resumed job may have run several
    // turns).
    notice: Effect.fn("BackendWork.notice")(function* (state: "completed" | "error", text: string) {
      if (!input.enabled) return undefined
      const session = yield* history()
      const last = lastAssistant(session)
      if (state === "error")
        return yield* bound(BackendResult.hostEnded({ message: last, session, reason: "failed", detail: text }))
      if (last) return yield* bound(BackendResult.assemble(last, session))
      return yield* bound(
        BackendResult.hostEnded({ session, reason: "interrupted", detail: "No completed child message" }),
      )
    }),
  }
}

function lastAssistant(messages: readonly SessionV1.WithParts[]) {
  return messages.findLast((message) => message.info.role === "assistant")
}
