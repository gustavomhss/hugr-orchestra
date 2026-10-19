import { expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { asc, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventSequenceTable, EventTable } from "@orchestra/core/event/sql"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionInput } from "@orchestra/core/session/input"
import { SessionMessage } from "@orchestra/core/session/message"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionInputTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionV1 } from "@orchestra/core/v1/session"
import { PromptContext } from "@orchestra/schema/prompt-context"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
    list: () => Effect.succeed([]),
    directories: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const execution = Layer.succeed(
  SessionExecution.Service,
  SessionExecution.Service.of({
    active: Effect.succeed(new Set()),
    resume: () => Effect.die("ADMIT_ONLY_RESUMED"),
    wake: () => Effect.die("ADMIT_ONLY_WOKE_EXECUTION"),
    interrupt: () => Effect.void,
  }),
)

function openDatabase<A, E>(
  filename: string,
  root: string,
  body: Effect.Effect<A, E, Database.Service | EventV2.Service | SessionV2.Service | SessionStore.Service>,
) {
  return body.pipe(
    Effect.provide(
      Layer.fresh(
        AppNodeBuilder.build(
          LayerNode.group([Database.node, EventV2.node, SessionProjector.node, SessionStore.node, SessionV2.node]),
          [
            [Database.node, Database.layerFromPath(filename)],
            [ProjectV2.node, projects],
            [SessionExecution.node, execution],
            [Global.node, Global.layerWith({ home: root, data: root, config: root, cache: root, state: root })],
          ],
        ),
      ),
    ),
    Effect.scoped,
  )
}

function persistedState(sessionID: SessionV2.ID) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    const session = yield* SessionV2.Service
    const store = yield* SessionStore.Service
    const inputs = yield* db.select().from(SessionInputTable)
      .orderBy(asc(SessionInputTable.admitted_seq)).all().pipe(Effect.orDie)
    return {
      session: yield* store.get(sessionID),
      inputs,
      admitted: yield* Effect.forEach(inputs, (input) => SessionInput.find(db, input.id)),
      events: yield* db.select().from(EventTable).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie),
      sequences: yield* db.select().from(EventSequenceTable).all().pipe(Effect.orDie),
      messages: yield* db.select().from(SessionMessageTable)
        .orderBy(asc(SessionMessageTable.seq)).all().pipe(Effect.orDie),
      transcript: yield* session.messages({ sessionID, order: "asc" }),
      context: yield* store.context(sessionID),
      history: yield* session.history({ sessionID, limit: 20 }),
    }
  })
}

it.live("retains current-source Session state in a committed WAL snapshot and across clean reopenings", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const source = path.join(tmp.path, "source.sqlite")
    const mainOnly = path.join(tmp.path, "main-only.sqlite")
    const restored = path.join(tmp.path, "wal-snapshot.sqlite")
    const location = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
    const sessionID = SessionV2.ID.make("ses_wal_persistence")
    const inputs = [
      {
        id: SessionMessage.ID.make("msg_wal_first"),
        prompt: Prompt.make({
          text: "First steer",
          files: [{ uri: "data:text/plain;base64,SGk=", mime: "text/plain", name: "input.txt" }],
          agents: [{ name: "backend", source: { start: 0, end: 7, text: "backend" } }],
        }),
        delivery: "steer" as const,
        promptContext: PromptContext.Info.make({ reminders: ["Preserve the first reminder.", "Then the second."] }),
      },
      {
        id: SessionMessage.ID.make("msg_wal_queue"),
        prompt: Prompt.make({ text: "Queued work" }),
        delivery: "queue" as const,
        promptContext: PromptContext.Info.make({ reminders: ["Keep this queued reminder pending."] }),
      },
      {
        id: SessionMessage.ID.make("msg_wal_second"),
        prompt: Prompt.make({ text: "Second steer", agents: [{ name: "backend" }] }),
        delivery: "steer" as const,
        promptContext: PromptContext.Info.make({ reminders: ["A distinct steer reminder."] }),
      },
    ] as const
    // This exercises the current source and schema, not a cross-version or packaged rollback.
    const seeded = yield* openDatabase(source, tmp.path, Effect.gen(function* () {
      const database = yield* Database.Service
      const db = database.db
      const session = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const store = yield* SessionStore.Service
      expect(yield* db.all<{ id: string }>(sql`SELECT id FROM migration`).pipe(Effect.orDie)).not.toHaveLength(0)
      expect(yield* db.get(sql`PRAGMA journal_mode`).pipe(Effect.orDie)).toEqual({ journal_mode: "wal" })
      yield* db.insert(ProjectTable)
        .values({ id: ProjectV2.ID.global, worktree: location.directory, sandboxes: [] })
        .run().pipe(Effect.orDie)
      yield* db.run("PRAGMA wal_autocheckpoint = 0").pipe(Effect.orDie)
      expect(yield* db.get(sql`PRAGMA wal_autocheckpoint`).pipe(Effect.orDie)).toEqual({ wal_autocheckpoint: 0 })
      expect(yield* db.get(sql`PRAGMA wal_checkpoint(TRUNCATE)`).pipe(Effect.orDie)).toEqual({
        busy: 0, log: 0, checkpointed: 0,
      })
      expect(yield* store.get(sessionID)).toBeUndefined()
      const created = yield* session.create({ id: sessionID, location })
      expect(created).toMatchObject({ id: sessionID, projectID: ProjectV2.ID.global, location })
      // promptContext is host-owned: seed through real admission; the public API supplies it only via hooks.
      yield* Effect.forEach(inputs, (input) => Effect.gen(function* () {
        const admitted = yield* SessionInput.admit(db, events, { sessionID, ...input })
        expect(yield* session.prompt({
          id: input.id, sessionID, prompt: input.prompt, delivery: input.delivery, resume: false,
        })).toEqual(admitted)
      }))
      expect(yield* store.context(sessionID)).toEqual([])
      expect(yield* SessionInput.promoteSteers(db, events, sessionID, Number.MAX_SAFE_INTEGER)).toBe(2)
      const state = yield* persistedState(sessionID)
      expect(state.session).toEqual(created)
      expect(state.admitted).toMatchObject(inputs.map((input, index) => ({
        ...input, sessionID, admittedSeq: index + 1, ...(index === 1 ? {} : { promotedSeq: index === 0 ? 4 : 5 }),
      })))
      expect(state.inputs.map((input) => [input.id, input.admitted_seq, input.promoted_seq])).toEqual([
        [inputs[0].id, 1, 4], [inputs[1].id, 2, null], [inputs[2].id, 3, 5],
      ])
      expect(state.admitted[1]).not.toHaveProperty("promotedSeq")
      expect(state.events.map((event) => [event.seq, event.type])).toEqual([
        [0, EventV2.versionedType(SessionV1.Event.Created.type, 1)],
        [1, EventV2.versionedType(SessionEvent.PromptAdmitted.type, 1)],
        [2, EventV2.versionedType(SessionEvent.PromptAdmitted.type, 1)],
        [3, EventV2.versionedType(SessionEvent.PromptAdmitted.type, 1)],
        [4, EventV2.versionedType(SessionEvent.Prompted.type, 1)],
        [5, EventV2.versionedType(SessionEvent.Prompted.type, 1)],
      ])
      expect(new Set(state.events.map((event) => event.id)).size).toBe(6)
      expect(state.events.slice(1).map((event) => event.data.messageID)).toEqual([
        inputs[0].id, inputs[1].id, inputs[2].id, inputs[0].id, inputs[2].id,
      ])
      expect(state.events.slice(1).map((event) => event.data)).toMatchObject(([0, 1, 2, 0, 2] as const).map((index) => ({
        messageID: inputs[index].id, prompt: inputs[index].prompt,
        promptContext: inputs[index].promptContext, delivery: inputs[index].delivery,
      })))
      expect(state.messages.map((message) => [message.id, message.seq])).toEqual([
        [inputs[0].id, 4], [inputs[2].id, 5],
      ])
      expect(state.transcript).toMatchObject(inputs.filter((input) => input.delivery === "steer").map((input) => ({
        id: input.id, type: "user", ...input.prompt, promptContext: input.promptContext,
      })))
      expect(state.context).toEqual(state.transcript)
      expect(state.history.hasMore).toBe(false)
      expect(state.history.events.map((event) => [event.id, event.durable?.seq])).toEqual(
        state.events.slice(1).map((event) => [event.id, event.seq]),
      )
      expect(state.sequences).toMatchObject([{ aggregate_id: sessionID, seq: 5 }])
      // All commits finished; this sole connection stays open and quiescent throughout the copies. No racing writer.
      expect((yield* Effect.promise(() => Bun.file(`${source}-wal`).arrayBuffer())).byteLength).toBeGreaterThan(32)
      yield* Effect.promise(async () => {
        await fs.copyFile(source, mainOnly)
        await fs.copyFile(source, restored)
        await fs.copyFile(`${source}-wal`, `${restored}-wal`)
      })
      expect(yield* Effect.promise(() => Bun.file(`${restored}-shm`).exists())).toBe(false)
      expect(yield* Effect.promise(() => Bun.file(`${mainOnly}-wal`).exists())).toBe(false)
      return state
    }))
    // Closing each fresh layer must release SQLite before another connection opens the same filename.
    expect(yield* Effect.promise(() => Bun.file(`${source}-wal`).exists())).toBe(false)
    yield* openDatabase(mainOnly, tmp.path, Effect.gen(function* () {
      const database = yield* Database.Service
      const store = yield* SessionStore.Service
      const session = yield* SessionV2.Service
      expect(yield* store.get(sessionID)).toBeUndefined()
      expect(yield* session.list()).toEqual([])
      expect(yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual([])
      expect(yield* database.db.select().from(EventTable).all().pipe(Effect.orDie)).toEqual([])
      expect(yield* database.db.select().from(ProjectTable).all().pipe(Effect.orDie)).toMatchObject([
        { id: ProjectV2.ID.global },
      ])
    }))
    yield* Effect.forEach([source, restored], (filename, index) => Effect.gen(function* () {
      const newID = SessionMessage.ID.make(`msg_wal_new_${index}`)
      const newPrompt = Prompt.make({ text: `New admission ${index}` })
      const extended = yield* openDatabase(filename, tmp.path, Effect.gen(function* () {
        const session = yield* SessionV2.Service
        expect(yield* persistedState(sessionID)).toEqual(seeded)
        expect(seeded.session).toEqual(yield* session.create({ id: sessionID, location }))
        yield* Effect.forEach(inputs, (input, position) => Effect.gen(function* () {
          const retry = { id: input.id, sessionID, prompt: input.prompt, delivery: input.delivery, resume: false }
          expect(seeded.admitted[position]).toEqual(yield* session.prompt(retry))
          expect(yield* session.prompt({
            ...retry, delivery: input.delivery === "steer" ? "queue" : "steer",
          }).pipe(Effect.flip)).toMatchObject({
            _tag: "Session.PromptConflictError", sessionID, messageID: input.id,
          })
          expect(yield* session.prompt({
            ...retry, prompt: Prompt.make({ text: "Conflicting replacement" }),
          }).pipe(Effect.flip)).toMatchObject({
            _tag: "Session.PromptConflictError", sessionID, messageID: input.id,
          })
        }))
        expect(yield* persistedState(sessionID)).toEqual(seeded)
        expect(yield* session.prompt({ id: newID, sessionID, prompt: newPrompt, resume: false })).toMatchObject({
          id: newID, sessionID, prompt: newPrompt, delivery: "steer", admittedSeq: 6,
        })
        const state = yield* persistedState(sessionID)
        expect(state.events.slice(0, 6)).toEqual(seeded.events)
        expect(state.events.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4, 5, 6])
        expect(state.events[6]).toMatchObject({
          type: EventV2.versionedType(SessionEvent.PromptAdmitted.type, 1),
          data: { messageID: newID, prompt: newPrompt, delivery: "steer" },
        })
        expect(new Set(state.events.map((event) => event.id)).size).toBe(7)
        expect(state.inputs).toHaveLength(4)
        expect(state.inputs.slice(0, 3)).toEqual(seeded.inputs)
        expect(state.admitted.slice(0, 3)).toEqual(seeded.admitted)
        expect(state.inputs[3]).toMatchObject({ id: newID, admitted_seq: 6, promoted_seq: null })
        expect(state.admitted[3]).not.toHaveProperty("promotedSeq")
        expect(state.messages).toEqual(seeded.messages)
        expect(state.transcript).toEqual(seeded.transcript)
        expect(state.context).toEqual(seeded.context)
        expect(state.sequences).toMatchObject([{ aggregate_id: sessionID, seq: 6 }])
        expect(state.history.events.map((event) => event.id)).toEqual(state.events.slice(1).map((event) => event.id))
        return state
      }))
      expect(yield* Effect.promise(() => Bun.file(`${filename}-wal`).exists())).toBe(false)
      yield* openDatabase(filename, tmp.path, Effect.gen(function* () {
        const session = yield* SessionV2.Service
        expect(yield* persistedState(sessionID)).toEqual(extended)
        expect(extended.admitted[3]).toEqual(
          yield* session.prompt({ id: newID, sessionID, prompt: newPrompt, resume: false }),
        )
        expect(yield* persistedState(sessionID)).toEqual(extended)
      }))
      expect(yield* Effect.promise(() => Bun.file(`${filename}-wal`).exists())).toBe(false)
    }), { concurrency: 1 })
  }),
)
