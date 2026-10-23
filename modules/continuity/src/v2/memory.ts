export * as ContinuityMemory from "./memory"

import { Effect, Layer } from "effect"
import { SessionV2 } from "@orchestra/core/session"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { SessionSchema } from "@orchestra/core/session/schema"

/**
 * Memory hook for Claude Code V2 engine adapter.
 * This integrates with the Claude Code host's memory system to provide
 * retained context across compaction boundaries.
 * Note: Full implementation requires SessionContextEpoch which is not exported.
 */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sessions = yield* SessionV2.Service
    const compaction = yield* SessionCompaction.Service

    // Memory hook: called by Claude Code host after compaction
    // to provide retained context for the next turn
    // Note: Full implementation requires SessionContextEpoch which is not exported from core
    const memoryHook = Effect.fn("ContinuityMemory.hook")(function* (sessionID: string) {
      const session = yield* sessions.get(sessionID)
      if (!session) return undefined

      // Load compaction state for retained context
      // Full implementation would use SessionContextEpoch

      return {
        baseline: "",
        baselineSeq: 0,
      }
    })

    yield* Effect.logInfo("Continuity V2 memory hook registered for Claude Code (stub)")
  }),
)

export const node = makeLocationNode({
  name: "continuity/v2/memory",
  layer,
  deps: [SessionV2.node, SessionCompaction.node] as const,
})