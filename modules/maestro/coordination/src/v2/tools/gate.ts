export * as MaestroToolGate from "./gate"

import { Effect } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Tool } from "@orchestra/core/tool/tool"
import type { MaestroSeats } from "../seats-service"

export type Gate = (context: Tool.Context, owner: string, refusal: string) => Effect.Effect<void, Tool.Failure>

/**
 * A tool's own identity check, on top of the visibility rules that already hide it from every other agent: the caller
 * must be the owner itself, and the owner must be native here, Maestro as core's default agent or a projected seat.
 * An agent that merely reuses a seat's id in a Location without the roster is not that seat.
 */
export function make(agents: AgentV2.Interface, seats: MaestroSeats.Interface): Gate {
  return (context, owner, refusal) =>
    Effect.gen(function* () {
      const agent = yield* agents.get(context.agent)
      const native = owner === AgentV2.defaultID || seats.has(owner)
      if (!native || context.agent !== owner || agent?.id !== owner)
        return yield* new Tool.Failure({ message: refusal })
    })
}

/**
 * A governed step V2 cannot take yet. It refuses with the reason and the step that would unblock it, and never records
 * evidence a later step could mistake for the real thing.
 */
export function hold(reason: string, detail: string) {
  return new Tool.Failure({ message: `HOLD ${reason}: ${detail}`, metadata: { status: "HOLD", reason } })
}
