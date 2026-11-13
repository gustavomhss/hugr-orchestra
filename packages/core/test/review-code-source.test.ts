import { expect } from "bun:test"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { GitCli } from "@orchestra/core/git-cli"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { ReviewGit } from "../src/review-toolkit/git"
import { CodeIndexBuild } from "../src/research-toolkit/code-index/build"
import { CodeIndexQuery } from "../src/research-toolkit/code-index/query"
import { CodeIndexShard } from "../src/research-toolkit/code-index/shard"
import { CodeIndexStore } from "../src/research-toolkit/code-index/store"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([GitCli.node, AppProcess.node])))
const storeDirectory = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
).pipe(Effect.map((dir) => dir.path))

const indexers = { ts: { id: "fixture-indexer", version: "1" } }
const limits = { commits: 4, bytes: 10_000_000_000 }

const refused = <A, R>(effect: Effect.Effect<A, Research.Error, R>) =>
  effect.pipe(Effect.match({
    onFailure: (error) => error.code,
    onSuccess: () => "unexpected-success" as const,
  }))

const repo = (sha256 = false) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const dir = yield* Effect.promise(() => tmpdir())
      const git = yield* GitCli.Service
      const cwd = dir.path
      const init = ["init", "-q", "--initial-branch=base", ...(sha256 ? ["--object-format=sha256"] : [])]
      expect((yield* git.run(init, { cwd })).exitCode).toBe(0)
      for (const args of [
        ["config", "user.email", "code-source@example.com"],
        ["config", "user.name", "code-source"],
        ["config", "commit.gpgsign", "false"],
        ["config", "core.autocrlf", "false"],
      ]) expect((yield* git.run(args, { cwd })).exitCode).toBe(0)
      return { cwd, git, dir }
    }),
    (made) => Effect.promise(() => made.dir[Symbol.asyncDispose]()),
  )

const commit = (git: GitCli.Interface, cwd: string, files: ReadonlyArray<readonly [string, string]>, message: string) =>
  Effect.gen(function* () {
    yield* Effect.promise(() => Promise.all(files.map(([name, text]) => Bun.write(`${cwd}/${name}`, text))))
    expect((yield* git.run(["add", ...files.map(([name]) => name)], { cwd })).exitCode).toBe(0)
    expect((yield* git.run(["commit", "-m", message], { cwd })).exitCode).toBe(0)
    return (yield* git.run(["rev-parse", "HEAD"], { cwd })).stdout.toString("utf8").trim()
  })

const oid = (git: GitCli.Interface, cwd: string, rev: string) =>
  git.run(["rev-parse", rev], { cwd }).pipe(Effect.map((result) => result.stdout.toString("utf8").trim()))

const content = (name: string): CodeIndexStore.Content => ({
  documents: [{ path: "a.ts", language: "ts", sha256: "seed", lines: 1, bytes: name.length, layer: 2 }],
  symbols: [{ id: 1, name, kind: "function", path: "a.ts", startLine: 1, endLine: 1, nameLine: 1, exported: true }],
  occurrences: [], relations: [], imports: [], skipped: [],
})

const project = (git: GitCli.Interface, cwd: string, text: string, message: string) =>
  commit(git, cwd, [["tsconfig.json", "{\"compilerOptions\":{\"strict\":true}}\n"], ["a.ts", text]], message)

it.live("captured view keeps the original commit, tree and empty dirty set after live HEAD moves", () => {
  expectSpawn(import.meta.path)
  expect(ReviewGit.environment).toEqual({
    GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "", GIT_TERMINAL_PROMPT: "0",
  })
  return Effect.gen(function* () {
    const made = yield* repo()
    const first = yield* commit(made.git, made.cwd, [["a.ts", "original\n"]], "first")
    const blob = yield* oid(made.git, made.cwd, "HEAD:a.ts")
    const view = yield* CodeIndexShard.captured(made.cwd, first)
    yield* commit(made.git, made.cwd, [["b.ts", "next\n"]], "second")
    yield* Effect.promise(() => Bun.write(`${made.cwd}/a.ts`, "dirty\n"))
    const head = yield* CodeIndexShard.head(view)
    const tree = yield* CodeIndexShard.tree(view, head)
    expect(head).toBe(first)
    expect(tree.commit).toBe(first)
    expect(tree.blobs.get("a.ts")).toBe(blob)
    expect(yield* CodeIndexShard.dirty(view)).toEqual([])
  })
})

it.live("accepts a real sha256 repository capture oid", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* repo(true)
    const first = yield* commit(made.git, made.cwd, [["a.ts", "sha\n"]], "sha")
    expect(first).toHaveLength(64)
    const view = yield* CodeIndexShard.captured(made.cwd, first)
    expect(yield* CodeIndexShard.head(view)).toBe(first)
  })
})

it.live("refuses invalid, option-like, non-commit and uppercase oids, and a read outside the allowed set", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* repo()
    const first = yield* commit(made.git, made.cwd, [["a.ts", "original\n"]], "first")
    const blob = yield* oid(made.git, made.cwd, "HEAD:a.ts")
    for (const bad of ["not-a-commit", "--bare", blob, first.toUpperCase()])
      expect(yield* refused(CodeIndexShard.captured(made.cwd, bad))).not.toBe("unexpected-success")
    const view = yield* CodeIndexShard.captured(made.cwd, first)
    expect(yield* refused(view.run(["config", "--get", "core.bare"]))).not.toBe("unexpected-success")
  })
})

it.live("reads the original blob when a replace ref would show the later tree", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* repo()
    const first = yield* commit(made.git, made.cwd, [["a.ts", "original\n"]], "first")
    yield* commit(made.git, made.cwd, [["a.ts", "replaced\n"]], "second")
    expect((yield* made.git.run(["replace", first, "HEAD"], { cwd: made.cwd })).exitCode).toBe(0)
    const live = yield* CodeIndexShard.live(made.cwd)
    const wrong = yield* CodeIndexShard.contents(live, yield* CodeIndexShard.tree(live, first), ["a.ts"])
    expect(wrong.get("a.ts")).toBe("replaced\n")
    const view = yield* CodeIndexShard.captured(made.cwd, first)
    const bytes = yield* CodeIndexShard.contents(view, yield* CodeIndexShard.tree(view, first), ["a.ts"])
    expect(bytes.get("a.ts")).toBe("original\n")
  })
})

it.live("queries an exact fresh sqlite cache without building an indexer", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* repo()
    const storeRoot = yield* storeDirectory
    yield* project(made.git, made.cwd, "export function symbol1() { return 1 }\n", "indexed")
    const git = yield* CodeIndexShard.live(made.cwd)
    const plan = yield* CodeIndexBuild.plan({ root: made.cwd, git, storeRoot, indexers })
    const planned = plan.shards[0]
    expect(planned).toBeDefined()
    yield* CodeIndexStore.write(plan.dir, {
      shardKey: planned!.key, commit: plan.commit, indexer: "fixture-indexer", version: "1",
    }, content("symbol1"))
    const result = yield* CodeIndexQuery.run({
      root: made.cwd, git, storeRoot, indexers, readOnly: true, overlay: () => Effect.succeed([]),
    }, { op: "symbols", name: "symbol1" })
    expect(result.basis.freshness).toBe("fresh")
    expect(result.basis.basis.commit).toBe(plan.commit)
    expect(JSON.stringify(result.hits)).toContain("symbol1")
  })
})

it.live("refuses a missing cache before extract when readOnly is set", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* repo()
    const storeRoot = yield* storeDirectory
    yield* project(made.git, made.cwd, "export function symbol1() { return 1 }\n", "indexed")
    const git = yield* CodeIndexShard.live(made.cwd)
    const calls = { n: 0 }
    const extract: CodeIndexBuild.Extract = () => Effect.sync(() => {
      calls.n += 1
      return content("symbol1")
    })
    const mark = yield* refused(CodeIndexQuery.run({
      root: made.cwd, git, storeRoot, indexers, readOnly: true, extract, overlay: () => Effect.succeed([]),
    }, { op: "symbols", name: "symbol1" }))
    yield* Effect.sleep("200 millis")
    expect(mark).toBe("index_unavailable")
    expect(calls.n).toBe(0)
  })
})

it.live("refuses a retained older shard when readOnly is set, and still serves it when omitted", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* repo()
    const storeRoot = yield* storeDirectory
    yield* project(made.git, made.cwd, "export function symbol1() { return 1 }\n", "old")
    const git = yield* CodeIndexShard.live(made.cwd)
    const older = yield* CodeIndexBuild.plan({ root: made.cwd, git, storeRoot, indexers })
    const previous = older.shards[0]
    expect(previous).toBeDefined()
    yield* CodeIndexStore.write(older.dir, {
      shardKey: previous!.key, commit: older.commit, indexer: "fixture-indexer", version: "1",
    }, content("staleSymbol"))
    yield* CodeIndexStore.retain(older.dir, {
      commit: older.commit, at: 1, shards: [{ id: previous!.shard.id, key: previous!.key }],
    }, limits)
    yield* project(made.git, made.cwd, "export function symbol1() { return 2 }\n", "new")
    const opened = yield* CodeIndexQuery.run({
      root: made.cwd, git, storeRoot, indexers, overlay: () => Effect.succeed([]),
    }, { op: "symbols", name: "staleSymbol" })
    expect(opened.basis.freshness).toBe("stale")
    const mark = yield* refused(CodeIndexQuery.run({
      root: made.cwd, git, storeRoot, indexers, readOnly: true, overlay: () => Effect.succeed([]),
    }, { op: "symbols", name: "staleSymbol" }))
    expect(mark).toBe("index_unavailable")
  })
})
