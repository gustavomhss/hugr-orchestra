export * as ReviewAdvisory from "./advisory"

import { Effect } from "effect"
import { ReviewCargoAudit } from "./cargo-audit"
import { ReviewOsv } from "./osv"
import type { ReviewAnalyze } from "./analyze"
import type { ReviewSarif } from "./sarif"

// Preserve the existing Analyze OSV constants while sharing the advisory dispatch boundary.
export const DATABASE_ABSENT = ReviewOsv.DATABASE_ABSENT
export const DATABASE_AGE = ReviewOsv.DATABASE_AGE

export const run = Effect.fn("ReviewAdvisory.run")(function* (
  pack: ReviewAnalyze.Pack,
  context: ReviewAnalyze.RunContext,
  confine: ReviewAnalyze.Confine,
  lookup: ReviewSarif.Lookup,
) {
  if (pack.template === "cargo-audit-lock-json") return yield* ReviewCargoAudit.run(pack, context, confine, lookup)
  return yield* ReviewOsv.run(pack, context, confine)
})
