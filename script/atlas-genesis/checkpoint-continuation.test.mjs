import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { controlIdentity, controlStore } from "./checkpoint-fixture.mjs"
import { decodeChain, encodeEnvelope, sha256, snapshotFiles } from "./checkpoint.mjs"

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "atlas-continuation-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  controlStore(root)
  mkdirSync(join(root, "evidence"))
  const plan = Buffer.from('{"sites":[{"rank":1,"path":"src/control.ts"}]}\n')
  writeFileSync(join(root, "evidence/plan-advisory.json"), plan)
  const identity = { ...controlIdentity, mode: "production" }
  const prompt = Buffer.from("original complete prompt\n")
  const pending = Buffer.from("original unresolved prompt\n")
  const stdout = Buffer.from([0, 255, 10, 65])
  const stderr = Buffer.from([255, 0, 10])
  const completedRequest = randomUUID()
  const retryRequest = randomUUID()
  const first = { kind: "dispatch", arm: "advisory", request: completedRequest,
    promptSha256: sha256(prompt), promptBytes: prompt.length }
  const events = [{ kind: "snapshot", boundary: "initial", files: snapshotFiles(root, join(root, "evidence")) },
    first, { ...first, kind: "completion", exitCode: 7, stdout: stdout.toString("base64"), stderr: stderr.toString("base64") },
    { ...first, request: retryRequest, promptSha256: sha256(pending), promptBytes: pending.length }]
  const records = []
  for (const [index, event] of events.entries()) records.push(encodeEnvelope({ ...event, identity, version: 1,
    sequence: index + 1, previous: index ? sha256(records[index - 1]) : null }, join(root, `event-${index}`), {}))
  const chain = decodeChain(records, identity)
  const snapshot = chain.envelopes[0]
  const cas = snapshot.files.filter((file) => file.path.startsWith("atlas/cas/"))
    .map((file) => [file.path.slice("atlas/cas/".length), file.sha256]).sort((a, b) => a[0].localeCompare(b[0]))
  const expected = { identity, lastSequence: records.length, lastEnvelopeSha256: sha256(records.at(-1)),
    dispatches: 2, completions: 1, inFlightRequest: retryRequest, inFlightPromptSha256: sha256(pending),
    planSha256: sha256(plan), stagingSha256: snapshot.files.find((file) => file.path === "atlas/staging.json").sha256,
    casFiles: cas.length, casInventorySha256: sha256(JSON.stringify(cas)) }
  return { records, expected, retryRequest, completedRequest, prompt, pending, stdout, stderr }
}

const receipt = (prompt, arm = "advisory") => ({ arm, promptSha256: sha256(prompt), promptBytes: prompt.length })
async function router(f, expected = f.expected, retryRequest = f.retryRequest) {
  const { createContinuation } = await import("./checkpoint-continuation.mjs")
  return createContinuation(f.records, expected, retryRequest)
}

test("continuation replays original command bytes/status and reserves a distinct source-linked retry", async (t) => {
  const f = fixture(t)
  const source = await router(f)
  const replay = source.take(receipt(f.prompt))
  assert.equal(replay.origin.kind, "replay")
  assert.equal(replay.origin.sourceRun, f.expected.identity.run)
  assert.equal(replay.origin.sourceAttempt, f.expected.identity.attempt)
  assert.equal(replay.origin.sourceRequest, f.completedRequest)
  assert.notEqual(replay.request, f.completedRequest)
  assert.deepEqual(replay.completion, { exitCode: 7, stdout: f.stdout.toString("base64"), stderr: f.stderr.toString("base64") })
  const retry = source.take(receipt(f.pending))
  assert.equal(retry.origin.kind, "retry")
  assert.equal(retry.origin.sourceRequest, f.retryRequest)
  assert.notEqual(retry.request, f.retryRequest)
  assert.equal(retry.completion, undefined)
  assert.deepEqual(source.summary(), { replayed: 0, retried: 0, fresh: 0, inFlight: 2, originalUnresolved: 1 })
})

test("continuation permits fresh calls only after all cached and retry completions are acknowledged", async (t) => {
  const f = fixture(t)
  const source = await router(f)
  const fresh = receipt(Buffer.from("a genuinely later request"))
  assert.throws(() => source.take(fresh), /source.*incomplete/)
  const replay = source.take(receipt(f.prompt))
  const retry = source.take(receipt(f.pending))
  source.confirm(retry.request)
  assert.throws(() => source.take(fresh), /source.*incomplete/)
  source.confirm(replay.request)
  const next = source.take(fresh)
  assert.equal(next.origin.kind, "fresh")
  assert.equal(next.completion, undefined)
  assert.deepEqual(source.summary(), { replayed: 1, retried: 1, fresh: 0, inFlight: 1, originalUnresolved: 1 })
  source.confirm(next.request)
  assert.deepEqual(source.summary(), { replayed: 1, retried: 1, fresh: 1, inFlight: 0, originalUnresolved: 1 })
})

test("continuation rejects wrong retry selection, known-hash arm/length changes and duplicate reservations", async (t) => {
  const f = fixture(t)
  await assert.rejects(() => router(f, f.expected, randomUUID()), /retry.*request/)
  const source = await router(f)
  assert.throws(() => source.take(receipt(f.prompt, "count")), /source.*binding/)
  assert.throws(() => source.take({ ...receipt(f.prompt), promptBytes: f.prompt.length + 1 }), /source.*binding/)
  const replay = source.take(receipt(f.prompt))
  assert.throws(() => source.take(receipt(f.prompt)), /already.*reserved/)
  assert.throws(() => source.confirm(randomUUID()), /unknown.*request/)
  source.confirm(replay.request)
  assert.throws(() => source.confirm(replay.request), /already.*confirmed/)
  assert.throws(() => source.take(receipt(f.prompt)), /already.*reserved/)
})

for (const field of ["lastSequence", "lastEnvelopeSha256", "dispatches", "completions", "inFlightRequest",
  "inFlightPromptSha256", "planSha256", "stagingSha256", "casFiles", "casInventorySha256"]) {
  test(`continuation refuses a changed independently frozen source ${field} before routing`, async (t) => {
    const f = fixture(t)
    const expected = { ...f.expected, [field]: typeof f.expected[field] === "number" ? f.expected[field] + 1 : "0".repeat(64) }
    await assert.rejects(() => router(f, expected))
  })
}

test("continuation refuses an altered source chain or changed source budget before routing", async (t) => {
  const f = fixture(t)
  await assert.rejects(() => router({ ...f, records: f.records.slice(0, -1) }))
  await assert.rejects(() => router(f, { ...f.expected, identity: { ...f.expected.identity, budget: "201" } }))
})
