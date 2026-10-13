export * as AgentExecution from "./agent-execution"

import { Context, Effect } from "effect"
import type { Agent } from "@orchestra/schema/agent"
import type { Location } from "@orchestra/core/location"

/** Applications may annotate registry execution facts without changing Core agent selection. */
export const Annotate = Context.Reference<
  (agents: Agent.Info[]) => Effect.Effect<Agent.Info[], never, Location.Service>
>("@orchestra/server/AgentExecution/Annotate", { defaultValue: () => (agents) => Effect.succeed(agents) })
