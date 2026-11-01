export * as MaestroGuideIndexV2 from "./guide-index-source"

import { AgentV2 } from "@orchestra/core/agent"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { SystemContext, SystemContextRegistry } from "@orchestra/core/system-context"
import { Effect, Layer, Schema } from "effect"
import { PlaybookContent } from "../playbook-content"
import { Seats } from "../seats"

export const key = SystemContext.Key.make("maestro/guide")

/**
 * The index of Maestro's Orchestra guide (the `maestro-orchestra` playbook) as a System Context source of Maestro's
 * provider turns, so Maestro knows which leaf answers a question about Orchestra before it loads any; other agents get
 * nothing. It is built from `PlaybookContent.guide`, so a new leaf reaches the index with no prompt edit.
 */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* SystemContextRegistry.Service
    yield* registry.register({
      key,
      load: Effect.gen(function* () {
        const turn = yield* SystemContextRegistry.Turn
        if (turn?.agent !== AgentV2.defaultID) return SystemContext.empty
        const text = render()
        return SystemContext.make({
          key,
          codec: Schema.toCodecJson(Schema.String),
          load: Effect.succeed(text),
          baseline: (text) => text,
          update: (_previous, text) => text,
          removed: () => "<orchestra-guide>The Orchestra guide is not available.</orchestra-guide>",
        })
      }),
    })
  }),
)

export function render() {
  const research = Seats.research()?.id
  return [
    "<orchestra-guide>",
    "Before answering a question about Orchestra itself, load the guide leaf that covers it with `skill`, by its full name `maestro-orchestra-<group>-<leaf>`. Answer from the leaf, not from memory.",
    `For how the code works now, beyond what a leaf says, dispatch ${research ? `\`${research}\`` : "a research agent"}.`,
    ...Object.entries(PlaybookContent.guide).map(([group, leaves]) => `- ${group}: ${leaves.join(", ")}`),
    "</orchestra-guide>",
  ].join("\n")
}

export const node = makeLocationNode({
  name: "maestro/guide",
  layer,
  deps: [SystemContextRegistry.node],
})
