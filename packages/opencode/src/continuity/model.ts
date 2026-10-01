import type { MessageID, SessionID } from "@/session/schema"
import type { MaterializedArtifact } from "./types"

export const threshold = 50_000

export type Snapshot = {
  sessionID: SessionID
  boundary: MessageID
  tailStart: MessageID
}

export type ContinuityContext = Snapshot & {
  text: string
  artifact?: MaterializedArtifact
}

// The fork parser owns body validation and exact materialization. This boundary
// checks compatibility and ownership, not semantic selection or entailment.
export function hasArtifact(
  context: ContinuityContext,
): context is ContinuityContext & { artifact: MaterializedArtifact } {
  const artifact = context.artifact
  return (
    artifact?.envelope?.version === 1 &&
    artifact.envelope.kind === "continuity_handoff" &&
    artifact.envelope.parentID === context.sessionID &&
    artifact.envelope.producerID !== context.sessionID &&
    artifact.envelope.boundary === context.boundary &&
    artifact.envelope.tailStart === context.tailStart &&
    artifact.body?.status === "ready" &&
    typeof artifact.text === "string" &&
    artifact.text.trim().length > 0 &&
    Array.isArray(artifact.sources) &&
    artifact.sources.every((source) => source.parentID === context.sessionID)
  )
}

export function isCurrent(snapshot: Snapshot, latest: MessageID | undefined) {
  return snapshot.boundary === latest
}
