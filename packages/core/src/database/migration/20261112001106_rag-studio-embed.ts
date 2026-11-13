import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261112001106_rag-studio-embed",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`rag_vector\` (
          \`chunk_id\` text NOT NULL,
          \`model\` text NOT NULL,
          \`location_id\` text NOT NULL,
          \`values\` text NOT NULL,
          CONSTRAINT \`rag_vector_pk\` PRIMARY KEY(\`chunk_id\`, \`model\`)
        );
      `)
      yield* tx.run(`ALTER TABLE \`rag_pipeline\` ADD \`embedding_model\` text DEFAULT '' NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`rag_pipeline\` ADD \`query_model\` text DEFAULT '' NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`rag_pipeline\` ADD \`dimension\` integer DEFAULT 0 NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`rag_pipeline\` ADD \`numeric_type\` text DEFAULT 'float32' NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`rag_pipeline\` ADD \`metric\` text DEFAULT 'cosine' NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`rag_revision\` ADD \`embedding_model\` text DEFAULT '' NOT NULL;`)
      yield* tx.run(`CREATE INDEX \`rag_vector_location_idx\` ON \`rag_vector\` (\`location_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
