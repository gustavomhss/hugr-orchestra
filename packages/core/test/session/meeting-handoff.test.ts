import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { DateTime, Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Location } from "@orchestra/core/location"
import { Project, ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionInput } from "@orchestra/core/session/input"
import { SessionMeeting } from "@orchestra/core/session/meeting"
import { MeetingHandoff } from "@orchestra/core/session/meeting-handoff"
import { MeetingItemTable, MeetingPersonTable } from "@orchestra/core/session/meeting-memory.sql"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionTable } from "@orchestra/core/session/sql"
import { globalSessions } from "@orchestra/core/tool/task"
import { testEffect } from "../lib/effect"

const directory = AbsolutePath.make("/project")
const prompts: Parameters<SessionV2.Interface["prompt"]>[0][] = []
const created: Parameters<SessionV2.Interface["create"]>[0][] = []
// The mock opens Sessions in the test database, which exists only once the layer is built.
const store: { db?: Database.Interface["db"] } = {}

const session = (id: string, agent: string | null) => ({
  id: SessionV2.ID.make(id),
  project_id: Project.ID.global,
  slug: id,
  directory,
  title: id,
  version: "test",
  agent,
})

const sessions = Layer.mock(SessionV2.Service, {
  revert: {
    stage: () => Effect.die("unused"),
    clear: () => Effect.die("unused"),
    commit: () => Effect.die("unused"),
  },
  create: (input) =>
    Effect.gen(function* () {
      created.push(input)
      yield* store.db!.insert(SessionTable).values(session("ses_handoff_opened", input.agent ?? null)).run().pipe(Effect.orDie)
      // The handoff reads the new Session back from the database, not from this value.
      return undefined as never
    }),
  prompt: (input) =>
    Effect.sync(() => {
      prompts.push(input)
      return SessionInput.Admitted.make({
        admittedSeq: prompts.length,
        id: SessionMessage.ID.make("msg_meeting_handoff_admitted"),
        sessionID: input.sessionID,
        prompt: { text: input.prompt.text },
        delivery: input.delivery ?? "steer",
        timeCreated: DateTime.makeUnsafe(0),
      })
    }),
})

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, SessionMeeting.node, MeetingHandoff.node]), [
    [Location.node, Layer.succeed(Location.Service, { directory, project: { id: ProjectV2.ID.global, directory } })],
    [globalSessions, sessions],
  ]),
)

const item = (
  meetingID: string,
  id: string,
  kind: "decision" | "commitment" | "question" | "suggestion",
  extra: Partial<typeof MeetingItemTable.$inferInsert> = {},
) => ({
  id,
  revision: 1,
  meeting_id: meetingID as typeof MeetingItemTable.$inferInsert.meeting_id,
  kind,
  text: `${kind} text`,
  quote: "secret transcript quote",
  asserter: "per_ana",
  created_at: 1,
  ...extra,
})

const setup = (withMaestro: boolean) =>
  Effect.gen(function* () {
    prompts.length = 0
    created.length = 0
    const { db } = yield* Database.Service
    store.db = db
    yield* db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: directory, sandboxes: [] })
      .run()
      .pipe(Effect.orDie)
    yield* db.insert(SessionTable).values(session("ses_handoff_live", "live")).run().pipe(Effect.orDie)
    if (withMaestro)
      yield* db.insert(SessionTable).values(session("ses_handoff_maestro", "maestro")).run().pipe(Effect.orDie)
    yield* db.insert(MeetingPersonTable).values({ id: "per_ana", name: "Ana" }).run().pipe(Effect.orDie)
    const meetings = yield* SessionMeeting.Service
    const started = yield* meetings.start({
      sessionID: SessionV2.ID.make("ses_handoff_live"),
      title: "Planning",
      consent: "unknown",
    })
    yield* db
      .insert(MeetingItemTable)
      .values([
        item(started.id, "itm_decision", "decision"),
        item(started.id, "itm_question", "question", { asserter: "me" }),
        item(started.id, "itm_mine", "suggestion", { for: "owner" }),
        item(started.id, "itm_theirs", "suggestion", { for: "maestro" }),
        item(started.id, "itm_gone", "decision", { status: "dismissed" }),
      ])
      .run()
      .pipe(Effect.orDie)
    return { db, meeting: started.id }
  })

describe("MeetingHandoff", () => {
  it.effect("queues one message without quotes and marks the items sent", () =>
    Effect.gen(function* () {
      const { db, meeting } = yield* setup(true)
      const handoff = yield* MeetingHandoff.Service

      const result = yield* handoff.handoff({ meetingID: meeting, itemIDs: ["itm_decision", "itm_question", "itm_theirs"] })

      expect(result.sent).toEqual(["itm_decision", "itm_question", "itm_theirs"])
      expect(prompts).toHaveLength(1)
      expect(prompts[0]!.sessionID).toEqual(SessionV2.ID.make("ses_handoff_maestro"))
      expect(prompts[0]!.delivery).toBe("queue")
      expect(prompts[0]!.resume).toBe(false)
      const text = prompts[0]!.prompt.text
      expect(text).toContain("<team_message from=\"live\">")
      expect(text).toContain("Planning")
      expect(text).toContain(`decision: decision text (Ana) [meeting ${meeting} item itm_decision]`)
      expect(text).toContain("question: question text (me)")
      expect(text).not.toContain("secret transcript quote")
      expect(text).toContain("Do not start work on any of them until the owner asks.")
      const rows = yield* db.select().from(MeetingItemTable).where(eq(MeetingItemTable.id, "itm_decision")).all().pipe(Effect.orDie)
      expect(rows.map((row) => [row.revision, row.sent_to_maestro])).toEqual([
        [1, false],
        [2, true],
      ])
    }),
  )

  it.effect("fails missing_item for unknown, dismissed, wrong-kind or other-meeting items and sends nothing", () =>
    Effect.gen(function* () {
      const { meeting } = yield* setup(true)
      const handoff = yield* MeetingHandoff.Service
      const reason = (ids: string[]) =>
        handoff.handoff({ meetingID: meeting, itemIDs: ids }).pipe(
          Effect.flip,
          Effect.map((error) => error.reason),
        )

      expect(yield* reason(["itm_decision", "itm_nope"])).toBe("missing_item")
      expect(yield* reason(["itm_gone"])).toBe("missing_item")
      expect(yield* reason(["itm_mine"])).toBe("missing_item")
      expect(prompts).toEqual([])
    }),
  )

  it.effect("opens a Maestro conversation when the project has none and delivers there", () =>
    Effect.gen(function* () {
      const { db, meeting } = yield* setup(false)
      const handoff = yield* MeetingHandoff.Service

      const result = yield* handoff.handoff({ meetingID: meeting, itemIDs: ["itm_decision"] })

      expect(result.sent).toEqual(["itm_decision"])
      expect(created).toEqual([{ agent: AgentV2.ID.make("maestro"), location: { directory } }])
      expect(prompts.map((input) => input.sessionID)).toEqual([SessionV2.ID.make("ses_handoff_opened")])
      const rows = yield* db.select().from(MeetingItemTable).where(eq(MeetingItemTable.id, "itm_decision")).all().pipe(Effect.orDie)
      expect(rows.map((row) => row.sent_to_maestro)).toEqual([false, true])
    }),
  )
})
