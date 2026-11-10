export * as ReviewVerdictV2 from "./review-verdict"

import type { ReviewResultV2 } from "../governance/review-result"

/** A verifier cannot confirm with a rung or history the host did not offer for that candidate. */
export function validate(result: ReviewResultV2.Verdict, offered: ReadonlyArray<string>): ReviewResultV2.Verdict {
  if (result.state !== "confirmed") return result
  if (offered.includes(result.rung) &&
    result.history.some((entry) => entry.option === result.rung && entry.outcome === "settled") &&
    result.history.every((entry) => offered.includes(entry.option))) return result
  return { candidate: result.candidate, state: "question", reason: "not verified: invalid-rung-history", history: result.history }
}
