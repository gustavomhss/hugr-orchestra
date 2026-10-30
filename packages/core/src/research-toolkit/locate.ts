export * as Locate from "./locate"

import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { CodeIndex } from "./code-index/types"

// J3.4-J3.8: one deterministic, model-free fan-out. Every search runs in parallel through L1 (ripgrep --json) and X3
// (SQLite index: FTS5 names, import graph, PageRank file_rank); this file only plans, fuses and verifies.

/** What locate runs on. The tool binds them to the worktree; tests bind fakes. */
export type Sources = {
  readonly search: (input: CodeIndex.SearchInput) => Effect.Effect<CodeIndex.SearchResult, Research.Error>
  /** Absent when no index serves the worktree; locate then runs the lexical lists only (J3.7). */
  readonly query?: (query: CodeIndex.CodeQuery) => Effect.Effect<CodeIndex.CodeQueryResult, Research.Error>
  /** Current content of a worktree-relative path, undefined when it no longer exists. */
  readonly read: (path: string) => Effect.Effect<string | undefined>
  /** Retains the snapshot of every returned range and returns its ref. */
  readonly retain: (snapshot: string) => Effect.Effect<Research.SourceRef, Research.Error>
}

/** First line of the retained snapshot; every range follows as `==> path:start-end` and `<line>: <text>` rows. */
export const SNAPSHOT = "code_locate ranges, original 1-based lines"

/**
 * The ranges a retained code_locate snapshot holds, with each original line's offset among the snapshot's lines, or
 * undefined when the text is not a snapshot. Readers map snapshot evidence back to the worktree file it came from.
 */
export function blocks(text: string) {
  const rows = text.split(/\r\n|\n|\r/)
  if (rows[0] !== SNAPSHOT) return undefined
  return rows.flatMap((row, index) => {
    const head = /^==> (.+):(\d+)-(\d+)$/.exec(row)
    return head ? [{ path: head[1], start: Number(head[2]), end: Number(head[3]), row: index + 1 }] : []
  })
}

export const MAX_SEARCHES = 32
export const DEFAULT_LIMIT = 12
const RRF_K = 60
const PER_FILE = 3
const CONTEXT = 3
const PAGE = 50
const SEEDS = 5

type Kind = CodeIndex.LocateResult["searches"][number]["kind"]
type Planned = { readonly kind: Kind; readonly query: string; readonly run: Effect.Effect<List, Research.Error> }
/** One ranked candidate list: its units in rank order, each with what made it a candidate. */
type List = { readonly units: ReadonlyArray<Unit>; readonly hits: number; readonly truncated: boolean; readonly basis?: CodeIndex.Basis }
type Unit = CodeIndex.Range & {
  readonly symbol?: string
  readonly why: string
  /** What verification rereads: a lexical hit's line and text, or a definition's name line. */
  readonly check?: { readonly line: number; readonly text: string }
}

export const run = Effect.fn("Locate.run")(function* (input: CodeIndex.LocateInput, sources: Sources) {
  const started = Date.now()
  const limit = input.limit ?? DEFAULT_LIMIT
  const scope = (input.paths ?? []).map((pattern) => new Bun.Glob(pattern))
  const inScope = (file: string) => !scope.length || scope.some((glob) => glob.match(file))
  if (!input.question && !input.terms?.length && !input.symbols?.length)
    return yield* new Research.Error({ code: "unsupported", message: "code_locate needs at least one of question, terms or symbols" })
  const prior = yield* ranks(sources.query)
  const query = prior ? sources.query : undefined
  const rank = prior ?? new Map<string, number>()
  const terms = [...new Set([...(input.terms ?? []), ...(input.question ? extract(input.question) : []),
    // Without an index, symbol names can only be found lexically.
    ...(query ? [] : (input.symbols ?? []).map((symbol) => symbol.split(".").at(-1) ?? symbol))])]
  // The prior costs one search; neighbours keep two per seed. The rest goes to terms and symbols, best lists first.
  const first = [
    ...(query ? (input.symbols ?? []).map((symbol) => definitions(query, symbol, inScope)) : []),
    ...terms.map((term) => lexical(sources.search, term, "lexical", input.paths)),
    ...(query ? (input.symbols ?? []).map((symbol) => named(query, symbol, inScope)) : []),
    ...terms.map((term) => lexical(sources.search, term, "lexical-wide", input.paths)),
  ].slice(0, MAX_SEARCHES - (query ? 1 + 2 * SEEDS : 0))
  const lists = yield* Effect.forEach(first, (planned) => planned.run, { concurrency: "unbounded" })
  const second = query ? [...new Set(fuse(lists, rank).map((unit) => unit.path))].slice(0, SEEDS)
    .flatMap((file) => neighbours(query, file, inScope)) : []
  const near = yield* Effect.forEach(second, (planned) => planned.run, { concurrency: "unbounded" })
  const planned = [...first, ...second]
  const all = [...lists, ...near]

  const fused = fuse(all, rank)
  const files = new Map(yield* Effect.forEach([...new Set(fused.map((unit) => unit.path))],
    (file) => sources.read(file).pipe(Effect.map((text) => [file, text?.split(/\r\n|\n|\r/)] as const)), { concurrency: "unbounded" }))
  const verified = fused.flatMap((unit) => {
    const lines = files.get(unit.path)
    if (!lines) return []
    // A context window may run past the end of the file; a definition must exist on exactly the lines it declares.
    const clamped = unit.symbol ? unit : { ...unit, endLine: Math.min(unit.endLine, lines.length) }
    return clamped.endLine <= lines.length && clamped.checks.every((check) => valid(clamped, check, lines)) ? [clamped] : []
  })
  const perFile = new Map<string, number>()
  const kept = verified.filter((unit) => {
    const count = (perFile.get(unit.path) ?? 0) + 1
    perFile.set(unit.path, count)
    return count <= PER_FILE
  }).slice(0, limit)
  const evidence = yield* sources.retain([SNAPSHOT, ...kept.map((unit) => [`==> ${unit.path}:${unit.startLine}-${unit.endLine}`,
    ...(files.get(unit.path) ?? []).slice(unit.startLine - 1, unit.endLine).map((text, index) => `${unit.startLine + index}: ${text}`)].join("\n"))]
    .join("\n\n"))
  return {
    ranges: kept.map((unit) => ({ path: unit.path, startLine: unit.startLine, endLine: unit.endLine,
      ...(unit.symbol ? { symbol: unit.symbol } : {}), why: unit.why, score: Number(unit.score.toFixed(6)) })),
    searches: planned.map((search, index) => ({ kind: search.kind, query: search.query, hits: all[index].hits, truncated: all[index].truncated })),
    evidence,
    basis: basis(all, { indexed: query !== undefined, ms: Date.now() - started, limit, discarded: fused.length - verified.length,
      truncated: verified.length > kept.length, files: [...files.keys()] }),
  } satisfies CodeIndex.LocateResult
})

/**
 * Terms a question names, without a model: identifiers (camelCase, snake_case, kebab-case, paths), quoted strings, and
 * words of four or more letters that are not stopwords (J3.5 step 1).
 */
export function extract(question: string) {
  const quoted = [...question.matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g)].map((match) => match[1] ?? match[2] ?? match[3])
  const rest = question.replace(/"[^"]+"|'[^']+'|`[^`]+`/g, " ")
  const identifiers = rest.match(/[\w$@.-]{0,200}[/.][\w$@./-]{0,200}\w|\b[a-z]+[A-Z][\w$]*|\b[A-Z][a-z0-9]+[A-Z][\w$]*|\b\w+_\w+\b|\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g) ?? []
  const words = (rest.match(/\p{L}{4,}/gu) ?? []).filter((word) => !STOPWORDS.has(word.toLowerCase()))
  const seen = new Set<string>()
  return [...quoted, ...identifiers, ...words].map((term) => term.trim().replace(/(?<![.,;:!?])[.,;:!?]+$/, "")).filter((term) => {
    const key = term.toLowerCase()
    if (!term || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function lexical(search: Sources["search"], term: string, kind: "lexical" | "lexical-wide", paths?: ReadonlyArray<string>): Planned {
  const input = kind === "lexical"
    ? { pattern: term, mode: "identifier" as const, caseSensitive: true, limit: PAGE }
    : { pattern: term, mode: "literal" as const, caseSensitive: false, limit: PAGE }
  return {
    kind, query: term,
    run: search({ ...input, ...(paths?.length ? { paths: [...paths] } : {}) }).pipe(Effect.map((result) => ({
      hits: result.matches.length, truncated: result.basis.bounds.truncated || result.next !== undefined, basis: result.basis,
      units: result.matches.map((match): Unit => ({
        ...(match.enclosing && match.enclosing.range.path === match.path && match.enclosing.range.startLine <= match.line &&
          match.line <= match.enclosing.range.endLine
          ? { ...match.enclosing.range, symbol: match.enclosing.name }
          : { path: match.path, startLine: Math.max(1, match.line - CONTEXT), endLine: match.line + CONTEXT }),
        why: `${kind === "lexical" ? "rg" : "rg-wide"}:${term}`,
        check: { line: match.line, text: match.text.trim() },
      })),
    }))),
  }
}

function definitions(query: NonNullable<Sources["query"]>, symbol: string, inScope: (file: string) => boolean): Planned {
  return indexed("definition", symbol, query({ op: "definition", name: symbol }), `def:${symbol}`, inScope)
}

/** FTS prefix and camelCase/snake_case parts: the index matches `name` against `symbol_name` (J2). */
function named(query: NonNullable<Sources["query"]>, symbol: string, inScope: (file: string) => boolean): Planned {
  const name = symbol.split(".").at(-1) ?? symbol
  return indexed("definition", `${name}*`, query({ op: "symbols", name, limit: PAGE }), `name:${name}`, inScope)
}

function neighbours(query: NonNullable<Sources["query"]>, file: string, inScope: (file: string) => boolean): Planned[] {
  return [
    indexed("neighbors", `importers:${file}`, query({ op: "importers", path: file, limit: PAGE }), `importer-of:${file}`, inScope),
    indexed("neighbors", `imports:${file}`, query({ op: "imports", path: file, limit: PAGE }), `imported-by:${file}`, inScope),
  ]
}

function indexed(kind: Kind, label: string, effect: Effect.Effect<CodeIndex.CodeQueryResult, Research.Error>, why: string,
  inScope: (file: string) => boolean): Planned {
  return {
    kind, query: label,
    run: effect.pipe(Effect.map((result) => {
      const symbols = [...(result.resolved ? [result.resolved] : result.candidates),
        ...result.hits.flatMap((hit) => hit.role === "definition" && hit.via ? [hit.via] : [])]
      const units = [
        ...symbols.map((ref): Unit => ({ ...ref.range, symbol: ref.name, why, check: { line: ref.nameLine, text: ref.name } })),
        ...result.hits.filter((hit) => hit.role !== "definition" || !hit.via)
          .map((hit): Unit => hit.via ? { ...hit.via.range, symbol: hit.via.name, why, check: { line: hit.via.nameLine, text: hit.via.name } }
            : { ...hit.range, why }),
      ].filter((unit) => inScope(unit.path))
      return { units, hits: units.length, truncated: result.basis.bounds.truncated || result.next !== undefined, basis: result.basis }
    }), Effect.catchIf((error) => UNINDEXED.has(error.code), (): Effect.Effect<List> =>
      // A shard that stopped serving mid-call costs this list, not the call; coverage then says incomplete.
      Effect.succeed({ units: [], hits: 0, truncated: true }))),
  }
}

/**
 * L5: PageRank position over the resolved import graph, used only to break ties. One `map` page. It also probes the
 * index: an index that is not ready yields undefined, and locate degrades to the lexical lists (J3.7).
 */
function ranks(query: Sources["query"]) {
  if (!query) return Effect.succeed(undefined)
  return query({ op: "map", limit: 200 }).pipe(
    Effect.map((result) => new Map(result.hits.map((hit, index, hits) => [hit.range.path, 1 - index / hits.length] as const))),
    Effect.catchIf((error) => UNINDEXED.has(error.code), () => Effect.succeed(undefined)),
  )
}

const UNINDEXED = new Set<Research.Error["code"]>(["index_unavailable", "index_building"])

/**
 * Reciprocal Rank Fusion, score = Σ 1/(60 + rank) over every candidate list, plus 0.1 × the normalized L5 rank. A
 * lexical window that falls inside a definition unit of the same file joins that definition.
 */
function fuse(lists: ReadonlyArray<List>, rank: ReadonlyMap<string, number>) {
  const units = new Map<string, CodeIndex.Range & { symbol?: string; score: number; why: string[]; checks: NonNullable<Unit["check"]>[] }>()
  const definitions = lists.flatMap((list) => list.units).filter((unit) => unit.symbol)
  lists.forEach((list) => {
    const seen = new Set<string>()
    list.units.forEach((unit, index) => {
      const line = unit.check?.line
      const home = unit.symbol || line === undefined ? unit
        : definitions.find((definition) => definition.path === unit.path && definition.startLine <= line && line <= definition.endLine) ?? unit
      const key = `${home.path}:${home.startLine}:${home.endLine}`
      const entry = units.get(key) ?? { path: home.path, startLine: home.startLine, endLine: home.endLine,
        ...(home.symbol ? { symbol: home.symbol } : {}), score: 0.1 * (rank.get(home.path) ?? 0), why: [], checks: [] }
      units.set(key, entry)
      if (unit.check) entry.checks.push(unit.check)
      if (!entry.why.includes(unit.why)) entry.why.push(unit.why)
      if (seen.has(key)) return
      seen.add(key)
      entry.score += 1 / (RRF_K + index + 1)
    })
  })
  return [...units.values()].toSorted(order)
}

function valid(unit: CodeIndex.Range, check: NonNullable<Unit["check"]>, lines: ReadonlyArray<string>) {
  return unit.startLine <= check.line && check.line <= unit.endLine && check.line <= lines.length &&
    lines[check.line - 1].includes(check.text)
}

function order(left: { score: number } & CodeIndex.Range, right: { score: number } & CodeIndex.Range) {
  return right.score - left.score || left.path.localeCompare(right.path) || left.startLine - right.startLine
}

function basis(lists: ReadonlyArray<List>, run: { indexed: boolean; ms: number; limit: number; discarded: number; truncated: boolean
  files: ReadonlyArray<string> }): CodeIndex.Basis {
  const bases = lists.flatMap((list) => list.basis ? [list.basis] : [])
  const freshness = bases.map((item) => item.freshness)
  // Without an index, the languages of the files the lexical lists reached are the ones no index served.
  const missing = run.indexed ? [] : run.files.flatMap((file) => LANGUAGES[file.split(".").at(-1) ?? ""] ?? [])
  return {
    basis: {
      commit: bases.find((item) => item.basis.commit)?.basis.commit ?? "",
      ...(bases.find((item) => item.basis.dirtyDigest) ? { dirtyDigest: bases.find((item) => item.basis.dirtyDigest)!.basis.dirtyDigest } : {}),
      shards: [...new Map(bases.flatMap((item) => item.basis.shards).map((shard) => [shard.id, shard])).values()],
    },
    execution: { op: "locate", ms: run.ms, semantic: "absent" },
    coverage: {
      documents: Math.max(0, ...bases.map((item) => item.coverage.documents)),
      skipped: [...new Map(bases.flatMap((item) => item.coverage.skipped).map((skip) => [`${skip.path}\0${skip.reason}`, skip])).values()],
      languagesMissing: [...new Set([...bases.flatMap((item) => item.coverage.languagesMissing), ...missing])],
      opaqueSites: bases.reduce((sum, item) => sum + item.coverage.opaqueSites, 0),
      complete: run.indexed && bases.every((item) => item.coverage.complete) && lists.every((list) => !list.truncated),
      discarded: run.discarded,
    },
    // J3.7: the lexical lists read the worktree itself, so they are fresh; only index lists can be stale.
    freshness: freshness.includes("stale") ? "stale" : freshness.includes("dirty-overlay") ? "dirty-overlay" : "fresh",
    bounds: { limit: run.limit, truncated: run.truncated },
  }
}

const LANGUAGES: Record<string, string> = { ts: "ts", tsx: "ts", mts: "ts", cts: "ts", js: "js", jsx: "js", mjs: "js", cjs: "js",
  py: "py", go: "go", rs: "rust" }

const STOPWORDS = new Set(("about above after again against also does doing done down during each from have having here how into " +
  "itself just like more most much must only other over same should some such than that their them then there these they this " +
  "those through under until very what when where which while whom whose will with within without would your yours code file " +
  "files where function method class find show work works make made used uses using").split(" "))
