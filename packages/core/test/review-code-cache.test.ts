import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
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

// Frozen cache acceptance: real Git blobs and SQLite, with no executable indexer or replacement engine.
const it = testEffect(AppNodeBuilder.build(LayerNode.group([GitCli.node, AppProcess.node])))
const source = "export function capturedSymbol() { return 1 }\n"
const indexers = { ts: { id: "fixture-prepared-only", version: "1" } }
const temporary = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
).pipe(Effect.map((dir) => dir.path))

const content = (file = "src/a.ts", digest = createHash("sha256").update(source).digest("hex")): CodeIndexStore.Content => ({
  documents: [{ path: file, language: "ts", sha256: digest, lines: 1, bytes: Buffer.byteLength(source), layer: 2 }],
  symbols: [{ id: 1, name: "capturedSymbol", kind: "function", path: file, startLine: 1, endLine: 1, nameLine: 1, exported: true }],
  occurrences: [], relations: [], imports: [], skipped: [],
})

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
    ["user.email", "cache-acceptance@example.com"], ["user.name", "cache-acceptance"],
    ["commit.gpgsign", "false"], ["core.autocrlf", "false"],
  ] as const) yield* git(["config", key, value])
  yield* Effect.promise(() => Bun.write(path.join(root, "tsconfig.json"), "{\"compilerOptions\":{\"strict\":true}}\n"))
  yield* Effect.promise(() => Bun.write(path.join(root, "src/a.ts"), source))
  yield* git(["add", "--", "tsconfig.json", "src/a.ts"])
  yield* git(["commit", "-q", "-m", "captured"])
  const commit = yield* git(["rev-parse", "HEAD"])
  const blob = yield* git(["rev-parse", "HEAD:src/a.ts"])
  const captured = yield* CodeIndexShard.captured(root, commit)
  const input = { root, storeRoot, git: captured, indexers }
  const plan = yield* CodeIndexBuild.plan(input)
  const shard = plan.shards[0]
  if (!shard) return yield* Effect.die("fixture has no TypeScript shard")
  const meta = { shardKey: shard.key, commit, indexer: shard.indexer.id, version: shard.indexer.version }
  const calls = { extract: 0, overlay: 0 }
  const query: CodeIndexQuery.Context = {
    ...input, readOnly: true,
    extract: () => Effect.sync(() => { calls.extract += 1; return content() }),
    overlay: () => Effect.sync(() => { calls.overlay += 1; return [] }),
  }
  return { root, storeRoot, git, captured, commit, blob, plan, shard, meta, query, calls }
})

const refusal = <A, R>(effect: Effect.Effect<A, Research.Error, R>) => effect.pipe(Effect.match({
  onFailure: (error) => error.code,
  onSuccess: () => "unexpected-success" as const,
}))

it.live("readOnly accepts the planned identity and captured document bytes without an executable producer", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    yield* CodeIndexStore.write(made.plan.dir, made.meta, content())
    const before = yield* Effect.promise(() => fs.readFile(CodeIndexStore.file(made.plan.dir, made.shard.key)))
    yield* Effect.promise(() => Bun.write(path.join(made.root, "src/a.ts"), "export function liveOnly() {}\n"))
    const result = yield* CodeIndexQuery.run(made.query, { op: "symbols" })
    expect(result.hits.map((hit) => [hit.range.path, hit.via?.name])).toEqual([["src/a.ts", "capturedSymbol"]])
    expect(result.basis.basis.commit).toBe(made.commit)
    expect(result.basis.basis.shards[0]).toMatchObject({ indexer: indexers.ts.id, version: indexers.ts.version })
    expect(result.basis.freshness).toBe("fresh")
    expect(result.basis.basis.dirtyDigest).toBeUndefined()
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
    expect(yield* Effect.promise(() => fs.readFile(CodeIndexStore.file(made.plan.dir, made.shard.key)))).toEqual(before)
    expect(existsSync(path.join(made.plan.dir, "commits.json"))).toBe(false)
  })
})

it.live("readOnly accepts byte-identical cross-commit reuse despite the stored producer commit", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    yield* CodeIndexStore.write(made.plan.dir, made.meta, content())
    yield* Effect.promise(() => Bun.write(path.join(made.root, "README.md"), "unrelated commit\n"))
    yield* made.git(["add", "--", "README.md"])
    yield* made.git(["commit", "-q", "-m", "readme only"])
    const next = yield* made.git(["rev-parse", "HEAD"])
    expect(next).not.toBe(made.commit)
    const captured = yield* CodeIndexShard.captured(made.root, next)
    const plan = yield* CodeIndexBuild.plan({ ...made.query, git: captured })
    expect(plan.shards[0]?.key).toBe(made.shard.key)
    const result = yield* CodeIndexQuery.run({ ...made.query, git: captured }, { op: "symbols" })
    expect(result.basis.basis.commit).toBe(next)
    expect(result.basis.freshness).toBe("fresh")
    expect(result.hits.map((hit) => hit.via?.name)).toEqual(["capturedSymbol"])
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

it.live("readOnly leaves commits.json bytes, order and timestamp unchanged", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    yield* CodeIndexStore.write(made.plan.dir, made.meta, content())
    yield* Effect.promise(() => Bun.write(path.join(made.root, "README.md"), "newer retained commit\n"))
    yield* made.git(["add", "--", "README.md"])
    yield* made.git(["commit", "-q", "-m", "newer"])
    const newer = yield* made.git(["rev-parse", "HEAD"])
    const manifest = path.join(made.plan.dir, "commits.json")
    const records = [
      { commit: newer, at: 2, shards: [{ id: made.shard.shard.id, key: made.shard.key }] },
      { commit: made.commit, at: 1, shards: [{ id: made.shard.shard.id, key: made.shard.key }] },
    ]
    yield* Effect.promise(() => Bun.write(manifest, JSON.stringify(records, null, 2) + "\n"))
    const before = yield* Effect.promise(() => fs.readFile(manifest))
    const timestamp = (yield* Effect.promise(() => fs.stat(manifest))).mtimeMs
    const result = yield* CodeIndexQuery.run(made.query, { op: "symbols" })
    expect(result.hits).toHaveLength(1)
    expect(yield* Effect.promise(() => fs.readFile(manifest))).toEqual(before)
    expect((yield* Effect.promise(() => fs.stat(manifest))).mtimeMs).toBe(timestamp)
    expect(yield* CodeIndexStore.records(made.plan.dir)).toEqual(records)
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

for (const [field, value] of [
  ["shardKey", "0".repeat(64)], ["indexer", "incompatible-producer"], ["version", "incompatible-version"],
] as const) it.live(`readOnly refuses incompatible cached ${field} metadata without rebuilding`, () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    const meta = { ...made.meta, [field]: value }
    yield* CodeIndexStore.write(made.plan.dir, meta, content())
    if (field === "shardKey") yield* Effect.promise(() => fs.rename(
      CodeIndexStore.file(made.plan.dir, meta.shardKey), CodeIndexStore.file(made.plan.dir, made.shard.key),
    ))
    expect(yield* refusal(CodeIndexQuery.run(made.query, { op: "symbols" }))).toBe("index_unavailable")
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

it.live("readOnly refuses a document hash that does not match the captured Git blob", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    yield* CodeIndexStore.write(made.plan.dir, made.meta, content("src/a.ts", "0".repeat(64)))
    expect(yield* refusal(CodeIndexQuery.run(made.query, { op: "symbols" }))).toBe("index_unavailable")
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

for (const [name, file] of [
  ["untracked", "src/not-captured.ts"], ["traversal", "../outside.ts"],
  ["absolute POSIX", "/outside.ts"], ["absolute Windows", "C:\\outside.ts"], ["NUL", "src/a.ts\0outside"],
] as const) it.live(`readOnly refuses a cached ${name} document path`, () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    yield* CodeIndexStore.write(made.plan.dir, made.meta, content(file))
    expect(yield* refusal(CodeIndexQuery.run(made.query, { op: "symbols" }))).toBe("index_unavailable")
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

it.live("readOnly refuses missing and corrupt caches without a build, overlay or cache creation", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    expect(existsSync(made.plan.dir)).toBe(false)
    expect(yield* refusal(CodeIndexQuery.run(made.query, { op: "symbols" }))).toBe("index_unavailable")
    expect(existsSync(made.plan.dir)).toBe(false)
    expect(CodeIndexBuild.building(made.plan.dir)).toBeUndefined()
    expect(CodeIndexStore.building(made.storeRoot, made.shard.key)).toBe(false)
    const file = CodeIndexStore.file(made.plan.dir, made.shard.key)
    yield* Effect.promise(() => Bun.write(file, "not a SQLite cache\n"))
    expect(yield* refusal(CodeIndexQuery.run(made.query, { op: "symbols" }))).toBe("index_unavailable")
    expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("not a SQLite cache\n")
    expect(yield* Effect.promise(() => fs.readdir(made.plan.dir))).toEqual([path.basename(file)])
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})

it.live("readOnly answers use validated SQLite bytes across a pathname replacement attempt", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    yield* CodeIndexStore.write(made.plan.dir, made.meta, content())
    const replacement = path.join(made.storeRoot, "replacement")
    yield* CodeIndexStore.write(replacement, { ...made.meta, indexer: "incompatible-producer" }, {
      ...content("src/a.ts", "0".repeat(64)),
      symbols: content().symbols.map((symbol) => ({ ...symbol, name: "replacementSymbol" })),
    })
    const attempts: ("replaced" | "native-lock")[] = []
    const git: CodeIndexShard.Git = {
      run: (args, stdin) => Effect.gen(function* () {
        const bytes = yield* made.captured.run(args, stdin)
        // Forward genuine Git output. Replace the filename only when validation reads this document's bytes.
        if (args[0] === "cat-file" && stdin?.split("\n").includes(made.blob) && attempts.length === 0) {
          const attempt = yield* Effect.promise(() => fs.rename(
            CodeIndexStore.file(replacement, made.shard.key), CodeIndexStore.file(made.plan.dir, made.shard.key),
          ).then(() => "replaced" as const, (error: unknown) => {
            // Windows may keep an already-open SQLite file non-replaceable. This is observed, not a skipped test.
            if (process.platform === "win32" && error instanceof Error && "code" in error &&
              ["EACCES", "EPERM", "EBUSY"].includes(String(error.code))) return "native-lock" as const
            throw error
          }))
          attempts.push(attempt)
        }
        return bytes
      }),
    }
    const result = yield* CodeIndexQuery.run({ ...made.query, git }, { op: "symbols" }).pipe(Effect.match({
      onFailure: (error) => ({ kind: "refused" as const, code: error.code }),
      onSuccess: (value) => ({ kind: "answered" as const, value }),
    }))
    expect(attempts).toHaveLength(1)
    if (result.kind === "refused") expect(result.code).toBe("index_unavailable")
    if (result.kind === "answered") {
      expect(result.value.hits.map((hit) => hit.via?.name)).toEqual(["capturedSymbol"])
      expect(result.value.basis.basis.commit).toBe(made.commit)
    }
    const stored = yield* CodeIndexStore.read(made.plan.dir, made.shard.key, Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql.unsafe<{ value: string }>("SELECT value FROM meta WHERE key = 'indexer'")
    }))
    expect(stored[0]?.value).toBe(attempts[0] === "replaced" ? "incompatible-producer" : indexers.ts.id)
    expect(made.calls).toEqual({ extract: 0, overlay: 0 })
  })
})
