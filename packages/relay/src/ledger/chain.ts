export * as LedgerChain from "./chain"

import { Effect, Redacted, Schema } from "effect"

// `relay_chain_append` and `bin/relay-note` (WP1): the only way a line reaches a ledger.

export class AppendError extends Schema.TaggedErrorClass<AppendError>()("LedgerChain.AppendError", {
  ledger: Schema.String,
  // lock: `.chain.lock` not acquired after 200 tries 50 ms apart; body: not one object, or a top-level `h`;
  // write: the append itself failed. Nothing is appended in any case and an owned lock is always released.
  reason: Schema.Literals(["lock", "body", "write"]),
}) {}

export interface AppendInput {
  readonly ledger: string
  // One compact JSON object without a top-level `h`; nested `h` is allowed.
  readonly body: string
  // The sprint generation, resolved once per evaluation; anything but a nonnegative integer resolves to 0.
  readonly gen: number
  // HMAC-SHA256 with the key, plain SHA-256 without. The mode is stamped as `mac` inside the hashed body.
  readonly key?: Redacted.Redacted<string>
}

export interface Appended {
  readonly seq: number
  readonly h: string
  readonly line: string
}

/**
 * Appends `body + {gen, prev, seq, mac}` and then `h` as the final root member, under the ledger directory's
 * `.chain.lock` mkdir lock. `prev` is the previous line's `h` (GENESIS first) and `seq` the previous seq + 1.
 */
export const append = (input: AppendInput): Effect.Effect<Appended, AppendError> => Effect.die("not implemented")

export const LOCK = ".chain.lock"
export const LOCK_ATTEMPTS = 200
export const LOCK_INTERVAL_MS = 50
