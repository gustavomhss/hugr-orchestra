import type { MessageID, SessionID } from "@/session/schema"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { ArchiveReference, MemoryArtifact, MemorySnapshot } from "./memory-types"

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
    artifact?.version === 3 && Array.isArray(artifact.items) && artifact.items.length > 0 &&
    nonempty(context.sessionID) &&
    artifact.parentID === context.sessionID &&
    nonempty(artifact.producerID) && artifact.producerID !== context.sessionID &&
    nonempty(artifact.boundary) && artifact.boundary === context.boundary &&
    nonempty(artifact.tailStart) && artifact.tailStart === context.tailStart &&
    nonempty(artifact.coveredThrough) && artifact.coveredThrough !== artifact.tailStart &&
    artifact.coveredThrough !== artifact.boundary &&
    nonempty(artifact.memory) && nonempty(artifact.text) &&
    Array.isArray(artifact.references) &&
    artifact.references.every((reference) => validReference(reference) && nonempty(reference.why)) &&
    new Set(artifact.references.map((reference) => reference.id)).size === artifact.references.length
  )
}

export function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function validReference(reference: ArchiveReference) {
  return reference != null && typeof reference.id === "string" && /^[a-f0-9]{64}$/.test(reference.id) &&
    nonempty(reference.title) && nonempty(reference.first) && nonempty(reference.last) &&
    Number.isSafeInteger(reference.bytes) && reference.bytes > 0
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
  if (index < 0 || boundary < index || messages[index].info.role !== "user" || covered !== index - 1) return
  return index
}

export function validSnapshot(captured: MemorySnapshot) {
  const messages = [...captured.head, ...captured.tail]
  if (!captured.head.length || !captured.tail.length || !ownedHistory(captured.sessionID, messages) ||
    captured.tail[0].info.role !== "user" || captured.tailStart !== captured.tail[0].info.id ||
    captured.boundary !== captured.tail.at(-1)?.info.id) return false
  if (!captured.previous) return true
  return tailIndex({ sessionID: captured.sessionID, boundary: captured.previous.boundary,
    tailStart: captured.previous.tailStart, text: captured.previous.text, artifact: captured.previous }, messages) === 0
}

export function isCurrent(snapshot: Snapshot, latest: MessageID | undefined) {
  return snapshot.boundary === latest
}
