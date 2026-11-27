import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { GitCli } from "@orchestra/core/git-cli"
import { AppProcess } from "@orchestra/core/process"
import { CodeIndexBuild } from "../src/research-toolkit/code-index/build"
import { CodeIndexQuery } from "../src/research-toolkit/code-index/query"
import { CodeIndexShard } from "../src/research-toolkit/code-index/shard"
import { CodeIndexStore } from "../src/research-toolkit/code-index/store"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([GitCli.node, AppProcess.node])))
const indexers = { ts: { id: "prepared-plan-fixture", version: "1" } }
const source = (name: string) => `export function ${name}() { return 1 }\n`
const temporary = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
).pipe(Effect.map((dir) => dir.path))

const fixture = Effect.gen(function* () {
  const root = yield* temporary
  const storeRoot = yield* temporary
  const cli = yield* GitCli.Service
  const git = (args: string[]) => cli.run(args, { cwd: root }).pipe(Effect.map((result) => {
    expect(result.exitCode).toBe(0)
    return result.text().trim()
  }))
  yield* git(["init", "-q", "--initial-branch=base"])
  for (const [key, value] of [
    ["user.email", "code-plan@example.com"], ["user.name", "code-plan"],
    ["commit.gpgsign", "false"], ["core.autocrlf", "false"],
  ] as const) yield* git(["config", key, value])
  yield* Effect.promise(() => Bun.write(path.join(root, "tsconfig.json"), "{\"compilerOptions\":{\"strict\":true}}\n"))
  yield* Effect.promise(() => Bun.write(path.join(root, "src/a.ts"), source("originalSymbol")))
  yield* git(["add", "--", "tsconfig.json", "src/a.ts"])
  yield* git(["commit", "-q", "-m", "original"])
  const commit = yield* git(["rev-parse", "HEAD"])
  const blob = yield* git(["rev-parse", "HEAD:src/a.ts"])
  return { root, storeRoot, git, commit, blob }
})

const prepare = (plan: CodeIndexBuild.Plan, name: string) => Effect.gen(function* () {
  const shard = plan.shards[0]
  if (!shard) return yield* Effect.die("fixture has no TypeScript shard")
  yield* CodeIndexStore.write(plan.dir, {
    shardKey: shard.key, commit: plan.commit, indexer: shard.indexer.id, version: shard.indexer.version,
  }, {
    documents: [{ path: "src/a.ts", language: "ts", sha256: createHash("sha256").update(source(name)).digest("hex"),
      lines: 1, bytes: Buffer.byteLength(source(name)), layer: 2 }],
    symbols: [{ id: 1, name, kind: "function", path: "src/a.ts", startLine: 1, endLine: 1, nameLine: 1, exported: true }],
    occurrences: [], relations: [], imports: [], skipped: [],
  })
  return shard
})

const refusal = <A, R>(effect: Effect.Effect<A, Research.Error, R>) => effect.pipe(Effect.match({
  onFailure: (error) => error.code,
  onSuccess: () => "unexpected-success" as const,
}))

it.live("readOnly refuses a replaced live plan instead of labeling B's cache as captured A", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    yield* Effect.promise(() => Bun.write(path.join(made.root, "src/a.ts"), source("replacementSymbol")))
    yield* made.git(["add", "--", "src/a.ts"])
    yield* made.git(["commit", "-q", "-m", "replacement"])
    const replacement = yield* made.git(["rev-parse", "HEAD"])
    const blob = yield* made.git(["rev-parse", "HEAD:src/a.ts"])
    expect(blob).not.toBe(made.blob)
    const live = yield* CodeIndexShard.live(made.root)
    const plan = yield* CodeIndexBuild.plan({ root: made.root, storeRoot: made.storeRoot, git: live, indexers })
    expect(plan.commit).toBe(replacement)
    const shard = yield* prepare(plan, "replacementSymbol")
    yield* made.git(["reset", "--hard", made.commit])
    yield* made.git(["replace", made.commit, replacement])
    const warmed = yield* CodeIndexBuild.plan({ root: made.root, storeRoot: made.storeRoot, git: live, indexers })
    expect(warmed.commit).toBe(made.commit)
    expect(warmed.tree.blobs.get("src/a.ts")).toBe(blob)
    expect(warmed.shards[0]?.key).toBe(shard.key)
    const captured = yield* CodeIndexShard.captured(made.root, made.commit)
    const tree = yield* CodeIndexShard.tree(captured, made.commit)
    expect(tree.blobs.get("src/a.ts")).toBe(made.blob)
    expect(yield* refusal(CodeIndexQuery.run({
      root: made.root, storeRoot: made.storeRoot, git: captured, indexers,
      readOnly: true, overlay: () => Effect.succeed([]),
    }, { op: "symbols" }))).toBe("index_unavailable")
    expect(yield* CodeIndexStore.exists(plan.dir, shard.key)).toBe(true)
  })
})

it.live("readOnly uses the requested store root after the same commit was planned in another store", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    const captured = yield* CodeIndexShard.captured(made.root, made.commit)
    const input = { root: made.root, storeRoot: made.storeRoot, git: captured, indexers }
    const plan = yield* CodeIndexBuild.plan(input)
    const shard = yield* prepare(plan, "originalSymbol")
    const query = { ...input, readOnly: true, overlay: () => Effect.succeed([]) }
    const control = yield* CodeIndexQuery.run(query, { op: "symbols" })
    expect(control.hits.map((hit) => hit.via?.name)).toEqual(["originalSymbol"])
    expect(control.basis.basis.commit).toBe(made.commit)
    const storeRoot = yield* temporary
    const common = yield* CodeIndexShard.commonDir(captured)
    const repo = yield* CodeIndexStore.repoKey(common)
    const directory = CodeIndexStore.directory(storeRoot, repo)
    expect(existsSync(directory)).toBe(false)
    expect(yield* refusal(CodeIndexQuery.run({ ...query, storeRoot }, { op: "symbols" }))).toBe("index_unavailable")
    expect(existsSync(directory)).toBe(false)
    expect(yield* CodeIndexStore.exists(plan.dir, shard.key)).toBe(true)
  })
})
