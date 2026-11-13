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
  text: string
  startChanged: boolean
  endChanged: boolean
  textChanged: boolean
}

export type FileStatus = "not_yet_read" | "read" | "failed"

export type Fill = "complete" | "failed"

export type Light = "not_in_corpus" | "search_miss" | "dropped_before_model" | "sent"

export type PassName = "reparse" | "rechunk" | "redo_numbers" | "orphan_delete"

export type NumericType = "float32" | "int8" | "binary"

export type Metric = "cosine" | "dot" | "distance"

export type Sense = "off" | "missing" | "fused"

export interface Pipeline {
  parser: string
  boundary: string
  tokenizer: string
  lexical: true
  embedding: boolean
  embeddingModel: string
  queryModel: string
  dimension: number
  numericType: NumericType
  metric: Metric
  k: number
}

export type PipelineField =
  | "parser"
  | "boundary"
  | "tokenizer"
  | "k"
  | "embedding_model"
  | "query_model"
  | "dimension"
  | "numeric_type"
  | "metric"

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
  sense: Sense
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
