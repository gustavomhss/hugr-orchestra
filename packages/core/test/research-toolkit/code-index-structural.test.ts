import { describe, expect, test } from "bun:test"
import path from "path"
import { mkdir, mkdtemp, realpath, rm } from "fs/promises"
import { tmpdir } from "os"
import { $ } from "bun"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { CodeIndexBuild } from "../../src/research-toolkit/code-index/build"
import { CodeIndexExtract } from "../../src/research-toolkit/code-index/extract"
import { CodeIndexQuery } from "../../src/research-toolkit/code-index/query"
import { CodeIndexShard } from "../../src/research-toolkit/code-index/shard"
import { testEffect } from "../lib/effect"

// X6: a Go or Rust shard whose host toolchain or precise indexer is missing is still built, from the tree-sitter layer
// alone, and its basis says so: indexer `tree-sitter`, the reason in coverage.skipped, coverage incomplete.

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))

const PRECISE = {
  ts: { id: "scip-typescript", version: "0.4.0" },
  go: { id: "scip-go", version: "0.2.7" },
  rust: { id: "rust-analyzer", version: "0.3.3065" },
}
const STRUCTURAL = CodeIndexExtract.STRUCTURAL

describe("the structural fallback for Go and Rust", () => {
  // Mutation control: make CodeIndexExtract.structural return `indexers` unchanged; the missing-toolchain and
  // missing-pack cases then keep or lack their precise indexer and go red.
  test("a missing toolchain or indexer maps the language to the structural indexer, naming why", () => {
    const blocked = (language: string) => `blocked:${language}`
    expect(CodeIndexExtract.structural(PRECISE, (command) => `/usr/bin/${command}`, blocked)).toEqual(PRECISE)
    expect(CodeIndexExtract.structural(PRECISE, (command) => command === "cargo" ? "/usr/bin/cargo" : null, blocked)).toEqual({
      ...PRECISE, go: { id: STRUCTURAL, version: "toolchain-missing:go" },
    })
    expect(CodeIndexExtract.structural(PRECISE, () => null, blocked)).toEqual({
      ts: PRECISE.ts, go: { id: STRUCTURAL, version: "toolchain-missing:go" }, rust: { id: STRUCTURAL, version: "toolchain-missing:cargo" },
    })
    expect(CodeIndexExtract.structural({ ts: PRECISE.ts }, (command) => `/usr/bin/${command}`, blocked)).toEqual({
      ts: PRECISE.ts, go: { id: STRUCTURAL, version: "blocked:go" }, rust: { id: STRUCTURAL, version: "blocked:rust" },
    })
  })

  // Mutation control: drop the `structural-only:` entry from the skipped list in CodeIndexExtract's extract; the
  // skipped and complete assertions go red. Running SCIP for the structural indexer instead fails the build.
  it.live("a structural shard answers definitions and imports with a named, incomplete basis", () =>
    Effect.gen(function* () {
      const repo = yield* temporary("code-index-structural-")
      const store = yield* temporary("code-index-structural-store-")
      yield* Effect.promise(async () => {
        const files: Record<string, string> = {
          "go/go.mod": "module example.com/fixture\n\ngo 1.21\n",
          "go/helpers/helpers.go": "package helpers\n\nfunc DoubleIt(value int) int {\n\treturn value * 2\n}\n",
          "go/main.go": "package main\n\nimport \"example.com/fixture/helpers\"\n\nfunc main() { helpers.DoubleIt(21) }\n",
          "rs/Cargo.toml": "[package]\nname = \"fixture\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
          "rs/src/lib.rs": "mod helpers;\nuse crate::helpers::double_it;\n\npub fn run() -> i32 {\n    double_it(21)\n}\n",
          "rs/src/helpers.rs": "pub fn double_it(value: i32) -> i32 {\n    value * 2\n}\n",
        }
        await Promise.all(Object.entries(files).map(async ([file, text]) => {
          await mkdir(path.join(repo, path.dirname(file)), { recursive: true })
          await Bun.write(path.join(repo, file), text)
        }))
        await $`git init -q && git -c user.email=t@t -c user.name=t -c commit.gpgsign=false add -A && git -c user.email=t@t -c user.name=t -c commit.gpgsign=false commit -q -m init`.cwd(repo).quiet()
      })
      const parts = yield* CodeIndexExtract.make
      const git = yield* CodeIndexShard.live(repo)
      const indexers = {
        go: { id: STRUCTURAL, version: "toolchain-missing:go" },
        rust: { id: STRUCTURAL, version: "toolchain-missing:cargo" },
      }
      const context = { root: repo, git, storeRoot: store, indexers, overlay: parts.overlay }
      const built = yield* CodeIndexBuild.build({ ...context, extract: parts.extract })
      expect(built.failed).toEqual([])
      expect(built.built.length).toBe(2)

      const go = yield* CodeIndexQuery.run(context, { op: "definition", name: "DoubleIt" })
      expect(go.resolved).toMatchObject({ name: "DoubleIt", kind: "function", exported: true, range: { path: "go/helpers/helpers.go", startLine: 3, endLine: 5 } })
      expect(go.basis.basis.shards.map((shard) => [shard.language, shard.project, shard.indexer, shard.version]).toSorted()).toEqual([
        ["go", "go", STRUCTURAL, "toolchain-missing:go"],
        ["rust", "rs", STRUCTURAL, "toolchain-missing:cargo"],
      ])
      expect(go.basis.coverage.skipped).toContainEqual({ path: "go", reason: "structural-only:toolchain-missing:go" })
      expect(go.basis.coverage.complete).toBe(false)

      const rust = yield* CodeIndexQuery.run(context, { op: "definition", name: "double_it" })
      expect(rust.resolved).toMatchObject({ name: "double_it", kind: "function", exported: true, range: { path: "rs/src/helpers.rs", startLine: 1, endLine: 3 } })
      expect(rust.basis.coverage.skipped).toContainEqual({ path: "rs", reason: "structural-only:toolchain-missing:cargo" })

      // The import edges come from the structural layer and the language's own resolution.
      const goImporters = yield* CodeIndexQuery.run(context, { op: "importers", path: "go/helpers/helpers.go" })
      expect(goImporters.hits.map((hit) => [hit.range.path, hit.range.startLine])).toEqual([["go/main.go", 3]])
      const rustImporters = yield* CodeIndexQuery.run(context, { op: "importers", path: "rs/src/helpers.rs" })
      expect(rustImporters.hits.map((hit) => [hit.range.path, hit.range.startLine])).toEqual([["rs/src/lib.rs", 1], ["rs/src/lib.rs", 2]])
    }), 120_000)
})

const temporary = (prefix: string) =>
  Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), prefix)))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
