#!/usr/bin/env bun
// Bind real producer outputs and original semantic responses to an observed U1 callback snapshot.
import { createHash } from "node:crypto"
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

type Evidence = { path: string; sha256: string }
type Producer = { key: string; producer_id: string; snapshot_sha256: string; response: Evidence; decisions?: Evidence[] }
type Request = {
  runtime_root: string
  corpus_root: string
  baseline_file: string
  manifest: string
  context: object
  planner_file: string
  checkpoint_dir: string
  snapshot_file: string
  recipes: { key: string; recipe_input_key: string; recipe_version: string; required: string[] }[]
  producers: Producer[]
  output_dir: string
  prepared_run_file?: string
  prepared_callbacks_file?: string
}
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex")
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"))
const requireValue = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const save = (path: string, bytes: Uint8Array) => {
  const fd = openSync(path, "wx")
  writeFileSync(fd, bytes)
  fsyncSync(fd)
  closeSync(fd)
}

async function main() {
  requireValue(process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_EVENT_NAME === "workflow_dispatch"
    && process.env.GITHUB_REPOSITORY === "gustavomhss/hugr-orchestra"
    && process.env.GITHUB_REF === "refs/heads/genesis-interfaces-resume", "isolated-manual-workflow-required")
  requireValue(process.argv.length === 3, "usage: bun u1-output-seal.ts <request.json>")
  const request = json(process.argv[2]!) as Request
  for (const path of [request.runtime_root, request.corpus_root, request.baseline_file, request.planner_file, request.checkpoint_dir, request.snapshot_file, request.output_dir])
    requireValue(isAbsolute(path), "absolute-path-required")
  const runtime = resolve(request.runtime_root), root = resolve(request.corpus_root), checkpoint = resolve(request.checkpoint_dir), output = resolve(request.output_dir)
  requireValue(!existsSync(output) && !output.startsWith(root + "/") && !output.startsWith(runtime + "/"), "fresh-independent-output-required")
  mkdirSync(output, { recursive: true })
  const port = (path: string) => pathToFileURL(join(runtime, "modules/atlas", path)).href
  const { id } = await import(port("packages/kernel/src/canonical.ts"))
  const { createDiskStore } = await import(port("packages/adapter-io/src/store.ts"))
  const { nativeCasDirectory, nativeRoot } = await import(port("packages/adapter-io/src/genesis-native-io.ts"))
  const { observeOwnershipInput } = await import(port("packages/adapter-io/src/ownership-input.ts"))
  const { planOwnershipUpdate } = await import(port("packages/knowledge/src/ownership/update-plan.ts"))
  const { readOwnership } = await import(port("packages/knowledge/src/ownership/read.ts"))
  requireValue(nativeRoot(root) === root && nativeRoot(runtime) === runtime, "invalid-root")
  const store = createDiskStore(nativeCasDirectory(root))
  const baseline = json(request.baseline_file)
  requireValue(String(id(baseline.candidate)) === baseline.candidate_id, "baseline-candidate-integrity")
  const manifest = store.get(request.manifest)
  requireValue(manifest !== undefined && String(id(manifest)) === request.manifest && manifest.kind === "ownership-manifest"
    && manifest.version === 2 && manifest.evaluationCandidate === baseline.candidate_id, "baseline-manifest-integrity")
  const actualPlan = planOwnershipUpdate(store, request.manifest, baseline.candidate.scope, (key: string) => observeOwnershipInput(root, key), request.context)
  const savedPlan = json(request.planner_file)
  requireValue(actualPlan.kind === "ownership-update-plan" && JSON.stringify(actualPlan) === JSON.stringify(savedPlan), "planner-not-exact-current-result")
  const specs = new Map(request.recipes.map((spec) => [spec.key, spec]))
  const entries = new Map<string, typeof baseline.candidate.entries[number]>(baseline.candidate.entries.map((entry: { key: string }) => [entry.key, entry]))
  requireValue(specs.size === baseline.candidate.entries.length && entries.size === specs.size, "recipe-coverage")
  const snapshotRaw = readFileSync(request.snapshot_file)
  const original = JSON.parse(snapshotRaw.toString("utf8"))
  requireValue(resolve(request.snapshot_file).startsWith(checkpoint + "/") && original.key === actualPlan.affected[0], "first-actual-callback-required")
  requireValue(sha(snapshotRaw) === request.snapshot_file.split("/").at(-1)?.replace(/^snapshot-/, "").replace(/\.json$/, ""), "snapshot-name-hash-mismatch")
  const checkpointEvents = readFileSync(join(checkpoint, "callbacks.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line))
  requireValue(checkpointEvents.some((event) => event.event === "callback-enter" && event.key === original.key
    && event.snapshot_sha256 === sha(snapshotRaw)), "snapshot-not-observed-in-callback-ledger")
  const captured = new Map<string, { kind: string; version?: string }>(original.captured)
  requireValue(original.lists.length === 0 && captured.size === original.captured.length, "unsupported-membership-or-duplicate-capture")
  for (const [key, observed] of captured) {
    requireValue(key.startsWith("file:") && JSON.stringify(observeOwnershipInput(root, key)) === JSON.stringify(observed), `capture-current-drift:${key}`)
  }
  for (const row of original.bytes) {
    const bytes = readFileSync(join(checkpoint, `capture-${row.sha256}.bin`))
    requireValue(bytes.length === row.byte_length && sha(bytes) === row.sha256 && captured.get(row.key)?.kind === "present"
      && String(id({ kind: "ownership-source", version: 1, bytes: Array.from(bytes) })) === captured.get(row.key)?.version, `captured-bytes-drift:${row.key}`)
  }
  requireValue(new Set(original.bytes.map((row: { key: string }) => row.key)).size === original.bytes.length
    && original.bytes.length === [...captured.values()].filter((value) => value.kind === "present").length, "capture-bytes-incomplete")
  const results = new Map<string, string>()
  const baselineBodies = new Map<string, { body: string; result: string; metadata: { authority: { basis: string }; validity: string; gaps: string[]; evidence: string[] } }>()
  for (const entry of baseline.candidate.entries) {
    const selection = manifest.entries.find((item: { key: string }) => item.key === entry.key)
    const artifact = selection && store.get(selection.artifact)
    requireValue(artifact !== undefined && String(id(artifact)) === selection.artifact && artifact.result === entry.artifact.result, `baseline-artifact-drift:${entry.key}`)
    const value = store.get(artifact.result)
    requireValue(value !== undefined && String(id(value)) === artifact.result && value.kind === "ownership-result", `baseline-result-drift:${entry.key}`)
    const body = store.get(value.body)
    requireValue(body !== undefined && String(id(body)) === value.body && body.kind === "ownership-body", `baseline-body-drift:${entry.key}`)
    const read = readOwnership(store, request.manifest, { scope: baseline.candidate.scope, key: entry.key, historical: true, maxBytes: Number.MAX_SAFE_INTEGER }, () => undefined, request.context)
    requireValue(read.kind === "ready" && Buffer.from(body.bytes).equals(Buffer.from(read.body, "utf8")), `baseline-review-drift:${entry.key}`)
    baselineBodies.set(entry.key, { body: read.body, result: artifact.result, metadata: value })
    results.set(entry.key, artifact.result)
  }
  const records: { key: string; snapshot_sha256: string; output_file: string; output_sha256: string; producer_id: string; semantic_evidence?: object[] }[] = []
  const steps: object[] = []
  let pending: object | undefined
  for (const key of actualPlan.affected as string[]) {
    const entry = entries.get(key), spec = specs.get(key), previous = baselineBodies.get(key)
    requireValue(entry !== undefined && spec !== undefined && previous !== undefined, `missing-baseline-or-recipe:${key}`)
    const dependencies = spec.required.map((name) => ({ key: name, result: results.get(name) }))
    requireValue(dependencies.every((value) => typeof value.result === "string")
      && JSON.stringify(spec.required) === JSON.stringify(entry.dependencies.map((value: { key: string }) => value.key)), `dependency-layout:${key}`)
    const changedInputs = entry.inputs.some((input: { key: string; version: string }) => captured.get(input.key)?.kind !== "present" || captured.get(input.key)?.version !== input.version)
    const changedDeps = dependencies.some((dep) => entry.dependencies.find((value: { key: string }) => value.key === dep.key)?.result !== dep.result)
    if (!changedInputs && !changedDeps) { steps.push({ key, action: "skip-unchanged-inputs-and-results" }); continue }
    const snapshot = { key, recipe_input_key: spec.recipe_input_key, recipe_version: spec.recipe_version,
      captured: original.captured, bytes: original.bytes, lists: original.lists,
      dependencies: dependencies.map((dep) => [dep.key, dep.result]).sort(([a], [b]) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0) }
    const snapshotBytes = Buffer.from(JSON.stringify(snapshot)), snapshotSha = sha(snapshotBytes)
    if (key === original.key) requireValue(snapshotBytes.equals(snapshotRaw), "first-snapshot-reconstruction-differs")
    save(join(output, `snapshot-${snapshotSha}.json`), snapshotBytes)
    const producerMatches = request.producers.filter((item) => item.key === key && item.snapshot_sha256 === snapshotSha)
    if (producerMatches.length !== 1) {
      save(join(output, "pending-baseline-body.md"), Buffer.from(previous.body, "utf8"))
      pending = { key, snapshot_sha256: snapshotSha, reason: "actual-producer-output-required", baseline_result: previous.result,
        baseline_body_sha256: sha(Buffer.from(previous.body)), baseline_body_file: join(output, "pending-baseline-body.md"), dependencies }
      break
    }
    const producer = producerMatches[0]!
    requireValue(producer.producer_id.length > 0 && isAbsolute(producer.response.path), `producer-identity:${key}`)
    const raw = readFileSync(producer.response.path)
    requireValue(sha(raw) === producer.response.sha256 && raw.length > 0, `producer-response-drift:${key}`)
    const value = JSON.parse(raw.toString("utf8"))
    requireValue(value.producer_id === producer.producer_id && value.snapshot_sha256 === snapshotSha && typeof value.body === "string" && value.body.length > 0
      && value.validity !== "blocked" && (value.authorityBasis === undefined || (typeof value.authorityBasis === "string" && value.authorityBasis.trim() !== "")), `producer-response-not-exact:${key}`)
    const body = { kind: "ownership-body", version: 1, bytes: Array.from(Buffer.from(value.body, "utf8")) }
    const result = { kind: "ownership-result", version: 1, body: id(body),
      authority: { scope: entry.artifact.scope, basis: value.authorityBasis ?? previous.metadata.authority.basis }, validity: "supported",
      gaps: [...(value.gaps ?? previous.metadata.gaps)], evidence: [...(value.evidence ?? previous.metadata.evidence)] }
    const resultId = String(id(result))
    const semantic = []
    if (resultId !== previous.result) {
      const decisions = producer.decisions ?? []
      if (decisions.length !== 2) {
        save(join(output, "pending-baseline-body.md"), Buffer.from(previous.body, "utf8"))
        pending = { key, snapshot_sha256: snapshotSha, result_id: resultId, reason: "two-fresh-exact-semantic-decisions-required", producer_response_sha256: sha(raw) }
        break
      }
      const reviewers = new Set<string>()
      for (const decision of decisions) {
        requireValue(isAbsolute(decision.path), `semantic-path:${key}`)
        const response = readFileSync(decision.path), verdict = JSON.parse(response.toString("utf8"))
        requireValue(sha(response) === decision.sha256 && typeof verdict.reviewer === "string" && verdict.reviewer.length > 0
          && verdict.verdict === "PASS" && verdict.result_id === resultId && verdict.snapshot_sha256 === snapshotSha
          && !reviewers.has(verdict.reviewer), `semantic-decision-not-exact:${key}`)
        reviewers.add(verdict.reviewer)
        const casId = String(store.put({ kind: "ownership-body", version: 1, bytes: Array.from(response) }))
        const saved = store.get(casId)
        requireValue(saved !== undefined && String(id(saved)) === casId && Buffer.from(saved.bytes).equals(response), `semantic-cas-drift:${key}`)
        semantic.push({ reviewer: verdict.reviewer, verdict: "PASS", result_id: resultId, snapshot_sha256: snapshotSha,
          cas_id: casId, response_file: resolve(decision.path), response_sha256: sha(response) })
      }
    }
    records.push({ key, snapshot_sha256: snapshotSha, output_file: resolve(producer.response.path), output_sha256: sha(raw),
      producer_id: producer.producer_id, ...(semantic.length ? { semantic_evidence: semantic } : {}) })
    results.set(key, resultId)
    steps.push({ key, action: resultId === previous.result ? "replay-original-result" : "new-reviewed-result", snapshot_sha256: snapshotSha, result_id: resultId })
  }
  const registry = Buffer.from(JSON.stringify(records, null, 2) + "\n")
  save(join(output, "outputs.json"), registry)
  const summary: { [key: string]: unknown } = { schema: "s2-u1-output-seal/v1", status: pending ? "HOLD" : "READY_FOR_EXACT_PREPARE",
    baseline_candidate: baseline.candidate_id, manifest: request.manifest, affected: actualPlan.affected, steps, pending,
    registry_sha256: sha(registry), registry_path: join(output, "outputs.json"), actual_prepare_verification: "NOT_RUN" }
  if (request.prepared_run_file || request.prepared_callbacks_file) {
    requireValue(!pending && request.prepared_run_file && request.prepared_callbacks_file, "complete-exact-prepare-evidence-required")
    const prepared = json(request.prepared_run_file)
    const events = readFileSync(request.prepared_callbacks_file, "utf8").trim().split("\n").map((line) => JSON.parse(line))
    const callbacks = events.filter((event) => event.event === "callback-return").map((event) => ({ key: event.key, snapshot_sha256: event.snapshot_sha256 }))
    const expected = records.map((record) => ({ key: record.key, snapshot_sha256: record.snapshot_sha256 }))
    requireValue(prepared.kind === "prepared-evaluation-update" && String(id(prepared.prepared.candidate)) === prepared.prepared.candidate_id
      && JSON.stringify(callbacks) === JSON.stringify(expected)
      && JSON.stringify(prepared.affected) === JSON.stringify(actualPlan.affected)
      && JSON.stringify(prepared.calls) === JSON.stringify(records.map((record) => record.key))
      && prepared.prepared.candidate.entries.length === entries.size
      && prepared.prepared.candidate.entries.every((entry: { key: string; artifact: { result: string } }) => results.get(entry.key) === entry.artifact.result), "actual-prepare-mismatch")
    summary.actual_prepare_verification = "MATCHED_OBSERVED_CALLBACKS_AND_RESULTS"
    summary.target_candidate = prepared.prepared.candidate_id
  }
  save(join(output, "summary.json"), Buffer.from(JSON.stringify(summary, null, 2) + "\n"))
  process.stdout.write(JSON.stringify(summary) + "\n")
  if (pending) process.exitCode = 2
}

await main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({ kind: "hold", error: error instanceof Error ? error.message : String(error) }) + "\n")
  process.exitCode = 1
})
