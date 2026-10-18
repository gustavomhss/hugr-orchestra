export * as CodeIndexBuild from "./build"

import { Effect } from "effect"
import type { Research } from "@orchestra/schema/research"
import { Limits, type Language } from "../index"
import { CodeIndexShard } from "./shard"
import { CodeIndexStore } from "./store"

// J2.2 incremental builds and J2.4 retention: a commit builds only the shards whose key it has not built before.
// The indexer for each language comes from the pack (J2.13); no caller picks the indexer, its arguments or its output.

/** The extraction layers (X1 SCIP ⋈ X2 tree-sitter) for one shard at one commit, run inside the pack's sandbox. */
export type Extract = (input: {
  readonly root: string
  readonly commit: string
  readonly shard: CodeIndexShard.Shard
  readonly indexer: CodeIndexShard.Indexer
}) => Effect.Effect<CodeIndexStore.Content, Research.Error>

export type Input = {
  /** Real path of the bound worktree. */
  readonly root: string
  readonly git: CodeIndexShard.Git
  /** ResearchToolkit.Root. */
  readonly storeRoot: string
  /** The ready pack's indexer per language; a language without one is `languagesMissing`. */
  readonly indexers: Partial<Record<Language, CodeIndexShard.Indexer>>
}

export type Planned = { readonly shard: CodeIndexShard.Shard; readonly indexer: CodeIndexShard.Indexer; readonly key: string }

export type Plan = {
  readonly commit: string
  readonly tree: CodeIndexShard.Tree
  /** The repository's shard directory. */
  readonly dir: string
  readonly shards: ReadonlyArray<Planned>
  /** Source files no project owns. */
  readonly orphans: ReadonlyArray<string>
  /** Shards of a language without a ready indexer. */
  readonly unindexed: ReadonlyArray<CodeIndexShard.Shard>
}

export type Progress = { readonly commit: string; readonly shardsDone: number; readonly shardsTotal: number }

// Process-local: a build in this process is what `index_building` and `stale` report (J2.11, J2.12).
const progress = new Map<string, Progress>()
// Plans per worktree and commit; a commit's tree never changes, so the cache only needs a bound.
const plans = new Map<string, Plan>()
const PLAN_CACHE = 16

export const building = (dir: string) => progress.get(dir)

/** Shards and their keys for the worktree's HEAD; git runs three times on a commit this process has not seen. */
export const plan = Effect.fn("CodeIndexBuild.plan")(function* (input: Input) {
  const commit = yield* CodeIndexShard.head(input.git)
  const cached = plans.get(`${input.root}\0${commit}`)
  if (cached && sameIndexers(cached, input.indexers)) return cached
  const dir = CodeIndexStore.directory(input.storeRoot, yield* CodeIndexStore.repoKey(yield* CodeIndexShard.commonDir(input.git)))
  const tree = yield* CodeIndexShard.tree(input.git, commit)
  const configs = yield* CodeIndexShard.contents(input.git, tree, CodeIndexShard.configFiles(tree))
  const discovered = CodeIndexShard.discover(tree, configs)
  const result: Plan = {
    commit, tree, dir, orphans: discovered.orphans,
    shards: discovered.shards.flatMap((shard) => {
      const indexer = input.indexers[shard.language]
      return indexer ? [{ shard, indexer, key: CodeIndexShard.key(shard, indexer, tree, configs) }] : []
    }),
    unindexed: discovered.shards.filter((shard) => !input.indexers[shard.language]),
  }
  plans.set(`${input.root}\0${commit}`, result)
  if (plans.size > PLAN_CACHE) plans.delete(plans.keys().next().value!)
  return result
})

/**
 * Build every missing shard of HEAD, one at a time (the indexer memory cap is per process), then retain. A shard
 * that fails is reported and left unbuilt; the others still land. A build already running for the same commit in
 * this process is not started twice.
 */
export const build = Effect.fn("CodeIndexBuild.build")(function* (
  input: Input & { readonly extract: Extract; readonly maxBytes?: number },
) {
  const current = yield* plan(input)
  if (progress.get(current.dir)?.commit === current.commit) return { plan: current, built: [], failed: [] }
  const present = yield* Effect.forEach(current.shards, (planned) => CodeIndexStore.exists(current.dir, planned.key))
  const missing = current.shards.filter((_, index) => !present[index])
  progress.set(current.dir, { commit: current.commit, shardsDone: 0, shardsTotal: missing.length })
  const outcomes = yield* Effect.forEach(missing, (planned, index) =>
    input.extract({ root: input.root, commit: current.commit, shard: planned.shard, indexer: planned.indexer }).pipe(
      Effect.flatMap((content) => CodeIndexStore.write(current.dir, {
        shardKey: planned.key, commit: current.commit, indexer: planned.indexer.id, version: planned.indexer.version,
      }, content)),
      Effect.as({ id: planned.shard.id, key: planned.key }),
      Effect.result,
      Effect.tap(() => Effect.sync(() =>
        progress.set(current.dir, { commit: current.commit, shardsDone: index + 1, shardsTotal: missing.length }))),
    )).pipe(Effect.ensuring(Effect.sync(() => progress.delete(current.dir))))
  const failed = outcomes.flatMap((outcome, index) =>
    outcome._tag === "Failure" ? [{ id: missing[index]!.shard.id, message: outcome.failure.message }] : [])
  const failedIds = new Set(failed.map((entry) => entry.id))
  yield* CodeIndexStore.retain(current.dir, {
    commit: current.commit, at: Date.now(),
    shards: current.shards.filter((planned) => !failedIds.has(planned.shard.id)).map((planned) => ({ id: planned.shard.id, key: planned.key })),
  }, { commits: Limits.indexCommits, bytes: input.maxBytes ?? Limits.indexBytes })
  return {
    plan: current,
    built: outcomes.flatMap((outcome) => outcome._tag === "Success" ? [outcome.success] : []),
    failed,
  }
})

function sameIndexers(plan: Plan, indexers: Input["indexers"]) {
  return plan.shards.every((planned) => indexers[planned.shard.language]?.id === planned.indexer.id &&
    indexers[planned.shard.language]?.version === planned.indexer.version) &&
    plan.unindexed.every((shard) => !indexers[shard.language])
}
