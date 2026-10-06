export * as ArmRound from "./round"

import { Effect } from "effect"
import type { LedgerChain } from "../ledger/chain"

// Round collapse (WP6): verdicts are buffered as unstamped compact lines, and an identical failing round is recorded
// once in full, then counted under its sha as `gate-fail-repeat`.

// sha256 over the buffered lines (each with LF), then `<fails>\n<reg>\n`. `ts` is excluded by construction.
export const shape = (buffered: ReadonlyArray<string>, fails: string, reg: string): string => {
  throw new Error("not implemented")
}

// Appends every buffered line with `ts` prepended at flush time, in order; the first failed append stops the flush.
export const flush = (
  ledger: string,
  buffered: ReadonlyArray<string>,
  chain: Omit<LedgerChain.AppendInput, "ledger" | "body">,
): Effect.Effect<void, LedgerChain.AppendError> => Effect.die("not implemented")
