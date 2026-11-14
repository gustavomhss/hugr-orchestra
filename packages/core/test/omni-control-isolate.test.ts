import { expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { isolatedControl } from "./fixture/omni-control-isolate"
import { expectSpawn } from "./fixture/omni-expect"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))

for (const positive of [false, true]) {
  it.live(`isolated Omni preload checks the second declaring file: ${positive ? "actual own spawn" : "missing own spawn"}`,
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const { result, nonce } = yield* isolatedControl(positive)
      const output = result.stdout.toString() + result.stderr.toString()
      expect(result.stdoutTruncated || result.stderrTruncated).toBe(false)
      expect(output).toContain("ISOLATE_CONTROL_PLAIN")
      expect(output.indexOf("ISOLATE_CONTROL_DECLARED")).toBeGreaterThan(output.indexOf("ISOLATE_CONTROL_PLAIN"))
      expect(output).toContain(`omni positive control [${nonce}]`)
      // The first file may print N/A. Only a verdict accounting for the second file can satisfy these controls.
      if (!positive) {
        expect(result.exitCode).not.toBe(0)
        expect(output).toMatch(/omni positive control(?: \[[0-9a-f]{32}\])?: FAIL/)
        expect(output).toContain("02-declared.test.ts: 1 of 1 declaring test(s) made no omni spawn of their own")
        return
      }
      expect(result.exitCode, output).toBe(0)
      expect(output).not.toContain(": FAIL")
      expect(output).toMatch(/omni positive control(?: \[[0-9a-f]{32}\])?: pass \(declared: 1 test\(s\) in [^\n]*02-declared\.test\.ts\); [1-9][0-9]* omni spawn\(s\), 0 delegated\./)
    }).pipe(Effect.timeout(25000)), 30000)
}
