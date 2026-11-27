export * as ProcessProvenance from "./process-provenance"

import { Context, Effect } from "effect"

export type Info = {
  readonly sessionID: string
  readonly agentID: string
  readonly tool: string
  readonly callID: string
}

// Metadata only. Neither an ownership claim for process control nor a cleanup capability.
export const Current = Context.Reference<Info | undefined>("@orchestra/ProcessProvenance", {
  defaultValue: () => undefined,
})

// Bound to the captured Session store by the tool registry, evaluated only at an actual tracked spawn.
export const Owner = Context.Reference<Effect.Effect<string>>("@orchestra/ProcessProvenance/Owner", {
  defaultValue: () => Effect.succeed(""),
})
