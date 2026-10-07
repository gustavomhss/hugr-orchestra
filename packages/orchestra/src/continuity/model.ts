import type { MessageID, SessionID } from "@/session/schema"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { MemoryArtifact, MemorySnapshot } from "./memory-types"

export type Snapshot = {
  sessionID: SessionID
  boundary: MessageID
  tailStart: MessageID
}

export type ContinuityContext = Snapshot & {
  text: string
  artifact?: MemoryArtifact
}

// The decoder owns transport validation. These checks establish compatibility,
// ownership and coverage, never semantic accuracy of the historical memory.
export function hasArtifact(
  context: ContinuityContext,
): context is ContinuityContext & { artifact: MemoryArtifact } {
  const artifact = context.artifact
  return (
    artifact?.version === 4 && Array.isArray(artifact.items) && Number.isSafeInteger(artifact.next) &&
    nonempty(context.sessionID) &&
    artifact.parentID === context.sessionID &&
    nonempty(artifact.producerID) && artifact.producerID !== context.sessionID &&
    nonempty(artifact.boundary) && artifact.boundary === context.boundary &&
    nonempty(artifact.tailStart) && artifact.tailStart === context.tailStart &&
    nonempty(artifact.coveredThrough) && artifact.coveredThrough !== artifact.tailStart &&
    artifact.coveredThrough !== artifact.boundary &&
    nonempty(artifact.text)
  )
}

export function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function ownedHistory(sessionID: SessionID, messages: SessionV1.WithParts[]) {
  return nonempty(sessionID) && new Set(messages.map((message) => message.info.id)).size === messages.length &&
    messages.every((message) => nonempty(message.info.id) && message.info.sessionID === sessionID &&
      (message.info.role === "user" || message.info.role === "assistant") &&
      message.parts.every((part) => part.sessionID === sessionID && part.messageID === message.info.id))
}

export function tailIndex(context: ContinuityContext, messages: SessionV1.WithParts[]) {
  if (!hasArtifact(context) || !ownedHistory(context.sessionID, messages)) return
  const index = messages.findIndex((message) => message.info.id === context.tailStart)
  const boundary = messages.findIndex((message) => message.info.id === context.boundary)
  const covered = messages.findIndex((message) => message.info.id === context.artifact.coveredThrough)
  // An absent covered prefix is valid only if the history starts at the native tail.
  // The tail may start inside a turn: a long turn is cut between its steps.
  if (index < 0 || boundary < index || covered !== index - 1) return
  return index
}

export function validSnapshot(captured: MemorySnapshot) {
  const messages = [...captured.head, ...captured.tail]
  if (!captured.head.length || !captured.tail.length || !ownedHistory(captured.sessionID, messages) ||
    captured.tailStart !== captured.tail[0].info.id ||
    captured.boundary !== captured.tail.at(-1)?.info.id) return false
  if (!captured.previous) return true
  return tailIndex({ sessionID: captured.sessionID, boundary: captured.previous.boundary,
    tailStart: captured.previous.tailStart, text: captured.previous.text, artifact: captured.previous }, messages) === 0
}

/** A snapshot stays applicable while its boundary is still in the history; later steps only extend the native tail. */
export function isCurrent(snapshot: Snapshot, history: readonly { info: { id: MessageID } }[]) {
  return history.some((message) => message.info.id === snapshot.boundary)
}
