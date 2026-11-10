// @orchestra/core — src/economy/sql.ts (G1 / F2)
//
// Envelope/attempt ledger relations for the shared physical-attempt economy (contract:
// modules/atlas/docs/design/genesis-g1-contract.md §1–§2, Astra decision 2026-11-09).
// Snake_case fields per repo style. `admission_key` is unique per envelope namespace
// (§1.1 identities; CE-5). Attempt state columns stay separated (§4.4): durable intent,
// observed dispatch, established remote terminus, confirmed usage (unknown stays absent),
// and semantic outcome are never inferred from each other.

import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const EconomyEnvelopeTable = sqliteTable("economy_envelope", {
  envelope_id: text().primaryKey(),
  authority_id: text().notNull(),
  storage_id: text().notNull(),
  policy_digest: text().notNull(),
  scope: text().notNull(),
  provider: text().notNull(),
  model: text().notNull(),
  route: text().notNull(),
  stages_json: text().notNull(),
  limits_json: text().notNull(),
  retry_json: text().notNull(),
  blocked: integer().notNull(),
})

export const EconomyAttemptTable = sqliteTable(
  "economy_attempt",
  {
    envelope_id: text()
      .notNull()
      .references(() => EconomyEnvelopeTable.envelope_id),
    logical_request_id: text().notNull(),
    ordinal: integer().notNull(),
    admission_key: text().notNull(),
    // Sealed immutable request (§4.1): the exact bytes fingerprinted, reserved and sent.
    fingerprint: text().notNull(),
    body_digest: text().notNull(),
    body_snapshot: text().notNull(),
    // Logical request identity plus the observed transport identity.
    snapshot: text().notNull(),
    route: text().notNull(),
    endpoint: text().notNull(),
    protocol: text().notNull(),
    // Lineage for retries (§1.5), stored as `logicalRequestID:ordinal`.
    predecessor: text(),
    // Separated states (§4.4): reserved → terminal-held | settled; each flag its own column.
    state: text().notNull(),
    forward_intent: integer().notNull(),
    forward_observed: integer().notNull(),
    terminal: integer(),
    slot_released: integer().notNull(),
    bound_json: text().notNull(),
    // Confirmed usage only; unobserved dimensions stay absent (never fabricated zeros — CE-14).
    usage_json: text(),
    evidence_digest: text(),
    evidence_json: text(),
    // Durable completion reference and the recoverable payload (EA-27). A ref without
    // a payload is not a response the guard may replay.
    completion_ref: text(),
    completion_body: text(),
    // Semantic evaluation outcome, kept apart from physical usage (EA-26).
    semantic: text(),
  },
  (table) => [
    primaryKey({ columns: [table.envelope_id, table.logical_request_id, table.ordinal] }),
    uniqueIndex("economy_attempt_admission_key_idx").on(table.envelope_id, table.admission_key),
    index("economy_attempt_envelope_idx").on(table.envelope_id),
  ],
)

export const EconomyLedger = {
  EconomyEnvelopeTable,
  EconomyAttemptTable,
}
