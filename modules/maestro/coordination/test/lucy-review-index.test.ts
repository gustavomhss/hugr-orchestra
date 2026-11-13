import { randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect } from "bun:test"
import { Effect, Layer, Scope } from "effect"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { AppProcess } from "@orchestra/core/process"
import { Project } from "@orchestra/core/project"
import { ReviewGit } from "@orchestra/core/review-toolkit/git"
import { CodeIndexBuild } from "@orchestra/core/research-toolkit/code-index/build"
import { CodeIndexExtract } from "@orchestra/core/research-toolkit/code-index/extract"
import { CodeIndexShard } from "@orchestra/core/research-toolkit/code-index/shard"
import { CodeIndexStore } from "@orchestra/core/research-toolkit/code-index/store"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { AbsolutePath } from "@orchestra/core/schema"
import { Research } from "@orchestra/schema/research"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"
import { testEffect } from "../../../../packages/core/test/lib/effect"
import { reviewIndex } from "../src/v2/tools/research-index"

// Draft RED: reviewIndex is unstubbed. Not a green run. Lead stubs before typecheck.
const it = testEffect(AppNodeBuilder.build(LayerNode.group([GitCli.node, AppProcess.node])))
const refused = <A, R>(effect: Effect.Effect<A, Research.Error, R>) =>
  effect.pipe(Effect.match({ onFailure: (error) => error.code, onSuccess: () => "unexpected-success" as const }))
const temp = (prefix: string) => Effect.acquireRelease(
  Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), prefix))),
  (dir) => Effect.promise(() => fs.rm(dir, { recursive: true, force: true })),
)
const host = (root: string, data: string) => AppNodeBuilder.build(
  LayerNode.group([GitCli.node, AppProcess.node, Config.node, Location.node]), [
    [Global.node, Global.layerWith({ data })],
    [Location.node, Layer.succeed(Location.Service, Location.Service.of({
      directory: AbsolutePath.make(root), project: { id: Project.ID.global, directory: AbsolutePath.make(root) },
    }))],
  ])
const run = <A, E>(body: (made: { root: string; store: string; snap: string }) => Effect.Effect<A, E, GitCli.Service | AppProcess.Service | Config.Service | Scope.Scope>) =>
  Effect.scoped(Effect.gen(function* () {
    const root = yield* temp("lucy-b-root-")
    const data = yield* temp("lucy-b-data-")
    const store = yield* temp("lucy-b-store-")
    const snap = yield* temp("lucy-b-snap-")
    return yield* body({ root, store, snap }).pipe(Effect.provide(host(root, data)), Effect.provideService(ResearchToolkit.Root, store))
  }))
const ok = (git: GitCli.Interface, cwd: string, args: string[]) =>
  git.run(args, { cwd }).pipe(Effect.tap((result) => expect(result.exitCode).toBe(0)))
const seed = (root: string, snap: string, symbol: string) => Effect.gen(function* () {
  const git = yield* GitCli.Service
  for (const args of [["init", "-q", "--initial-branch=base"], ["config", "user.email", "code-source@example.com"], ["config", "user.name", "code-source"], ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"]])
    yield* ok(git, root, args)
  const text = `export function ${symbol}() { return 1 }\n`
  yield* Effect.promise(() => Promise.all([
    fs.writeFile(path.join(root, "tsconfig.json"), "{\"compilerOptions\":{\"strict\":true}}\n"),
    fs.writeFile(path.join(root, "a.ts"), text), fs.writeFile(path.join(snap, "a.ts"), text),
  ]))
  yield* ok(git, root, ["add", "tsconfig.json", "a.ts"])
  yield* ok(git, root, ["commit", "-m", "indexed"])
  const commit = (yield* git.run(["rev-parse", "HEAD"], { cwd: root })).stdout.toString("utf8").trim()
  expect(commit).toMatch(/^[0-9a-f]{40,64}$/)
  return { git, commit, source: { directory: snap, worktree: root, commit }, query: { op: "symbols" as const, name: symbol } }
})
const prepare = (root: string, store: string, commit: string, symbol: string) => Effect.gen(function* () {
  const indexers = yield* CodeIndexExtract.indexers()
  const ts = indexers.ts
  if (!ts) return yield* Effect.die("shipped typescript indexer identity missing")
  const view = yield* CodeIndexShard.captured(root, commit)
  const plan = yield* CodeIndexBuild.plan({ root, git: view, storeRoot: store, indexers })
  const planned = plan.shards[0]
  if (!planned || plan.commit !== commit) return yield* Effect.die("plan did not pin the captured commit")
  yield* CodeIndexStore.write(plan.dir, { shardKey: planned.key, commit, indexer: ts.id, version: ts.version }, {
    documents: [{ path: "a.ts", language: "ts", sha256: "seed", lines: 1, bytes: symbol.length, layer: 2 }],
    symbols: [{ id: 1, name: symbol, kind: "function", path: "a.ts", startLine: 1, endLine: 1, nameLine: 1, exported: true }],
    occurrences: [], relations: [], imports: [], skipped: [],
  })
  yield* CodeIndexStore.retain(plan.dir, { commit, at: 1, shards: [{ id: planned.shard.id, key: planned.key }] }, {
    commits: ResearchToolkit.Limits.indexCommits, bytes: ResearchToolkit.Limits.indexBytes,
  })
})
const narrow = Effect.gen(function* () {
  return { config: yield* Config.Service, git: yield* GitCli.Service, processes: yield* AppProcess.Service }
})

it.live("serves a fresh prepared store for the captured commit", () => {
  expectSpawn(import.meta.path)
  const symbol = `sym_${randomBytes(4).toString("hex")}`
  return run((made) => Effect.gen(function* () {
    const seeded = yield* seed(made.root, made.snap, symbol)
    const services = yield* narrow
    if (process.platform === "win32") return expect(yield* refused(reviewIndex(services, seeded.source, seeded.query))).toBe("index_unavailable")
    yield* prepare(made.root, made.store, seeded.commit, symbol)
    const result = yield* reviewIndex(services, seeded.source, seeded.query)
    expect(result.basis.freshness).toBe("fresh")
    expect(result.basis.basis.commit).toBe(seeded.commit)
    expect(JSON.stringify(result.hits)).toContain(symbol)
  }))
})

it.live("refuses noncommit, missing cache, and live HEAD drift before query", () => {
  expectSpawn(import.meta.path)
  const symbol = `sym_${randomBytes(4).toString("hex")}`
  return run((made) => Effect.gen(function* () {
    const seeded = yield* seed(made.root, made.snap, symbol)
    const services = yield* narrow
    expect(yield* refused(reviewIndex(services, { directory: made.snap, worktree: made.root }, seeded.query))).toBe("index_unavailable")
    expect(yield* refused(reviewIndex(services, { ...seeded.source, commit: "not-a-commit" }, seeded.query))).toBe("index_unavailable")
    if (process.platform === "win32") return
    const empty = yield* temp("lucy-b-empty-")
    expect(yield* refused(reviewIndex(services, seeded.source, seeded.query).pipe(Effect.provideService(ResearchToolkit.Root, empty)))).toBe("index_unavailable")
    yield* prepare(made.root, made.store, seeded.commit, symbol)
    yield* ok(seeded.git, made.root, ["commit", "--allow-empty", "-m", "moved"])
    expect(yield* refused(reviewIndex(services, seeded.source, seeded.query))).toBe("index_unavailable")
  }))
})

it.live("refuses when live HEAD moves between the pre and post checks", () => {
  expectSpawn(import.meta.path)
  const symbol = `sym_${randomBytes(4).toString("hex")}`
  return run((made) => Effect.gen(function* () {
    const seeded = yield* seed(made.root, made.snap, symbol)
    const services = yield* narrow
    if (process.platform === "win32") return expect(yield* refused(reviewIndex(services, seeded.source, seeded.query))).toBe("index_unavailable")
    yield* prepare(made.root, made.store, seeded.commit, symbol)
    const calls = { n: 0 }
    const git: GitCli.Interface = { ...seeded.git, run: (args, opts) => {
      const head = args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "HEAD^{commit}" && opts.cwd === made.root
      if (!head) return seeded.git.run(args, opts)
      expect(opts.env).toEqual(ReviewGit.environment)
      expect(opts.maxOutputBytes).toBe(256)
      expect(opts.timeout).toBe("5 seconds")
      calls.n += 1
      if (calls.n !== 2) return seeded.git.run(args, opts)
      return ok(seeded.git, made.root, ["commit", "--allow-empty", "-m", "moved"]).pipe(Effect.flatMap(() => seeded.git.run(args, opts)))
    } }
    expect(yield* refused(reviewIndex({ ...services, git }, seeded.source, seeded.query))).toBe("index_unavailable")
    expect(calls.n).toBeGreaterThanOrEqual(2)
  }))
})
