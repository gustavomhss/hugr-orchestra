import type { SessionV1 } from "@opencode-ai/core/v1/session"
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

export type MemoryArtifact = {
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
  tailStart: MessageID
  head: SessionV1.WithParts[]
  tail: SessionV1.WithParts[]
  previous?: MemoryArtifact
  canRecall: boolean
}
