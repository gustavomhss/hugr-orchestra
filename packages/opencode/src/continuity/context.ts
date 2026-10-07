import type { SessionID } from "@/session/schema"
import { hasArtifact, tailIndex, type ContinuityContext } from "./model"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

export function create() {
  const entries = new Map<SessionID, ContinuityContext>()
  return {
    get(sessionID: SessionID) {
      return entries.get(sessionID)
    },
    set(context: ContinuityContext) {
      if (context.artifact && !hasArtifact(context)) return false
      entries.set(context.sessionID, {
        sessionID: context.sessionID,
        boundary: context.boundary,
        tailStart: context.tailStart,
        text: context.artifact?.text ?? context.text,
        artifact: context.artifact,
      })
      return true
    },
    discard(sessionID: SessionID) {
      entries.delete(sessionID)
    },
    prepare(sessionID: SessionID, messages: SessionV1.WithParts[]): { messages: SessionV1.WithParts[]; system: string[] } {
      const entry = entries.get(sessionID)
      if (!entry || !hasArtifact(entry)) return { messages, system: [] }
      const index = tailIndex(entry, messages)
      if (index === undefined) return { messages, system: [] }
      // A tail cut inside a turn opens with that turn's user message, so the request still starts with the user.
      const opener = messages[index].info.role === "user" ? undefined : messages.slice(0, index).findLast((message) => message.info.role === "user")
      return {
        messages: [...opener ? [opener] : [], ...messages.slice(index)],
        system: [entry.artifact.text],
      }
    },
  }
}
