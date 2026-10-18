export * as CodeIndexTools from "./code-index"

// The code index behind the discovery seat's tools: X3's query engine over the real build path (core
// research-toolkit/code-index/extract.ts) as code_query's Engine, and L1's ripgrep search with the index's enclosing
// symbol plus X3's query as code_locate's Index. ResearchRegistry lists the node, so the loop and Claude mode, which
// both build their tools through ToolRegistry, get the same layer.
import { Context, Effect, Layer } from "effect"
import { Research } from "@orchestra/schema/research"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { CodeIndexExtract } from "@orchestra/core/research-toolkit/code-index/extract"
import { CodeIndexQuery } from "@orchestra/core/research-toolkit/code-index/query"
import type { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { CodeSearch } from "@orchestra/core/research-toolkit/search"
import { Index } from "./code-locate"
import { Engine } from "./code-query"

const layer = Layer.effectContext(Effect.gen(function* () {
  const proc = yield* AppProcess.Service
  const binary = yield* RipgrepBinary.Service
  const parts = yield* CodeIndexExtract.make
  const engine = Engine.of({
    // Pack readiness is read per query: a pack installed after startup serves the next call.
    query: (worktree, input) => Effect.gen(function* () {
      const query = yield* CodeIndexQuery.engine({ storeRoot: yield* ResearchToolkit.Root, indexers: yield* CodeIndexExtract.indexers(),
        overlay: parts.overlay, extract: parts.extract })
      return yield* query.query(worktree, input)
    }).pipe(Effect.provideService(AppProcess.Service, proc)),
  })
  const index = (worktree: string) => {
    const resolve = enclosing(engine, worktree)
    return {
      search: (input: CodeIndex.SearchInput) => CodeSearch.run(input, { cwd: worktree, enclosing: resolve }).pipe(
        Effect.provideService(AppProcess.Service, proc),
        Effect.provideService(RipgrepBinary.Service, binary),
        Effect.mapError((failure) => new Research.Error({
          code: failure.reason === "index_unavailable" ? "index_unavailable" : failure.reason === "pattern_invalid" ? "unsupported" : "source_unavailable",
          message: failure.message,
        })),
      ),
      query: (input: CodeIndex.CodeQuery) => engine.query(worktree, input),
    }
  }
  return Context.make(Engine, engine).pipe(Context.add(Index, index))
}))

export const node = LayerNode.make({ service: Engine, layer, deps: [AppProcess.node, RipgrepBinary.node] })

/**
 * L1's `enclosing` hook (J3.2): the innermost index definition around a line, from one `symbols` outline per file,
 * shared by every search the returned resolver serves. Without an index, or while it builds, no line has an enclosing
 * symbol, and the first such answer stops further index calls.
 */
export function enclosing(engine: Context.Service.Shape<typeof Engine>, worktree: string) {
  const outlines = new Map<string, ReadonlyArray<CodeIndex.SymbolRef>>()
  const state = { unavailable: false }
  return (file: string, line: number) => Effect.gen(function* () {
    if (state.unavailable) return undefined
    const symbols = outlines.get(file) ?? (yield* engine.query(worktree, { op: "symbols", path: file, limit: 200 }).pipe(
      Effect.map((result) => result.hits.flatMap((hit) => hit.via && hit.via.range.path === file ? [hit.via] : [])),
      Effect.catch(() => Effect.sync((): ReadonlyArray<CodeIndex.SymbolRef> => {
        state.unavailable = true
        return []
      })),
    ))
    outlines.set(file, symbols)
    return symbols
      .filter((symbol) => symbol.range.startLine <= line && line <= symbol.range.endLine)
      .toSorted((a, b) => (a.range.endLine - a.range.startLine) - (b.range.endLine - b.range.startLine))[0]
  })
}
