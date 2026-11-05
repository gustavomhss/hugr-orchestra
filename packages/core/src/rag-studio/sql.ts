import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"

// Corpus tables from docs/specs/rag-studio/SPEC.md. Chunks have no foreign key: removeSource deletes the
// source row and leaves chunks for orphan_delete. Embedding has no column and no vector table.

export const RagSourceTable = sqliteTable(
  "rag_source",
  {
    id: text().primaryKey(),
    location_id: text().notNull(),
    path: text().notNull(),
    content_hash: text().notNull(),
    status: text().notNull(),
    reparsed_hash: text(),
  },
  (table) => [index("rag_source_location_path").on(table.location_id, table.path)],
)

export const RagChunkTable = sqliteTable(
  "rag_chunk",
  {
    id: text().primaryKey(),
    source_id: text().notNull(),
    location_id: text().notNull(),
    start: integer().notNull(),
    end: integer().notNull(),
    text: text().notNull(),
    source_hash: text().notNull(),
    boundary: text().notNull(),
  },
  (table) => [index("rag_chunk_source_idx").on(table.source_id), index("rag_chunk_location_idx").on(table.location_id)],
)

export const RagRevisionTable = sqliteTable("rag_revision", {
  id: text().primaryKey(),
  location_id: text().notNull(),
  snapshot: text().notNull(),
  pipeline_hash: text().notNull(),
  fill: text().notNull(),
  parser: text().notNull(),
  boundary: text().notNull(),
  tokenizer: text().notNull(),
  k: integer().notNull(),
})

export const RagRevisionSourceTable = sqliteTable(
  "rag_revision_source",
  {
    revision_id: text().notNull(),
    source_id: text().notNull(),
    content_hash: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.revision_id, table.source_id] })],
)

export const RagQuestionTable = sqliteTable("rag_question", {
  id: text().primaryKey(),
  revision_id: text().notNull(),
  text: text().notNull(),
  span_source_id: text().notNull(),
  span_start: integer().notNull(),
  span_end: integer().notNull(),
})

export const RagTraceTable = sqliteTable("rag_trace", {
  question_id: text().primaryKey(),
  hits: text().notNull(),
  dropped: text().notNull(),
  k: integer(),
})

// Not in the spec table list. readPipeline/setPipeline have nowhere else to persist. lexical stays true and
// embedding stays false, so neither is a column.
export const RagPipelineTable = sqliteTable("rag_pipeline", {
  location_id: text().primaryKey(),
  parser: text().notNull(),
  boundary: text().notNull(),
  tokenizer: text().notNull(),
  k: integer().notNull(),
  blocked: integer().notNull().default(0),
})
