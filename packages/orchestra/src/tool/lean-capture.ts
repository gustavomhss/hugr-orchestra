export * as LegacyLeanCapture from "./lean-capture"

import { ToolModelCapture } from "@orchestra/core/tool/model-capture"

export interface Output {
  readonly title: string
  readonly metadata: Record<string, unknown>
  readonly output: string
  readonly attachments?: readonly unknown[]
}

const carriers = new WeakMap<object, ToolModelCapture.Output>()

/** Native shell alone issues this carrier; names and result metadata cannot impersonate it. */
export function record(output: Output, observation: ToolModelCapture.Observation, owner: ToolModelCapture.Owner): void {
  try {
    const carrier = model(output)
    ToolModelCapture.record(carrier, { observation, textIndex: 0 }, owner)
    if (ToolModelCapture.get(carrier)) carriers.set(output, carrier)
  } catch {
    // Optional provenance capture cannot change a settled native execution.
  }
}

/** Capture the pre-plugin/pre-after-policy view for exactly this native invocation. */
export function bind(native: Output, baseline: Output, owner: ToolModelCapture.Owner): ToolModelCapture.Binding | undefined {
  try {
    const carrier = carriers.get(native)
    if (!carrier || native.output !== baseline.output) return undefined
    return ToolModelCapture.bind(carrier, model(baseline), owner)
  } catch {
    return undefined
  }
}

export function model(output: Output): ToolModelCapture.Output {
  return {
    structured: { title: output.title, metadata: output.metadata, attachments: output.attachments ?? [] },
    content: [{ type: "text", text: output.output }],
  }
}
