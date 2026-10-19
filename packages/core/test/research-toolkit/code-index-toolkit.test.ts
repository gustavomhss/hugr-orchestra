import { describe, expect, test } from "bun:test"
import path from "path"
import { mkdtemp, realpath, rm } from "fs/promises"
import { tmpdir } from "os"
import { $ } from "bun"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchToolkit } from "../../src/research-toolkit/index"
import { CodeIndexExtract } from "../../src/research-toolkit/code-index/extract"
import { testEffect } from "../lib/effect"

// The toolkit side of the wiring: config caps only lower the owner caps (D2), and the warm-up plans X3's real shards.

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))

describe("research toolkit caps from config", () => {
  test("a configured limit lowers its cap and never raises it", () => {
    expect(ResearchToolkit.caps()).toEqual(ResearchToolkit.Limits)
    const lowered = ResearchToolkit.caps({ indexer_bytes: 512 * 1024 * 1024, probe_bytes: 64 * 1024 * 1024 })
    expect(lowered.indexerBytes).toBe(512 * 1024 * 1024)
    expect(lowered.probeBytes).toBe(64 * 1024 * 1024)
    expect(lowered.scratchBytes).toBe(ResearchToolkit.Limits.scratchBytes)
    expect(ResearchToolkit.caps({ indexer_bytes: 64 * 1024 * 1024 * 1024 }).indexerBytes).toBe(ResearchToolkit.Limits.indexerBytes)
  })
})

describe("the toolkit's code index", () => {
  it.live("plans one absent scip-typescript shard per TypeScript project at HEAD", () =>
    Effect.gen(function* () {
      const repo = yield* Effect.acquireRelease(
        Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "code-index-toolkit-")))),
        (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
      )
      const store = yield* Effect.acquireRelease(
        Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "code-index-toolkit-store-")))),
        (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
      )
      yield* Effect.promise(async () => {
        await Bun.write(path.join(repo, "tsconfig.json"), JSON.stringify({ include: ["src"] }))
        await Bun.write(path.join(repo, "src/a.ts"), "export const a = 1\n")
        await $`git init -q && git -c user.email=t@t -c user.name=t -c commit.gpgsign=false add -A && git -c user.email=t@t -c user.name=t -c commit.gpgsign=false commit -q -m init`.cwd(repo).quiet()
      })
      const toolkit = yield* CodeIndexExtract.toolkit
      const shards = yield* toolkit.plan(repo).pipe(Effect.provideService(ResearchToolkit.Root, store))
      expect(shards.map((shard) => [shard.language, shard.project, shard.engine, shard.state, shard.rank])).toEqual([
        ["ts", ".", "scip-typescript", "absent", 1],
      ])
      expect(shards[0]?.id).toMatch(/^[0-9a-f]{64}$/)
    }))
})
