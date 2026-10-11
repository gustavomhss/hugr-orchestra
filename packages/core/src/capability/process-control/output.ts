export * as CapabilityProcessOutput from "./output"

import type { CapabilityProcessContract } from "./contract"

// Frozen signature. Output author replaces the body.
export function make(_options: { capacity: number }): CapabilityProcessContract.Buffer {
  throw new Error("CapabilityProcessOutput.make is not implemented")
}
