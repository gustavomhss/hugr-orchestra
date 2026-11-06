export * as ReviewOxlintResult from "./oxlint-result"

import type { ResearchProcess } from "../../research-toolkit/process"
import type { ReviewNativeSarif } from "../native-sarif"
import type { ReviewSarif } from "../sarif"

export type Options = Omit<ReviewNativeSarif.Options, "pack" | "version">

// Frozen dependency scaffold; a successful report must not pass before implementation.
export function settle(_outcome: ResearchProcess.Outcome, _options: Options): ReviewSarif.Parsed | { status: "not-run"; reason: string } {
  return { status: "acquisition-error", reason: "native-oxlint-pending" }
}
