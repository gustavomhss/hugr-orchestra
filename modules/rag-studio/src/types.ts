// The shapes from docs/specs/rag-studio/seam.ts. Production code keeps them here so a relative import does not leave the package.

export interface Chunk {
  id: string
  sourceId: string
  start: number
  end: number
  text: string
  sourceHash: string
}

export interface CompareRow {
  id: string
  startChanged: boolean
  endChanged: boolean
  textChanged: boolean
}

export type FileStatus = "not_yet_read" | "read" | "failed"

export type Fill = "complete" | "failed"

export type Light = "not_in_corpus" | "search_miss" | "dropped_before_model" | "sent"

export type PassName = "reparse" | "rechunk" | "redo_numbers" | "orphan_delete"

export interface Pipeline {
  parser: string
  boundary: string
  tokenizer: string
  lexical: true
  embedding: false
  k: number
}

export type PipelineField = "parser" | "boundary" | "tokenizer" | "k"

export interface QuestionResult {
  revisionId: string
  light: Light | null
  reasons: Record<Light, string>
  fileStatus: FileStatus | null
  span: SpanRef | null
  hits: string[]
  dropped: string[]
  promptText: string
  promptChunkIds: string[]
  retrievalOptional: boolean
}

export interface Revision {
  id: string
  snapshot: string
  pipelineHash: string
  fill: Fill
}

export interface Source {
  id: string
  locationId: string
  path: string
  contentHash: string
  status: FileStatus
}

export interface SpanRef {
  sourceId: string
  start: number
  end: number
}
