import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Meeting } from "@orchestra/schema/meeting"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMeeting } from "@orchestra/core/session/meeting"
import { MeetingTable } from "@orchestra/core/session/meeting.sql"
import { MeetingItemTable, MeetingPersonTable, MeetingProposalTable } from "@orchestra/core/session/meeting-memory.sql"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, SessionMeeting.node])))
const sessionID = SessionSchema.ID.make("ses_meeting_memory")

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
      slug: "memory",
      directory: "/project",
      title: "memory",
      version: "test",
    })
    .run()
    .pipe(Effect.orDie)
  return db
})

const item = (
  meetingID: Meeting.ID,
  id: string,
  kind: "decision" | "commitment" | "question",
  text: string,
  revision = 1,
) => ({
  id,
  revision,
  meeting_id: meetingID,
  kind,
  text,
  asserter: "me",
  status: "claimed" as const,
  owner: kind === "commitment" ? "per_ana" : null,
  state: kind === "commitment" ? ("proposed" as const) : null,
  created_at: 1,
})

describe("meeting memory", () => {
  it.effect("reads the latest revision, hides dismissed items and counts", () =>
    Effect.gen(function* () {
      const db = yield* setup
      yield* db.insert(MeetingPersonTable).values({ id: "per_ana", name: "Ana" }).run().pipe(Effect.orDie)
      const meetings = yield* SessionMeeting.Service
      const started = yield* meetings.start({
        sessionID,
        title: "Planning",
        consent: "announced",
        retention: "ephemeral",
      })
      yield* db
        .insert(MeetingItemTable)
        .values([
          item(started.id, "itm_d", "decision", "Ship on Friday"),
          item(started.id, "itm_c", "commitment", "Send the deck"),
          item(started.id, "itm_q", "question", "Who pays?"),
        ])
        .run()
        .pipe(Effect.orDie)
      const confirmed = yield* meetings.confirm({
        meetingID: started.id,
        items: [
          { id: "itm_d", verdict: "confirmed" },
          { id: "itm_q", verdict: "dismissed" },
        ],
      })
      expect(confirmed.decisions.map((entry) => [entry.id, entry.status])).toEqual([["itm_d", "confirmed"]])
      expect(confirmed.questions).toEqual([])
      expect(confirmed.commitments[0]?.owner).toEqual({ id: "per_ana", name: "Ana" })
      const revisions = yield* db
        .select()
        .from(MeetingItemTable)
        .where(eq(MeetingItemTable.id, "itm_d"))
        .all()
        .pipe(Effect.orDie)
      expect(revisions.map((row) => [row.revision, row.status]).toSorted()).toEqual([
        [1, "claimed"],
        [2, "confirmed"],
      ])
      const detail = yield* meetings.get({ meetingID: started.id })
      expect(detail.summary.retention).toBe("ephemeral")
      expect(detail.summary.consent).toBe("announced")
      expect(detail.summary.counts).toEqual({ decisions: 1, commitments: 1, openCommitments: 1, answers: 0 })
      expect(detail.summary.people).toEqual([{ id: "per_ana", name: "Ana" }])
      expect(detail.card.status).toBe("pending")
    }),
  )

  it.effect("rejects an unknown item and writes nothing", () =>
    Effect.gen(function* () {
      const db = yield* setup
      const meetings = yield* SessionMeeting.Service
      const started = yield* meetings.start({ sessionID, title: "Refuse", consent: "unknown" })
      yield* db
        .insert(MeetingItemTable)
        .values(item(started.id, "itm_a", "decision", "A"))
        .run()
        .pipe(Effect.orDie)
      const error = yield* meetings
        .confirm({
          meetingID: started.id,
          items: [
            { id: "itm_a", verdict: "confirmed" },
            { id: "itm_ghost", verdict: "confirmed" },
          ],
        })
        .pipe(Effect.flip)
      expect(error.reason).toBe("missing_item")
      expect((yield* db.select().from(MeetingItemTable).all().pipe(Effect.orDie)).length).toBe(1)
    }),
  )

  it.effect("moves a commitment through states as revisions", () =>
    Effect.gen(function* () {
      const db = yield* setup
      const meetings = yield* SessionMeeting.Service
      const started = yield* meetings.start({ sessionID, title: "States", consent: "unknown" })
      yield* db
        .insert(MeetingItemTable)
        .values([item(started.id, "itm_c", "commitment", "Send"), item(started.id, "itm_d", "decision", "Decide")])
        .run()
        .pipe(Effect.orDie)
      expect((yield* meetings.commitment({ id: "itm_c", state: "accepted" })).state).toBe("accepted")
      expect((yield* meetings.commitment({ id: "itm_c", state: "done" })).state).toBe("done")
      expect((yield* meetings.get({ meetingID: started.id })).summary.counts.openCommitments).toBe(0)
      expect((yield* meetings.commitment({ id: "itm_d", state: "done" }).pipe(Effect.flip)).reason).toBe("missing_item")
    }),
  )

  it.effect("answers people proposals without auto-merging", () =>
    Effect.gen(function* () {
      const db = yield* setup
      yield* db.insert(MeetingPersonTable).values({ id: "per_ana", name: "Ana" }).run().pipe(Effect.orDie)
      const meetings = yield* SessionMeeting.Service
      const started = yield* meetings.start({ sessionID, title: "People", consent: "unknown" })
      yield* db
        .insert(MeetingProposalTable)
        .values([
          { id: "prp_new", meeting_id: started.id, name: "Bruno" },
          { id: "prp_merge", meeting_id: started.id, name: "Aninha", merge_with: "per_ana" },
          { id: "prp_skip", meeting_id: started.id, name: "Carla" },
        ])
        .run()
        .pipe(Effect.orDie)
      const before = (yield* meetings.get({ meetingID: started.id })).card.newPeople
      expect(before.map((entry) => entry.proposalID).toSorted()).toEqual(["prp_merge", "prp_new", "prp_skip"])
      const card = yield* meetings.confirm({
        meetingID: started.id,
        people: [
          { proposalID: "prp_new", verdict: "new" },
          { proposalID: "prp_merge", verdict: "merge" },
          { proposalID: "prp_skip", verdict: "dismissed" },
        ],
      })
      expect(card.newPeople).toEqual([])
      const people = yield* db.select().from(MeetingPersonTable).all().pipe(Effect.orDie)
      expect(people.map((row) => [row.name, row.merged_into]).toSorted()).toEqual([
        ["Ana", null],
        ["Aninha", "per_ana"],
        ["Bruno", null],
      ])
    }),
  )

  it.effect("searches item text and people with LIKE and pages with a cursor", () =>
    Effect.gen(function* () {
      const db = yield* setup
      yield* db.insert(MeetingPersonTable).values({ id: "per_ana", name: "Ana" }).run().pipe(Effect.orDie)
      const meetings = yield* SessionMeeting.Service
      const first = yield* meetings.start({ sessionID, title: "Alpha", consent: "unknown" })
      yield* meetings.stop({ meetingID: first.id })
      const second = yield* meetings.start({ sessionID, title: "Beta", consent: "unknown" })
      yield* db
        .insert(MeetingItemTable)
        .values([item(first.id, "itm_1", "commitment", "Budget 100%"), item(second.id, "itm_2", "decision", "Hire")])
        .run()
        .pipe(Effect.orDie)
      const ids = (query: Parameters<typeof meetings.list>[0]) =>
        meetings.list(query).pipe(Effect.map((result) => result.items.map((entry) => entry.id)))
      expect(yield* ids({ query: "100%" })).toEqual([first.id])
      expect(yield* ids({ query: "%" })).toEqual([first.id])
      expect(yield* ids({ query: "Hire" })).toEqual([second.id])
      expect(yield* ids({ person: "ana" })).toEqual([first.id])
      expect(yield* ids({ person: "nobody" })).toEqual([])
      const page = yield* meetings.list({ limit: 1 })
      expect(page.items.map((entry) => entry.id)).toEqual([second.id])
      expect(yield* ids({ before: page.next })).toEqual([first.id])
    }),
  )

  it.effect("deletes with a receipt, refuses while running, and survives session deletion", () =>
    Effect.gen(function* () {
      const db = yield* setup
      const meetings = yield* SessionMeeting.Service
      const kept = yield* meetings.start({ sessionID, title: "Kept", consent: "unknown" })
      yield* db
        .insert(MeetingItemTable)
        .values([
          item(kept.id, "itm_d", "decision", "D"),
          item(kept.id, "itm_c", "commitment", "C"),
          item(kept.id, "itm_c", "commitment", "C", 2),
        ])
        .run()
        .pipe(Effect.orDie)
      yield* db
        .insert(MeetingProposalTable)
        .values({ id: "prp_x", meeting_id: kept.id, name: "X" })
        .run()
        .pipe(Effect.orDie)
      expect((yield* meetings.remove({ meetingID: kept.id }).pipe(Effect.flip)).reason).toBe("running")
      yield* db.delete(SessionTable).where(eq(SessionTable.id, sessionID)).run().pipe(Effect.orDie)
      const row = yield* db.select().from(MeetingTable).where(eq(MeetingTable.id, kept.id)).get().pipe(Effect.orDie)
      expect(row?.session_id).toBeNull()
      yield* meetings.stop({ meetingID: kept.id })
      expect(yield* meetings.remove({ meetingID: kept.id })).toEqual({
        segments: 0,
        claims: 1,
        commitments: 1,
        people: 1,
      })
      expect(yield* db.select().from(MeetingItemTable).all().pipe(Effect.orDie)).toEqual([])
    }),
  )
})
