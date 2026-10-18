import path from "path"
import { Effect } from "effect"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { AppProcess } from "@orchestra/core/process"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { CodeSearch } from "@orchestra/core/research-toolkit/search"
import { Git } from "@/git"
import { InstanceState } from "@/effect/instance-state"
import DESCRIPTION from "./code-search.txt"
import { CodeIndexTools } from "./code-index"
import { Engine } from "./code-query"
import { Tool } from "./tool"

// J3.1-J3.3. Read-only: the host builds the ripgrep argv and the seat supplies only values. Each line carries the index
// symbol enclosing it when an index serves the worktree.
export const CodeSearchTool = Tool.define("code_search", Effect.gen(function* () {
  const processes = yield* AppProcess.Service
  const binary = yield* RipgrepBinary.Service
  const git = yield* Git.Service
  const engine = yield* Effect.serviceOption(Engine)
  return {
    description: DESCRIPTION,
    parameters: CodeIndex.SearchInput,
    execute: (input: CodeIndex.SearchInput, ctx: Tool.Context): Effect.Effect<Tool.ExecuteResult> =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const head = yield* git.run(["rev-parse", "HEAD"], { cwd: instance.directory })
        const commit = head.exitCode === 0 ? head.text().trim() : undefined
        // Search paths are relative to the directory, index paths to the git worktree (none outside git).
        const resolve = engine._tag === "Some" && instance.worktree !== "/" ? CodeIndexTools.enclosing(engine.value, instance.worktree) : undefined
        const enclosing = resolve && ((file: string, line: number) =>
          resolve(path.relative(instance.worktree, path.join(instance.directory, file)).replaceAll("\\", "/"), line))
        const result = yield* CodeSearch.run(input, { cwd: instance.directory, signal: ctx.abort, commit, ...(enclosing ? { enclosing } : {}) }).pipe(
          Effect.provideService(AppProcess.Service, processes),
          Effect.provideService(RipgrepBinary.Service, binary),
          Effect.map((found) => ({ ok: true as const, found })),
          Effect.catchTag("CodeSearch.Failure", (failure) => Effect.succeed({ ok: false as const, failure })),
        )
        if (!result.ok)
          return { title: input.pattern, metadata: { error: result.failure.reason }, output: `${result.failure.reason}: ${result.failure.message}` }
        return {
          title: input.pattern,
          metadata: { matches: result.found.matches.length, truncated: result.found.basis.bounds.truncated },
          output: render(result.found),
        }
      }).pipe(Effect.orDie),
  }
}))

// Compact by contract: one row per hit, then one coverage line; no raw dump.
function render(result: CodeIndex.SearchResult) {
  const rows = result.matches.flatMap((match) => [
    ...(match.before ?? []).map((text, index) => `${match.path}-${match.line - (match.before!.length - index)}- ${text}`),
    `${match.path}:${match.line}:${match.enclosing ? ` [${match.enclosing.name}]` : ""} ${match.text}`,
    ...(match.after ?? []).map((text, index) => `${match.path}-${match.line + index + 1}- ${text}`),
  ])
  const coverage = result.basis.coverage
  return [
    ...rows,
    `${result.matches.length} hit(s)${result.next === undefined ? "" : `; more: offset ${result.next}`}`,
    `coverage: files=${coverage.documents} ignoreRespected=${coverage.ignoreRespected} binariesSkipped=${coverage.binariesSkipped} complete=${coverage.complete}` +
      coverage.skipped.map((item) => ` skipped(${item.reason})`).join(""),
  ].join("\n")
}
