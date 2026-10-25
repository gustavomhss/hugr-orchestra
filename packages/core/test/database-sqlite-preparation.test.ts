import { expect, test } from "bun:test"
import { Database, SQLiteError } from "bun:sqlite"
import path from "path"
import { Cause, Effect, Exit, Fiber } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { SqlError } from "effect/unstable/sql/SqlError"
import { sql } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { layer } from "@orchestra/core/database/sqlite.bun"
import { Sqlite } from "@orchestra/core/database/sqlite"
import { tmpdir } from "./fixture/tmpdir"

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | Sqlite.Native>, filename = ":memory:") =>
  Effect.runPromise(effect.pipe(Effect.provide(layer({ filename })), Effect.scoped))

function failure(exit: Exit.Exit<unknown, unknown>) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) throw new Error("Expected failure")
  expect(exit.cause.reasons).toHaveLength(1)
  const reason = exit.cause.reasons[0]
  expect(reason?._tag).toBe("Fail")
  if (reason?._tag !== "Fail") throw new Error("Expected typed failure, not defect or interruption")
  return reason.error
}

function expectSqlError(error: unknown, errno: number, tag: SqlError["reason"]["_tag"]) {
  expect(error).toBeInstanceOf(SqlError)
  if (!(error instanceof SqlError)) throw new Error("Expected SqlError")
  expect(error.message).toBe("Failed to execute statement")
  expect(error.reason._tag).toBe(tag)
  expect(error.reason.operation).toBe("execute")
  expect(error.reason.message).toBe("Failed to execute statement")
  expect(error.reason.cause).toBeInstanceOf(SQLiteError)
  if (!(error.reason.cause instanceof SQLiteError)) throw new Error("Expected native SQLiteError")
  expect(error.reason.cause.errno).toBe(errno)
}

const paths = ["execute", "unprepared", "raw", "values"] as const
const invalid = ["SELECT value FROM missing_item", "SELEC value"]

paths.forEach((mode) => {
  const execute = (client: SqlClient.SqlClient, query: string, params: ReadonlyArray<unknown> = []) => {
    const statement = client.unsafe(query, params)
    return mode === "execute" ? statement : statement[mode]
  }

  invalid.forEach((query) => {
    test(`${mode}: preparation failure is typed and does not poison cached or later statements: ${query}`, () =>
      run(Effect.gen(function* () {
        const client = yield* SqlClient.SqlClient
        const valid = client.unsafe("SELECT ? AS value", [42])
        expect(yield* valid).toEqual([{ value: 42 }])
        expectSqlError(failure(yield* execute(client, query).pipe(Effect.exit)), 1, "UnknownError")
        expectSqlError(failure(yield* execute(client, query).pipe(Effect.exit)), 1, "UnknownError")
        yield* client.unsafe("CREATE TABLE missing_item (value INTEGER)")
        yield* client.unsafe("INSERT INTO missing_item VALUES (7)")
        expect(yield* execute(client, "SELECT value FROM missing_item")).toEqual(
          mode === "values" ? [[7]] : [{ value: 7 }],
        )
        expect(yield* valid).toEqual([{ value: 42 }])
        expect(yield* execute(client, "SELECT 42 AS value").pipe(Effect.provideService(SqlClient.SafeIntegers, true)))
          .toEqual(mode === "values" ? [[42n]] : [{ value: 42n }])
        expect(yield* execute(client, "SELECT 42 AS value")).toEqual(mode === "values" ? [[42]] : [{ value: 42 }])
      })),
    )
  })

  test(`${mode}: execution constraint failure stays typed and cached statement recovers`, () =>
    run(Effect.gen(function* () {
      const client = yield* SqlClient.SqlClient
      yield* client.unsafe("CREATE TABLE item (value INTEGER NOT NULL)")
      yield* execute(client, "INSERT INTO item VALUES (?) RETURNING value", [1])
      expectSqlError(failure(yield* execute(client, "INSERT INTO item VALUES (?) RETURNING value", [null]).pipe(Effect.exit)),
        1299, "ConstraintError")
      expect(yield* execute(client, "INSERT INTO item VALUES (?) RETURNING value", [2])).toEqual(
        mode === "values" ? [[2]] : [{ value: 2 }],
      )
    })),
  )

  test(`${mode}: unexpected native binding TypeError remains pure defect`, () =>
    run(Effect.gen(function* () {
      const client = yield* SqlClient.SqlClient
      const exit = yield* execute(client, "SELECT ? AS value", [Symbol("invalid binding")]).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (!Exit.isFailure(exit)) throw new Error("Expected binding defect")
      expect(exit.cause.reasons).toHaveLength(1)
      const reason = exit.cause.reasons[0]
      expect(reason?._tag).toBe("Die")
      if (reason?._tag !== "Die") throw new Error("Expected pure defect")
      expect(reason.defect).toBeInstanceOf(TypeError)
      expect(yield* execute(client, "SELECT ? AS value", [3])).toEqual(mode === "values" ? [[3]] : [{ value: 3 }])
    })),
  )

  test(`${mode}: interrupted connection wait remains interruption and connection recovers`, () =>
    run(Effect.gen(function* () {
      const client = yield* SqlClient.SqlClient
      yield* Effect.scoped(Effect.gen(function* () {
        yield* client.reserve
        const fiber = yield* execute(client, "SELECT 1 AS value").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        expect(Exit.isFailure(exit)).toBe(true)
        if (!Exit.isFailure(exit)) throw new Error("Expected interruption")
        expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(["Interrupt"])
      }))
      expect(yield* execute(client, "SELECT 1 AS value")).toEqual(mode === "values" ? [[1]] : [{ value: 1 }])
    })),
  )
})

const drizzlePaths = ["all", "values"] as const
drizzlePaths.forEach((mode) => {
  invalid.forEach((query) => {
    test(`EffectDrizzle ${mode}: native preparation failure stays in typed error channel: ${query}`, () =>
      run(Effect.gen(function* () {
        const db = yield* EffectDrizzleSqlite.makeWithDefaults()
        const error = failure(yield* (mode === "values" ? db.values(sql.raw(query)) : db.all(sql.raw(query))).pipe(Effect.exit))
        expect(error).toBeInstanceOf(EffectDrizzleQueryError)
        if (!(error instanceof EffectDrizzleQueryError)) throw new Error("Expected EffectDrizzleQueryError")
        if (!Cause.isCause(error.cause)) throw new Error("Expected wrapped SQL Cause")
        expectSqlError(failure(Exit.failCause(error.cause)), 1, "UnknownError")
        expect(yield* (mode === "values" ? db.values(sql`SELECT 42 AS value`) : db.all(sql`SELECT 42 AS value`)))
          .toEqual(mode === "values" ? [[42]] : [{ value: 42 }])
      })),
    )
  })
})

test("preparation failure and LRU execution close scoped database and allow file cleanup", async () => {
  await using tmp = await tmpdir()
  const filename = path.join(tmp.path, "preparation.sqlite")
  const native = await run(Effect.gen(function* () {
    const client = yield* SqlClient.SqlClient
    const native = yield* Sqlite.Native
    if (!(native instanceof Database)) throw new Error("Expected real Bun database")
    yield* client.unsafe("CREATE TABLE item (value INTEGER NOT NULL)")
    expectSqlError(failure(yield* client.unsafe(invalid[0]).pipe(Effect.exit)), 1, "UnknownError")
    yield* Effect.forEach(Array.from({ length: 501 }, (_, index) => index), (index) =>
      client.unsafe(`SELECT ${index} AS value`))
    expect(yield* client.unsafe("SELECT 42 AS value")).toEqual([{ value: 42 }])
    return native
  }), filename)
  expect(() => native.prepare("SELECT 1")).toThrow()
  expect(await Bun.file(filename).delete()).toBeUndefined()
  expect(await Bun.file(filename).exists()).toBe(false)
})
