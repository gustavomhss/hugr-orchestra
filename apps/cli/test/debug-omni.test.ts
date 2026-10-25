import { expect } from "bun:test"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "../../../packages/core/test/fixture/omni-expect"
import { testEffect } from "../../../packages/core/test/lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url))

// The nonce tree is the V9 campaign's proof that the shipped binary spawns through omni; this is the same command
// run from source, so the tree, its two processes and its stop are covered without a compiled CLI.
it.live("debug omni starts a two-process nonce tree through omni and stops it", () =>
  Effect.gen(function* () {
    const app = yield* AppProcess.Service
    expectSpawn(import.meta.path)
    const result = yield* app.run(
      ChildProcess.make(process.execPath, [entry, "debug", "omni"], {
        env: { ...process.env, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1" },
      }),
      { timeout: 60_000 },
    )
    const output = result.stdout.toString() + result.stderr.toString()
    expect(result.exitCode, output).toBe(0)
    expect(output).toContain("path: omni")
    expect(output).toContain("nonce tree: ok")
    expect(output).toMatch(/counters: spawns=[1-9]\d* delegations=0/)
  }),
  120_000,
)
