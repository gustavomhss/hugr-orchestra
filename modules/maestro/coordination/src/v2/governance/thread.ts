export * as GovernanceThreadV2 from "./thread"

import { Cause, Effect, Schema } from "effect"
import { Board } from "@orchestra/core/board/board"

/** What `admit` hands `settle` for a Task bound to a card: the card and the seat whose reply goes on its thread. */
export const Receipt = Schema.Struct({ card: Schema.String, seat: Schema.String })
export const isReceipt = Schema.is(Receipt)

/** A card reference `KEY-N` as the board's project key and issue number. */
export function ref(card: string) {
  const at = card.lastIndexOf("-")
  return { key: card.slice(0, at), number: Number(card.slice(at + 1)) }
}

/**
 * Record the message a Task sends a seat on its card (merge-queue §4.6): an `answer` when the seat's last thread row is
 * its own question, else a `brief`. An exact Task retry finds its row already last and writes nothing.
 */
export const brief = Effect.fn("GovernanceThreadV2.brief")(function* (
  board: Board.Interface,
  input: { readonly card: string; readonly from: string; readonly seat: string; readonly body: string },
) {
  const card = ref(input.card)
  const last = (yield* board.issuePage(card.key, card.number)).notes.findLast((note) => note.kind !== "note")
  if (last && (last.kind === "brief" || last.kind === "answer") && last.author === input.from && last.body === input.body)
    return
  const kind = last?.kind === "question" && last.author === input.seat ? "answer" : "brief"
  yield* board.thread({ ...card, kind, author: input.from, body: input.body })
})

/**
 * Record the seat's reply on its card: a `question` when it stopped blocked, else a `return`. The child's work already
 * happened, so a row that cannot be written is logged and never fails the Task result.
 */
export function reply(
  board: Board.Interface,
  input: { readonly card: string; readonly seat: string; readonly blocked: boolean; readonly body: string },
) {
  return board
    .thread({ ...ref(input.card), kind: input.blocked ? "question" : "return", author: input.seat, body: input.body })
    .pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Board thread row not recorded", { card: input.card, cause: Cause.pretty(cause) }),
      ),
    )
}
