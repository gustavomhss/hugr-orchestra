// Remote-only: bun run test:ci script ../../script/atlas-genesis/progress.node-smoke.mjs --runner node
// Node 24 strips the helper's types; exercise the production implementation, not a parallel copy.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import { test } from "node:test"
import { createMineProgress } from "../../modules/atlas/packages/cli/src/mine-progress.ts"

test("disabled progress preserves result without emitting or reading a clock", () => {
  const lines = []
  const progress = createMineProgress({}, (line) => lines.push(line), () => { throw new Error("clock read") })
  const result = { sites: 3 }
  progress.pool(true)
  assert.equal(progress.run("scan", () => result), result)
  assert.deepEqual(lines, [])
})

function assertBatchProgress(factory) {
  const lines = []
  const ticks = [10, 25]
  const progress = factory({ ATLAS_MINE_PROGRESS: "1" }, (line) => lines.push(line), () => ticks.shift())
  progress.pool(true)
  assert.equal(progress.run("model-batch", () => "private model answer", 3), "private model answer")
  assert.deepEqual(lines.map((line) => JSON.parse(line.slice("atlas-progress ".length))), [
    { pool: "parallel" },
    { phase: "model-batch", event: "start", sites: 3 },
    { phase: "model-batch", event: "end", sites: 3, elapsedMs: 15 },
  ])
}

test("progress records parallel mode and batch size, not the model answer", () => {
  assertBatchProgress(createMineProgress)
})

test("positive control: the same batch assertions reject disabled tracing", async () => {
  const source = readFileSync(new URL("../../modules/atlas/packages/cli/src/mine-progress.ts", import.meta.url), "utf8")
  const target = 'const enabled = env.ATLAS_MINE_PROGRESS === "1"'
  assert.equal(source.split(target).length, 2, "mutation must hit exactly one production expression")
  const mutant = stripTypeScriptTypes(source.replace(target, "const enabled = false"))
  const module = await import(`data:text/javascript;base64,${Buffer.from(mutant).toString("base64")}`)
  assert.throws(() => assertBatchProgress(module.createMineProgress), assert.AssertionError)
})

test("progress preserves thrown error identity without exposing its message", () => {
  const lines = []
  const progress = createMineProgress({ ATLAS_MINE_PROGRESS: "1" }, (line) => lines.push(line), () => 0)
  const error = new Error("private diagnostic")
  assert.throws(() => progress.run("rank-history", () => { throw error }), (caught) => caught === error)
  assert.deepEqual(lines.map((line) => JSON.parse(line.slice("atlas-progress ".length))), [
    { phase: "rank-history", event: "start" },
    { phase: "rank-history", event: "failed", elapsedMs: 0 },
  ])
})

test("progress distinguishes sequential mode and calls the work exactly once", () => {
  const lines = []
  let calls = 0
  const progress = createMineProgress({ ATLAS_MINE_PROGRESS: "1" }, (line) => lines.push(line), () => 0)
  progress.pool(false)
  assert.equal(progress.run("model-site", () => ++calls, 1), 1)
  assert.equal(calls, 1)
  assert.equal(JSON.parse(lines[0].slice("atlas-progress ".length)).pool, "sequential")
})
