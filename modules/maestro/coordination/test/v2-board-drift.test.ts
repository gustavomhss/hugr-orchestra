import { expect, test } from "bun:test"
import { Board } from "@orchestra/core/board/board"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionStore } from "@orchestra/core/session"
import { SystemContext, SystemContextRegistry } from "@orchestra/core/system-context"
import { Effect, Layer } from "effect"
import { MaestroBoardDriftV2 } from "../src/v2/board-drift-source"
import { session, worktree } from "./fixture/v2-governance"

// Maestro's turns carry the cards whose Session link no longer matches the facts; a clean board and other agents get nothing.

test("Maestro's turn lists a Building card with no Session and a card linked to a missing Session, and nothing else", async () => {
  const program = Effect.gen(function* () {
    const directory = yield* worktree
    const layer = AppNodeBuilder.build(
      LayerNode.group([SystemContextRegistry.node, MaestroBoardDriftV2.node, Board.node, SessionStore.node, Database.node]),
      [
        [
          Location.node,
          Layer.succeed(
            Location.Service,
            Location.Service.of({
              directory: AbsolutePath.make(directory),
              project: { id: Project.ID.global, directory: AbsolutePath.make(directory) },
            }),
          ),
        ],
        [Database.node, Database.layerFromPath(":memory:")],
      ],
    ) as Layer.Layer<SystemContextRegistry.Service | Board.Service | Database.Service | SessionStore.Service>
    return yield* Effect.gen(function* () {
      const board = yield* Board.Service
      const registry = yield* SystemContextRegistry.Service
      const load = (agent: string) =>
        registry
          .load({ sessionID: "ses_drift", agent })
          .pipe(Effect.flatMap(SystemContext.initialize), Effect.map((context) => context.baseline))
      const live = yield* session({ directory, agent: "general" })
      yield* board.project({ key: "DRF", name: "Drift", reason: "Start." })
      yield* Effect.forEach(["Unlinked", "Linked", "Gone", "Queued"], (title) =>
        board.issue({ project: "DRF", title, reason: "Plan." }),
      )
      yield* Effect.forEach([1, 2, 3], (number) => board.move({ project: "DRF", number, stage: "building", reason: "Started." }))
      yield* board.issue({ project: "DRF", number: 2, seat: "general", session: live, reason: "Dispatched." })
      yield* board.issue({ project: "DRF", number: 3, seat: "general", session: "ses_gone", pr: 7, reason: "Dispatched." })
      yield* board.move({ project: "DRF", number: 3, stage: "review", reason: "PR is up." })

      expect(yield* load("maestro")).toBe(
        MaestroBoardDriftV2.format([
          "- DRF-1 (building): no Session linked.",
          "- DRF-3 (review): links Session ses_gone, which does not exist.",
        ]),
      )
      expect(yield* load("general")).not.toContain("<board-drift")

      yield* board.issue({ project: "DRF", number: 1, seat: "general", session: live, reason: "Linked." })
      yield* board.issue({ project: "DRF", number: 3, session: live, reason: "Relinked." })
      expect(yield* load("maestro")).not.toContain("<board-drift")
    }).pipe(Effect.provide(layer))
  })
  await Effect.runPromise(program.pipe(Effect.scoped))
})
