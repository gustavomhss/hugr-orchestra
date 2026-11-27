import { expect } from "bun:test"
import { createHash } from "node:crypto"
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
import type { CodeIndex } from "../src/research-toolkit/code-index/types"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

// Frozen engagement authority: genuine captured Git bytes and a valid mixed-scope prepared SQLite shard.
// The wider local context compiles before allowedFiles exists; the old query ignores it and exposes the defect.
const it = testEffect(AppNodeBuilder.build(LayerNode.group([GitCli.node, AppProcess.node])))
const LEFT = "selected/a.ts"
const RIGHT = "selected/b.ts"
const OUTSIDE = "excluded/first.ts"
const indexers = { ts: { id: "fixture-scope-indexer", version: "1" } }
const temporary = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
).pipe(Effect.map((dir) => dir.path))

const sources = [
  { path: LEFT, text: "import { outsideOnly } from '../excluded/first'\nexport function capturedSymbol() { return 1 }\nexport function selectedConsumer() { return outsideOnly() }\n" },
  { path: RIGHT, text: "import { capturedSymbol } from './a'\nexport function selectedCaller() { return capturedSymbol() }\n" },
  { path: OUTSIDE, text: "import { capturedSymbol as capturedInside } from '../selected/a'\nexport function capturedSymbol() { return 2 }\nexport function outsideCaller() { return capturedInside() }\nexport function outsideOnly() { return 3 }\n" },
]

const fixture = (many = false) => Effect.gen(function* () {
  const root = yield* temporary
  const storeRoot = yield* temporary
  const cli = yield* GitCli.Service
  const git = (args: ReadonlyArray<string>) => cli.run([...args], { cwd: root }).pipe(Effect.map((result) => {
    expect(result.exitCode).toBe(0)
    return result.text().trim()
  }))
  yield* git(["init", "-q", "--initial-branch=base"])
  for (const args of [
    ["config", "user.email", "scope-acceptance@example.com"], ["config", "user.name", "scope-acceptance"],
    ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"],
  ]) yield* git(args)
  const files = sources.map((file) => ({ ...file, text: file.text + (!many ? "" : file.path === LEFT
    ? "export function prefixWithSeveralWords() { return 7 }\n"
    : file.path === OUTSIDE
      ? Array.from({ length: 110 }, (_, index) => `export namespace Hidden${index} { export function prefix() { return ${index} } }\n`).join("")
      : "") }))
  yield* Effect.promise(() => Bun.write(path.join(root, "tsconfig.json"), "{\"compilerOptions\":{\"strict\":true}}\n"))
  yield* Effect.forEach(files, (file) => Effect.promise(() => Bun.write(path.join(root, file.path), file.text)), { discard: true })
  yield* git(["add", "--", "tsconfig.json", ...files.map((file) => file.path)])
  yield* git(["commit", "-q", "-m", "captured scope"])
  const commit = yield* git(["rev-parse", "HEAD"])
  const captured = yield* CodeIndexShard.captured(root, commit)
  const input = { root, storeRoot, git: captured, indexers }
  const plan = yield* CodeIndexBuild.plan(input)
  expect(plan.shards).toHaveLength(1)
  const shard = plan.shards[0]
  if (!shard) return yield* Effect.die("scope fixture has no TypeScript shard")
  const symbols: CodeIndexStore.Content["symbols"] = [
    { id: 1, name: "capturedSymbol", kind: "function", path: LEFT, startLine: 2, endLine: 2, nameLine: 2, exported: true },
    { id: 2, name: "selectedConsumer", kind: "function", path: LEFT, startLine: 3, endLine: 3, nameLine: 3, exported: true },
    { id: 3, name: "selectedCaller", kind: "function", path: RIGHT, startLine: 2, endLine: 2, nameLine: 2, exported: true },
    { id: 4, name: "capturedSymbol", kind: "function", path: OUTSIDE, startLine: 2, endLine: 2, nameLine: 2, exported: true },
    { id: 5, name: "outsideCaller", kind: "function", path: OUTSIDE, startLine: 3, endLine: 3, nameLine: 3, exported: true },
    { id: 6, name: "outsideOnly", kind: "function", path: OUTSIDE, startLine: 4, endLine: 4, nameLine: 4, exported: true },
    ...(many ? [{ id: 7, name: "prefixWithSeveralWords", kind: "function", path: LEFT, startLine: 4, endLine: 4, nameLine: 4, exported: true },
      ...Array.from({ length: 110 }, (_, index) => ({ id: 100 + index, name: "prefix", kind: "function", path: OUTSIDE,
        startLine: 5 + index, endLine: 5 + index, nameLine: 5 + index, exported: true }))] : []),
  ]
  const content: CodeIndexStore.Content = {
    documents: files.map((file): CodeIndexStore.Content["documents"][number] => ({
      path: file.path, language: "ts", sha256: createHash("sha256").update(file.text).digest("hex"),
      lines: file.text.split("\n").length - 1, bytes: Buffer.byteLength(file.text), layer: 2,
    })),
    symbols,
    occurrences: [
      ...symbols.map((symbol) => ({ symbolId: symbol.id, path: symbol.path, line: symbol.nameLine, col: 0,
        endLine: symbol.nameLine, endCol: 1, role: 1, opaque: false })),
      { symbolId: 1, path: RIGHT, line: 2, col: 44, endLine: 2, endCol: 58, role: 2, enclosingId: 3, opaque: false },
      { symbolId: 1, path: OUTSIDE, line: 3, col: 42, endLine: 3, endCol: 56, role: 2, enclosingId: 5, opaque: false },
      { symbolId: 6, path: LEFT, line: 3, col: 47, endLine: 3, endCol: 58, role: 2, enclosingId: 2, opaque: false },
    ],
    relations: [],
    imports: [
      { fromPath: LEFT, line: 1, specifier: "../excluded/first", toPath: OUTSIDE, kind: "relative" },
      { fromPath: RIGHT, line: 1, specifier: "./a", toPath: LEFT, kind: "relative" },
      { fromPath: OUTSIDE, line: 1, specifier: "../selected/a", toPath: LEFT, kind: "relative" },
    ],
    skipped: [],
  }
  const meta = { shardKey: shard.key, commit, indexer: shard.indexer.id, version: shard.indexer.version }
  yield* CodeIndexStore.write(plan.dir, meta, content)
  const calls = { extract: 0, overlay: 0 }
  const query: CodeIndexQuery.Context = {
    ...input, readOnly: true,
    extract: () => Effect.sync(() => { calls.extract += 1; return content }),
    overlay: () => Effect.sync(() => { calls.overlay += 1; return [] }),
  }
  return { root, commit, plan, meta, content, query, calls }
})

const scoped = (query: CodeIndexQuery.Context, files: ReadonlyArray<string> = [LEFT, RIGHT]) => ({
  ...query, allowedFiles: new Set(files),
})

const refusal = <A, R>(effect: Effect.Effect<A, Research.Error, R>) => effect.pipe(Effect.match({
  onFailure: (error) => error.code,
  onSuccess: () => "unexpected-success",
}))

const exposed = (result: CodeIndex.CodeQueryResult) => [
  ...(result.resolved ? [result.resolved.range.path] : []), ...result.candidates.map((ref) => ref.range.path),
  ...result.hits.flatMap((hit) => [hit.range.path, ...(hit.via ? [hit.via.range.path] : [])]),
]

it.live("omitting exact file authority preserves a valid full-source prepared query", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    const result = yield* CodeIndexQuery.run(made.query, { op: "symbols" })
    expect(result.hits).toHaveLength(6)
    expect([...new Set(result.hits.map((hit) => hit.range.path))].sort()).toEqual([OUTSIDE, LEFT, RIGHT])
    expect(result.basis.coverage.documents).toBe(3)
    expect(result.basis.basis.commit).toBe(made.commit)
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

it.live("exact file authority exposes only captured in-scope symbols after live edits", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    yield* Effect.promise(() => Bun.write(path.join(made.root, LEFT), "export function liveOnly() {}\n"))
    yield* Effect.promise(() => Bun.write(path.join(made.root, OUTSIDE), "export function changedOutside() {}\n"))
    const result = yield* CodeIndexQuery.run(scoped(made.query), { op: "symbols" })
    expect(result.hits.map((hit) => [hit.range.path, hit.via?.name])).toEqual([
      [LEFT, "capturedSymbol"], [LEFT, "selectedConsumer"], [RIGHT, "selectedCaller"],
    ])
    expect(result.basis.coverage.documents).toBe(2)
    expect(result.basis.basis.commit).toBe(made.commit)
    expect(result.basis.freshness).toBe("fresh")
    expect(JSON.stringify(result)).not.toContain(OUTSIDE)
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

const direct: ReadonlyArray<{ label: string; query: CodeIndex.CodeQuery }> = [
  { label: "definition file", query: { op: "definition", name: "capturedSymbol", path: OUTSIDE } },
  { label: "definition position", query: { op: "definition", at: { path: OUTSIDE, line: 2 } } },
  { label: "references file", query: { op: "references", name: "capturedSymbol", path: OUTSIDE } },
  { label: "imports file", query: { op: "imports", path: OUTSIDE } },
  { label: "importers file", query: { op: "importers", path: OUTSIDE } },
  { label: "symbols prefix", query: { op: "symbols", path: "excluded" } },
  { label: "map prefix", query: { op: "map", path: "excluded" } },
]

for (const item of direct) it.live(`exact file authority refuses an explicit outside ${item.label}`, () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    const control = yield* CodeIndexQuery.run(made.query, item.query)
    expect(exposed(control)).toContain(OUTSIDE)
    expect(yield* refusal(CodeIndexQuery.run(scoped(made.query), item.query))).toBe("reference_invalid")
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

it.live("exact file authority applies before same-name ambiguity resolution", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    const control = yield* CodeIndexQuery.run(made.query, { op: "definition", name: "capturedSymbol" })
    expect(control.resolved).toBeUndefined()
    expect(control.candidates.map((ref) => ref.range.path).sort()).toEqual([OUTSIDE, LEFT])
    const result = yield* CodeIndexQuery.run(scoped(made.query), { op: "definition", name: "capturedSymbol" })
    expect(result.resolved).toMatchObject({ name: "capturedSymbol", range: { path: LEFT, startLine: 2, endLine: 2 } })
    expect(result.candidates).toEqual([])
    expect(result.hits.map((hit) => hit.range.path)).toEqual([LEFT])
    expect(JSON.stringify(result)).not.toContain(OUTSIDE)
  })
})

it.live("outside fuzzy matches cannot consume the scoped candidate window", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture(true)
    const exact = yield* CodeIndexQuery.run(made.query, { op: "symbols", name: "prefixWithSeveralWords", path: LEFT })
    expect(exact.hits.map((hit) => hit.via?.name)).toEqual(["prefixWithSeveralWords"])
    const control = yield* CodeIndexQuery.run(made.query, { op: "symbols", name: "prefix", limit: 200 })
    expect(control.hits.length).toBeGreaterThan(0)
    expect(control.hits.every((hit) => hit.range.path === OUTSIDE)).toBe(true)
    const result = yield* CodeIndexQuery.run(scoped(made.query), { op: "symbols", name: "prefix", limit: 200 })
    expect(result.hits.map((hit) => [hit.range.path, hit.via?.name])).toEqual([[LEFT, "prefixWithSeveralWords"]])
    expect(result.next).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain(OUTSIDE)
  })
})

const related: ReadonlyArray<"references" | "callers" | "importers"> = ["references", "callers", "importers"]
for (const op of related) it.live(`exact file authority confines ${op} and their attached symbol ranges`, () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    const query: CodeIndex.CodeQuery = op === "importers" ? { op, path: LEFT } : { op, name: "capturedSymbol", path: LEFT }
    const control = yield* CodeIndexQuery.run(made.query, query)
    expect(control.hits.map((hit) => hit.range.path)).toContain(OUTSIDE)
    const result = yield* CodeIndexQuery.run(scoped(made.query), query)
    expect(result.hits.map((hit) => hit.range.path)).toEqual([RIGHT])
    expect(exposed(result).every((file) => file === LEFT || file === RIGHT)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(OUTSIDE)
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

it.live("an in-scope import cannot disclose an outside target through via", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    const control = yield* CodeIndexQuery.run(made.query, { op: "imports", path: LEFT })
    expect(control.hits[0]?.range.path).toBe(LEFT)
    expect(control.hits[0]?.via?.range.path).toBe(OUTSIDE)
    const allowed = yield* CodeIndexQuery.run(scoped(made.query), { op: "imports", path: RIGHT })
    expect(allowed.hits.map((hit) => [hit.range.path, hit.via?.range.path])).toEqual([[RIGHT, LEFT]])
    const denied = yield* CodeIndexQuery.run(scoped(made.query), { op: "imports", path: LEFT })
    expect(denied.hits).toEqual([])
    expect(JSON.stringify(denied)).not.toContain(OUTSIDE)
    expect(JSON.stringify(denied)).not.toContain("../excluded/first")
  })
})

it.live("scope filtering precedes limit and offset and reports scoped document counts", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    const first = yield* CodeIndexQuery.run(scoped(made.query), { op: "symbols", limit: 1 })
    expect(first.hits.map((hit) => [hit.range.path, hit.via?.name])).toEqual([[LEFT, "capturedSymbol"]])
    expect(first.next).toBe(1)
    expect(first.basis.coverage.documents).toBe(2)
    const second = yield* CodeIndexQuery.run(scoped(made.query), { op: "symbols", limit: 1, offset: 1 })
    expect(second.hits.map((hit) => [hit.range.path, hit.via?.name])).toEqual([[LEFT, "selectedConsumer"]])
    expect(second.next).toBe(2)
    const last = yield* CodeIndexQuery.run(scoped(made.query), { op: "symbols", limit: 1, offset: 2 })
    expect(last.hits.map((hit) => [hit.range.path, hit.via?.name])).toEqual([[RIGHT, "selectedCaller"]])
    expect(last.next).toBeUndefined()
    expect(last.basis.bounds.truncated).toBe(false)
  })
})

it.live("map aggregates only authorized files while their directory prefix remains usable", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    const prefix = yield* CodeIndexQuery.run(scoped(made.query), { op: "symbols", path: "selected" })
    expect(prefix.hits).toHaveLength(3)
    expect(prefix.basis.coverage.documents).toBe(2)
    const result = yield* CodeIndexQuery.run(scoped(made.query, [LEFT]), { op: "map", depth: 1 })
    expect(result.hits.map((hit) => [hit.range.path, hit.range.endLine, hit.via?.kind])).toEqual([["selected", 3, "directory"]])
    expect(result.basis.coverage.documents).toBe(1)
    expect(JSON.stringify(result)).not.toContain("excluded")
  })
})

it.live("an empty exact authority returns no unqualified result instead of widening", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    const result = yield* CodeIndexQuery.run(scoped(made.query, []), { op: "symbols" })
    expect(result.hits).toEqual([])
    expect(result.candidates).toEqual([])
    expect(result.resolved).toBeUndefined()
    expect(result.next).toBeUndefined()
    expect(result.basis.coverage.documents).toBe(0)
    expect(result.basis.basis.commit).toBe(made.commit)
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

it.live("scoped output authority still validates excluded document bytes in the prepared shard", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    yield* CodeIndexStore.write(made.plan.dir, made.meta, { ...made.content,
      documents: made.content.documents.map((document) => document.path === OUTSIDE ? { ...document, sha256: "0".repeat(64) } : document),
    })
    expect(yield* refusal(CodeIndexQuery.run(scoped(made.query), { op: "symbols" }))).toBe("index_unavailable")
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

it.live("coverage from an excluded file cannot leak through a scoped query result", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    yield* CodeIndexStore.write(made.plan.dir, made.meta, { ...made.content,
      skipped: [{ path: OUTSIDE, reason: "partial-semantic-coverage" }],
    })
    const control = yield* CodeIndexQuery.run(made.query, { op: "symbols" })
    expect(control.basis.coverage.skipped).toEqual([{ path: OUTSIDE, reason: "partial-semantic-coverage" }])
    expect(control.basis.coverage.complete).toBe(false)
    const result = yield* CodeIndexQuery.run(scoped(made.query), { op: "symbols" })
    expect(result.hits).toHaveLength(3)
    expect(result.basis.coverage.skipped).toEqual([])
    expect(result.basis.coverage.complete).toBe(true)
    expect(JSON.stringify(result)).not.toContain(OUTSIDE)
  })
})
