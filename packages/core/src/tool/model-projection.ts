export * as ToolModelProjection from "./model-projection"

import { ToolModelCapture } from "./model-capture"
import { isDeepStrictEqual } from "node:util"

export type FilterResult = {
  readonly inputBytes: number
  readonly outputBytes: number
  readonly reason: string
} & (
  | { readonly status: "reduced" | "normalized"; readonly replacement: string; readonly profile?: string }
  | { readonly status: "passthrough" | "failed_open" }
)
export interface Input {
  readonly enabled: boolean
  readonly owner: ToolModelCapture.Owner
  readonly binding?: ToolModelCapture.Binding
  readonly approved: ToolModelCapture.Output
  readonly limits: { readonly maxLines: number; readonly maxBytes: number }
  readonly filter: (observation: ToolModelCapture.Observation) => FilterResult
}
export interface Projection {
  readonly output: ToolModelCapture.Output
  readonly decision?: FilterResult
}

/** Pure, post-policy selection. The injected processor is not runtime activation. */
export const project: (input: Input) => Projection = (input) => {
  const declined = { output: input.approved }
  if (!input.enabled || !input.binding || !ToolModelCapture.bound(input.binding)) return declined
  const candidate = input.binding.candidate
  if (!ToolModelCapture.authentic(candidate)
    || candidate.owner.sessionID !== input.owner.sessionID
    || candidate.owner.callID !== input.owner.callID) return declined
  const observation = candidate.observation
  if (observation.source !== "shell" || observation.termination.kind !== "exited"
    || observation.termination.code !== 0 || observation.completeness !== "complete") return declined
  if (!Number.isSafeInteger(input.limits.maxLines) || input.limits.maxLines <= 0
    || !Number.isSafeInteger(input.limits.maxBytes) || input.limits.maxBytes <= 0) return declined
  const slot = candidate.template.content[candidate.textIndex]
  if (!Number.isSafeInteger(candidate.textIndex) || candidate.textIndex < 0
    || slot?.type !== "text" || typeof slot.text !== "string" || slot.text !== observation.output) return declined

  // Only an exact baseline prefix plus append-only text notes has policy approval.
  const baseline = input.binding.baseline
  if (!isDeepStrictEqual(input.approved.structured, baseline.structured)
    || !isDeepStrictEqual(input.approved.content.slice(0, baseline.content.length), baseline.content)) return declined
  const notes = input.approved.content.slice(baseline.content.length)
  if (!notes.every((part) => part.type === "text" && typeof part.text === "string")) return declined

  const decision = process(input.filter, observation)
  if (!decision || (decision.status !== "reduced" && decision.status !== "normalized")
    || typeof decision.replacement !== "string" || typeof decision.reason !== "string"
    || (decision.profile !== undefined && typeof decision.profile !== "string")
    || !Number.isSafeInteger(decision.inputBytes) || decision.inputBytes < 0
    || !Number.isSafeInteger(decision.outputBytes) || decision.outputBytes < 0
    || decision.inputBytes !== Buffer.byteLength(observation.output, "utf8")
    || decision.outputBytes !== Buffer.byteLength(decision.replacement, "utf8")
    || decision.outputBytes >= decision.inputBytes) return declined

  const content = [...candidate.template.content.map((part, index) =>
    index === candidate.textIndex && part.type === "text" ? { ...part, text: decision.replacement } : part), ...notes]
  const view = content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n")
  if (view.split("\n").length > input.limits.maxLines
    || Buffer.byteLength(view, "utf8") > input.limits.maxBytes) return declined
  return { output: { structured: input.approved.structured, content }, decision }
}

function process(filter: Input["filter"], observation: ToolModelCapture.Observation): FilterResult | undefined {
  try {
    const result = filter(observation)
    if (typeof result !== "object" || result === null) return undefined
    // Read untrusted accessors once, inside the failure boundary; validate only the detached snapshot.
    const { status, inputBytes, outputBytes, reason, replacement, profile } = result as FilterResult & {
      readonly replacement?: string
      readonly profile?: string
    }
    return Object.freeze({ status, inputBytes, outputBytes, reason,
      ...(replacement === undefined ? {} : { replacement }),
      ...(profile === undefined ? {} : { profile }),
    }) as FilterResult
  } catch {
    return undefined
  }
}
