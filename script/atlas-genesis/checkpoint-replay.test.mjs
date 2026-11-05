import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { createCommandClient, ModelCommandError } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"
import { controlIdentity, controlStore } from "./checkpoint-fixture.mjs"
import { encodeEnvelope, sha256, snapshotFiles } from "./checkpoint.mjs"
import { prepareReplay, readReplay, replaySummary, verifyReplayPlan } from "./checkpoint-replay.mjs"

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "atlas-checkpoint-replay-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  controlStore(root)
  mkdirSync(join(root, "evidence"))
  const plan = Buffer.from('{"sites":[{"rank":1,"path":"src/control.ts"}]}\n')
  writeFileSync(join(root, "evidence/plan-advisory.json"), plan)
  const identity = { ...controlIdentity, mode: "production" }
  const prompt = Buffer.from("one original complete prompt\n")
  const stdout = Buffer.from('private scratch\n```atlas-fact\n{"facts":[{"claim":"First original claim."},{"claim":"Second original claim."}]}\n```\n')
  const stderr = Buffer.from("original command diagnostic\n")
  const events = [{ kind: "snapshot", boundary: "initial", files: snapshotFiles(root, join(root, "evidence")) },
    { kind: "dispatch", arm: "advisory", request: randomUUID(), promptSha256: sha256(prompt), promptBytes: prompt.length }]
  events.push({ ...events[1], kind: "completion", exitCode: 0, stdout: stdout.toString("base64"), stderr: stderr.toString("base64") })
  events.push({ ...events[1], request: randomUUID(), promptSha256: sha256("unresolved"), promptBytes: Buffer.byteLength("unresolved") })
  const records = []
  for (const [index, event] of events.entries()) records.push(encodeEnvelope({ ...event, identity, version: 1,
    sequence: index + 1, previous: index ? sha256(records[index - 1]) : null }, join(root, `event-${index}`), {}))
  return { root, records, identity, prompt, stdout, stderr, plan, destination: join(root, "replay") }
}

test("exact replay retains original command buffers, rejects repeated delivery and never invents an in-flight completion", (t) => {
  const f = fixture(t)
  prepareReplay(f.records, f.identity, f.destination)
  verifyReplayPlan(f.destination, "advisory", f.plan)
  assert.throws(() => verifyReplayPlan(f.destination, "advisory", Buffer.from("different plan")), /plan mismatch/)
  const result = readReplay(f.destination, f.prompt)
  assert.equal(result.kind, "completion")
  assert.equal(result.exitCode, 0)
  assert.deepEqual(result.stdout, f.stdout)
  assert.deepEqual(result.stderr, f.stderr)
  assert.throws(() => readReplay(f.destination, f.prompt), /already delivered/)
  assert.equal(readReplay(f.destination, Buffer.from("unresolved")).kind, "in-flight")
  assert.throws(() => readReplay(f.destination, Buffer.from("unknown prompt")), /prompt mismatch/)
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
  assert.throws(() => client.complete("unresolved", { timeoutMs: 10000, costCap: 1 }), (error) => {
    assert(error instanceof ModelCommandError)
    assert.equal(error.reason, "nonzero-exit")
    assert(error.message.includes("checkpoint replay: unresolved dispatch; no provider called"))
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

test("a corrupt source chain is refused before creating a replay destination", (t) => {
  const f = fixture(t)
  assert.throws(() => prepareReplay(f.records.slice(1), f.identity, f.destination), /missing\/reordered sequence/)
  assert.throws(() => readFileSync(join(f.destination, "replay.json")), { code: "ENOENT" })
})
