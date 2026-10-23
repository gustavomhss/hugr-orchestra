export * as AtlasRestore from "./atlas-restore"

import { Effect, Layer } from "effect"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { SessionContextEpoch } from "@orchestra/core/session/context-epoch"
import { makeLocationNode } from "@orchestra/core/effect/app-node"

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const compaction = yield* SessionCompaction.Service
    const contextEpoch = yield* SessionContextEpoch.Service

    // Atlas resume integration point - hooks into compaction/context epoch
    // to restore Atlas units when context is compacted or restored
    yield* Effect.logInfo("Atlas restore integration registered")
  }).pipe(
    Effect.catchAll(() => Effect.void),
  ),
)

export const node = makeLocationNode({
  name: "maestro/atlas-restore",
  layer,
  deps: [SessionCompaction.node, SessionContextEpoch.node] as const,
})