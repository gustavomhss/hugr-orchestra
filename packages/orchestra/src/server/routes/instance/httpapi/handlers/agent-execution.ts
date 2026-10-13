import { Effect, Layer } from "effect"
import { Location } from "@orchestra/core/location"
import type { AgentV2 } from "@orchestra/core/agent"
import { AgentExecution } from "@orchestra/server/agent-execution"
import { Agent } from "@/agent/agent"
import { InstanceStore } from "@/project/instance-store"

export const layer = Layer.effect(
  AgentExecution.Annotate,
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const instances = yield* InstanceStore.Service
    return Effect.fn("HostAgentExecution.annotate")(function* (input: AgentV2.Info[]) {
      const location = yield* Location.Service
      const registry = yield* instances.provide({ directory: location.directory }, agents.list())
      return input.map((info) => {
        // Display labels and default-agent selection cannot identify the requested seat.
        const selected = registry.find((agent) => agent.id === info.id)
        return { ...info, engine: selected ? (selected.engine ?? "orchestra") : undefined }
      })
    })
  }),
)

export * as HostAgentExecution from "./agent-execution"
