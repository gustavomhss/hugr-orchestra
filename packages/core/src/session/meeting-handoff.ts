export * as MeetingHandoff from "./meeting-handoff"

import { and, eq, inArray } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Meeting } from "@orchestra/schema/meeting"
import { AgentV2 } from "../agent"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { Location } from "../location"
import { globalSessions } from "../tool/task"
import { deliver } from "../tool/team-message"
import { SessionV2 } from "../session"
import { SessionMeeting } from "./meeting"
import { MeetingTable } from "./meeting.sql"
import { latest, peopleMap } from "./meeting-memory"
import { MeetingItemTable, MeetingPersonTable } from "./meeting-memory.sql"

type ItemRow = typeof MeetingItemTable.$inferSelect

export const Service = SessionMeeting.HandoffService

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const location = yield* Location.Service
    const sessions = yield* SessionV2.Service

    const handoff = Effect.fn("MeetingHandoff.handoff")(function* (input: Meeting.HandoffInput) {
      const ids = [...new Set(input.itemIDs)]
      const meeting = yield* database.db
        .select()
        .from(MeetingTable)
        .where(eq(MeetingTable.id, input.meetingID))
        .get()
        .pipe(Effect.orDie)
      if (!meeting) return yield* new SessionMeeting.MeetingError({ reason: "missing_meeting" })
      if (ids.length === 0) return { sent: [] }
      const rows = yield* latest(
        database.db,
        and(eq(MeetingItemTable.meeting_id, meeting.id), inArray(MeetingItemTable.id, ids)),
      )
      if (rows.length !== ids.length || !rows.every(allowed))
        return yield* new SessionMeeting.MeetingError({ reason: "missing_item" })
      const people = yield* peopleMap(database.db)
      const send = deliver({
        db: database.db,
        sessions,
        projectID: location.project.id,
        from: "live",
        to: AgentV2.defaultID,
        text: message(meeting, rows, people),
        // Handed items are notes for the owner's next conversation with Maestro, not work to start unasked.
        resume: false,
      })
      // The owner chose to hand off: with no Maestro conversation in the project, open one to receive it.
      yield* send.pipe(
        Effect.catchIf(
          (reason) => reason === "no_conversation",
          () =>
            sessions
              .create({ agent: AgentV2.defaultID, location: { directory: location.directory } })
              .pipe(Effect.andThen(send)),
        ),
        Effect.mapError(() => new SessionMeeting.MeetingError({ reason: "unavailable" })),
      )
      yield* database.db
        .transaction(() =>
          Effect.forEach(
            rows,
            (row) =>
              database.db
                .insert(MeetingItemTable)
                .values({ ...row, revision: row.revision + 1, sent_to_maestro: true })
                .run(),
            { discard: true },
          ),
        )
        .pipe(Effect.orDie)
      return { sent: ids }
    })

    return Service.of({ handoff })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Database.node, Location.node, globalSessions],
})

// Dismissed items and suggestions meant for the owner never leave the card.
function allowed(row: ItemRow) {
  if (row.status === "dismissed") return false
  return row.kind !== "suggestion" || row.for === "maestro"
}

function message(
  meeting: typeof MeetingTable.$inferSelect,
  rows: ItemRow[],
  people: Map<string, typeof MeetingPersonTable.$inferSelect>,
) {
  const who = (code: string) =>
    code === "me" ? "me" : code.startsWith("unknown:") ? "unknown speaker" : (people.get(code)?.name ?? code)
  const date = new Date(meeting.time_started).toISOString().slice(0, 10)
  return [
    `From the meeting "${meeting.title}" on ${date}, the owner chose these items for you:`,
    ...rows.map((row) => `- ${row.kind}: ${row.text} (${who(row.asserter)}) [meeting ${meeting.id} item ${row.id}]`),
    "Keep them in mind and bring them up with the owner. Do not start work on any of them until the owner asks.",
  ].join("\n")
}
