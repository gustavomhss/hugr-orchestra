// Existing test:ci Node runner; Bun only bundles the unchanged real Node driver and shared assertions.
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { test } from "node:test"
import { Omni } from "../src/omni.ts"

test("real sqlite.node readonly capture under IMMEDIATE commits and rolls back in WAL and DELETE", { timeout: 8000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "node-vacuum-build-"))
  try {
    const omni = await Omni.load()
    const built = await omni.run("bun", ["build", fileURLToPath(new URL("./fixture/database-vacuum-node.ts", import.meta.url)),
      "--target", "node", "--format", "esm", "--external", "node:sqlite", "--outfile", join(directory, "proof.mjs")], {
      inheritEnv: false, env: Omni.childEnv(), timeoutMs: 6000,
    })
    Omni.count("spawns")
    assert.equal(built.success, true, built.stderr)
    const proof = await import(pathToFileURL(join(directory, "proof.mjs")).href)
    const results = await proof.runProof()
    assert.equal(results.length, 4)
    console.log(JSON.stringify({ kind: "migration-vacuum-node-proof", node: process.version, platform: process.platform, results }))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
