export * as LeanTelemetry from "./lean-telemetry"

import type { LeanMetrics } from "@orchestra/schema/lean-metrics"

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
export const measure: (input: Input) => LeanMetrics.Decision | undefined = () => undefined
