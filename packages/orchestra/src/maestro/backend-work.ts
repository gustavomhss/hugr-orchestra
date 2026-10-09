export * as BackendWork from "./backend-work"
export * as SeatWork from "./backend-work"

import { Effect } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { MessageV2 } from "@/session/message-v2"
import type { SessionID } from "@/session/schema"
import { BackendResult } from "./backend-result"
import { DiscoveryResult } from "./discovery-result"
import { ResearchRecords } from "@orchestra/core/research/records"
import type { Seat } from "./seats"

// F4 cl.6: stream the shared work-result contract onto the Task part as `metadata.workResult`.
// Definition supplies the fenced tag, schema id and memory capability; seats without workResult opt out.
export function track(input: {
  readonly enabled: boolean
  readonly seat?: Seat
  readonly sessionID: SessionID
  // Host fact: the logical task bound to the child (F2.11); absent for a seat without a binding.
  readonly taskId?: string
  readonly research?: ResearchRecords.Interface
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
  const assemble = (message: SessionV1.WithParts, session: readonly SessionV1.WithParts[]) =>
    input.seat?.id === "jimmy" && input.seat.workResult === "discovery-work-result-v1"
       ? DiscoveryResult.assemble(message, session).pipe(input.research ? Effect.provideService(ResearchRecords.Service, input.research) : (effect) => effect)
      : Effect.succeed(BackendResult.assemble(message, session, input.seat))
  const hostEnded = (message: SessionV1.WithParts | undefined, session: readonly SessionV1.WithParts[], reason: "failed" | "interrupted" | "running", detail: string) =>
    message && input.seat?.id === "jimmy" && input.seat.workResult === "discovery-work-result-v1"
      ? assemble(message, session).pipe(Effect.map((result) => ({ ...result, terminal: { reason, hostDetail: detail } })))
      : Effect.succeed({
          ...BackendResult.hostEnded({ message, session, reason, detail }, input.seat),
          ...(input.seat?.id === "jimmy" && input.seat.workResult === "discovery-work-result-v1" ? { referencesChecked: false } : {}),
        })

  return {
    attach: <T extends object>(metadata: T) => ({
      ...metadata,
      ...(evidence.value ? { workResult: evidence.value } : {}),
    }),
    record: Effect.fn("SeatWork.record")(function* (message: SessionV1.WithParts) {
      if (!input.enabled) return
      evidence.value = yield* bound(yield* assemble(message, yield* history()))
      yield* input.publish(evidence.value)
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
        : yield* bound(yield* hostEnded(latestAssistant(session), session, reason, detail))
      yield* input.publish(evidence.value)
    }),
    // F4 cl.6/35: the Task part already completed with terminal `running`, so the background completion notice carries
    // the final work result, read from the child's durable last assistant message (a resumed job may have run several
    // turns).
    notice: Effect.fn("SeatWork.notice")(function* (state: "completed" | "error", text: string) {
      if (!input.enabled) return undefined
      const session = yield* history()
      const last = latestAssistant(session)
      if (state === "error")
        return yield* bound(yield* hostEnded(last, session, "failed", text))
      if (last) return yield* bound(yield* assemble(last, session))
      return yield* bound(
        yield* hostEnded(undefined, session, "interrupted", "No completed child message"),
      )
    }),
  }
}

function latestAssistant(messages: readonly SessionV1.WithParts[]) {
  // MessageV2.stream returns newest-first; the final worker turn is the first assistant in that projection.
  return messages.find((message) => message.info.role === "assistant")
}
