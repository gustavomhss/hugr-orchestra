import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { test } from "node:test"
import { auditReplayProof } from "./checkpoint-replay-audit.mjs"

test("runner oracle requires actual collected files and detects metric, CAS and report corruption", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "atlas-replay-audit-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
  const identity = { revision: "a".repeat(40), run: "42", attempt: "1" }
  const expected = { identity, lastSequence: 4, dispatches: 2, completions: 1, casFiles: 1,
    stagingSha256: digest("staging\n"), planSha256: digest("plan\n"), nativeReportSha256: digest("report\n"),
    casInventorySha256: digest(JSON.stringify([[`aa/${"a".repeat(64)}`, digest("fact\n")]])) }
  const verified = { sourceRevision: identity.revision, sourceRun: identity.run, sourceAttempt: identity.attempt,
    finalCheckpoint: 4, dispatched: 2, completed: 1, inFlight: 1, delivered: 1, encounteredInFlight: 1,
    unmatched: 0, providerCalls: 0, originalPlanSha256: expected.planSha256, originalReportReproduced: true, originalFinalStagingAndCasReproduced: true,
    executionUid: 65534, noNewPrivileges: true, runnerPrivateControlDenied: true, productionContinuationVerified: false }
  assert.throws(() => auditReplayProof(root, expected, 65534), { code: "ENOENT" })
  mkdirSync(join(root, "reconstructed/atlas/cas/aa"), { recursive: true })
  mkdirSync(join(root, "evidence"))
  writeFileSync(join(root, "execution.json"), JSON.stringify({ exitCode: 0 }))
  writeFileSync(join(root, "verified.json"), JSON.stringify(verified))
  writeFileSync(join(root, "reconstructed/atlas/staging.json"), "staging\n")
  writeFileSync(join(root, "evidence/plan-advisory.json"), "plan\n")
  writeFileSync(join(root, "evidence/report-advisory.json"), "report\n")
  writeFileSync(join(root, `reconstructed/atlas/cas/aa/${"a".repeat(64)}`), "fact\n")
  auditReplayProof(root, expected, 65534)
  writeFileSync(join(root, "execution.json"), JSON.stringify({ exitCode: 1 }))
  assert.throws(() => auditReplayProof(root, expected, 65534), /workload did not exit successfully/)
  writeFileSync(join(root, "execution.json"), JSON.stringify({ exitCode: 0 }))
  writeFileSync(join(root, "verified.json"), JSON.stringify({ ...verified, delivered: 0 }))
  assert.throws(() => auditReplayProof(root, expected, 65534), /wrong delivered/)
  writeFileSync(join(root, "verified.json"), JSON.stringify(verified))
  writeFileSync(join(root, "evidence/report-advisory.json"), "different report\n")
  const oracle = (audit) => assert.throws(() => audit(root, expected, 65534), /wrong evidence\/report/)
  oracle(auditReplayProof)
  const source = readFileSync(new URL("./checkpoint-replay-audit.mjs", import.meta.url), "utf8")
  const needle = 'digest(readFileSync(join(directory, path))), hash,'
  assert.equal(source.split(needle).length, 2)
  writeFileSync(join(root, "mutant.mjs"), source.replace(needle,
    'digest(readFileSync(join(directory, path))), digest(readFileSync(join(directory, path))),'))
  const mutant = await import(pathToFileURL(join(root, "mutant.mjs")).href)
  assert.throws(() => oracle(mutant.auditReplayProof), assert.AssertionError)
  writeFileSync(join(root, "evidence/report-advisory.json"), "report\n")
  writeFileSync(join(root, `reconstructed/atlas/cas/aa/${"a".repeat(64)}`), "corrupted fact\n")
  assert.throws(() => auditReplayProof(root, expected, 65534), /wrong CAS inventory/)
  writeFileSync(join(root, `reconstructed/atlas/cas/aa/${"a".repeat(64)}`), "fact\n")
  writeFileSync(join(root, `reconstructed/atlas/cas/aa/${"b".repeat(64)}`), "extra fact\n")
  assert.throws(() => auditReplayProof(root, expected, 65534), /wrong CAS population/)
})
