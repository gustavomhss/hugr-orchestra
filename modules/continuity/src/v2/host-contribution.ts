export * as ContinuityV2 from "./index"
export { node as continuityNode } from "./continuity"
export { node as memoryNode } from "./memory"

import { Layer, Effect } from "effect"
import { SessionV2 } from "@orchestra/core/session"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import type { Host } from "@orchestra/core/host"

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sessions = yield* SessionV2.Service
    const compaction = yield* SessionCompaction.Service
    yield* Effect.logInfo("Continuity V2 services initialized")
  }),
)

export const node = makeLocationNode({
  name: "continuity/v2/services",
  layer,
  deps: [SessionV2.node, SessionCompaction.node] as const,
})

export const contribution: Host.Contribution = {
  id: "continuity",
  locationNodes: [node],
}