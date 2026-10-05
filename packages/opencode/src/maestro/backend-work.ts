export * as BackendWork from "./backend-work"

import { Effect } from "effect"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { MessageV2 } from "@/session/message-v2"
import type { SessionID } from "@/session/schema"
import { BackendResult } from "./backend-result"

// F4 cl.6: the backend seat's work result, streamed onto the Task tool part as `metadata.workResult`. Every operation
// is a no-op for other seats.
export function track(input: {
  readonly enabled: boolean
  readonly sessionID: SessionID
  readonly publish: (workResult: BackendResult.WorkResult) => Effect.Effect<void>
}) {
  const evidence: { value?: BackendResult.WorkResult } = {}
  const lastAssistant = () =>
    MessageV2.stream(input.sessionID).pipe(
      Effect.map((messages) => messages.findLast((message) => message.info.role === "assistant")),
    )

  return {
    attach: <T extends object>(metadata: T) => ({
      ...metadata,
      ...(evidence.value ? { workResult: evidence.value } : {}),
    }),
    record: Effect.fn("BackendWork.record")(function* (message: SessionV1.WithParts) {
      if (!input.enabled) return
      evidence.value = BackendResult.assemble(message)
      yield* input.publish(evidence.value)
    }),
    // When the host ends the Task before or instead of the child's final message, stream the work result it can
    // stand behind: the card already assembled, else the child's last assistant message, else no card.
    hostEnded: Effect.fn("BackendWork.hostEnded")(function* (
      reason: "failed" | "interrupted" | "running",
      detail: string,
    ) {
      if (!input.enabled) return
      evidence.value = evidence.value
        ? { ...evidence.value, terminal: { reason, hostDetail: detail } }
        : BackendResult.hostEnded({ message: yield* lastAssistant(), reason, detail })
      yield* input.publish(evidence.value)
    }),
    // F4 cl.6/35: the Task part already completed with terminal `running`, so the background completion notice carries
    // the final work result, read from the child's durable last assistant message (a resumed job may have run several
    // turns).
    notice: Effect.fn("BackendWork.notice")(function* (state: "completed" | "error", text: string) {
      if (!input.enabled) return undefined
      const last = yield* lastAssistant()
      if (state === "error") return BackendResult.hostEnded({ message: last, reason: "failed", detail: text })
      if (last) return BackendResult.assemble(last)
      return BackendResult.hostEnded({ reason: "interrupted", detail: "No completed child message" })
    }),
  }
}
