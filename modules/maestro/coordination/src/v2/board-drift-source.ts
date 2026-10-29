export * as MaestroBoardDriftV2 from "./board-drift-source"

import { AgentV2 } from "@orchestra/core/agent"
import { Board } from "@orchestra/core/board/board"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { SessionSchema, SessionStore } from "@orchestra/core/session"
import { SystemContext, SystemContextRegistry } from "@orchestra/core/system-context"
import { Effect, Layer, Schema } from "effect"

export const key = SystemContext.Key.make("maestro/board-drift")

/**
 * The cards on active board projects whose Session link no longer matches the facts, as one System Context source of
 * Maestro's provider turns; other agents get nothing. The host moves cards on dispatch and on PR facts, so what is left
 * here is what only Maestro can repair. No drift renders nothing; drift that clears is admitted as one resolved line.
 */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* SystemContextRegistry.Service
    const board = yield* Board.Service
    const store = yield* SessionStore.Service
    yield* registry.register({
      key,
      load: Effect.gen(function* () {
        const turn = yield* SystemContextRegistry.Turn
        if (turn?.agent !== AgentV2.defaultID) return SystemContext.empty
        const lines = yield* drift(board, store)
        if (!lines.length) return SystemContext.empty
        return SystemContext.make({
          key,
          codec: Schema.toCodecJson(Schema.String),
          load: Effect.succeed(format(lines)),
          baseline: (text) => text,
          update: (_previous, text) => text,
          removed: () => "<board-drift>Resolved: every card's Session link matches the facts.</board-drift>",
        })
      }),
    })
  }),
)

const drift = Effect.fn("MaestroBoardDriftV2.drift")(function* (board: Board.Interface, store: SessionStore.Interface) {
  const projects = (yield* board.summaries()).filter((summary) => summary.project.status === "active")
  const issues = yield* Effect.forEach(projects, (summary) =>
    board.snapshot(summary.project.key).pipe(
      Effect.map((snapshot) => snapshot.issues),
      Effect.orElseSucceed(() => []),
    ),
  )
  return yield* Effect.forEach(
    issues.flat().filter((issue) => issue.stage === "building" || issue.stage === "review"),
    Effect.fnUntraced(function* (issue) {
      if (!issue.sessionID) return issue.stage === "building" ? [`- ${issue.ref} (building): no Session linked.`] : []
      if (yield* store.get(SessionSchema.ID.make(issue.sessionID))) return []
      return [`- ${issue.ref} (${issue.stage}): links Session ${issue.sessionID}, which does not exist.`]
    }),
  ).pipe(Effect.map((lines) => lines.flat()))
})

export function format(lines: readonly string[]) {
  return [
    "<board-drift>",
    "These cards no longer match the facts. Repair each with board_issue or board_move, with the reason:",
    ...lines,
    "</board-drift>",
  ].join("\n")
}

export const node = makeLocationNode({
  name: "maestro/board-drift",
  layer,
  deps: [SystemContextRegistry.node, Board.node, SessionStore.node],
})
