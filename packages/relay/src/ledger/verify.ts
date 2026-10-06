export * as LedgerVerify from "./verify"

import { Effect, Redacted } from "effect"

// `benchmark/verify_ledger.py` (WP1): the same messages, line for line, and the same exit codes.

export interface Result {
  // 0: intact, including an empty ledger or a valid nonterminal prefix; 1: broken or refused; 2: missing ledger.
  readonly exit: 0 | 1 | 2
  readonly stdout: string
  readonly stderr: string
}

// The key selects the mode the verifier demands; a keyed chain checked without it is REFUSED, never accepted as plain.
export const verify = (ledger: string, key?: Redacted.Redacted<string>): Effect.Effect<Result> =>
  Effect.die("not implemented")

export const TERMINAL = ["sprint-complete", "escalate"] as const
