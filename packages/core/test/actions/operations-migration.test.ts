import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { eq, getTableColumns, sql } from "drizzle-orm"
import { Cause, Effect, Exit, Schema, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { fileURLToPath } from "node:url"
import { ActionsOperationTable } from "../../src/actions/operations/sql"
import { migrations } from "../../src/database/migration.gen"
import type { Database } from "../../src/database/database"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ProjectSchema } from "../../src/project/schema"
import { ProjectTable } from "../../src/project/sql"
import { AbsolutePath } from "../../src/schema"
import { SessionSchema } from "../../src/session/schema"
import { SessionTable } from "../../src/session/sql"
import { testEffect } from "../lib/effect"
import { fault, fixture, intent, open, openDatabase } from "./operations-fixture"

const migrationID = "20261012115744_actions-operation"
const it = testEffect(LayerNode.compile(AppProcess.node))

it.live("fresh production Database creates Actions storage, journal and real unique indexes", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* storage(f.database.db)
    const journal = yield* f.database.db.all<{ id: string }>(sql`SELECT id FROM migration ORDER BY id`)
    expect(journal).toEqual(
      migrations.map((migration) => ({ id: migration.id })).sort((left, right) => left.id.localeCompare(right.id)),
    )
    expect(journal.filter((row) => row.id === migrationID)).toEqual([{ id: migrationID }])
    const service = yield* open(f.database, f.directory)
    const receipt = yield* service.operations.prepare(service.binding, intent(service.binding))
    yield* uniqueness(f.database.db, receipt.id)
    yield* nativeSnapshot(f.filename, {
      journal: yield* f.database.db.all(sql`SELECT * FROM migration ORDER BY id`),
      actions: yield* f.database.db.select().from(ActionsOperationTable).orderBy(ActionsOperationTable.id).all(),
      projects: [],
      sessions: [],
    })
  }),
)

it.live("production reopen upgrades pre-Actions schema once and preserves native Project and Session rows", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const nativeProjectID = ProjectSchema.ID.make("native-project-before-actions")
    const project = {
      id: nativeProjectID,
      worktree: AbsolutePath.make(f.directory),
      name: "Before Actions",
      vcs: "git",
      sandboxes: [AbsolutePath.make(f.directory)],
      commands: { start: "bun dev" },
      time_created: 11,
      time_updated: 22,
    }
    const session = {
      id: SessionSchema.ID.make("ses_before_actions"),
      project_id: nativeProjectID,
      slug: "before-actions",
      directory: f.directory,
      title: "Keep my session",
      version: "test",
      time_created: 33,
      time_updated: 44,
      metadata: { user: "retained", nested: { value: 42 } },
      cost: 1.25,
      tokens_input: 23,
    }
    yield* f.database.db.insert(ProjectTable).values(project).run()
    yield* f.database.db.insert(SessionTable).values(session).run()
    const oldProject = yield* f.database.db.select().from(ProjectTable).all()
    const oldSession = yield* f.database.db.select().from(SessionTable).all()
    expect(oldProject).toEqual([expect.objectContaining(project)])
    expect(oldSession).toEqual([expect.objectContaining(session)])
    const fullJournal = yield* f.database.db.all<{ id: string; time_completed: number }>(
      sql`SELECT * FROM migration ORDER BY id`,
    )
    expect(fullJournal.filter((row) => row.id === migrationID)).toHaveLength(1)

    // Reverse only the new migration. All historical DDL and journal rows stay production-created.
    yield* f.database.db.run(sql`DROP TABLE actions_operation`)
    yield* f.database.db.run(sql`DELETE FROM migration WHERE id = ${migrationID}`)
    const oldJournal = yield* f.database.db.all<{ id: string; time_completed: number }>(
      sql`SELECT * FROM migration ORDER BY id`,
    )
    expect(oldJournal).toEqual(fullJournal.filter((row) => row.id !== migrationID))
    expect(
      yield* f.database.db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'actions_operation'`),
    ).toBeUndefined()
    yield* Scope.close(f.scope, Exit.void)

    const upgraded = yield* openDatabase(f.filename)
    yield* storage(upgraded.database.db)
    expect(yield* upgraded.database.db.select().from(ProjectTable).all()).toEqual(oldProject)
    expect(yield* upgraded.database.db.select().from(SessionTable).all()).toEqual(oldSession)
    const journal = yield* upgraded.database.db.all<{ id: string; time_completed: number }>(
      sql`SELECT * FROM migration ORDER BY id`,
    )
    expect(journal.filter((row) => row.id !== migrationID)).toEqual(oldJournal)
    expect(journal.filter((row) => row.id === migrationID)).toEqual([
      { id: migrationID, time_completed: expect.any(Number) },
    ])
    expect(journal).toHaveLength(oldJournal.length + 1)
    expect(yield* upgraded.database.db.select().from(ActionsOperationTable).all()).toEqual([])

    const rows = yield* Effect.scoped(
      Effect.gen(function* () {
        const service = yield* open(upgraded.database, f.directory)
        const prepared = yield* service.operations.prepare(service.binding, intent(service.binding))
        yield* uniqueness(upgraded.database.db, prepared.id)
        return yield* upgraded.database.db.select().from(ActionsOperationTable).orderBy(ActionsOperationTable.id).all()
      }),
    )
    yield* Scope.close(upgraded.scope, Exit.void)

    yield* nativeSnapshot(f.filename, { journal, actions: rows, projects: oldProject, sessions: oldSession })

    const reopened = yield* openDatabase(f.filename)
    yield* storage(reopened.database.db)
    expect(yield* reopened.database.db.all(sql`SELECT * FROM migration ORDER BY id`)).toEqual(journal)
    expect(yield* reopened.database.db.select().from(ProjectTable).all()).toEqual(oldProject)
    expect(yield* reopened.database.db.select().from(SessionTable).all()).toEqual(oldSession)
    expect(
      yield* reopened.database.db.select().from(ActionsOperationTable).orderBy(ActionsOperationTable.id).all(),
    ).toEqual(rows)
  }),
)

it.live("missing Actions table is not repaired by operations fixture when journal says migration completed", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    expect(yield* f.database.db.get(sql`SELECT id FROM migration WHERE id = ${migrationID}`)).toEqual({
      id: migrationID,
    })
    yield* f.database.db.run(sql`DROP TABLE actions_operation`)
    yield* Scope.close(f.scope, Exit.void)
    const reopened = yield* openDatabase(f.filename)
    expect(
      yield* reopened.database.db.get(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'actions_operation'`,
      ),
    ).toBeUndefined()
    yield* fault(open(reopened.database, f.directory), "maintenance_required")
    expect(
      yield* reopened.database.db.get(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'actions_operation'`,
      ),
    ).toBeUndefined()
    expect(yield* reopened.database.db.all(sql`SELECT id FROM migration WHERE id = ${migrationID}`)).toEqual([
      { id: migrationID },
    ])
  }),
)

const storage = (db: Database.Interface["db"]) =>
  Effect.gen(function* () {
    expect(
      yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'actions_operation'`),
    ).toEqual({ name: "actions_operation" })
    const columns = yield* db.all<{ name: string; type: string; notnull: number; pk: number }>(
      sql`PRAGMA table_info(actions_operation)`,
    )
    expect(columns.map((column) => column.name).sort()).toEqual(
      Object.values(getTableColumns(ActionsOperationTable))
        .map((column) => column.name)
        .sort(),
    )
    expect(columns.find((column) => column.name === "id")).toMatchObject({ type: "TEXT", pk: 1 })
    expect(columns.find((column) => column.name === "target")).toMatchObject({ type: "TEXT", notnull: 1 })
    expect(columns.find((column) => column.name === "binding_revision")).toMatchObject({ type: "INTEGER", notnull: 1 })
    expect(columns.find((column) => column.name === "expected")).toMatchObject({ notnull: 0 })
    const indexes = (yield* db.all<{ name: string; unique: number; origin: string }>(
      sql`PRAGMA index_list(actions_operation)`,
    ))
      .filter((index) => index.origin !== "pk")
      .map((index) => ({ name: index.name, unique: index.unique }))
      .sort((left, right) => left.name.localeCompare(right.name))
    expect(indexes).toEqual([
      { name: "actions_operation_location_binding_client_idx", unique: 1 },
      { name: "actions_operation_state_expires_idx", unique: 0 },
      { name: "actions_operation_state_updated_idx", unique: 0 },
    ])
    yield* Effect.forEach(
      [
        ["actions_operation_location_binding_client_idx", ["location_key", "binding_id", "client_id"]],
        ["actions_operation_state_expires_idx", ["state", "time_expires"]],
        ["actions_operation_state_updated_idx", ["state", "time_updated"]],
      ] as const,
      ([name, columns]) =>
        Effect.gen(function* () {
          expect(
            (yield* db.all<{ name: string }>(sql`SELECT name FROM pragma_index_info(${name}) ORDER BY seqno`)).map(
              (column) => column.name,
            ),
          ).toEqual([...columns])
        }),
    )
  })

const uniqueness = (db: Database.Interface["db"], id: Actions.OperationID) =>
  Effect.gen(function* () {
    const row = yield* db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, id)).get()
    if (!row) return yield* Effect.die("Expected production-admitted Actions operation")
    const duplicate = yield* Effect.exit(
      db
        .insert(ActionsOperationTable)
        .values({ ...row, id: Actions.OperationID.create() })
        .run(),
    )
    expect(Exit.isFailure(duplicate)).toBe(true)
    if (!Exit.isFailure(duplicate))
      return yield* Effect.die("SQLite accepted duplicate Location/binding/client admission key")
    expect(Cause.pretty(duplicate.cause)).toContain("UNIQUE constraint failed")
    yield* Effect.forEach(
      [
        { location_key: `${row.location_key}:other` },
        { binding_id: Actions.BindingID.make("ab_other") },
        { client_id: "different-client" },
      ],
      (changed) =>
        db
          .insert(ActionsOperationTable)
          .values({ ...row, ...changed, id: Actions.OperationID.create() })
          .run(),
    )
    expect(yield* db.get(sql`SELECT count(*) AS total FROM actions_operation`)).toEqual({ total: 4 })
  })

const nativeSnapshot = (filename: string, expected: unknown) =>
  Effect.gen(function* () {
    const processService = yield* AppProcess.Service
    const result = yield* processService
      .run(
        ChildProcess.make(process.execPath, [
          fileURLToPath(new URL("./operations-migration-worker.ts", import.meta.url)),
          filename,
        ]),
        { timeout: "30 seconds", maxOutputBytes: 64 * 1024, maxErrorBytes: 4096 },
      )
      .pipe(Effect.orDie)
    expect(result.exitCode, result.stderr.toString()).toBe(0)
    expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.stdout.toString())).toEqual(expected)
  })
