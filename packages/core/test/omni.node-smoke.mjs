// The node-runner smoke (test-ci `--runner node`): the omni loader under Node, not Bun, and one spawn through it.
// Run: node --experimental-strip-types --test test/omni.node-smoke.mjs (needs a built addon and supervisor).
import assert from "node:assert/strict"
import { test } from "node:test"
import { Omni } from "../src/omni.ts"

test("the omni loader loads hugr-omni under Node and runs one child", async () => {
  const omni = await Omni.load()
  const result = await omni.run(
    process.execPath,
    ["-e", "console.log(process.env.OMNI_SMOKE + ' ' + process.env.HUGR_OMNI_ADDON)"],
    {
      inheritEnv: false,
      env: Omni.childEnv({ OMNI_SMOKE: "ok" }),
      timeoutMs: 20_000,
    },
  )
  Omni.count("spawns")
  assert.equal(result.success, true, result.stderr)
  assert.equal(result.stdout.trim(), "ok undefined")
  assert.equal(Omni.snapshot().spawns, 1)
})
