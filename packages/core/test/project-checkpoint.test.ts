import { describe, expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@orchestra/core/database/database"
import checkpointMigration from "@orchestra/core/database/migration/20261010135215_project_checkpoints"
import { ProjectCheckpoint } from "@orchestra/core/project/checkpoint"
import { ProjectCheckpointTable } from "@orchestra/core/project/checkpoint.sql"
import { ProjectSchema } from "@orchestra/core/project/schema"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const projectID = ProjectSchema.ID.make("checkpoint-project")
const otherProject = ProjectSchema.ID.make("checkpoint-other")
const globalProject = ProjectSchema.ID.make("global")
const sessionID = SessionSchema.ID.make("ses_checkpoint")
const otherSession = SessionSchema.ID.make("ses_checkpoint_other")
const globalA = SessionSchema.ID.make("ses_checkpoint_global_a")
const globalB = SessionSchema.ID.make("ses_checkpoint_global_b")
const directory = AbsolutePath.make("/tmp/checkpoint-a")
const otherDirectory = AbsolutePath.make("/tmp/checkpoint-b")
const input: ProjectCheckpoint.SaveInput = {
  sessionID,
  forkID: "fork",
  boundary: "boundary",
  attempt: 0,
  payload: "{}",
}

const temporary = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
)
const isolated = Layer.unwrap(
  Effect.gen(function* () {
    const tmp = yield* temporary
    return Database.layerFromPath(path.join(tmp.path, "checkpoints.sqlite"))
  }),
)
const it = testEffect(ProjectCheckpoint.layer.pipe(Layer.provideMerge(isolated)))

const seed = Effect.gen(function* () {
  const database = yield* Database.Service
  yield* database.db
    .insert(ProjectTable)
    .values(
      [projectID, otherProject, globalProject].map((id) => ({
        id,
        worktree: directory,
        sandboxes: [],
      })),
    )
    .run()
  yield* database.db
    .insert(SessionTable)
    .values(
      [
        { id: sessionID, project_id: projectID, directory },
        { id: otherSession, project_id: otherProject, directory: otherDirectory },
        { id: globalA, project_id: globalProject, directory },
        { id: globalB, project_id: globalProject, directory: otherDirectory },
      ].map((value) => ({ ...value, slug: value.id, title: "Checkpoint fixture", version: "1" })),
    )
    .run()
})

describe("ProjectCheckpoint", () => {
  it.live("preserves exact JSON bytes, binary encoding, Unicode and source ownership", () =>
    Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      const payload = ' \n{ "text": "雪😀é", "binary": {"base64":"AAH+/w=="}, "nul":"\\u0000" }\t'
      const saved = yield* store.save({ ...input, payload })
      expect(saved).toEqual({
        id: "fork:0",
        projectID,
        sessionID,
        forkID: "fork",
        boundary: "boundary",
        attempt: 0,
        directory,
        createdAt: expect.any(Number),
        digest: createHash("sha256").update(payload, "utf8").digest("hex"),
      })
      expect(yield* store.read({ projectID, id: saved.id })).toEqual({ ...saved, payload })
      expect(yield* store.read({ projectID: otherProject, id: saved.id })).toBeUndefined()
      expect(yield* store.list({ projectID: otherProject })).toEqual({ items: [] })
      expect(yield* store.read({ projectID, id: "missing" })).toBeUndefined()
      const foreign = yield* store.save({ ...input, sessionID: otherSession, forkID: "other" })
      expect(foreign).toMatchObject({ projectID: otherProject, directory: otherDirectory })
    }),
  )

  it.live("serializes concurrent identical saves and retains immutable attempts", () =>
    Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      const database = yield* Database.Service
      yield* database.db.run(`CREATE TRIGGER checkpoint_immutable BEFORE UPDATE ON project_checkpoint
        BEGIN SELECT RAISE(ABORT, 'immutable checkpoint'); END`)
      const copies = yield* Effect.all(
        Array.from({ length: 16 }, () => store.save(input)),
        { concurrency: "unbounded" },
      )
      expect(copies).toEqual(Array.from({ length: 16 }, () => copies[0]))
      const second = yield* store.save({ ...input, attempt: 1, payload: '{"correction":true}' })
      expect(second.id).toBe("fork:1")
      expect((yield* store.list({ projectID })).items.map((item) => item.id).sort()).toEqual(["fork:0", "fork:1"])
      expect(yield* store.read({ projectID, id: copies[0].id })).toEqual({ ...copies[0], payload: input.payload })
    }),
  )

  it.live("rejects conflicting reuse without rewriting payload or metadata", () =>
    Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      const saved = yield* store.save(input)
      yield* Effect.forEach(
        [
          { ...input, payload: "{ }" },
          { ...input, boundary: "other" },
          { ...input, sessionID: otherSession },
        ],
        (conflict) =>
          Effect.gen(function* () {
            expect(yield* store.save(conflict).pipe(Effect.flip)).toMatchObject({ reason: "conflict" })
            expect(yield* store.read({ projectID, id: saved.id })).toEqual({ ...saved, payload: input.payload })
          }),
      )
      const database = yield* Database.Service
      yield* database.db
        .update(ProjectCheckpointTable)
        .set({ attempt: 1 })
        .where(eq(ProjectCheckpointTable.id, saved.id))
        .run()
      expect(yield* store.save(input).pipe(Effect.flip)).toMatchObject({ reason: "conflict" })
    }),
  )

  it.live("settles racing conflicts with one winner and keeps concurrent Sessions", () =>
    Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      const outcomes = yield* Effect.all(
        ["{}", "[]"].map((payload) =>
          store.save({ ...input, payload }).pipe(
            Effect.map((metadata) => ({ status: "saved", payload, metadata })),
            Effect.catch((error) => Effect.succeed({ status: error.reason, payload, metadata: undefined })),
          ),
        ),
        { concurrency: "unbounded" },
      )
      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["conflict", "saved"])
      const saved = yield* store.read({ projectID, id: "fork:0" })
      if (!saved) throw new Error("Expected the winning checkpoint")
      const winner = outcomes.find((outcome) => outcome.status === "saved")
      if (!winner?.metadata) throw new Error("Missing successful write receipt")
      expect(saved).toEqual({ ...winner.metadata, payload: winner.payload })
      const checkpoints = yield* Effect.all(
        [globalA, globalB].map((id) => store.save({ ...input, sessionID: id, forkID: id })),
        { concurrency: "unbounded" },
      )
      expect((yield* store.list({ projectID: globalProject })).items.map((item) => item.id).sort()).toEqual(
        checkpoints.map((item) => item.id).sort(),
      )
    }),
  )

  it.live("filters unrelated global directories including legacy empty directory", () =>
    Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      const database = yield* Database.Service
      const first = yield* store.save({ ...input, sessionID: globalA, forkID: "a" })
      const second = yield* store.save({ ...input, sessionID: globalB, forkID: "b" })
      expect(yield* store.list({ projectID: globalProject, directory })).toEqual({ items: [first] })
      expect(yield* store.list({ projectID: globalProject, directory: otherDirectory })).toEqual({ items: [second] })
      expect(yield* store.list({ projectID: globalProject, directory: "" })).toEqual({ items: [] })
      yield* database.db.update(SessionTable).set({ directory: "" }).where(eq(SessionTable.id, globalA)).run()
      const legacy = yield* store.save({ ...input, sessionID: globalA, forkID: "legacy" })
      expect(yield* store.list({ projectID: globalProject, directory: "" })).toEqual({ items: [legacy] })
      expect((yield* store.list({ projectID: globalProject })).items).toHaveLength(3)
    }),
  )

  it.live("outlives Session deletion, rejects missing source and cascades project deletion", () =>
    Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      const database = yield* Database.Service
      const saved = yield* store.save(input)
      yield* database.db.delete(SessionTable).where(eq(SessionTable.id, sessionID)).run()
      expect(yield* store.read({ projectID, id: saved.id })).toEqual({ ...saved, payload: input.payload })
      expect(yield* store.list({ projectID })).toEqual({ items: [saved] })
      expect(yield* store.save(input)).toEqual(saved)
      expect(yield* store.save({ ...input, payload: "[]" }).pipe(Effect.flip)).toMatchObject({ reason: "conflict" })
      expect(yield* store.save({ ...input, forkID: "missing" }).pipe(Effect.flip)).toMatchObject({
        reason: "missing_session",
      })
      yield* database.db.delete(ProjectTable).where(eq(ProjectTable.id, projectID)).run()
      expect(yield* store.list({ projectID })).toEqual({ items: [] })
    }),
  )

  it.live("detects payload and digest corruption without leaking context", () =>
    Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      const database = yield* Database.Service
      const saved = yield* store.save(input)
      yield* database.db.update(ProjectCheckpointTable).set({ payload: '"private-corruption"' }).run()
      const error = yield* store.read({ projectID, id: saved.id }).pipe(Effect.flip)
      expect(error).toMatchObject({ _tag: "ProjectCheckpoint.CheckpointError", reason: "corrupt" })
      expect(JSON.stringify(error)).not.toContain("private-corruption")
      expect(error.message).toBe("Project checkpoint failed: corrupt")
      expect(yield* store.read({ projectID: otherProject, id: saved.id })).toBeUndefined()
      expect(yield* store.list({ projectID })).toEqual({ items: [saved] })
      yield* database.db.update(ProjectCheckpointTable).set({ payload: input.payload, digest: "wrong" }).run()
      expect(yield* store.read({ projectID, id: saved.id }).pipe(Effect.flip)).toMatchObject({ reason: "corrupt" })
      expect(yield* store.save(input).pipe(Effect.flip)).toMatchObject({ reason: "corrupt" })
    }),
  )

  it.live("lists metadata without evaluating the payload column", () =>
    Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      const database = yield* Database.Service
      const saved = yield* store.save(input)
      yield* database.db.run("ALTER TABLE project_checkpoint RENAME TO checkpoint_data")
      // This real SQLite expression fails only when the payload column is selected.
      yield* database.db.run(`CREATE VIEW project_checkpoint AS SELECT id, project_id, session_id, fork_id,
      boundary, attempt, directory, time_created, digest, json('broken') AS payload FROM checkpoint_data`)
      expect(yield* store.read({ projectID, id: saved.id }).pipe(Effect.flip)).toMatchObject({ reason: "storage" })
      expect(yield* store.list({ projectID })).toEqual({ items: [saved] })
    }),
  )

  it.live("reports broken storage instead of treating errors as missing", () =>
    Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      const database = yield* Database.Service
      yield* store.save(input)
      yield* database.db.run("DROP TABLE project_checkpoint")
      yield* Effect.forEach(
        [
          store.read({ projectID, id: "fork:0" }).pipe(Effect.asVoid),
          store.list({ projectID }).pipe(Effect.asVoid),
          store.save({ ...input, payload: '"private-storage-input"' }).pipe(Effect.asVoid),
        ],
        (operation) =>
          Effect.gen(function* () {
            const error = yield* operation.pipe(Effect.flip)
            expect(error).toMatchObject({ _tag: "ProjectCheckpoint.CheckpointError", reason: "storage" })
            expect(JSON.stringify(error)).not.toContain("private-storage-input")
          }),
      )
    }),
  )

  it.live("uses descending time then ID with bounded offset pagination", () =>
    Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      const database = yield* Database.Service
      const saved = yield* Effect.forEach(
        Array.from({ length: 53 }, (_, i) => i),
        (i) => store.save({ ...input, forkID: `page-${String(i).padStart(2, "0")}` }),
      )
      yield* database.db.update(ProjectCheckpointTable).set({ time_created: 1 }).run()
      yield* database.db
        .update(ProjectCheckpointTable)
        .set({ time_created: 2 })
        .where(eq(ProjectCheckpointTable.id, saved[0].id))
        .run()
      const ordered = [
        saved[0].id,
        ...saved
          .slice(1)
          .map((item) => item.id)
          .reverse(),
      ]
      const first = yield* store.list({ projectID })
      expect(first.items.map((item) => item.id)).toEqual(ordered.slice(0, 20))
      expect(first.nextOffset).toBe(20)
      const second = yield* store.list({ projectID, offset: first.nextOffset })
      expect(second.items.map((item) => item.id)).toEqual(ordered.slice(20, 40))
      expect(second.nextOffset).toBe(40)
      const third = yield* store.list({ projectID, offset: second.nextOffset })
      expect(third.items.map((item) => item.id)).toEqual(ordered.slice(40))
      expect(third.nextOffset).toBeUndefined()
      const maximum = yield* store.list({ projectID, limit: 50 })
      expect(maximum.items).toHaveLength(50)
      expect(maximum.nextOffset).toBe(50)
      expect(yield* store.list({ projectID, offset: 53 })).toEqual({ items: [] })
      expect((yield* store.list({ projectID, offset: 3, limit: 50 })).nextOffset).toBeUndefined()
    }),
  )

  it.live("rejects invalid pagination, attempts and payloads before writing", () =>
    Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      yield* Effect.forEach([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1], (offset) =>
        Effect.gen(function* () {
          expect(yield* store.list({ projectID, offset }).pipe(Effect.flip)).toMatchObject({ reason: "invalid_input" })
        }),
      )
      yield* Effect.forEach([0, -1, 0.5, 51, NaN, Infinity], (limit) =>
        Effect.gen(function* () {
          expect(yield* store.list({ projectID, limit }).pipe(Effect.flip)).toMatchObject({ reason: "invalid_input" })
        }),
      )
      const invoke = (value: unknown) => Reflect.apply(store.save, undefined, [value]) as ReturnType<typeof store.save>
      yield* Effect.forEach([-1, 2, 0.5, NaN, Infinity, "0", null], (attempt) =>
        Effect.gen(function* () {
          expect(yield* invoke({ ...input, attempt }).pipe(Effect.flip)).toMatchObject({ reason: "invalid_input" })
        }),
      )
      yield* Effect.forEach(["", " \n\t", "broken-json", "{", '"\ud800"'], (payload) =>
        Effect.gen(function* () {
          expect(yield* store.save({ ...input, payload }).pipe(Effect.flip)).toMatchObject({ reason: "invalid_input" })
        }),
      )
      yield* Effect.forEach(
        [
          { ...input, forkID: " " },
          { ...input, boundary: "" },
        ],
        (invalid) =>
          Effect.gen(function* () {
            expect(yield* store.save(invalid).pipe(Effect.flip)).toMatchObject({ reason: "invalid_input" })
          }),
      )
      expect(yield* store.list({ projectID })).toEqual({ items: [] })
      expect((yield* store.save({ ...input, payload: "null" })).id).toBe("fork:0")
    }),
  )
})

testEffect(Layer.empty).live("ProjectCheckpoint reloads exact payload after closing SQLite", () =>
  Effect.gen(function* () {
    const tmp = yield* temporary
    const build = () =>
      ProjectCheckpoint.layer.pipe(Layer.provideMerge(Database.layerFromPath(path.join(tmp.path, "reload.sqlite"))))
    const saved = yield* Effect.gen(function* () {
      yield* seed
      const store = yield* ProjectCheckpoint.Service
      return yield* store.save(input)
    }).pipe(Effect.provide(build()), Effect.scoped)
    yield* Effect.gen(function* () {
      const store = yield* ProjectCheckpoint.Service
      expect(yield* store.read({ projectID, id: saved.id })).toEqual({ ...saved, payload: input.payload })
      expect(yield* store.save(input)).toEqual(saved)
      expect(yield* store.list({ projectID })).toEqual({ items: [saved] })
    }).pipe(Effect.provide(build()), Effect.scoped)
  }),
)

testEffect(Layer.empty).live("upgrades an existing Session database without rewriting its rows", () => Effect.gen(function* () {
  const tmp = yield* temporary
  const build = () => ProjectCheckpoint.layer.pipe(Layer.provideMerge(Database.layerFromPath(path.join(tmp.path, "upgrade.sqlite"))))
  const before = yield* Effect.gen(function* () {
    yield* seed
    const database = yield* Database.Service
    // Model the immediately preceding installed schema, not a fresh database bootstrap.
    yield* database.db.run("DROP TABLE project_checkpoint")
    yield* database.db.run(`DELETE FROM migration WHERE id = '${checkpointMigration.id}'`)
    const missing = yield* database.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE name = 'project_checkpoint'")
    expect(missing).toEqual([])
    return yield* database.db.select().from(SessionTable).orderBy(SessionTable.id).all()
  }).pipe(Effect.provide(build()), Effect.scoped)
  expect(before.some((row) => row.id === sessionID)).toBe(true)
  yield* Effect.gen(function* () {
    const database = yield* Database.Service
    const store = yield* ProjectCheckpoint.Service
    expect(yield* database.db.select().from(SessionTable).orderBy(SessionTable.id).all()).toEqual(before)
    expect((yield* database.db.all<{ name: string }>("PRAGMA index_list('project_checkpoint')")).map((row) => row.name))
      .toContain("project_checkpoint_project_time_id_idx")
    const saved = yield* store.save(input)
    expect(yield* store.read({ projectID, id: saved.id })).toEqual({ ...saved, payload: input.payload })
  }).pipe(Effect.provide(build()), Effect.scoped)
}))
