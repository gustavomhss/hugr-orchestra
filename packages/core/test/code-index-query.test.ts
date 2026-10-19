import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Cause, Effect, Exit, Option } from "effect"
import { Research } from "@orchestra/schema/research"
import { CodeIndexBuild } from "@orchestra/core/research-toolkit/code-index/build"
import { CodeIndexQuery } from "@orchestra/core/research-toolkit/code-index/query"
import { CodeIndexShard } from "@orchestra/core/research-toolkit/code-index/shard"
import { CodeIndexStore } from "@orchestra/core/research-toolkit/code-index/store"
import type { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { tmpdir } from "./fixture/tmpdir"

// X3: shards, incremental builds, the query operations, the dirty overlay, stale fallback and named failures. Git and
// the extraction layers (X1/X2) are stubbed at their seams: git answers from an in-memory history, and `extract`
// turns the per-file model below into store content.

type Model = {
  readonly symbols?: ReadonlyArray<{ name: string; kind?: string; start: number; end: number; container?: string; exported?: boolean }>
  readonly refs?: ReadonlyArray<{ to: string; line: number; enclosing?: string }>
  readonly imports?: ReadonlyArray<{ line: number; specifier: string; to?: string; kind: CodeIndexStore.Content["imports"][number]["kind"] }>
}

const scip = (file: string, name: string) => `scip-typescript npm fixture 1.0.0 ${file}/${name}.`

const MODEL: Record<string, Model> = {
  "packages/a/src/assemble.ts": {
    symbols: [
      { name: "DiscoveryResult", kind: "class", start: 1, end: 20 },
      { name: "assemble", kind: "method", start: 3, end: 10, container: "DiscoveryResult" },
    ],
  },
  "packages/a/src/use.ts": {
    symbols: [{ name: "run", kind: "function", start: 2, end: 8 }],
    refs: [{ to: "assemble", line: 4, enclosing: "run" }, { to: "assemble", line: 6, enclosing: "run" }, { to: "assemble", line: 9 }],
    imports: [{ line: 1, specifier: "./assemble", to: "packages/a/src/assemble.ts", kind: "relative" }],
  },
  "packages/b/src/main.ts": {
    symbols: [{ name: "main", kind: "function", start: 2, end: 9 }],
    refs: [{ to: "assemble", line: 5, enclosing: "main" }],
    imports: [{ line: 1, specifier: "@fixture/a/assemble", to: "packages/a/src/assemble.ts", kind: "workspace" }],
  },
}
const DEFINED = new Map(Object.entries(MODEL).flatMap(([file, model]) => (model.symbols ?? []).map((symbol) => [symbol.name, file] as const)))

const lines = (count: number) => Array.from({ length: count }, (_, index) => `// line ${index + 1}`).join("\n")
const BASE: Record<string, string> = {
  "tsconfig.json": `{ "files": [], "references": [{ "path": "packages/a" }, { "path": "packages/b" }] }`,
  "tsconfig.base.json": `{ "compilerOptions": { "strict": true } }`,
  "bun.lock": "lock-1",
  "packages/a/tsconfig.json": `{ "extends": "../../tsconfig.base.json", "include": ["src"] }`,
  "packages/a/src/assemble.ts": lines(20),
  "packages/a/src/use.ts": lines(10),
  "packages/b/tsconfig.json": `{ "compilerOptions": {} } // jsonc`,
  "packages/b/src/main.ts": lines(9),
  "packages/b/src/huge.ts": lines(3),
  "packages/b/README.md": "# b",
  "packages/c/tsconfig.json": `{ "extends": "../../tsconfig.base.json" }`,
  "scripts/tool.ts": lines(2),
}

const oid = (text: string) => createHash("sha1").update(text).digest("hex")

/** A repository whose history the test edits: commits, HEAD and the worktree's dirty paths. */
function repository(commonDir: string) {
  const commits = new Map<string, Record<string, string>>([["c1", BASE]])
  const state = { head: "c1", dirty: [] as Array<{ path: string; deleted?: boolean }> }
  const run = (args: ReadonlyArray<string>, stdin?: string): string | Buffer => {
    const files = commits.get(state.head)!
    if (args[0] === "rev-parse" && args.includes("HEAD^{commit}")) return `${state.head}\n`
    if (args[0] === "rev-parse" && args.includes("--git-common-dir")) return `${commonDir}\n`
    if (args[0] === "ls-tree") return Object.entries(commits.get(args.at(-1)!)!).map(([file, text]) => `100644 blob ${oid(text)}\t${file}\0`).join("")
    if (args[0] === "cat-file") {
      const blobs = new Map(Object.values(files).map((text) => [oid(text), text]))
      return Buffer.concat(stdin!.trim().split("\n").map((id) => {
        const body = Buffer.from(blobs.get(id)!)
        return Buffer.concat([Buffer.from(`${id} blob ${body.length}\n`), body, Buffer.from("\n")])
      }))
    }
    if (args[0] === "status") return state.dirty.map((entry) => `${entry.deleted ? " D" : " M"} ${entry.path}\0`).join("")
    if (args[0] === "diff") {
      const [from, to] = args.slice(-2).map((commit) => commits.get(commit)!)
      return [...new Set([...Object.keys(from!), ...Object.keys(to!)])].filter((file) => from![file] !== to![file]).map((file) => `${file}\0`).join("")
    }
    throw new Error(`unexpected git ${args.join(" ")}`)
  }
  const git: CodeIndexShard.Git = { run: (args, stdin) => Effect.sync(() => Buffer.from(run(args, stdin))) }
  return {
    git, state,
    commit: (id: string, changes: Record<string, string>) => {
      commits.set(id, { ...commits.get(state.head)!, ...changes })
      state.head = id
    },
  }
}

/** The X1/X2 stand-in: documents, symbols with containers, occurrences with enclosing ids, imports, named gaps. */
function extractor() {
  const calls: string[] = []
  const extract: CodeIndexBuild.Extract = ({ shard }) => Effect.sync(() => {
    calls.push(shard.id)
    const ids = new Map<string, number>()
    const id = (name: string) => ids.get(name) ?? ids.set(name, ids.size + 1).get(name)!
    const files = shard.files.filter((file) => !file.endsWith("huge.ts"))
    const own = files.flatMap((file) => (MODEL[file]?.symbols ?? []).map((symbol) => ({ ...symbol, file })))
    const external = files.flatMap((file) => (MODEL[file]?.refs ?? []).map((ref) => ref.to))
      .filter((name) => !own.some((symbol) => symbol.name === name))
    const range = (name: string) => {
      const file = DEFINED.get(name)!
      const symbol = MODEL[file]!.symbols!.find((entry) => entry.name === name)!
      return { file, symbol }
    }
    const symbols = [...own.map((symbol) => symbol.name), ...new Set(external)].map((name) => {
      const found = range(name)
      return {
        id: id(name), scip: scip(found.file, name), name, kind: found.symbol.kind ?? "function", path: found.file,
        startLine: found.symbol.start, endLine: found.symbol.end, nameLine: found.symbol.start, exported: found.symbol.exported ?? true,
        ...(found.symbol.container ? { containerId: id(found.symbol.container) } : {}),
      }
    })
    return {
      documents: files.map((file) => ({ path: file, language: "ts", sha256: oid(BASE[file] ?? file), lines: (BASE[file] ?? "").split("\n").length, bytes: 10, layer: 1 as const })),
      symbols,
      occurrences: [
        ...own.map((symbol) => ({ symbolId: id(symbol.name), path: symbol.file, line: symbol.start, col: 0, endLine: symbol.start, endCol: 5, role: 1, opaque: false })),
        ...files.flatMap((file) => (MODEL[file]?.refs ?? []).map((ref) => ({
          symbolId: id(ref.to), path: file, line: ref.line, col: 4, endLine: ref.line, endCol: 12, role: 2,
          ...(ref.enclosing ? { enclosingId: id(ref.enclosing) } : {}), opaque: false,
        }))),
      ],
      relations: [],
      imports: files.flatMap((file) => (MODEL[file]?.imports ?? []).map((item) => ({ fromPath: file, line: item.line, specifier: item.specifier, kind: item.kind, ...(item.to ? { toPath: item.to } : {}) }))),
      skipped: shard.files.filter((file) => file.endsWith("huge.ts")).map((file) => ({ path: file, reason: "file-byte-cap" })),
    } satisfies CodeIndexStore.Content
  })
  return { calls, extract }
}

const INDEXERS = { ts: { id: "scip-typescript", version: "0.4.0" } }

async function fixture() {
  const tmp = await tmpdir()
  const root = path.join(tmp.path, "worktree")
  const commonDir = path.join(tmp.path, "git")
  await mkdir(root, { recursive: true })
  await mkdir(commonDir, { recursive: true })
  const repo = repository(commonDir)
  const built = extractor()
  const overlays: Array<ReadonlyArray<string>> = []
  const context: CodeIndexQuery.Context = {
    root, git: repo.git, storeRoot: path.join(tmp.path, "cache"), indexers: INDEXERS,
    overlay: ({ paths }) => Effect.sync(() => {
      overlays.push(paths)
      return paths.map((file) => ({ path: file, lines: 30, symbols: [{ name: "freshlyAdded", kind: "function", startLine: 22, endLine: 28, nameLine: 22, exported: true }] }))
    }),
  }
  return { tmp, root, repo, built, overlays, context, build: () => Effect.runPromise(CodeIndexBuild.build({ ...context, extract: built.extract })) }
}

const query = (context: CodeIndexQuery.Context, input: CodeIndex.CodeQuery) => Effect.runPromise(CodeIndexQuery.run(context, input))
const failure = async (context: CodeIndexQuery.Context, input: CodeIndex.CodeQuery) => {
  const exit = await Effect.runPromiseExit(CodeIndexQuery.run(context, input))
  expect(Exit.isFailure(exit)).toBe(true)
  const error = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined
  expect(error).toBeInstanceOf(Research.Error)
  return error!
}

describe("code index shards", () => {
  test("one shard per tsconfig that owns files; solution, extends-only and orphan files are not shards", async () => {
    const repo = repository("/unused")
    const tree = await Effect.runPromise(CodeIndexShard.tree(repo.git, "c1"))
    const configs = await Effect.runPromise(CodeIndexShard.contents(repo.git, tree, CodeIndexShard.configFiles(tree)))
    const found = CodeIndexShard.discover(tree, configs)
    expect(found.shards.map((shard) => [shard.id, shard.files])).toEqual([
      ["ts:packages/a", ["packages/a/src/assemble.ts", "packages/a/src/use.ts"]],
      ["ts:packages/b", ["packages/b/src/huge.ts", "packages/b/src/main.ts"]],
    ])
    expect(found.orphans).toEqual(["scripts/tool.ts"])
  })

  test("the key follows the shard's own files, its lockfiles and its tsconfig extends chain", async () => {
    const repo = repository("/unused")
    const keys = async () => {
      const tree = await Effect.runPromise(CodeIndexShard.tree(repo.git, repo.state.head))
      const configs = await Effect.runPromise(CodeIndexShard.contents(repo.git, tree, CodeIndexShard.configFiles(tree)))
      return Object.fromEntries(CodeIndexShard.discover(tree, configs).shards.map((shard) => [shard.id, CodeIndexShard.key(shard, INDEXERS.ts, tree, configs)]))
    }
    const first = await keys()
    repo.commit("c2", { "packages/b/src/main.ts": lines(9) + "\n// edit" })
    const second = await keys()
    expect(second["ts:packages/a"]).toBe(first["ts:packages/a"])
    expect(second["ts:packages/b"]).not.toBe(first["ts:packages/b"])
    repo.commit("c3", { "tsconfig.base.json": `{ "compilerOptions": { "strict": false } }` })
    const third = await keys()
    expect(third["ts:packages/a"]).not.toBe(second["ts:packages/a"])
    expect(third["ts:packages/b"]).toBe(second["ts:packages/b"])
    repo.commit("c4", { "bun.lock": "lock-2" })
    const fourth = await keys()
    expect(fourth["ts:packages/a"]).not.toBe(third["ts:packages/a"])
    expect(fourth["ts:packages/b"]).not.toBe(third["ts:packages/b"])
  })

  test("git runs without the caller's GIT_* and NODE_* variables and without global config", () => {
    const env = CodeIndexShard.environment({ PATH: "/bin", GIT_DIR: "/elsewhere", git_askpass: "x", NODE_OPTIONS: "--require x", HOME: "/h" })
    expect(env.GIT_DIR).toBeUndefined()
    expect(env.git_askpass).toBeUndefined()
    expect(env.NODE_OPTIONS).toBeUndefined()
    expect(env).toMatchObject({ PATH: "/bin", HOME: "/h", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" })
  })
})

describe("code index build", () => {
  test("a new commit that changes one package rebuilds only that shard", async () => {
    const f = await fixture()
    await using _ = f.tmp
    const first = await f.build()
    expect(first.built.map((entry) => entry.id).sort()).toEqual(["ts:packages/a", "ts:packages/b"])
    expect((await f.build()).built).toEqual([])
    f.repo.commit("c2", { "packages/b/src/main.ts": lines(9) + "\n// edit" })
    const second = await f.build()
    expect(second.built.map((entry) => entry.id)).toEqual(["ts:packages/b"])
    expect(f.built.calls).toEqual(["ts:packages/a", "ts:packages/b", "ts:packages/b"])
  })

  test("a failing shard is reported and the others still land", async () => {
    const f = await fixture()
    await using _ = f.tmp
    const result = await Effect.runPromise(CodeIndexBuild.build({
      ...f.context,
      extract: (input) => input.shard.id === "ts:packages/b"
        ? Effect.fail(new Research.Error({ code: "index_unavailable", message: "indexer crashed" }))
        : f.built.extract(input),
    }))
    expect(result.built.map((entry) => entry.id)).toEqual(["ts:packages/a"])
    expect(result.failed).toEqual([{ id: "ts:packages/b", message: "indexer crashed" }])
  })
})

describe("code query", () => {
  test("definition resolves short and qualified names and reports a fresh basis", async () => {
    const f = await fixture()
    await using _ = f.tmp
    await f.build()
    const result = await query(f.context, { op: "definition", name: "DiscoveryResult.assemble" })
    expect(result.resolved).toMatchObject({ name: "assemble", kind: "method", range: { path: "packages/a/src/assemble.ts", startLine: 3, endLine: 10 } })
    expect(result.hits).toEqual([{ range: { path: "packages/a/src/assemble.ts", startLine: 3, endLine: 10 }, role: "definition", via: result.resolved! }])
    expect((await query(f.context, { op: "definition", name: "assemble" })).resolved?.symbol).toBe(result.resolved?.symbol)
    expect(result.basis.freshness).toBe("fresh")
    expect(result.basis.basis.commit).toBe("c1")
    // A name may be defined in any shard, so every shard is read; a path narrows it (see map below).
    expect(result.basis.basis.shards.map((shard) => shard.id)).toEqual(["ts:packages/a", "ts:packages/b"])
  })

  test("an unknown name is not resolved and returns bm25-ranked candidates", async () => {
    const f = await fixture()
    await using _ = f.tmp
    await f.build()
    const result = await query(f.context, { op: "definition", name: "Discovery" })
    expect(result.resolved).toBeUndefined()
    expect(result.candidates.map((ref) => ref.name)).toEqual(["DiscoveryResult"])
    expect(result.hits).toEqual([])
  })

  test("callers group references by the enclosing definition with exact sites, across shards", async () => {
    const f = await fixture()
    await using _ = f.tmp
    await f.build()
    const result = await query(f.context, { op: "callers", name: "assemble", path: "packages/a/src/assemble.ts" })
    expect(result.hits.map((hit) => [hit.range.path, hit.range.startLine, hit.range.endLine, hit.role, hit.via?.name, hit.sites])).toEqual([
      ["packages/a/src/use.ts", 2, 8, "call", "run", [4, 6]],
      ["packages/a/src/use.ts", 9, 9, "reference", undefined, [9]],
      ["packages/b/src/main.ts", 2, 9, "call", "main", [5]],
    ])
    const references = await query(f.context, { op: "references", name: "assemble" })
    expect(references.hits.map((hit) => `${hit.range.path}:${hit.range.startLine}`)).toEqual([
      "packages/a/src/use.ts:4", "packages/a/src/use.ts:6", "packages/a/src/use.ts:9", "packages/b/src/main.ts:5",
    ])
    const callees = await query(f.context, { op: "callees", name: "run" })
    expect(callees.hits.map((hit) => [hit.via?.name, hit.sites])).toEqual([["assemble", [4, 6]]])
  })

  test("references page with next and bounds", async () => {
    const f = await fixture()
    await using _ = f.tmp
    await f.build()
    const first = await query(f.context, { op: "references", name: "assemble", limit: 3 })
    expect(first.hits).toHaveLength(3)
    expect(first.next).toBe(3)
    expect(first.basis.bounds).toEqual({ limit: 3, truncated: true })
    const second = await query(f.context, { op: "references", name: "assemble", limit: 3, offset: 3 })
    expect(second.hits.map((hit) => hit.range.path)).toEqual(["packages/b/src/main.ts"])
    expect(second.next).toBeUndefined()
  })

  test("imports and importers read the resolved import table", async () => {
    const f = await fixture()
    await using _ = f.tmp
    await f.build()
    const imports = await query(f.context, { op: "imports", path: "packages/b/src/main.ts" })
    expect(imports.hits).toEqual([{
      range: { path: "packages/b/src/main.ts", startLine: 1, endLine: 1 }, role: "import",
      via: { symbol: "packages/a/src/assemble.ts", name: "@fixture/a/assemble", kind: "module:workspace", range: { path: "packages/a/src/assemble.ts", startLine: 1, endLine: 1 }, nameLine: 1, exported: false },
    }])
    const importers = await query(f.context, { op: "importers", path: "packages/a/src/assemble.ts" })
    expect(importers.hits.map((hit) => hit.range.path)).toEqual(["packages/a/src/use.ts", "packages/b/src/main.ts"])
  })

  test("symbols covers every indexed document and names the gaps; non-source files take no quota", async () => {
    const f = await fixture()
    await using _ = f.tmp
    await f.build()
    const result = await query(f.context, { op: "symbols", path: "packages/b" })
    expect(result.hits.map((hit) => hit.via?.name)).toEqual(["main"])
    expect(result.basis.coverage).toMatchObject({ documents: 1, skipped: [{ path: "packages/b/src/huge.ts", reason: "file-byte-cap" }], complete: false })
    const outline = await query(f.context, { op: "symbols", path: "packages/a/src/assemble.ts" })
    expect(outline.hits.map((hit) => hit.via?.name)).toEqual(["DiscoveryResult", "assemble"])
    expect(outline.basis.coverage.complete).toBe(true)
    const ranked = await query(f.context, { op: "symbols", name: "assemble" })
    expect(ranked.hits[0]?.via?.name).toBe("assemble")
  })

  // T-X8: the map comes out of the index, ranked, with LOC, directories aggregated and named gaps in coverage.
  test("map lists files and directories by import rank with LOC and named gaps", async () => {
    const f = await fixture()
    await using _ = f.tmp
    await f.build()
    const result = await query(f.context, { op: "map" })
    const entries = result.hits.map((hit) => [hit.via?.kind, hit.range.path, hit.range.endLine])
    // A directory sums its files' rank and LOC, so the top directory leads.
    expect(entries[0]).toEqual(["directory", "packages", 39])
    expect(entries).toContainEqual(["directory", "packages/a/src", 30])
    expect(entries).toContainEqual(["directory", "packages/b", 9])
    expect(entries).toContainEqual(["file", "packages/a/src/assemble.ts", 20])
    const files = result.hits.filter((hit) => hit.via?.kind === "file").map((hit) => hit.range.path)
    // assemble.ts is imported by use.ts, so it outranks the file that imports it.
    expect(files.indexOf("packages/a/src/assemble.ts")).toBeLessThan(files.indexOf("packages/a/src/use.ts"))
    expect(result.basis.coverage.skipped).toEqual([
      { path: "scripts/tool.ts", reason: "no-project" },
      { path: "packages/b/src/huge.ts", reason: "file-byte-cap" },
    ])
    const shallow = await query(f.context, { op: "map", path: "packages/a", depth: 1 })
    expect(shallow.hits.map((hit) => hit.range.path)).toEqual(["packages/a/src"])
    expect(shallow.basis.basis.shards.map((shard) => shard.id)).toEqual(["ts:packages/a"])
  })

  test("a modified file comes back as dirty-overlay, and a definition only in the dirty file is found", async () => {
    const f = await fixture()
    await using _ = f.tmp
    await f.build()
    await Bun.write(path.join(f.root, "packages/a/src/use.ts"), "edited")
    f.repo.state.dirty = [{ path: "packages/a/src/use.ts" }]
    const result = await query(f.context, { op: "definition", name: "freshlyAdded" })
    expect(result.resolved?.range).toEqual({ path: "packages/a/src/use.ts", startLine: 22, endLine: 28 })
    expect(result.basis.freshness).toBe("dirty-overlay")
    expect(result.basis.basis.dirtyDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(f.overlays).toEqual([["packages/a/src/use.ts"]])
    const clean = await query(f.context, { op: "definition", name: "main" })
    expect(clean.basis.freshness).toBe("fresh")
  })

  test("while a shard rebuilds the query answers from the previous commit as stale", async () => {
    const f = await fixture()
    await using _ = f.tmp
    await f.build()
    f.repo.commit("c2", { "packages/b/src/main.ts": lines(9) + "\n// edit" })
    const result = await query(f.context, { op: "definition", name: "main" })
    expect(result.resolved?.name).toBe("main")
    expect(result.basis.freshness).toBe("stale")
    expect(result.basis.coverage.skipped).toContainEqual({ path: "packages/b/src/main.ts", reason: "changed-since-index" })
    expect(result.basis.basis.commit).toBe("c2")
  })

  test("named failures, never an empty success", async () => {
    const f = await fixture()
    await using _ = f.tmp
    expect((await failure({ ...f.context, indexers: {} }, { op: "symbols" })).code).toBe("index_unavailable")
    expect((await failure(f.context, { op: "symbols" })).code).toBe("index_unavailable")
    expect((await failure(f.context, { op: "imports", path: "../outside.ts" })).code).toBe("reference_invalid")
    expect((await failure(f.context, { op: "map", path: "scripts" })).code).toBe("index_unavailable")
    // With an extractor the query starts the first build in the background and says so.
    expect((await failure({ ...f.context, extract: f.built.extract }, { op: "symbols" })).code).toBe("index_building")
  })
})

const until = async (done: () => boolean) => {
  for (let tries = 0; tries < 500; tries++) {
    if (done()) return
    await Bun.sleep(10)
  }
  throw new Error("timed out waiting for the background build")
}

describe("failed and concurrent shard builds", () => {
  // J2.12: a failed first build must say so with its cause instead of reporting index_building forever, and the next
  // query retries it. Mutation control: stop remembering the failure in CodeIndexStore.singleFlight (tapError).
  test("a failed build is reported with its cause and the next query retries it", async () => {
    const f = await fixture()
    await using _ = f.tmp
    const state = { fail: true, calls: 0 }
    const context: CodeIndexQuery.Context = {
      ...f.context,
      extract: (input) => {
        state.calls++
        return state.fail ? Effect.fail(new Research.Error({ code: "index_unavailable", message: "indexer crashed" })) : f.built.extract(input)
      },
    }
    const plan = await Effect.runPromise(CodeIndexBuild.plan(context))
    const busy = () => CodeIndexBuild.building(plan.dir) !== undefined || plan.shards.some((planned) => CodeIndexStore.building(context.storeRoot, planned.key))
    const settle = (calls: number) => until(() => state.calls === calls && !busy())

    expect((await failure(context, { op: "symbols" })).code).toBe("index_building")
    await settle(2)
    const failed = await failure(context, { op: "symbols" })
    expect(failed.code).toBe("index_unavailable")
    expect(failed.message).toContain("indexer crashed")
    await settle(4)

    state.fail = false
    expect((await failure(context, { op: "symbols" })).message).toContain("indexer crashed")
    await settle(6)
    expect((await query(context, { op: "definition", name: "assemble" })).resolved?.name).toBe("assemble")
  })

  // The warm-up builds shards through the same single flight (ResearchToolkit.warm), so a query-side build awaits it.
  // Mutation control: remove the CodeIndexStore.singleFlight wrapper around the extraction in CodeIndexBuild.build.
  test("a build awaits a shard another caller is already building instead of extracting it again", async () => {
    const f = await fixture()
    await using _ = f.tmp
    const plan = await Effect.runPromise(CodeIndexBuild.plan(f.context))
    const warming = plan.shards.find((planned) => planned.shard.id === "ts:packages/a")!
    const warm = CodeIndexStore.singleFlight<Research.Error>(f.context.storeRoot, warming.key, Effect.sleep("200 millis"), {
      describe: (error) => error.message, join: (message) => new Research.Error({ code: "index_unavailable", message }),
    })
    const [, built] = await Effect.runPromise(Effect.all([warm, Effect.andThen(Effect.sleep("20 millis"), CodeIndexBuild.build({ ...f.context, extract: f.built.extract }))], { concurrency: "unbounded" }))
    expect(f.built.calls).toEqual(["ts:packages/b"])
    expect(built.failed).toEqual([])
  })
})

describe("single flight", () => {
  // Mutation control: let every caller run the work (drop the `running` join).
  test("callers of one shard share a single run, and a failure is shared, remembered and then retried", async () => {
    const root = `flight-${crypto.randomUUID()}`
    const state = { runs: 0, fail: true }
    const work = Effect.suspend(() => {
      state.runs++
      return Effect.sleep("30 millis").pipe(Effect.andThen(state.fail ? Effect.fail("boom") : Effect.void))
    })
    const flight = () => CodeIndexStore.singleFlight(root, "key", work, { describe: (error) => error, join: (reason) => `joined:${reason}` }).pipe(Effect.flip, Effect.orElseSucceed(() => "ok"))
    expect(await Effect.runPromise(Effect.all([flight(), flight(), flight()], { concurrency: "unbounded" }))).toEqual(["boom", "joined:boom", "joined:boom"])
    expect(state.runs).toBe(1)
    expect(CodeIndexStore.failure(root, "key")).toBe("boom")
    expect(CodeIndexStore.building(root, "key")).toBe(false)
    state.fail = false
    await Effect.runPromise(CodeIndexStore.singleFlight(root, "key", work, { describe: (error) => error, join: (reason) => reason }))
    expect(state.runs).toBe(2)
    expect(CodeIndexStore.failure(root, "key")).toBeUndefined()
  })
})
