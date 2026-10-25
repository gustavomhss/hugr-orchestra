export * as UnsupportedV2 from "./unsupported"

import { ToolFailure } from "@orchestra/llm"

/** The research seat: on V1 it never runs without a dispatch allowance. */
export const RESEARCH_SEAT = "jimmy"

export function refuse(reason: string, why: string) {
  return new ToolFailure({ message: `Task denied: ${reason}: ${why}, which this runtime does not have yet.` })
}
