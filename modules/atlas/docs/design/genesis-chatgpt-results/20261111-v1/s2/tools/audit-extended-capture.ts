// Operational read of actual pinned source, not a fixture or a semantic producer run.
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { captureOwnershipExtendedInput } from "./proposal-build/modules/atlas/packages/adapter-io/src/ownership-source-capture.js"
import { observeOwnershipInput } from "./proposal-build/modules/atlas/packages/adapter-io/src/ownership-input.js"

const root = "/workspace/scratch/ea607dbcbf72"
const repo = `${root}/orchestra`
const sourceRevision = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
const records = JSON.parse(readFileSync(`${root}/preparation/receipts/source-observer-readiness.json`, "utf8")).non_present
const expected = new Map(JSON.parse(readFileSync(`${root}/preparation/receipts/whole-source-file-hashes.json`, "utf8")).map((entry: { path: string }) => [entry.path, entry]))
const startedAt = new Date().toISOString()
const results = records.map((entry: { key: string; gitMode: string; blob: string }) => {
  const path = entry.key.slice(5)
  const key = path.startsWith(".atlas/") ? `retained:${sourceRevision}:${path}` : `${entry.gitMode === "120000" ? "link" : "blob"}:${path}`
  const capture = captureOwnershipExtendedInput(repo, key, (name) => observeOwnershipInput(repo, `file:${name}`).kind === "absent")
  const observation = observeOwnershipInput(repo, key)
  const legacy = observeOwnershipInput(repo, entry.key)
  if (capture.bytes === undefined) return { path, key, observation, captureObservation: capture.observation, legacy, materialized: expected.has(path) }
  const record = JSON.parse(new TextDecoder().decode(capture.bytes))
  const bytes = new Uint8Array(record.contentBytes ?? record.targetBytes)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
  const materialized = expected.get(path) as { sha256: string; mode: string } | undefined
  return { path, key, observation, captureObservation: capture.observation, legacy, captureBytes: capture.bytes.length,
    captureSha256: createHash("sha256").update(capture.bytes).digest("hex"), sourceBytes: bytes.length, sourceSha256: sha256,
    gitBlob: blob, gitMode: record.mode, recordKind: record.kind, authority: record.authority,
    matchesSourceBlob: blob === entry.blob, matchesMaterializedSha256: materialized?.sha256 === sha256,
    matchesSourceMode: materialized?.mode === record.mode }
})
const receipt = { schema: "genesis-extended-source-capture-execution/v1", campaign: "20261111-v1", session: "s2",
  sourceRevision, protocolRevision: "2689c516d63488be37de678cc853dd4556fd5c13", candidateRevision: null,
  implementation: "Detached extended-source-capture proposal preview; not S5-integrated", startedAt, finishedAt: new Date().toISOString(),
  totals: { requested: results.length, present: results.filter((row: { observation: { kind: string } }) => row.observation.kind === "present").length,
    absent: results.filter((row: { observation: { kind: string } }) => row.observation.kind === "absent").length,
    unavailable: results.filter((row: { observation: { kind: string } }) => row.observation.kind === "unavailable").length },
  results, fixtures: false, injectedSeams: false, production: "NOT_RUN", s5Acceptance: "NOT_REQUESTED", tests: "NOT_RUN" }
writeFileSync(`${root}/preparation/receipts/extended-source-capture-execution.json`, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ totals: receipt.totals, mismatches: results.filter((row: { matchesSourceBlob?: boolean; matchesMaterializedSha256?: boolean; matchesSourceMode?: boolean }) => row.matchesSourceBlob === false || row.matchesMaterializedSha256 === false || row.matchesSourceMode === false) }, null, 2))
