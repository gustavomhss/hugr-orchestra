export * as AgentExecution from "./agent-execution"

import type { Agent } from "@orchestra/schema/agent"
import type { Location } from "@orchestra/core/location"
import { Context, Effect } from "effect"

/** Hosts may annotate their actual execution engine without changing the Core agent registry. */
export const Annotate = Context.Reference<
  (agents: readonly Agent.Info[]) => Effect.Effect<Agent.Info[], never, Location.Service>
>("@orchestra/server/AgentExecution", {
  defaultValue: () => (agents) => Effect.succeed([...agents]),
})
