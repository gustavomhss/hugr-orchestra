import { Actions } from "@orchestra/schema/actions"
import { and, eq, isNull } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { ActionsError } from "../error"
import { attributed, combine } from "./outcome"
import { ActionsOperationTable } from "./sql"
import { identity, safe, unavailable, type DB, type Row } from "./storage"

export const update = (db: DB, row: Row, observation: Actions.OperationObservation) => db.transaction((tx) => Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis
  const expired = unavailable(row, now)
  if (expired) return yield* Effect.fail(expired)
  const acknowledgement = combine(row.result ?? undefined, observation.acknowledgement)
  if (acknowledgement instanceof ActionsError) return yield* Effect.fail(acknowledgement)
  // The adapter proves the exact native identity. Empty/unattributed replies
  // cannot confirm anything, and polling never changes unknown into accepted.
  const state = observation.state === "pending" || !attributed(acknowledgement) ? row.state : observation.state
  return yield* tx.update(ActionsOperationTable).set({
    state,
    result: acknowledgement ?? null,
    time_updated: state === row.state ? row.time_updated : now,
    reason: state === "rejected" ? "Provider command rejection was confirmed" : state === "confirmed" ? null : row.reason,
  }).where(and(
    identity(row), eq(ActionsOperationTable.state, row.state), eq(ActionsOperationTable.time_updated, row.time_updated),
    row.result == null ? isNull(ActionsOperationTable.result) : eq(ActionsOperationTable.result, row.result),
  )).returning().get()
}), { behavior: "immediate" }).pipe(safe)
