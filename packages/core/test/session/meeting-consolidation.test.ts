import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer, Stream } from "effect"
import { LLMClient, LLMEvent, Model, type LLMClientShape, type LLMRequest } from "@orchestra/llm"
import * as OpenAIChat from "@orchestra/llm/protocols/openai-chat"
import { Meeting } from "@orchestra/schema/meeting"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMeeting } from "@orchestra/core/session/meeting"
import { MeetingConsolidation } from "@orchestra/core/session/meeting-consolidation"
import { MeetingTable, MeetingSegmentTable } from "@orchestra/core/session/meeting.sql"
import { MeetingItemTable, MeetingProposalTable } from "@orchestra/core/session/meeting-memory.sql"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { testEffect } from "../lib/effect"

// The stub model answers with whatever the test put in `reply`.
const reply = { text: "" }
const requests: LLMRequest[] = []
const replacements: LayerNode.Replacements = [
  [
    LayerNodePlatform.llmClient,
    Layer.succeed(
      LLMClient.Service,
      LLMClient.Service.of({
        prepare: () => Effect.die("unused"),
        stream: ((request: LLMRequest) => {
          requests.push(request)
          return Stream.make(LLMEvent.textDelta({ id: "card", text: reply.text }))
        }) as unknown as LLMClientShape["stream"],
        generate: () => Effect.die("unused"),
      }),
    ),
  ],
  [
    SessionRunnerModel.node,
    SessionRunnerModel.layerWith(() =>
      Effect.succeed(Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route })),
    ),
  ],
]
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, SessionMeeting.node, MeetingConsolidation.node]), replacements),
)
const sessionID = SessionSchema.ID.make("ses_meeting_consolidation")

const answer = {
  summary: "Planned the launch.",
  items: [
    { kind: "decision", text: "Ship on Friday", quote: "we ship Friday", asserter: "me", start_ms: 0 },
    {
      kind: "commitment",
      text: "Ana sends the deck",
      quote: "I'll send the deck",
      asserter: "Ana",
      start_ms: 1000,
      owner: "Ana",
      counterparty: "me",
      due: "Thursday",
    },
  ],
  people: [{ name: "Ana" }],
}

const stopped = (retention: Meeting.Retention) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    yield* database.db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .run()
      .pipe(Effect.orDie)
    yield* database.db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: Project.ID.global,
        slug: "consolidation",
        directory: "/project",
        title: "consolidation",
        version: "test",
      })
      .run()
      .pipe(Effect.orDie)
    const meetings = yield* SessionMeeting.Service
    const started = yield* meetings.start({ sessionID, title: "Launch", consent: "announced", retention })
    yield* meetings.append({
      meetingID: started.id,
      segments: [
        { id: "seg_1", track: "me", text: "we ship Friday", startMs: 0, endMs: 900 },
        { id: "seg_2", track: "them", text: "I'll send the deck by Thursday", startMs: 1000, endMs: 2000 },
      ],
    })
    yield* meetings.stop({ meetingID: started.id })
    return started.id
  })

describe("meeting consolidation", () => {
  it.effect("fills the card from one model answer and proposes people", () =>
    Effect.gen(function* () {
      reply.text = `<think>reading</think>${JSON.stringify(answer)}`
      const meetingID = yield* stopped("kept")
      const consolidation = yield* MeetingConsolidation.Service
      yield* consolidation.run(meetingID)
      const user = requests.at(-1)!.messages.flatMap((message) => message.content)
      expect(JSON.stringify(user)).toContain("[1000] them: I'll send the deck by Thursday")
      const meetings = yield* SessionMeeting.Service
      const detail = yield* meetings.get({ meetingID })
      expect(detail.card.status).toBe("ready")
      expect(detail.card.summary).toBe("Planned the launch.")
      expect(detail.card.decisions.map((item) => [item.text, item.quote, item.startMs, item.status])).toEqual([
        ["Ship on Friday", "we ship Friday", 0, "claimed"],
      ])
      expect(detail.card.commitments[0]?.asserter).toEqual({ unknown: 1 })
      expect(detail.card.commitments[0]?.state).toBe("proposed")
      expect(detail.card.commitments[0]?.due).toBe("Thursday")
      expect(detail.card.newPeople.map((person) => [person.name, person.mergeWith])).toEqual([["Ana", undefined]])
      expect(detail.segments).toHaveLength(2)
    }),
  )

  it.effect("fails the card on output outside the schema and writes nothing else", () =>
    Effect.gen(function* () {
      reply.text = JSON.stringify({ ...answer, items: [{ ...answer.items[0], kind: "fact" }] })
      const meetingID = yield* stopped("kept")
      const consolidation = yield* MeetingConsolidation.Service
      yield* consolidation.run(meetingID)
      const database = yield* Database.Service
      const meeting = yield* database.db
        .select()
        .from(MeetingTable)
        .where(eq(MeetingTable.id, meetingID))
        .get()
        .pipe(Effect.orDie)
      expect([meeting?.card_status, meeting?.card_error]).toEqual(["failed", "invalid_output"])
      const items = yield* database.db.select().from(MeetingItemTable).all().pipe(Effect.orDie)
      const proposals = yield* database.db.select().from(MeetingProposalTable).all().pipe(Effect.orDie)
      expect([items.length, proposals.length]).toEqual([0, 0])
    }),
  )

  it.effect("drops the transcript of an ephemeral meeting and keeps no pointer into it", () =>
    Effect.gen(function* () {
      reply.text = JSON.stringify(answer)
      const meetingID = yield* stopped("ephemeral")
      const consolidation = yield* MeetingConsolidation.Service
      yield* consolidation.run(meetingID)
      const database = yield* Database.Service
      const segments = yield* database.db
        .select()
        .from(MeetingSegmentTable)
        .where(eq(MeetingSegmentTable.meeting_id, meetingID))
        .all()
        .pipe(Effect.orDie)
      expect(segments).toEqual([])
      const meetings = yield* SessionMeeting.Service
      const detail = yield* meetings.get({ meetingID })
      expect(detail.card.status).toBe("ready")
      expect(detail.card.decisions.map((item) => [item.quote, item.startMs])).toEqual([["", undefined]])
    }),
  )

  it.effect("drops the transcript of an ephemeral meeting whose card failed", () =>
    Effect.gen(function* () {
      reply.text = "not json"
      const meetingID = yield* stopped("ephemeral")
      const consolidation = yield* MeetingConsolidation.Service
      yield* consolidation.run(meetingID)
      const database = yield* Database.Service
      const segments = yield* database.db
        .select()
        .from(MeetingSegmentTable)
        .where(eq(MeetingSegmentTable.meeting_id, meetingID))
        .all()
        .pipe(Effect.orDie)
      expect(segments).toEqual([])
    }),
  )

  it.effect("marks a stopped meeting left pending by a restart as interrupted", () =>
    Effect.gen(function* () {
      const meetingID = yield* stopped("kept")
      const database = yield* Database.Service
      // A second, unshared build of the service stands in for the next boot over the same database.
      yield* Layer.build(
        Layer.fresh(
          AppNodeBuilder.build(MeetingConsolidation.node, [
            [Database.node, Layer.succeed(Database.Service, database)],
            ...replacements,
          ]),
        ),
      )
      const meeting = yield* database.db
        .select()
        .from(MeetingTable)
        .where(eq(MeetingTable.id, meetingID))
        .get()
        .pipe(Effect.orDie)
      expect([meeting?.card_status, meeting?.card_error]).toEqual(["failed", "interrupted"])
    }),
  )
})
