import { expect } from "bun:test"
import { and, asc, eq } from "drizzle-orm"
import { DateTime, Effect, Exit, Layer, Option, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionExecution } from "@orchestra/core/session/execution"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRevert } from "../src/session/revert"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionContextEpochTable, SessionInputTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext } from "@orchestra/core/system-context"
import { SystemContextRegistry } from "@orchestra/core/system-context/registry"
import { LLMClient } from "@orchestra/llm"
import { OpenAICompatibleChat } from "@orchestra/llm/protocols"
import { Auth, RequestExecutor } from "@orchestra/llm/route"
import { Harness } from "./session-runner-harness"

const state = { value: "CTX-A", other: "AUX-X", unavailable: false, url: "", requests: [] as unknown[] }
const it = Harness.make({
  client: LLMClient.layer.pipe(Layer.provide(RequestExecutor.fetchLayer)),
  models: SessionRunnerModel.layerWith(() => Effect.succeed(
    OpenAICompatibleChat.route.with({
      provider: "epoch-fixture", auth: Auth.none, endpoint: { baseURL: state.url },
      limits: { context: 100_000, output: 1000 },
    }).model({ id: "epoch-fixture" }),
  )),
  echo: Layer.empty,
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.succeed(SkillGuidance.Service, SkillGuidance.Service.of({ load: () => Effect.succeed(SystemContext.empty) })),
})

const setup = Effect.gen(function* () {
  yield* Harness.setup
  state.value = "CTX-A"
  state.other = "AUX-X"
  state.unavailable = false
  state.requests.length = 0
  const server = yield* Effect.acquireRelease(
    Effect.sync(() => Bun.serve({ port: 0, async fetch(request) {
      state.requests.push(await request.json())
      return new Response('data: {"id":"epoch","choices":[{"index":0,"delta":{"content":"FIXTURE-REPLY"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        { headers: { "Content-Type": "text/event-stream" } })
    } })),
    (server) => Effect.promise(() => server.stop(true)),
  )
  state.url = server.url.origin + "/v1"
  const registry = yield* SystemContextRegistry.Service
  yield* registry.register({
    key: SystemContext.Key.make("test/revert-context"),
    load: Effect.succeed(SystemContext.combine([
      SystemContext.make({
        key: SystemContext.Key.make("test/revert-main"), codec: Schema.toCodecJson(Schema.String),
        load: Effect.sync(() => state.unavailable ? SystemContext.unavailable : state.value),
        baseline: String, update: (_previous, current) => current,
      }),
      SystemContext.make({
        key: SystemContext.Key.make("test/revert-other"), codec: Schema.toCodecJson(Schema.String),
        load: Effect.sync(() => state.other), baseline: String, update: (_previous, current) => current,
      }),
    ])),
  })
})

const turn = (text: string) => Effect.gen(function* () {
  const session = yield* SessionV2.Service
  const admitted = yield* session.prompt({ sessionID: Harness.sessionID, prompt: Prompt.make({ text }), resume: false })
  yield* session.resume(Harness.sessionID)
  return admitted.id
})

const epoch = Effect.gen(function* () {
  const database = yield* Database.Service
  const row = yield* database.db.select().from(SessionContextEpochTable)
    .where(eq(SessionContextEpochTable.session_id, Harness.sessionID)).get().pipe(Effect.orDie)
  if (!row) throw new Error("Expected an initialized epoch")
  return row
})

// Harness uses a nonexistent /project. Stage through the real owned leaf with its provided Snapshot.noopLayer;
// the public commit under test remains SessionV2, without constructing a second filesystem Location graph.
const stage = (messageID: SessionMessage.ID) => Effect.gen(function* () {
  const session = yield* SessionV2.Service
  const execution = yield* SessionExecution.Service
  const snapshot = yield* Snapshot.Service
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const owned = yield* execution.exclusive(Harness.sessionID, Effect.gen(function* () {
    const current = yield* session.get(Harness.sessionID)
    return yield* SessionRevert.stage({ session: current, messageID, files: false }).pipe(
      Effect.provideService(Snapshot.Service, snapshot),
      Effect.provideService(Database.Service, database),
      Effect.provideService(EventV2.Service, events),
    )
  }))
  expect(Option.isSome(owned)).toBe(true)
})

const revert = (messageID: SessionMessage.ID) => Effect.gen(function* () {
  const session = yield* SessionV2.Service
  yield* stage(messageID)
  yield* session.revert.commit(Harness.sessionID)
})

const latestRequest = () => {
  expect(state.requests.length).toBeGreaterThan(0)
  return JSON.stringify(state.requests.at(-1))
}

it.live("CONTROL L3: real provider receives the initialized context before any revert", () =>
  Effect.gen(function* () {
    yield* setup
    yield* turn("fixture positive control")
    expect(state.requests).toHaveLength(1)
    expect(latestRequest()).toContain("CTX-A")
    expect(latestRequest()).toContain("AUX-X")
    expect((yield* epoch).snapshot["test/revert-main"].value).toBe("CTX-A")
  }), 10000)

it.live("CONTROL L3: revert without a context delta retains the source snapshot and user boundary", () =>
  Effect.gen(function* () {
    yield* setup
    const boundary = yield* turn("retained user without delta")
    const stored = yield* epoch
    yield* turn("removed user without delta")
    yield* revert(boundary)
    yield* turn("after no delta revert")
    expect(latestRequest().match(/CTX-A/g)).toHaveLength(1)
    expect(latestRequest()).toContain("retained user without delta")
    expect(latestRequest()).not.toContain("removed user without delta")
    expect((yield* epoch).snapshot).toEqual(stored.snapshot)
  }), 10000)

for (const legacy of [false, true]) {
  for (const unavailable of [false, true]) {
    it.live(`${legacy ? "legacy persisted" : "current"} revert retains admitted context with source ${unavailable ? "unavailable" : "unchanged"}`, () =>
      Effect.gen(function* () {
        yield* setup
        const boundary = yield* turn("first user")
        state.value = "CTX-B"
        yield* turn("removed user")
        expect(latestRequest()).toContain("CTX-B")
        const before = yield* epoch
        yield* revert(boundary)
        const database = yield* Database.Service
        if (legacy) {
          // Construct the old on-disk effect while preserving its real durable event facts.
          yield* database.db.update(SessionContextEpochTable).set({
            baseline: before.baseline, snapshot: before.snapshot, baseline_seq: before.baseline_seq,
          }).where(eq(SessionContextEpochTable.session_id, Harness.sessionID)).run().pipe(Effect.orDie)
        }
        const session = yield* SessionV2.Service
        expect((yield* session.messages({ sessionID: Harness.sessionID })).some((message) =>
          message.type === "system" && message.text.includes("CTX-B"))).toBe(false)
        state.unavailable = unavailable
        yield* turn("after revert")
        expect(latestRequest()).toContain("CTX-B")
        expect(latestRequest().match(/CTX-B/g)).toHaveLength(1)
        expect(latestRequest()).not.toContain("removed user")
        expect((yield* epoch).snapshot).toEqual(before.snapshot)
        const events = yield* database.db.select().from(EventTable)
          .where(eq(EventTable.aggregate_id, Harness.sessionID)).all().pipe(Effect.orDie)
        expect(events.filter((event) => event.type === "session.next.context.updated.1")).toHaveLength(1)
        expect(events.filter((event) => event.type === "session.next.revert.committed.1")).toHaveLength(1)
        state.unavailable = false
        state.value = "CTX-C"
        yield* turn("later source")
        expect(latestRequest()).toContain("CTX-B")
        expect(latestRequest()).toContain("CTX-C")
        expect(latestRequest().match(/CTX-B/g)).toHaveLength(1)
      }), 10000)
  }
}

for (const unavailable of [false, true]) {
  it.live(`legacy repair stops at the committed boundary and retains a later delta with source ${unavailable ? "unavailable" : "unchanged"}`, () =>
    Effect.gen(function* () {
      yield* setup
      const boundary = yield* turn("first user")
      state.value = "CTX-B"
      yield* turn("removed user")
      const original = yield* epoch
      yield* revert(boundary)
      state.value = "CTX-C"
      yield* turn("retained later user")
      const current = yield* epoch
      const database = yield* Database.Service
      const committed = yield* database.db.select().from(EventTable).where(and(
        eq(EventTable.aggregate_id, Harness.sessionID), eq(EventTable.type, "session.next.revert.committed.1"),
      )).get().pipe(Effect.orDie)
      if (!committed) throw new Error("Expected durable commit boundary")
      // Preserve real B -> commit -> C events, C projection and snapshot; restore only the legacy comparison cursor.
      yield* database.db.update(SessionContextEpochTable).set({
        baseline: original.baseline, baseline_seq: original.baseline_seq, snapshot: current.snapshot,
      }).where(eq(SessionContextEpochTable.session_id, Harness.sessionID)).run().pipe(Effect.orDie)
      state.unavailable = unavailable
      const session = yield* SessionV2.Service
      for (const pass of [1, 2]) {
        yield* turn(`repair preparation ${pass}`)
        const repaired = yield* epoch
        expect(repaired.baseline).toContain("CTX-B")
        expect(repaired.baseline).not.toContain("CTX-C")
        expect(repaired.baseline_seq).toBe(committed.seq)
        expect(repaired.snapshot).toEqual(current.snapshot)
        expect((yield* session.messages({ sessionID: Harness.sessionID })).filter((message) =>
          message.type === "system" && message.text === "CTX-C")).toHaveLength(1)
        expect(latestRequest().match(/CTX-B/g)).toHaveLength(1)
        expect(latestRequest().match(/CTX-C/g)).toHaveLength(1)
      }
    }), 10000)
}

it.live("malformed durable context cannot advance the epoch or erase projections during revert", () =>
  Effect.gen(function* () {
    yield* setup
    const boundary = yield* turn("retained user")
    state.value = "CTX-B"
    yield* turn("removed user")
    yield* stage(boundary)
    const stored = yield* epoch
    const database = yield* Database.Service
    const updated = yield* database.db.select().from(EventTable).where(and(
      eq(EventTable.aggregate_id, Harness.sessionID), eq(EventTable.type, "session.next.context.updated.1"),
    )).get().pipe(Effect.orDie)
    if (!updated) throw new Error("Expected a durable context update")
    yield* database.db.update(EventTable).set({ data: {
      sessionID: Harness.sessionID, messageID: SessionMessage.ID.create(), timestamp: 0, text: 47,
    } }).where(eq(EventTable.id, updated.id)).run().pipe(Effect.orDie)
    const session = yield* SessionV2.Service
    const messages = yield* session.messages({ sessionID: Harness.sessionID })
    expect(Exit.isFailure(yield* session.revert.commit(Harness.sessionID).pipe(Effect.exit))).toBe(true)
    expect(yield* epoch).toEqual(stored)
    expect(yield* session.messages({ sessionID: Harness.sessionID })).toEqual(messages)
    expect((yield* session.get(Harness.sessionID)).revert?.messageID).toBe(boundary)
  }), 10000)

it.live("folds retained and removed source deltas once while retaining earlier user and assistant messages", () =>
  Effect.gen(function* () {
    yield* setup
    yield* turn("retained first user")
    state.value = "CTX-B"
    yield* turn("retained second user")
    state.other = "AUX-Y"
    const boundary = yield* turn("retained boundary user")
    state.value = "CTX-C"
    yield* turn("removed branch user")
    yield* revert(boundary)
    yield* turn("after multi source revert")
    expect(latestRequest()).toContain("retained first user")
    expect(latestRequest()).toContain("retained second user")
    expect(latestRequest()).toContain("FIXTURE-REPLY")
    expect(latestRequest()).not.toContain("removed branch user")
    for (const text of ["CTX-B", "CTX-C", "AUX-Y"]) expect(latestRequest().split(text)).toHaveLength(2)
  }), 10000)

for (const boundaryAfterCompaction of [false, true]) {
  it.live(`revert ${boundaryAfterCompaction ? "after" : "before"} a replaced compaction baseline preserves its admitted context`, () =>
    Effect.gen(function* () {
      yield* setup
      const first = yield* turn("first before compaction")
      state.value = "CTX-B"
      yield* turn("second before compaction")
      const events = yield* EventV2.Service
      const messageID = SessionMessage.ID.create()
      yield* events.publish(SessionEvent.Compaction.Started, {
        sessionID: Harness.sessionID, messageID, timestamp: DateTime.makeUnsafe(1), reason: "manual",
      })
      yield* events.publish(SessionEvent.Compaction.Ended, {
        sessionID: Harness.sessionID, messageID, timestamp: DateTime.makeUnsafe(2), reason: "manual", text: "summary", recent: "",
      })
      const after = yield* turn("user after compaction")
      expect((yield* epoch).baseline).toContain("CTX-B")
      yield* revert(boundaryAfterCompaction ? after : first)
      yield* turn("after compacted revert")
      expect(latestRequest().match(/CTX-B/g)).toHaveLength(1)
    }), 10000)
}

it.live("replaying committed events twice with a retained epoch cannot duplicate folded context", () =>
  Effect.gen(function* () {
    yield* setup
    const boundary = yield* turn("retained user")
    state.value = "CTX-B"
    yield* turn("deleted user")
    yield* revert(boundary)
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const recorded = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, Harness.sessionID))
      .orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
    const stored = yield* epoch
    for (const pass of [1, 2]) {
      yield* events.remove(Harness.sessionID)
      yield* database.db.delete(SessionInputTable).where(eq(SessionInputTable.session_id, Harness.sessionID)).run().pipe(Effect.orDie)
      yield* database.db.delete(SessionMessageTable).where(eq(SessionMessageTable.session_id, Harness.sessionID)).run().pipe(Effect.orDie)
      yield* events.replayAll(recorded.map((event) => ({
        id: event.id, aggregateID: event.aggregate_id, seq: event.seq, type: event.type, data: event.data,
      })))
      expect(yield* epoch, `replay ${pass}`).toEqual(stored)
    }
    yield* turn("after replay")
    expect(latestRequest().match(/CTX-B/g)).toHaveLength(1)
  }), 10000)

it.live("a failed projection delete rolls back the epoch update and the committed event", () =>
  Effect.gen(function* () {
    yield* setup
    const boundary = yield* turn("retained user")
    state.value = "CTX-B"
    yield* turn("deleted user")
    const session = yield* SessionV2.Service
    yield* stage(boundary)
    const stored = yield* epoch
    const database = yield* Database.Service
    const messages = yield* session.messages({ sessionID: Harness.sessionID })
    const eventRows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, Harness.sessionID)).all().pipe(Effect.orDie)
    yield* database.db.run("CREATE TRIGGER epoch_revert_abort BEFORE DELETE ON session_message BEGIN SELECT RAISE(ABORT, 'controlled delete failure'); END").pipe(Effect.orDie)
    const result = yield* session.revert.commit(Harness.sessionID).pipe(Effect.exit,
      Effect.ensuring(database.db.run("DROP TRIGGER epoch_revert_abort").pipe(Effect.orDie)))
    expect(Exit.isFailure(result)).toBe(true)
    expect(yield* epoch).toEqual(stored)
    expect(yield* session.messages({ sessionID: Harness.sessionID })).toEqual(messages)
    expect(yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, Harness.sessionID)).all().pipe(Effect.orDie)).toEqual(eventRows)
  }), 10000)

it.live("revert with no epoch does not invent one or execute a provider", () =>
  Effect.gen(function* () {
    yield* setup
    const events = yield* EventV2.Service
    const messageID = SessionMessage.ID.create()
    yield* events.publish(SessionEvent.Prompted, {
      sessionID: Harness.sessionID, messageID, timestamp: DateTime.makeUnsafe(1), prompt: Prompt.make({ text: "historical user" }), delivery: "steer",
    })
    yield* revert(messageID)
    const database = yield* Database.Service
    expect(yield* database.db.select().from(SessionContextEpochTable).where(eq(SessionContextEpochTable.session_id, Harness.sessionID)).get().pipe(Effect.orDie)).toBeUndefined()
    expect(state.requests).toEqual([])
  }))
