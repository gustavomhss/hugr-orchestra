// The node-runner smoke for the WP3 adapters (test-ci `--runner node`, R2-9): Process and the omni MCP transport under
// Node, not Bun, as the desktop server runs them. Bun bundles the adapters for Node first (the build-node.ts way, with
// hugr-omni left external), then node:test drives them against the nonce tree.
// Run: ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict node --experimental-strip-types --test test/util/process.node-smoke.mjs
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { after, before, test } from "node:test"
import { pathToFileURL } from "node:url"
import { gone, reap, tree } from "../../../core/test/fixture/process-tree.ts"

process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER ||= "strict"
const root = path.resolve(import.meta.dirname, "..", "..")
// Inside the package, so the external hugr-omni resolves from its node_modules.
const out = path.join(root, "node_modules", ".omni-node-smoke", String(process.pid))
let adapters

before(() => {
  mkdirSync(out, { recursive: true })
  const entry = path.join(out, "entry.ts")
  writeFileSync(
    entry,
    [
      `export { Process } from ${JSON.stringify(path.join(root, "src", "util", "process.ts"))}`,
      `export { McpStdio } from ${JSON.stringify(path.join(root, "src", "mcp", "stdio.ts"))}`,
      `export { Omni } from "@orchestra/core/omni"`,
    ].join("\n"),
  )
  const built = spawnSync(
    "bun",
    [
      "build",
      entry,
      "--target=node",
      "--format=esm",
      "--external",
      "hugr-omni",
      "--outfile",
      path.join(out, "adapters.mjs"),
    ],
    { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
  )
  assert.equal(built.status, 0, `bun build failed: ${built.stderr}${built.stdout}`)
})

after(() => rmSync(out, { recursive: true, force: true }))

async function load() {
  adapters ??= await import(pathToFileURL(path.join(out, "adapters.mjs")).href)
  return adapters
}

test("Process.run and Process.spawn run on omni under Node", async () => {
  const { Process, Omni } = await load()
  const out = await Process.run([process.execPath, "-e", "process.stdout.write(process.env.SMOKE ?? '')"], {
    env: { SMOKE: "node-host" },
  })
  assert.equal(out.code, 0)
  assert.equal(out.stdout.toString(), "node-host")

  const t = tree(2)
  try {
    const abort = new AbortController()
    const proc = Process.spawn([t.command, ...t.args], { stdout: "pipe", abort: abort.signal })
    await new Promise((resolve, reject) => {
      let text = ""
      proc.stdout.on("data", (chunk) => {
        text += chunk
        if (text.includes(t.ready)) resolve(undefined)
      })
      proc.stdout.once("end", () => reject(new Error(`ended before ready: ${text}`)))
    })
    abort.abort()
    assert.notEqual(await proc.exited, 0)
    assert.equal(await gone(t.nonce), 0)
  } finally {
    await reap(t.nonce)
  }
  assert.ok(Omni.snapshot().spawns >= 2, JSON.stringify(Omni.snapshot()))
  assert.equal(Omni.snapshot().delegations, 0)
})

test("the omni MCP transport starts, exchanges a message and closes once under Node", async () => {
  const { McpStdio } = await load()
  const server = new McpStdio.OmniStdioTransport({
    command: process.execPath,
    args: ["-e", "process.stdin.on('data', (d) => process.stdout.write(d)); console.error('server up')"],
  })
  const messages = []
  let closed = 0
  server.onmessage = (message) => messages.push(message)
  server.onclose = () => closed++
  await server.start()
  await server.send({ jsonrpc: "2.0", id: 1, method: "ping" })
  const deadline = Date.now() + 20_000
  while (messages.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(messages, [{ jsonrpc: "2.0", id: 1, method: "ping" }])
  await server.close()
  assert.equal(closed, 1)
  assert.match(server.stderrTail(), /server up/)
})
