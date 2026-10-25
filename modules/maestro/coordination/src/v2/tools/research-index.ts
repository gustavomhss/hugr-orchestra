import path from "node:path"
import { Effect } from "effect"
import { Config } from "@orchestra/core/config"
import { AppProcess } from "@orchestra/core/process"
import { CodeIndexExtract } from "@orchestra/core/research-toolkit/code-index/extract"
import { CodeIndexQuery } from "@orchestra/core/research-toolkit/code-index/query"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { Research } from "@orchestra/schema/research"
import type { Services } from "./research"

export const CONTEXT_CALLERS = 5
export const CONTEXT_IMPORTS = 10
export const RANGE_LINES = 40
export const SHOWN_LINES = 320

/**
 * The code index query (V1 `CodeIndexTools` Engine) over the real build path. Pack readiness is read per query, so a
 * pack installed after startup serves the next call, and config `research.limits` is read per query too.
 */
export function index(services: Services, worktree: string, input: CodeIndex.CodeQuery) {
  return Effect.gen(function* () {
    const parts = yield* CodeIndexExtract.make
    const engine = yield* CodeIndexQuery.engine({
      storeRoot: yield* ResearchToolkit.Root,
      indexers: yield* CodeIndexExtract.indexers(),
      overlay: parts.overlay,
      extract: parts.extract,
    })
    return yield* engine.query(worktree, input).pipe(Effect.provideService(ResearchToolkit.Caps, yield* caps(services.config)))
  }).pipe(Effect.provideService(AppProcess.Service, services.processes))
}

/** `ResearchToolkit.Caps` from config `research.limits`, which may only lower the owner caps (V1 `code-index.ts`). */
export function caps(config: Config.Interface) {
  return config.entries().pipe(Effect.map((entries) => ResearchToolkit.caps(Config.latest(entries, "research")?.limits)))
}

/**
 * The code-index warm-up V1 starts with the tool registry (`registry.ts` `research.prewarm`): only where the research
 * seat exists and the worktree is a real one, and only on a platform that can confine the indexer. `prewarm` forks
 * detached and runs once per worktree per process.
 */
export function warm(input: { config: Config.Interface; processes: AppProcess.Interface; seat: boolean; worktree: string }) {
  return Effect.gen(function* () {
    if (!input.seat || input.worktree === "/") return
    if (process.platform !== "darwin" && process.platform !== "linux") return
    yield* ResearchToolkit.prewarm(input.worktree).pipe(
      Effect.provideService(ResearchToolkit.Index, yield* CodeIndexExtract.toolkit),
      Effect.provideService(ResearchToolkit.Caps, yield* caps(input.config)),
    )
  }).pipe(Effect.provideService(AppProcess.Service, input.processes))
}

/**
 * The innermost index definition around a line, from one `symbols` outline per file, shared by every search the
 * resolver serves. Without an index, or while it builds, no line has an enclosing symbol, and the first such answer
 * stops further index calls.
 */
export function enclosing(services: Services, worktree: string) {
  const outlines = new Map<string, ReadonlyArray<CodeIndex.SymbolRef>>()
  const state = { unavailable: false }
  return (file: string, line: number) =>
    Effect.gen(function* () {
      if (state.unavailable) return undefined
      const symbols =
        outlines.get(file) ??
        (yield* index(services, worktree, { op: "symbols", path: file, limit: 200 }).pipe(
          Effect.map((result) => result.hits.flatMap((hit) => (hit.via && hit.via.range.path === file ? [hit.via] : []))),
          Effect.catch(() =>
            Effect.sync((): ReadonlyArray<CodeIndex.SymbolRef> => {
              state.unavailable = true
              return []
            }),
          ),
        ))
      outlines.set(file, symbols)
      return symbols
        .filter((symbol) => symbol.range.startLine <= line && line <= symbol.range.endLine)
        .toSorted((a, b) => a.range.endLine - a.range.startLine - (b.range.endLine - b.range.startLine))[0]
    })
}

export function head(query: CodeIndex.CodeQuery, result: CodeIndex.CodeQueryResult) {
  if (result.resolved) return [`${query.op}: ${symbol(result.resolved)}`]
  if (result.candidates.length === 0) return [`${query.op}: no target resolved`]
  return [
    `${query.op}: ambiguous, ${result.candidates.length} candidates; repeat with symbol or path`,
    ...result.candidates.map((candidate) => `  ${symbol(candidate)} id=${candidate.symbol}`),
  ]
}

export function section(title: string, hits: CodeIndex.CodeQueryResult["hits"]) {
  if (hits.length === 0) return []
  return [
    `${title} (${hits.length}):`,
    ...hits.map((hit) =>
      [
        "  ",
        range(hit.range),
        " ",
        hit.role,
        hit.via ? ` in ${hit.via.name}` : "",
        hit.sites ? ` lines ${hit.sites.join(",")}` : "",
        hit.opaque ? " opaque" : "",
      ].join(""),
    ),
  ]
}

export function symbol(ref: CodeIndex.SymbolRef) {
  return `${ref.name} ${ref.kind}${ref.exported ? " exported" : ""} ${range(ref.range)}`
}

export function range(value: CodeIndex.Range) {
  return value.startLine === value.endLine ? `${value.path}:${value.startLine}` : `${value.path}:${value.startLine}-${value.endLine}`
}

// The six dimensions beside every finding (JT.1), one line.
export function basis(value: CodeIndex.Basis) {
  const skipped = value.coverage.skipped.slice(0, 5).map((item) => `${item.path} (${item.reason})`)
  return [
    `basis: commit ${value.basis.commit.slice(0, 12)}${value.basis.dirtyDigest ? "+dirty" : ""}`,
    // The indexer tells a precise shard from a structural one (`tree-sitter`), which has no references.
    `shards ${value.basis.shards.map((shard) => `${shard.language}:${shard.project}@${shard.indexer}`).join(",") || "none"}`,
    `${value.execution.op} ${value.execution.ms}ms`,
    `docs ${value.coverage.documents}${value.coverage.complete ? "" : " INCOMPLETE"}`,
    ...(value.coverage.languagesMissing.length ? [`missing ${value.coverage.languagesMissing.join(",")}`] : []),
    ...(value.coverage.opaqueSites ? [`opaque ${value.coverage.opaqueSites}`] : []),
    ...(skipped.length
      ? [`skipped ${skipped.join("; ")}${value.coverage.skipped.length > skipped.length ? ` +${value.coverage.skipped.length - skipped.length}` : ""}`]
      : []),
    value.freshness,
    `limit ${value.bounds.limit}${value.bounds.truncated ? " TRUNCATED" : ""}`,
  ].join(" | ")
}

/** Paths are worktree-relative; anything that leaves the worktree is `reference_invalid` (J2.12). */
export function scoped(worktree: string, input: CodeIndex.CodeQuery) {
  const inside = (value: string) => {
    const relative = path.isAbsolute(value) ? path.relative(worktree, value) : path.normalize(value)
    return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
      ? undefined
      : relative.split(path.sep).join("/")
  }
  const fields = ["path" in input ? input.path : undefined, "at" in input ? input.at?.path : undefined]
  if (fields.some((value) => value !== undefined && inside(value) === undefined))
    return Effect.fail(new Research.Error({ code: "reference_invalid", message: "Path is outside the linked worktree" }))
  return Effect.succeed({
    ...input,
    ...("path" in input && input.path !== undefined ? { path: inside(input.path) } : {}),
    ...("at" in input && input.at ? { at: { ...input.at, path: inside(input.at.path) ?? input.at.path } } : {}),
  } as CodeIndex.CodeQuery)
}
