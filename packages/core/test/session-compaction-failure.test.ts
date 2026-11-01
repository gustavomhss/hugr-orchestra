import { expect } from "bun:test"
import { LLM, LLMError, LLMEvent, Message, Model, TransportReason } from "@orchestra/llm"
import { OpenAIChat } from "@orchestra/llm/protocols/openai-chat"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { DateTime, Effect, Logger, Stream } from "effect"
import { eq } from "drizzle-orm"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, EventV2.node, SessionProjector.node, SessionSubagentModels.node]),
  ),
)
const sessionID = SessionSchema.ID.make("ses_compaction_failure")
const model = Model.make({
  id: "summary-model",
  provider: "fake",
  route: OpenAIChat.route.with({ limits: { context: 20_000, output: 1_000 } }),
})

// A request far above the usable window, so the automatic check always tries to compact.
const request = LLM.request({ model, messages: [Message.user("fresh ".repeat(20_000))] })
const entries = [
  {
    seq: 1,
    message: SessionMessage.User.make({
      type: "user",
      id: SessionMessage.ID.make("msg_failure_history"),
      text: "past work ".repeat(4_000),
      time: { created: DateTime.makeUnsafe(0) },
    }),
  },
]

const run = (summary: Stream.Stream<LLMEvent, LLMError>) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const subagentModels = yield* SessionSubagentModels.Service
    yield* database.db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .run()
    yield* database.db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: Project.ID.global,
        slug: "test",
        directory: "/project",
        title: "test",
        version: "test",
      })
      .run()
    const logged: string[] = []
    const capture = Logger.make((options) => {
      logged.push(`${options.logLevel} ${JSON.stringify(options.message)}`)
    })
    const compaction = SessionCompaction.make({ events, llm: { stream: () => summary }, subagentModels, config: [] })
    const compacted = yield* compaction
      .compactIfNeeded({ sessionID, entries, model, request })
      .pipe(Effect.provide(Logger.layer([capture])))
    const ended = yield* database.db
      .select({ id: SessionMessageTable.id })
      .from(SessionMessageTable)
      .where(eq(SessionMessageTable.type, "compaction"))
      .all()
    return { compacted, logged, ended }
  })

it.effect("a provider error event during the summary is logged with its message and publishes no summary", () =>
  Effect.gen(function* () {
    const result = yield* run(Stream.fromIterable([LLMEvent.providerError({ message: "provider exploded" })]))

    expect(result.compacted).toBe(false)
    expect(result.ended).toEqual([])
    expect(result.logged).toHaveLength(1)
    expect(result.logged[0]).toStartWith("Warn")
    expect(result.logged[0]).toContain("provider exploded")
    expect(result.logged[0]).toContain(sessionID)
    expect(result.logged[0]).toContain("auto")
  }),
)

it.effect("an LLM error while streaming the summary is logged and not swallowed silently", () =>
  Effect.gen(function* () {
    const result = yield* run(
      Stream.concat(
        Stream.fromIterable([LLMEvent.textDelta({ id: "summary", text: "## Objective\n- partial" })]),
        Stream.fail(
          new LLMError({ module: "test", method: "stream", reason: new TransportReason({ message: "connection lost" }) }),
        ),
      ),
    )

    expect(result.compacted).toBe(false)
    expect(result.ended).toEqual([])
    expect(result.logged).toHaveLength(1)
    expect(result.logged[0]).toContain("connection lost")
  }),
)

it.effect("an empty summary is logged as such", () =>
  Effect.gen(function* () {
    const result = yield* run(Stream.fromIterable([LLMEvent.textDelta({ id: "summary", text: "   " })]))

    expect(result.compacted).toBe(false)
    expect(result.logged).toHaveLength(1)
    expect(result.logged[0]).toContain("empty summary")
  }),
)

it.effect("a summary that streams cleanly compacts and logs nothing", () =>
  Effect.gen(function* () {
    const result = yield* run(
      Stream.fromIterable([LLMEvent.textDelta({ id: "summary", text: "## Objective\n- Continue" })]),
    )

    expect(result.compacted).toBe(true)
    expect(result.ended).toHaveLength(1)
    expect(result.logged).toEqual([])
  }),
)
