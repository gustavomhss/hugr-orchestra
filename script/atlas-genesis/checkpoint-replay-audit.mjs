// Runner-side oracle over the safely collected tree; expected hashes come from the reviewed source receipt.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { lstatSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")

export function auditReplayProof(directory, expected, uid) {
  assert(Number.isSafeInteger(uid) && uid > 0 && uid !== process.getuid(), "checkpoint replay audit: invalid restricted UID")
  assert.deepEqual(JSON.parse(readFileSync(join(directory, "execution.json"))), { exitCode: 0 },
    "checkpoint replay audit: workload did not exit successfully")
  const verified = JSON.parse(readFileSync(join(directory, "verified.json")))
  for (const [key, value] of Object.entries({ sourceRevision: expected.identity.revision,
    sourceRun: expected.identity.run, sourceAttempt: expected.identity.attempt, finalCheckpoint: expected.lastSequence,
    dispatched: expected.dispatches, completed: expected.completions, inFlight: 1, delivered: expected.completions,
    encounteredInFlight: 1, unmatched: 0, providerCalls: 0, originalPlanSha256: expected.planSha256, originalReportReproduced: true,
    originalFinalStagingAndCasReproduced: true, executionUid: uid, noNewPrivileges: true,
    runnerPrivateControlDenied: true, productionContinuationVerified: false })) {
    assert.deepEqual(verified[key], value, `checkpoint replay audit: wrong ${key}`)
  }
  for (const [path, hash] of [["reconstructed/atlas/staging.json", expected.stagingSha256],
    ["evidence/plan-advisory.json", expected.planSha256], ["evidence/report-advisory.json", expected.nativeReportSha256]]) {
    assert.equal(digest(readFileSync(join(directory, path))), hash, `checkpoint replay audit: wrong ${path}`)
  }
  const root = join(directory, "reconstructed/atlas/cas")
  const cas = readdirSync(root, { recursive: true }).flatMap((path) => {
    const stat = lstatSync(join(root, path))
    assert(!stat.isSymbolicLink(), "checkpoint replay audit: symlink in collected CAS")
    if (stat.isDirectory()) return []
    assert(stat.isFile() && /^[0-9a-f]{2}\/[0-9a-f]{64}$/.test(path), "checkpoint replay audit: invalid CAS member")
    return [[path, digest(readFileSync(join(root, path)))]]
  }).sort((a, b) => a[0].localeCompare(b[0]))
  assert(expected.casFiles > 0 && cas.length === expected.casFiles, "checkpoint replay audit: wrong CAS population")
  assert.equal(digest(JSON.stringify(cas)), expected.casInventorySha256, "checkpoint replay audit: wrong CAS inventory")
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 5, "usage: checkpoint-replay-audit.mjs <collected-output> <frozen-source-receipt> <restricted-uid>")
  auditReplayProof(process.argv[2], JSON.parse(readFileSync(process.argv[3])), Number(process.argv[4]))
  console.log("checkpoint replay audit: collected original state and complete native evidence verified by runner")
}
