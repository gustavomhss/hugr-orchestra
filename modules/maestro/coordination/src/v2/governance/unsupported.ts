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
 * the check skipped: approval and dispatch reservations, workflow steps, background returns, Atlas resume and the
 * research allowance.
 */
export const check = Effect.fn("UnsupportedV2.check")(function* (
  seats: MaestroSeats.Interface,
  target: string,
  input: GovernanceInputV2.Input,
) {
  if (input.background === true)
    return yield* refuse("background-unavailable", "a background Task's result has no way back to this Session yet")
  if (input.workflow !== undefined)
    return yield* refuse("workflow-unavailable", "a Relay workflow step needs the workflow host")
  if (input.authorizationID !== undefined)
    return yield* refuse("authorized-dispatch-unavailable", "an authorized dispatch needs the dispatch reservation and its context check")
  if (input.governed !== undefined)
    return yield* refuse("governed-dispatch-unavailable", "a governed Task needs the approval reservation")
  if (!seats.has(target)) return
  if (input.memoryUnit !== undefined && Seats.all[target]?.atlasMemory)
    return yield* refuse("atlas-resume-unavailable", "the Atlas Memory resume of a seat needs the Atlas restore")
  if (target === RESEARCH_SEAT)
    return yield* refuse("research-allowance-unavailable", `${RESEARCH_SEAT} runs only under a research dispatch allowance`)
})

function refuse(reason: string, why: string) {
  return new ToolFailure({ message: `Task denied: ${reason}: ${why}, which this runtime does not have yet.` })
}
