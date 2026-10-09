export * as BackendWork from "./backend-work"
export * as SeatWork from "./backend-work"

import { Effect } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { MessageV2 } from "@/session/message-v2"
import type { SessionID } from "@/session/schema"
import { BackendResult } from "./backend-result"
import type { Seat } from "./seats"

// F4 cl.6: stream the shared work-result contract onto the Task part as `metadata.workResult`.
// Definition supplies the fenced tag, schema id and memory capability; seats without workResult opt out.
export function track(input: {
  readonly enabled: boolean
  readonly seat?: Seat
  readonly sessionID: SessionID
  // Host fact: the logical task bound to the child (F2.11); absent for a seat without a binding.
  readonly taskId?: string
  // Host fact: the write roots ToolSafety enforces for the child (F2.14); empty means read-only.
  readonly writeRoots?: ReadonlyArray<string>
  readonly publish: (workResult: BackendResult.WorkResult) => Effect.Effect<void>
}) {
  const evidence: { value?: BackendResult.WorkResult } = {}
  const returned: { value?: BackendResult.WorkResult } = {}
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
    record: Effect.fn("SeatWork.record")(function* (message: SessionV1.WithParts) {
      if (!input.enabled) return
      const snapshot = structuredClone(message)
      const captured = yield* bound(BackendResult.assemble(snapshot, yield* history(), input.seat))
      returned.value = captured
      evidence.value = captured
      yield* input.publish(captured)
      return captured
    }),
    // When the host ends the Task before or instead of the child's final message, stream the work result it can
    // stand behind: the card already assembled, else the child's last assistant message, else no card.
    hostEnded: Effect.fn("SeatWork.hostEnded")(function* (
      reason: "failed" | "interrupted" | "running",
      detail: string,
    ) {
      if (!input.enabled) return
      const session = evidence.value ? [] : yield* history()
      evidence.value = evidence.value
        ? { ...evidence.value, terminal: { reason, hostDetail: detail } }
        : yield* bound(BackendResult.hostEnded({ message: lastAssistant(session), session, reason, detail }, input.seat))
      yield* input.publish(evidence.value)
    }),
    // Compatibility accessor only: never reselect a resumed child's newer assistant for an older dispatch.
    notice: (_state: "completed" | "error", _text: string) => Effect.succeed(returned.value),
  }
}

function lastAssistant(messages: readonly SessionV1.WithParts[]) {
  return messages.findLast((message) => message.info.role === "assistant")
}
