import { expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { sql } from "drizzle-orm"
import { Cause, Context, Deferred, Effect, Exit, Fiber } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"
import { isSqlError, type SqlError } from "effect/unstable/sql/SqlError"
import { EffectDrizzleSqlite } from "../src"

const Annotation = Context.Service<{ readonly phase: string }>("test/transaction-causes/annotation")
const domain = { _tag: "DomainError", detail: "body" }
const marker = { defect: "marker" }
const annotated = <E>(cause: Cause.Cause<E>, phase: string) =>
  Cause.annotate(cause, Context.make(Annotation, { phase }))
const mixed = (phase: string) =>
  annotated(Cause.combine(Cause.combine(Cause.fail(domain), Cause.die(marker)), Cause.interrupt(123)), phase)

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.timeout("5 seconds"),
      Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })),
      Effect.scoped,
    ),
  )

function failure<A, E>(exit: Exit.Exit<A, E>) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) throw new Error("Expected transaction failure")
  return exit.cause
}

function expectReasons(actual: Cause.Cause<unknown>, original: Cause.Cause<unknown>, offset = 0) {
  original.reasons.forEach((reason, index) => {
    const found = actual.reasons[offset + index]
    expect(found._tag).toBe(reason._tag)
    if (reason._tag === "Fail" && found._tag === "Fail") expect(found.error).toBe(reason.error)
    if (reason._tag === "Die" && found._tag === "Die") expect(found.defect).toBe(reason.defect)
    if (reason._tag === "Interrupt" && found._tag === "Interrupt") expect(found.fiberId).toBe(reason.fiberId)
    expect(Context.getOrUndefined(Cause.reasonAnnotations(found), Annotation)).toBe(
      Context.getOrUndefined(Cause.reasonAnnotations(reason), Annotation),
    )
  })
}

const expectSqlFailures = (cause: Cause.Cause<unknown>, offset: number, messages: string[]) => {
  expect(cause.reasons.length).toBe(offset + messages.length)
  messages.forEach((message, index) => {
    const reason = cause.reasons[offset + index]
    expect(reason._tag).toBe("Fail")
    if (reason._tag !== "Fail" || !isSqlError(reason.error)) throw new Error("Expected cleanup SqlError")
    expect(String(reason.error.reason.cause)).toContain(message)
  })
}

const makeDb = Effect.gen(function* () {
  const db = yield* EffectDrizzleSqlite.makeWithDefaults()
  yield* db.run(sql`create table entries (id integer primary key)`)
  return db
})

test("positive commit and ordinary rollback preserve results and reuse writer", async () => {
  await run(Effect.gen(function* () {
    const db = yield* makeDb
    expect(yield* db.transaction((tx) => tx.run(sql`insert into entries values (1)`).pipe(Effect.as("committed")))).toBe("committed")
    const original = mixed("ordinary rollback")
    const cause = failure(yield* db.transaction((tx) => tx.run(sql`insert into entries values (2)`).pipe(
      Effect.andThen(Effect.failCause(original)),
    )).pipe(Effect.exit))
    expectReasons(cause, original)
    expect(cause.reasons.length).toBe(original.reasons.length)
    expect(yield* db.all(sql`select id from entries`)).toEqual([{ id: 1 }])
    yield* db.transaction((tx) => tx.run(sql`insert into entries values (3)`))
    expect(yield* db.all(sql`select id from entries order by id`)).toEqual([{ id: 1 }, { id: 3 }])
  }))
})

test.each([
  ["typed", Cause.fail(domain)],
  ["defect", Cause.die(marker)],
  ["interrupt", Cause.interrupt(123)],
  ["mixed", mixed("markers")],
] as const)("real INSERT OR ROLLBACK preserves SQL + %s body causes before cleanup", async (_, extra) => {
  await run(Effect.gen(function* () {
    const db = yield* makeDb
    const client = yield* SqlClient
    yield* db.run(sql`insert into entries values (1)`)
    const originals: Cause.Cause<unknown>[] = []
    const cause = failure(yield* db.transaction(() => Effect.gen(function* () {
      yield* client.unsafe("insert into entries values (2)")
      const original = annotated(Cause.combine(
        failure(yield* client.unsafe("insert or rollback into entries values (1)").pipe(Effect.exit)), extra,
      ), "OR ROLLBACK body")
      originals.push(original)
      return yield* Effect.failCause(original)
    })).pipe(Effect.exit))
    expectReasons(cause, originals[0])
    expectSqlFailures(cause, originals[0].reasons.length, ["no transaction is active"])
    expect(yield* db.all(sql`select id from entries`)).toEqual([{ id: 1 }])
    yield* db.transaction((tx) => tx.run(sql`insert into entries values (3)`))
    expect(yield* db.all(sql`select id from entries order by id`)).toEqual([{ id: 1 }, { id: 3 }])
  }))
})

test("deep nested rollback tries every RELEASE after real root rollback removed savepoints", async () => {
  await run(Effect.gen(function* () {
    const db = yield* makeDb
    const original = mixed("deep body")
    const cause = failure(yield* db.transaction((outer) => outer.transaction((inner) => inner.transaction((deep) =>
      deep.run(sql`rollback`).pipe(Effect.andThen(Effect.failCause(original))),
    ))).pipe(Effect.exit))
    expectReasons(cause, original)
    expectSqlFailures(cause, original.reasons.length, [
      "no such savepoint: effect_sql_2", "no such savepoint: effect_sql_2",
      "no such savepoint: effect_sql_1", "no such savepoint: effect_sql_1", "no transaction is active",
    ])
    yield* db.transaction((tx) => tx.run(sql`insert into entries values (1)`))
    expect(yield* db.all(sql`select id from entries`)).toEqual([{ id: 1 }])
  }))
})

test("real deferred foreign-key COMMIT failure rolls back rows and releases writer", async () => {
  await run(Effect.gen(function* () {
    const db = yield* makeDb
    yield* db.run(sql`pragma foreign_keys = on`)
    yield* db.run(sql`create table children (parent integer references entries(id) deferrable initially deferred)`)
    const cause = failure(yield* db.transaction((tx) => tx.run(sql`insert into children values (42)`)).pipe(Effect.exit))
    expectSqlFailures(cause, 0, ["FOREIGN KEY constraint failed"])
    expect(yield* db.all(sql`select * from children`)).toEqual([])
    yield* db.transaction((tx) => tx.run(sql`insert into entries values (42)`))
    yield* db.transaction((tx) => tx.run(sql`insert into children values (42)`))
    expect(yield* db.all(sql`select * from children`)).toEqual([{ parent: 42 }])
  }))
})

test("nested commit succeeds; failed RELEASE preserves each equal cleanup SQL reason", async () => {
  await run(Effect.gen(function* () {
    const db = yield* makeDb
    expect(yield* db.transaction((outer) => outer.transaction((inner) =>
      inner.run(sql`insert into entries values (1)`).pipe(Effect.as("nested commit")),
    ))).toBe("nested commit")
    const cause = failure(yield* db.transaction((outer) => outer.transaction((inner) =>
      inner.run(sql`release savepoint effect_sql_1`).pipe(Effect.as("must not succeed")),
    )).pipe(Effect.exit))
    expectSqlFailures(cause, 0, Array(3).fill("no such savepoint: effect_sql_1"))
    yield* db.transaction((tx) => tx.run(sql`insert into entries values (2)`))
    expect(yield* db.all(sql`select * from entries order by id`)).toEqual([{ id: 1 }, { id: 2 }])
  }))
})

// Bun SQLite exposes typed SQL faults, not arbitrary fatal COMMIT / lease-close exits.
// This explicit facade retains the real connection, reserve scope and writer semaphore.
const instrumentedDb = (plan: {
  control?: (query: string, execute: Effect.Effect<ReadonlyArray<unknown>, SqlError>) => Effect.Effect<ReadonlyArray<unknown>, SqlError>
  acquired?: Effect.Effect<void, SqlError>
  close?: Effect.Effect<void>
  closed: Exit.Exit<unknown, unknown>[]
  commands: string[]
}) => Effect.gen(function* () {
  const client = yield* SqlClient
  const reserve = client.reserve.pipe(Effect.flatMap((connection) => Effect.gen(function* () {
    yield* Effect.addFinalizer((exit) => Effect.sync(() => plan.closed.push(exit)).pipe(
      Effect.andThen(plan.close ?? Effect.void),
    ))
    yield* plan.acquired ?? Effect.void
    return {
      ...connection,
      executeUnprepared: (query, params, transform) => {
        plan.commands.push(query)
        const execute = connection.executeUnprepared(query, params, transform)
        return plan.control ? plan.control(query, execute) : execute
      },
    } satisfies Effect.Success<SqlClient["reserve"]>
  })))
  return yield* EffectDrizzleSqlite.makeWithDefaults().pipe(Effect.provideService(SqlClient, new Proxy(client, {
    get(target, property, receiver) {
      return property === "reserve" ? reserve : Reflect.get(target, property, receiver)
    },
  })))
})

test("fatal mixed COMMIT, ROLLBACK and scope-close exits all survive in order", async () => {
  await run(Effect.gen(function* () {
    const real = yield* makeDb
    yield* real.run(sql`pragma foreign_keys = on`)
    yield* real.run(sql`create table children (parent integer references entries(id) deferrable initially deferred)`)
    const commits: Cause.Cause<SqlError>[] = []
    const rollback = annotated(Cause.die({ phase: "rollback" }), "rollback")
    const close = annotated(Cause.combine(Cause.die({ phase: "close" }), Cause.interrupt(456)), "close")
    const closed: Exit.Exit<unknown, unknown>[] = []
    const commands: string[] = []
    const db = yield* instrumentedDb({ closed, commands, close: Effect.failCause(close), control: (query, execute) =>
      query === "commit" ? Effect.gen(function* () {
        const commit = annotated(Cause.combine(failure(yield* Effect.exit(execute)),
          Cause.combine(Cause.die({ phase: "commit" }), Cause.interrupt(321))), "commit")
        commits.push(commit)
        return yield* Effect.failCause(commit)
      }) : query === "rollback" ? execute.pipe(Effect.andThen(Effect.failCause(rollback))) : execute,
    })
    const cause = failure(yield* db.transaction((tx) => tx.run(sql`insert into children values (1)`).pipe(
      Effect.as("must not succeed"),
    )).pipe(Effect.exit))
    const commit = commits[0]
    expect(commit.reasons.map((reason) => reason._tag)).toEqual(["Fail", "Die", "Interrupt"])
    expectReasons(cause, commit)
    expectReasons(cause, rollback, commit.reasons.length)
    expectReasons(cause, close, commit.reasons.length + rollback.reasons.length)
    expect(cause.reasons.length).toBe(commit.reasons.length + rollback.reasons.length + close.reasons.length)
    expect(commands).toEqual(["begin deferred", "commit", "rollback"])
    expect(closed.length).toBe(1)
    expectReasons(failure(closed[0]), Cause.combine(commit, rollback))
    expect(yield* real.all(sql`select * from children`)).toEqual([])
    yield* real.transaction((tx) => tx.run(sql`insert into entries values (2)`))
  }))
})

test("real failed BEGIN closes reserve scope with its SQL failure before close defect", async () => {
  await run(Effect.gen(function* () {
    const real = yield* makeDb
    const close = annotated(Cause.die({ phase: "begin close" }), "close")
    const closed: Exit.Exit<unknown, unknown>[] = []
    const commands: string[] = []
    const db = yield* instrumentedDb({ closed, commands, close: Effect.failCause(close) })
    yield* real.run(sql`begin`)
    const cause = failure(yield* db.transaction(() => Effect.die("body must not run")).pipe(Effect.exit))
    expectSqlFailures(Cause.fromReasons(cause.reasons.slice(0, 1)), 0, ["within a transaction"])
    expectReasons(cause, close, 1)
    expect(cause.reasons.length).toBe(2)
    expect(closed.length).toBe(1)
    const beforeClose = failure(closed[0])
    expect(beforeClose.reasons.length).toBe(1)
    expect(cause.reasons[0] === beforeClose.reasons[0]).toBe(true)
    expect(commands).toEqual(["begin deferred"])
    yield* real.run(sql`rollback`)
    yield* real.transaction((tx) => tx.run(sql`insert into entries values (1)`))
  }))
})

test.each(["reserve", "begin", "body", "success"] as const)("%s exit closes lease once and joins scope-close failure", async (phase) => {
  await run(Effect.gen(function* () {
    const real = yield* makeDb
    const original = annotated(Cause.combine(Cause.die({ phase }), Cause.interrupt(777)), phase)
    const close = annotated(Cause.die({ phase: "close" }), "close")
    const closed: Exit.Exit<unknown, unknown>[] = []
    const commands: string[] = []
    const db = yield* instrumentedDb({ closed, commands, close: Effect.failCause(close),
      acquired: phase === "reserve" ? Effect.failCause(original) : undefined,
      control: (query, execute) => phase === "begin" && query === "begin deferred" ? Effect.failCause(original) : execute,
    })
    const cause = failure(yield* db.transaction(() => phase === "body"
      ? Effect.failCause(original) : Effect.succeed("ok")).pipe(Effect.exit))
    if (phase !== "success") expectReasons(cause, original)
    expectReasons(cause, close, phase === "success" ? 0 : original.reasons.length)
    expect(cause.reasons.length).toBe((phase === "success" ? 0 : original.reasons.length) + close.reasons.length)
    expect(closed.length).toBe(1)
    if (phase !== "success") expectReasons(failure(closed[0]), original)
    if (phase === "success") expect(Exit.isSuccess(closed[0])).toBe(true)
    expect(commands).toEqual(phase === "reserve" ? [] : phase === "begin" ? ["begin deferred"]
      : ["begin deferred", phase === "body" ? "rollback" : "commit"])
    yield* real.transaction((tx) => tx.run(sql`insert into entries values (1)`))
  }))
})

test("external interruption waits for masked rollback and scope-close completion", async () => {
  await run(Effect.gen(function* () {
    const real = yield* makeDb
    const rollingBack = yield* Deferred.make<void>()
    const allowRollback = yield* Deferred.make<void>()
    const closed: Exit.Exit<unknown, unknown>[] = []
    const commands: string[] = []
    const original = mixed("interrupted body")
    const db = yield* instrumentedDb({ closed, commands, control: (query, execute) => query === "rollback"
      ? Deferred.succeed(rollingBack, undefined).pipe(Effect.andThen(Deferred.await(allowRollback)), Effect.andThen(execute))
      : execute,
    })
    const fiber = yield* db.transaction((tx) => tx.run(sql`insert into entries values (1)`).pipe(
      Effect.andThen(Effect.failCause(original)),
    )).pipe(Effect.forkChild)
    yield* Deferred.await(rollingBack)
    const interrupter = yield* Fiber.interrupt(fiber).pipe(Effect.forkChild)
    yield* Effect.yieldNow
    expect(closed.length).toBe(0)
    yield* Deferred.succeed(allowRollback, undefined)
    yield* Fiber.join(interrupter)
    const cause = failure(yield* Fiber.await(fiber))
    expect(cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === marker)).toBe(true)
    expect(closed.length).toBe(1)
    expect(commands).toEqual(["begin deferred", "rollback"])
    expectReasons(failure(closed[0]), original)
    expect(yield* real.all(sql`select * from entries`)).toEqual([])
    yield* real.transaction((tx) => tx.run(sql`insert into entries values (2)`))
  }))
})
