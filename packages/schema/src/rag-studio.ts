export * as RagStudio from "./rag-studio"

import { Schema } from "effect"

export const FileStatus = Schema.Literals(["not_yet_read", "read", "failed"]).annotate({
  identifier: "RagStudioFileStatus",
})
export type FileStatus = typeof FileStatus.Type

export const Light = Schema.Literals(["not_in_corpus", "search_miss", "dropped_before_model", "sent"]).annotate({
  identifier: "RagStudioLight",
})
export type Light = typeof Light.Type

export const PassName = Schema.Literals(["reparse", "rechunk", "redo_numbers", "orphan_delete"]).annotate({
  identifier: "RagStudioPassName",
})
export type PassName = typeof PassName.Type

export const Fill = Schema.Literals(["complete", "failed"]).annotate({ identifier: "RagStudioFill" })
export type Fill = typeof Fill.Type

export const PipelineField = Schema.Literals(["parser", "boundary", "tokenizer", "k"]).annotate({
  identifier: "RagStudioPipelineField",
})
export type PipelineField = typeof PipelineField.Type

export interface Source extends Schema.Schema.Type<typeof Source> {}
export const Source = Schema.Struct({
  id: Schema.String,
  locationId: Schema.String,
  path: Schema.String,
  contentHash: Schema.String,
  status: FileStatus,
}).annotate({ identifier: "RagStudioSource" })

export interface Chunk extends Schema.Schema.Type<typeof Chunk> {}
export const Chunk = Schema.Struct({
  id: Schema.String,
  sourceId: Schema.String,
  start: Schema.Int,
  end: Schema.Int,
  text: Schema.String,
  sourceHash: Schema.String,
}).annotate({ identifier: "RagStudioChunk" })

export interface Pipeline extends Schema.Schema.Type<typeof Pipeline> {}
export const Pipeline = Schema.Struct({
  parser: Schema.String,
  boundary: Schema.String,
  tokenizer: Schema.String,
  lexical: Schema.Literal(true),
  embedding: Schema.Literal(false),
  k: Schema.Int,
}).annotate({ identifier: "RagStudioPipeline" })

export interface Revision extends Schema.Schema.Type<typeof Revision> {}
export const Revision = Schema.Struct({
  id: Schema.String,
  snapshot: Schema.String,
  pipelineHash: Schema.String,
  fill: Fill,
}).annotate({ identifier: "RagStudioRevision" })

export interface Span extends Schema.Schema.Type<typeof Span> {}
export const Span = Schema.Struct({
  sourceId: Schema.String,
  start: Schema.Int,
  end: Schema.Int,
}).annotate({ identifier: "RagStudioSpan" })

export interface Reasons extends Schema.Schema.Type<typeof Reasons> {}
export const Reasons = Schema.Struct({
  not_in_corpus: Schema.String,
  search_miss: Schema.String,
  dropped_before_model: Schema.String,
  sent: Schema.String,
}).annotate({ identifier: "RagStudioReasons" })

export interface QuestionResult extends Schema.Schema.Type<typeof QuestionResult> {}
export const QuestionResult = Schema.Struct({
  revisionId: Schema.String,
  light: Schema.NullOr(Light),
  reasons: Reasons,
  fileStatus: Schema.NullOr(FileStatus),
  span: Schema.NullOr(Span),
  hits: Schema.Array(Schema.String),
  dropped: Schema.Array(Schema.String),
  promptText: Schema.String,
  promptChunkIds: Schema.Array(Schema.String),
  retrievalOptional: Schema.Boolean,
}).annotate({ identifier: "RagStudioQuestionResult" })

export const AdmitResult = Schema.Union([Source, Schema.Struct({ refused: Schema.Literals(["atlas", "permission"]) })]).annotate({
  identifier: "RagStudioAdmitResult",
})
export type AdmitResult = typeof AdmitResult.Type

export const PathInput = Schema.Struct({ path: Schema.String }).annotate({ identifier: "RagStudioPathInput" })
export type PathInput = typeof PathInput.Type

export interface SourceDetail extends Schema.Schema.Type<typeof SourceDetail> {}
export const SourceDetail = Schema.Struct({
  source: Source,
  text: Schema.String,
  chunks: Schema.Array(Chunk),
}).annotate({ identifier: "RagStudioSourceDetail" })

export const SearchInput = Schema.Struct({ revisionId: Schema.String, word: Schema.String }).annotate({
  identifier: "RagStudioSearchInput",
})
export type SearchInput = typeof SearchInput.Type

export const AskInput = Schema.Struct({ revisionId: Schema.String, text: Schema.String }).annotate({
  identifier: "RagStudioAskInput",
})
export type AskInput = typeof AskInput.Type

export const QuestionInput = Schema.Struct({
  revisionId: Schema.String,
  text: Schema.String,
  span: Span,
}).annotate({ identifier: "RagStudioQuestionInput" })
export type QuestionInput = typeof QuestionInput.Type

export const ProofInput = Schema.Struct({ revisionId: Schema.String }).annotate({ identifier: "RagStudioProofInput" })
export type ProofInput = typeof ProofInput.Type

export const CitationInput = Schema.Struct({ sentence: Schema.String }).annotate({
  identifier: "RagStudioCitationInput",
})
export type CitationInput = typeof CitationInput.Type

export const CompareInput = Schema.Struct({
  leftId: Schema.String,
  rightId: Schema.String,
  proofSetId: Schema.String,
}).annotate({ identifier: "RagStudioCompareInput" })
export type CompareInput = typeof CompareInput.Type

export const CompareResult = Schema.Union([
  Schema.Struct({ rejected: Schema.Literal(true) }),
  Schema.Struct({
    questions: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        startChanged: Schema.Boolean,
        endChanged: Schema.Boolean,
        textChanged: Schema.Boolean,
      }),
    ),
  }),
]).annotate({ identifier: "RagStudioCompareResult" })
export type CompareResult = typeof CompareResult.Type

export const PassInput = Schema.Struct({ pass: PassName, sourceId: Schema.String }).annotate({
  identifier: "RagStudioPassInput",
})
export type PassInput = typeof PassInput.Type

export const PassResult = Schema.Union([
  Schema.Struct({ pass: Schema.Literal("redo_numbers"), result: Schema.Literal("not_applicable") }),
  Schema.Struct({ pass: PassName, fill: Fill }),
]).annotate({ identifier: "RagStudioPassResult" })
export type PassResult = typeof PassResult.Type

export const PassesInput = Schema.Struct({ passes: Schema.Array(PassName) }).annotate({
  identifier: "RagStudioPassesInput",
})
export type PassesInput = typeof PassesInput.Type

export const IdResult = Schema.Struct({ id: Schema.String }).annotate({ identifier: "RagStudioIdResult" })
export type IdResult = typeof IdResult.Type

export const BoolResult = Schema.Struct({ ok: Schema.Boolean }).annotate({ identifier: "RagStudioBoolResult" })
export type BoolResult = typeof BoolResult.Type

export const PipelineUpdate = Schema.Struct({
  field: PipelineField,
  value: Schema.Union([Schema.String, Schema.Number]),
}).annotate({ identifier: "RagStudioPipelineUpdate" })
export type PipelineUpdate = typeof PipelineUpdate.Type
