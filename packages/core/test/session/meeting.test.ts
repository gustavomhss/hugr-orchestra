import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMeeting } from "@orchestra/core/session/meeting"
import { MeetingContext } from "@orchestra/core/session/meeting-context"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { SystemContext } from "@orchestra/core/system-context/index"
import { testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, SessionMeeting.node, MeetingContext.node])))
const sessionID = SessionSchema.ID.make("ses_meeting_test")

const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      slug: "meeting",
      directory: "/project",
      title: "meeting",
      version: "test",
    })
    .run()
    .pipe(Effect.orDie)
})

const segment = (id: string, track: "me" | "them", text: string, startMs: number) => ({
  id,
  track,
  text,
  startMs,
  endMs: startMs + 500,
})

describe("SessionMeeting", () => {
  it.effect("stores segments and reads them back in time order", () =>
    Effect.gen(function* () {
      yield* setup
      const meetings = yield* SessionMeeting.Service
      const started = yield* meetings.start({ sessionID, title: "Standup" })
      yield* meetings.append({
        meetingID: started.id,
        segments: [segment("seg_b", "them", "second", 1000), segment("seg_a", "me", "first", 0)],
      })
      const detail = yield* meetings.get({ meetingID: started.id })
      expect(detail.meeting).toEqual(started)
      expect(detail.segments.map((item) => item.id)).toEqual(["seg_a", "seg_b"])
      expect(detail.segments[1]).toEqual(segment("seg_b", "them", "second", 1000))
    }),
  )

  it.effect("skips a re-appended segment id", () =>
    Effect.gen(function* () {
      yield* setup
      const meetings = yield* SessionMeeting.Service
      const started = yield* meetings.start({ sessionID, title: "Retry" })
      const item = segment("seg_retry", "me", "once", 0)
      yield* meetings.append({ meetingID: started.id, segments: [item] })
      yield* meetings.append({ meetingID: started.id, segments: [item] })
      expect((yield* meetings.get({ meetingID: started.id })).segments).toEqual([item])
    }),
  )

  it.effect("rejects appends and stops after the meeting ended", () =>
    Effect.gen(function* () {
      yield* setup
      const meetings = yield* SessionMeeting.Service
      const started = yield* meetings.start({ sessionID, title: "Ended" })
      const stopped = yield* meetings.stop({ meetingID: started.id })
      expect(stopped.timeEnded).not.toBeNull()
      const append = yield* meetings
        .append({ meetingID: started.id, segments: [segment("seg_late", "them", "late", 0)] })
        .pipe(Effect.flip)
      expect(append.reason).toBe("ended")
      const stop = yield* meetings.stop({ meetingID: started.id }).pipe(Effect.flip)
      expect(stop.reason).toBe("ended")
    }),
  )

  it.effect("allows one running meeting per session", () =>
    Effect.gen(function* () {
      yield* setup
      const meetings = yield* SessionMeeting.Service
      yield* meetings.start({ sessionID, title: "First" })
      const second = yield* meetings.start({ sessionID, title: "Second" }).pipe(Effect.flip)
      expect(second.reason).toBe("active")
    }),
  )

  it.effect("rejects a meeting for an unknown session", () =>
    Effect.gen(function* () {
      yield* setup
      const meetings = yield* SessionMeeting.Service
      const error = yield* meetings
        .start({ sessionID: SessionSchema.ID.make("ses_missing_meeting"), title: "Nowhere" })
        .pipe(Effect.flip)
      expect(error.reason).toBe("missing_session")
    }),
  )

  it.effect("exposes the running meeting to the system context", () =>
    Effect.gen(function* () {
      yield* setup
      const meetings = yield* SessionMeeting.Service
      const context = yield* MeetingContext.Service
      const empty = yield* SystemContext.initialize(yield* context.load(sessionID))
      expect(empty.snapshot).toEqual({})

      const started = yield* meetings.start({ sessionID, title: "Context" })
      yield* meetings.append({ meetingID: started.id, segments: [segment("seg_ctx", "them", "ship on friday", 0)] })
      const generation = yield* SystemContext.initialize(yield* context.load(sessionID))
      expect(generation.baseline).toContain("Live meeting: Context")
      expect(generation.baseline).toContain("them: ship on friday")
    }),
  )
})
