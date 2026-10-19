import path from "node:path"
import { Context, Effect } from "effect"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { Research } from "@orchestra/schema/research"
import { ResearchTools } from "@/research/binding"
import { Tool } from "./tool"
import { ToolJsonSchema } from "./json-schema"
import DESCRIPTION from "./code-query.txt"

/**
 * The query side of the code index (J2.9). X3's `query.ts` provides it; until a layer does, the tool fails
 * `index_unavailable` rather than answering empty (J2.12, J6.10).
 */
export class Engine extends Context.Service<Engine, {
  readonly query: (worktree: string, input: CodeIndex.CodeQuery) => Effect.Effect<CodeIndex.CodeQueryResult, Research.Error>
}>()("@orchestra/CodeQueryEngine") {}

const CONTEXT_CALLERS = 5
const CONTEXT_IMPORTS = 10

export const CodeQueryTool = Tool.define("code_query", Effect.gen(function* () {
  const engine = yield* Effect.serviceOption(Engine)
  const run = yield* ResearchTools.make
  return {
    description: DESCRIPTION,
    parameters: CodeIndex.CodeQuery,
    jsonSchema: ToolJsonSchema.fromSchema(CodeIndex.CodeQuery),
    execute: (input: CodeIndex.CodeQuery, ctx: Tool.Context) =>
      run(ctx, "code_query", (binding) =>
        engine._tag === "None"
          ? Effect.fail(new Research.Error({ code: "index_unavailable", message: "toolkit-not-ready:absent:code-index" }))
          : answer(engine.value, binding.worktree, input).pipe(Effect.map((output) => ({ title: `code_query ${input.op}`, output, metadata: {} }))),
      ).pipe(Effect.orDie),
  }
}))

/** One call, one compact text answer. A definition also carries its first callers and the imports of its file. */
export function answer(engine: Context.Service.Shape<typeof Engine>, worktree: string, input: CodeIndex.CodeQuery) {
  return Effect.gen(function* () {
    const query = yield* scoped(worktree, input)
    const result = yield* engine.query(worktree, query)
    const lines = head(query, result)
    if (query.op === "definition" && result.resolved) {
      const callers = yield* engine.query(worktree, { op: "callers", symbol: result.resolved.symbol, limit: CONTEXT_CALLERS }).pipe(Effect.option)
      const imports = yield* engine.query(worktree, { op: "imports", path: result.resolved.range.path, limit: CONTEXT_IMPORTS }).pipe(Effect.option)
      if (callers._tag === "Some") lines.push(...section(`callers${callers.value.next === undefined ? "" : ` (first ${CONTEXT_CALLERS}; op=callers for more)`}`, callers.value.hits))
      if (imports._tag === "Some") lines.push(...section(`imports of ${result.resolved.range.path}${imports.value.next === undefined ? "" : ` (first ${CONTEXT_IMPORTS}; op=imports for more)`}`, imports.value.hits))
    }
    return [...lines, ...section("hits", result.hits), ...(result.next === undefined ? [] : [`next: offset=${result.next}`]), basis(result.basis)].join("\n")
  })
}

function head(query: CodeIndex.CodeQuery, result: CodeIndex.CodeQueryResult) {
  if (result.resolved) return [`${query.op}: ${symbol(result.resolved)}`]
  if (result.candidates.length === 0) return [`${query.op}: no target resolved`]
  return [`${query.op}: ambiguous, ${result.candidates.length} candidates; repeat with symbol or path`,
    ...result.candidates.map((candidate) => `  ${symbol(candidate)} id=${candidate.symbol}`)]
}

function section(title: string, hits: CodeIndex.CodeQueryResult["hits"]) {
  if (hits.length === 0) return []
  return [`${title} (${hits.length}):`, ...hits.map((hit) => [
    "  ", range(hit.range), " ", hit.role,
    hit.via ? ` in ${hit.via.name}` : "",
    hit.sites ? ` lines ${hit.sites.join(",")}` : "",
    hit.opaque ? " opaque" : "",
  ].join(""))]
}

function symbol(ref: CodeIndex.SymbolRef) {
  return `${ref.name} ${ref.kind}${ref.exported ? " exported" : ""} ${range(ref.range)}`
}

function range(value: CodeIndex.Range) {
  return value.startLine === value.endLine ? `${value.path}:${value.startLine}` : `${value.path}:${value.startLine}-${value.endLine}`
}

// The six dimensions beside every finding (JT.1), one line.
function basis(value: CodeIndex.Basis) {
  const skipped = value.coverage.skipped.slice(0, 5).map((item) => `${item.path} (${item.reason})`)
  return [
    `basis: commit ${value.basis.commit.slice(0, 12)}${value.basis.dirtyDigest ? "+dirty" : ""}`,
    `shards ${value.basis.shards.map((shard) => `${shard.language}:${shard.project}`).join(",") || "none"}`,
    `${value.execution.op} ${value.execution.ms}ms`,
    `docs ${value.coverage.documents}${value.coverage.complete ? "" : " INCOMPLETE"}`,
    ...(value.coverage.languagesMissing.length ? [`missing ${value.coverage.languagesMissing.join(",")}`] : []),
    ...(value.coverage.opaqueSites ? [`opaque ${value.coverage.opaqueSites}`] : []),
    ...(skipped.length ? [`skipped ${skipped.join("; ")}${value.coverage.skipped.length > skipped.length ? ` +${value.coverage.skipped.length - skipped.length}` : ""}`] : []),
    value.freshness,
    `limit ${value.bounds.limit}${value.bounds.truncated ? " TRUNCATED" : ""}`,
  ].join(" | ")
}

/** Paths are worktree-relative; anything that leaves the worktree is `reference_invalid` (J2.12). */
function scoped(worktree: string, input: CodeIndex.CodeQuery) {
  const inside = (value: string) => {
    const relative = path.isAbsolute(value) ? path.relative(worktree, value) : path.normalize(value)
    return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? undefined : relative.split(path.sep).join("/")
  }
  const fields = [("path" in input ? input.path : undefined), ("at" in input ? input.at?.path : undefined)]
  if (fields.some((value) => value !== undefined && inside(value) === undefined))
    return Effect.fail(new Research.Error({ code: "reference_invalid", message: "Path is outside the linked worktree" }))
  return Effect.succeed({
    ...input,
    ...("path" in input && input.path !== undefined ? { path: inside(input.path) } : {}),
    ...("at" in input && input.at ? { at: { ...input.at, path: inside(input.at.path)! } } : {}),
  } as CodeIndex.CodeQuery)
}
