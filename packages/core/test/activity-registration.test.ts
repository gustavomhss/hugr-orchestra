import { expect, test } from "bun:test"
import path from "node:path"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { sql } from "drizzle-orm"
import { Effect, Exit, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"
import { Database } from "@orchestra/core/database/database"
import { DatabaseMigration } from "@orchestra/core/database/migration"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Project } from "@orchestra/core/project"
import { ProjectDirectories } from "@orchestra/core/project/directories"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { migrations } from "../src/database/migration.gen"
import { tmpdir } from "./fixture/tmpdir"

const makeDb = EffectDrizzleSqlite.makeWithDefaults()
const projectID = Project.ID.make("activity-registration")
const directory = AbsolutePath.make("/activity/registered")
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function run<A, E>(effect: Effect.Effect<A, E, SqlClient>, filename = ":memory:") {
  return Effect.runPromise(
    effect.pipe(Effect.provide(SqliteClient.layer({ filename, disableWAL: true })), Effect.scoped),
  )
}

function registry<A, E>(
  db: Effect.Success<typeof makeDb>,
  effect: Effect.Effect<A, E, ProjectDirectories.Service | Project.Service>,
) {
  return effect.pipe(
    Effect.provide(
      AppNodeBuilder.build(LayerNode.group([ProjectDirectories.node, Project.node]), [
        [Database.node, Layer.succeed(Database.Service, { db })],
      ]),
    ),
  )
}

async function fixture() {
  const root = await tmpdir()
  return {
    filename: path.join(root.path, "registry.sqlite"),
    async [Symbol.asyncDispose]() {
      await root[Symbol.asyncDispose]()
    },
  }
}

const open = Effect.gen(function* () {
  const db = yield* makeDb
  yield* DatabaseMigration.apply(db)
  yield* db
    .insert(ProjectTable)
    .values([
      { id: projectID, worktree: directory, sandboxes: [] },
      { id: Project.ID.make("unrelated"), worktree: directory, sandboxes: [] },
    ])
    .onConflictDoNothing()
    .run()
  return db
})

function constraints(db: Effect.Success<typeof makeDb>, registrationID: string) {
  return Effect.gen(function* () {
    for (const token of [null, "", registrationID]) {
      expect(
        Exit.isFailure(
          yield* db
            .run(
              sql`INSERT INTO project_directory (project_id, directory, registration_id, time_created)
              VALUES (${projectID}, '/activity/invalid', ${token}, 1)`,
            )
            .pipe(Effect.exit),
        ),
      ).toBe(true)
    }
    expect(
      Exit.isFailure(
        yield* db
          .run(
            sql`INSERT INTO project_directory (project_id, directory, time_created)
      VALUES (${projectID}, '/activity/invalid', 1)`,
          )
          .pipe(Effect.exit),
      ),
    ).toBe(true)
    expect(
      Exit.isFailure(
        yield* db
          .run(
            sql`INSERT INTO project_directory (project_id, directory, registration_id, time_created)
      VALUES ('unrelated', '/activity/invalid-other', ${registrationID}, 1)`,
          )
          .pipe(Effect.exit),
      ),
    ).toBe(true)
    expect(
      yield* db.get(
        sql`SELECT count(*) AS count FROM project_directory WHERE directory IN ('/activity/invalid', '/activity/invalid-other')`,
      ),
    ).toEqual({ count: 0 })
  })
}

test("G01 migration backfills unique IDs without losing fields and matches fresh constraints", async () => {
  await using file = await fixture()
  const migrated = await run(
    Effect.gen(function* () {
      const db = yield* makeDb
      yield* db.run(sql`PRAGMA foreign_keys = ON`)
      yield* db.run(sql`CREATE TABLE project (id text PRIMARY KEY)`)
      yield* db.run(sql`INSERT INTO project (id) VALUES (${projectID})`)
      yield* db.run(sql`INSERT INTO project (id) VALUES ('unrelated')`)
      yield* db.run(sql`CREATE TABLE unrelated (id text PRIMARY KEY, payload text NOT NULL)`)
      yield* db.run(sql`INSERT INTO unrelated VALUES ('keep', 'preserve this payload')`)
      yield* db.run(sql`CREATE TABLE project_directory (
        project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        directory text NOT NULL, type text, strategy text, time_created integer NOT NULL,
        PRIMARY KEY(project_id, directory))`)
      yield* Effect.forEach(["main", "root", "git_worktree"], (type, index) =>
        db.run(sql`INSERT INTO project_directory (project_id, directory, type, strategy, time_created)
          VALUES (${projectID}, ${`/activity/${index}`}, ${type}, ${index ? "git_worktree" : null}, 7)`),
      )
      yield* db.run(sql`INSERT INTO project_directory VALUES ('unrelated', '/unrelated', 'root', 'external', 19)`)
      yield* db.run(
        sql`UPDATE project_directory SET time_created = CAST('9007199254740993' AS INTEGER) WHERE project_id = 'unrelated'`,
      )
      const before = yield* db.all(sql`SELECT project_id, directory, type, strategy,
        CAST(time_created AS TEXT) AS time_created FROM project_directory ORDER BY directory`)
      const target = migrations.filter((item) => item.id.endsWith("_activity_registration_identity"))
      expect(target).toHaveLength(1)
      yield* DatabaseMigration.applyOnly(db, target)
      expect(
        yield* db.all(sql`SELECT project_id, directory, type, strategy, CAST(time_created AS TEXT) AS time_created
        FROM project_directory ORDER BY directory`),
      ).toEqual(before)
      expect(
        yield* db.get(
          sql`SELECT CAST(time_created AS TEXT) AS exact FROM project_directory WHERE project_id = 'unrelated'`,
        ),
      ).toEqual({ exact: "9007199254740993" })
      const rows = yield* db.all<{ registration_id: string }>(
        sql`SELECT registration_id FROM project_directory ORDER BY directory`,
      )
      expect(rows).toHaveLength(4)
      expect(new Set(rows.map((row) => row.registration_id)).size).toBe(4)
      rows.forEach((row) => expect(row.registration_id).toMatch(uuid))
      yield* constraints(db, rows[0]!.registration_id)
      yield* DatabaseMigration.applyOnly(db, target)
      expect(yield* db.all(sql`SELECT registration_id FROM project_directory ORDER BY directory`)).toEqual(rows)
      expect(yield* db.all(sql`SELECT * FROM unrelated`)).toEqual([{ id: "keep", payload: "preserve this payload" }])
      return rows
    }),
    file.filename,
  )
  await run(
    Effect.gen(function* () {
      const db = yield* makeDb
      yield* db.run(sql`PRAGMA foreign_keys = ON`)
      expect(yield* db.all(sql`SELECT registration_id FROM project_directory ORDER BY directory`)).toEqual(migrated)
      const stored = yield* db.all<{ registration_id: string; directory: string; strategy: string | null }>(
        sql`SELECT registration_id, directory, strategy FROM project_directory WHERE project_id = ${projectID} ORDER BY directory`,
      )
      yield* registry(
        db,
        Effect.gen(function* () {
          const service = yield* ProjectDirectories.Service
          const expected = stored.map((row) => ({
            registrationID: row.registration_id,
            directory: AbsolutePath.make(row.directory),
            strategy: row.strategy ?? undefined,
          }))
          expect(yield* service.listRegistrations(projectID)).toEqual(expected)
          for (const row of expected)
            expect(yield* service.getRegistration({ projectID, directory: row.directory })).toEqual(row)
        }),
      )
      yield* db.run(sql`DELETE FROM project WHERE id = ${projectID}`)
      expect(
        yield* db.get(
          sql`SELECT project_id, directory, type, strategy, CAST(time_created AS TEXT) AS time_created FROM project_directory`,
        ),
      ).toEqual({
        project_id: "unrelated",
        directory: "/unrelated",
        type: "root",
        strategy: "external",
        time_created: "9007199254740993",
      })
    }),
    file.filename,
  )
  await run(
    Effect.gen(function* () {
      const db = yield* open
      yield* registry(
        db,
        Effect.gen(function* () {
          const service = yield* ProjectDirectories.Service
          yield* service.create({ projectID, directory })
          const row = yield* service.getRegistration({ projectID, directory })
          expect(row?.registrationID).toMatch(uuid)
          yield* constraints(db, row!.registrationID)
        }),
      )
    }),
  )
})

test("G02 unobserved same-path recreation and strategy ABA renew persisted identity at equal timestamps", async () => {
  await run(
    Effect.gen(function* () {
      const db = yield* open
      yield* registry(
        db,
        Effect.gen(function* () {
          const service = yield* ProjectDirectories.Service
          yield* service.create({ projectID, directory, strategy: "git_worktree" })
          yield* db.run(sql`UPDATE project_directory SET time_created = 7`)
          const first = yield* service.getRegistration({ projectID, directory })
          expect(first?.registrationID).toMatch(uuid)
          yield* service.remove({ projectID, directory })
          yield* service.create({ projectID, directory, strategy: "git_worktree" })
          yield* db.run(sql`UPDATE project_directory SET time_created = 7`)
          // No observer read occurred during the absent or intermediate strategy states.
          const second = yield* service.getRegistration({ projectID, directory })
          expect(second?.registrationID).toMatch(uuid)
          expect(second?.registrationID).not.toBe(first?.registrationID)
          yield* service.create({ projectID, directory, strategy: "copy", behavior: "replace" })
          yield* service.create({ projectID, directory, strategy: "git_worktree", behavior: "replace" })
          const third = yield* service.getRegistration({ projectID, directory })
          expect(third?.registrationID).toMatch(uuid)
          expect(third?.registrationID).not.toBe(second?.registrationID)
          expect(third?.registrationID).not.toBe(first?.registrationID)
          expect(yield* db.get(sql`SELECT time_created FROM project_directory`)).toEqual({ time_created: 7 })
        }),
      )
    }),
  )
})

test("G03 no-op and failed producer transactions preserve the committed incarnation", async () => {
  await run(
    Effect.gen(function* () {
      const db = yield* open
      yield* registry(
        db,
        Effect.gen(function* () {
          const service = yield* ProjectDirectories.Service
          yield* service.create({ projectID, directory, strategy: "git_worktree" })
          const before = yield* service.getRegistration({ projectID, directory })
          expect(before?.registrationID).toMatch(uuid)
          expect(yield* service.create({ projectID, directory, strategy: "other" })).toBe(false)
          expect(yield* service.create({ projectID, directory, strategy: "git_worktree", behavior: "replace" })).toBe(
            false,
          )
          expect(yield* service.getRegistration({ projectID, directory })).toEqual(before)
          expect(yield* service.create({ projectID, directory, behavior: "replace" })).toBe(true)
          const unset = yield* service.getRegistration({ projectID, directory })
          expect(unset?.registrationID).toMatch(uuid)
          expect(unset?.registrationID).not.toBe(before?.registrationID)
          expect(unset?.strategy).toBeUndefined()
          expect(yield* service.create({ projectID, directory, behavior: "replace" })).toBe(false)
          expect(yield* service.getRegistration({ projectID, directory })).toEqual(unset)
          expect(yield* service.create({ projectID, directory, strategy: "", behavior: "replace" })).toBe(true)
          const empty = yield* service.getRegistration({ projectID, directory })
          expect(empty?.registrationID).toMatch(uuid)
          expect(empty?.registrationID).not.toBe(unset?.registrationID)
          expect(empty?.strategy).toBe("")
          expect(yield* service.create({ projectID, directory, strategy: "", behavior: "replace" })).toBe(false)
          expect(yield* service.getRegistration({ projectID, directory })).toEqual(empty)
          expect(yield* service.create({ projectID, directory, strategy: "git_worktree", behavior: "replace" })).toBe(
            true,
          )
          const restored = yield* service.getRegistration({ projectID, directory })
          expect(restored?.registrationID).toMatch(uuid)
          expect(restored?.registrationID).not.toBe(empty?.registrationID)
          const rollback = yield* db
            .transaction((tx) =>
              Effect.gen(function* () {
                expect(
                  yield* service.create({ projectID, directory, strategy: "other", behavior: "replace" }, tx),
                ).toBe(true)
                const changed = yield* tx.get<{ registration_id: string }>(
                  sql`SELECT registration_id FROM project_directory`,
                )
                expect(changed?.registration_id).toMatch(uuid)
                expect(changed?.registration_id).not.toBe(restored?.registrationID)
                return yield* Effect.fail("rollback")
              }),
            )
            .pipe(Effect.flip)
          expect(rollback).toBe("rollback")
          expect(yield* service.getRegistration({ projectID, directory })).toEqual(restored)
          const absent = AbsolutePath.make("/activity/rolled-back")
          const insertRollback = yield* db
            .transaction((tx) =>
              Effect.gen(function* () {
                expect(yield* service.create({ projectID, directory: absent }, tx)).toBe(true)
                expect(
                  (yield* tx.get<{ registration_id: string }>(
                    sql`SELECT registration_id FROM project_directory WHERE directory = ${absent}`,
                  ))?.registration_id,
                ).toMatch(uuid)
                return yield* Effect.fail("rollback")
              }),
            )
            .pipe(Effect.flip)
          expect(insertRollback).toBe("rollback")
          expect(yield* service.getRegistration({ projectID, directory: absent })).toBeUndefined()
          yield* service.remove({ projectID, directory })
          expect(yield* service.getRegistration({ projectID, directory })).toBeUndefined()
          expect(yield* service.listRegistrations(projectID)).toEqual([])
        }),
      )
    }),
  )
})

test("G04 reopened storage retains identity and internal reads preserve public output without mutation", async () => {
  await using file = await fixture()
  const read = Effect.gen(function* () {
    const db = yield* open
    return yield* registry(
      db,
      Effect.gen(function* () {
        const service = yield* ProjectDirectories.Service
        yield* service.create({ projectID, directory, strategy: "git_worktree" })
        const before = yield* db.all(sql`SELECT * FROM project_directory`)
        const row = yield* service.getRegistration({ projectID, directory })
        expect(row?.registrationID).toMatch(uuid)
        expect(row).toEqual({
          directory,
          strategy: "git_worktree",
          registrationID: (yield* db.get<{ registration_id: string }>(
            sql`SELECT registration_id FROM project_directory`,
          ))?.registration_id!,
        })
        expect(yield* service.listRegistrations(projectID)).toEqual([row!])
        expect(yield* service.listRegistrations(Project.ID.make("missing"))).toEqual([])
        expect(yield* service.getRegistration({ projectID, directory: AbsolutePath.make("/missing") })).toBeUndefined()
        expect(yield* service.list(projectID)).toEqual([{ directory, strategy: "git_worktree" }])
        expect(yield* service.get({ projectID, directory })).toEqual({ directory, strategy: "git_worktree" })
        const projects = yield* Project.Service
        expect(yield* projects.directories({ projectID })).toEqual([{ directory, strategy: "git_worktree" }])
        expect(Schema.encodeSync(ProjectDirectories.ListOutput)(yield* service.list(projectID))).toEqual([
          { directory, strategy: "git_worktree" },
        ])
        expect(yield* db.all(sql`SELECT * FROM project_directory`)).toEqual(before)
        return row
      }),
    )
  })
  const before = await run(read, file.filename)
  expect(await run(read, file.filename)).toEqual(before)
})
