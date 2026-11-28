// Read-only receipt/CAS checksum verification after the original prepare CLI.
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [code, corpus, operation] = process.argv.slice(2)
const { id } = await import(pathToFileURL(join(code, "modules/atlas/packages/kernel/dist/src/index.js")).href)
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const json = (path) => JSON.parse(readFileSync(path, "utf8"))
const prepared = json(join(operation, "prepared.json"))
const stdout = json(join(operation, "stdout.json"))
const candidate = prepared.candidate
const pack = json(join(corpus, candidate.transport.path))
const checks = []
const check = (name, matches) => checks.push({ name, matches })
check("candidate_id_matches_kernel_id", id(candidate) === prepared.candidate_id)
check("stdout_is_same_candidate", JSON.stringify(prepared) === JSON.stringify(stdout))
const cas = new Map()
for (const prefix of readdirSync(join(corpus, ".atlas/cas"))) {
  for (const name of readdirSync(join(corpus, ".atlas/cas", prefix))) {
    const value = json(join(corpus, ".atlas/cas", prefix, name))
    check(`cas:${name}`, name === id(value))
    cas.set(name, value)
  }
}
check("candidate_persisted_exactly", JSON.stringify(cas.get(prepared.candidate_id)) === JSON.stringify(candidate))
check("transport_body_matches_package", sha256(Uint8Array.from(cas.get(candidate.transport.body).bytes)) === candidate.transport.sha256)
check("required_keys_preserved", JSON.stringify(candidate.required_artifact_keys) === JSON.stringify(pack.required_artifact_keys))
check("roots_preserved", JSON.stringify(candidate.roots) === JSON.stringify(pack.roots))
const artifacts = candidate.entries.map((entry) => {
  const source = pack.artifacts.find((item) => item.key === entry.key)
  const result = cas.get(entry.artifact.result)
  const bytes = Uint8Array.from(cas.get(result.body).bytes)
  const bodyMatches = sha256(bytes) === source.body.sha256 && bytes.length === source.body.byte_length
  const resultMatches = ["authority", "validity", "gaps", "evidence"].every((field) => JSON.stringify(result[field]) === JSON.stringify(source[field]))
  const inputsMatch = id({ inputs: entry.inputs, dependencies: entry.dependencies }) === entry.inputs_id
  check(`body:${entry.key}`, bodyMatches)
  check(`result_metadata:${entry.key}`, resultMatches)
  check(`inputs_id:${entry.key}`, inputsMatch)
  return { key: entry.key, result: entry.artifact.result, inputs_id: entry.inputs_id, body_sha256: sha256(bytes), byte_length: bytes.length, body_matches: bodyMatches, result_metadata_matches: resultMatches, inputs_id_matches: inputsMatch }
})
for (const observation of candidate.observations) {
  if (!observation.key.startsWith("file:")) throw new Error("This S2 checksum verifier requires explicit file inputs")
  const bytes = readFileSync(join(corpus, observation.key.slice(5)))
  check(`observation:${observation.key}`, observation.sha256 === sha256(bytes) && observation.version === id({ kind: "ownership-source", version: 1, bytes: Array.from(bytes) }))
}
for (const preserved of candidate.references) {
  check(`reference:${preserved.body}`, sha256(Uint8Array.from(cas.get(preserved.body).bytes)) === preserved.reference.sha256)
}
const report = {
  schema: "genesis-s2-prepared-integrity/v1",
  operation: "Read-only checksum verification using the executed candidate kernel; not a product test or runtime binding decision",
  recorded_at: new Date().toISOString(),
  command_argv: process.argv,
  runtime_revision: "db9b4235022c4df32fe3bfd4faeea8adcd69abb7",
  candidate_id: prepared.candidate_id,
  prepared_sha256: sha256(readFileSync(join(operation, "prepared.json"))),
  state: checks.every((item) => item.matches) ? "PASS_PREPARED_INTEGRITY_ONLY" : "FAIL",
  cas_objects_checked: cas.size,
  artifacts_checked: artifacts.length,
  observations_checked: candidate.observations.length,
  references_checked: candidate.references.length,
  checks_total: checks.length,
  failed_checks: checks.filter((item) => !item.matches),
  artifacts,
  limits: ["No policy, binding, publication, reader or consumer was executed.", "This checksum audit does not qualify an S4 release or replace independent judgment."]
}
writeFileSync(join(operation, "integrity.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ state: report.state, checks: report.checks_total, failures: report.failed_checks.length, cas: report.cas_objects_checked, artifacts: report.artifacts_checked, observations: report.observations_checked }))
if (report.state === "FAIL") process.exitCode = 1
