export * as ReviewImpact from "./impact"

import { Effect } from "effect"
import type { Research } from "@orchestra/schema/research"
import type { CodeIndex } from "../research-toolkit/code-index/types"
import { CodeIndexShard } from "../research-toolkit/code-index/shard"
import type { ReviewNoise } from "./noise"

export const LIMITS = { files: 16, symbols: 32, hits: 200 } as const
export type Input = { readonly worktree: string; readonly commit: string; readonly changed: ReviewNoise.Input["changed"] }
export type Query<R> = (worktree: string, input: CodeIndex.CodeQuery) => Effect.Effect<CodeIndex.CodeQueryResult, Research.Error, R>
export type Result = { readonly status: "pass" | "not-run"; readonly ranges: Input["changed"]; readonly queries: number; readonly reason?: string }

export function files(changed: Input["changed"]) {
  return Object.keys(changed).filter((file) => CodeIndexShard.language(file) !== undefined).toSorted()
}

export function collect<R>(input: Input, query: Query<R>): Effect.Effect<Result, never, R> {
  return Effect.suspend(() => {
    const state = { queries: 0, hits: 0 }
    return walk(input, query, state).pipe(Effect.catch((reason) => Effect.succeed(stopped(state, reason))))
  })
}

function walk<R>(
  input: Input,
  query: Query<R>,
  state: { queries: number; hits: number },
): Effect.Effect<Result, string, R> {
  return Effect.gen(function* () {
    const paths = files(input.changed)
    if (paths.length > LIMITS.files) return yield* Effect.fail("impact-budget")
    if (paths.length === 0) return { status: "pass" as const, ranges: {}, queries: 0 }
    const symbols: Array<{ symbol: string; path: string }> = []
    const seen = new Set<string>()
    for (const path of paths) {
      const result = yield* ask(input, query, state, { op: "symbols", path, limit: LIMITS.hits })
      const reason = evidence(input, result)
      if (reason !== undefined) return yield* Effect.fail(reason)
      const spans = input.changed[path] ?? []
      for (const hit of result.hits) {
        const via = definition(path, hit)
        if (via === undefined) continue
        if (via === "unsafe") return yield* Effect.fail("index-unsafe")
        if (!overlaps(via.range, spans)) continue
        const key = JSON.stringify([via.symbol, via.range.path])
        if (seen.has(key)) continue
        seen.add(key)
        symbols.push({ symbol: via.symbol, path: via.range.path })
        if (symbols.length > LIMITS.symbols) return yield* Effect.fail("impact-budget")
      }
    }
    const found: Array<{ path: string; start: number; end: number }> = []
    for (const item of symbols) {
      const result = yield* ask(input, query, state, {
        op: "callers",
        symbol: item.symbol,
        path: item.path,
        limit: LIMITS.hits,
      })
      const reason = evidence(input, result)
      if (reason !== undefined) return yield* Effect.fail(reason)
      if (result.candidates.length > 0) return yield* Effect.fail("index-ambiguous")
      if (result.resolved === undefined) return yield* Effect.fail("index-unresolved")
      if (result.resolved.symbol !== item.symbol || result.resolved.range.path !== item.path) {
        return yield* Effect.fail("index-ambiguous")
      }
      state.hits += result.hits.length
      if (state.hits > LIMITS.hits) return yield* Effect.fail("impact-budget")
      for (const hit of result.hits) {
        const span = callerSpan(hit)
        if (span === undefined) return yield* Effect.fail("index-unsafe")
        found.push(span)
      }
    }
    return { status: "pass" as const, ranges: orderRanges(found), queries: state.queries }
  })
}

function ask<R>(input: Input, query: Query<R>, state: { queries: number }, request: CodeIndex.CodeQuery) {
  state.queries += 1
  return query(input.worktree, request).pipe(Effect.mapError((error) => indexCode(error.code)))
}

function stopped(state: { queries: number }, reason: string): Result {
  return { status: "not-run", ranges: {}, queries: state.queries, reason }
}

function evidence(input: Input, result: CodeIndex.CodeQueryResult) {
  if (result.basis.freshness !== "fresh") return "index-stale"
  if (result.basis.basis.dirtyDigest !== undefined) return "index-dirty"
  if (result.basis.basis.commit !== input.commit) return "index-commit"
  if (result.basis.coverage.complete !== true) return "index-incomplete"
  if (result.basis.coverage.skipped.length !== 0) return "index-skipped"
  if (result.basis.coverage.languagesMissing.length !== 0) return "index-missing"
  if (result.basis.coverage.opaqueSites !== 0) return "index-opaque"
  if (result.basis.bounds.truncated !== false) return "index-truncated"
  if (result.next !== undefined) return "index-paged"
  return undefined
}

function indexCode(code: string) {
  const hyphenated = code.replaceAll("_", "-")
  if (hyphenated.startsWith("index-")) return hyphenated
  return `index-${hyphenated}`
}

// A definition of this file is kept only on an exact, safe via.range. Unsafe evidence fails closed; other hits are not widened in.
function definition(file: string, hit: CodeIndex.Hit): CodeIndex.SymbolRef | "unsafe" | undefined {
  const via = hit.via
  if (hit.role !== "definition" || via === undefined || via.range.path !== file) return undefined
  if (hit.opaque === true || !sameRange(hit.range, via.range) || !ordered(via.range)) return "unsafe"
  return via
}

function overlaps(range: CodeIndex.Range, spans: ReadonlyArray<{ readonly start: number; readonly end: number }>) {
  return spans.some((span) => range.startLine <= span.end && span.start <= range.endLine)
}

function callerSpan(hit: CodeIndex.Hit) {
  if ((hit.role !== "call" && hit.role !== "reference") || hit.opaque === true) return undefined
  if (!safePath(hit.range.path) || !ordered(hit.range)) return undefined
  return { path: hit.range.path, start: hit.range.startLine, end: hit.range.endLine }
}

function sameRange(left: CodeIndex.Range, right: CodeIndex.Range) {
  return left.path === right.path && left.startLine === right.startLine && left.endLine === right.endLine
}

function ordered(range: CodeIndex.Range) {
  return Number.isSafeInteger(range.startLine) && Number.isSafeInteger(range.endLine) && range.startLine > 0 && range.startLine <= range.endLine
}

function safePath(path: string) {
  if (path === "" || path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
}

function orderRanges(found: ReadonlyArray<{ readonly path: string; readonly start: number; readonly end: number }>): Result["ranges"] {
  const sorted = found.toSorted((left, right) => {
    if (left.path < right.path) return -1
    if (left.path > right.path) return 1
    if (left.start < right.start) return -1
    if (left.start > right.start) return 1
    return left.end - right.end
  })
  const ranges = new Map<string, Array<{ start: number; end: number }>>()
  for (const range of sorted) {
    const existing = ranges.get(range.path) ?? []
    const last = existing[existing.length - 1]
    if (last !== undefined && last.start === range.start && last.end === range.end) continue
    ranges.set(range.path, [...existing, { start: range.start, end: range.end }])
  }
  return Object.fromEntries(ranges)
}
