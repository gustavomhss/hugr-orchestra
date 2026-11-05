// Runner-owned oracle for the actual-source 200-site control, not publication or subscription evidence.
import assert from "node:assert/strict"
import { lstatSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { decodeChain, sha256 } from "./checkpoint.mjs"
import { createContinuation } from "./checkpoint-continuation.mjs"

const [mode, root, expectedFile, sourceFile, uidValue] = process.argv.slice(2)
const expected = JSON.parse(readFileSync(expectedFile))
if (mode === "source") {
  const { readdirSync } = await import("node:fs")
  const records = readdirSync(root).filter((name) => /^\d{8}\.json\.gz$/.test(name)).sort().map((name) => readFileSync(join(root, name)))
  createContinuation(records, expected, expected.inFlightRequest)
  const chain = decodeChain(records, expected.identity)
  writeFileSync(sourceFile, JSON.stringify(chain.envelopes.filter((event) => event.kind === "dispatch").map((dispatch) => {
    const completion = chain.completions.find((event) => event.request === dispatch.request)
    return { request: dispatch.request, arm: dispatch.arm, promptSha256: dispatch.promptSha256, promptBytes: dispatch.promptBytes,
      ...(completion ? { exitCode: completion.exitCode, stdoutSha256: sha256(Buffer.from(completion.stdout, "base64")),
        stderrSha256: sha256(Buffer.from(completion.stderr, "base64")) } : {}) }
  })) + "\n", { flag: "wx", mode: 0o600 })
} else {
  assert.equal(mode, "audit")
  const uid = Number(uidValue)
  assert(Number.isSafeInteger(uid) && uid > 0 && uid !== process.getuid())
  assert.deepEqual(JSON.parse(readFileSync(join(root, "execution.json"))), { exitCode: 0 })
  const verified = JSON.parse(readFileSync(join(root, "verified.json")))
  for (const [key, value] of Object.entries({ control: true, sourceRun: expected.identity.run, sourceRevision: expected.identity.revision,
    executionUid: uid, noNewPrivileges: true, runnerPrivateControlDenied: true, originalPlanReproduced: true,
    originalClaimsAndReceiptsPreserved: true, replayed: 103, retried: 1, fresh: 96, providerCalls: 97, subscriptionCalls: 0,
    siteBudget: 200, modelCalls: 200, poolWidth: 8, originalUnresolved: 1, productionContinuationVerified: false })) assert.deepEqual(verified[key], value, key)
  assert.equal(sha256(readFileSync(join(root, "evidence/plan-advisory.json"))), expected.planSha256)
  assert.equal(sha256(readFileSync(join(root, "recovery/atlas/staging.json"))), expected.stagingSha256)
  const report = JSON.parse(readFileSync(join(root, "evidence/report-advisory.json")))
  for (const field of ["budgetSpent", "llmCalls", "modelCalls"]) assert.equal(report[field], 200)
  assert.equal(report.coverage.sites.filter((row) => row.outcome !== "unvisited").length, 200)
  const original = JSON.parse(readFileSync(sourceFile))
  assert.equal(original.length, expected.dispatches)
  const ledger = readFileSync(join(root, "control-ledger.jsonl"), "utf8").trim().split("\n").map((row) => JSON.parse(row))
  const dispatches = ledger.filter((event) => event.kind === "dispatch")
  const completions = ledger.filter((event) => event.kind === "completion")
  assert.equal(ledger.length, 400)
  assert.equal(dispatches.length, 200)
  assert.equal(completions.length, 200)
  assert.equal(new Set(dispatches.map((event) => event.request)).size, 200)
  assert.equal(new Set(completions.map((event) => event.request)).size, 200)
  for (const completion of completions) {
    const dispatch = dispatches.find((event) => event.request === completion.request)
    assert(dispatch)
    for (const field of ["arm", "promptSha256", "promptBytes", "origin"]) assert.deepEqual(completion[field], dispatch[field])
  }
  for (const source of original) {
    const matches = completions.filter((event) => event.origin.sourceRequest === source.request)
    assert.equal(matches.length, 1)
    const event = matches[0]
    for (const field of ["arm", "promptSha256", "promptBytes"]) assert.equal(event[field], source[field])
    assert.equal(event.origin.kind, source.request === expected.inFlightRequest ? "retry" : "replay")
    assert.equal(event.origin.sourceRun, expected.identity.run)
    assert.equal(event.origin.sourceAttempt, expected.identity.attempt)
    if (event.origin.kind === "replay") for (const field of ["exitCode", "stdoutSha256", "stderrSha256"]) assert.equal(event[field], source[field])
  }
  const calls = readFileSync(join(root, "provider-calls.jsonl"), "utf8").trim().split("\n").map((row) => JSON.parse(row))
  assert.equal(calls.length, 97)
  assert.equal(new Set(calls.map((call) => call.promptSha256)).size, 97)
  for (const call of calls) {
    const dispatch = dispatches.find((event) => event.promptSha256 === call.promptSha256 && event.promptBytes === call.promptBytes)
    assert(dispatch && ["retry", "fresh"].includes(dispatch.origin.kind))
  }
  const current = new Map(JSON.parse(readFileSync(join(root, "reconstructed/atlas/staging.json"))).current)
  for (const [key, old] of JSON.parse(readFileSync(join(root, "recovery/atlas/staging.json"))).current) {
    const row = current.get(key)
    assert(row)
    for (const claim of old.claims) {
      assert(row.claims.includes(claim))
      assert.deepEqual(row.claimEvidenceByClaim?.[claim] ?? { factRef: row.contentHash, answerRef: row.answerRef },
        old.claimEvidenceByClaim?.[claim] ?? { factRef: old.contentHash, answerRef: old.answerRef })
    }
  }
  const { readdirSync } = await import("node:fs")
  const casRoot = join(root, "recovery/atlas/cas")
  const inventory = readdirSync(casRoot, { recursive: true }).filter((path) => {
    const stat = lstatSync(join(casRoot, path))
    assert(!stat.isSymbolicLink())
    if (stat.isDirectory()) return false
    assert(stat.isFile() && /^[0-9a-f]{2}\/[0-9a-f]{64}$/.test(path))
    return true
  }).sort().map((path) => {
    const bytes = readFileSync(join(casRoot, path))
    assert.deepEqual(readFileSync(join(root, "reconstructed/atlas/cas", path)), bytes)
    return [path, sha256(bytes)]
  })
  assert.equal(inventory.length, expected.casFiles)
  assert.equal(sha256(JSON.stringify(inventory)), expected.casInventorySha256)
  console.log("compiled continuation runner audit: 103 original responses, linked retry, 97 synthetic calls, native 200-site bound and all original claim/CAS receipts verified")
}
