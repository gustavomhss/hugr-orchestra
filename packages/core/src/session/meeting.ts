export * as SessionMeeting from "./meeting"

import { and, asc, desc, eq, isNull } from "drizzle-orm"
import { Clock, Context, Effect, Layer, Schema } from "effect"
import { Meeting } from "@orchestra/schema/meeting"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { MeetingMemory } from "./meeting-memory"
import { MeetingVerdict } from "./meeting-verdict"
import { MeetingSegmentTable, MeetingTable } from "./meeting.sql"
import { SessionSchema } from "./schema"
import { SessionTable } from "./sql"

export class MeetingError extends Schema.TaggedErrorClass<MeetingError>()("SessionMeeting.MeetingError", {
  reason: Meeting.ErrorReason,
}) {
  override get message() {
    return `Meeting failed: ${this.reason}`
  }
}

export interface Interface {
  readonly start: (input: Meeting.StartInput) => Effect.Effect<Meeting.Info, MeetingError>
  // Segments whose id is already stored are skipped, so a retried append is a no-op.
  readonly append: (input: Meeting.AppendInput) => Effect.Effect<void, MeetingError>
  readonly stop: (input: Meeting.StopInput) => Effect.Effect<Meeting.Info, MeetingError>
  readonly get: (input: Meeting.ReadQuery) => Effect.Effect<Meeting.Detail, MeetingError>
  // The running meeting of a Session, if any, with its latest segments in time order.
  readonly active: (sessionID: Meeting.Info["sessionID"]) => Effect.Effect<Meeting.Detail | undefined>
  readonly list: (input: Meeting.ListQuery) => Effect.Effect<Meeting.ListResult>
  readonly rename: (input: Meeting.RenameInput) => Effect.Effect<Meeting.Summary, MeetingError>
  // Refused with "running" while the meeting runs.
  readonly remove: (input: Meeting.ReadQuery) => Effect.Effect<Meeting.DeleteReceipt, MeetingError>
  readonly confirm: (input: Meeting.ConfirmInput) => Effect.Effect<Meeting.Card, MeetingError>
  readonly commitment: (input: Meeting.CommitmentInput) => Effect.Effect<Meeting.Commitment, MeetingError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionMeeting") {}

// CONTRACT FROZEN ABOVE. Builder A implements `layer` and `node` below, modelled on ./todo.ts.

const LIVE_TAIL = 50

// Meetings outlive their Session. The frozen Info type has no empty case, so a meeting whose Session was deleted
// reports this placeholder id.
const DETACHED = SessionSchema.ID.make("ses_detached")

const meetingInfo = (row: typeof MeetingTable.$inferSelect): Meeting.Info => ({
  id: row.id,
  sessionID: row.session_id ?? DETACHED,
  title: row.title,
  timeStarted: row.time_started,
  timeEnded: row.time_ended,
})

const detailOf = Effect.fn("SessionMeeting.detailOf")(function* (
  db: Database.Interface["db"],
  row: typeof MeetingTable.$inferSelect,
  segments: (typeof MeetingSegmentTable.$inferSelect)[],
) {
  return {
    meeting: meetingInfo(row),
    segments: segments.map(segmentOf),
    summary: (yield* MeetingMemory.summaries(db, [row]))[0]!,
    card: yield* MeetingMemory.card(db, row),
  }
})

const segmentOf = (row: typeof MeetingSegmentTable.$inferSelect): Meeting.Segment => ({
  id: row.id,
  track: row.track,
  text: row.text,
  startMs: row.start_ms,
  endMs: row.end_ms,
})

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const findMeeting = Effect.fn("SessionMeeting.findMeeting")(function* (meetingID: Meeting.ID) {
      return yield* db.select().from(MeetingTable).where(eq(MeetingTable.id, meetingID)).get().pipe(Effect.orDie)
    })

    const findActive = Effect.fn("SessionMeeting.findActive")(function* (sessionID: Meeting.Info["sessionID"]) {
      return yield* db
        .select()
        .from(MeetingTable)
        .where(and(eq(MeetingTable.session_id, sessionID), isNull(MeetingTable.time_ended)))
        .get()
        .pipe(Effect.orDie)
    })

    const start = Effect.fn("SessionMeeting.start")(function* (input: Meeting.StartInput) {
      const session = yield* db
        .select()
        .from(SessionTable)
        .where(eq(SessionTable.id, input.sessionID))
        .get()
        .pipe(Effect.orDie)
      if (!session) return yield* new MeetingError({ reason: "missing_session" })
      if (yield* findActive(input.sessionID)) return yield* new MeetingError({ reason: "active" })
      const row = {
        id: Meeting.ID.create(),
        session_id: input.sessionID,
        title: input.title,
        time_started: yield* Clock.currentTimeMillis,
        time_ended: null,
        retention: input.retention ?? "kept",
        consent: input.consent,
      }
      yield* db.insert(MeetingTable).values(row).run().pipe(Effect.orDie)
      return meetingInfo({ ...row, card_status: "pending", card_error: null, card_summary: "" })
    })

    const append = Effect.fn("SessionMeeting.append")(function* (input: Meeting.AppendInput) {
      const meeting = yield* findMeeting(input.meetingID)
      if (!meeting) return yield* new MeetingError({ reason: "missing_meeting" })
      if (meeting.time_ended !== null) return yield* new MeetingError({ reason: "ended" })
      if (input.segments.length === 0) return
      yield* db
        .insert(MeetingSegmentTable)
        .values(
          input.segments.map((segment) => ({
            id: segment.id,
            meeting_id: input.meetingID,
            track: segment.track,
            text: segment.text,
            start_ms: segment.startMs,
            end_ms: segment.endMs,
          })),
        )
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
    })

    const stop = Effect.fn("SessionMeeting.stop")(function* (input: Meeting.StopInput) {
      const meeting = yield* findMeeting(input.meetingID)
      if (!meeting) return yield* new MeetingError({ reason: "missing_meeting" })
      if (meeting.time_ended !== null) return yield* new MeetingError({ reason: "ended" })
      const timeEnded = yield* Clock.currentTimeMillis
      yield* db
        .update(MeetingTable)
        .set({ time_ended: timeEnded })
        .where(eq(MeetingTable.id, input.meetingID))
        .run()
        .pipe(Effect.orDie)
      return meetingInfo({ ...meeting, time_ended: timeEnded })
    })

    const get = Effect.fn("SessionMeeting.get")(function* (input: Meeting.ReadQuery) {
      const meeting = yield* findMeeting(input.meetingID)
      if (!meeting) return yield* new MeetingError({ reason: "missing_meeting" })
      const segments = yield* db
        .select()
        .from(MeetingSegmentTable)
        .where(eq(MeetingSegmentTable.meeting_id, input.meetingID))
        .orderBy(asc(MeetingSegmentTable.start_ms))
        .all()
        .pipe(Effect.orDie)
      return yield* detailOf(db, meeting, segments)
    })

    const active = Effect.fn("SessionMeeting.active")(function* (sessionID: Meeting.Info["sessionID"]) {
      const meeting = yield* findActive(sessionID)
      if (!meeting) return undefined
      const latest = yield* db
        .select()
        .from(MeetingSegmentTable)
        .where(eq(MeetingSegmentTable.meeting_id, meeting.id))
        .orderBy(desc(MeetingSegmentTable.start_ms))
        .limit(LIVE_TAIL)
        .all()
        .pipe(Effect.orDie)
      return yield* detailOf(db, meeting, latest.toReversed())
    })

    const list = (input: Meeting.ListQuery) => MeetingMemory.list(db, input)

    const rename = Effect.fn("SessionMeeting.rename")(function* (input: Meeting.RenameInput) {
      const meeting = yield* findMeeting(input.meetingID)
      if (!meeting) return yield* new MeetingError({ reason: "missing_meeting" })
      yield* db
        .update(MeetingTable)
        .set({ title: input.title })
        .where(eq(MeetingTable.id, input.meetingID))
        .run()
        .pipe(Effect.orDie)
      return (yield* MeetingMemory.summaries(db, [{ ...meeting, title: input.title }]))[0]!
    })

    const remove = Effect.fn("SessionMeeting.remove")(function* (input: Meeting.ReadQuery) {
      const meeting = yield* findMeeting(input.meetingID)
      if (!meeting) return yield* new MeetingError({ reason: "missing_meeting" })
      if (meeting.time_ended === null) return yield* new MeetingError({ reason: "running" })
      return yield* MeetingVerdict.remove(db, input.meetingID)
    })

    const confirm = Effect.fn("SessionMeeting.confirm")(function* (input: Meeting.ConfirmInput) {
      const meeting = yield* findMeeting(input.meetingID)
      if (!meeting) return yield* new MeetingError({ reason: "missing_meeting" })
      return yield* MeetingVerdict.confirm(db, meeting, input).pipe(
        Effect.mapError((reason) => new MeetingError({ reason })),
      )
    })

    const commitment = (input: Meeting.CommitmentInput) =>
      MeetingVerdict.commitment(db, input).pipe(Effect.mapError((reason) => new MeetingError({ reason })))

    return Service.of({ start, append, stop, get, active, list, rename, remove, confirm, commitment })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Database.node] })
