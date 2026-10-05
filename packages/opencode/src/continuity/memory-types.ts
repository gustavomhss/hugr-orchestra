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

export type MemoryBody = {
  memory: string
  references: { id: string; why: string }[]
}

export type MemoryArtifact = {
  version: 2
  parentID: SessionID
  producerID: SessionID
  boundary: MessageID
  coveredThrough: MessageID
  tailStart: MessageID
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
