import { expect } from "bun:test"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "../../../packages/core/test/fixture/omni-expect"
import { testEffect } from "../../../packages/core/test/lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))

// This exercises the actual wrapper and runtime spawner, not a packaged CLI.
it.live("distribution wrapper forwards version arguments through the real process boundary", () =>
  Effect.gen(function* () {
    const app = yield* AppProcess.Service
    expectSpawn(import.meta.path)
    const result = yield* app.run(ChildProcess.make("node", [
      fileURLToPath(new URL("../bin/orchestra.cjs", import.meta.url)),
      "--version",
    ], { env: { ...process.env, ORCHESTRA_BIN_PATH: process.execPath } }))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString().trim()).toBe(Bun.version)
  }),
)
