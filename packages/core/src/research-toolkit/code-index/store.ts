export * as CodeIndexStore from "./store"

import { createHash, randomUUID } from "node:crypto"
import { readdir, realpath, rename, rm, stat, mkdir } from "node:fs/promises"
import path from "node:path"
import { Deferred, Effect, Exit } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { layer } from "#sqlite"
import { Research } from "@orchestra/schema/research"
import { CodeIndexRank } from "./rank"
import { CodeIndex } from "./types"

// J2.3 location and atomic writes, J2.4 retention. One SQLite file per shard key under
// <Root>/index/<repoKey>/<shardKey>.sqlite, through core's SQLite layer; nothing is written inside the worktree.

/**
 * What the extraction layers (X1 SCIP ⋈ X2 tree-sitter) hand the store for one shard. Lines are 1-based and closed;
 * `col`/`endCol` are 0-based UTF-16 offsets as SCIP declares them, end exclusive. Symbol ids are the producer's and
 * only need to be unique within the shard: occurrences, relations and containers refer to them. A symbol defined in
 * another shard and referenced here still gets a row (its `scip` and definition path): queries join occurrences to
 * symbols by `scip` across shards, and treat a row as a definition only when its path is one of the shard's documents.
 */
export type Content = {
  readonly documents: ReadonlyArray<{
    readonly path: string; readonly language: string; readonly sha256: string; readonly lines: number
    readonly bytes: number; readonly layer: 1 | 2
  }>
  readonly symbols: ReadonlyArray<{
    readonly id: number; readonly scip?: string; readonly name: string; readonly kind: string; readonly path: string
    readonly startLine: number; readonly endLine: number; readonly nameLine: number; readonly exported: boolean
    readonly containerId?: number
  }>
  readonly occurrences: ReadonlyArray<{
    readonly symbolId: number; readonly path: string; readonly line: number; readonly col: number
    readonly endLine: number; readonly endCol: number; readonly role: number; readonly enclosingId?: number
    readonly opaque: boolean
  }>
  readonly relations: ReadonlyArray<{ readonly symbolId: number; readonly targetId: number; readonly kind: (typeof CodeIndex.RelationKind)[number] }>
  readonly imports: ReadonlyArray<{
    readonly fromPath: string; readonly line: number; readonly specifier: string; readonly toPath?: string
    readonly kind: (typeof CodeIndex.ImportKind)[number]
  }>
  /** Named gaps (binary, non-UTF-8, over the byte cap, generated...), surfaced as coverage.skipped. */
  readonly skipped: ReadonlyArray<{ readonly path: string; readonly reason: string }>
}

export type Meta = { readonly shardKey: string; readonly commit: string; readonly indexer: string; readonly version: string }

export type Entry = {
  readonly commit: string
  readonly at: number
  readonly shards: ReadonlyArray<{ readonly id: string; readonly key: string }>
}

// The frozen schema has no secondary indexes; these keep a warm query under J2.10's 300 ms.
const INDEXES = [
  "CREATE INDEX symbol_by_name ON symbol (name)",
  "CREATE INDEX symbol_by_path ON symbol (path, start_line)",
  "CREATE INDEX occurrence_by_symbol ON occurrence (symbol_id)",
  "CREATE INDEX occurrence_by_path ON occurrence (path, line)",
  "CREATE INDEX occurrence_by_enclosing ON occurrence (enclosing_id)",
  "CREATE INDEX relation_by_target ON relation (target_id)",
  "CREATE INDEX import_by_from ON import (from_path)",
  "CREATE INDEX import_by_to ON import (to_path)",
]
const MANIFEST = "commits.json"
const CHUNK = 400

/** sha256 of the real git common dir, so every worktree of one repository shares its shards (J2.3). */
export const repoKey = (commonDir: string) =>
  Effect.promise(() => realpath(commonDir)).pipe(Effect.map((real) => createHash("sha256").update(real).digest("hex")))

export const directory = (root: string, repo: string) => path.join(root, "index", repo)

export const file = (dir: string, shardKey: string) => path.join(dir, `${shardKey}.sqlite`)

export const exists = (dir: string, shardKey: string) => Effect.promise(() => Bun.file(file(dir, shardKey)).exists())

/** The camelCase and snake_case parts of a name, lowercased: the FTS `tokens` column. */
export const tokens = (name: string) =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.toLowerCase()).join(" ")

// Process-local single flight per shard (store root + shard key): the indexer runs once for a shard whether the
// warm-up or a query asked for it, and the others await that run. The last failure stays until a build succeeds.
const flights = new Map<string, Deferred.Deferred<void, string>>()
const failures = new Map<string, string>()
const flightKey = (root: string, shardKey: string) => `${root}\0${shardKey}`

/**
 * Run `work` unless the same shard is already being built in this process, in which case await that build. A failure
 * is remembered as `failure` (and a joiner fails with `join(reason)`), so the next caller retries and the cause shows.
 */
export const singleFlight = <E>(
  root: string,
  shardKey: string,
  work: Effect.Effect<void, E>,
  adapt: { readonly describe: (error: E) => string; readonly join: (reason: string) => E },
): Effect.Effect<void, E> =>
  Effect.gen(function* () {
    const key = flightKey(root, shardKey)
    const mine = yield* Deferred.make<void, string>()
    // Checked and claimed in one synchronous step, so two callers cannot both own the build.
    const running = yield* Effect.sync(() => {
      const existing = flights.get(key)
      if (!existing) flights.set(key, mine)
      return existing
    })
    if (running) return yield* Deferred.await(running).pipe(Effect.mapError(adapt.join))
    return yield* work.pipe(
      Effect.tapError((error) => Effect.sync(() => failures.set(key, adapt.describe(error)))),
      Effect.tap(() => Effect.sync(() => failures.delete(key))),
      Effect.onExit((exit) => Effect.sync(() => flights.delete(key)).pipe(
        Effect.andThen(Deferred.done(mine, Exit.isSuccess(exit) ? Exit.succeed(undefined) : Exit.fail(failures.get(key) ?? "interrupted")))),
      ),
    )
  })

/** Whether this process is building the shard now. */
export const building = (root: string, shardKey: string) => flights.has(flightKey(root, shardKey))

/** Why the shard's last build in this process failed, until a later build succeeds. */
export const failure = (root: string, shardKey: string) => failures.get(flightKey(root, shardKey))

/** Write a whole shard to a temporary file and rename it into place, as pinned-artifact.ts does (J2.3). */
export const write = Effect.fn("CodeIndexStore.write")(function* (dir: string, meta: Meta, content: Content) {
  yield* Effect.promise(() => mkdir(dir, { recursive: true }))
  const temporary = path.join(dir, `.${meta.shardKey}.${randomUUID()}.tmp`)
  yield* Effect.gen(function* () {
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* Effect.forEach([...statements(CodeIndex.SCHEMA), ...INDEXES], (statement) => sql.unsafe(statement), { discard: true })
      yield* sql.withTransaction(Effect.gen(function* () {
        yield* insert(sql, "document", ["path", "language", "sha256", "lines", "layer"],
          content.documents.map((row) => [row.path, row.language, row.sha256, row.lines, row.layer]))
        yield* insert(sql, "symbol", ["id", "scip", "name", "kind", "path", "start_line", "end_line", "name_line", "exported", "container_id", "tokens"],
          content.symbols.map((row) => [row.id, row.scip ?? null, row.name, row.kind, row.path, row.startLine, row.endLine,
            row.nameLine, row.exported ? 1 : 0, row.containerId ?? null, tokens(row.name)]))
        yield* insert(sql, "occurrence", ["symbol_id", "path", "line", "col", "end_line", "end_col", "role", "enclosing_id", "opaque"],
          content.occurrences.map((row) => [row.symbolId, row.path, row.line, row.col, row.endLine, row.endCol, row.role,
            row.enclosingId ?? null, row.opaque ? 1 : 0]))
        yield* insert(sql, "relation", ["symbol_id", "target_id", "kind"], content.relations.map((row) => [row.symbolId, row.targetId, row.kind]))
        yield* insert(sql, "import", ["from_path", "line", "specifier", "to_path", "kind"],
          content.imports.map((row) => [row.fromPath, row.line, row.specifier, row.toPath ?? null, row.kind]))
        yield* insert(sql, "file_rank", ["path", "rank", "loc", "bytes"],
          ranks(content).map((row) => [row.path, row.rank, row.loc, row.bytes]))
        yield* insert(sql, "meta", ["key", "value"], [
          ["shardKey", meta.shardKey], ["commit", meta.commit], ["indexer", meta.indexer], ["version", meta.version],
          ["skipped", JSON.stringify(content.skipped)],
        ])
        yield* sql.unsafe("INSERT INTO symbol_name (symbol_name) VALUES ('rebuild')")
      }))
    }).pipe(Effect.provide(layer({ filename: temporary, disableWAL: true })), Effect.scoped)
    yield* Effect.promise(() => rename(temporary, file(dir, meta.shardKey)))
  }).pipe(
    Effect.mapError((cause) => new Research.Error({ code: "index_unavailable", message: `Shard ${meta.shardKey} could not be written: ${String(cause)}` })),
    Effect.ensuring(Effect.promise(() => rm(temporary, { force: true }))),
  )
})

/** Run `effect` against one shard opened read-only; the connection closes when it ends. */
export const read = <A, E>(dir: string, shardKey: string, effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  effect.pipe(
    Effect.provide(layer({ filename: file(dir, shardKey), readonly: true, readwrite: false, create: false, disableWAL: true })),
    Effect.scoped,
    Effect.mapError((cause) => cause instanceof Research.Error ? cause
      : new Research.Error({ code: "index_unavailable", message: `Shard ${shardKey} could not be read: ${String(cause)}` })),
  )

export const records = (dir: string) =>
  Effect.promise(() => Bun.file(path.join(dir, MANIFEST)).json().then((value: ReadonlyArray<Entry>) => value, () => [] as ReadonlyArray<Entry>))

/**
 * J2.4: put the commit first, keep at most `limits.commits` commits, then drop the least recently used commits until
 * the shards they alone hold fit `limits.bytes`. The newest commit is always kept. Returns the removed shard keys.
 */
export const retain = Effect.fn("CodeIndexStore.retain")(function* (
  dir: string,
  record: Entry,
  limits: { readonly commits: number; readonly bytes: number },
) {
  const previous = yield* records(dir)
  const ordered = [record, ...previous.filter((entry) => entry.commit !== record.commit)].slice(0, Math.max(1, limits.commits))
  const sizes = new Map(yield* Effect.promise(() => readdir(dir).then((names) => Promise.all(names
    .filter((name) => name.endsWith(".sqlite"))
    .map((name) => stat(path.join(dir, name)).then((info) => [name.slice(0, -".sqlite".length), info.size] as const, () => [name.slice(0, -".sqlite".length), 0] as const))))))
  const kept = fit(ordered, sizes, limits.bytes)
  const live = new Set(kept.flatMap((entry) => entry.shards.map((shard) => shard.key)))
  const removed = [...sizes.keys()].filter((key) => !live.has(key))
  yield* Effect.promise(() => Promise.all(removed.map((key) => rm(file(dir, key), { force: true }))))
  yield* save(dir, kept)
  return removed
})

/** Mark a commit most recently used without touching its shards. */
export const touch = Effect.fn("CodeIndexStore.touch")(function* (dir: string, commit: string) {
  const previous = yield* records(dir)
  const found = previous.find((entry) => entry.commit === commit)
  if (!found || previous[0]?.commit === commit) return
  yield* save(dir, [{ ...found, at: Date.now() }, ...previous.filter((entry) => entry !== found)])
})

function fit(ordered: ReadonlyArray<Entry>, sizes: ReadonlyMap<string, number>, bytes: number): ReadonlyArray<Entry> {
  const total = [...new Set(ordered.flatMap((entry) => entry.shards.map((shard) => shard.key)))]
    .reduce((sum, key) => sum + (sizes.get(key) ?? 0), 0)
  if (total <= bytes || ordered.length <= 1) return ordered
  return fit(ordered.slice(0, -1), sizes, bytes)
}

const save = (dir: string, entries: ReadonlyArray<Entry>) =>
  Effect.promise(async () => {
    const temporary = path.join(dir, `.${MANIFEST}.${randomUUID()}.tmp`)
    await Bun.write(temporary, JSON.stringify(entries))
    await rename(temporary, path.join(dir, MANIFEST))
  })

function insert(sql: SqlClient.SqlClient, table: string, columns: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<unknown>>) {
  const chunks = Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, index) => rows.slice(index * CHUNK, (index + 1) * CHUNK))
  const values = `(${columns.map(() => "?").join(", ")})`
  return Effect.forEach(chunks, (chunk) =>
    sql.unsafe(`INSERT INTO "${table}" (${columns.join(", ")}) VALUES ${chunk.map(() => values).join(", ")}`, chunk.flat()),
  { discard: true })
}

const statements = (schema: string) => schema.split(";").map((statement) => statement.trim()).filter(Boolean)

// file_rank is computed here, once per build, so every producer gets the same T-X7 rank.
function ranks(content: Content) {
  return CodeIndexRank.ranks(
    content.documents.map((document) => ({ path: document.path, lines: document.lines, bytes: document.bytes })),
    content.imports,
  )
}
