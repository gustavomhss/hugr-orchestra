import { expect } from "bun:test"
import path from "path"
import { mkdir, readdir, symlink, writeFile } from "fs/promises"
import { readFileSync } from "fs"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchToolkit } from "../../src/research-toolkit"
import { CodeIndexQuery } from "../../src/research-toolkit/code-index/query"
import { CodeIndexShard } from "../../src/research-toolkit/code-index/shard"
import type { CodeIndex } from "../../src/research-toolkit/code-index/types"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewImpactCache } from "../../src/review-toolkit/impact-cache"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { jail } from "../lib/sandbox-host"
import { testEffect } from "../lib/effect"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const linked = process.platform === "win32" ? it.live.skip : it.live
const changed = { "src/a.ts": [{ start: 1, end: 2 }] }
const caller = { role: "call" as const, range: { path: "src/caller.ts", startLine: 40, endLine: 44 } }
const symbol = { symbol: "scip pkg changed().", name: "changed", kind: "function", range: { path: "src/a.ts", startLine: 1, endLine: 10 }, nameLine: 1, exported: true }
const ranges = { "src/caller.ts": [{ start: 40, end: 44 }] }
const empty = { items: {}, retained: { total: 0, unread: {}, items: [] }, debt: [] }
type Seen = { factory: number; roots: string[] }
type Notes = { text: Record<string, string> }
type Made = { dir: { path: string }; root: string; store: string; cache: string; sha: string; tree: string }

function answer(hits: ReadonlyArray<CodeIndex.Hit> = [caller]): CodeIndex.CodeQueryResult {
  return {
    resolved: symbol, candidates: [], hits,
    basis: {
      basis: { commit: "a".repeat(40), shards: [{ id: "ts", language: "js-ts", project: ".", indexer: "scip-typescript", version: "fixture" }] },
      execution: { op: "fixture", ms: 0 },
      coverage: { documents: 1, skipped: [], languagesMissing: [], opaqueSites: 0, complete: true },
      freshness: "fresh", bounds: { limit: 200, truncated: false },
    },
  }
}
const outline = answer([{ role: "definition", range: symbol.range, via: symbol }])
const seam = (seen: Seen, commit: string, hits: ReadonlyArray<CodeIndex.Hit> = [caller], fail = false) =>
  Effect.sync(() => {
    seen.factory += 1
    return (root: string, query: CodeIndex.CodeQuery) => {
      seen.roots.push(root)
      if (fail) return Effect.fail(new Research.Error({ code: "index_unavailable", message: "absent" }))
      const result = query.op === "symbols" ? outline : answer(hits)
      return Effect.succeed({ ...result, basis: { ...result.basis, basis: { ...result.basis.basis, commit } } })
    }
  })

const repo = Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  const store = path.join(dir.path, "store")
  const cache = path.join(dir.path, "cache")
  await mkdir(path.join(root, "src"), { recursive: true })
  await mkdir(store)
  await mkdir(cache)
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "deep@example.com")
  await git(root, "config", "user.name", "Deep")
  await writeFile(path.join(root, "src", "a.ts"), "export const a = 1\n")
  await writeFile(path.join(root, "README.md"), "notes\n")
  await writeFile(path.join(root, "bun.lock"), "")
  await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { lint: "echo mutated > src/a.ts" } }))
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await writeFile(path.join(root, "src", "a.ts"), "export const a = 2\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "head")
  return { dir, root, store, cache }
}), (made) => Effect.promise(() => made.dir[Symbol.asyncDispose]())).pipe(Effect.flatMap((made) => Effect.gen(function* () {
  const git = yield* CodeIndexShard.live(made.root)
  const sha = yield* CodeIndexShard.head(git)
  const tree = (yield* git.run(["rev-parse", "--verify", "HEAD^{tree}"], undefined)).toString("utf8").trim()
  return { ...made, sha, tree }
})))

const input = (made: Made, extra: Partial<ReviewAnalyze.RunInput> = {}): ReviewAnalyze.RunInput => ({
  worktree: made.root, base: "HEAD~1", tier: "deep", store: made.store, changed, trusted: true, lane: "no-build", packs: [], scope: "diff", ...extra,
})
function ctx(made: Made, head: ReviewAnalyze.Copy, notes: Notes, catalog = ReviewCatalog.current): ReviewAnalyze.RunContext {
  return {
    input: input(made, { catalog }), catalog,
    write: (name, text) => Effect.sync(() => {
      notes.text[name] = typeof text === "string" ? text : new TextDecoder().decode(text)
      return `review:host/${name}`
    }),
    head: Effect.succeed(head),
    base: Effect.succeed(head),
  }
}
const read = (made: Made, head: ReviewAnalyze.Copy, seen: Seen, notes: Notes, hits?: ReadonlyArray<CodeIndex.Hit>, fail = false) =>
  Effect.gen(function* () {
    const git = yield* CodeIndexShard.live(made.root)
    const commit = yield* CodeIndexShard.head(git)
    return yield* ReviewImpactCache.read(ctx(made, head, notes)).pipe(Effect.provideService(ReviewImpactCache.ReadCache, seam(seen, commit, hits, fail)))
  })
function built(on: boolean) {
  const current = ReviewCatalog.current
  return { ...current, route: { ...current.route, tiers: current.route.tiers.map((tier) => tier.id === "deep" ? { ...tier, built: on, runs: "deep" } : tier) } }
}
function retained(result: ReviewImpactCache.Result, notes: Notes) {
  expect(result.check).toMatchObject({ ...host, status: "not-run" })
  expect(result.check.uri).toContain("raw/blast-radius.json")
  const artifact = JSON.parse(notes.text["raw/blast-radius.json"] ?? "")
  expect(artifact).toHaveProperty("observations")
  expect(artifact.result).toMatchObject({ status: "not-run", ranges: {} })
}
const host = { id: "repo:blast-radius", pack: "repo", version: "review-v2", lane: "no-build", workspaceExecuted: false }

it.live("clean HEAD commit and clean worktree are accepted and the artifact keeps observations", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repo
  for (const revision of ["HEAD", undefined] as const) {
    const snapshot = yield* ReviewScratch.create(revision ? { worktree: made.root, revision } : { worktree: made.root, tree: true })
    expect(ReviewScratch.pristine(snapshot, made.tree)).toBe(true)
    const seen: Seen = { factory: 0, roots: [] }
    const notes: Notes = { text: {} }
    const result = yield* read(made, { snapshot }, seen, notes)
    expect(seen.factory).toBe(1)
    expect(new Set(seen.roots)).toEqual(new Set([made.root]))
    expect(result.ranges).toEqual(ranges)
    expect(result.check).toMatchObject({ ...host, status: "pass" })
    expect(result.check.uri).toContain("raw/blast-radius.json")
    const body = JSON.parse(notes.text["raw/blast-radius.json"] ?? "")
    expect(body).toHaveProperty("observations")
    expect(body).toHaveProperty("result")
    expect(JSON.stringify(body.observations)).toContain(made.sha)
  }
}), 120_000)

it.live("staged, unstaged, untracked and historical snapshots are refused before the cache factory", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const refuse = (prepare: (root: string) => Promise<void>, revision?: string) => Effect.gen(function* () {
    const made = yield* repo
    yield* Effect.promise(() => prepare(made.root))
    const seen: Seen = { factory: 0, roots: [] }
    const snapshot = yield* ReviewScratch.create(revision ? { worktree: made.root, revision } : { worktree: made.root, tree: true })
    const notes: Notes = { text: {} }
    const result = yield* read(made, { snapshot }, seen, notes)
    retained(result, notes)
    expect(seen.factory).toBe(0)
    expect(result.ranges).toEqual({})
    expect(result.check).toMatchObject({ ...host, status: "not-run" })
    expect(result.check.reason).not.toBe("not-built")
  })
  yield* refuse(() => Promise.resolve(), "HEAD~1")
  yield* refuse(async (root) => { await writeFile(path.join(root, "src/a.ts"), "export const a = 9\n"); await git(root, "add", "src/a.ts") })
  yield* refuse((root) => writeFile(path.join(root, "src/a.ts"), "export const a = 8\n"))
  yield* refuse((root) => writeFile(path.join(root, "src/new.ts"), "export {}\n"))
}), 120_000)

it.live("an index failure or a denied copy is not-run with empty ranges and does not widen", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repo
  const snapshot = yield* ReviewScratch.create({ worktree: made.root, revision: "HEAD" })
  const failed: Seen = { factory: 0, roots: [] }
  const notes: Notes = { text: {} }
  const index = yield* read(made, { snapshot }, failed, notes, [caller], true)
  retained(index, notes)
  expect(failed.factory).toBe(1)
  expect(index.ranges).toEqual({})
  expect(`${index.check.reason}\n${notes.text["raw/blast-radius.json"] ?? ""}`).toContain("index-unavailable")
  const denied: Seen = { factory: 0, roots: [] }
  const deniedNotes: Notes = { text: {} }
  const closed = yield* read(made, { failed: "scratch: denied" }, denied, deniedNotes)
  retained(closed, deniedNotes)
  expect(denied.factory).toBe(0)
  expect(closed.ranges).toEqual({})
  expect(closed.check.reason).not.toBe("not-built")
}), 120_000)

linked("a symlink or outside caller is refused with no partial widen", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repo
  yield* Effect.promise(async () => {
    await mkdir(path.join(made.dir.path, "outside"))
    await writeFile(path.join(made.dir.path, "outside", "secret.txt"), "secret\n")
    await symlink(path.join(made.dir.path, "outside"), path.join(made.root, "escape"))
    await git(made.root, "add", "escape")
    await git(made.root, "commit", "-q", "-m", "link")
  })
  const snapshot = yield* ReviewScratch.create({ worktree: made.root, revision: "HEAD" })
  const seen: Seen = { factory: 0, roots: [] }
  for (const file of ["escape/secret.txt", "../outside.ts"]) {
    const notes: Notes = { text: {} }
    const result = yield* read(made, { snapshot }, seen, notes, [caller, { ...caller, range: { path: file, startLine: 1, endLine: 1 } }])
    retained(result, notes)
    expect(result.ranges).toEqual({})
    expect(result.check.status).toBe("not-run")
    expect(result.check.reason).not.toBe("not-built")
  }
  expect(seen.factory).toBe(2)
}), 120_000)

it.live("a change with no indexed source does not build the cache", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repo
  const snapshot = yield* ReviewScratch.create({ worktree: made.root, tree: true })
  const seen: Seen = { factory: 0, roots: [] }
  const notes: Notes = { text: {} }
  const only = yield* ReviewImpactCache.read({ ...ctx(made, { snapshot }, notes), input: input(made, { changed: { "README.md": [{ start: 1, end: 1 }] } }) }).pipe(
    Effect.provideService(ReviewImpactCache.ReadCache, seam(seen, made.sha)),
  )
  expect(seen.factory).toBe(0)
  expect(only.ranges).toEqual({})
  expect(only.check.status).toBe("pass")
  expect(JSON.parse(notes.text["raw/blast-radius.json"] ?? "").result.queries).toBe(0)
}), 120_000)

it.live("the real cache on an empty root records index_unavailable and writes no tool or build output", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repo
  const snapshot = yield* ReviewScratch.create({ worktree: made.root, revision: "HEAD" })
  const engines: string[][] = []
  const git = yield* CodeIndexShard.live(made.root)
  const before = yield* git.run(["status", "--porcelain=v1", "-uall"], undefined)
  const result = yield* ReviewImpactCache.read(ctx(made, { snapshot }, { text: {} })).pipe(
    Effect.provideService(ResearchToolkit.Root, made.cache),
    Effect.provideService(ReviewImpactCache.MakeEngine, (deps) => {
      engines.push(Object.keys(deps))
      return CodeIndexQuery.engine(deps)
    }),
  )
  expect(engines).toHaveLength(1)
  expect(engines[0]).not.toContain("extract")
  expect((yield* git.run(["status", "--porcelain=v1", "-uall"], undefined)).toString()).toBe(before.toString())
  expect(result.ranges).toEqual({})
  expect(result.check).toMatchObject({ ...host, status: "not-run" })
  expect(result.check.reason ?? "").toContain("index-unavailable")
  const entries = yield* Effect.promise(() => readdir(made.cache, { recursive: true }))
  expect(entries).toEqual([])
}), 120_000)

it.live("production Deep asks for impact before packs and other tiers do not", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repo
  const seen: Seen = { factory: 0, roots: [] }
  const radius: unknown[] = []
  const result = yield* ReviewAnalyze.run(input(made, { catalog: ReviewCatalog.current }), (entry) => {
    radius.push(entry.blastRadius ?? null)
    return empty
  }).pipe(Effect.provideService(ReviewImpactCache.ReadCache, seam(seen, made.sha)))
  expect(radius).toEqual([ranges])
  expect(result.checks.find((entry) => entry.id === "repo:blast-radius")).toMatchObject({ ...host, status: "pass" })
  expect(ReviewCatalog.current.route.tiers.find((tier) => tier.id === "deep")?.built).toBe(true)
  const fallback = { ...built(true), route: { ...built(true).route, tiers: built(true).route.tiers.map((tier) => tier.id === "deep" ? { ...tier, runs: "standard" } : tier) } }
  const die = () => Effect.die("ReadImpact must not run")
  for (const [tier, catalog] of [["standard", built(true)], ["quick", built(true)], ["deep", built(false)], ["deep", fallback]] as const)
    yield* ReviewAnalyze.run(input(made, { tier, catalog }), () => empty).pipe(Effect.provideService(ReviewAnalyze.ReadImpact, die))
}), 120_000)


it.live.skipIf(!jail)("impact reads the pristine copy before a repository gate mutates it", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repo
  const seen: Seen = { factory: 0, roots: [] }
  const snapshotRoots: string[] = []
  const result = yield* ReviewAnalyze.run(input(made, { catalog: built(true), packs: ["repo"], lane: "repo" }), () => {
    expect(snapshotRoots).toHaveLength(1)
    expect(readFileSync(path.join(snapshotRoots[0], "src/a.ts"), "utf8")).toContain("mutated")
    return empty
  }).pipe(
    Effect.provideService(ReviewImpactCache.ReadCache, seam(seen, made.sha)),
    Effect.provideService(ReviewAnalyze.ReadImpact, (context) => Effect.gen(function* () {
      const copy = yield* context.head
      if ("failed" in copy) return yield* Effect.die(copy.failed)
      snapshotRoots.push(copy.snapshot.root)
      expect(readFileSync(path.join(copy.snapshot.root, "src/a.ts"), "utf8")).toContain("a = 2")
      return yield* ReviewImpactCache.read(context)
    })),
  )
  expect(result.checks.find((check) => check.id === "repo:bun run lint")).toMatchObject({ status: "pass", workspaceExecuted: true })
  expect(readFileSync(path.join(made.root, "src/a.ts"), "utf8")).toContain("a = 2")
}), 120_000)
