export * as LedgerRead from "./read"

import { Effect, Schema } from "effect"

// Ledger reading shared by verify and audit (WP1). Lines are split the way Python's text mode reads them (CR and CRLF
// end a line) and blank lines are skipped. Entries go through the strict decoder, never a lenient one.

export class ReadError extends Schema.TaggedErrorClass<ReadError>()("LedgerRead.ReadError", {
  ledger: Schema.String,
  line: Schema.optional(Schema.Int),
  reason: Schema.String,
}) {}

export class Missing extends Schema.TaggedErrorClass<Missing>()("LedgerRead.Missing", { ledger: Schema.String }) {}

// The nonblank lines, as written: verification hashes these bytes and never reserializes a decoded entry.
export const lines = (ledger: string): Effect.Effect<ReadonlyArray<string>, ReadError | Missing> =>
  Effect.die("not implemented")

// Every entry as a decoded object, without integrity or audit-schema checks (`load_entries`).
export const entries = (
  ledger: string,
): Effect.Effect<ReadonlyArray<Readonly<Record<string, unknown>>>, ReadError | Missing> => Effect.die("not implemented")

// A ledger path, or a directory holding one: `<dir>/.relay-state/ledger.jsonl`, then `<dir>/ledger.jsonl`.
export const resolve = (target: string): Effect.Effect<string> => Effect.die("not implemented")
