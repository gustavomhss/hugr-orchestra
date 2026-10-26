export * as LeanOutput from "./lean-output"

import type { ToolOutput } from "@orchestra/llm"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { Effect } from "effect"
import { Config } from "../config"
import { LeanProcessor } from "./lean-processor"
import { LeanSummary } from "./lean-summary"
import { LeanTelemetry } from "./lean-telemetry"
import { ToolModelCapture } from "./model-capture"
import { ToolModelProjection } from "./model-projection"

/**
 * Lean projection over one settled ToolOutput.
 * The registry calls it after inspection and generic bounding, so `output` is the approved model view.
 */
export interface Input {
  readonly output: ToolOutput
  readonly binding?: ToolModelCapture.Binding
  readonly owner: ToolModelCapture.Owner
  readonly tool: string
  readonly args: Readonly<Record<string, unknown>>
  readonly enabled: boolean
  readonly unavailable?: "config_unavailable" | "preferences_unavailable" | "preferences_scope_mismatch"
  readonly items?: LeanCoverage.Settings
  readonly limits: { readonly maxLines: number; readonly maxBytes: number }
  /** Where complete originals go before a lossy summary replaces them; no store means no lossy summary. */
  readonly store?: { readonly put: (text: string) => Promise<string> }
  readonly telemetry?: Pick<LeanTelemetry.Input, "owner" | "model" | "orchestraProfile">
}

export interface Result {
  readonly output: ToolOutput
  readonly lean?: LeanMetrics.Decision
}

type Decision = ToolModelProjection.FilterResult | { readonly status: "summarized" | "rewritten"; readonly reason: string }
type Selection = { readonly output: ToolOutput; readonly reason: string; readonly decision?: Decision }

const refused = ["config_unavailable", "preferences_unavailable", "preferences_scope_mismatch", "disabled", "item_disabled",
  "processorfailed", "projection_budget_max_lines", "projection_budget_max_bytes"]

/** The `tool_output.lean.enabled` switch of the Location's config; Lean is on unless a document turns it off. */
export const configured = Effect.fn("LeanOutput.configured")(function* () {
  const config = yield* Config.Service
  // The highest-priority document that sets the switch wins, even when a later one sets only other thresholds.
  const entries = yield* config.entries()
  return entries
    .filter((entry): entry is Config.Document => entry.type === "document")
    .findLast((entry) => entry.info.tool_output?.lean?.enabled !== undefined)?.info.tool_output?.lean?.enabled !== false
})

/** Never fails: any refusal or measurement failure keeps the approved output, without or with partial metadata. */
export async function project(input: Input): Promise<Result> {
  const start = now()
  const trusted = attested(input)
  const identity = identify(input, trusted)
  // Unattributed attested shell commands and native read/fetch/search results have their own item toggles.
  const item = identity.itemID
    ?? (trusted ? trusted.source === "shell" ? "shell" : LeanCoverage.ids.find((id) => id === input.tool) : undefined)
  const selected = await condense(input, trusted, select(input, item, identity.failed))
  const end = now()
  if (!input.telemetry || start === undefined || end === undefined) return { output: selected.output }
  try {
    // Media results keep their exact settled view and carry no text measurement.
    if (selected.output.content.some((part) => part.type === "file")) return { output: selected.output }
    const status = selected.decision?.status
    const profile = selected.decision && "profile" in selected.decision ? selected.decision.profile : undefined
    // Attribution: the command's item, else the lossless profile's item, else the tool's own row.
    const lean = LeanTelemetry.measure({
      owner: input.telemetry.owner, model: input.telemetry.model, orchestraProfile: input.telemetry.orchestraProfile,
      itemID: identity.itemID ?? (profile ? LeanCoverage.forProfile(profile) : undefined) ?? item,
      producer: !trusted ? "unverified" : trusted.source === "shell" ? "native-shell" : "native-tool", eligible: !!trusted,
      status: status === "reduced" || status === "summarized" || status === "rewritten" ? "applied"
        : status === "normalized" ? "normalized" : "passthrough",
      reason: !trusted && selected.reason === "projection_declined" ? "not_eligible" : selected.reason,
      filterProfile: profile, before: view(input.output), after: view(selected.output), durationMs: end - start,
    })
    return lean ? { output: selected.output, lean } : { output: selected.output }
  } catch {
    // Optional measurement must never undo the already settled output selection.
    return { output: selected.output }
  }
}

function now() {
  try {
    return performance.now()
  } catch {
    return undefined
  }
}

function view(output: ToolOutput) {
  return output.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n")
}

/** The native producer's attested observation for exactly this call, or nothing. */
function attested(input: Input): ToolModelCapture.Observation | undefined {
  try {
    const candidate = input.binding?.candidate
    if (!input.binding || !ToolModelCapture.bound(input.binding) || !candidate || !ToolModelCapture.authentic(candidate)
      || candidate.owner.sessionID !== input.owner.sessionID || candidate.owner.callID !== input.owner.callID) return undefined
    const observation = candidate.observation
    if (observation.source === "shell") return input.tool === "bash" ? observation : undefined
    return input.tool !== "bash" && observation.command === input.tool && LeanSummary.supported(input.tool) ? observation : undefined
  } catch {
    return undefined
  }
}

function identify(input: Input, trusted: ToolModelCapture.Observation | undefined): { itemID?: LeanCoverage.ItemID; failed?: boolean } {
  try {
    const command = trusted?.source === "shell" ? trusted.command
      : input.tool === "bash" && typeof input.args.command === "string" ? input.args.command : undefined
    if (command === undefined) return {}
    if (command.length === 0 || command.length > 65536) return { failed: true }
    const itemID = LeanProcessor.identify(command)
    return { itemID: LeanCoverage.ids.find((id) => id === itemID) }
  } catch {
    return { failed: true }
  }
}

/** Lossless processor pass through the frozen projection seam. */
function select(input: Input, itemID: LeanCoverage.ItemID | undefined, identityFailed: boolean | undefined): Selection {
  const declined = (reason: string) => ({ output: input.output, reason })
  if (input.unavailable) return declined(input.unavailable)
  if (!input.enabled) return declined("disabled")
  if (identityFailed) return declined("processorfailed")
  try {
    if (itemID && input.items?.[itemID] === false) return declined("item_disabled")
    if (!input.binding) return declined("not_eligible")
    const observed: { result?: ToolModelProjection.FilterResult; failed?: boolean } = {}
    const projection = { enabled: true, owner: input.owner, binding: input.binding, approved: input.output, limits: input.limits }
    const selected = ToolModelProjection.project({
      ...projection,
      filter: (observation) => {
        try {
          return observed.result = LeanProcessor.process(observation, input.items)
        } catch (error) {
          observed.failed = true
          throw error
        }
      },
    })
    if (selected.decision)
      return { output: { structured: input.output.structured, content: selected.output.content }, decision: selected.decision,
        reason: selected.decision.reason }
    if (observed.failed) return declined("processorfailed")
    if (observed.result?.status === "passthrough" || observed.result?.status === "failed_open") return declined(observed.result.reason)
    // Reuse the observed result, never re-run the processor. Acceptance without the budget proves the refusal seam.
    const unlimited = observed.result
      ? ToolModelProjection.project({ ...projection, limits: { maxLines: Number.MAX_SAFE_INTEGER, maxBytes: Number.MAX_SAFE_INTEGER },
        filter: () => observed.result! })
      : undefined
    if (!unlimited?.decision) return declined("projection_declined")
    const text = view(unlimited.output)
    if (text.split("\n").length > input.limits.maxLines) return declined("projection_budget_max_lines")
    if (Buffer.byteLength(text, "utf8") > input.limits.maxBytes) return declined("projection_budget_max_bytes")
    return declined("projection_declined")
  } catch {
    return declined("projection_declined")
  }
}

/**
 * Lean 2.0 after the lossless stage: summarize the attested slot (failure lines kept whole, exit taken from the
 * native observation), store the complete original first and end the summary with its recall line.
 * Any refusal or storage failure keeps the lossless selection.
 */
async function condense(input: Input, trusted: ToolModelCapture.Observation | undefined, lossless: Selection): Promise<Selection> {
  try {
    const tool = trusted?.source === "shell" ? "bash" : input.tool
    if (!trusted || !input.binding || !LeanSummary.supported(tool) || refused.includes(lossless.reason)) return lossless
    const index = input.binding.candidate.textIndex
    const slot = lossless.output.content[index]
    const original = input.output.content[index]
    if (slot?.type !== "text" || original?.type !== "text") return lossless
    const result = LeanSummary.summarize({
      tool, output: slot.text, args: input.args,
      // Generic bounding already refused truncated results, so search output is complete here.
      metadata: tool === "bash" ? { exit: trusted.termination.kind === "exited" ? trusted.termination.code : undefined } : { truncated: false },
    })
    const ineligible = lossless.reason === "projection_declined" || lossless.reason === "not_eligible"
    if (result.status === "unchanged") return ineligible ? { ...lossless, reason: result.reason } : lossless
    if (result.status === "rewritten") return { output: replace(lossless.output, index, result.replacement), reason: result.reason, decision: result }
    if (!input.store) return lossless
    const id = await input.store.put(original.text)
    return { output: replace(lossless.output, index, result.replacement + LeanSummary.recoveryLine(id)), reason: result.reason, decision: result }
  } catch {
    return lossless
  }
}

function replace(output: ToolOutput, index: number, text: string): ToolOutput {
  return {
    structured: output.structured,
    content: output.content.map((part, position) => position === index && part.type === "text" ? { type: "text" as const, text } : part),
  }
}

// The registry settles a call and the runner publishes its result separately; this carries the metadata between them.
const MAX_PENDING = 1024
const pending = new Map<string, Readonly<Record<string, unknown>>>()

/** Host-only handoff from settlement to the Tool.Success/Failed event of the same Session call. */
export function offer(owner: ToolModelCapture.Owner, metadata: Readonly<Record<string, unknown>>) {
  const key = JSON.stringify([owner.sessionID, owner.callID])
  pending.delete(key)
  pending.set(key, metadata)
  // Settlements whose result is never published (interruption) must not grow the process without bound.
  for (const stale of pending.keys()) {
    if (pending.size <= MAX_PENDING) break
    pending.delete(stale)
  }
}

export function take(owner: ToolModelCapture.Owner) {
  const key = JSON.stringify([owner.sessionID, owner.callID])
  const metadata = pending.get(key)
  pending.delete(key)
  return metadata
}
