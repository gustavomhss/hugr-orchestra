import { expect } from "bun:test"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { ROOT } from "../../omni/campaign/lib"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))

// Manual hosted diagnosis alongside the ordinary full-Core epic gate; force execution so cache replay
// cannot hide a missing strict-environment input. The second test makes the native positive control real.
it.live("Windows recorder under matched strict and loose Turbo environments", () =>
  Effect.gen(function* () {
    const app = yield* AppProcess.Service
    const results = []
    for (const mode of ["strict", "loose"] as const) {
      const env = { ...process.env }
      delete env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
      delete env.ORCHESTRA_OMNI_CONTROL_RUN
      const result = yield* app.run(ChildProcess.make(process.execPath, [
        "run", "turbo", "test", "--filter=@orchestra/core", "--force", `--env-mode=${mode}`,
        "--", "-t", "real execute captures|fresh AppProcess and spawner",
      ], { cwd: ROOT, env }), { timeout: "120 seconds", maxOutputBytes: 8 * 1024 * 1024, maxErrorBytes: 8 * 1024 * 1024 })
      console.log("RECORDER_TURBO_PROBE " + JSON.stringify({ mode, code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() }))
      results.push(result.exitCode)
    }
    expect(results).toEqual([0, 0])
  }), 300_000,
)
