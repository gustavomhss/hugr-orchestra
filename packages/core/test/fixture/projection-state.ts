import { Effect } from "effect"
import type { Database } from "@orchestra/core/database/database"
import { EventSequenceTable, EventTable } from "@orchestra/core/event/sql"
import { MessageTable, PartTable, SessionTable } from "@orchestra/core/session/sql"
import { PromptAdmissionTable } from "@orchestra/core/v1/prompt-admission.sql"

/** Full durable projection delta oracle, including timestamps, JSON snapshots, seals and aggregate sequence. */
export const capture = Effect.fn("ProjectionState.capture")(function* (db: Database.Interface["db"]) {
  return {
    sessions: yield* db.select().from(SessionTable).orderBy(SessionTable.id).all().pipe(Effect.orDie),
    messages: yield* db.select().from(MessageTable).orderBy(MessageTable.id).all().pipe(Effect.orDie),
    parts: yield* db.select().from(PartTable).orderBy(PartTable.id).all().pipe(Effect.orDie),
    receipts: yield* db.select().from(PromptAdmissionTable).orderBy(PromptAdmissionTable.id).all().pipe(Effect.orDie),
    events: yield* db.select().from(EventTable).orderBy(EventTable.id).all().pipe(Effect.orDie),
    sequences: yield* db
      .select()
      .from(EventSequenceTable)
      .orderBy(EventSequenceTable.aggregate_id)
      .all()
      .pipe(Effect.orDie),
  }
})

export * as ProjectionState from "./projection-state"
