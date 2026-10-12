export * as HostAgentExecution from "./agent-execution"

import { AgentExecution } from "@orchestra/server/agent-execution"
import type { AgentV2 } from "@orchestra/core/agent"
import { Location } from "@orchestra/core/location"
import { Context, Effect, Layer } from "effect"
import { Agent } from "@/agent/agent"
import { InstanceStore } from "@/project/instance-store"

export const layer = Layer.effectContext(
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const instances = yield* InstanceStore.Service
    const annotate = Effect.fn("HostAgentExecution.annotate")(function* (entries: readonly AgentV2.Info[]) {
      const location = yield* Location.Service
      // Resolve by the public stable ID in the actual registry. Display labels, hidden state and
      // modes must not change ownership, and a secondary Claude seat cannot annotate Maestro.
      return yield* instances.provide(
        { directory: location.directory },
        Effect.forEach(entries, (entry) =>
          agents.get(entry.id).pipe(Effect.map((actual) => ({ ...entry, engine: actual?.engine ?? "orchestra" }))),
        ),
      )
    })
    return Context.make(AgentExecution.Annotate, annotate)
  }),
)
