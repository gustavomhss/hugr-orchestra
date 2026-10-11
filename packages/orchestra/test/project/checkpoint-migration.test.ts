import { $ } from "bun"
import { describe, expect } from "bun:test"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Cause, Effect, Exit } from "effect"
import { Project } from "@/project/project"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ProjectV2 } from "@orchestra/core/project"
import { ProjectCheckpoint } from "@orchestra/core/project/checkpoint"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { Hash } from "@orchestra/core/util/hash"
import { gitInit, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Project.node, ProjectCheckpoint.node, Database.node, CrossSpawnSpawner.node]), [
    [Database.node, Database.layerFromPath(":memory:")],
  ]),
)

describe("checkpoint project ownership migration", () => {
  it.live("moves checkpoints before deleting the old project and preserves worktree provenance", () =>
    Effect.gen(function* () {
      const projects = yield* Project.Service
      const checkpoints = yield* ProjectCheckpoint.Service
      const database = yield* Database.Service
      const directory = yield* tmpdirScoped({ git: true })
      const linked = path.join(yield* tmpdirScoped(), "linked")
      yield* Effect.promise(() => $`git worktree add --detach ${linked} HEAD`.cwd(directory).quiet())
      const old = (yield* projects.fromDirectory(directory)).project.id
      expect(old).not.toBe(ProjectV2.ID.global)
      expect((yield* projects.fromDirectory(linked)).project.id).toBe(old)

      const parent = yield* seed(old, directory)
      const sessions = [yield* seed(old, directory, parent.id), yield* seed(old, linked, parent.id)]
      const saved = yield* Effect.forEach(sessions, (session) => save(session))
      const next = yield* changeOrigin(directory)
      expect(next).not.toBe(old)
      yield* Effect.forEach(saved, (checkpoint) => owned(checkpoint, old))
      expect((yield* checkpoints.list({ projectID: next })).items).toEqual([])
      yield* Effect.forEach(saved, (checkpoint) =>
        checkpoints.read({ projectID: next, id: checkpoint.id }).pipe(Effect.map((row) => expect(row).toBeUndefined())),
      )

      expect((yield* projects.fromDirectory(directory)).project.id).toBe(next)
      expect(yield* projects.get(old)).toBeUndefined()
      yield* Effect.forEach([parent, ...sessions], (session) =>
        Effect.gen(function* () {
          expect(yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, session.id)).get()).toEqual({
            ...session,
            project_id: next,
          })
        }),
      )
      yield* Effect.forEach(saved, (checkpoint) => owned(checkpoint, next))
      expect((yield* checkpoints.list({ projectID: old })).items).toEqual([])
      yield* Effect.forEach(saved, (checkpoint) =>
        checkpoints.read({ projectID: old, id: checkpoint.id }).pipe(Effect.map((row) => expect(row).toBeUndefined())),
      )
      expect((yield* checkpoints.list({ projectID: next })).items.map((row) => row.id).sort()).toEqual(
        saved.map((row) => row.id).sort(),
      )
      expect((yield* projects.fromDirectory(linked)).project.id).toBe(next)
      yield* Effect.forEach(saved, (checkpoint) =>
        Effect.gen(function* () {
          expect(
            (yield* checkpoints.list({ projectID: next, directory: checkpoint.directory })).items.map((row) => row.id),
          ).toEqual([checkpoint.id])
        }),
      )
    }),
  )
  ;[false, true].forEach((existing) => {
    it.live(`adopts only matching global checkpoints (existing project: ${existing})`, () =>
      Effect.gen(function* () {
        const projects = yield* Project.Service
        const checkpoints = yield* ProjectCheckpoint.Service
        const database = yield* Database.Service
        const directory = yield* tmpdirScoped({ init: (dir) => Effect.promise(() => gitInit(dir)) })
        const other = yield* tmpdirScoped({ init: (dir) => Effect.promise(() => gitInit(dir)) })
        expect((yield* projects.fromDirectory(directory)).project.id).toBe(ProjectV2.ID.global)
        expect((yield* projects.fromDirectory(other)).project.id).toBe(ProjectV2.ID.global)
        const source = yield* seed(ProjectV2.ID.global, directory)
        const deleted = yield* seed(ProjectV2.ID.global, directory, source.id)
        const unrelated = yield* seed(ProjectV2.ID.global, other)
        const selected = [yield* save(source), yield* save(deleted)]
        const untouched = yield* save(unrelated)
        yield* database.db.delete(SessionTable).where(eq(SessionTable.id, deleted.id)).run()
        expect(
          yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, deleted.id)).get(),
        ).toBeUndefined()
        yield* Effect.forEach([...selected, untouched], (checkpoint) => owned(checkpoint, ProjectV2.ID.global))

        const remote = `github.com/checkpoint-tests/${crypto.randomUUID()}`
        const next = ProjectV2.ID.make(Hash.fast(`git-remote:${remote}`))
        if (existing) {
          const checkout = yield* tmpdirScoped({ git: true })
          yield* Effect.promise(() => $`git remote add origin ${`https://${remote}.git`}`.cwd(checkout).quiet())
          expect((yield* projects.fromDirectory(checkout)).project.id).toBe(next)
        }
        expect((yield* checkpoints.list({ projectID: next })).items).toEqual([])
        yield* Effect.forEach(selected, (checkpoint) =>
          checkpoints
            .read({ projectID: next, id: checkpoint.id })
            .pipe(Effect.map((row) => expect(row).toBeUndefined())),
        )
        yield* Effect.promise(() => $`git commit --allow-empty -m "root"`.cwd(directory).quiet())
        yield* Effect.promise(() => $`git remote add origin ${`https://${remote}.git`}`.cwd(directory).quiet())

        expect((yield* projects.fromDirectory(directory)).project.id).toBe(next)
        expect(
          (yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, source.id)).get())?.project_id,
        ).toBe(next)
        expect(yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, unrelated.id)).get()).toEqual(
          unrelated,
        )
        expect(
          yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, deleted.id)).get(),
        ).toBeUndefined()
        yield* Effect.forEach(selected, (checkpoint) => owned(checkpoint, next))
        yield* owned(untouched, ProjectV2.ID.global)
        expect((yield* checkpoints.list({ projectID: next })).items.map((row) => row.id).sort()).toEqual(
          selected.map((row) => row.id).sort(),
        )
        expect((yield* checkpoints.list({ projectID: ProjectV2.ID.global })).items.map((row) => row.id)).toEqual([
          untouched.id,
        ])
        expect((yield* checkpoints.list({ projectID: ProjectV2.ID.global, directory })).items).toEqual([])
        expect(yield* checkpoints.read({ projectID: next, id: untouched.id })).toBeUndefined()
        yield* Effect.forEach(selected, (checkpoint) =>
          checkpoints
            .read({ projectID: ProjectV2.ID.global, id: checkpoint.id })
            .pipe(Effect.map((row) => expect(row).toBeUndefined())),
        )
      }),
    )
  })
  ;[false, true].forEach((global) => {
    it.live(`checkpoint update abort rolls back session ownership (global: ${global})`, () =>
      Effect.gen(function* () {
        const projects = yield* Project.Service
        const checkpoints = yield* ProjectCheckpoint.Service
        const database = yield* Database.Service
        // Exercise the same migration without injection before probing its transaction.
        const control = yield* pendingMigration(global)
        expect((yield* projects.fromDirectory(control.directory)).project.id).toBe(control.next)
        yield* owned(control.checkpoint, control.next)
        expect(
          (yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, control.session.id)).get())
            ?.project_id,
        ).toBe(control.next)

        const subject = yield* pendingMigration(global)
        const oldProject = yield* projects.get(subject.session.project_id)
        expect(oldProject).toBeDefined()
        yield* owned(subject.checkpoint, subject.session.project_id)
        // AFTER UPDATE also proves that a checkpoint write itself is undone, not just rejected beforehand.
        yield* database.db
          .run(`CREATE TRIGGER checkpoint_ownership_abort AFTER UPDATE OF project_id ON project_checkpoint
          WHEN OLD.project_id != NEW.project_id
          BEGIN SELECT RAISE(ABORT, 'checkpoint ownership rollback probe'); END`)
        yield* Effect.addFinalizer(() =>
          database.db.run("DROP TRIGGER IF EXISTS checkpoint_ownership_abort").pipe(Effect.orDie),
        )

        const exit = yield* projects.fromDirectory(subject.directory).pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("checkpoint ownership rollback probe")
        expect(
          yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, subject.session.id)).get(),
        ).toEqual(subject.session)
        expect(yield* projects.get(subject.session.project_id)).toEqual(oldProject)
        yield* owned(subject.checkpoint, subject.session.project_id)
        expect(yield* checkpoints.read({ projectID: subject.next, id: subject.checkpoint.id })).toBeUndefined()
        expect((yield* checkpoints.list({ projectID: subject.next })).items).toEqual([])
        // Global adoption's project upsert precedes its transaction; cached-ID migration's insert is inside it.
        if (!global) expect(yield* projects.get(subject.next)).toBeUndefined()

        yield* database.db.run("DROP TRIGGER checkpoint_ownership_abort")
        expect((yield* projects.fromDirectory(subject.directory)).project.id).toBe(subject.next)
        expect(
          (yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, subject.session.id)).get())
            ?.project_id,
        ).toBe(subject.next)
        yield* owned(subject.checkpoint, subject.next)
        expect(
          yield* checkpoints.read({ projectID: subject.session.project_id, id: subject.checkpoint.id }),
        ).toBeUndefined()
        expect((yield* checkpoints.list({ projectID: subject.session.project_id })).items).toEqual([])
        if (!global) expect(yield* projects.get(subject.session.project_id)).toBeUndefined()
        yield* owned(control.checkpoint, control.next)
      }),
    )
  })
})

function seed(projectID: ProjectV2.ID, directory: string, parentID?: SessionSchema.ID) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const id = SessionSchema.ID.create()
    const row = yield* database.db
      .insert(SessionTable)
      .values({
        id,
        project_id: projectID,
        parent_id: parentID,
        slug: id,
        directory,
        title: "checkpoint ownership source",
        version: "0.0.0-test",
        time_created: 123,
        time_updated: 456,
      })
      .returning()
      .get()
    if (!row) throw new Error("Source Session was not inserted")
    return row
  })
}

function save(session: typeof SessionTable.$inferSelect) {
  return Effect.gen(function* () {
    const checkpoints = yield* ProjectCheckpoint.Service
    const payload = ` { "context": "preserve exact bytes — 雪", "parentID": ${JSON.stringify(session.parent_id)} }\n`
    const saved = yield* checkpoints.save({
      sessionID: session.id,
      forkID: crypto.randomUUID(),
      boundary: "ownership-boundary",
      attempt: 0,
      payload,
    })
    expect(saved.projectID).toBe(session.project_id)
    expect(saved.directory).toBe(session.directory)
    return { ...saved, payload }
  })
}

function owned(checkpoint: ProjectCheckpoint.Metadata & { payload: string }, projectID: ProjectV2.ID) {
  return Effect.gen(function* () {
    const checkpoints = yield* ProjectCheckpoint.Service
    const { payload, ...metadata } = checkpoint
    expect(yield* checkpoints.read({ projectID, id: checkpoint.id })).toEqual({ ...checkpoint, projectID })
    expect((yield* checkpoints.list({ projectID })).items).toContainEqual({ ...metadata, projectID })
  })
}

function changeOrigin(directory: string) {
  return Effect.gen(function* () {
    const remote = `github.com/checkpoint-tests/${crypto.randomUUID()}`
    yield* Effect.promise(() => $`git remote add origin ${`https://${remote}.git`}`.cwd(directory).quiet())
    return ProjectV2.ID.make(Hash.fast(`git-remote:${remote}`))
  })
}

function pendingMigration(global: boolean) {
  return Effect.gen(function* () {
    const projects = yield* Project.Service
    const directory = yield* tmpdirScoped(
      global ? { init: (dir) => Effect.promise(() => gitInit(dir)) } : { git: true },
    )
    const old = (yield* projects.fromDirectory(directory)).project.id
    expect(old === ProjectV2.ID.global).toBe(global)
    const session = yield* seed(old, directory)
    const checkpoint = yield* save(session)
    const next = yield* changeOrigin(directory)
    expect(next).not.toBe(old)
    return { directory, session, checkpoint, next }
  })
}
