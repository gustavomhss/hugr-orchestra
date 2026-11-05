import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { test } from "node:test"
import { once } from "node:events"
import { Worker } from "node:worker_threads"
import { gzipSync, gunzipSync } from "node:zlib"
import { createCommandClient, ModelCommandError } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"
import { controlIdentity, controlStore } from "./checkpoint-fixture.mjs"
import { encodeEnvelope, sha256, snapshotFiles } from "./checkpoint.mjs"
import { prepareReplay, readReplay, replaySummary, verifyReplayPlan } from "./checkpoint-replay.mjs"

function fixture(t, exitCode = 0) {
  const root = mkdtempSync(join(tmpdir(), "atlas-checkpoint-replay-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  controlStore(root)
  mkdirSync(join(root, "evidence"))
  const plan = Buffer.from('{"sites":[{"rank":1,"path":"src/control.ts"}]}\n')
  writeFileSync(join(root, "evidence/plan-advisory.json"), plan)
  writeFileSync(join(root, "evidence/plan-count.json"), '{"sites":[{"rank":2,"path":"src/count.ts"}]}\n')
  const identity = { ...controlIdentity, mode: "production" }
  const prompt = Buffer.from("one original complete prompt\n")
  const stdout = Buffer.from('private scratch\n```atlas-fact\n{"facts":[{"claim":"First original claim."},{"claim":"Second original claim."}]}\n```\n')
  const stderr = Buffer.from("original command diagnostic\n")
  const events = [{ kind: "snapshot", boundary: "initial", files: snapshotFiles(root, join(root, "evidence")) },
    { kind: "dispatch", arm: "advisory", request: randomUUID(), promptSha256: sha256(prompt), promptBytes: prompt.length }]
  events.push({ ...events[1], kind: "completion", exitCode, stdout: stdout.toString("base64"), stderr: stderr.toString("base64") })
  events.push({ ...events[1], request: randomUUID(), promptSha256: sha256("unresolved"), promptBytes: Buffer.byteLength("unresolved") })
  const records = []
  for (const [index, event] of events.entries()) records.push(encodeEnvelope({ ...event, identity, version: 1,
    sequence: index + 1, previous: index ? sha256(records[index - 1]) : null }, join(root, `event-${index}`), {}))
  return { root, records, identity, prompt, stdout, stderr, plan, destination: join(root, "replay") }
}

function captureCli(f, directory, prompt = f.prompt) {
  const client = createCommandClient({ cmd: "sh", args: ["-c",
    '"$1" "$2" command "$3" >"$4" 2>"$5"; code=$?; printf "%s" "$code" >"$6"', "replay-control",
    process.execPath, fileURLToPath(new URL("./checkpoint-replay.mjs", import.meta.url)), directory,
    join(f.root, "cli.stdout"), join(f.root, "cli.stderr"), join(f.root, "cli.code")] })
  client.complete(prompt.toString(), { timeoutMs: 10000, costCap: 1 })
  return { stdout: readFileSync(join(f.root, "cli.stdout")), stderr: readFileSync(join(f.root, "cli.stderr")),
    exitCode: Number(readFileSync(join(f.root, "cli.code"))) }
}

test("exact replay retains original command buffers, rejects repeated delivery and never invents an in-flight completion", (t) => {
  const f = fixture(t)
  prepareReplay(f.records, f.identity, f.destination)
  verifyReplayPlan(f.destination, "advisory", f.plan)
  assert.throws(() => verifyReplayPlan(f.destination, "advisory", Buffer.from("different plan")), /plan mismatch/)
  assert.throws(() => verifyReplayPlan(f.destination, "count", f.plan), /plan mismatch/)
  assert.throws(() => verifyReplayPlan(f.destination, "unknown-arm", f.plan), /plan mismatch/)
  const result = readReplay(f.destination, f.prompt)
  assert.equal(result.kind, "completion")
  assert.equal(result.exitCode, 0)
  assert.deepEqual(result.stdout, f.stdout)
  assert.deepEqual(result.stderr, f.stderr)
  assert.throws(() => readReplay(f.destination, f.prompt), /already delivered/)
  assert.equal(readReplay(f.destination, Buffer.from("unresolved")).kind, "in-flight")
  assert.throws(() => readReplay(f.destination, Buffer.from("unknown prompt")), /prompt mismatch/)
  const usage = readdirSync(join(f.destination, "usage")).map((name) => readFileSync(join(f.destination, "usage", name), "utf8")).join("")
  const manifest = JSON.parse(readFileSync(join(f.destination, "replay.json")))
  const receipt = JSON.parse(readFileSync(join(f.destination, "usage", `${sha256(f.prompt)}.json`)))
  assert.deepEqual(receipt, { kind: "completion", promptSha256: sha256(f.prompt), promptBytes: f.prompt.length,
    request: manifest.requests[sha256(f.prompt)].request })
  assert.equal(readdirSync(join(f.destination, "usage")).length, 3)
  for (const sentinel of [f.prompt.toString().trim(), "private scratch", "original command diagnostic"]) assert(!usage.includes(sentinel))
  assert.deepEqual(replaySummary(f.destination), { dispatched: 2, completed: 1, inFlight: 1,
    delivered: 1, encounteredInFlight: 1, unmatched: 1, providerCalls: 0 })
})

test("the compiled command client consumes original multi-fact stdout through its unchanged parser", (t) => {
  const f = fixture(t)
  prepareReplay(f.records, f.identity, f.destination)
  const client = createCommandClient({ cmd: process.execPath,
    args: [fileURLToPath(new URL("./checkpoint-replay.mjs", import.meta.url)), "command", f.destination] }, "block")
  const result = client.complete(f.prompt.toString(), { timeoutMs: 10000, costCap: 1 })
  assert.deepEqual(result.claims.map((item) => item.claim), ["First original claim.", "Second original claim."])
  assert(!result.rawAnswer.includes("private scratch"))
  assert.throws(() => client.complete(f.prompt.toString(), { timeoutMs: 10000, costCap: 1 }), /already delivered/)
  assert.throws(() => client.complete("unresolved", { timeoutMs: 10000, costCap: 1 }), (error) => {
    assert(error instanceof ModelCommandError)
    assert.equal(error.reason, "nonzero-exit")
    assert(error.message.includes("checkpoint replay: unresolved dispatch; no provider called"))
    assert(!error.message.includes("private scratch"))
    assert(!error.message.includes("First original claim."))
    assert(!error.message.includes("original command diagnostic"))
    return true
  })
})

test("a changed preserved response is refused before any bytes are delivered", (t) => {
  const f = fixture(t)
  prepareReplay(f.records, f.identity, f.destination)
  const manifest = JSON.parse(readFileSync(join(f.destination, "replay.json")))
  const entry = manifest.requests[sha256(f.prompt)]
  writeFileSync(join(f.destination, "responses", `${entry.request}.json`), '{"stdout":"altered"}\n')
  assert.throws(() => readReplay(f.destination, f.prompt), /response hash mismatch/)
  assert.equal(replaySummary(f.destination).delivered, 0)
})

test("equivalent identity property order cannot make a validated original response unreplayable", (t) => {
  const f = fixture(t)
  prepareReplay(f.records, Object.fromEntries(Object.entries(f.identity).reverse()), f.destination)
  assert.deepEqual(readReplay(f.destination, f.prompt), { kind: "completion", exitCode: 0, stdout: f.stdout, stderr: f.stderr })
})

test("a corrupt source chain is refused before creating a replay destination", (t) => {
  const f = fixture(t)
  assert.throws(() => prepareReplay(f.records.slice(1), f.identity, f.destination), /missing\/reordered sequence/)
  assert.equal(existsSync(f.destination), false)
})

test("changed original response bytes with an unrelinked successor are rejected before restoration", (t) => {
  const f = fixture(t)
  const records = [...f.records]
  const changed = JSON.parse(gunzipSync(records[2]))
  changed.stdout = Buffer.from("different valid original response bytes").toString("base64")
  records[2] = gzipSync(JSON.stringify(changed))
  assert.throws(() => prepareReplay(records, f.identity, f.destination), /chain mismatch/)
  assert.equal(existsSync(f.destination), false)
})

test("preparation faithfully restores original files and refuses an existing destination without changing it", (t) => {
  const f = fixture(t)
  prepareReplay(f.records, f.identity, f.destination)
  const snapshot = JSON.parse(gunzipSync(f.records[0]))
  for (const file of snapshot.files) assert.deepEqual(readFileSync(join(f.destination, file.path)), Buffer.from(file.bytes, "base64"))
  assert.deepEqual(readdirSync(join(f.destination, "usage")), [])
  const before = readFileSync(join(f.destination, "replay.json"))
  assert.throws(() => prepareReplay(f.records, f.identity, f.destination), /destination already exists/)
  assert.deepEqual(readFileSync(join(f.destination, "replay.json")), before)
})

for (const fault of ["wrong-identity", "linkage", "snapshot", "ambiguous-completed", "ambiguous-unresolved"]) {
  test(`preparation rejects ${fault} before creating any destination`, (t) => {
    const f = fixture(t)
    const events = f.records.map((bytes) => JSON.parse(gunzipSync(bytes)))
    if (fault === "linkage") events[2].request = randomUUID()
    if (fault === "snapshot") events[0].files[0].bytes = Buffer.from("corrupt").toString("base64")
    if (fault.startsWith("ambiguous")) {
      events[3].promptSha256 = events[1].promptSha256
      events[3].promptBytes = events[1].promptBytes
      if (fault === "ambiguous-completed") events.push({ ...events[2], request: events[3].request })
    }
    const records = []
    for (const [index, event] of events.entries()) records.push(gzipSync(JSON.stringify({ ...event,
      sequence: index + 1, previous: index ? sha256(records[index - 1]) : null })))
    assert.throws(() => prepareReplay(records, fault === "wrong-identity" ? { ...f.identity, budget: "199" } : f.identity, f.destination),
      /identity mismatch|unmatched completion|payload hash mismatch|ambiguous prompt/)
    assert.equal(existsSync(f.destination), false)
  })
}

test("a validly encoded dispatch with the wrong byte length cannot match a regenerated prompt", (t) => {
  const f = fixture(t)
  const events = f.records.map((bytes) => JSON.parse(gunzipSync(bytes)))
  events[1].promptBytes += 1
  events[2].promptBytes += 1
  const records = []
  for (const [index, event] of events.entries()) records.push(gzipSync(JSON.stringify({ ...event,
    previous: index ? sha256(records[index - 1]) : null })))
  prepareReplay(records, f.identity, f.destination)
  assert.throws(() => readReplay(f.destination, f.prompt), /prompt mismatch/)
  assert.equal(replaySummary(f.destination).delivered, 0)
})

for (const field of ["stderr", "exitCode", "manifest"]) {
  test(`replay refuses altered ${field} binding before delivery`, (t) => {
    const f = fixture(t)
    prepareReplay(f.records, f.identity, f.destination)
    const manifest = JSON.parse(readFileSync(join(f.destination, "replay.json")))
    const entry = manifest.requests[sha256(f.prompt)]
    if (field === "manifest") {
      entry.promptBytes += 1
      writeFileSync(join(f.destination, "replay.json"), JSON.stringify(manifest))
    }
    if (field !== "manifest") {
      const path = join(f.destination, "responses", `${entry.request}.json`)
      const response = JSON.parse(readFileSync(path))
      response[field] = field === "exitCode" ? 19 : Buffer.from("altered diagnostic").toString("base64")
      writeFileSync(path, JSON.stringify(response))
    }
    assert.throws(() => readReplay(f.destination, f.prompt), /manifest hash mismatch|response hash mismatch/)
  })
}

test("original nonzero status and byte-sensitive output are not coerced into successful text", (t) => {
  const f = fixture(t, 7)
  const events = f.records.map((bytes) => JSON.parse(gunzipSync(bytes)))
  const stdout = Buffer.from([0, 255, 10, 13, 32])
  const stderr = Buffer.from([32, 13, 10, 0, 254])
  events[2].stdout = stdout.toString("base64")
  events[2].stderr = stderr.toString("base64")
  const records = []
  for (const [index, event] of events.entries()) records.push(gzipSync(JSON.stringify({ ...event,
    previous: index ? sha256(records[index - 1]) : null })))
  prepareReplay(records, f.identity, f.destination)
  assert.deepEqual(readReplay(f.destination, f.prompt), { kind: "completion", exitCode: 7, stdout, stderr })
  const cli = join(f.root, "cli-replay")
  prepareReplay(records, f.identity, cli)
  assert.deepEqual(captureCli(f, cli), { exitCode: 7, stdout, stderr })
})

test("concurrent independent readers can deliver an original completed response at most once", async (t) => {
  const f = fixture(t)
  prepareReplay(f.records, f.identity, f.destination)
  const barrier = new SharedArrayBuffer(4)
  const workers = [0, 1].map(() => new Worker(`
    const { parentPort, workerData } = require('node:worker_threads')
    const fs = require('node:fs'), write = fs.writeFileSync
    // Instrument scheduling only; both calls still perform real atomic OS writes with the original flags.
    fs.writeFileSync = (path, ...args) => {
      if (String(path).includes('/usage/')) {
        const barrier = new Int32Array(workerData.barrier)
        Atomics.add(barrier, 0, 1); Atomics.notify(barrier, 0)
        if (Atomics.load(barrier, 0) < 2 && Atomics.wait(barrier, 0, 1, 10000) === 'timed-out') throw Error('delivery barrier timed out')
      }
      return write(path, ...args)
    }
    require('node:module').syncBuiltinESMExports()
    import(workerData.module).then(({readReplay}) => {
      try { parentPort.postMessage(readReplay(workerData.directory, Buffer.from(workerData.prompt)).kind) }
      catch (error) { parentPort.postMessage(error.message) }
    })
  `, { eval: true, workerData: { module: new URL("./checkpoint-replay.mjs", import.meta.url).href,
    directory: f.destination, prompt: f.prompt, barrier } }))
  t.after(() => Promise.all(workers.map((worker) => worker.terminate())))
  const result = await Promise.all(workers.map((worker) => once(worker, "message").then(([value]) => value)))
  assert.equal(result.filter((value) => value === "completion").length, 1)
  assert.equal(result.filter((value) => value.includes("already delivered")).length, 1)
  assert.equal(replaySummary(f.destination).delivered, 1)
})

test("unknown-prompt and corrupt-response CLI refusals emit neither prompt nor preserved response bytes", (t) => {
  for (const fault of ["unknown", "corrupt"]) {
    const f = fixture(t)
    prepareReplay(f.records, f.identity, f.destination)
    if (fault === "corrupt") {
      const manifest = JSON.parse(readFileSync(join(f.destination, "replay.json")))
      writeFileSync(join(f.destination, "responses", `${manifest.requests[sha256(f.prompt)].request}.json`), "sensitive-corrupt-response-123456789")
    }
    const prompt = fault === "unknown" ? Buffer.from("sensitive-unknown-prompt-123456789") : f.prompt
    const result = captureCli(f, f.destination, prompt)
    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout.length, 0)
    assert.equal(result.stderr.toString(), "checkpoint replay refused; no provider called\n")
    for (const secret of [prompt.toString(), "private scratch", "First original claim.", "sensitive-corrupt-response-123456789"]) {
      assert(!result.stderr.includes(Buffer.from(secret)))
    }
  }
})

test("the response-integrity oracle rejects the actual helper with its hash comparison removed", async (t) => {
  const oracle = (read, f) => {
    prepareReplay(f.records, f.identity, f.destination)
    const manifest = JSON.parse(readFileSync(join(f.destination, "replay.json")))
    const entry = manifest.requests[sha256(f.prompt)]
    const path = join(f.destination, "responses", `${entry.request}.json`)
    const response = JSON.parse(readFileSync(path))
    response.stderr = Buffer.from("different bytes").toString("base64")
    writeFileSync(path, JSON.stringify(response))
    assert.throws(() => read(f.destination, f.prompt), /response hash mismatch/)
  }
  oracle(readReplay, fixture(t))
  const f = fixture(t)
  const source = readFileSync(new URL("./checkpoint-replay.mjs", import.meta.url), "utf8")
  const needle = 'if (response !== undefined) assert.equal(sha256(response), entry.completionSha256, "checkpoint replay: response hash mismatch")'
  assert.equal(source.split(needle).length, 2)
  writeFileSync(join(f.root, "mutant.mjs"), source.replace(needle, "void 0")
    .replace('from "./checkpoint.mjs"', `from ${JSON.stringify(new URL("./checkpoint.mjs", import.meta.url).href)}`))
  const mutant = await import(pathToFileURL(join(f.root, "mutant.mjs")).href)
  assert.throws(() => oracle(mutant.readReplay, f), assert.AssertionError)
})
