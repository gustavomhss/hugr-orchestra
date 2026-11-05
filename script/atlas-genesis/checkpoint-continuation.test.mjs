import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { gzipSync, gunzipSync } from "node:zlib"
import { id } from "../../modules/atlas/packages/kernel/dist/src/index.js"
import { controlIdentity, controlStore } from "./checkpoint-fixture.mjs"
import { decodeChain, encodeEnvelope, sha256, snapshotFiles } from "./checkpoint.mjs"

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "atlas-continuation-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  controlStore(root).store.put("unused source carrier")
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
  const createContinuation = await implementation()
  return createContinuation(f.records, expected, retryRequest)
}

async function implementation() {
  const { createContinuation } = await import("./checkpoint-continuation.mjs")
  assert.equal(typeof createContinuation, "function", "continuation implementation export is missing")
  return createContinuation
}

async function refuseSource(f, expected = f.expected, retryRequest = f.retryRequest, reason) {
  // Import outside the refusal oracle: a missing implementation is RED, not a successful rejection.
  const createContinuation = await implementation()
  assert.throws(() => createContinuation(f.records, expected, retryRequest), reason)
}

test("continuation replays original command bytes/status and reserves a distinct source-linked retry", async (t) => {
  const f = fixture(t)
  const source = await router(f)
  assert.deepEqual(source.summary(), { replayed: 0, retried: 0, fresh: 0, inFlight: 0, originalUnresolved: 1 })
  const replay = source.take(receipt(f.prompt))
  assert.equal(replay.origin.kind, "replay")
  assert.equal(replay.origin.sourceRun, f.expected.identity.run)
  assert.equal(replay.origin.sourceAttempt, f.expected.identity.attempt)
  assert.equal(replay.origin.sourceRequest, f.completedRequest)
  assert.notEqual(replay.request, f.completedRequest)
  assert.match(replay.request, /^[0-9a-f-]{36}$/)
  for (const field of ["arm", "promptSha256", "promptBytes"]) assert.equal(replay[field], receipt(f.prompt)[field])
  assert.deepEqual(replay.completion, { exitCode: 7, stdout: f.stdout.toString("base64"), stderr: f.stderr.toString("base64") })
  const retry = source.take(receipt(f.pending))
  assert.equal(retry.origin.kind, "retry")
  assert.equal(retry.origin.sourceRequest, f.retryRequest)
  assert.equal(retry.origin.sourceRun, f.expected.identity.run)
  assert.equal(retry.origin.sourceAttempt, f.expected.identity.attempt)
  for (const field of ["arm", "promptSha256", "promptBytes"]) assert.equal(retry[field], receipt(f.pending)[field])
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
  const outstanding = { replayed: 0, retried: 0, fresh: 0, inFlight: 2, originalUnresolved: 1 }
  assert.throws(() => source.confirm())
  assert.deepEqual(source.summary(), outstanding)
  for (const originalRequest of [f.completedRequest, f.retryRequest]) {
    assert.throws(() => source.confirm(originalRequest))
    assert.deepEqual(source.summary(), outstanding)
    assert.throws(() => source.take(fresh), /source.*incomplete/)
  }
  source.confirm(retry.request)
  assert.throws(() => source.take(fresh), /source.*incomplete/)
  source.confirm(replay.request)
  const next = source.take(fresh)
  assert.deepEqual(next.origin, { kind: "fresh" })
  for (const field of ["arm", "promptSha256", "promptBytes"]) assert.equal(next[field], fresh[field])
  assert.equal(next.completion, undefined)
  const laterReceipt = receipt(Buffer.from("a second genuinely later request"), "dependency")
  const later = source.take(laterReceipt)
  for (const field of ["arm", "promptSha256", "promptBytes"]) assert.equal(later[field], laterReceipt[field])
  assert.deepEqual(later.origin, { kind: "fresh" })
  assert.equal(later.completion, undefined)
  laterReceipt.arm = "count"
  laterReceipt.promptSha256 = sha256("caller mutated its own fresh receipt")
  assert.equal(later.arm, "dependency")
  assert.equal(later.promptSha256, sha256("a second genuinely later request"))
  assert.throws(() => { later.origin.kind = "replay" }, TypeError)
  const ids = [replay.request, retry.request, next.request, later.request]
  assert.equal(new Set(ids).size, 4)
  for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/)
  for (const id of ids) assert(![f.completedRequest, f.retryRequest].includes(id))
  assert.deepEqual(source.summary(), { replayed: 1, retried: 1, fresh: 0, inFlight: 2, originalUnresolved: 1 })
  source.confirm(later.request)
  assert.deepEqual(source.summary(), { replayed: 1, retried: 1, fresh: 1, inFlight: 1, originalUnresolved: 1 })
  source.confirm(next.request)
  assert.deepEqual(source.summary(), { replayed: 1, retried: 1, fresh: 2, inFlight: 0, originalUnresolved: 1 })
  assert.throws(() => source.confirm(later.request), /already.*confirmed/)
  assert.throws(() => source.take(fresh), /already.*reserved/)
  for (const prompt of [f.prompt, f.pending]) {
    assert.throws(() => source.take(receipt(prompt, "count")))
    assert.throws(() => source.take({ ...receipt(prompt), promptBytes: prompt.length + 1 }))
  }
  assert.throws(() => source.take(receipt(f.pending)), /already.*reserved/)
  for (const invalid of [{ ...receipt(Buffer.from("invalid receipt")), arm: "not-an-arm" }, { ...fresh, promptSha256: "not-a-hash" },
    ...[0, -1, NaN, Infinity, "4"].map((promptBytes) => ({ ...receipt(Buffer.from("invalid receipt")), promptBytes }))]) {
    assert.throws(() => source.take(invalid))
  }
  const opposite = await router(f)
  const otherReplay = opposite.take(receipt(f.prompt))
  opposite.take(receipt(f.pending))
  opposite.confirm(otherReplay.request)
  assert.throws(() => opposite.take(fresh), /source.*incomplete/)
})

test("continuation rejects wrong retry selection, known-hash arm/length changes and duplicate reservations", async (t) => {
  const f = fixture(t)
  await refuseSource(f, f.expected, randomUUID(), /retry.*request/)
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
    await refuseSource(f, expected)
  })
}

test("continuation refuses an altered source chain or changed source budget before routing", async (t) => {
  const f = fixture(t)
  await refuseSource({ ...f, records: f.records.slice(0, -1) })
  await refuseSource(f, { ...f.expected, identity: { ...f.expected.identity, budget: "201" } })
})

for (const field of Object.keys(controlIdentity)) {
  test(`continuation independently binds source identity ${field}`, async (t) => {
    const f = fixture(t)
    const value = f.expected.identity[field]
    const changed = Array.isArray(value) ? [...value].reverse().concat("999") : field === "mode" ? "control" : "9".repeat(String(value).length)
    await refuseSource(f, { ...f.expected, identity: { ...f.expected.identity, [field]: changed } })
  })
}

function rewritten(f, change) {
  const events = f.records.map((bytes) => JSON.parse(gunzipSync(bytes)))
  change(events)
  const records = []
  for (const [index, event] of events.entries()) records.push(gzipSync(JSON.stringify({ ...event,
    sequence: index + 1, previous: index ? sha256(records[index - 1]) : null })))
  return { ...f, records, expected: { ...f.expected, lastSequence: records.length, lastEnvelopeSha256: sha256(records.at(-1)) } }
}

for (const kind of ["plan", "staging", "cas"]) {
  test(`continuation checks actual source ${kind} bytes even with a valid new chain terminus`, async (t) => {
    const f = fixture(t)
    const changed = rewritten(f, (events) => {
      const files = events[0].files
      if (kind === "cas") {
        // Preserve the population and referenced carriers; only exact inventory content can reject this.
        const bytes = Buffer.from(JSON.stringify("replaced unused carrier"))
        const address = String(id("replaced unused carrier"))
        const index = files.findIndex((file) => file.path.endsWith(String(id("unused source carrier"))))
        assert(index >= 0)
        files[index] = { path: `atlas/cas/${address.slice(0, 2)}/${address}`, sha256: sha256(bytes), bytes: bytes.toString("base64") }
        return
      }
      const file = files.find((file) => file.path === (kind === "plan" ? "evidence/plan-advisory.json" : "atlas/staging.json"))
      const payload = JSON.parse(Buffer.from(file.bytes, "base64"))
      const bytes = Buffer.from(JSON.stringify({ ...payload, changedSource: true }) + "\n")
      file.bytes = bytes.toString("base64")
      file.sha256 = sha256(bytes)
    })
    decodeChain(changed.records, changed.expected.identity) // The ordinary codec accepts the mutation.
    await refuseSource(changed, changed.expected, changed.retryRequest, kind === "cas" ? /CAS.*inventory/ : undefined)
  })
}

test("continuation rejects ambiguous prompt occurrences and zero/multiple original pending requests", async (t) => {
  for (const kind of ["ambiguous", "zero-pending", "two-pending"]) {
    const f = fixture(t)
    const changed = rewritten(f, (events) => {
      if (kind === "ambiguous") Object.assign(events[3], receipt(f.prompt))
      if (kind === "zero-pending") events.pop()
      if (kind === "two-pending") events.push({ ...events[3], request: randomUUID(), ...receipt(Buffer.from("another pending")) })
    })
    changed.expected.dispatches = kind === "two-pending" ? 3 : kind === "zero-pending" ? 1 : 2
    if (kind === "ambiguous") changed.expected.inFlightPromptSha256 = sha256(f.prompt)
    decodeChain(changed.records, changed.expected.identity)
    await refuseSource(changed, changed.expected, changed.retryRequest, kind === "ambiguous" ? /ambiguous/ : /pending.*population/)
  }
})

test("continuation tickets and source bindings cannot be mutated and metadata stays private", async (t) => {
  const f = fixture(t)
  const original = f.records.map((record) => Buffer.from(record))
  const run = f.expected.identity.run
  const source = await router(f)
  f.expected.identity.run = "999"
  const input = receipt(f.prompt)
  const replay = source.take(input)
  input.promptSha256 = sha256("mutated caller input")
  input.arm = "count"
  input.promptBytes = 1
  for (const field of ["arm", "promptSha256", "promptBytes"]) assert.equal(replay[field], receipt(f.prompt)[field])
  assert.equal(replay.origin.sourceRun, run)
  assert.throws(() => { replay.origin.kind = "fresh" }, TypeError)
  assert.throws(() => { replay.promptSha256 = sha256("redirected") }, TypeError)
  assert.throws(() => { replay.completion.exitCode = 0 }, TypeError)
  source.confirm(replay.request)
  assert.throws(() => source.take(receipt(f.prompt)), /already.*reserved/)
  const summary = source.summary()
  Reflect.set(summary, "replayed", 999) // Both a defensive copy and a frozen summary are valid.
  assert.deepEqual(source.summary(), { replayed: 1, retried: 0, fresh: 0, inFlight: 0, originalUnresolved: 1 })
  for (const [index, record] of f.records.entries()) assert.deepEqual(record, original[index])
  const metadata = JSON.stringify({ origin: replay.origin, summary: source.summary() })
  for (const privateValue of [f.prompt.toString(), f.pending.toString(), f.stdout.toString("base64"), f.stderr.toString("base64")]) {
    assert(!metadata.includes(privateValue))
  }
})

test("multiple preserved responses route independently in reverse order and all must be confirmed", async (t) => {
  const f = fixture(t)
  const secondPrompt = Buffer.from("another original complete prompt\n")
  const secondRequest = randomUUID()
  const secondCompletion = { exitCode: 0, stdout: Buffer.from([250, 0, 99]).toString("base64"), stderr: Buffer.from([9, 255]).toString("base64") }
  const changed = rewritten(f, (events) => {
    const dispatch = { ...events[1], request: secondRequest, ...receipt(secondPrompt) }
    events.splice(3, 0, dispatch, { ...dispatch, kind: "completion", ...secondCompletion })
  })
  changed.expected.completions = 2
  changed.expected.dispatches = 3
  decodeChain(changed.records, changed.expected.identity)
  const source = await router(changed)
  const second = source.take(receipt(secondPrompt))
  const first = source.take(receipt(f.prompt))
  const retry = source.take(receipt(f.pending))
  assert.equal(second.origin.sourceRequest, secondRequest)
  assert.deepEqual(second.completion, secondCompletion)
  assert.equal(first.origin.sourceRequest, f.completedRequest)
  assert.deepEqual(first.completion, { exitCode: 7, stdout: f.stdout.toString("base64"), stderr: f.stderr.toString("base64") })
  source.confirm(first.request)
  source.confirm(retry.request)
  const fresh = receipt(Buffer.from("a later new prompt"))
  assert.throws(() => source.take(fresh), /source.*incomplete/)
  source.confirm(second.request)
  assert.equal(source.take(fresh).origin.kind, "fresh")
  assert.deepEqual(source.summary(), { replayed: 2, retried: 1, fresh: 0, inFlight: 1, originalUnresolved: 1 })
})

test("continuation binds the final source snapshot, never a matching earlier snapshot", async (t) => {
  const f = fixture(t)
  const changed = rewritten(f, (events) => {
    const files = structuredClone(events[0].files)
    for (const path of ["atlas/staging.json", "evidence/plan-advisory.json"]) {
      const file = files.find((file) => file.path === path)
      const payload = JSON.parse(Buffer.from(file.bytes, "base64"))
      const bytes = Buffer.from(JSON.stringify({ ...payload, laterSnapshot: true }) + "\n")
      file.bytes = bytes.toString("base64")
      file.sha256 = sha256(bytes)
    }
    const bytes = Buffer.from(JSON.stringify("final snapshot extra carrier"))
    const address = String(id("final snapshot extra carrier"))
    files.push({ path: `atlas/cas/${address.slice(0, 2)}/${address}`, sha256: sha256(bytes), bytes: bytes.toString("base64") })
    events.push({ ...events[0], boundary: "final", files })
  })
  decodeChain(changed.records, changed.expected.identity)
  await refuseSource(changed) // Still freezes the earlier snapshot's hashes.
  const last = decodeChain(changed.records, changed.expected.identity).envelopes.at(-1)
  const cas = last.files.filter((file) => file.path.startsWith("atlas/cas/"))
    .map((file) => [file.path.slice("atlas/cas/".length), file.sha256]).sort((a, b) => a[0].localeCompare(b[0]))
  const expected = { ...changed.expected,
    planSha256: last.files.find((file) => file.path === "evidence/plan-advisory.json").sha256,
    stagingSha256: last.files.find((file) => file.path === "atlas/staging.json").sha256,
    casFiles: cas.length, casInventorySha256: sha256(JSON.stringify(cas)) }
  const source = await router(changed, expected)
  assert.equal(source.take(receipt(f.prompt)).origin.kind, "replay")
})

test("concurrent requests reaching the single IO owner reserve a cached source response only once", async (t) => {
  const f = fixture(t)
  const source = await router(f)
  const results = await Promise.allSettled([0, 1].map(() => Promise.resolve().then(() => source.take(receipt(f.prompt)))))
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(results.filter((result) => result.status === "rejected" && /already.*reserved/.test(result.reason.message)).length, 1)
})
