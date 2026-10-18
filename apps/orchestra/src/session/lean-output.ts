export * as LegacyLeanOutput from "./lean-output"

import { ToolModelCapture } from "@orchestra/core/tool/model-capture"
import { ToolModelProjection } from "@orchestra/core/tool/model-projection"
import { LeanProcessor } from "@orchestra/core/tool/lean-processor"
import { LeanSummary } from "@orchestra/core/tool/lean-summary"
import { LeanTelemetry } from "@orchestra/core/tool/lean-telemetry"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"
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
  readonly command?: string
  readonly items?: LeanCoverage.Settings
  readonly unavailable?: "config_unavailable" | "preferences_unavailable" | "preferences_scope_mismatch"
  readonly limits: { readonly maxLines: number; readonly maxBytes: number }
  readonly policyMappingChanged?: boolean
  readonly telemetry?: Pick<LeanTelemetry.Input, "owner" | "model" | "orchestraProfile">
  /** Registry tool id and arguments; Lean 2.0 summarizes only attested native results of `LeanSummary.tools`. */
  readonly tool?: string
  readonly args?: Readonly<Record<string, unknown>>
  /** Where complete originals go before a lossy summary replaces them; no store means no lossy summary. */
  readonly store?: { readonly put: (text: string) => Promise<string> }
}

const refused = ["config_unavailable", "preferences_unavailable", "preferences_scope_mismatch", "disabled", "item_disabled",
  "processorfailed", "policy_mapping_changed", "projection_budget_max_lines", "projection_budget_max_bytes"]
type Decision = ToolModelProjection.FilterResult | { readonly status: "summarized" | "rewritten"; readonly reason: string }

export async function project<A extends LegacyLeanCapture.Output>(input: Input<A>): Promise<A> {
  const start = now()
  const trusted = attested(input)
  const identity = identify(input)
  // Unattributed attested shell commands and native read/fetch/search results have their own item toggles.
  const item = identity.itemID
    ?? (trusted ? trusted.source === "shell" ? "shell" : LeanCoverage.ids.find((id) => id === input.tool) : undefined)
  const lossless = select(input, item, identity.failed)
  const selected = await condense(input, trusted, lossless)
  const end = now()
  if (!input.telemetry || start === undefined || end === undefined) return selected.output
  try {
    // SessionProcessor may still change text when an image fails normalization.
    if (selected.output.attachments?.some((part) => typeof part === "object" && part !== null
      && "mime" in part && typeof part.mime === "string" && part.mime.startsWith("image/"))) return selected.output
    const status = selected.decision?.status
    const profile = selected.decision && "profile" in selected.decision ? selected.decision.profile : undefined
    // Attribution: the command's item, else the lossless profile's item, else the tool's own row.
    const itemID = identity.itemID ?? (profile ? LeanCoverage.forProfile(profile) : undefined) ?? item
    const metrics = LeanMetrics.decode(LeanTelemetry.measure({
      owner: input.telemetry.owner, model: input.telemetry.model, orchestraProfile: input.telemetry.orchestraProfile,
      itemID,
      producer: !trusted ? "unverified" : trusted.source === "shell" ? "native-shell" : "native-tool", eligible: !!trusted,
      status: status === "reduced" || status === "summarized" || status === "rewritten" ? "applied"
        : status === "normalized" ? "normalized" : "passthrough",
      reason: !trusted && selected.reason === "projection_declined" ? "not_eligible" : selected.reason,
      filterProfile: profile, before: input.output.output, after: selected.output.output, durationMs: end - start,
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

/** The native producer's attested observation for exactly this call, or nothing. */
function attested(input: Input<LegacyLeanCapture.Output>): ToolModelCapture.Observation | undefined {
  try {
    const candidate = input.binding?.candidate
    if (!input.binding || !ToolModelCapture.bound(input.binding) || !candidate || !ToolModelCapture.authentic(candidate)
      || candidate.owner.sessionID !== input.owner.sessionID || candidate.owner.callID !== input.owner.callID) return undefined
    const observation = candidate.observation
    if (observation.source === "shell") return input.tool === undefined || input.tool === "bash" ? observation : undefined
    return input.tool !== undefined && input.tool !== "bash" && observation.command === input.tool && LeanSummary.supported(input.tool)
      ? observation : undefined
  } catch {
    return undefined
  }
}

function identify(input: Input<LegacyLeanCapture.Output>): { itemID?: LeanCoverage.ItemID; failed?: boolean } {
  try {
    // Host passes the actual post-before-hook invocation, including unsuccessful native calls.
    const command = input.command ?? (input.binding?.candidate.observation.source === "shell" ? input.binding.candidate.observation.command : undefined)
    if (typeof command !== "string") return {}
    if (command.length === 0 || command.length > 65536) return { failed: true }
    const itemID = LeanProcessor.identify(command)
    return { itemID: LeanCoverage.ids.find((id) => id === itemID) }
  } catch {
    return { failed: true }
  }
}

function select<A extends LegacyLeanCapture.Output>(input: Input<A>, itemID?: LeanCoverage.ItemID, identityFailed?: boolean): {
  output: A; reason: string; decision?: Decision
} {
  const declined = (reason: string) => ({ output: input.output, reason })
  if (input.unavailable) return declined(input.unavailable)
  if (!input.enabled) return declined("disabled")
  if (identityFailed) return declined("processorfailed")
  try {
    if (itemID && input.items?.[itemID] === false) return declined("item_disabled")
    if (input.policyMappingChanged) return declined("policy_mapping_changed")
    if (!input.binding) return declined("not_eligible")
    const baseline = input.binding.baseline.content[0]
    if (baseline?.type !== "text" || !input.output.output.startsWith(baseline.text)) return declined("policy_mapping_changed")
    const suffix = input.output.output.slice(baseline.text.length)
    if (suffix && !suffix.startsWith("\n\n")) return declined("policy_mapping_changed")
    const approved = LegacyLeanCapture.model(input.output)
    if (!isDeepStrictEqual(approved.structured, input.binding.baseline.structured)) return declined("policy_mapping_changed")
    const observed: { result?: ToolModelProjection.FilterResult; failed?: boolean } = {}
    const projection = {
      enabled: true, owner: input.owner, binding: input.binding,
      approved: { ...approved, content: [...input.binding.baseline.content, ...(suffix ? [{ type: "text" as const, text: suffix }] : [])] },
      limits: input.limits,
    }
    const selected = ToolModelProjection.project({ ...projection, filter: (observation) => {
        try {
          return observed.result = LeanProcessor.process(observation, input.items)
        } catch (error) {
          observed.failed = true
          throw error
        }
      },
    })
    // Reuse the observed result, never re-run the processor. Acceptance without the budget proves the refusal seam.
    const unlimited = !selected.decision && observed.result
      ? ToolModelProjection.project({ ...projection, limits: { maxLines: Number.MAX_SAFE_INTEGER, maxBytes: Number.MAX_SAFE_INTEGER },
        filter: () => observed.result! }) : undefined
    const view = unlimited?.decision
      ? unlimited.output.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n") : undefined
    const budget = view === undefined ? undefined : view.split("\n").length > input.limits.maxLines
      ? "projection_budget_max_lines" : Buffer.byteLength(view, "utf8") > input.limits.maxBytes ? "projection_budget_max_bytes" : undefined
    if (!selected.decision) return declined(observed.failed ? "processorfailed"
      : observed.result?.status === "passthrough" || observed.result?.status === "failed_open"
        ? observed.result.reason : budget ?? "projection_declined")
    const output = selected.output.content.map((part) => part.type === "text" ? part.text : "").join("")
    return { output: { ...input.output, output }, decision: selected.decision, reason: selected.decision.reason }
  } catch {
    return declined("projection_declined")
  }
}

/**
 * Lean 2.0 after the lossless stage: summarize the attested text (failure lines kept whole, exit taken from the
 * native observation), store the complete approved original first and end the summary with its recall line.
 * Append-only policy text stays after it. Any refusal or storage failure keeps the lossless selection.
 */
async function condense<A extends LegacyLeanCapture.Output>(input: Input<A>, trusted: ToolModelCapture.Observation | undefined,
  lossless: ReturnType<typeof select<A>>): Promise<{ output: A; reason: string; decision?: Decision }> {
  try {
    const tool = trusted?.source === "shell" ? "bash" : input.tool
    // select() already refused unavailable/disabled profiles, disabled items, failed identity and plugin mutations.
    if (!trusted || !tool || !LeanSummary.supported(tool) || !input.binding || refused.includes(lossless.reason)
      || "researchSource" in input.output.metadata) return lossless
    const baseline = input.binding.baseline.content[0]
    if (baseline?.type !== "text" || !input.output.output.startsWith(baseline.text)) return lossless
    const suffix = input.output.output.slice(baseline.text.length)
    if (suffix && !suffix.startsWith("\n\n")) return lossless
    const text = lossless.output.output.slice(0, lossless.output.output.length - suffix.length)
    const exit = trusted.termination.kind === "exited" ? trusted.termination.code : undefined
    const result = LeanSummary.summarize({ tool, output: text, ...(input.args ? { args: input.args } : {}),
      metadata: tool === "bash" ? { exit } : { ...input.output.metadata } })
    const ineligible = lossless.reason === "projection_declined" || lossless.reason === "not_eligible"
    if (result.status === "unchanged") return ineligible ? { ...lossless, reason: result.reason } : lossless
    if (result.status === "rewritten")
      return { output: { ...input.output, output: result.replacement + suffix }, reason: result.reason, decision: result }
    if (!input.store) return lossless
    const id = await input.store.put(input.output.output)
    return { output: { ...input.output, output: result.replacement + LeanSummary.recoveryLine(id) + suffix },
      reason: result.reason, decision: result }
  } catch {
    return lossless
  }
}
