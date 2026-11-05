// Actual-source offline proof. Workflow supplies a detached original checkout and restored indexes.
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { decodeChain, sha256 } from "./checkpoint.mjs"
import { prepareReplay, replaySummary, verifyReplayPlan } from "./checkpoint-replay.mjs"
import { createHistorySource, headSha, initAst } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"
import { driveMinePass } from "../../modules/atlas/packages/cli/dist/src/mine.js"

const [recordsDirectory, expectedFile, repo, originalArtifact, output] = process.argv.slice(2)
assert(process.argv.length === 7 && recordsDirectory && expectedFile && repo && originalArtifact && output,
  "usage: checkpoint-replay-control.mjs <envelopes> <expected-identity> <original-checkout> <original-artifact> <fresh-output>")
const identity = JSON.parse(readFileSync(expectedFile))
assert.equal(headSha(repo), identity.revision, "checkpoint replay control: source revision mismatch")
assert.equal(sha256(readFileSync(new URL("./grok-text.sh", import.meta.url))), identity.wrapperSha256,
  "checkpoint replay control: wrapper mismatch")
assert.equal(sha256(readFileSync(new URL("./grok-agent.json", import.meta.url))), identity.profileSha256,
  "checkpoint replay control: profile mismatch")
const records = readdirSync(recordsDirectory).filter((name) => /^\d{8}\.json\.gz$/.test(name)).sort()
  .map((name) => readFileSync(join(recordsDirectory, name)))
const chain = decodeChain(records, identity)
const arms = [...new Set(chain.envelopes.filter((event) => event.kind === "dispatch").map((event) => event.arm))]
assert.deepEqual(arms, ["advisory"], "checkpoint replay control: this control requires one interrupted advisory arm")
assert.equal(chain.inFlight.length, 1, "checkpoint replay control: expected one unresolved request")
assert(chain.completions.length > 0, "checkpoint replay control: expected original completed responses")
const first = chain.envelopes.find((event) => event.kind === "snapshot")
const last = chain.envelopes.findLast((event) => event.kind === "snapshot")
assert.equal(first.boundary, "initial", "checkpoint replay control: missing pre-mining state")
assert.deepEqual(readFileSync(join(originalArtifact, "atlas/staging.json")),
  Buffer.from(last.files.find((file) => file.path === "atlas/staging.json").bytes, "base64"),
  "checkpoint replay control: artifact differs from final external staging")
mkdirSync(output, { mode: 0o700 })
const replay = join(output, "recovery")
prepareReplay(records, identity, replay)
for (const file of first.files.filter((file) => file.path.startsWith("atlas/"))) {
  const path = join(repo, ".atlas", file.path.slice("atlas/".length))
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, Buffer.from(file.bytes, "base64"), { flag: "wx", mode: 0o600 })
}
const config = join(output, "model.json")
writeFileSync(config, JSON.stringify({ roles: { propose: { cmd: process.execPath,
  args: [fileURLToPath(new URL("./checkpoint-replay.mjs", import.meta.url)), "command", replay] } }, timeoutMs: 600000 }),
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
assert.equal(refusal?.name, "ModelCommandError", "checkpoint replay control: expected unresolved command refusal")
assert.equal(refusal.reason, "nonzero-exit", "checkpoint replay control: unexpected command failure class")
assert(refusal.message.includes("checkpoint replay: unresolved dispatch; no provider called"),
  "checkpoint replay control: refusal did not identify the unresolved request")
verifyReplayPlan(replay, "advisory", readFileSync(join(output, "evidence/plan-advisory.json")))
const usage = replaySummary(replay)
assert.equal(usage.completed, chain.completions.length)
assert.equal(usage.delivered, chain.completions.length)
assert.equal(usage.encounteredInFlight, chain.inFlight.length)
assert.equal(usage.unmatched, 0, "checkpoint replay control: regenerated prompt mismatch")
const report = JSON.parse(readFileSync(join(output, "evidence/report-advisory.json")))
const original = JSON.parse(readFileSync(join(originalArtifact, "evidence/report-advisory.json")))
for (const field of ["llmCalls", "modelCalls", "budgetSpent", "admittedClaims", "stagedRows", "answersStored", "interrupted", "coverage"]) {
  assert.deepEqual(report[field], original[field], `checkpoint replay control: original ${field} not reproduced`)
}
for (const file of last.files.filter((file) => file.path === "atlas/staging.json" || file.path.startsWith("atlas/cas/"))) {
  assert.deepEqual(readFileSync(join(repo, ".atlas", file.path.slice("atlas/".length))), Buffer.from(file.bytes, "base64"),
    `checkpoint replay control: original final receipt bytes differ at ${file.path}`)
}
writeFileSync(join(output, "verified.json"), JSON.stringify({ sourceRevision: identity.revision,
  sourceRun: identity.run, sourceAttempt: identity.attempt, finalCheckpoint: last.sequence,
  originalPlanSha256: sha256(readFileSync(join(output, "evidence/plan-advisory.json"))), ...usage,
  originalReportReproduced: true, originalFinalStagingAndCasReproduced: true,
  expectedInterruptedRank: original.coverage.sites.find((row) => row.outcome === "interrupted").rank,
  productionContinuationVerified: false }) + "\n", { flag: "wx", mode: 0o600 })
console.log("checkpoint replay control: original plan, responses, report and final receipts reproduced offline")
