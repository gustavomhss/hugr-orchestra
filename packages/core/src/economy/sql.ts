// @orchestra/core — src/economy/sql.ts (G1 / F2)
//
// Envelope/attempt ledger relations. RED BASELINE: declared schema only; the migration lands with
// the green implementation (contract §2.1). Snake_case fields per repo style.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const economyEnvelope = sqliteTable("economy_envelope", {
  envelope_id: text().primaryKey(),
  authority_id: text().notNull(),
  policy_digest: text().notNull(),
  scope: text().notNull(),
  provider: text().notNull(),
  model: text().notNull(),
  limits_json: text().notNull(),
  retry_json: text().notNull(),
  blocked: integer().notNull(),
})

export const economyAttempt = sqliteTable("economy_attempt", {
  envelope_id: text().notNull(),
  logical_request_id: text().notNull(),
  ordinal: integer().notNull(),
  predecessor: text(),
  admission_key: text().notNull().unique(),
  settlement_state: text().notNull(),
  usage_json: text(),
  evidence_digest: text(),
})
