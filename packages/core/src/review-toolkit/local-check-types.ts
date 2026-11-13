export * as ReviewLocalCheckTypes from "./local-check-types"

import type { ResearchProcess } from "../research-toolkit/process"
import type { ReviewLocalCheckScope } from "./local-check-scope"
import type { ReviewLocalCheckResult } from "./local-check-result"
import type { ReviewLocalTools } from "./local-tools"
import type { ReviewScanProjection } from "./scan-projection"

/** Host-owned projections and policy; no filesystem or acquisition authority is added by this input. */
export type Input = {
  readonly projection: ReviewScanProjection.Projection
  readonly configured: ReviewLocalCheckScope.Configured
  readonly baseProjectionDigest: string
  readonly scope: "diff" | "files"
  readonly files: ReadonlyArray<string>
}

/** An unavailable check remains visible. Native streams remain bounded raw evidence, never findings. */
export type Result = ReviewLocalCheckResult.Settlement & {
  readonly identity: ReviewLocalTools.Identity
  readonly selection: ReviewLocalCheckScope.Selection
  readonly outcome: ResearchProcess.Outcome
} | {
  readonly status: "not-run" | "acquisition-error"
  readonly reason: string
  readonly identity?: ReviewLocalTools.Identity
  readonly selection?: ReviewLocalCheckScope.Selection
  readonly outcome?: never
}
