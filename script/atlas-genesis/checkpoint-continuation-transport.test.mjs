import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { Worker } from "node:worker_threads"
import { createCommandClient } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"

async function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "atlas-continuation-transport-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, "bin"))
  writeFileSync(join(root, "provider.calls"), "")
  writeFileSync(join(root, "requests.jsonl"), "")
  writeFileSync(join(root, "bin/grok"), `#!/usr/bin/env node
const fs=require('node:fs'),assert=require('node:assert/strict')
const args=process.argv.slice(2)
assert.equal(args[args.indexOf('--model')+1],'grok-4.7')
assert.equal(args[args.indexOf('--max-turns')+1],'1')
assert(fs.fstatSync(0).isFile())
fs.appendFileSync(${JSON.stringify(join(root, "provider.calls"))},'called\\n')
process.stdout.write('synthetic fresh provider output\\n')
`, { mode: 0o700 })
  const server = new Worker(new URL("./checkpoint-continuation-http-control.mjs", import.meta.url), {
    workerData: { log: join(root, "requests.jsonl"), ...options },
  })
  t.after(() => server.terminate())
  const [url] = await once(server, "message")
  return { root, url }
}

function capture(f, wrapper = fileURLToPath(new URL("./grok-checkpoint.sh", import.meta.url))) {
  // The real compiled client launches a capturing shell; the wrapper's original buffers/status stay raw.
  const client = createCommandClient({ cmd: "sh", args: ["-c",
    'env "PATH=$1" "RUNNER_TEMP=$2" "ATLAS_CHECKPOINT_URL=$3" "ATLAS_CHECKPOINT_NONCE=synthetic-continuation-capability" sh "$4" >"$5" 2>"$6"; code=$?; printf "%s" "$code" >"$7"',
    "continuation-capture", `${join(f.root, "bin")}:${process.env.PATH}`, f.root, f.url, wrapper,
    join(f.root, "stdout"), join(f.root, "stderr"), join(f.root, "code")] })
  client.complete("synthetic original request\n", { timeoutMs: 10000, costCap: 1 })
  return { stdout: readFileSync(join(f.root, "stdout")), stderr: readFileSync(join(f.root, "stderr")),
    exitCode: Number(readFileSync(join(f.root, "code"))), calls: readFileSync(join(f.root, "provider.calls"), "utf8"),
    requests: readFileSync(join(f.root, "requests.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((row) => JSON.parse(row)) }
}

for (const exitCode of [0, 7]) {
  test(`protected replay preserves original binary buffers and status ${exitCode} without invoking the provider`, async (t) => {
    const stdout = Buffer.from([0, 255, 10, 65])
    const stderr = Buffer.from([255, 0, 10])
    const f = await fixture(t, { replay: true, completion: {
      exitCode, stdout: stdout.toString("base64"), stderr: stderr.toString("base64"),
    } })
    const result = capture(f)
    assert.equal(result.exitCode, exitCode)
    assert.deepEqual(result.stdout, stdout)
    assert.deepEqual(result.stderr, stderr)
    assert.equal(result.calls, "")
    assert.deepEqual(result.requests.map((row) => row.operation), ["/dispatch"])
  })
}

test("missing cached completion still uses exactly one protected provider call and external completion acknowledgement", async (t) => {
  const f = await fixture(t)
  const result = capture(f)
  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout.toString(), "synthetic fresh provider output\n")
  assert.equal(result.calls, "called\n")
  assert.deepEqual(result.requests.map((row) => row.operation), ["/dispatch", "/completion"])
  assert.equal(result.requests[1].payload.stdout, result.stdout.toString("base64"))
})

test("cached payload validation cannot fall through to a fresh provider request", async (t) => {
  for (const completion of [null, { exitCode: 256, stdout: "", stderr: "" }, { exitCode: 0, stdout: "not base64!", stderr: "" }]) {
    const f = await fixture(t, { replay: true, completion })
    const result = capture(f)
    assert.notEqual(result.exitCode, 0)
    assert.equal(result.calls, "")
    assert.equal(result.stdout.length, 0)
    assert.deepEqual(result.requests.map((row) => row.operation), ["/dispatch"])
  }
})

test("the protected wrapper withholds a newly generated response when external acknowledgement is refused", async (t) => {
  const f = await fixture(t, { refuseCompletion: true })
  const result = capture(f)
  assert.notEqual(result.exitCode, 0)
  assert.equal(result.stdout.length, 0)
  assert.equal(result.calls, "called\n")
  assert.deepEqual(result.requests.map((row) => row.operation), ["/dispatch", "/completion"])
})

test("the actual cached-command guard mutation is rejected by the no-provider/exact-byte oracle", async (t) => {
  const oracle = (result) => {
    assert.equal(result.calls, "")
    assert.deepEqual(result.stdout, Buffer.from([0, 255, 10, 65]))
  }
  const options = { replay: true, completion: { exitCode: 0, stdout: Buffer.from([0, 255, 10, 65]).toString("base64"), stderr: "" } }
  oracle(capture(await fixture(t, options)))
  const f = await fixture(t, options)
  const text = readFileSync(new URL("./grok-checkpoint.sh", import.meta.url), "utf8")
  const needle = "Object.hasOwn(reply, 'completion')"
  assert.equal(text.split(needle).length, 2)
  const wrapper = join(f.root, "mutant.sh")
  writeFileSync(wrapper, text.replace(needle, "false"))
  for (const name of ["grok-text.sh", "grok-agent.json"]) {
    writeFileSync(join(f.root, name), readFileSync(new URL(`./${name}`, import.meta.url)), { mode: 0o700 })
  }
  assert.throws(() => oracle(capture(f, wrapper)), assert.AssertionError)
})
