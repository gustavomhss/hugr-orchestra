export * as ToolModelProjection from "./model-projection"

import { ToolModelCapture } from "./model-capture"

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
  /** View approved by all existing policy hooks. Never mutate it. */
  readonly approved: ToolModelCapture.Output
  readonly limits: { readonly maxLines: number; readonly maxBytes: number }
  readonly filter: (observation: ToolModelCapture.Observation) => FilterResult
}

export interface Projection {
  readonly output: ToolModelCapture.Output
  readonly decision?: FilterResult
}

/** Implementation work package replaces this explicit passthrough scaffold. */
export const project = (input: Input): Projection => ({ output: input.approved })
