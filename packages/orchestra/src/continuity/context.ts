import type { SessionID } from "@/session/schema"
import { completeIndex, hasArtifact, tailIndex, type ContinuityContext } from "./model"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { Prepared } from "./memory-types"
import { RequestSource } from "./request-source"

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
    prepare(sessionID: SessionID, messages: SessionV1.WithParts[], original?: SessionV1.WithParts): Prepared {
      const entry = entries.get(sessionID)
      if (!entry || !hasArtifact(entry)) return { messages, system: [] }
      if (entry.artifact.version === 5) {
        const index = completeIndex(entry, messages)
        if (index === undefined) { entries.delete(sessionID); return { messages, system: [] } }
        const current = RequestSource.latest(messages, original, sessionID)
        const newer = messages.slice(index)
        return { messages: [...current && !newer.includes(current) ? [current] : [], ...newer], system: [entry.artifact.text],
          coverage: { version: 5, boundary: entry.boundary, coveredThrough: entry.artifact.coveredThrough, currentUserID: current?.info.id } }
      }
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
