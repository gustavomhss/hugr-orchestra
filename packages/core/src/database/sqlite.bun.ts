import { constants, Database, SQLiteError } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import * as Stream from "effect/Stream"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import * as Client from "effect/unstable/sql/SqlClient"
import type { Connection } from "effect/unstable/sql/SqlConnection"
import { classifySqliteError, SqlError } from "effect/unstable/sql/SqlError"
import * as Statement from "effect/unstable/sql/Statement"
import { Sqlite } from "./sqlite"

const ATTR_DB_SYSTEM_NAME = "db.system.name"
// Distinct SQL texts kept compiled per connection. Generated `IN (...)` lists make one text per list length.
const STATEMENT_LIMIT = 500

const TypeId = "~@orchestra/core/database/SqliteBun" as const
type TypeId = typeof TypeId

interface SqliteClient extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: Config
  readonly export: Effect.Effect<Uint8Array, SqlError>
  readonly loadExtension: (path: string) => Effect.Effect<void, SqlError>
  readonly updateValues: never
}

interface Config {
  readonly filename: string
  readonly readonly?: boolean
  readonly create?: boolean
  readonly readwrite?: boolean
  readonly disableWAL?: boolean
  readonly spanAttributes?: Record<string, unknown>
  readonly transformResultNames?: (str: string) => string
  readonly transformQueryNames?: (str: string) => string
}

interface SqliteConnection extends Connection {
  readonly export: Effect.Effect<Uint8Array, SqlError>
  readonly loadExtension: (path: string) => Effect.Effect<void, SqlError>
}

const make = (options: Config) =>
  Effect.gen(function* () {
    const native = (yield* Sqlite.Native) as Database

    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames)
    const transformRows = options.transformResultNames
      ? Statement.defaultTransforms(options.transformResultNames).array
      : undefined

    // Bun's `query` caches only the first 20 statements it compiles and leaves the rest to the garbage collector, and
    // a statement still open keeps the database file open after `close` (Windows then refuses to remove it). The
    // adapter therefore owns every statement it runs: it reuses them by SQL text, finalizes the least recently used one
    // past STATEMENT_LIMIT, and finalizes all of them before the connection closes.
    const statements = new Map<string, ReturnType<Database["prepare"]>>()
    const prepare = (query: string) => {
      const cached = statements.get(query)
      // Map order is recency order: a reused statement moves to the end, so the first entry is the one to evict.
      statements.delete(query)
      const statement = cached ?? native.prepare(query)
      statements.set(query, statement)
      if (statements.size <= STATEMENT_LIMIT) return statement
      const oldest = statements.entries().next().value
      if (!oldest) return statement
      statements.delete(oldest[0])
      oldest[1].finalize()
      return statement
    }
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        statements.forEach((statement) => statement.finalize())
        statements.clear()
      }).pipe(
        // With every statement finalized the strict close succeeds and releases the file at once. A refusal means
        // something outside the adapter left a statement open; the native layer's own close runs after this one.
        Effect.andThen(
          Effect.try({ try: () => native.close(true), catch: (cause) => cause }).pipe(
            Effect.catch((cause) => Effect.logWarning("database closed with a statement still open", { cause })),
          ),
        ),
      ),
    )

    const run = (query: string, params: ReadonlyArray<unknown> = []) =>
      Effect.withFiber<Array<Record<string, unknown>>, SqlError>((fiber) =>
        Effect.try({
          try: () => {
            const statement = prepare(query)
            // @ts-ignore bun-types missing safeIntegers method, fixed in https://github.com/oven-sh/bun/pull/26627
            statement.safeIntegers(Context.get(fiber.context, Client.SafeIntegers))
            return (statement.all(...(params as Parameters<typeof statement.all>)) ?? []) as Array<Record<string, unknown>>
          },
          catch: (cause) => {
            // Only native SQLite failures belong in the typed channel; programming errors remain defects.
            if (!(cause instanceof SQLiteError)) throw cause
            return new SqlError({
              reason: classifySqliteError(cause, { message: "Failed to execute statement", operation: "execute" }),
            })
          },
        }),
      )

    const runValues = (query: string, params: ReadonlyArray<unknown> = []) =>
      Effect.withFiber<Array<unknown[]>, SqlError>((fiber) =>
        Effect.try({
          try: () => {
            const statement = prepare(query)
            // @ts-ignore bun-types missing safeIntegers method, fixed in https://github.com/oven-sh/bun/pull/26627
            statement.safeIntegers(Context.get(fiber.context, Client.SafeIntegers))
            return (statement.values(...(params as Parameters<typeof statement.values>)) ?? []) as Array<unknown[]>
          },
          catch: (cause) => {
            if (!(cause instanceof SQLiteError)) throw cause
            return new SqlError({
              reason: classifySqliteError(cause, { message: "Failed to execute statement", operation: "execute" }),
            })
          },
        }),
      )

    const connection = identity<SqliteConnection>({
      execute(query, params, transformRows) {
        return transformRows ? Effect.map(run(query, params), transformRows) : run(query, params)
      },
      executeRaw(query, params) {
        return run(query, params)
      },
      executeValues(query, params) {
        return runValues(query, params)
      },
      executeUnprepared(query, params, transformRows) {
        return this.execute(query, params, transformRows)
      },
      executeStream() {
        return Stream.die("executeStream not implemented")
      },
      export: Effect.try({
        try: () => native.serialize(),
        catch: (cause) =>
          new SqlError({
            reason: classifySqliteError(cause, { message: "Failed to export database", operation: "export" }),
          }),
      }),
      loadExtension: (path) =>
        Effect.try({
          try: () => native.loadExtension(path),
          catch: (cause) =>
            new SqlError({
              reason: classifySqliteError(cause, { message: "Failed to load extension", operation: "loadExtension" }),
            }),
        }),
    })

    const semaphore = yield* Semaphore.make(1)
    const acquirer = semaphore.withPermits(1)(Effect.succeed(connection))
    const transactionAcquirer = Effect.uninterruptibleMask((restore) => {
      const fiber = Fiber.getCurrent()!
      const scope = Context.getUnsafe(fiber.context, Scope.Scope)
      return Effect.as(
        Effect.tap(restore(semaphore.take(1)), () => Scope.addFinalizer(scope, semaphore.release(1))),
        connection,
      )
    })

    const client = Object.assign(
      (yield* Client.make({
        acquirer,
        compiler,
        transactionAcquirer,
        spanAttributes: [
          ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
          [ATTR_DB_SYSTEM_NAME, "sqlite"],
        ],
        transformRows,
      })) as SqliteClient,
      {
        [TypeId]: TypeId,
        config: options,
        export: Effect.flatMap(acquirer, (_) => _.export),
        loadExtension: (path: string) => Effect.flatMap(acquirer, (_) => _.loadExtension(path)),
      },
    )

    return client
  })

const nativeLayer = (config: Config) =>
  Layer.effect(
    Sqlite.Native,
    Effect.gen(function* () {
      // A `file:` URI name (immutable release reads) needs SQLITE_OPEN_URI: Bun's bundled SQLite on Linux and Windows
      // does not enable URI names by default, unlike the macOS system SQLite.
      const native = config.filename.startsWith("file:")
        ? new Database(
            config.filename,
            constants.SQLITE_OPEN_URI |
              (config.readonly
                ? constants.SQLITE_OPEN_READONLY
                : constants.SQLITE_OPEN_READWRITE | (config.create === false ? 0 : constants.SQLITE_OPEN_CREATE)),
          )
        : new Database(config.filename, {
            readonly: config.readonly,
            readwrite: config.readwrite ?? true,
            create: config.create ?? true,
          })
      yield* Effect.addFinalizer(() => Effect.sync(() => native.close()))
      if (config.disableWAL !== true) native.run("PRAGMA journal_mode = WAL;")
      return native
    }),
  )

const sqliteLayer = (config: Config) => Layer.effect(Client.SqlClient, make(config))

const drizzleLayer = Layer.effect(
  Sqlite.Drizzle,
  Effect.gen(function* () {
    return drizzle({ client: (yield* Sqlite.Native) as Database })
  }),
)

export const layer = (config: Config) => {
  const native = nativeLayer(config)
  return Layer.merge(native, Layer.merge(sqliteLayer(config), drizzleLayer).pipe(Layer.provide(native))).pipe(
    Layer.provide(Reactivity.layer),
  )
}
