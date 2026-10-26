import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { MessageTable, PartTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { testEffect } from "./lib/effect"

const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: () => Effect.succeed({ id: ProjectV2.ID.global, directory: AbsolutePath.make("/project") }),
    list: () => Effect.succeed([]),
    directories: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionV2.node]), [
    [ProjectV2.node, projects],
    [SessionExecution.node, SessionExecution.noopLayer],
  ]),
)
const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })

describe("SessionLegacyImport", () => {
  it.live("copies a V1 transcript into V2 once and leaves the V1 rows alone", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })
      const sessionID = created.id
      const v1 = [
        { id: "msg_001", role: "user", time: { created: 1000 }, agent: "build", model: { providerID: "p", modelID: "m" } },
        {
          id: "msg_002",
          role: "assistant",
          parentID: "msg_001",
          time: { created: 2000, completed: 3000 },
          modelID: "m",
          providerID: "p",
          mode: "build",
          agent: "build",
          path: { cwd: "/project", root: "/project" },
          cost: 0.5,
          tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
          finish: "stop",
        },
      ]
      const parts = [
        { id: "prt_001", message_id: "msg_001", data: { type: "text", text: "hello" } },
        { id: "prt_002", message_id: "msg_002", data: { type: "text", text: "hi there" } },
        {
          id: "prt_003",
          message_id: "msg_002",
          data: {
            type: "tool",
            callID: "call_1",
            tool: "read",
            state: {
              status: "completed",
              input: { path: "a.ts" },
              output: "contents",
              title: "a.ts",
              metadata: {},
              time: { start: 2100, end: 2200 },
            },
          },
        },
      ]
      yield* insertV1(sessionID, v1, parts)

      expect(yield* SessionV2.SessionLegacyImport.run(database.db)).toBe(1)
      expect(yield* SessionV2.SessionLegacyImport.run(database.db)).toBe(0)

      const messages = yield* session.messages({ sessionID, order: "asc" })
      expect(messages.map((message) => message.type)).toEqual(["user", "assistant"])
      const [first, second] = messages
      expect(first?.type === "user" && first.text).toBe("hello")
      if (second?.type !== "assistant") throw new Error("expected an assistant message")
      expect(second.content.map((item) => item.type)).toEqual(["text", "tool"])
      const call = second.content[1]
      expect(call?.type === "tool" && call.state.status === "completed" && call.state.content).toEqual([
        { type: "text", text: "contents" },
      ])
      const rows = yield* database.db
        .select({ seq: SessionMessageTable.seq })
        .from(SessionMessageTable)
        .where(eq(SessionMessageTable.session_id, sessionID))
        .all()
        .pipe(Effect.orDie)
      expect(rows.every((row) => row.seq < 0)).toBe(true)
      expect(
        (yield* database.db.select().from(MessageTable).where(eq(MessageTable.session_id, sessionID)).all().pipe(Effect.orDie))
          .length,
      ).toBe(2)
    }),
  )

  it.live("maps subtask, patch and compaction parts and tool-result attachments onto V2 shapes", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const session = yield* SessionV2.Service
      const sessionID = (yield* session.create({ location })).id
      const turn = (id: string, parentID: string, created: number, summary?: boolean) => ({
        id,
        role: "assistant",
        parentID,
        time: { created, completed: created + 500 },
        modelID: "m",
        providerID: "p",
        mode: "build",
        agent: "build",
        path: { cwd: "/project", root: "/project" },
        ...(summary ? { summary } : {}),
        cost: 0,
        tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
        finish: "stop",
      })
      const asked = (id: string, created: number) => ({
        id,
        role: "user",
        time: { created },
        agent: "build",
        model: { providerID: "p", modelID: "m" },
      })
      yield* insertV1(
        sessionID,
        [asked("msg_001", 1000), turn("msg_002", "msg_001", 2000), asked("msg_003", 3000), turn("msg_004", "msg_003", 4000, true), asked("msg_005", 5000)],
        [
          { id: "prt_001", message_id: "msg_001", data: { type: "subtask", prompt: "Review the diff", description: "review", agent: "reviewer" } },
          { id: "prt_002", message_id: "msg_002", data: { type: "step-start", snapshot: "tree-start" } },
          {
            id: "prt_003",
            message_id: "msg_002",
            data: {
              type: "tool",
              callID: "call_1",
              tool: "screenshot",
              state: {
                status: "completed",
                input: {},
                output: "captured",
                title: "screenshot",
                metadata: {},
                time: { start: 2100, end: 2200 },
                attachments: [{ id: "prt_att", sessionID, messageID: "msg_002", type: "file", mime: "image/png", filename: "shot.png", url: "data:image/png;base64,aGk=" }],
              },
            },
          },
          { id: "prt_004", message_id: "msg_002", data: { type: "patch", hash: "tree-start", files: ["/project/src/a.ts", "/project/src/b.ts"] } },
          { id: "prt_005", message_id: "msg_002", data: { type: "step-finish", reason: "stop", snapshot: "tree-end", cost: 0, tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } } } },
          { id: "prt_006", message_id: "msg_003", data: { type: "compaction", auto: true, tail_start_id: "msg_002" } },
          { id: "prt_007", message_id: "msg_004", data: { type: "text", text: "Summary so far" } },
          { id: "prt_008", message_id: "msg_005", data: { type: "text", text: "Continue" } },
          { id: "prt_009", message_id: "msg_002", data: { type: "text", text: "Reviewed" } },
        ],
      )

      expect(yield* SessionV2.SessionLegacyImport.run(database.db)).toBe(1)

      const messages = yield* session.messages({ sessionID, order: "asc" })
      expect(messages.map((message) => message.type)).toEqual(["user", "assistant", "compaction", "user"])
      expect(messages[0]).toMatchObject({ type: "user", text: "Review the diff", agents: [{ name: "reviewer" }] })
      expect(messages[1]).toMatchObject({
        type: "assistant",
        snapshot: { start: "tree-start", end: "tree-end", files: ["src/a.ts", "src/b.ts"] },
        content: [
          {
            type: "tool",
            state: {
              status: "completed",
              attachments: [{ uri: "data:image/png;base64,aGk=", mime: "image/png", name: "shot.png" }],
            },
          },
          { type: "text", text: "Reviewed" },
        ],
      })
      expect(messages[2]).toMatchObject({
        type: "compaction",
        reason: "auto",
        summary: "Summary so far",
        recent: "Assistant: Reviewed",
      })
      expect(messages[3]).toMatchObject({ type: "user", text: "Continue" })
    }),
  )

  it.live("counts only Sessions that gained messages and skips Sessions already holding V2 messages", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const session = yield* SessionV2.Service
      const broken = (yield* session.create({ location })).id
      const prompted = (yield* session.create({ location })).id
      const ok = (yield* session.create({ location })).id
      const asked = { role: "user", time: { created: 1000 }, agent: "build", model: { providerID: "p", modelID: "m" } }
      // A user message with no text and no files converts to nothing.
      yield* insertV1(broken, [{ id: "msg_b1", ...asked }], [{ id: "prt_b1", message_id: "msg_b1", data: { type: "text", text: "" } }])
      yield* insertV1(ok, [{ id: "msg_o1", ...asked }], [{ id: "prt_o1", message_id: "msg_o1", data: { type: "text", text: "old" } }])
      yield* insertV1(prompted, [{ id: "msg_p1", ...asked }], [{ id: "prt_p1", message_id: "msg_p1", data: { type: "text", text: "old" } }])
      // A prompt that reached the Session before the import ran leaves a V2 message behind.
      yield* database.db
        .insert(SessionMessageTable)
        .values({
          id: "msg_new" as never,
          session_id: prompted,
          type: "user",
          seq: 1,
          time_created: 5000,
          data: { text: "new", time: { created: 5000 } } as never,
        })
        .run()
        .pipe(Effect.orDie)

      expect(yield* SessionV2.SessionLegacyImport.run(database.db)).toBe(1)
      const rows = (id: SessionV2.ID) =>
        database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.session_id, id)).all().pipe(Effect.orDie)
      expect((yield* rows(ok)).length).toBe(1)
      expect((yield* rows(broken)).length).toBe(0)
      expect((yield* rows(prompted)).length).toBe(1)
    }),
  )
})

const insertV1 = (
  sessionID: SessionV2.ID,
  messages: ReadonlyArray<{ id: string } & Record<string, unknown>>,
  parts: ReadonlyArray<{ id: string; message_id: string; data: unknown }>,
) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    yield* Effect.forEach(messages, ({ id, ...data }, index) =>
      database.db
        .insert(MessageTable)
        .values({ id: id as never, session_id: sessionID, time_created: 1000 * (index + 1), time_updated: 0, data: data as never })
        .run()
        .pipe(Effect.orDie),
    )
    yield* Effect.forEach(parts, (part) =>
      database.db
        .insert(PartTable)
        .values({
          id: part.id as never,
          message_id: part.message_id as never,
          session_id: sessionID,
          time_created: 0,
          time_updated: 0,
          data: part.data as never,
        })
        .run()
        .pipe(Effect.orDie),
    )
  })
