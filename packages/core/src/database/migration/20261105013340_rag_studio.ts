import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105013340_rag_studio",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`rag_chunk\` (
          \`id\` text PRIMARY KEY,
          \`source_id\` text NOT NULL,
          \`location_id\` text NOT NULL,
          \`start\` integer NOT NULL,
          \`end\` integer NOT NULL,
          \`text\` text NOT NULL,
          \`source_hash\` text NOT NULL,
          \`boundary\` text NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`rag_pipeline\` (
          \`location_id\` text PRIMARY KEY,
          \`parser\` text NOT NULL,
          \`boundary\` text NOT NULL,
          \`tokenizer\` text NOT NULL,
          \`k\` integer NOT NULL,
          \`blocked\` integer DEFAULT 0 NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`rag_question\` (
          \`id\` text PRIMARY KEY,
          \`revision_id\` text NOT NULL,
          \`text\` text NOT NULL,
          \`span_source_id\` text NOT NULL,
          \`span_start\` integer NOT NULL,
          \`span_end\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`rag_revision_source\` (
          \`revision_id\` text NOT NULL,
          \`source_id\` text NOT NULL,
          \`content_hash\` text NOT NULL,
          CONSTRAINT \`rag_revision_source_pk\` PRIMARY KEY(\`revision_id\`, \`source_id\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`rag_revision\` (
          \`id\` text PRIMARY KEY,
          \`location_id\` text NOT NULL,
          \`snapshot\` text NOT NULL,
          \`pipeline_hash\` text NOT NULL,
          \`fill\` text NOT NULL,
          \`parser\` text NOT NULL,
          \`boundary\` text NOT NULL,
          \`tokenizer\` text NOT NULL,
          \`k\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`rag_source\` (
          \`id\` text PRIMARY KEY,
          \`location_id\` text NOT NULL,
          \`path\` text NOT NULL,
          \`content_hash\` text NOT NULL,
          \`status\` text NOT NULL,
          \`reparsed_hash\` text
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`rag_trace\` (
          \`question_id\` text PRIMARY KEY,
          \`hits\` text NOT NULL,
          \`dropped\` text NOT NULL,
          \`k\` integer
        );
      `)
      yield* tx.run(`CREATE INDEX \`rag_chunk_source_idx\` ON \`rag_chunk\` (\`source_id\`);`)
      yield* tx.run(`CREATE INDEX \`rag_chunk_location_idx\` ON \`rag_chunk\` (\`location_id\`);`)
      yield* tx.run(`CREATE INDEX \`rag_source_location_path\` ON \`rag_source\` (\`location_id\`,\`path\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
