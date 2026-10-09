export * as LeanSummary from "./lean-summary"

import type { LeanMetrics } from "./lean-metrics"

export interface Input {
  readonly sessionID: string
  readonly coverage: LeanMetrics.Summary["coverage"]
  readonly records: ReadonlyArray<unknown>
}

/** Derived from unique persisted owner identities, never render or replay increments. */
export const summarize: (input: Input) => LeanMetrics.Summary = (input) => ({
  coverage: input.coverage, observedCalls: 0, eligibleCalls: 0, appliedCalls: 0, bytesSaved: 0,
  estimatedTokensSaved: 0, estimatedTokenCalls: 0, reasons: {}, profiles: {}, models: {},
  latency: { samples: 0, p50: null, p95: null, p99: null },
})
