// Actual-source offline proof. Workflow supplies a detached original checkout and restored indexes.
import assert from "node:assert/strict"
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { decodeChain, sha256, snapshotFiles } from "./checkpoint.mjs"
import { prepareReplay, replaySummary, verifyReplayPlan } from "./checkpoint-replay.mjs"

const [recordsDirectory, expectedFile, repo, originalArtifact, output] = process.argv.slice(2)
assert(process.argv.length === 7 && recordsDirectory && expectedFile && repo && originalArtifact && output,
  "usage: checkpoint-replay-control.mjs <envelopes> <expected-identity> <original-checkout> <original-artifact> <fresh-output>")
const expected = JSON.parse(readFileSync(expectedFile))
const identity = expected.identity
assert(process.getuid() !== 0 && process.getuid() !== Number(process.env.REPLAY_RUNNER_UID),
  "checkpoint replay control: distinct restricted execution identity required")
assert(/^NoNewPrivs:\s+1$/m.test(readFileSync("/proc/self/status", "utf8")), "checkpoint replay control: privilege escalation is not disabled")
assert.throws(() => readFileSync(process.env.REPLAY_PRIVATE_CONTROL), (error) => error.code === "EACCES",
  "checkpoint replay control: runner-private control was readable")
const { createHistorySource, headSha, initAst } = await import(pathToFileURL(join(repo, "modules/atlas/packages/adapter-io/dist/src/index.js")).href)
const { driveMinePass } = await import(pathToFileURL(join(repo, "modules/atlas/packages/cli/dist/src/mine.js")).href)
assert.equal(headSha(repo), identity.revision, "checkpoint replay control: source revision mismatch")
assert.equal(sha256(readFileSync(new URL("./grok-text.sh", import.meta.url))), identity.wrapperSha256,
  "checkpoint replay control: wrapper mismatch")
assert.equal(sha256(readFileSync(new URL("./grok-agent.json", import.meta.url))), identity.profileSha256,
  "checkpoint replay control: profile mismatch")
const records = readdirSync(recordsDirectory).filter((name) => /^\d{8}\.json\.gz$/.test(name)).sort()
  .map((name) => readFileSync(join(recordsDirectory, name)))
const chain = decodeChain(records, identity)
assert.equal(records.length, expected.lastSequence, "checkpoint replay control: incomplete original chain")
assert.equal(sha256(records.at(-1)), expected.lastEnvelopeSha256, "checkpoint replay control: wrong original chain terminus")
const arms = [...new Set(chain.envelopes.filter((event) => event.kind === "dispatch").map((event) => event.arm))]
assert.deepEqual(arms, ["advisory"], "checkpoint replay control: this control requires one interrupted advisory arm")
assert.equal(chain.inFlight.length, 1, "checkpoint replay control: expected one unresolved request")
assert.equal(chain.inFlight[0].request, expected.inFlightRequest, "checkpoint replay control: wrong unresolved request")
assert.equal(chain.inFlight[0].promptSha256, expected.inFlightPromptSha256, "checkpoint replay control: wrong unresolved prompt")
assert.equal(chain.completions.length, expected.completions, "checkpoint replay control: wrong original response population")
assert.equal(chain.completions.length + chain.inFlight.length, expected.dispatches, "checkpoint replay control: wrong original dispatch population")
const first = chain.envelopes.find((event) => event.kind === "snapshot")
const last = chain.envelopes.findLast((event) => event.kind === "snapshot")
assert.equal(first.boundary, "initial", "checkpoint replay control: missing pre-mining state")
assert.deepEqual(readFileSync(join(originalArtifact, "atlas/staging.json")),
  Buffer.from(last.files.find((file) => file.path === "atlas/staging.json").bytes, "base64"),
  "checkpoint replay control: artifact differs from final external staging")
for (const [path, hash] of [["evidence/report-advisory.json", expected.nativeReportSha256],
  ["model-identity.txt", expected.modelIdentitySha256], ["policy.json", expected.policySha256],
  ["socket-transport.json", expected.socketTransportSha256], ["atlas/staging.json", expected.stagingSha256]]) {
  assert.equal(sha256(readFileSync(join(originalArtifact, path))), hash, `checkpoint replay control: wrong original artifact ${path}`)
}
const cas = last.files.filter((file) => file.path.startsWith("atlas/cas/"))
  .map((file) => [file.path.slice("atlas/cas/".length), file.sha256]).sort((a, b) => a[0].localeCompare(b[0]))
assert.equal(cas.length, expected.casFiles, "checkpoint replay control: wrong CAS population")
assert.equal(sha256(JSON.stringify(cas)), expected.casInventorySha256, "checkpoint replay control: wrong CAS inventory")
assert.deepEqual(casInventory(join(originalArtifact, "atlas/cas")), cas, "checkpoint replay control: artifact CAS membership/bytes differ")
mkdirSync(output, { recursive: true, mode: 0o700 })
assert.equal(readdirSync(output).length, 0, "checkpoint replay control: output directory is not fresh")
const replay = join(output, "recovery")
prepareReplay(records, identity, replay)
for (const file of first.files.filter((file) => file.path.startsWith("atlas/"))) {
  const path = join(repo, ".atlas", file.path.slice("atlas/".length))
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, Buffer.from(file.bytes, "base64"), { flag: "wx", mode: 0o600 })
}
const config = join(output, "model.json")
writeFileSync(config, JSON.stringify({ roles: { propose: { cmd: process.execPath,
  args: [fileURLToPath(new URL("./checkpoint-replay.mjs", import.meta.url)), "command", replay] } }, timeoutMs: expected.commandTimeoutMs }),
{ flag: "wx", mode: 0o600 })
await initAst()
let refusal
try {
  driveMinePass(repo, { history: createHistorySource(repo, "HEAD"), slot: "advisory",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ATLAS_MODEL_CONFIG: config,
      ATLAS_MINE_BUDGET: String(identity.budget), ATLAS_MINE_SLOT: "advisory", ATLAS_MINE_EVIDENCE_DIR: join(output, "evidence") } })
} catch (error) {
  refusal = error
}
// Preserve the actual reconstructed store even if any later assertion refuses verification.
for (const file of snapshotFiles(repo, join(output, "evidence")).filter((file) => file.path.startsWith("atlas/"))) {
  const path = join(output, "reconstructed", file.path)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, Buffer.from(file.bytes, "base64"), { flag: "wx", mode: 0o600 })
}
assert.equal(refusal?.name, "ModelCommandError", "checkpoint replay control: expected unresolved command refusal")
// The pinned original worker drops `reason`; bind the refusal to its exact replay message AND usage below.
assert(refusal.message.includes("checkpoint replay: unresolved dispatch; no provider called"),
  "checkpoint replay control: refusal did not identify the unresolved request")
verifyReplayPlan(replay, "advisory", readFileSync(join(output, "evidence/plan-advisory.json")))
assert.equal(sha256(readFileSync(join(output, "evidence/plan-advisory.json"))), expected.planSha256)
const usage = replaySummary(replay)
assert.equal(usage.completed, chain.completions.length)
assert.equal(usage.delivered, chain.completions.length)
assert.equal(usage.encounteredInFlight, chain.inFlight.length)
assert.equal(usage.unmatched, 0, "checkpoint replay control: regenerated prompt mismatch")
const report = JSON.parse(readFileSync(join(output, "evidence/report-advisory.json")))
const original = JSON.parse(readFileSync(join(originalArtifact, "evidence/report-advisory.json")))
assert.deepEqual(report, original, "checkpoint replay control: complete native evidence report not reproduced")
assert.deepEqual(casInventory(join(repo, ".atlas/cas")), cas, "checkpoint replay control: reconstructed CAS membership/bytes differ")
for (const file of last.files.filter((file) => file.path === "atlas/staging.json" || file.path.startsWith("atlas/cas/"))) {
  assert.deepEqual(readFileSync(join(repo, ".atlas", file.path.slice("atlas/".length))), Buffer.from(file.bytes, "base64"),
    `checkpoint replay control: original final receipt bytes differ at ${file.path}`)
}
writeFileSync(join(output, "verified.json"), JSON.stringify({ sourceRevision: identity.revision,
  sourceRun: identity.run, sourceAttempt: identity.attempt, finalCheckpoint: last.sequence,
  originalPlanSha256: sha256(readFileSync(join(output, "evidence/plan-advisory.json"))), ...usage,
  originalReportReproduced: true, originalFinalStagingAndCasReproduced: true,
  executionUid: process.getuid(), noNewPrivileges: true, runnerPrivateControlDenied: true,
  expectedInterruptedRank: original.coverage.sites.find((row) => row.outcome === "interrupted").rank,
  productionContinuationVerified: false }) + "\n", { flag: "wx", mode: 0o600 })
console.log("checkpoint replay control: original plan, responses, report and final receipts reproduced offline")

function casInventory(root) {
  return readdirSync(root, { recursive: true }).flatMap((path) => {
    const stat = lstatSync(join(root, path))
    assert(!stat.isSymbolicLink(), "checkpoint replay control: symlink in CAS")
    if (stat.isDirectory()) return []
    assert(stat.isFile() && /^[0-9a-f]{2}\/([0-9a-f]{64})$/.test(path), "checkpoint replay control: invalid CAS member")
    return [[path, sha256(readFileSync(join(root, path)))]]
  }).sort((a, b) => a[0].localeCompare(b[0]))
}
