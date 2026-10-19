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
      yield* Effect.forEach(v1, ({ id, ...data }, index) =>
        database.db
          .insert(MessageTable)
          .values({ id: id as never, session_id: sessionID, time_created: 1000 * (index + 1), time_updated: 0, data: data as never })
          .run()
          .pipe(Effect.orDie),
      )
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
})
