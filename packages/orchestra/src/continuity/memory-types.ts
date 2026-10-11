import type { SessionV1 } from "@orchestra/core/v1/session"
import type { MessageID, SessionID } from "@/session/schema"

export type ArchiveReference = {
  id: string
  title: string
  first: MessageID
  last: MessageID
  bytes: number
}

export type ArchiveChunk = ArchiveReference & { markdown: string }

export const SECTIONS = ["objective", "rules", "decisions", "findings", "failures", "values", "plan"] as const
export type Section = (typeof SECTIONS)[number]

/** One live memory item. The host assigns the ID, stores located strings as source bytes and renders it. */
export type MemoryItem = {
  id: string
  section: Section
  fields: Readonly<Record<string, string | readonly string[]>>
  src: readonly string[]
}

export type PartialArtifact = {
  version: 4
  parentID: SessionID
  producerID: SessionID
  boundary: MessageID
  coveredThrough: MessageID
  tailStart: MessageID
  items: MemoryItem[]
  /** The next item number; IDs are never reused. */
  next: number
  /** The rendered block, injected as is. */
  text: string
}

export type Now = { doing: string; next: string; src: readonly string[] }
export type MemoryReview = {
  version: 1
  state: "active" | "waiting" | "closed"
  next: "continue" | "verify" | "ask-user" | "wait-user"
  critical: readonly string[]
  digest: string
}
export type MemoryChecklist = { version: 1; critical: readonly string[]; digest: string }
export type CompleteArtifact = Omit<PartialArtifact, "version" | "tailStart"> & {
  version: 5
  tailStart?: never
  now: Now
  /** Host-owned source fingerprint inventory, not producer-authored coverage. */
  covered: readonly { id: MessageID; digest: string }[]
  /** Host-owned review receipt; absence identifies an older unaudited v5 artifact. */
  review?: MemoryReview
  /** Host-executed retention/integrity checks, not an independent semantic review. */
  checklist?: MemoryChecklist
}
export type MemoryArtifact = PartialArtifact | CompleteArtifact
export type Coverage = { version: 5; boundary: MessageID; coveredThrough: MessageID; currentUserID?: MessageID }
export type Prepared = { messages: SessionV1.WithParts[]; system: string[]; coverage?: Coverage }

/** Host data the producer never writes. */
export type Host = {
  /** The full stored session history; aliases are computed from it. */
  history: SessionV1.WithParts[]
  /** Background registry status and member agent per delegated child session. */
  delegations: Readonly<Record<string, { member?: string; status?: string }>>
  /** A member session renders "Delegator" headings: its user text is the delegating agent's brief. */
  member: boolean
}

export type MemorySnapshot = {
  sessionID: SessionID
  boundary: MessageID
  tailStart?: MessageID
  complete?: true
  /** Entire declared prefix, including prior coverage on an incremental complete pass. */
  covered?: SessionV1.WithParts[]
  head: SessionV1.WithParts[]
  tail: SessionV1.WithParts[]
  previous?: MemoryArtifact
  canRecall: boolean
  /** Ceiling on the native tail; a longer last turn is cut between its steps. */
  tailTokens?: number
}
