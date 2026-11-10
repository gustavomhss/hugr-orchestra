import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261110002451_eminent_sphinx",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`economy_attempt\` (
          \`envelope_id\` text NOT NULL,
          \`logical_request_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`admission_key\` text NOT NULL,
          \`fingerprint\` text NOT NULL,
          \`body_digest\` text NOT NULL,
          \`body_snapshot\` text NOT NULL,
          \`snapshot\` text NOT NULL,
          \`route\` text NOT NULL,
          \`endpoint\` text NOT NULL,
          \`protocol\` text NOT NULL,
          \`predecessor\` text,
          \`state\` text NOT NULL,
          \`forward_intent\` integer NOT NULL,
          \`forward_observed\` integer NOT NULL,
          \`terminal\` integer,
          \`slot_released\` integer NOT NULL,
          \`bound_json\` text NOT NULL,
          \`usage_json\` text,
          \`evidence_digest\` text,
          \`evidence_json\` text,
          \`completion_ref\` text,
          \`semantic\` text,
          CONSTRAINT \`economy_attempt_pk\` PRIMARY KEY(\`envelope_id\`, \`logical_request_id\`, \`ordinal\`),
          CONSTRAINT \`fk_economy_attempt_envelope_id_economy_envelope_envelope_id_fk\` FOREIGN KEY (\`envelope_id\`) REFERENCES \`economy_envelope\`(\`envelope_id\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`economy_envelope\` (
          \`envelope_id\` text PRIMARY KEY,
          \`authority_id\` text NOT NULL,
          \`storage_id\` text NOT NULL,
          \`policy_digest\` text NOT NULL,
          \`scope\` text NOT NULL,
          \`provider\` text NOT NULL,
          \`model\` text NOT NULL,
          \`route\` text NOT NULL,
          \`stages_json\` text NOT NULL,
          \`limits_json\` text NOT NULL,
          \`retry_json\` text NOT NULL,
          \`blocked\` integer NOT NULL
        );
      `)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`economy_attempt_admission_key_idx\` ON \`economy_attempt\` (\`envelope_id\`,\`admission_key\`);`,
      )
      yield* tx.run(`CREATE INDEX \`economy_attempt_envelope_idx\` ON \`economy_attempt\` (\`envelope_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
