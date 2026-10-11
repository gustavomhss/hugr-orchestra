export * as SessionInput from "./input"

import { and, asc, eq, isNull, lte } from "drizzle-orm"
import { DateTime, Effect, Option, Schema } from "effect"
import { Event } from "@orchestra/schema/event"
import { Admitted, Delivery } from "@orchestra/schema/session-input"
import { PromptContext } from "@orchestra/schema/prompt-context"
import type { Database } from "../database/database"
import type { EventV2 } from "../event"
import { EventTable } from "../event/sql"
import { SessionEvent } from "./event"
import { SessionMessage } from "./message"
import { Prompt } from "./prompt"
import { SessionSchema } from "./schema"
import { SessionInputTable, SessionMessageTable } from "./sql"

type DatabaseService = Database.Interface["db"]

export { Admitted, Delivery }

const decodePrompt = Schema.decodeUnknownSync(Prompt)
const encodePrompt = Schema.encodeSync(Prompt)

const fromRow = (row: typeof SessionInputTable.$inferSelect): Admitted =>
  Admitted.make({
    admittedSeq: row.admitted_seq,
    id: SessionMessage.ID.make(row.id),
    sessionID: SessionSchema.ID.make(row.session_id),
    prompt: decodePrompt(row.prompt),
    ...(row.prompt_context === null ? {} : { promptContext: row.prompt_context }),
    delivery: row.delivery,
    timeCreated: DateTime.makeUnsafe(row.time_created),
    ...(row.promoted_seq === null ? {} : { promotedSeq: row.promoted_seq }),
  })

export const find = Effect.fn("SessionInput.find")(function* (
  db: Pick<DatabaseService, "select">,
  id: SessionMessage.ID,
) {
  const row = yield* db.select().from(SessionInputTable).where(eq(SessionInputTable.id, id)).get().pipe(Effect.orDie)
  return row === undefined ? undefined : fromRow(row)
})

export class LifecycleConflict extends Schema.TaggedErrorClass<LifecycleConflict>()("SessionInput.LifecycleConflict", {
  id: SessionMessage.ID,
}) {}

export const admit = Effect.fn("SessionInput.admit")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  input: {
    readonly id: SessionMessage.ID
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly promptContext?: PromptContext.Info
    readonly delivery: Delivery
  },
) {
  const existing = yield* find(db, input.id)
  if (existing !== undefined) {
    if (!equivalent(existing, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
    return existing
  }
  const historical = yield* reconcileHistorical(db, input)
  if (historical !== undefined) return historical
  const timestamp = yield* DateTime.now
  return yield* events
    .publish(SessionEvent.PromptAdmitted, {
      messageID: input.id,
      sessionID: input.sessionID,
      timestamp,
      prompt: input.prompt,
      promptContext: input.promptContext,
      delivery: input.delivery,
    })
    .pipe(
      Effect.flatMap((event) =>
        event.durable === undefined
          ? Effect.die("Prompt admission event is missing aggregate sequence")
          : find(db, input.id).pipe(
              Effect.flatMap((stored) =>
                stored === undefined ? Effect.die("Prompt admission projection is missing") : Effect.succeed(stored),
              ),
            ),
      ),
      Effect.catchDefect((defect) =>
        find(db, input.id).pipe(
          Effect.flatMap((stored) =>
            stored && equivalent(stored, input) ? Effect.succeed(stored) : Effect.die(defect),
          ),
        ),
      ),
    )
})

// User projections omit delivery. Only their original durable Prompted event can establish it.
const reconcileHistorical = Effect.fn("SessionInput.reconcileHistorical")(function* (
  db: DatabaseService,
  input: Parameters<typeof equivalent>[1] & { readonly id: SessionMessage.ID },
) {
  const version = SessionEvent.Prompted.durable?.version
  if (version === undefined) return yield* Effect.die("Prompted event is not durable")
  return yield* db
    .transaction(
      (tx) =>
        Effect.gen(function* () {
          const existing = yield* find(tx, input.id)
          if (existing !== undefined) {
            if (!equivalent(existing, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
            return existing
          }
          const row = yield* tx.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, input.id)).get()
          if (row === undefined) return
          if (row.session_id !== input.sessionID || row.type !== "user")
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const message = Schema.decodeUnknownOption(SessionMessage.User)({ ...row.data, id: row.id, type: row.type })
          const event = yield* tx
            .select()
            .from(EventTable)
            .where(and(eq(EventTable.aggregate_id, row.session_id), eq(EventTable.seq, row.seq)))
            .get()
          if (Option.isNone(message) || event?.type !== Event.versionedType(SessionEvent.Prompted.type, version))
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const provenance = Schema.decodeUnknownOption(SessionEvent.Prompted.data)(event.data)
          if (Option.isNone(provenance)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const canonical = Admitted.make({
            id: message.value.id,
            sessionID: input.sessionID,
            prompt: Prompt.fromUserMessage(message.value),
            promptContext: message.value.promptContext,
            delivery: provenance.value.delivery,
            timeCreated: message.value.time.created,
            admittedSeq: row.seq,
            promotedSeq: row.seq,
          })
          if (
            provenance.value.messageID !== row.id ||
            !matchesProjection(canonical, { ...provenance.value, timeCreated: provenance.value.timestamp }) ||
            DateTime.toEpochMillis(canonical.timeCreated) !== row.time_created ||
            !equivalent(canonical, input)
          )
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          yield* tx
            .insert(SessionInputTable)
            .values({
              id: canonical.id,
              session_id: canonical.sessionID,
              prompt: encodePrompt(canonical.prompt),
              prompt_context: canonical.promptContext,
              delivery: canonical.delivery,
              admitted_seq: row.seq,
              promoted_seq: row.seq,
              time_created: row.time_created,
            })
            .run()
          return canonical
        }),
      { behavior: "immediate" },
    )
    .pipe(Effect.orDie)
})

export const projectAdmitted = Effect.fn("SessionInput.projectAdmitted")(function* (
  db: DatabaseService,
  input: {
    readonly admittedSeq: number
    readonly id: SessionMessage.ID
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly promptContext?: PromptContext.Info
    readonly delivery: Delivery
    readonly timeCreated: DateTime.Utc
  },
) {
  const message = yield* db
    .select({ id: SessionMessageTable.id })
    .from(SessionMessageTable)
    .where(eq(SessionMessageTable.id, input.id))
    .get()
    .pipe(Effect.orDie)
  if (message !== undefined) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
  const stored = yield* db
    .insert(SessionInputTable)
    .values({
      id: input.id,
      session_id: input.sessionID,
      admitted_seq: input.admittedSeq,
      prompt: encodePrompt(input.prompt),
      prompt_context: input.promptContext,
      delivery: input.delivery,
      time_created: DateTime.toEpochMillis(input.timeCreated),
    })
    .onConflictDoNothing()
    .returning({ id: SessionInputTable.id })
    .get()
    .pipe(Effect.orDie)
  if (!stored) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
})

export const projectPrompted = Effect.fn("SessionInput.projectPrompted")(function* (
  db: DatabaseService,
  input: {
    readonly id: SessionMessage.ID
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly promptContext?: PromptContext.Info
    readonly delivery: Delivery
    readonly timeCreated: DateTime.Utc
    readonly promotedSeq: number
  },
) {
  const updated = yield* db
    .update(SessionInputTable)
    .set({ promoted_seq: input.promotedSeq })
    .where(
      and(
        eq(SessionInputTable.id, input.id),
        eq(SessionInputTable.session_id, input.sessionID),
        isNull(SessionInputTable.promoted_seq),
      ),
    )
    .returning()
    .get()
    .pipe(Effect.orDie)
  if (updated) {
    const stored = fromRow(updated)
    if (!matchesProjection(stored, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
    return
  }

  const stored = yield* find(db, input.id)
  if (stored) {
    if (!matchesProjection(stored, input) || stored.promotedSeq !== input.promotedSeq)
      return yield* Effect.die(new LifecycleConflict({ id: input.id }))
    return
  }

  yield* db
    .insert(SessionInputTable)
    .values({
      id: input.id,
      session_id: input.sessionID,
      prompt: encodePrompt(input.prompt),
      prompt_context: input.promptContext,
      delivery: input.delivery,
      admitted_seq: input.promotedSeq,
      promoted_seq: input.promotedSeq,
      time_created: DateTime.toEpochMillis(input.timeCreated),
    })
    .run()
    .pipe(Effect.orDie)
})

export const hasPending = Effect.fn("SessionInput.hasPending")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  delivery: Delivery,
) {
  const row = yield* db
    .select({ id: SessionInputTable.id })
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        eq(SessionInputTable.delivery, delivery),
      ),
    )
    .limit(1)
    .get()
    .pipe(Effect.orDie)
  return row !== undefined
})

export const equivalent = (
  input: Admitted,
  expected: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly delivery: Delivery
  },
) => input.delivery === expected.delivery && matchesPrompt(input, expected)

const matchesPrompt = (input: Admitted, expected: { readonly sessionID: SessionSchema.ID; readonly prompt: Prompt }) =>
  input.sessionID === expected.sessionID &&
  JSON.stringify(encodePrompt(input.prompt)) === JSON.stringify(encodePrompt(expected.prompt))

const matchesProjection = (
  input: Admitted,
  expected: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly promptContext?: PromptContext.Info
    readonly delivery: Delivery
    readonly timeCreated: DateTime.Utc
  },
) =>
  equivalent(input, expected) &&
  JSON.stringify(input.promptContext) === JSON.stringify(expected.promptContext) &&
  DateTime.toEpochMillis(input.timeCreated) === DateTime.toEpochMillis(expected.timeCreated)

const publish = Effect.fn("SessionInput.publish")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
  rows: ReadonlyArray<typeof SessionInputTable.$inferSelect>,
) {
  for (const row of rows) {
    const id = SessionMessage.ID.make(row.id)
    yield* events
      .publish(SessionEvent.Prompted, {
        sessionID,
        timestamp: DateTime.makeUnsafe(row.time_created),
        messageID: id,
        prompt: decodePrompt(row.prompt),
        ...(row.prompt_context === null ? {} : { promptContext: row.prompt_context }),
        delivery: row.delivery,
      })
      .pipe(
        Effect.catchDefect((defect) =>
          defect instanceof LifecycleConflict
            ? find(db, id).pipe(
                Effect.flatMap((stored) => (stored?.promotedSeq === undefined ? Effect.die(defect) : Effect.void)),
              )
            : Effect.die(defect),
        ),
      )
  }
  return rows.length
})

export const promoteSteers = Effect.fn("SessionInput.promoteSteers")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
  cutoff: number,
) {
  const rows = yield* db
    .select()
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        eq(SessionInputTable.delivery, "steer"),
        lte(SessionInputTable.admitted_seq, cutoff),
      ),
    )
    .orderBy(asc(SessionInputTable.admitted_seq))
    .all()
    .pipe(Effect.orDie)
  return yield* publish(db, events, sessionID, rows)
})

export const promoteNextQueued = Effect.fn("SessionInput.promoteNextQueued")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
) {
  const row = yield* db
    .select()
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        eq(SessionInputTable.delivery, "queue"),
      ),
    )
    .orderBy(asc(SessionInputTable.admitted_seq))
    .limit(1)
    .get()
    .pipe(Effect.orDie)
  return row === undefined ? false : yield* publish(db, events, sessionID, [row]).pipe(Effect.as(true))
})
