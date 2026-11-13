export * as ReviewImpactCache from "./impact-cache"

import { Context, Effect } from "effect"
import { CodeIndexQuery } from "../research-toolkit/code-index/query"
import { CodeIndexExtract } from "../research-toolkit/code-index/extract"
import { ResearchToolkit } from "../research-toolkit"
import { CodeIndexShard } from "../research-toolkit/code-index/shard"
import type { CodeIndex } from "../research-toolkit/code-index/types"
import { ReviewImpact } from "./impact"
import { ReviewScratch } from "./scratch-copy"
import type { ReviewAnalyze } from "./analyze"

export const MakeEngine = Context.Reference<typeof CodeIndexQuery.engine>("@orchestra/ReviewImpactCache/MakeEngine", { defaultValue: () => CodeIndexQuery.engine })

/** Read-only graph access: deliberately omits extract, so a missing shard cannot start a build. */
export const cached = Effect.gen(function* () {
  const parts = yield* CodeIndexExtract.make
  const make = yield* MakeEngine
  const engine = yield* make({
    storeRoot: yield* ResearchToolkit.Root,
    indexers: yield* CodeIndexExtract.indexers(),
    overlay: parts.overlay,
  })
  return engine.query
})

export const ReadCache = Context.Reference<typeof cached>("@orchestra/ReviewImpactCache/ReadCache", { defaultValue: () => cached })
export type Result = { readonly ranges: ReviewImpact.Result["ranges"]; readonly check: ReviewAnalyze.Check }

export const read = Effect.fn("ReviewImpactCache.read")(function* (context: ReviewAnalyze.RunContext) {
  const observations: Array<{ query: CodeIndex.CodeQuery; result: CodeIndex.CodeQueryResult }> = []
  const result: ReviewImpact.Result = yield* Effect.gen(function* () {
    if (ReviewImpact.files(context.input.changed).length === 0)
      return { status: "pass", ranges: {}, queries: 0 } satisfies ReviewImpact.Result
    const copy = yield* context.head
    if ("failed" in copy)
      return { status: "not-run", ranges: {}, queries: 0, reason: "index-snapshot-unavailable" } satisfies ReviewImpact.Result
    const git = yield* CodeIndexShard.live(context.input.worktree)
    const commit = yield* CodeIndexShard.head(git)
    // Resolve the captured commit, rather than reading HEAD again across a possible ref change.
    const tree = (yield* git.run(["rev-parse", "--verify", "--end-of-options", `${commit}^{tree}`], undefined)).toString("utf8").trim()
    if (!ReviewScratch.pristine(copy.snapshot, tree))
      return { status: "not-run", ranges: {}, queries: 0, reason: "index-snapshot-mismatch" } satisfies ReviewImpact.Result
    const source = yield* ReadCache
    const query = yield* source
    const collected = yield* ReviewImpact.collect({ worktree: context.input.worktree, commit, changed: context.input.changed }, (worktree, request) =>
      query(worktree, request).pipe(Effect.tap((result) => Effect.sync(() => observations.push({ query: request, result })))),
    )
    if (collected.status !== "pass") return collected
    const paths = yield* Effect.forEach(Object.keys(collected.ranges), (file) => ReviewScratch.resolve(copy.snapshot, file).pipe(
      Effect.as(true), Effect.catch(() => Effect.succeed(false)),
    ))
    return paths.every(Boolean) ? collected
      : { status: "not-run", ranges: {}, queries: collected.queries, reason: "index-path-denied" } satisfies ReviewImpact.Result
  }).pipe(Effect.catch((error) => Effect.succeed({
    status: "not-run", ranges: {}, queries: observations.length,
    reason: `index-${error.code.replaceAll("_", "-").replace(/^index-/, "")}`,
  } satisfies ReviewImpact.Result)))
  const uri = yield* context.write("raw/blast-radius.json", JSON.stringify({ result, observations }))
  return {
    ranges: result.ranges,
    check: { id: "repo:blast-radius", pack: "repo", version: "review-v2", lane: "no-build", status: result.status,
      ...(result.reason === undefined ? {} : { reason: result.reason }), workspaceExecuted: false, uri },
  } satisfies Result
})
