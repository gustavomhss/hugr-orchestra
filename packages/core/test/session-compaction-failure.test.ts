import { expect } from "bun:test"
import { LLM, LLMError, LLMEvent, Message, Model, TransportReason } from "@orchestra/llm"
import { OpenAIChat } from "@orchestra/llm/protocols/openai-chat"
import { Event } from "@orchestra/schema/event"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { DateTime, Deferred, Effect, Exit, Fiber, Logger, Schema, Stream } from "effect"
import { and, eq, like } from "drizzle-orm"
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

// Use durable tags, including the future failure tag, without importing an unimplemented schema symbol.
const started = Event.versionedType("session.next.compaction.started", 1)
const failed = Event.versionedType("session.next.compaction.failed", 1)
const ended = Event.versionedType("session.next.compaction.ended", 1)
const disabledAuto: readonly Config.Entry[] = [
  Schema.decodeUnknownSync(Config.Document)({ type: "document", info: { compaction: { auto: false } } }),
]

const setup = (
  summary: Stream.Stream<LLMEvent, LLMError>,
  input: Partial<SessionCompaction.Input> = {},
  reason: "auto" | "manual" = "auto",
  config: readonly Config.Entry[] = [],
) =>
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
    const compaction = SessionCompaction.make({ events, llm: { stream: () => summary }, subagentModels, config })
    const attempt = { sessionID, entries, model, request, ...input }
    const compact = (reason === "manual" ? compaction.compact(attempt) : compaction.compactIfNeeded(attempt)).pipe(
      Effect.provide(Logger.layer([capture])),
    )
    const rows = database.db
      .select()
      .from(EventTable)
      .where(and(eq(EventTable.aggregate_id, sessionID), like(EventTable.type, "session.next.compaction.%")))
      .orderBy(EventTable.seq)
      .all()
    const checkpoints = database.db
      .select({ id: SessionMessageTable.id })
      .from(SessionMessageTable)
      .where(and(eq(SessionMessageTable.session_id, sessionID), eq(SessionMessageTable.type, "compaction")))
      .all()
    return { compact, logged, rows, checkpoints, database, subagentModels }
  })

const run = (summary: Stream.Stream<LLMEvent, LLMError>, input: Partial<SessionCompaction.Input> = {}) =>
  Effect.gen(function* () {
    const fixture = yield* setup(summary, input)
    const compacted = yield* fixture.compact
    return { compacted, logged: fixture.logged, rows: yield* fixture.rows, checkpoints: yield* fixture.checkpoints }
  })

function expectFailed(
  rows: (typeof EventTable.$inferSelect)[],
  reason: "auto" | "manual" = "auto",
  message = "Compaction failed",
) {
  expect(rows.map((row) => row.type)).toEqual([started, failed])
  expect(rows.map((row) => row.data.sessionID)).toEqual([sessionID, sessionID])
  expect(rows.map((row) => row.data.reason)).toEqual([reason, reason])
  expect(rows[0].data.messageID).toBeString()
  expect(String(rows[0].data.messageID).length).toBeGreaterThan(0)
  expect(rows[1].data.messageID).toBe(rows[0].data.messageID)
  expect(rows[0].data.timestamp).toBeDefined()
  expect(rows[1].data.timestamp).toBeDefined()
  expect(rows[1].data.error).toEqual({ type: "unknown", message })
}

it.effect("partial text followed by two provider errors fails once, logs both errors and publishes no summary", () =>
  Effect.gen(function* () {
    const result = yield* run(
      Stream.fromIterable([
        LLMEvent.textDelta({ id: "summary", text: "## Objective\n- partial provider summary" }),
        LLMEvent.providerError({ message: "provider exploded" }),
        LLMEvent.providerError({ message: "provider rejected continuation" }),
      ]),
    )

    expect(result.compacted).toBe(false)
    expect(result.checkpoints).toEqual([])
    expect(result.logged).toHaveLength(1)
    expect(result.logged[0]).toStartWith("Warn")
    expect(result.logged[0]).toContain("provider exploded")
    expect(result.logged[0]).toContain("provider rejected continuation")
    expect(result.logged[0]).toContain(sessionID)
    expect(result.logged[0]).toContain("auto")
    expectFailed(result.rows)
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
    expect(result.checkpoints).toEqual([])
    expect(result.logged).toHaveLength(1)
    expect(result.logged[0]).toStartWith("Warn")
    expect(result.logged[0]).toContain("connection lost")
    expectFailed(result.rows)
  }),
)

it.effect("an empty summary is logged as such", () =>
  Effect.gen(function* () {
    const result = yield* run(Stream.fromIterable([LLMEvent.textDelta({ id: "summary", text: "   " })]))

    expect(result.compacted).toBe(false)
    expect(result.checkpoints).toEqual([])
    expect(result.logged).toHaveLength(1)
    expect(result.logged[0]).toStartWith("Warn")
    expect(result.logged[0]).toContain("empty summary")
    expectFailed(result.rows)
  }),
)

it.effect("a summary that streams cleanly compacts and logs nothing", () =>
  Effect.gen(function* () {
    const result = yield* run(
      Stream.fromIterable([LLMEvent.textDelta({ id: "summary", text: "## Objective\n- Continue" })]),
    )

    expect(result.compacted).toBe(true)
    expect(result.checkpoints).toHaveLength(1)
    expect(result.logged).toEqual([])
    expect(result.rows.map((row) => row.type)).toEqual([started, ended])
    expect(result.rows.map((row) => row.data.sessionID)).toEqual([sessionID, sessionID])
    expect(result.rows.map((row) => row.data.reason)).toEqual(["auto", "auto"])
    expect(result.rows[0].data.messageID).toBeString()
    expect(String(result.rows[0].data.messageID).length).toBeGreaterThan(0)
    expect(result.rows[1].data.messageID).toBe(result.rows[0].data.messageID)
    expect(result.checkpoints[0].id).toBe(Schema.decodeUnknownSync(SessionMessage.ID)(result.rows[0].data.messageID))
  }),
)

it.effect("auto:false suppresses an otherwise eligible automatic compaction without events or logs", () =>
  Effect.gen(function* () {
    const fixture = yield* setup(
      Stream.fromIterable([LLMEvent.textDelta({ id: "summary", text: "## Objective\n- Continue" })]),
      {},
      "auto",
      disabledAuto,
    )
    const compacted = yield* fixture.compact
    const rows = yield* fixture.rows
    const checkpoints = yield* fixture.checkpoints

    expect(compacted).toBe(false)
    expect(rows).toEqual([])
    expect(checkpoints).toEqual([])
    expect(fixture.logged).toEqual([])
  }),
)

it.effect("auto:false still permits manual compaction with a matching checkpoint and manual lifecycle", () =>
  Effect.gen(function* () {
    const fixture = yield* setup(
      Stream.fromIterable([LLMEvent.textDelta({ id: "summary", text: "## Objective\n- Continue" })]),
      {},
      "manual",
      disabledAuto,
    )
    const compacted = yield* fixture.compact
    const rows = yield* fixture.rows
    const checkpoints = yield* fixture.checkpoints

    expect(compacted).toBe(true)
    expect(rows.map((row) => row.type)).toEqual([started, ended])
    expect(rows.map((row) => row.data.sessionID)).toEqual([sessionID, sessionID])
    expect(rows.map((row) => row.data.reason)).toEqual(["manual", "manual"])
    expect(rows[0].data.messageID).toBeString()
    expect(String(rows[0].data.messageID).length).toBeGreaterThan(0)
    expect(rows[1].data.messageID).toBe(rows[0].data.messageID)
    expect(checkpoints).toHaveLength(1)
    expect(checkpoints[0].id).toBe(Schema.decodeUnknownSync(SessionMessage.ID)(rows[0].data.messageID))
    expect(fixture.logged).toEqual([])
  }),
)

it.effect("a tiny history is ineligible and publishes no compaction lifecycle events", () =>
  Effect.gen(function* () {
    const result = yield* run(Stream.die(new Error("ineligible summary must not run")), {
      entries: [{ ...entries[0], message: SessionMessage.User.make({ ...entries[0].message, text: "tiny" }) }],
    })

    expect(result.compacted).toBe(false)
    expect(result.logged).toEqual([])
    expect(result.rows).toEqual([])
    expect(result.checkpoints).toEqual([])
  }),
)

it.effect("an undefined context limit is ineligible and publishes no compaction lifecycle events", () =>
  Effect.gen(function* () {
    const unbounded = Model.make({ id: "unbounded", provider: "fake", route: OpenAIChat.route })
    const result = yield* run(Stream.die(new Error("ineligible summary must not run")), {
      model: unbounded,
      request: LLM.request({ model: unbounded, messages: request.messages }),
    })

    expect(result.compacted).toBe(false)
    expect(result.logged).toEqual([])
    expect(result.rows).toEqual([])
    expect(result.checkpoints).toEqual([])
  }),
)

it.effect("interrupting a running manual summary joins its failed terminal without replacing interruption", () =>
  Effect.gen(function* () {
    const streaming = yield* Deferred.make<void>()
    const fixture = yield* setup(
      Stream.unwrap(Deferred.succeed(streaming, undefined).pipe(Effect.as(Stream.never))),
      {},
      "manual",
    )
    // The scoped owner is installed before waiting; assertion failures cannot strand the never-ending summary.
    const fiber = yield* fixture.compact.pipe(Effect.forkScoped)
    yield* Deferred.await(streaming)
    yield* Fiber.interrupt(fiber)
    const exit = yield* Fiber.await(fiber)
    const rows = yield* fixture.rows
    const checkpoints = yield* fixture.checkpoints

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons.length).toBeGreaterThan(0)
      expect(exit.cause.reasons.every((reason) => reason._tag === "Interrupt")).toBe(true)
    }
    expect(checkpoints).toEqual([])
    expectFailed(rows, "manual", "Compaction interrupted")
  }),
)

it.effect("a real ancestor model-policy denial retains its typed failure and settles the started attempt", () =>
  Effect.gen(function* () {
    const fixture = yield* setup(Stream.die(new Error("denied summary must not run")))
    const parentID = SessionSchema.ID.make("ses_compaction_policy_parent")
    yield* fixture.database.db
      .insert(SessionTable)
      .values({
        id: parentID,
        project_id: Project.ID.global,
        slug: "parent",
        directory: "/project",
        title: "parent",
        version: "test",
      })
      .run()
    yield* fixture.database.db.update(SessionTable).set({ parent_id: parentID }).where(eq(SessionTable.id, sessionID)).run()
    yield* fixture.subagentModels.set(parentID, { mode: "allowlist", models: [] })
    const exit = yield* fixture.compact.pipe(Effect.exit)
    const rows = yield* fixture.rows
    const checkpoints = yield* fixture.checkpoints

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons).toHaveLength(1)
      const reason = exit.cause.reasons[0]
      expect(reason._tag).toBe("Fail")
      if (reason._tag === "Fail") {
        expect(reason.error).toBeInstanceOf(SessionSubagentModels.ModelDeniedError)
        expect(reason.error).toEqual(
          new SessionSubagentModels.ModelDeniedError({ sessionID, reason: "unknown-identity" }),
        )
      }
    }
    expect(checkpoints).toEqual([])
    expectFailed(rows)
  }),
)

it.effect("a summary stream defect retains the original defect and settles the started attempt", () =>
  Effect.gen(function* () {
    const defect = new Error("summary stream defect")
    const fixture = yield* setup(Stream.die(defect))
    const exit = yield* fixture.compact.pipe(Effect.exit)
    const rows = yield* fixture.rows
    const checkpoints = yield* fixture.checkpoints

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons).toHaveLength(1)
      const reason = exit.cause.reasons[0]
      expect(reason._tag).toBe("Die")
      if (reason._tag === "Die") expect(reason.defect).toBe(defect)
    }
    expect(checkpoints).toEqual([])
    expectFailed(rows)
  }),
)

it.effect("cancellation during started notification settles the durable manual attempt without replacing interruption", () =>
  Effect.gen(function* () {
    const fixture = yield* setup(Stream.never, {}, "manual")
    const events = yield* EventV2.Service
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const unsubscribe = yield* events.listen((event) =>
      Effect.gen(function* () {
        if (event.type !== "session.next.compaction.started") return
        yield* Deferred.succeed(entered, undefined)
        yield* Deferred.await(release)
      }),
    )
    yield* Effect.addFinalizer(() => unsubscribe)
    // Release before environment teardown; child supervision cannot strand a masked listener on assertion failure.
    yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
    const fiber = yield* fixture.compact.pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const rowsAtStart = yield* fixture.rows
    yield* Effect.sync(() => fiber.interruptUnsafe())
    yield* Deferred.succeed(release, undefined)
    const exit = yield* Fiber.await(fiber)
    const rows = yield* fixture.rows
    const checkpoints = yield* fixture.checkpoints

    expect(rowsAtStart.map((row) => row.type)).toEqual([started])
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons.length).toBeGreaterThan(0)
      expect(exit.cause.reasons.every((reason) => reason._tag === "Interrupt")).toBe(true)
    }
    expect(checkpoints).toEqual([])
    expectFailed(rows, "manual", "Compaction interrupted")
  }),
)
