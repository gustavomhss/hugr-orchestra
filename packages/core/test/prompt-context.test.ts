import { expect } from "bun:test"
import { Cause, DateTime, Effect, Exit, Schema } from "effect"
import { asc, eq } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionInput } from "@orchestra/core/session/input"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionMessageUpdater } from "@orchestra/core/session/message-updater"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionInputTable, SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { Prompt } from "@orchestra/schema/prompt"
import { PromptContext } from "@orchestra/schema/prompt-context"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node])))
const sessionID = SessionSchema.ID.make("ses_prompt_context")
const permission = [{ permission: "bash", pattern: "*", action: "deny" as const }]
const prompt = Prompt.make({
  text: "unchanged user text",
  files: [{ uri: "file:///input.txt", mime: "text/plain", name: "input.txt" }],
  agents: [{ name: "backend" }],
})
const seed = Effect.gen(function* () {
  const database = yield* Database.Service
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
      permission,
    })
    .run()
  return database.db
})
const replay = Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const recorded = yield* database.db
    .select()
    .from(EventTable)
    .where(eq(EventTable.aggregate_id, sessionID))
    .orderBy(asc(EventTable.seq))
    .all()
  yield* events.remove(sessionID)
  yield* database.db.delete(SessionInputTable).run()
  yield* database.db.delete(SessionMessageTable).run()
  yield* events.replayAll(
    recorded.map((event) => ({
      id: event.id,
      aggregateID: event.aggregate_id,
      seq: event.seq,
      type: event.type,
      data: event.data,
    })),
  )
})

it.effect("prompt context survives admission, promotion and replay without changing text or permissions", () =>
  Effect.gen(function* () {
    const db = yield* seed
    const events = yield* EventV2.Service
    const state: SessionMessageUpdater.MemoryState = { messages: [] }
    const contexts = [{ reminders: ["first", "second"] }, { reminders: ["other prompt"] }]
    const admitted = yield* Effect.forEach(contexts, (promptContext, index) =>
      SessionInput.admit(db, events, {
        id: SessionMessage.ID.make(`msg_context_${index}`),
        sessionID,
        prompt,
        delivery: index === 0 ? "steer" : "queue",
        promptContext,
      }),
    )
    expect(yield* db.select().from(SessionMessageTable).all()).toEqual([])
    expect(admitted.map((input) => input.promptContext)).toEqual(contexts)
    yield* SessionInput.promoteSteers(db, events, sessionID, Math.max(...admitted.map((input) => input.admittedSeq)))
    expect(yield* SessionInput.promoteNextQueued(db, events, sessionID)).toBe(true)
    const rows = yield* db.select().from(SessionMessageTable).orderBy(asc(SessionMessageTable.seq)).all()
    expect(rows.map((row) => row.data)).toEqual(
      contexts.map((promptContext) => expect.objectContaining({ ...prompt, promptContext })),
    )
    const durable = yield* db.select().from(EventTable).orderBy(asc(EventTable.seq)).all()
    for (const row of durable) {
      const event = Schema.decodeUnknownSync(SessionEvent.Durable)({
        data: row.data,
        id: row.id,
        type: row.type.replace(/\.1$/, ""),
        durable: { aggregateID: row.aggregate_id, seq: row.seq, version: 1 },
      })
      yield* SessionMessageUpdater.update(SessionMessageUpdater.memory(state), event)
    }
    expect(state.messages.map((message) => (message.type === "user" ? message.promptContext : undefined))).toEqual(
      contexts,
    )
    yield* replay
    // time_updated records projection wall time, not durable prompt chronology.
    expect(yield* db.select().from(SessionMessageTable).orderBy(asc(SessionMessageTable.seq)).all()).toEqual(
      rows.map((row) => ({ ...row, time_updated: expect.any(Number) })),
    )
    expect((yield* db.select().from(SessionTable).get())?.permission).toEqual(permission)
  }),
)

it.effect("exact retry with changed context retains stored original", () =>
  Effect.gen(function* () {
    const db = yield* seed
    const events = yield* EventV2.Service
    const input = { id: SessionMessage.ID.make("msg_retry_context"), sessionID, prompt, delivery: "steer" as const }
    const original = yield* SessionInput.admit(db, events, { ...input, promptContext: { reminders: ["original"] } })
    const retry = yield* SessionInput.admit(db, events, { ...input, promptContext: { reminders: ["edited hook"] } })
    expect(SessionInput.equivalent(retry, input)).toBe(true)
    expect(retry).toEqual(original)
    expect((yield* db.select().from(EventTable).all()).length).toBe(1)
    yield* SessionInput.promoteSteers(db, events, sessionID, original.admittedSeq)
    expect((yield* db.select().from(SessionMessageTable).get())?.data).toMatchObject({
      promptContext: { reminders: ["original"] },
    })
  }),
)

it.effect("concurrent same-ID admissions return winning canonical context", () =>
  Effect.gen(function* () {
    const db = yield* seed
    const events = yield* EventV2.Service
    const input = { id: SessionMessage.ID.make("msg_race_context"), sessionID, prompt, delivery: "steer" as const }
    const results = yield* Effect.all(
      ["left", "right"].map((reminder) =>
        SessionInput.admit(db, events, { ...input, promptContext: { reminders: [reminder] } }),
      ),
      { concurrency: "unbounded" },
    )
    const stored = yield* SessionInput.find(db, input.id)
    if (stored === undefined) return yield* Effect.die("Winning admission missing")
    expect(stored?.promptContext?.reminders.length).toBe(1)
    expect(results).toEqual([stored, stored])
    expect((yield* db.select().from(EventTable).all()).length).toBe(1)
    yield* SessionInput.promoteSteers(db, events, sessionID, stored.admittedSeq)
    expect((yield* db.select().from(SessionMessageTable).get())?.data).toMatchObject({
      promptContext: stored.promptContext,
    })
  }),
)

it.effect("promotion rejects changed, reordered, or dropped prompt context and rolls back", () =>
  Effect.gen(function* () {
    const db = yield* seed
    const events = yield* EventV2.Service
    const original = yield* SessionInput.admit(db, events, {
      id: SessionMessage.ID.make("msg_drift_context"),
      sessionID,
      prompt,
      delivery: "steer",
      promptContext: { reminders: ["first", "second"] },
    })
    for (const promptContext of [{ reminders: ["changed"] }, { reminders: ["second", "first"] }, undefined]) {
      const exit = yield* events
        .publish(SessionEvent.Prompted, {
          sessionID,
          messageID: original.id,
          timestamp: original.timeCreated,
          prompt,
          delivery: original.delivery,
          promptContext,
        })
        .pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("SessionInput.LifecycleConflict")
      expect((yield* SessionInput.find(db, original.id))?.promotedSeq).toBeUndefined()
      expect(yield* db.select().from(SessionMessageTable).all()).toEqual([])
    }
    yield* SessionInput.promoteSteers(db, events, sessionID, original.admittedSeq)
    expect((yield* db.select().from(SessionMessageTable).get())?.data).toMatchObject({
      promptContext: original.promptContext,
    })
  }),
)

it.effect("historical prompts omit context and synthesize promoted inbox records on replay", () =>
  Effect.gen(function* () {
    const db = yield* seed
    const events = yield* EventV2.Service
    const event = yield* events.publish(SessionEvent.Prompted, {
      sessionID,
      messageID: SessionMessage.ID.make("msg_historic_context"),
      timestamp: DateTime.makeUnsafe(0),
      prompt,
      delivery: "steer",
    })
    const input = yield* SessionInput.find(db, event.data.messageID)
    expect(input?.promptContext).toBeUndefined()
    expect(input?.promotedSeq).toBe(event.durable?.seq)
    expect((yield* db.select().from(SessionInputTable).get())?.prompt_context).toBeNull()
    expect((yield* db.select().from(SessionMessageTable).get())?.data).not.toHaveProperty("promptContext")
    yield* replay
    expect(yield* SessionInput.find(db, event.data.messageID)).toEqual(input)
  }),
)

it.effect("prompt context contract stays neutral and public Prompt excludes privileged sidecar", () =>
  Effect.sync(() => {
    expect(Object.keys(PromptContext.Info.fields)).toEqual(["reminders"])
    expect(Object.keys(Prompt.fields)).toEqual(["text", "files", "agents"])
    expect(
      Schema.encodeSync(Prompt)(
        Schema.decodeUnknownSync(Prompt)({ ...prompt, promptContext: { reminders: ["untrusted"] } }),
      ),
    ).toEqual(prompt)
    expect(
      Schema.encodeSync(SessionMessage.User)(
        SessionMessage.User.make({
          id: SessionMessage.ID.make("msg_optional_context"),
          type: "user",
          text: "old",
          time: { created: DateTime.makeUnsafe(0) },
          promptContext: undefined,
        }),
      ),
    ).not.toHaveProperty("promptContext")
    const decode = Schema.decodeUnknownSync(RelayHook.Decided.data)
    const historical = {
      decisionID: "decision",
      installID: "install",
      version: "version",
      sha256: "a".repeat(64),
      nodeID: "node",
      action: "remind",
      trigger: "prompt.before",
      sessionID,
      subject: "prompt",
      outcome: "reminded",
      durationMs: 0,
    }
    expect(decode(historical)).not.toHaveProperty("messageID")
    expect(decode({ ...historical, messageID: "msg_prompt" }).messageID).toBe(SessionMessage.ID.make("msg_prompt"))
    expect(() => decode({ ...historical, messageID: "not-a-message" })).toThrow()
  }),
)
