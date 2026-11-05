// Synthetic source/provider, real protected shell + IO owner + external Git write/readback and restore.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createCommandClient } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"
import { controlIdentity, controlStore } from "./checkpoint-fixture.mjs"
import { checkpointRemote } from "./checkpoint-remote.mjs"
import { startCheckpointWriter } from "./checkpoint-runner.mjs"
import { decodeChain, encodeEnvelope, restoreChain, sha256, snapshotFiles } from "./checkpoint.mjs"

assert.equal(process.env.GITHUB_ACTIONS, "true", "continuation control: remote runner required")
assert.equal(process.argv.length, 3, "usage: checkpoint-continuation-remote-control.mjs <fresh-output>")
const directory = process.argv[2]
mkdirSync(directory, { mode: 0o700 })
const repo = join(directory, "store")
controlStore(repo)
const evidence = join(directory, "evidence")
mkdirSync(evidence)
const plan = Buffer.from('{"sites":[{"rank":1,"path":"src/control.ts"}]}\n')
writeFileSync(join(evidence, "plan-advisory.json"), plan)
const sourceIdentity = { ...controlIdentity, mode: "production" }
const cachedPrompt = Buffer.from("synthetic preserved original command\n")
const pendingPrompt = Buffer.from("synthetic original unresolved command\n")
const original = { exitCode: 7, stdout: Buffer.from([0, 255, 10, 65]).toString("base64"), stderr: Buffer.from([255, 0, 10]).toString("base64") }
const cached = { kind: "dispatch", request: randomUUID(), arm: "advisory", promptSha256: sha256(cachedPrompt), promptBytes: cachedPrompt.length }
const pending = { ...cached, request: randomUUID(), promptSha256: sha256(pendingPrompt), promptBytes: pendingPrompt.length }
const files = snapshotFiles(repo, evidence)
const events = [{ kind: "snapshot", boundary: "initial", files }, cached, { ...cached, kind: "completion", ...original }, pending]
const records = []
const recordsDirectory = join(directory, "source-envelopes")
mkdirSync(recordsDirectory)
for (const [index, event] of events.entries()) {
  const bytes = encodeEnvelope({ ...event, version: 1, identity: sourceIdentity, sequence: index + 1,
    previous: index ? sha256(records[index - 1]) : null }, join(directory, `source-event-${index}`), {})
  records.push(bytes)
  writeFileSync(join(recordsDirectory, `${String(index + 1).padStart(8, "0")}.json.gz`), bytes)
}
const cas = files.filter((file) => file.path.startsWith("atlas/cas/"))
  .map((file) => [file.path.slice("atlas/cas/".length), file.sha256]).sort((a, b) => a[0].localeCompare(b[0]))
const expected = { identity: sourceIdentity, lastSequence: records.length, lastEnvelopeSha256: sha256(records.at(-1)),
  dispatches: 2, completions: 1, inFlightRequest: pending.request, inFlightPromptSha256: pending.promptSha256,
  planSha256: sha256(plan), stagingSha256: files.find((file) => file.path === "atlas/staging.json").sha256,
  casFiles: cas.length, casInventorySha256: sha256(JSON.stringify(cas)) }
const policy = Buffer.from(JSON.stringify({ control: true, source: expected, retryRequest: pending.request }) + "\n")
writeFileSync(join(evidence, "continuation.json"), policy)
const identity = { ...sourceIdentity, run: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, control: true,
  continuation: { sourceRun: sourceIdentity.run, sourceAttempt: sourceIdentity.attempt, sourceRevision: sourceIdentity.revision,
    sourceLastSequence: records.length, sourceLastEnvelopeSha256: expected.lastEnvelopeSha256,
    sourceDispatches: 2, sourceCompletions: 1, sourceInFlightRequest: pending.request,
    sourceInFlightPromptSha256: pending.promptSha256, proofRun: "42056319550", proofHead: "aa8b55fe75ce9f53045ac2bc8f5f89e0fa012291",
    orchestratorRevision: process.env.GITHUB_SHA, policySha256: sha256(policy) } }
mkdirSync(join(directory, "bin"))
writeFileSync(join(directory, "provider.calls"), "")
writeFileSync(join(directory, "bin/grok"), `#!/usr/bin/env node
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const args=process.argv.slice(2)
assert.equal(args[args.indexOf('--model')+1],'grok-4.7')
assert.equal(args[args.indexOf('--max-turns')+1],'1')
assert(fs.fstatSync(0).isFile())
const prompt=fs.readFileSync(0)
fs.appendFileSync(${JSON.stringify(join(directory, "provider.calls"))},crypto.createHash('sha256').update(prompt).digest('hex')+'\\n')
process.stdout.write('synthetic fresh provider output\\n')
`, { mode: 0o700 })
const writer = await startCheckpointWriter(identity, join(directory, "writer"), { repo, evidence }, {
  recordsDirectory, expectedSourceReceipt: expected, retryRequest: pending.request,
})
const previous = { url: process.env.ATLAS_CHECKPOINT_URL, nonce: process.env.ATLAS_CHECKPOINT_NONCE }
process.env.ATLAS_CHECKPOINT_URL = writer.url
process.env.ATLAS_CHECKPOINT_NONCE = writer.nonce
const capture = (prompt, tag) => {
  const client = createCommandClient({ cmd: "sh", args: ["-c",
    'env "PATH=$1" "RUNNER_TEMP=$2" sh "$3" >"$4" 2>"$5"; code=$?; printf "%s" "$code" >"$6"',
    "continuation-remote-capture", `${join(directory, "bin")}:${process.env.PATH}`, directory,
    fileURLToPath(new URL("./grok-checkpoint.sh", import.meta.url)), join(directory, `${tag}.stdout`),
    join(directory, `${tag}.stderr`), join(directory, `${tag}.code`)] })
  client.complete(prompt.toString(), { timeoutMs: 600000, costCap: 1 })
  return { exitCode: Number(readFileSync(join(directory, `${tag}.code`))), stdout: readFileSync(join(directory, `${tag}.stdout`)),
    stderr: readFileSync(join(directory, `${tag}.stderr`)) }
}
let interrupted
try {
  writer.write({ kind: "snapshot", boundary: "initial", files: snapshotFiles(repo, evidence) })
  writer.write({ kind: "snapshot", boundary: "arm-start:advisory", files: snapshotFiles(repo, evidence) })
  const replay = capture(cachedPrompt, "cached")
  assert.equal(replay.exitCode, original.exitCode)
  assert.deepEqual(replay.stdout, Buffer.from(original.stdout, "base64"))
  assert.deepEqual(replay.stderr, Buffer.from(original.stderr, "base64"))
  assert.equal(readFileSync(join(directory, "provider.calls"), "utf8"), "")
  assert.equal(capture(pendingPrompt, "retry").exitCode, 0)
  const freshPrompt = Buffer.from("synthetic fresh advisory request\n")
  assert.equal(capture(freshPrompt, "fresh").exitCode, 0)
  assert.deepEqual(readFileSync(join(directory, "provider.calls"), "utf8").trim().split("\n"), [sha256(pendingPrompt), sha256(freshPrompt)])
  writer.write({ kind: "snapshot", boundary: "arm-end:advisory", files: snapshotFiles(repo, evidence) })
  writer.write({ kind: "snapshot", boundary: "arm-start:dependency", files: snapshotFiles(repo, evidence) })
  const bytes = Buffer.from("synthetic future request left explicitly unresolved\n")
  const response = await fetch(`${writer.url}/dispatch`, { method: "POST", headers: { authorization: `Bearer ${writer.nonce}` },
    body: JSON.stringify({ promptSha256: sha256(bytes), promptBytes: bytes.length }) })
  assert.equal(response.status, 200)
  interrupted = (await response.json()).request
  writer.write({ kind: "snapshot", boundary: "control-interrupted", files: snapshotFiles(repo, evidence) })
} finally {
  await writer.close() // Intentionally stop with one acknowledged dispatch and no fabricated completion.
  if (previous.url === undefined) delete process.env.ATLAS_CHECKPOINT_URL
  if (previous.url !== undefined) process.env.ATLAS_CHECKPOINT_URL = previous.url
  if (previous.nonce === undefined) delete process.env.ATLAS_CHECKPOINT_NONCE
  if (previous.nonce !== undefined) process.env.ATLAS_CHECKPOINT_NONCE = previous.nonce
}
const remote = checkpointRemote({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN })
const received = await remote.read(identity)
const restored = join(directory, "restored")
const chain = restoreChain(received, identity, restored)
assert.equal(chain.completions.length, 3)
assert.equal(chain.inFlight.length, 1)
assert.equal(chain.inFlight[0].request, interrupted)
assert.deepEqual(chain.inFlight[0].origin, { kind: "fresh" })
for (const [kind, sourceRequest] of [["replay", cached.request], ["retry", pending.request], ["fresh", undefined]]) {
  const completion = chain.completions.find((event) => event.origin.kind === kind)
  assert(completion, `continuation control: missing ${kind}`)
  const origin = sourceRequest ? { kind, sourceRun: sourceIdentity.run, sourceAttempt: sourceIdentity.attempt, sourceRequest } : { kind }
  assert.deepEqual(completion.origin, origin)
  assert.notEqual(completion.request, sourceRequest)
  const dispatch = chain.envelopes.find((event) => event.kind === "dispatch" && event.request === completion.request)
  assert.deepEqual(dispatch.origin, origin)
  if (kind === "replay") for (const field of ["stdout", "stderr", "exitCode"]) assert.equal(completion[field], original[field])
}
assert.equal(decodeChain(records, sourceIdentity).inFlight[0].request, pending.request)
for (const file of files.filter((file) => file.path.startsWith("atlas/"))) {
  assert.deepEqual(readFileSync(join(restored, file.path)), Buffer.from(file.bytes, "base64"))
}
writeFileSync(join(directory, "verified.json"), JSON.stringify({ control: true, identity, originalPendingRequest: pending.request,
  originalPendingStillUnresolved: true, replayed: 1, providerCalls: 2, retried: 1, freshCompleted: 1, newInFlight: 1,
  externalWriteReadbackAndRestore: true, envelopes: received.length, subscriptionCalls: 0, productionContinuationVerified: false }) + "\n")
console.log("continuation control: protected cached/retry/fresh commands and source-linked external recovery verified; no subscription calls")
