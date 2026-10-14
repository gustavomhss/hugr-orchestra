export * as HostAgentExecution from "./agent-execution"

import { AgentExecution } from "@orchestra/server/agent-execution"
import type { AgentV2 } from "@orchestra/core/agent"
import { Location } from "@orchestra/core/location"
import { Effect, Layer } from "effect"
import { Agent } from "@/agent/agent"
import { InstanceStore } from "@/project/instance-store"

export const layer = Layer.effect(
  AgentExecution.Annotate,
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const instances = yield* InstanceStore.Service
    return Effect.fn("HostAgentExecution.annotate")(function* (entries: readonly AgentV2.Info[]) {
      const location = yield* Location.Service
      // Resolve by the public stable ID in the actual registry. Display labels, hidden state and
      // modes must not change ownership, and a secondary Claude seat cannot annotate Maestro.
      const registry = yield* instances.provide({ directory: location.directory }, agents.list())
      return entries.map((entry) => {
        const actual = registry.find((agent) => agent.id === entry.id)
        return { ...entry, engine: actual ? (actual.engine ?? "orchestra") : undefined }
      })
    })
  }),
)
