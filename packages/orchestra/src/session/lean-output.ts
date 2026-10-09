export * as LegacyLeanOutput from "./lean-output"

import { ToolModelCapture } from "@orchestra/core/tool/model-capture"
import { ToolModelProjection } from "@orchestra/core/tool/model-projection"
import { LeanProcessor } from "@orchestra/core/tool/lean-processor"
import { LeanTelemetry } from "@orchestra/core/tool/lean-telemetry"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { LegacyLeanCapture } from "@/tool/lean-capture"
import { isDeepStrictEqual } from "node:util"

/** External plugin mutations do not inherit a native producer's approval mapping. */
export function unchanged(binding: ToolModelCapture.Binding, output: LegacyLeanCapture.Output): boolean {
  try {
    return isDeepStrictEqual(binding.baseline, LegacyLeanCapture.model(output))
  } catch {
    return false
  }
}

interface Input<A extends LegacyLeanCapture.Output> {
  readonly output: A
  readonly binding?: ToolModelCapture.Binding
  readonly owner: ToolModelCapture.Owner
  readonly enabled: boolean
  readonly limits: { readonly maxLines: number; readonly maxBytes: number }
  readonly policyMappingChanged?: boolean
  readonly telemetry?: Pick<LeanTelemetry.Input, "owner" | "model" | "orchestraProfile">
}

export function project<A extends LegacyLeanCapture.Output>(input: Input<A>): A {
  const start = now()
  const selected = select(input)
  const end = now()
  if (!input.telemetry || start === undefined || end === undefined) return selected.output
  try {
    const candidate = input.binding?.candidate
    const trusted = input.binding && ToolModelCapture.bound(input.binding) && candidate
      && ToolModelCapture.authentic(candidate) && candidate.owner.sessionID === input.owner.sessionID
      && candidate.owner.callID === input.owner.callID && candidate.observation.source === "shell"
    const eligible = !!trusted && candidate.observation.completeness === "complete"
      && candidate.observation.termination.kind === "exited" && candidate.observation.termination.code === 0
    const metrics = LeanMetrics.decode(LeanTelemetry.measure({
      owner: input.telemetry.owner, model: input.telemetry.model, orchestraProfile: input.telemetry.orchestraProfile,
      producer: trusted ? "native-shell" : "unverified", eligible,
      status: selected.decision?.status === "reduced" ? "applied"
        : selected.decision?.status === "normalized" ? "normalized" : "passthrough",
      reason: !eligible && selected.reason === "projection_declined" ? "not_eligible" : selected.reason,
      filterProfile: selected.decision && "profile" in selected.decision ? selected.decision.profile : undefined,
      before: input.output.output, after: selected.output.output, durationMs: end - start,
    }))
    if (!metrics) return selected.output
    return { ...selected.output, metadata: { ...selected.output.metadata, lean: metrics } }
  } catch {
    // Optional measurement must never undo the already settled output selection.
    return selected.output
  }
}

function now(): number | undefined {
  try {
    return performance.now()
  } catch {
    return undefined
  }
}

function select<A extends LegacyLeanCapture.Output>(input: Input<A>): {
  output: A; reason: string; decision?: ToolModelProjection.FilterResult
} {
  const declined = (reason: string) => ({ output: input.output, reason })
  if (!input.enabled) return declined("disabled")
  if (input.policyMappingChanged) return declined("policy_mapping_changed")
  if (!input.binding) return declined("not_eligible")
  try {
    const baseline = input.binding.baseline.content[0]
    if (baseline?.type !== "text" || !input.output.output.startsWith(baseline.text)) return declined("policy_mapping_changed")
    const suffix = input.output.output.slice(baseline.text.length)
    if (suffix && !suffix.startsWith("\n\n")) return declined("policy_mapping_changed")
    const approved = LegacyLeanCapture.model(input.output)
    if (!isDeepStrictEqual(approved.structured, input.binding.baseline.structured)) return declined("policy_mapping_changed")
    const observed: { result?: ToolModelProjection.FilterResult; failed?: boolean } = {}
    const selected = ToolModelProjection.project({
      enabled: true, owner: input.owner, binding: input.binding,
      approved: { ...approved, content: [...input.binding.baseline.content, ...(suffix ? [{ type: "text" as const, text: suffix }] : [])] },
      limits: input.limits, filter: (observation) => {
        try {
          return observed.result = LeanProcessor.process(observation)
        } catch (error) {
          observed.failed = true
          throw error
        }
      },
    })
    if (!selected.decision) return declined(observed.failed ? "processorfailed"
      : observed.result?.status === "passthrough" || observed.result?.status === "failed_open"
        ? observed.result.reason : "projection_declined")
    const output = selected.output.content.map((part) => part.type === "text" ? part.text : "").join("")
    return { output: { ...input.output, output }, decision: selected.decision, reason: selected.decision.reason }
  } catch {
    return declined("projection_declined")
  }
}
