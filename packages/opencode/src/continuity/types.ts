import type { MessageID, PartID, SessionID } from "@/session/schema"

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type SourceLocator = {
  messageID: MessageID
  partID: PartID | null
  field: "part" | "system"
  path: (string | number)[]
}

export type SourceDescriptor = {
  id: string
  parentID: SessionID
  locator: SourceLocator
  role: "user" | "assistant" | "tool"
  kind: "text" | "json" | "file"
  origin: "head" | "prior"
  order: number
  actor: string | null
  scope: string | null
  extent: "full" | "preview" | "cleared" | "unknown" | "unavailable"
  recoverable: boolean
  digest: string
  exit: number | null
}

export type SourceUnit = SourceDescriptor & { value?: JsonValue }

export type ExactReason = "constraint" | "identifier" | "evidence"
export type NoteKind = "intent" | "decision" | "work" | "correction" | "pending" | "unknown"
export type NoteState =
  | "requested" | "proposed" | "superseded" | "accepted" | "disputed"
  | "attempted" | "execution_completed" | "failed" | "verified" | "blocked"
  | "unknown" | "corrected" | "retracted" | "awaiting_approval"

export type HandoffBody = {
  status: "ready" | "needs_context"
  exact: { source: string; reason: ExactReason }[]
  notes: {
    kind: NoteKind
    state: NoteState
    text: string
    actor: string | null
    scope: string | null
    sources: string[]
  }[]
  reference_only: { source: string; purpose: string; retrieve_when: string }[]
  omissions: {
    sources: string[]
    reason: "duplicate" | "superseded" | "resolved" | "outside_scope" | "repeated_noise"
    replacement_sources: string[]
  }[]
  issues: {
    code: "missing_source" | "ambiguous_scope" | "conflicting_evidence" | "unsupported_reference"
      | "protected_over_budget" | "unsupported_prior" | "empty_handoff"
    detail: string
    sources: string[]
  }[]
}

export type ArtifactEnvelope = {
  version: 1
  kind: "continuity_handoff"
  parentID: SessionID
  producerID: SessionID
  boundary: MessageID
  coveredThrough: MessageID
  tailStart: MessageID
}

export type ExactValue = { source: string; reason: ExactReason; value: JsonValue }

export type MaterializedArtifact = {
  envelope: ArtifactEnvelope
  body: HandoffBody
  exact: ExactValue[]
  sources: SourceDescriptor[]
  text: string
}

export type SourceCatalogue = {
  parentID: SessionID
  units: SourceUnit[]
  previous: MaterializedArtifact | null
  canRecall: boolean
}

export type ArtifactResult =
  | { ok: true; artifact: MaterializedArtifact }
  | { ok: false; reason: string }
