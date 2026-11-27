import { expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { Effect } from "effect"
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
const INSIDE = "inside/main.ts"
const HIDDEN = "inside/hidden.ts"
const OUTSIDE = "outside/private.ts"
const SCIP = "scip-typescript npm scope-fixture 1 inside/hidden.ts/Hidden#"
const temporary = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
).pipe(Effect.map((dir) => dir.path))

// The admitted file shares a valid shard with excluded graph targets. A separate ready project,
// an unindexed language and an orphan make full-plan metadata leaks observable independently.
const fixture = () => Effect.gen(function* () {
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
  const files = [
    { path: "inside/tsconfig.json", text: "{\"compilerOptions\":{\"strict\":true}}\n" },
    { path: "outside/tsconfig.json", text: "{\"compilerOptions\":{\"strict\":true}}\n" },
    { path: INSIDE, text: "import { outsideTarget } from './hidden'\nexport interface Contract { run(): number }\nexport class Local implements Contract { run() { return 1 } }\nexport function includedTarget() { return 1 }\nexport function caller() { includedTarget(); outsideTarget(); return 0 }\n" },
    { path: HIDDEN, text: "import type { Contract } from './main'\nexport class Hidden implements Contract { run() { return 2 } }\nexport function outsideTarget() { return 2 }\n" },
    { path: OUTSIDE, text: "export const otherProject = 'outside project'\n" },
    { path: "unindexed/pyproject.toml", text: "[project]\nname = 'outside-language'\nversion = '1'\n" },
    { path: "unindexed/private.py", text: "secret = 'outside language'\n" },
    { path: "orphan.ts", text: "export const orphanSecret = 1\n" },
  ]
  yield* Effect.forEach(files, (file) => Effect.promise(() => Bun.write(path.join(root, file.path), file.text)), { discard: true })
  yield* git(["add", "--", ...files.map((file) => file.path)])
  yield* git(["commit", "-q", "-m", "captured project authority"])
  const commit = yield* git(["rev-parse", "HEAD"])
  const captured = yield* CodeIndexShard.captured(root, commit)
  const input = { root, storeRoot, git: captured, indexers: { ts: { id: "fixture-project-indexer", version: "1" } } }
  const plan = yield* CodeIndexBuild.plan(input)
  expect(plan.shards.map((planned) => planned.shard.id).sort()).toEqual(["ts:inside", "ts:outside"])
  expect(plan.unindexed.map((shard) => shard.id)).toEqual(["py:unindexed"])
  expect(plan.orphans).toEqual(["orphan.ts"])
  const symbols: CodeIndexStore.Content["symbols"] = [
    { id: 1, scip: "scip-typescript npm scope-fixture 1 inside/main.ts/Contract#", name: "Contract", kind: "interface", path: INSIDE, startLine: 2, endLine: 2, nameLine: 2, exported: true },
    { id: 2, name: "Local", kind: "class", path: INSIDE, startLine: 3, endLine: 3, nameLine: 3, exported: true },
    { id: 3, name: "includedTarget", kind: "function", path: INSIDE, startLine: 4, endLine: 4, nameLine: 4, exported: true },
    { id: 4, name: "caller", kind: "function", path: INSIDE, startLine: 5, endLine: 5, nameLine: 5, exported: true },
    { id: 5, scip: SCIP, name: "Hidden", kind: "class", path: HIDDEN, startLine: 2, endLine: 2, nameLine: 2, exported: true },
    { id: 6, name: "outsideTarget", kind: "function", path: HIDDEN, startLine: 3, endLine: 3, nameLine: 3, exported: true },
    { id: 7, name: "otherProject", kind: "constant", path: OUTSIDE, startLine: 1, endLine: 1, nameLine: 1, exported: true },
  ]
  for (const planned of plan.shards) {
    const own = symbols.filter((symbol) => planned.shard.files.includes(symbol.path))
    const content: CodeIndexStore.Content = {
      documents: files.filter((file) => planned.shard.files.includes(file.path)).map((file) => ({
        path: file.path, language: "ts", sha256: createHash("sha256").update(file.text).digest("hex"),
        lines: file.text.split("\n").length - 1, bytes: Buffer.byteLength(file.text), layer: 1,
      })),
      symbols: own,
      occurrences: [
        ...own.map((symbol) => ({ symbolId: symbol.id, path: symbol.path, line: symbol.nameLine, col: 0,
          endLine: symbol.nameLine, endCol: 1, role: 1, opaque: false })),
        ...(planned.shard.project === "inside" ? [
          { symbolId: 3, path: INSIDE, line: 5, col: 27, endLine: 5, endCol: 41, role: 2, enclosingId: 4, opaque: false },
          { symbolId: 6, path: INSIDE, line: 5, col: 45, endLine: 5, endCol: 58, role: 2, enclosingId: 4, opaque: false },
        ] : []),
      ],
      relations: planned.shard.project === "inside"
        ? [{ symbolId: 2, targetId: 1, kind: "implementation" }, { symbolId: 5, targetId: 1, kind: "implementation" }]
        : [],
      imports: [], skipped: [],
    }
    yield* CodeIndexStore.write(plan.dir, { shardKey: planned.key, commit, indexer: planned.indexer.id, version: planned.indexer.version }, content)
  }
  const calls = { extract: 0, overlay: 0 }
  const query: CodeIndexQuery.Context = {
    ...input, readOnly: true,
    extract: () => Effect.sync(() => { calls.extract += 1; throw new Error("prepared query must not extract") }),
    overlay: () => Effect.sync(() => { calls.overlay += 1; return [] }),
  }
  return { query, scoped: { ...query, allowedFiles: new Set([INSIDE]) }, commit, calls }
})

it.live("exact file authority omits unrelated project, missing-language and orphan metadata", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    const control = yield* CodeIndexQuery.run(made.query, { op: "symbols" })
    expect(control.hits.map((hit) => hit.range.path)).toContain(OUTSIDE)
    expect(control.basis.basis.shards.map((shard) => shard.project).sort()).toEqual(["inside", "outside"])
    expect(control.basis.coverage.languagesMissing).toEqual(["py"])
    expect(control.basis.coverage.skipped).toContainEqual({ path: "orphan.ts", reason: "no-project" })
    expect(control.basis.coverage.complete).toBe(false)
    const result = yield* CodeIndexQuery.run(made.scoped, { op: "symbols" })
    expect(result.hits.some((hit) => hit.range.path === INSIDE && hit.via?.name === "Contract")).toBe(true)
    expect(result.basis.basis.shards.map((shard) => [shard.id, shard.project])).toEqual([["ts:inside", "inside"]])
    expect(result.basis.coverage).toMatchObject({ documents: 1, skipped: [], languagesMissing: [], complete: true })
    expect(result.basis.basis.commit).toBe(made.commit)
    for (const excluded of [HIDDEN, "outside", "unindexed", "orphan.ts"]) expect(JSON.stringify(result)).not.toContain(excluded)
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

for (const item of [
  { op: "callees", target: "caller", admitted: "includedTarget", excluded: "outsideTarget" },
  { op: "implementations", target: "Contract", admitted: "Local", excluded: "Hidden" },
] as const) it.live(`exact file authority confines ${item.op} targets inside a mixed shard`, () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    const control = yield* CodeIndexQuery.run(made.query, { op: item.op, name: item.target })
    expect(control.hits.map((hit) => [hit.range.path, hit.via?.name])).toContainEqual([HIDDEN, item.excluded])
    expect(control.hits.map((hit) => [hit.range.path, hit.via?.name])).toContainEqual([INSIDE, item.admitted])
    const result = yield* CodeIndexQuery.run(made.scoped, { op: item.op, name: item.target })
    expect(result.resolved?.range.path).toBe(INSIDE)
    expect(result.hits.map((hit) => [hit.range.path, hit.via?.name])).toEqual([[INSIDE, item.admitted]])
    expect(JSON.stringify(result)).not.toContain(HIDDEN)
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

for (const item of [
  { kind: "stored local", admitted: "Local", excluded: "outsideTarget", handle: "#ts:inside#6" },
  { kind: "SCIP", admitted: "Contract", excluded: "Hidden", handle: SCIP },
]) it.live(`an exact ${item.kind} symbol handle cannot bypass file authority`, () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture()
    const control = yield* CodeIndexQuery.run(made.query, { op: "definition", symbol: item.handle })
    expect(control.resolved).toMatchObject({ name: item.excluded, symbol: item.handle, range: { path: HIDDEN } })
    const inside = yield* CodeIndexQuery.run(made.query, { op: "definition", name: item.admitted })
    if (!inside.resolved) return yield* Effect.die("admitted handle control is unresolved")
    const allowed = yield* CodeIndexQuery.run(made.scoped, { op: "definition", symbol: inside.resolved.symbol })
    expect(allowed.resolved).toMatchObject({ name: item.admitted, range: { path: INSIDE } })
    const result = yield* CodeIndexQuery.run(made.scoped, { op: "definition", symbol: item.handle }).pipe(Effect.match({
      onFailure: (error) => error.code,
      onSuccess: (value) => value,
    }))
    if (typeof result === "string") expect(result).toBe("reference_invalid")
    if (typeof result !== "string") {
      expect(result.resolved).toBeUndefined()
      expect(result.candidates).toEqual([])
      expect(result.hits).toEqual([])
      expect(JSON.stringify(result)).not.toContain(HIDDEN)
      expect(JSON.stringify(result)).not.toContain(item.handle)
    }
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})
