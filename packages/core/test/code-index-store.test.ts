import { describe, expect, test } from "bun:test"
import { readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { CodeIndexStore } from "@orchestra/core/research-toolkit/code-index/store"
import { tmpdir } from "./fixture/tmpdir"

const content = (names: ReadonlyArray<string>): CodeIndexStore.Content => ({
  documents: [{ path: "src/a.ts", language: "ts", sha256: "x", lines: 40, bytes: 900, layer: 1 }],
  symbols: names.map((name, index) => ({
    id: index + 1, scip: `npm a 1 src/a.ts/${name}.`, name, kind: "function", path: "src/a.ts",
    startLine: index * 5 + 1, endLine: index * 5 + 4, nameLine: index * 5 + 1, exported: true,
  })),
  occurrences: [],
  relations: [],
  imports: [],
  skipped: [{ path: "src/huge.ts", reason: "file-byte-cap" }],
})
const meta = (shardKey: string) => ({ shardKey, commit: "c1", indexer: "scip-typescript", version: "0.4.0" })

describe("code index store", () => {
  test("splits camelCase and snake_case names into FTS tokens", () => {
    expect(CodeIndexStore.tokens("assembleDiscoveryResult")).toBe("assemble discovery result")
    expect(CodeIndexStore.tokens("HTTPServer_start")).toBe("http server start")
  })

  test("writes a shard atomically with the frozen schema, ranks and bm25-searchable names", async () => {
    await using tmp = await tmpdir()
    const rows = await Effect.runPromise(Effect.gen(function* () {
      yield* CodeIndexStore.write(tmp.path, meta("k1"), content(["assembleResult", "assemble", "parseConfig"]))
      return yield* CodeIndexStore.read(tmp.path, "k1", Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        return {
          names: yield* sql.unsafe<{ name: string }>(`SELECT s.name FROM symbol_name JOIN symbol s ON s.id = symbol_name.rowid
            WHERE symbol_name MATCH '"assemble"*' ORDER BY bm25(symbol_name)`),
          rank: yield* sql.unsafe<{ path: string; rank: number; loc: number; bytes: number }>(`SELECT * FROM file_rank`),
          meta: yield* sql.unsafe<{ key: string; value: string }>(`SELECT * FROM meta ORDER BY key`),
        }
      }))
    }))
    // bm25 prefers the shorter document: the exact name before the longer one sharing its token.
    expect(rows.names.map((row) => row.name)).toEqual(["assemble", "assembleResult"])
    expect(rows.rank.map((row) => [row.path, row.loc, row.bytes])).toEqual([["src/a.ts", 40, 900]])
    expect(rows.rank[0]!.rank).toBeCloseTo(1, 9)
    expect(Object.fromEntries(rows.meta.map((row) => [row.key, row.value]))).toEqual({
      commit: "c1", indexer: "scip-typescript", shardKey: "k1", version: "0.4.0",
      skipped: JSON.stringify([{ path: "src/huge.ts", reason: "file-byte-cap" }]),
    })
    expect((await readdir(tmp.path)).sort()).toEqual(["k1.sqlite"])
  })

  test("keeps the most recent commits and evicts least recently used shards over the byte cap", async () => {
    await using tmp = await tmpdir()
    const keys = Array.from({ length: 10 }, (_, index) => `k${index}`)
    const record = (index: number) => ({ commit: `c${index}`, at: index, shards: [{ id: "ts:.", key: keys[index]! }, { id: "ts:lib", key: "shared" }] })
    await writeFile(path.join(tmp.path, "shared.sqlite"), Buffer.alloc(100))
    const removed = await Effect.runPromise(Effect.gen(function* () {
      // Each commit's shard lands just before the commit is recorded, as a build does.
      const all = yield* Effect.forEach(keys.map((_, index) => index), (index) =>
        Effect.promise(() => writeFile(path.join(tmp.path, `${keys[index]}.sqlite`), Buffer.alloc(100))).pipe(
          Effect.andThen(CodeIndexStore.retain(tmp.path, record(index), { commits: 8, bytes: 1_000_000 }))))
      return all.flat()
    }))
    // Ten commits under an eight-commit limit: the two oldest commits' own shards go, the shared one stays.
    expect(removed.sort()).toEqual(["k0", "k1"])
    const after = await Effect.runPromise(CodeIndexStore.records(tmp.path))
    expect(after.map((entry) => entry.commit)).toEqual(["c9", "c8", "c7", "c6", "c5", "c4", "c3", "c2"])

    // 300 bytes keep the newest commit plus one: each commit adds 100 bytes beyond the shared shard.
    const evicted = await Effect.runPromise(CodeIndexStore.retain(tmp.path, record(9), { commits: 8, bytes: 300 }))
    expect(evicted.sort()).toEqual(["k2", "k3", "k4", "k5", "k6", "k7"])
    expect((await readdir(tmp.path)).filter((name) => name.endsWith(".sqlite")).sort()).toEqual(["k8.sqlite", "k9.sqlite", "shared.sqlite"])

    // The newest commit survives even when it alone exceeds the cap.
    expect(await Effect.runPromise(CodeIndexStore.retain(tmp.path, record(9), { commits: 8, bytes: 1 }))).toEqual(["k8"])
  })

  test("touch moves a commit to the front without dropping shards", async () => {
    await using tmp = await tmpdir()
    await Effect.runPromise(Effect.gen(function* () {
      yield* CodeIndexStore.retain(tmp.path, { commit: "old", at: 1, shards: [] }, { commits: 8, bytes: 1 })
      yield* CodeIndexStore.retain(tmp.path, { commit: "new", at: 2, shards: [] }, { commits: 8, bytes: 1 })
      yield* CodeIndexStore.touch(tmp.path, "old")
    }))
    expect((await Effect.runPromise(CodeIndexStore.records(tmp.path))).map((entry) => entry.commit)).toEqual(["old", "new"])
  })
})
