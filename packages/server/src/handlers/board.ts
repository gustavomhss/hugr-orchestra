import { Board } from "@orchestra/core/board/board"
import { BoardNotFoundError, BoardRefusedError } from "@orchestra/protocol/groups/board"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

export const BoardHandler = HttpApiBuilder.group(Api, "server.board", (handlers) =>
  Effect.gen(function* () {
    const board = yield* Board.Service

    return handlers
      .handle("board.list", () => board.summaries())
      .handle("board.get", (ctx) => board.snapshot(ctx.params.key).pipe(mapNotFound))
      .handle("board.issue", (ctx) => board.issuePage(ctx.params.key, ctx.params.number).pipe(mapNotFound))
      .handle("board.activity", (ctx) => board.activity(ctx.params.key, ctx.query.since).pipe(mapNotFound))
      .handle("board.answer", (ctx) => board.answer(ctx.params.key, ctx.params.id, ctx.payload).pipe(mapErrors))
      .handle("board.note", (ctx) => board.note(ctx.params.key, ctx.params.number, ctx.payload).pipe(mapErrors))
      .handle("board.attach", (ctx) => board.attach(ctx.params.key, ctx.params.number, ctx.payload).pipe(mapErrors))
      .handle("board.undo", (ctx) => board.undo(ctx.params.key, ctx.params.id).pipe(mapErrors))
      .handle("board.pause", (ctx) => board.pause(ctx.params.key, ctx.payload).pipe(mapErrors))
      .handle("board.resume", (ctx) => board.resume(ctx.params.key).pipe(mapErrors))
      .handle("board.githubSync", (ctx) => board.sync(ctx.params.key).pipe(mapErrors))
      .handle("board.pauseIssue", (ctx) => board.pauseIssue(ctx.params.key, ctx.params.number).pipe(mapErrors))
      .handle("board.resumeIssue", (ctx) => board.resumeIssue(ctx.params.key, ctx.params.number).pipe(mapErrors))
      .handle("board.hold", (ctx) => board.hold(ctx.params.key, ctx.params.number, ctx.payload).pipe(mapErrors))
      .handle("board.accept", (ctx) => board.accept(ctx.params.key, ctx.params.number).pipe(mapErrors))
      .handle("board.decline", (ctx) => board.decline(ctx.params.key, ctx.params.number).pipe(mapErrors))
  }),
)

function mapNotFound<A, R>(effect: Effect.Effect<A, Board.NotFoundError, R>) {
  return effect.pipe(Effect.mapError((error) => new BoardNotFoundError({ message: error.message })))
}

// Core errors become the protocol's tagged errors so the HTTP layer can set 404 and 409.
function mapErrors<A, R>(effect: Effect.Effect<A, Board.Error, R>) {
  return effect.pipe(
    Effect.mapError((error) =>
      error._tag === "Board.NotFoundError"
        ? new BoardNotFoundError({ message: error.message })
        : new BoardRefusedError({ message: error.message }),
    ),
  )
}
