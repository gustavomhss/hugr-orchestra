export * as LegacyLeanOutput from "./lean-output"

import { ToolModelCapture } from "@orchestra/core/tool/model-capture"
import { ToolModelProjection } from "@orchestra/core/tool/model-projection"
import { LeanProcessor } from "@orchestra/core/tool/lean-processor"
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

export function project<A extends LegacyLeanCapture.Output>(input: {
  readonly output: A
  readonly binding?: ToolModelCapture.Binding
  readonly owner: ToolModelCapture.Owner
  readonly enabled: boolean
  readonly limits: { readonly maxLines: number; readonly maxBytes: number }
}): A {
  if (!input.enabled || !input.binding) return input.output
  try {
    const baseline = input.binding.baseline.content[0]
    if (baseline?.type !== "text" || !input.output.output.startsWith(baseline.text)) return input.output
    const suffix = input.output.output.slice(baseline.text.length)
    if (suffix && !suffix.startsWith("\n\n")) return input.output
    const approved = LegacyLeanCapture.model(input.output)
    const selected = ToolModelProjection.project({
      enabled: true, owner: input.owner, binding: input.binding,
      approved: { ...approved, content: [...input.binding.baseline.content, ...(suffix ? [{ type: "text" as const, text: suffix }] : [])] },
      limits: input.limits, filter: LeanProcessor.process,
    })
    if (!selected.decision) return input.output
    const output = selected.output.content.map((part) => part.type === "text" ? part.text : "").join("")
    return { ...input.output, output }
  } catch {
    return input.output
  }
}
