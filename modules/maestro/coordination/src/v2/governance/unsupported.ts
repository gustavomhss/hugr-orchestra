export * as UnsupportedV2 from "./unsupported"

import { ToolFailure } from "@orchestra/llm"
import { Effect } from "effect"
import { Seats } from "../../seats"
import type { MaestroSeats } from "../seats-service"
import type { GovernanceInputV2 } from "./input"

/** The research seat: on V1 it never runs without a dispatch allowance. */
export const RESEARCH_SEAT = "jimmy"

/**
 * V1 Task phases whose host is not on V2 yet. Each one refuses the call with its reason rather than running it with
 * the check skipped: workflow steps and Atlas resume.
 */
export const check = Effect.fn("UnsupportedV2.check")(function* (
  seats: MaestroSeats.Interface,
  target: string,
  input: GovernanceInputV2.Input,
) {
  if (input.workflow !== undefined)
    return yield* refuse("workflow-unavailable", "a Relay workflow step needs the workflow host")
  if (!seats.has(target)) return
  if (input.memoryUnit !== undefined && Seats.all[target]?.atlasMemory)
    return yield* refuse("atlas-resume-unavailable", "the Atlas Memory resume of a seat needs the Atlas restore")
})

export function refuse(reason: string, why: string) {
  return new ToolFailure({ message: `Task denied: ${reason}: ${why}, which this runtime does not have yet.` })
}
