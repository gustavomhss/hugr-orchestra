import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { ModelCommandError } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"
import { createProposerPool } from "../../modules/atlas/packages/cli/dist/src/mine-pool.js"
import { checkpointFailure } from "./checkpoint-failure.mjs"

for (const reason of ["not-found", "timeout", "nonzero-exit"]) {
  test(`the actual compiled worker preserves model failure tag ${reason} through the parent pool`, (t) => {
    const root = mkdtempSync(join(tmpdir(), "atlas-worker-failure-"))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    mkdirSync(join(root, "src"))
    writeFileSync(join(root, "src/control.ts"), "export const control = 1\n")
    const command = reason === "not-found" ? { cmd: join(root, "missing-model-command"), args: [] } : {
      cmd: process.execPath,
      args: ["-e", reason === "timeout" ? "process.stdin.resume();setInterval(()=>{},1000)" :
        "process.stdin.resume();process.stdin.on('end',()=>process.exit(17))"],
    }
    const config = join(root, "model.json")
    writeFileSync(config, JSON.stringify({ roles: { propose: command }, timeoutMs: 1000 }))
    const pool = createProposerPool(root, { ...process.env, ATLAS_MODEL_CONFIG: config }, "advisory", 1)
    try {
      const results = pool.proposeAll([{ site: { kind: "file", qualifiedPath: "src/control.ts", subtreeHash: "failure-control" },
        rank: 1, ppr: 1, signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] } }])
      assert.equal(results.length, 1)
      assert.equal(results[0].ok, false)
      assert(results[0].error instanceof ModelCommandError)
      assert.equal(results[0].error.reason, reason)
      assert.deepEqual(checkpointFailure(results[0].error, "runner"),
        { version: 1, phase: "runner", kind: "model-command", reason })
    } finally {
      pool.close()
    }
  })
}
