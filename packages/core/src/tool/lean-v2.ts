export * as LeanV2 from "./lean-v2"

import { Effect, Layer, Schema } from "effect"
import { ToolRegistry } from "./registry"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { LeanProcessor } from "./lean-processor"
import { LeanTelemetry } from "./lean-telemetry"
import { LeanSummary } from "./lean-summary"
import { makeLocationNode } from "@orchestra/core/effect/app-node"

interface LeanSettleContext {
  readonly owner: LeanMetrics.Decision["owner"]
  readonly model: LeanMetrics.Decision["model"]
  readonly orchestraProfile?: string
  readonly producer: LeanMetrics.Decision["producer"]
  readonly eligible: boolean
  readonly tool: string
  readonly callID: string
  readonly partID: string
  readonly messageID: string
  readonly sessionID: string
  readonly before: string
  readonly after: string
  readonly durationMs: number
  readonly status: "completed" | "error"
  readonly exitCode?: number
}

/** Check if a tool should have Lean telemetry applied. */
export function isLeanTool(tool: string): boolean {
  return LeanSummary.tools.includes(tool as LeanSummary.Tool)
}

/** Generate Lean metadata for a settled tool call. */
export function generateLeanMetadata(ctx: LeanSettleContext): LeanMetrics.Decision | undefined {
  const eligible = isLeanTool(ctx.tool) && ctx.before.length > 0
  // Map local status to LeanMetrics.Decision status values
  const status = ctx.status === "error" ? "passthrough" : "applied"
  const reason = eligible ? "summarized" : "below-threshold"

  return LeanTelemetry.measure({
    owner: ctx.owner,
    model: ctx.model,
    orchestraProfile: ctx.orchestraProfile,
    producer: ctx.producer,
    eligible,
    status,
    reason,
    itemID: LeanProcessor.identify(ctx.before),
    before: ctx.before,
    after: ctx.after,
    durationMs: ctx.durationMs,
  })
}

/** V2 settlement hook that adds Lean metadata to tool results. */
export const leanSettleHook = Effect.fn("LeanV2.settleHook")(function* (
  settlement: ToolRegistry.Settlement,
  ctx: LeanSettleContext,
) {
  const metadata = generateLeanMetadata(ctx)
  if (!metadata) return settlement

  return {
    ...settlement,
    output: settlement.output ? {
      ...settlement.output,
      structured: {
        ...settlement.output.structured,
        lean: JSON.stringify(metadata),
      },
    } : undefined,
  }
})

/** V2 projection: called during materialization to add Lean metadata. */
export function projectLeanMetadata(
  settlement: ToolRegistry.Settlement,
  context: { readonly tool: string; readonly callID: string; readonly partID: string; readonly messageID: string; readonly sessionID: string }
): ToolRegistry.Settlement {
  // This is a synchronous projection - actual Lean metadata generation is async
  // and happens in the telemetry layer. Here we just ensure the structure is ready.
  return settlement
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Effect.logInfo("Lean V2 projection layer registered")
  }),
)

export const node = makeLocationNode({
  name: "lean/v2",
  layer,
  deps: [] as const,
})