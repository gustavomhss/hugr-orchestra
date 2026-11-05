// Real pinned-source miner, original responses, synthetic provider only beyond the explicit retry boundary.
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { once } from "node:events"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Worker } from "node:worker_threads"
import { decodeChain, sha256, snapshotFiles } from "./checkpoint.mjs"
import { prepareReplay } from "./checkpoint-replay.mjs"

const [recordsDirectory, expectedFile, repo, originalArtifact, output] = process.argv.slice(2)
assert(process.argv.length === 7 && recordsDirectory && expectedFile && repo && originalArtifact && output,
  "usage: checkpoint-continuation-compiled-control.mjs <envelopes> <expected-source> <original-source> <original-artifact> <fresh-output>")
assert(process.getuid() !== 0 && process.getuid() !== Number(process.env.REPLAY_RUNNER_UID), "continuation control: restricted UID required")
assert(/^NoNewPrivs:\s+1$/m.test(readFileSync("/proc/self/status", "utf8")), "continuation control: no_new_privs required")
assert.throws(() => readFileSync(process.env.REPLAY_PRIVATE_CONTROL), (error) => error.code === "EACCES")
const expected = JSON.parse(readFileSync(expectedFile))
const records = readdirSync(recordsDirectory).filter((name) => /^\d{8}\.json\.gz$/.test(name)).sort()
  .map((name) => readFileSync(join(recordsDirectory, name)))
assert.equal(sha256(records[0]), expected.initialEnvelopeSha256, "continuation control: wrong initial envelope")
const chain = decodeChain(records, expected.identity)
const first = chain.envelopes.find((event) => event.kind === "snapshot")
const last = chain.envelopes.findLast((event) => event.kind === "snapshot")
assert.equal(first.boundary, "initial")
assert.equal(first.files.find((file) => file.path === "atlas/staging.json").sha256, expected.initialStagingSha256,
  "continuation control: wrong initial seed")
assert.equal(sha256(readFileSync(join(originalArtifact, "evidence/report-advisory.json"))), expected.nativeReportSha256)
mkdirSync(output, { recursive: true, mode: 0o700 })
assert.equal(readdirSync(output).length, 0)
prepareReplay(records, expected.identity, join(output, "recovery")) // Independently preserve final source state and all original responses.
for (const file of first.files.filter((file) => file.path.startsWith("atlas/"))) {
  const path = join(repo, ".atlas", file.path.slice("atlas/".length))
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, Buffer.from(file.bytes, "base64"), { flag: "wx", mode: 0o600 })
}
const initial = JSON.parse(readFileSync(join(repo, ".atlas/staging.json")))
assert.equal(initial.current.reduce((sum, [, row]) => sum + row.claims.length, 0), expected.initialClaims)
const { createHistorySource, headSha, initAst } = await import(pathToFileURL(join(repo, "modules/atlas/packages/adapter-io/dist/src/index.js")).href)
const { driveMinePass } = await import(pathToFileURL(join(repo, "modules/atlas/packages/cli/dist/src/mine.js")).href)
const { POOL_WIDTH } = await import(pathToFileURL(join(repo, "modules/atlas/packages/genesis/dist/src/index.js")).href)
assert.equal(POOL_WIDTH, 8)
assert.equal(headSha(repo), expected.identity.revision)
assert.equal(expected.identity.budget, "200")
for (const [name, field] of [["grok-text.sh", "wrapperSha256"], ["grok-agent.json", "profileSha256"]]) {
  assert.equal(sha256(readFileSync(new URL(`./${name}`, import.meta.url))), expected.identity[field])
}
mkdirSync(join(output, "bin"))
writeFileSync(join(output, "provider-calls.jsonl"), "", { flag: "wx", mode: 0o600 })
writeFileSync(join(output, "bin/grok"), `#!/usr/bin/env node
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto')
const args=process.argv.slice(2)
if(args.length===2&&args[0]==='--no-auto-update'&&args[1]==='version'){process.stdout.write('1.0.13\\n');process.exit(0)}
assert.equal(args[args.indexOf('--model')+1],'grok-4.7')
assert.equal(args[args.indexOf('--max-turns')+1],'1')
assert(args.every(arg=>Buffer.byteLength(arg)<131072));assert(fs.fstatSync(0).isFile())
const bytes=fs.readFileSync(0)
fs.appendFileSync(${JSON.stringify(join(output, "provider-calls.jsonl"))},JSON.stringify({promptSha256:crypto.createHash('sha256').update(bytes).digest('hex'),promptBytes:bytes.length})+'\\n')
process.stdout.write('\\n') // Explicit synthetic abstention, never a fabricated original response.
`, { flag: "wx", mode: 0o700 })
const config = join(output, "model.json")
writeFileSync(config, JSON.stringify({ roles: { propose: { cmd: fileURLToPath(new URL("./grok-checkpoint.sh", import.meta.url)), args: [] } },
  timeoutMs: expected.commandTimeoutMs }), { flag: "wx", mode: 0o600 })
const nonce = randomBytes(32).toString("hex")
const server = new Worker(new URL("./checkpoint-continuation-compiled-http.mjs", import.meta.url), {
  workerData: { control: true, recordsDirectory, expected, output, nonce },
})
const [url] = await once(server, "message")
const previous = { url: process.env.ATLAS_CHECKPOINT_URL, nonce: process.env.ATLAS_CHECKPOINT_NONCE, path: process.env.PATH }
process.env.ATLAS_CHECKPOINT_URL = url
process.env.ATLAS_CHECKPOINT_NONCE = nonce
process.env.PATH = `${join(output, "bin")}:${process.env.PATH}`
try {
  await initAst()
  driveMinePass(repo, { history: createHistorySource(repo, "HEAD"), slot: "advisory", env: {
    PATH: process.env.PATH, HOME: process.env.HOME, ATLAS_MODEL_CONFIG: config,
    ATLAS_CHECKPOINT_URL: url, ATLAS_CHECKPOINT_NONCE: nonce,
    ATLAS_MINE_BUDGET: expected.identity.budget, ATLAS_MINE_SLOT: "advisory", ATLAS_MINE_EVIDENCE_DIR: join(output, "evidence"),
  } })
} finally {
  await server.terminate()
  if (previous.url === undefined) delete process.env.ATLAS_CHECKPOINT_URL
  if (previous.url !== undefined) process.env.ATLAS_CHECKPOINT_URL = previous.url
  if (previous.nonce === undefined) delete process.env.ATLAS_CHECKPOINT_NONCE
  if (previous.nonce !== undefined) process.env.ATLAS_CHECKPOINT_NONCE = previous.nonce
  if (previous.path === undefined) delete process.env.PATH
  if (previous.path !== undefined) process.env.PATH = previous.path
  for (const file of snapshotFiles(repo, join(output, "evidence")).filter((file) => file.path.startsWith("atlas/"))) {
    const path = join(output, "reconstructed", file.path)
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    writeFileSync(path, Buffer.from(file.bytes, "base64"), { flag: "wx", mode: 0o600 })
  }
}
assert(!existsSync(join(output, "control-failed.json")), "continuation control: fixture refused a command")
const report = JSON.parse(readFileSync(join(output, "evidence/report-advisory.json")))
assert.equal(sha256(readFileSync(join(output, "evidence/plan-advisory.json"))), expected.planSha256)
for (const field of ["budgetSpent", "llmCalls", "modelCalls"]) assert.equal(report[field], 200, `continuation control: wrong ${field}`)
assert.equal(report.coverage.sites.filter((row) => row.outcome !== "unvisited").length, 200)
assert(!report.coverage.sites.some((row) => row.outcome === "interrupted" || row.cause === "after-interrupt"))
assert.deepEqual(JSON.parse(readFileSync(join(output, "control-summary.json"))),
  { replayed: 103, retried: 1, fresh: 96, inFlight: 0, originalUnresolved: 1 })
const calls = readFileSync(join(output, "provider-calls.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line))
assert.equal(calls.length, 97)
assert(calls.some((call) => call.promptSha256 === expected.inFlightPromptSha256))
for (const completion of chain.completions) assert(!calls.some((call) => call.promptSha256 === completion.promptSha256))
for (const file of last.files.filter((file) => file.path.startsWith("atlas/cas/"))) {
  assert.deepEqual(readFileSync(join(output, "reconstructed", file.path)), Buffer.from(file.bytes, "base64"))
}
const oldRows = JSON.parse(Buffer.from(last.files.find((file) => file.path === "atlas/staging.json").bytes, "base64")).current
const current = new Map(JSON.parse(readFileSync(join(repo, ".atlas/staging.json"))).current)
for (const [key, old] of oldRows) {
  const row = current.get(key)
  assert(row, "continuation control: original place lost")
  for (const claim of old.claims) {
    assert(row.claims.includes(claim), "continuation control: original claim lost")
    assert.deepEqual(row.claimEvidenceByClaim?.[claim] ?? { factRef: row.contentHash, answerRef: row.answerRef },
      old.claimEvidenceByClaim?.[claim] ?? { factRef: old.contentHash, answerRef: old.answerRef })
  }
}
writeFileSync(join(output, "verified.json"), JSON.stringify({ control: true, sourceRun: expected.identity.run, sourceRevision: expected.identity.revision,
  executionUid: process.getuid(), noNewPrivileges: true, runnerPrivateControlDenied: true, originalPlanReproduced: true,
  originalClaimsAndReceiptsPreserved: true, replayed: 103, retried: 1, fresh: 96, providerCalls: 97, subscriptionCalls: 0,
  siteBudget: 200, modelCalls: 200, poolWidth: POOL_WIDTH, originalUnresolved: 1, productionContinuationVerified: false }) + "\n",
{ flag: "wx", mode: 0o600 })
console.log("compiled continuation control: original 103 responses preserved, one source-linked synthetic retry, 97 synthetic provider calls total, unchanged 200-site ceiling")
