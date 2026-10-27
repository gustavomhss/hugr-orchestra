import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Meeting } from "@orchestra/schema/meeting"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMeeting } from "@orchestra/core/session/meeting"
import { MeetingBriefing } from "@orchestra/core/session/meeting-briefing"
import { MeetingContext } from "@orchestra/core/session/meeting-context"
import { MeetingTable } from "@orchestra/core/session/meeting.sql"
import { MeetingItemTable, MeetingPersonTable } from "@orchestra/core/session/meeting-memory.sql"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { SystemContext } from "@orchestra/core/system-context/index"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, SessionMeeting.node, MeetingBriefing.node, MeetingContext.node])),
)
const liveID = SessionSchema.ID.make("ses_briefing_live")
const otherID = SessionSchema.ID.make("ses_briefing_other")

const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(SessionTable)
    .values(
      [
        { id: liveID, agent: "live" },
        { id: otherID, agent: "maestro" },
      ].map((session) => ({
        ...session,
        project_id: Project.ID.global,
        slug: session.id,
        directory: "/project",
        title: session.id,
        version: "test",
      })),
    )
    .run()
    .pipe(Effect.orDie)
  yield* db.insert(MeetingPersonTable).values({ id: "per_ana", name: "Ana" }).run().pipe(Effect.orDie)
  yield* db
    .insert(MeetingTable)
    .values({
      id: Meeting.ID.make("mtg_past"),
      title: "Kickoff",
      time_started: Date.UTC(2026, 9, 20),
      time_ended: Date.UTC(2026, 9, 20) + 1,
      card_summary: "We agreed to ship the beta.",
    })
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(MeetingItemTable)
    .values(
      [
        { id: "itm_mine", text: "Send the deck", owner: "me", counterparty: "per_ana" },
        { id: "itm_theirs", text: "Draft the contract", owner: "per_ana", counterparty: "me" },
        { id: "itm_done", text: "Book the room", owner: "me", counterparty: null, state: "done" as const },
      ].map((row) => ({
        state: "accepted" as const,
        revision: 1,
        meeting_id: Meeting.ID.make("mtg_past"),
        kind: "commitment" as const,
        asserter: "me",
        created_at: 1,
        ...row,
      })),
    )
    .run()
    .pipe(Effect.orDie)
  return yield* SessionMeeting.Service
})

describe("meeting briefing", () => {
  it.effect("briefs the live seat from past meetings and open commitments", () =>
    Effect.gen(function* () {
      const meetings = yield* setup
      const context = yield* MeetingContext.Service
      yield* meetings.start({ sessionID: liveID, title: "Today", consent: "unknown" })
      const generation = yield* SystemContext.initialize(yield* context.load(liveID))
      expect(Object.keys(generation.snapshot).toSorted()).toEqual(["live/briefing", "live/meeting"])
      expect(generation.baseline).toContain('"Kickoff": We agreed to ship the beta.')
      expect(generation.baseline).toContain("Send the deck")
      expect(generation.baseline).toContain("Draft the contract (Ana)")
      expect(generation.baseline).not.toContain("Book the room")
      expect(generation.baseline.indexOf("owner owes")).toBeLessThan(generation.baseline.indexOf("Draft the contract"))
    }),
  )

  it.effect("stays empty without the live seat or a running meeting", () =>
    Effect.gen(function* () {
      const meetings = yield* setup
      const briefing = yield* MeetingBriefing.Service
      expect((yield* SystemContext.initialize(yield* briefing.load(liveID))).snapshot).toEqual({})
      yield* meetings.start({ sessionID: otherID, title: "Not live", consent: "unknown" })
      expect((yield* SystemContext.initialize(yield* briefing.load(otherID))).snapshot).toEqual({})
    }),
  )

  it.effect("caps the briefing", () =>
    Effect.gen(function* () {
      const meetings = yield* setup
      const { db } = yield* Database.Service
      yield* db
        .update(MeetingTable)
        .set({ card_summary: "x".repeat(MeetingBriefing.MAX_CHARS * 2) })
        .run()
        .pipe(Effect.orDie)
      yield* meetings.start({ sessionID: liveID, title: "Today", consent: "unknown" })
      const briefing = yield* MeetingBriefing.Service
      const generation = yield* SystemContext.initialize(yield* briefing.load(liveID))
      expect(generation.baseline.length).toBeLessThan(MeetingBriefing.MAX_CHARS + 200)
    }),
  )
})
