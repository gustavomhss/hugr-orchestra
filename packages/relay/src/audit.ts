export * as RelayAudit from "./audit"

import { Effect, Redacted } from "effect"
import type { RelayLedger } from "@opencode-ai/schema/relay-ledger"
import type { LedgerRead } from "./ledger/read"

// `bin/relay verify|problems|cost --json` (WP2), for the run card and the `complete` audit. Field names are the
// Python JSON's.

export interface Control {
  readonly id: string
  readonly assert: string | null
  readonly verdict: string
  readonly graded_by: string
}

export interface RecordError {
  readonly entry?: number
  readonly field: string
  readonly reason: string
}

export interface Drift {
  readonly id: string
  readonly verdicts: ReadonlyArray<string>
  // First 12 hex characters of each oracle, in chain order.
  readonly oracles: ReadonlyArray<string>
  readonly laundered: boolean
}

export interface RecheckItem {
  readonly id: string
  readonly kind: "removed" | "changed" | "added"
  readonly recorded: string | null
  readonly current: string | null
}

export interface Recheck {
  readonly status: "not-run" | "invalid" | "diverged" | "unverified" | "ok"
  readonly items: ReadonlyArray<RecheckItem>
  readonly sprint?: string
  readonly reason?: string
  readonly unverified?: ReadonlyArray<string>
  readonly note?: string
}

export interface VerifyReport {
  readonly ledger: string
  readonly chain_intact: boolean
  readonly chain_detail: string
  readonly record_errors: ReadonlyArray<RecordError>
  readonly controls: ReadonlyArray<Control>
  readonly deterministic_total: number
  readonly deterministic_passed: number
  readonly advisory: number
  readonly last_event: string | null
  readonly truncated: boolean
  readonly laundered_controls: ReadonlyArray<Drift>
  readonly oracle_drift: ReadonlyArray<Drift>
  readonly oracle_recheck: Recheck
  readonly no_controls: boolean
  readonly escalated: boolean
  readonly result: RelayLedger.AuditResult
  readonly exit: 0 | 1 | 2
}

export interface Problem {
  readonly category: string
  readonly wp: string | null
  readonly cause: string
}

export interface ProblemsReport {
  readonly ledger: string
  readonly problems: ReadonlyArray<Problem>
}

export interface CostTotals {
  readonly in: number
  readonly out: number
  readonly cache_read: number
  readonly cache_write: number
  readonly turns: number
}

export interface CostState extends Partial<CostTotals> {
  readonly wp: string | null
  readonly macro: string | null
  readonly elapsed_s: number | null
}

export interface CostMacro extends CostTotals {
  readonly macro: string
  readonly elapsed_s: number
}

export interface CostReport {
  readonly ledger: string
  // null when the run recorded no cost at all: unmeasured, not zero.
  readonly total: (CostTotals & { readonly elapsed_s: number }) | null
  readonly states: ReadonlyArray<CostState>
  readonly macros: ReadonlyArray<CostMacro>
  readonly note?: string
}

// `sprint` requests the oracle comparison; for a directory target, a sprint beside the ledger is discovered.
export const verify = (
  target: string,
  options?: { readonly sprint?: string; readonly key?: Redacted.Redacted<string> },
): Effect.Effect<VerifyReport, LedgerRead.Missing> => Effect.die("not implemented")

// Exit 1 when any problem is derived (`problems` and `cost` do not check integrity).
export const problems = (target: string): Effect.Effect<ProblemsReport, LedgerRead.Missing | LedgerRead.ReadError> =>
  Effect.die("not implemented")

export const cost = (target: string): Effect.Effect<CostReport, LedgerRead.Missing | LedgerRead.ReadError> =>
  Effect.die("not implemented")
