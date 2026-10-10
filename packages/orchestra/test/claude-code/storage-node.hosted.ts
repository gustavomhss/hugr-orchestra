// Exact-path Node/Electron storage proof. Bun's storage suite separately checks archive ownership and races.
import { expect, test } from "bun:test"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

test("Node bundle imports storage and preserves immediate rollback, archive persistence and sealing", async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "claude-storage-node-")))
  try {
    const source = (file: string) => JSON.stringify(fileURLToPath(new URL(file, import.meta.url)).replaceAll("\\", "/"))
    const built = await Bun.build({
      target: "node", entrypoints: ["storage-probe.gen.ts"], outdir: directory,
      files: { "storage-probe.gen.ts": `
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import { FSUtil } from ${source("../../../core/src/fs-util.ts")}
import { LayerNode } from ${source("../../../core/src/effect/layer-node.ts")}
import { ClaudeCodeStorage } from ${source("../../src/claude-code/storage.ts")}
import { open } from ${source("../../src/claude-code/sqlite.node.ts")}
const directory = ${JSON.stringify(directory)}
const db = open(path.join(directory, "rollback.sqlite"))
try {
  db.exec("CREATE TABLE value(payload TEXT NOT NULL)")
  db.run("INSERT INTO value VALUES(?)", "original")
  assert.throws(() => db.immediate(() => { db.run("UPDATE value SET payload=?", "failed"); throw Error("rollback-marker") }), /rollback-marker/)
  assert.equal(db.get("SELECT payload FROM value").payload, "original")
} finally { db.close() }
const broken = open(path.join(directory, "rollback-failure.sqlite"))
const original = Error("original-work-failure")
assert.throws(() => broken.immediate(() => { broken.close(); throw original }), error =>
  error instanceof AggregateError && error.errors.length === 2 && error.errors[0] === original)
const archive = path.join(directory, "archive")
fs.mkdirSync(archive, { mode: 0o700 })
await Effect.runPromise(Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const store = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(archive), empty: () => ({ value: 0 }), decode: text => JSON.parse(text) })
  yield* store.modify(state => { state.value = 42 })
  assert.deepEqual(yield* store.read, { value: 42 })
  const reopened = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(archive), empty: () => ({ value: 0 }), decode: text => JSON.parse(text) })
  assert.deepEqual(yield* reopened.read, { value: 42 })
}).pipe(Effect.provide(LayerNode.compile(FSUtil.node))))
assert.equal(fs.readFileSync(path.join(archive, "archive.sqlite.initialized"), "utf8"), "initialized\\n")
if (process.platform !== "win32") assert.equal(fs.statSync(path.join(archive, "archive.sqlite")).mode & 0o777, 0o600)
console.log("NODE_STORAGE_PROOF " + JSON.stringify({ native: !process.versions.bun, rollback: true, persisted: true, sealed: true }))
` },
    })
    expect(built.success).toBe(true)
    expect(built.outputs).toHaveLength(1)
    expect(await built.outputs[0].text()).not.toMatch(/(?:from\s*|import\(\s*|require\(\s*)["']bun:sqlite["']/)
    const node = Bun.which("node")
    if (!node) throw new Error("Node storage proof requires native Node")
    const child = Bun.spawn([node, built.outputs[0].path], { stdout: "pipe", stderr: "pipe", timeout: 30_000 })
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
    expect(stdout).toContain('NODE_STORAGE_PROOF {"native":true,"rollback":true,"persisted":true,"sealed":true}')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)
