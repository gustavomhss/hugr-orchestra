export * as AtlasHeaderSource from "./atlas-header-source"

import { Effect, Layer, Scope } from "effect"
import { SystemContextRegistry, SystemContext } from "@orchestra/core/system-context"
import { AgentV2 } from "@orchestra/core/agent"
import { makeLocationNode } from "@orchestra/core/effect/app-node"

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* SystemContextRegistry.Service
    const agents = yield* AgentV2.Service

    yield* registry.register({
      key: "atlas-header",
      load: Effect.fn("AtlasHeaderSource.load")(function* (input: { sessionID: string; agent: string }) {
        const agent = yield* agents.get(AgentV2.ID.make(input.agent))
        if (agent?.id !== "maestro") {
          return SystemContext.empty
        }
        return SystemContext.make({
          parts: [
            {
              type: "text",
              text: "## Atlas Catalog\n\nAvailable territories: core, maestro, atlas, lean\n\nUse `atlas_context` to browse catalog and unit content.",
            },
          ],
        })
      }),
    })
  }).pipe(
    Effect.catchAll(() => Effect.void),
  ),
)

export const node = makeLocationNode({
  name: "maestro/atlas-header-source",
  layer,
  deps: [AgentV2.node] as const,
})