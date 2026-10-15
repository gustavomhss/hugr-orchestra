// The node-runner smoke of the omni terminal backend (test-ci `--runner node`): pty/omni.ts under Node, not Bun.
// Run: node --experimental-strip-types --test test/pty/omni.node-smoke.mjs (needs a built addon and supervisor).
import assert from "node:assert/strict"
import os from "node:os"
import { test } from "node:test"
import { Omni } from "../../src/omni.ts"
import { PtyOmni } from "../../src/pty/omni.ts"
import { gone, reap, sweep, tree } from "../fixture/process-tree.ts"

const options = { name: "xterm-256color", cols: 200, rows: 24, cwd: os.tmpdir() }
const plain = (text) => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")

test("a terminal child's output and exit reach listeners attached after it exited", async () => {
  const { spawn } = await PtyOmni.load()
  const before = Omni.snapshot().spawns
  const nonce = `node-smoke-${crypto.randomUUID()}`
  const proc = spawn(process.execPath, ["-e", "process.stdout.write('hello ' + process.argv.at(-1))", nonce], options)
  assert.equal(Omni.snapshot().spawns, before + 1)
  await proc.child.wait()
  const chunks = []
  proc.onData((data) => chunks.push(data))
  const exit = await new Promise((resolve) => proc.onExit(resolve))
  assert.equal(exit.exitCode, 0)
  assert.ok(plain(chunks.join("")).includes(`hello ${nonce}`), JSON.stringify(chunks.join("")))
})

test("stop ends the whole tree under a terminal", async () => {
  const { spawn } = await PtyOmni.load()
  const fixture = tree(2)
  try {
    const proc = spawn(fixture.command, fixture.args, options)
    const seen = { text: "" }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ready line: ${seen.text.slice(-500)}`)), 30_000)
      proc.onData((data) => {
        seen.text += data
        if (!plain(seen.text).includes(fixture.ready)) return
        clearTimeout(timer)
        resolve(undefined)
      })
    })
    await proc.stop(2000)
    assert.equal(await gone(fixture.nonce), 0)
    assert.deepEqual(await sweep(fixture.nonce), [])
  } finally {
    await reap(fixture.nonce)
  }
})
