export * as CodeIndexQuery from "./query"

import { createHash } from "node:crypto"
import { realpath } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Research } from "@orchestra/schema/research"
import { AppProcess } from "../../process"
import { CodeIndexBuild } from "./build"
import { CodeIndexRank } from "./rank"
import { CodeIndexShard } from "./shard"
import { CodeIndexStore } from "./store"
import { CodeIndex } from "./types"

// J2.8-J2.12: code_query over the per-commit shards, with the dirty-tree overlay, stale fallback, named failures and
// the JT.1 basis. Name search ranks with FTS5 bm25(); the map ranks files by the build's PageRank (T-X7, T-X8).

export type OverlaySymbol = {
  readonly name: string; readonly kind: string; readonly startLine: number; readonly endLine: number
  readonly nameLine: number; readonly exported: boolean
}

/** The structural layer (X2 tree-sitter) over the worktree's current content of dirty files (J2.8). */
export type Overlay = (input: {
  readonly root: string
  readonly shard: CodeIndexShard.Shard
  readonly paths: ReadonlyArray<string>
}) => Effect.Effect<ReadonlyArray<{ readonly path: string; readonly lines: number; readonly symbols: ReadonlyArray<OverlaySymbol> }>, Research.Error>

export type Context = CodeIndexBuild.Input & {
  readonly overlay: Overlay
  /** When present, a query that finds shards missing starts their build in the background. */
  readonly extract?: CodeIndexBuild.Extract
  readonly maxBytes?: number
}

/**
 * The `code_query` engine in the shape of the orchestra tool's `Engine` service (O/tool/code-query.ts):
 * `Layer.effect(Engine, CodeIndexQuery.engine(deps))`. Git runs through AppProcess with the J2.14 environment.
 */
export const engine = (deps: Omit<Context, "root" | "git">) =>
  Effect.gen(function* () {
    const proc = yield* AppProcess.Service
    return {
      query: (worktree: string, input: CodeIndex.CodeQuery) =>
        Effect.gen(function* () {
          const root = yield* Effect.tryPromise({
            try: () => realpath(worktree),
            catch: () => new Research.Error({ code: "reference_invalid", message: "Bound worktree does not exist" }),
          })
          const git = yield* CodeIndexShard.live(root).pipe(Effect.provideService(AppProcess.Service, proc))
          return yield* run({ ...deps, root, git }, input)
        }),
    }
  })

const DEFAULT_LIMIT = 50
const CANDIDATES = 20
const SKIPPED_LIMIT = 200

type Row = {
  id: number; scip: string | null; name: string; kind: string; path: string; start_line: number; end_line: number
  name_line: number; exported: number; container_id: number | null
}
// An occurrence with its enclosing definition (LEFT JOIN: the symbol columns are null for a top-level site).
type SiteRow = Omit<Row, "id"> & {
  id: number | null; site_path: string; site_line: number; site_end: number; site_role: number; site_opaque: number
}
type Ready = { readonly planned: CodeIndexBuild.Planned; readonly key: string; readonly stale?: string }
type Found = { readonly ref: CodeIndex.SymbolRef; readonly shard?: Ready; readonly id?: number; readonly scip?: string }
type Scope = {
  readonly plan: CodeIndexBuild.Plan
  readonly ready: ReadonlyArray<Ready>
  readonly dirty: ReadonlySet<string>
  readonly overlay: ReadonlyMap<string, { readonly lines: number; readonly symbols: ReadonlyArray<CodeIndex.SymbolRef> }>
  readonly skipped: Array<{ readonly path: string; readonly reason: string }>
  readonly dirtyDigest?: string
}
type Findings = { readonly resolved?: Found; readonly candidates: ReadonlyArray<CodeIndex.SymbolRef>; readonly hits: ReadonlyArray<CodeIndex.Hit> }

export const run = Effect.fn("CodeIndexQuery.run")(function* (ctx: Context, input: CodeIndex.CodeQuery) {
  const started = performance.now()
  const query = normalize(ctx.root, input)
  if (!query) return yield* new Research.Error({ code: "reference_invalid", message: "Query path is outside the bound worktree" })
  if (Object.keys(ctx.indexers).length === 0)
    return yield* new Research.Error({ code: "index_unavailable", message: "No research index pack is ready on this machine" })
  const plan = yield* CodeIndexBuild.plan(ctx)
  // Only path-scoped operations narrow the shards (J2.10); a symbol's references may live in any shard.
  const prefix = query.op === "imports" || query.op === "symbols" || query.op === "map" ? query.path : undefined
  const scope = yield* open(ctx, plan, inScope(plan, prefix ?? (query.op === "definition" ? query.path : undefined)))
  const limit = "limit" in query && query.limit !== undefined ? query.limit : DEFAULT_LIMIT
  const offset = "offset" in query && query.offset !== undefined ? query.offset : 0
  const findings = yield* execute(scope, query)
  const page = findings.hits.slice(offset, offset + limit)
  const documents = yield* count(scope, prefix)
  const languagesMissing = [...new Set(plan.unindexed.filter((shard) => covers(shard.project, prefix)).map((shard) => shard.language))]
  const skipped = [
    ...scope.skipped,
    ...plan.orphans.filter((file) => within(file, prefix)).map((file) => ({ path: file, reason: "no-project" })),
    ...(yield* recorded(scope, prefix)),
  ]
  const paths = [findings.resolved?.ref.range.path, ...findings.candidates.map((ref) => ref.range.path), ...page.map((hit) => hit.range.path)]
  const result: CodeIndex.CodeQueryResult = {
    resolved: findings.resolved?.ref,
    candidates: findings.candidates,
    hits: page,
    ...(offset + limit < findings.hits.length ? { next: offset + limit } : {}),
    basis: {
      basis: {
        commit: plan.commit,
        ...(scope.dirtyDigest ? { dirtyDigest: scope.dirtyDigest } : {}),
        shards: scope.ready.map((ready) => ({
          id: ready.planned.shard.id, language: ready.planned.shard.language, project: ready.planned.shard.project,
          indexer: ready.planned.indexer.id, version: ready.planned.indexer.version,
        })),
      },
      execution: { op: query.op, ms: Math.round(performance.now() - started) },
      coverage: {
        documents,
        skipped: skipped.length > SKIPPED_LIMIT
          ? [...skipped.slice(0, SKIPPED_LIMIT), { path: "*", reason: `${skipped.length - SKIPPED_LIMIT} more skipped paths` }]
          : skipped,
        languagesMissing,
        opaqueSites: findings.hits.filter((hit) => hit.opaque).reduce((sum, hit) => sum + (hit.sites?.length ?? 1), 0),
        complete: skipped.length === 0 && languagesMissing.length === 0,
      },
      freshness: scope.ready.some((ready) => ready.stale) ? "stale"
        : paths.some((file) => file !== undefined && scope.dirty.has(file)) ? "dirty-overlay" : "fresh",
      bounds: { limit, truncated: offset + limit < findings.hits.length },
    },
  }
  return result
})

// Every path the caller names is resolved against the worktree; one that leaves it is reference_invalid (J2.12).
function normalize(root: string, query: CodeIndex.CodeQuery): CodeIndex.CodeQuery | undefined {
  const relative = (file: string) => {
    const result = path.relative(root, path.resolve(root, file)).replaceAll("\\", "/")
    if (result === "") return "."
    return result === ".." || result.startsWith("../") || path.isAbsolute(result) ? undefined : result
  }
  const next = { ...query } as CodeIndex.CodeQuery & { path?: string; at?: { path: string; line: number; column?: number } }
  if (next.path !== undefined) {
    const file = relative(next.path)
    if (file === undefined) return undefined
    next.path = file
  }
  if (next.at !== undefined) {
    const file = relative(next.at.path)
    if (file === undefined) return undefined
    next.at = { ...next.at, path: file }
  }
  return next
}

const within = (file: string, prefix: string | undefined) =>
  prefix === undefined || prefix === "." || file === prefix || file.startsWith(prefix + "/")

// A shard covers a scope when the scope is inside the project or the project is inside the scope.
const covers = (project: string, prefix: string | undefined) =>
  prefix === undefined || project === "." || within(project, prefix) || within(prefix, project)

function inScope(plan: CodeIndexBuild.Plan, prefix: string | undefined) {
  if (prefix === undefined) return plan.shards
  const file = plan.shards.filter((planned) => planned.shard.files.includes(prefix))
  if (file.length > 0) return file
  return plan.shards.filter((planned) => planned.shard.files.some((entry) => within(entry, prefix)) ||
    (CodeIndexShard.language(prefix) === planned.shard.language && within(prefix, planned.shard.project)))
}

/**
 * Pick each shard's file: the current key, else the newest retained key for the same shard while it rebuilds
 * (`stale`, J2.11). With nothing usable the query fails index_building or index_unavailable, never empty (J2.12).
 */
function open(ctx: Context, plan: CodeIndexBuild.Plan, shards: ReadonlyArray<CodeIndexBuild.Planned>) {
  return Effect.gen(function* () {
    if (shards.length === 0)
      return yield* new Research.Error({ code: "index_unavailable", message: "No supported language with a ready indexer in this scope" })
    const records = yield* CodeIndexStore.records(plan.dir)
    const skipped: Array<{ path: string; reason: string }> = []
    const choices = yield* Effect.forEach(shards, (planned) => Effect.gen(function* () {
      if (yield* CodeIndexStore.exists(plan.dir, planned.key)) return { planned, key: planned.key } satisfies Ready
      const previous = records.flatMap((record) => record.shards
        .filter((shard) => shard.id === planned.shard.id && shard.key !== planned.key)
        .map((shard) => ({ commit: record.commit, key: shard.key })))
      const present = yield* Effect.forEach(previous, (entry) => CodeIndexStore.exists(plan.dir, entry.key))
      const fallback = previous.find((_, index) => present[index])
      if (fallback) return { planned, key: fallback.key, stale: fallback.commit } satisfies Ready
      skipped.push({ path: planned.shard.project, reason: "index-building" })
      return undefined
    }))
    const missing = choices.some((choice) => choice === undefined || choice.stale)
    const progress = CodeIndexBuild.building(plan.dir)
    if (missing && !progress && ctx.extract)
      yield* Effect.forkDetach(CodeIndexBuild.build({ ...ctx, extract: ctx.extract }).pipe(Effect.ignore))
    const ready = choices.filter((choice): choice is NonNullable<typeof choice> => choice !== undefined)
    if (ready.length === 0) {
      if (progress || ctx.extract)
        return yield* new Research.Error({ code: "index_building", message:
          `Index is building: shardsDone ${progress?.shardsDone ?? 0} of shardsTotal ${progress?.shardsTotal ?? shards.length}` })
      return yield* new Research.Error({ code: "index_unavailable", message: "Index has not been built for this commit" })
    }
    if (!missing) yield* CodeIndexStore.touch(plan.dir, plan.commit)
    const stale = [...new Set(ready.flatMap((choice) => choice.stale ? [choice.stale] : []))]
    const changes = new Set((yield* Effect.forEach(stale, (from) => CodeIndexShard.changed(ctx.git, from, plan.commit))).flat())
    ready.filter((choice) => choice.stale).forEach((choice) =>
      choice.planned.shard.files.filter((file) => changes.has(file)).forEach((file) => skipped.push({ path: file, reason: "changed-since-index" })))
    return yield* overlay(ctx, plan, ready, skipped)
  })
}

// J2.8: modified and untracked files of the scope's shards are re-read by the structural layer.
function overlay(ctx: Context, plan: CodeIndexBuild.Plan, ready: ReadonlyArray<Ready>, skipped: Array<{ path: string; reason: string }>) {
  return Effect.gen(function* () {
    const changes = yield* CodeIndexShard.dirty(ctx.git)
    const owner = (file: string) => ready
      .filter((choice) => choice.planned.shard.files.includes(file) ||
        (CodeIndexShard.language(file) === choice.planned.shard.language && within(file, choice.planned.shard.project)))
      .sort((a, b) => b.planned.shard.project.length - a.planned.shard.project.length)[0]
    const owned = changes.flatMap((change) => {
      const choice = owner(change.path)
      return choice ? [{ ...change, choice }] : []
    })
    const groups = Map.groupBy(owned.filter((change) => !change.deleted), (change) => change.choice)
    const files = (yield* Effect.forEach([...groups], ([choice, entries]) =>
      ctx.overlay({ root: ctx.root, shard: choice.planned.shard, paths: entries.map((entry) => entry.path) }))).flat()
    const digest = owned.length === 0 ? undefined : yield* Effect.promise(async () => {
      const hash = createHash("sha256")
      for (const change of owned.toSorted((a, b) => a.path.localeCompare(b.path)))
        hash.update(change.path).update("\0").update(change.deleted ? "deleted" : new Uint8Array(await Bun.file(path.join(ctx.root, change.path)).arrayBuffer().catch(() => new ArrayBuffer(0)))).update("\0")
      return hash.digest("hex")
    })
    return {
      plan, ready, skipped, dirty: new Set(owned.map((change) => change.path)),
      ...(digest ? { dirtyDigest: digest } : {}),
      overlay: new Map(files.map((entry) => [entry.path, {
        lines: entry.lines,
        symbols: entry.symbols.map((symbol): CodeIndex.SymbolRef => ({
          symbol: `overlay:${entry.path}:${symbol.startLine}:${symbol.name}`, name: symbol.name, kind: symbol.kind,
          range: { path: entry.path, startLine: symbol.startLine, endLine: symbol.endLine },
          nameLine: symbol.nameLine, exported: symbol.exported,
        })),
      }])),
    } satisfies Scope
  })
}

function execute(scope: Scope, query: CodeIndex.CodeQuery): Effect.Effect<Findings, Research.Error> {
  switch (query.op) {
    case "imports":
      return each(scope, (sql) => sql.unsafe<{ from_path: string; line: number; specifier: string; to_path: string | null; kind: string }>(
        `SELECT from_path, line, specifier, to_path, kind FROM import WHERE from_path = ? ORDER BY line`, [query.path]))
        .pipe(Effect.map((rows) => ({ candidates: [], hits: sorted(rows.flatMap((entry) => entry.rows).map((row) => moduleHit(row.from_path, row.line, row))) })))
    case "importers":
      return each(scope, (sql) => sql.unsafe<{ from_path: string; line: number; specifier: string; to_path: string | null; kind: string }>(
        `SELECT from_path, line, specifier, to_path, kind FROM import WHERE to_path = ? ORDER BY from_path, line`, [query.path]))
        .pipe(Effect.map((rows) => ({ candidates: [], hits: sorted(rows.flatMap((entry) => entry.rows).map((row) => moduleHit(row.from_path, row.line, row))) })))
    case "symbols":
      return symbols(scope, query)
    case "map":
      return map(scope, query)
    default:
      return Effect.gen(function* () {
        const found = yield* resolve(scope, query)
        if (!found.resolved) return { candidates: found.candidates, hits: [] } satisfies Findings
        const resolved = found.resolved
        if (query.op === "definition")
          return { resolved, candidates: [], hits: [{ range: resolved.ref.range, role: "definition", via: resolved.ref }] } satisfies Findings
        return { resolved, candidates: [], hits: yield* related(scope, resolved, query.op) } satisfies Findings
      })
  }
}

type Target = { readonly name?: string; readonly path?: string; readonly symbol?: string; readonly at?: { readonly path: string; readonly line: number; readonly column?: number } }

/** One definition for the target, or the candidates when it is ambiguous or absent (bm25-ranked, at most 20). */
function resolve(scope: Scope, target: Target): Effect.Effect<{ resolved?: Found; candidates: ReadonlyArray<CodeIndex.SymbolRef> }, Research.Error> {
  return Effect.gen(function* () {
    const overlaid = [...scope.overlay.values()].flatMap((entry) => entry.symbols)
    if (target.symbol?.startsWith("overlay:")) {
      const ref = overlaid.find((symbol) => symbol.symbol === target.symbol)
      return ref ? { resolved: { ref }, candidates: [] } : { candidates: [] }
    }
    if (target.at) {
      const at = target.at
      const local = scope.overlay.get(at.path)?.symbols.filter((symbol) => symbol.range.startLine <= at.line && symbol.range.endLine >= at.line)
        .sort((a, b) => (a.range.endLine - a.range.startLine) - (b.range.endLine - b.range.startLine))[0]
      if (local) return { resolved: { ref: local }, candidates: [] }
      const found = (yield* each(scope, (sql) => at.column === undefined
        ? sql.unsafe<Row>(`SELECT s.* FROM occurrence o JOIN symbol s ON s.id = o.symbol_id WHERE o.path = ? AND o.line = ?
            ORDER BY (o.role & 1) DESC, o.col LIMIT 1`, [at.path, at.line])
        : sql.unsafe<Row>(`SELECT s.* FROM occurrence o JOIN symbol s ON s.id = o.symbol_id WHERE o.path = ? AND o.line <= ? AND o.end_line >= ?
            AND (o.line < ? OR o.col <= ?) AND (o.end_line > ? OR o.end_col > ?) ORDER BY (o.end_line - o.line), (o.end_col - o.col) LIMIT 1`,
            [at.path, at.line, at.line, at.line, at.column - 1, at.line, at.column - 1]))).flatMap(definitions)
      if (found[0]) return { resolved: found[0], candidates: [] }
      const enclosing = (yield* each(scope, (sql) => sql.unsafe<Row>(`SELECT * FROM symbol WHERE path = ? AND start_line <= ? AND end_line >= ?
        ORDER BY end_line - start_line LIMIT 1`, [at.path, at.line, at.line]))).flatMap(definitions)
      return enclosing[0] ? { resolved: enclosing[0], candidates: [] } : { candidates: [] }
    }
    if (target.symbol?.startsWith("#")) {
      const [, shard, id] = target.symbol.split("#")
      const scoped = { ...scope, ready: scope.ready.filter((choice) => choice.planned.shard.id === shard) }
      const found = (yield* each(scoped, (sql) => sql.unsafe<Row>(`SELECT * FROM symbol WHERE id = ?`, [Number(id)]))).flatMap(definitions)
      return found[0] ? { resolved: found[0], candidates: [] } : { candidates: [] }
    }
    if (target.symbol !== undefined) {
      const found = (yield* each(scope, (sql) => sql.unsafe<Row>(`SELECT * FROM symbol WHERE scip = ? AND path IN (SELECT path FROM document)`, [target.symbol]))).flatMap(definitions)
      return found[0] ? { resolved: found[0], candidates: [] } : { candidates: [] }
    }
    if (target.name === undefined) return yield* new Research.Error({ code: "reference_invalid", message: "Query needs name, symbol or at" })
    const parts = target.name.split(".")
    const last = parts.at(-1)!
    const stored = (yield* each(scope, (sql) => sql.unsafe<Row & { qualified: string }>(`
      WITH RECURSIVE up(origin, id, container_id, depth, name) AS (
        SELECT id, id, container_id, 0, name FROM symbol WHERE name = ? ${target.path ? "AND path = ?" : ""} AND path IN (SELECT path FROM document)
        UNION ALL SELECT up.origin, s.id, s.container_id, up.depth + 1, s.name FROM symbol s JOIN up ON s.id = up.container_id WHERE up.depth < 16)
      SELECT s.*, (SELECT group_concat(name, '.') FROM (SELECT name FROM up WHERE up.origin = s.id ORDER BY depth DESC)) AS qualified
      FROM symbol s WHERE s.id IN (SELECT origin FROM up)`, target.path ? [last, target.path] : [last])))
      .flatMap((entry) => entry.rows.filter((row) => (row.qualified === target.name || row.qualified.endsWith("." + target.name)) && !scope.dirty.has(row.path))
        .map((row) => found(entry.choice, row)))
    const named: ReadonlyArray<Found> = [...stored, ...overlaid
      .filter((ref) => ref.name === last && parts.length === 1 && (target.path === undefined || ref.range.path === target.path))
      .map((ref) => ({ ref }))]
    const unique = [...new Map(named.map((entry) => [entry.ref.symbol, entry])).values()]
    if (unique.length === 1) return { resolved: unique[0], candidates: [] }
    if (unique.length > 1)
      return { candidates: unique.map((entry) => entry.ref).sort((a, b) => Number(b.exported) - Number(a.exported) || a.range.path.localeCompare(b.range.path)).slice(0, CANDIDATES) }
    return { candidates: (yield* fuzzy(scope, last, target.path)).slice(0, CANDIDATES) }
  })
}

/** FTS5 over name and its camelCase/snake_case tokens, best bm25() first across shards. */
function fuzzy(scope: Scope, name: string, file?: string) {
  const match = CodeIndexStore.tokens(name).split(" ").filter(Boolean).map((token) => `"${token}"*`).join(" ")
  if (!match) return Effect.succeed([] as ReadonlyArray<CodeIndex.SymbolRef>)
  return each(scope, (sql) => sql.unsafe<Row & { score: number }>(`SELECT s.*, bm25(symbol_name) AS score FROM symbol_name
      JOIN symbol s ON s.id = symbol_name.rowid WHERE symbol_name MATCH ? ${file ? "AND s.path = ?" : ""}
      AND s.path IN (SELECT path FROM document) ORDER BY score LIMIT ${CANDIDATES * 5}`, file ? [match, file] : [match]))
    .pipe(Effect.map((rows) => rows.flatMap((entry) => entry.rows.filter((row) => !scope.dirty.has(row.path)).map((row) => ({ score: row.score, ref: found(entry.choice, row).ref })))
      .sort((a, b) => a.score - b.score).map((entry) => entry.ref)))
}

function related(scope: Scope, target: Found, op: "references" | "callers" | "callees" | "implementations") {
  return Effect.gen(function* () {
    if (target.id === undefined || !target.shard) return [] as ReadonlyArray<CodeIndex.Hit>
    // A SCIP symbol is global, so its occurrences are read in every shard; a local one only in its own shard.
    const shards = target.scip ? scope : { ...scope, ready: [target.shard] }
    const match = target.scip ? "s.scip = ?" : "s.id = ?"
    const key = target.scip ?? target.id
    if (op === "implementations") {
      const rows = yield* each(shards, (sql) => sql.unsafe<Row>(`SELECT i.* FROM relation r JOIN symbol s ON s.id = r.target_id
        JOIN symbol i ON i.id = r.symbol_id WHERE ${match} AND r.kind = 'implementation'`, [key]))
      return sorted(rows.flatMap(definitions).map((entry) => ({ range: entry.ref.range, role: "definition" as const, via: entry.ref })))
    }
    if (op === "callees") {
      const rows = yield* each({ ...scope, ready: [target.shard] }, (sql) => sql.unsafe<Row & { site: number; opaque_site: number }>(`
        SELECT t.*, o.line AS site, o.opaque AS opaque_site FROM occurrence o JOIN symbol t ON t.id = o.symbol_id
        WHERE o.path = ? AND o.line BETWEEN ? AND ? AND (o.role & 1) = 0 AND o.symbol_id != ?`,
        [target.ref.range.path, target.ref.range.startLine, target.ref.range.endLine, target.id]))
      return grouped(rows.flatMap((entry) => entry.rows.map((row) => ({ via: found(entry.choice, row).ref, site: row.site, opaque: row.opaque_site === 1 }))))
    }
    const rows = yield* each(shards, (sql) => sql.unsafe<SiteRow>(`
      SELECT o.path AS site_path, o.line AS site_line, o.end_line AS site_end, o.role AS site_role, o.opaque AS site_opaque,
        e.id, e.scip, e.name, e.kind, e.path, e.start_line, e.end_line, e.name_line, e.exported, e.container_id
      FROM occurrence o JOIN symbol s ON s.id = o.symbol_id LEFT JOIN symbol e ON e.id = o.enclosing_id
      WHERE ${match} AND (o.role & ${CodeIndex.Role.definition}) = 0`, [key]))
    if (op === "references")
      return sorted(rows.flatMap((entry) => entry.rows).map((row): CodeIndex.Hit => ({
        range: { path: row.site_path, startLine: row.site_line, endLine: row.site_end },
        role: row.site_role & CodeIndex.Role.write ? "write" : row.site_role & CodeIndex.Role.import ? "import" : "reference",
        ...(row.site_opaque ? { opaque: true } : {}),
      })))
    // callers (J2.9): references grouped by the definition that encloses them; top-level sites stay single references.
    // An import names a symbol without calling it, as in X1's caller view (callers.ts), so it is no caller site.
    const sites = rows.flatMap((entry) => entry.rows.filter((row) => !(row.site_role & CodeIndex.Role.import)).map((row) => ({
      site: row.site_line, path: row.site_path, opaque: row.site_opaque === 1,
      via: row.id === null ? undefined : found(entry.choice, row as Row).ref,
    })))
    return sorted([
      ...grouped(sites.flatMap((site) => site.via ? [{ via: site.via, site: site.site, opaque: site.opaque }] : [])),
      ...sites.filter((site) => !site.via).map((site): CodeIndex.Hit => ({
        range: { path: site.path, startLine: site.site, endLine: site.site }, role: "reference", sites: [site.site],
        ...(site.opaque ? { opaque: true } : {}),
      })),
    ])
  })
}

function grouped(sites: ReadonlyArray<{ readonly via: CodeIndex.SymbolRef; readonly site: number; readonly opaque: boolean }>) {
  return sorted([...Map.groupBy(sites, (site) => site.via.symbol).values()].map((group): CodeIndex.Hit => ({
    range: group[0]!.via.range, role: "call", via: group[0]!.via,
    sites: [...new Set(group.map((site) => site.site))].sort((a, b) => a - b),
    ...(group.some((site) => site.opaque) ? { opaque: true } : {}),
  })))
}

/** `symbols`: a file's outline with members, or every definition under a directory; a name ranks by bm25(). */
function symbols(scope: Scope, query: Extract<CodeIndex.CodeQuery, { op: "symbols" }>) {
  return Effect.gen(function* () {
    const keep = (ref: CodeIndex.SymbolRef) => within(ref.range.path, query.path) && (query.kind === undefined || ref.kind === query.kind) &&
      (query.exported === undefined || ref.exported === query.exported)
    const overlaid = [...scope.overlay.values()].flatMap((entry) => entry.symbols).filter(keep)
    if (query.name !== undefined) {
      const name = query.name
      const ranked = (yield* fuzzy(scope, name)).filter(keep)
      const local = overlaid.filter((ref) => CodeIndexStore.tokens(ref.name).includes(CodeIndexStore.tokens(name)))
      return { candidates: [], hits: [...ranked, ...local].map((ref): CodeIndex.Hit => ({ range: ref.range, role: "definition", via: ref })) }
    }
    const filters = [
      ...(query.path && query.path !== "." ? [{ sql: "(path = ? OR substr(path, 1, ?) = ?)", params: [query.path, query.path.length + 1, query.path + "/"] }] : []),
      ...(query.kind !== undefined ? [{ sql: "kind = ?", params: [query.kind] }] : []),
      ...(query.exported !== undefined ? [{ sql: "exported = ?", params: [query.exported ? 1 : 0] }] : []),
    ]
    const rows = yield* each(scope, (sql) => sql.unsafe<Row>(`SELECT * FROM symbol WHERE path IN (SELECT path FROM document)
      ${filters.map((filter) => `AND ${filter.sql}`).join(" ")} ORDER BY path, start_line, id`, filters.flatMap((filter) => filter.params)))
    const stored = rows.flatMap(definitions).map((entry) => entry.ref).filter((ref) => !scope.dirty.has(ref.range.path))
    return {
      candidates: [],
      hits: [...stored, ...overlaid]
        .sort((a, b) => a.range.path.localeCompare(b.range.path) || a.range.startLine - b.range.startLine)
        .map((ref): CodeIndex.Hit => ({ range: ref.range, role: "definition", via: ref })),
    }
  })
}

/**
 * `map` (T-X8): files and directories under the scope ordered by PageRank, with LOC, read from the index instead of
 * a new walk. A directory's rank and LOC are its files' sums; `depth` bounds how far below the scope entries go.
 */
function map(scope: Scope, query: Extract<CodeIndex.CodeQuery, { op: "map" }>) {
  return Effect.gen(function* () {
    const rows = (yield* each(scope, (sql) => sql.unsafe<{ path: string; rank: number; loc: number }>(`SELECT path, rank, loc FROM file_rank`)))
      .flatMap((entry) => entry.rows).filter((row) => within(row.path, query.path))
    const base = query.path === undefined || query.path === "." ? [] : query.path.split("/")
    const depth = query.depth ?? Number.POSITIVE_INFINITY
    const dirs = new Map<string, { rank: number; loc: number }>()
    rows.forEach((row) => row.path.split("/").slice(0, -1).forEach((_, index, parts) => {
      if (index < base.length) return
      const dir = parts.slice(0, index + 1).join("/")
      const entry = dirs.get(dir) ?? { rank: 0, loc: 0 }
      dirs.set(dir, { rank: entry.rank + row.rank, loc: entry.loc + row.loc })
    }))
    const levels = (file: string) => file.split("/").length - base.length
    const entries = [
      ...[...dirs].map(([dir, entry]) => ({ path: dir, rank: entry.rank, loc: entry.loc, kind: "directory" })),
      ...rows.map((row) => ({ path: row.path, rank: row.rank, loc: row.loc, kind: "file" })),
    ].filter((entry) => levels(entry.path) <= depth)
      // As the techlead's deriveMap: core before test scaffolding, then rank, then path.
      .sort((a, b) => Number(CodeIndexRank.isTestPath(a.path)) - Number(CodeIndexRank.isTestPath(b.path)) ||
        b.rank - a.rank || a.path.localeCompare(b.path))
    return {
      candidates: [],
      hits: entries.map((entry): CodeIndex.Hit => {
        const range = { path: entry.path, startLine: 1, endLine: Math.max(1, entry.loc) }
        return { range, role: "definition", via: { symbol: entry.path, name: path.posix.basename(entry.path), kind: entry.kind, range, nameLine: 1, exported: false } }
      }),
    }
  })
}

// Documents examined: the index's documents in scope plus overlay files the index did not have.
function count(scope: Scope, prefix: string | undefined) {
  return each(scope, (sql) => prefix === undefined || prefix === "."
    ? sql.unsafe<{ path: string }>(`SELECT path FROM document`)
    : sql.unsafe<{ path: string }>(`SELECT path FROM document WHERE path = ? OR substr(path, 1, ?) = ?`, [prefix, prefix.length + 1, prefix + "/"]))
    .pipe(Effect.map((rows) => new Set([...rows.flatMap((entry) => entry.rows.map((row) => row.path)),
      ...[...scope.overlay.keys()].filter((file) => within(file, prefix))]).size))
}

// The build's named gaps (meta.skipped) inside the scope.
function recorded(scope: Scope, prefix: string | undefined) {
  return each(scope, (sql) => sql.unsafe<{ value: string }>(`SELECT value FROM meta WHERE key = 'skipped'`)).pipe(
    Effect.map((rows) => rows.flatMap((entry) => entry.rows.flatMap((row) => JSON.parse(row.value) as Array<{ path: string; reason: string }>))
      .filter((entry) => within(entry.path, prefix))))
}

/** Run one read against every ready shard of the scope; each shard is opened read-only for the duration. */
function each<A extends object>(scope: Pick<Scope, "plan" | "ready">, read: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>) {
  return Effect.forEach(scope.ready, (choice) =>
    CodeIndexStore.read(scope.plan.dir, choice.key, Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return { choice, rows: yield* read(sql) }
    })))
}

const definitions = (entry: { readonly choice: Ready; readonly rows: ReadonlyArray<Row> }) => entry.rows.map((row) => found(entry.choice, row))

function found(choice: Ready, row: Row): Found & { shard: Ready; id: number } {
  return {
    shard: choice, id: row.id, ...(row.scip ? { scip: row.scip } : {}),
    ref: {
      symbol: row.scip ?? `#${choice.planned.shard.id}#${row.id}`, name: row.name, kind: row.kind,
      range: { path: row.path, startLine: row.start_line, endLine: row.end_line }, nameLine: row.name_line, exported: row.exported === 1,
    },
  }
}

function moduleHit(from: string, line: number, row: { specifier: string; to_path: string | null; kind: string }): CodeIndex.Hit {
  const range = { path: from, startLine: line, endLine: line }
  return {
    range, role: "import",
    via: { symbol: row.to_path ?? row.specifier, name: row.specifier, kind: `module:${row.kind}`,
      range: row.to_path ? { path: row.to_path, startLine: 1, endLine: 1 } : range, nameLine: row.to_path ? 1 : line, exported: false },
  }
}

const sorted = (hits: ReadonlyArray<CodeIndex.Hit>) =>
  hits.toSorted((a, b) => a.range.path.localeCompare(b.range.path) || a.range.startLine - b.range.startLine)

