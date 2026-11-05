// Probes the real continuation router. A copied router is not an oracle.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"
import { createContinuation } from "./checkpoint-continuation.mjs"
import { controlIdentity, controlStore } from "./checkpoint-fixture.mjs"
import { decodeChain, encodeEnvelope, sha256, snapshotFiles } from "./checkpoint.mjs"

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "atlas-continuation-mutation-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  controlStore(root).store.put("unused source carrier")
  mkdirSync(join(root, "evidence"))
  const plan = Buffer.from('{"sites":[{"rank":1,"path":"src/control.ts"}]}\n')
  writeFileSync(join(root, "evidence/plan-advisory.json"), plan)
  const identity = { ...controlIdentity, mode: "production" }
  const prompt = Buffer.from("original complete prompt\n")
  const pending = Buffer.from("original unresolved prompt\n")
  const completedRequest = randomUUID()
  const retryRequest = randomUUID()
  const first = {
    kind: "dispatch", arm: "advisory", request: completedRequest,
    promptSha256: sha256(prompt), promptBytes: prompt.length,
  }
  const events = [
    { kind: "snapshot", boundary: "initial", files: snapshotFiles(root, join(root, "evidence")) },
    first,
    { ...first, kind: "completion", exitCode: 7, stdout: Buffer.from([0, 255, 10, 65]).toString("base64"),
      stderr: Buffer.from([255, 0, 10]).toString("base64") },
    { ...first, request: retryRequest, promptSha256: sha256(pending), promptBytes: pending.length },
  ]
  const records = []
  for (const [index, event] of events.entries()) {
    records.push(encodeEnvelope({
      ...event, identity, version: 1, sequence: index + 1,
      previous: index ? sha256(records[index - 1]) : null,
    }, join(root, `event-${index}`), {}))
  }
  const snapshot = decodeChain(records, identity).envelopes[0]
  const cas = snapshot.files.filter((file) => file.path.startsWith("atlas/cas/"))
    .map((file) => [file.path.slice("atlas/cas/".length), file.sha256])
    .sort((left, right) => left[0].localeCompare(right[0]))
  const expected = {
    identity, lastSequence: records.length, lastEnvelopeSha256: sha256(records.at(-1)),
    dispatches: 2, completions: 1, inFlightRequest: retryRequest, inFlightPromptSha256: sha256(pending),
    planSha256: sha256(plan),
    stagingSha256: snapshot.files.find((file) => file.path === "atlas/staging.json").sha256,
    casFiles: cas.length, casInventorySha256: sha256(JSON.stringify(cas)),
  }
  return { root, records, expected, retryRequest, prompt }
}

const receipt = (prompt, arm = "advisory") => ({ arm, promptSha256: sha256(prompt), promptBytes: prompt.length })

async function loadMutant(root, needle, replacement) {
  const sourceUrl = new URL("./checkpoint-continuation.mjs", import.meta.url)
  const source = readFileSync(sourceUrl, "utf8")
  assert.equal(source.split(needle).length, 2, "mutation must remove exactly one real guard")
  const mutated = source.replace(needle, replacement).replace(
    'from "./checkpoint.mjs"',
    `from ${JSON.stringify(new URL("./checkpoint.mjs", sourceUrl).href)}`,
  )
  assert.notEqual(mutated, source, "mutation must change the real module")
  const path = join(root, `mutant-${randomUUID()}.mjs`)
  writeFileSync(path, mutated, { flag: "wx" })
  return import(pathToFileURL(path).href)
}

test("real source-binding guard rejects a known hash with a changed arm", async (t) => {
  const f = fixture(t)
  const needle = 'assert(bound.arm === receipt.arm && bound.promptBytes === receipt.promptBytes, "continuation: source binding mismatch")'
  const oracle = (create) => {
    const source = create(f.records, f.expected, f.retryRequest)
    assert.throws(() => source.take({ ...receipt(f.prompt), arm: "count" }), /source.*binding/)
    assert.deepEqual(source.summary(), { replayed: 0, retried: 0, fresh: 0, inFlight: 0, originalUnresolved: 1 })
  }
  oracle(createContinuation)
  const mutant = await loadMutant(f.root, needle, "void receipt")
  assert.throws(() => oracle(mutant.createContinuation), assert.AssertionError)
})

test("real fresh barrier rejects an unknown prompt before source confirmations", async (t) => {
  const f = fixture(t)
  const needle = 'assert([...sources.values()].every((bound) => bound.confirmed), "continuation: source incomplete")'
  const fresh = receipt(Buffer.from("a genuinely later request"))
  const oracle = (create) => {
    const source = create(f.records, f.expected, f.retryRequest)
    assert.throws(() => source.take(fresh), /source.*incomplete/)
    assert.deepEqual(source.summary(), { replayed: 0, retried: 0, fresh: 0, inFlight: 0, originalUnresolved: 1 })
  }
  oracle(createContinuation)
  const mutant = await loadMutant(f.root, needle, "void sources")
  assert.throws(() => oracle(mutant.createContinuation), assert.AssertionError)
})

test("real duplicate-delivery guard reserves a cached source response only once", async (t) => {
  const f = fixture(t)
  const needle = 'assert(!bound.reserved, "continuation: already reserved")'
  const oracle = (create) => {
    const source = create(f.records, f.expected, f.retryRequest)
    source.take(receipt(f.prompt))
    assert.throws(() => source.take(receipt(f.prompt)), /already.*reserved/)
  }
  oracle(createContinuation)
  const mutant = await loadMutant(f.root, needle, "void bound")
  assert.throws(() => oracle(mutant.createContinuation), assert.AssertionError)
})
