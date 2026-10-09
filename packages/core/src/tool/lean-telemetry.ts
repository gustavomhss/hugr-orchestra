export * as LeanTelemetry from "./lean-telemetry"

import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { Token } from "../util/token"

export interface Input {
  readonly owner: LeanMetrics.Decision["owner"]
  readonly model: LeanMetrics.Decision["model"]
  readonly orchestraProfile?: string
  readonly producer: LeanMetrics.Decision["producer"]
  readonly eligible: boolean
  readonly status: LeanMetrics.Decision["status"]
  readonly reason: string
  readonly filterProfile?: string
  readonly before: string
  readonly after: string
  readonly durationMs: number
}

/** Frozen measurement seam; metrics author replaces explicit unavailable scaffold. */
export const measure: (input: Input) => LeanMetrics.Decision | undefined = (input) => {
  try {
    const { owner, model, orchestraProfile, producer, eligible, status, reason, filterProfile, before, after, durationMs } = input
    if (typeof before !== "string" || typeof after !== "string"
      || [before, after].some((text) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text))
      || (status === "passthrough" && before !== after)) return undefined
    const beforeBytes = Buffer.byteLength(before, "utf8")
    const afterBytes = Buffer.byteLength(after, "utf8")
    const beforeTokens = Token.estimate(before)
    const afterTokens = Token.estimate(after)
    return LeanMetrics.decode({
      version: 1, scope: "standard-registry", engine: "hugr-lean@0.2.0:4e46ae0534937bdf",
      owner, model, orchestraProfile, producer, eligible, status, reason, filterProfile, durationMs,
      bytes: { before: beforeBytes, after: afterBytes, saved: beforeBytes - afterBytes },
      tokens: { kind: "estimated", counter: "chars-per-token-4", before: beforeTokens, after: afterTokens, saved: beforeTokens - afterTokens },
    })
  } catch {
    return undefined
  }
}
