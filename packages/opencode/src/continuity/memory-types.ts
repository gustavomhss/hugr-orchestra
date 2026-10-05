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

export const SECTIONS = ["objective", "constraints", "corrections", "failures", "open", "decisions", "findings", "state"] as const
export type Section = (typeof SECTIONS)[number]

/**
 * One idea in working memory. The producer fills the fixed fields of its section; the host
 * renders them with a fixed template, assigns IDs and carries unchanged items forward exactly.
 */
export type MemoryItem = {
  id: string
  section: Section
  fields: Readonly<Record<string, string>>
  refs: string[]
  /** The user's exact words, verified against the referenced archive fragment. */
  quote?: { ref: string; text: string }
}

export type MemoryOp =
  | { op: "add"; section: Section; fields: Readonly<Record<string, string>>; refs?: readonly string[]; quote?: { ref: string; text: string } }
  | { op: "update"; id: string; fields: unknown; refs?: readonly string[] }
  | { op: "retire"; id: string; reason: string; ref?: string }

/** Producer transport: operations against the current items, never a rewritten memory. */
export type MemoryBody = { ops: readonly MemoryOp[] }

export type MemoryArtifact = {
  version: 3
  parentID: SessionID
  producerID: SessionID
  boundary: MessageID
  coveredThrough: MessageID
  tailStart: MessageID
  items: MemoryItem[]
  /** Verbatim user messages from covered history, host-collected. */
  ledger: { message: MessageID; text: string }[]
  /** Tool calls from covered history, host-collected. */
  trail: { message: MessageID; line: string }[]
  /** Rendered items. */
  memory: string
  references: (ArchiveReference & { why: string })[]
  text: string
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
