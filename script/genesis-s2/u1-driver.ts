#!/usr/bin/env bun
// S2 U1 adapter: the runtime owns planning and candidate construction; this file records every callback.
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { isAbsolute, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

type RecipeSpec = {
  key: string
  recipe_input_key: string
  recipe_version: string
  declared_inputs: string[]
  mandatory_inputs: string[]
  required: string[]
}
type SealedOutput = {
  key: string
  snapshot_sha256: string
  output_file: string
  output_sha256: string
  producer_id: string
  semantic_evidence?: { reviewer: string; verdict: "PASS"; result_id: string; snapshot_sha256: string; cas_id: string; response_file: string; response_sha256: string }[]
}
type Request = {
  mode: "plan" | "prepare" | "finalize"
  runtime_root: string
  corpus_root: string
  baseline_file: string
  manifest: string
  context: object
  target_generation: string
  target_repo_root?: string
  checkpoint_dir: string
  recipes: RecipeSpec[]
  outputs_file?: string
  outputs_sha256?: string
  target_file?: string
  binding_file?: string
}
type Snapshot = {
  captured: ReadonlyMap<string, { kind: string; version?: string }>
  bytes: ReadonlyMap<string, Uint8Array>
  lists: ReadonlyMap<string, readonly string[]>
  dependencies: ReadonlyMap<string, string>
}
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const insist = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"))
const sorted = <T>(map: ReadonlyMap<string, T>) => [...map].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)

async function main() {
  insist(process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "hosted-manual-only")
  insist(process.argv.length === 3, "usage: bun u1-driver.ts <request.json>")
  const request = json(process.argv[2]!) as Request
  insist(["plan", "prepare", "finalize"].includes(request.mode), "invalid-mode")
  const runtime = resolve(request.runtime_root), root = resolve(request.corpus_root), checkpoints = resolve(request.checkpoint_dir)
  insist(isAbsolute(request.runtime_root) && isAbsolute(request.corpus_root) && isAbsolute(request.checkpoint_dir), "absolute-paths-required")
  insist(!existsSync(checkpoints) && !checkpoints.startsWith(root + "/") && !checkpoints.startsWith(runtime + "/"), "fresh-independent-checkpoints-required")
  mkdirSync(checkpoints, { recursive: true })
  const logPath = join(checkpoints, "callbacks.jsonl")
  const event = (value: object) => {
    const fd = openSync(logPath, "a")
    appendFileSync(fd, JSON.stringify(value) + "\n")
    fsyncSync(fd)
    closeSync(fd)
  }
  const save = (name: string, bytes: Uint8Array) => {
    const fd = openSync(join(checkpoints, name), "wx")
    writeFileSync(fd, bytes)
    fsyncSync(fd)
    closeSync(fd)
  }
  const port = (path: string) => pathToFileURL(join(runtime, "modules/atlas", path)).href
  const { id } = await import(port("packages/kernel/src/canonical.ts"))
  const { createDiskStore } = await import(port("packages/adapter-io/src/store.ts"))
  const { nativeCasDirectory, nativeRoot, readNativeFile } = await import(port("packages/adapter-io/src/genesis-native-io.ts"))
  const { nativeReferencePath } = await import(port("packages/adapter-io/src/genesis-native-format.ts"))
  const { observeOwnershipInput, ownershipInputMaxBytes } = await import(port("packages/adapter-io/src/ownership-input.ts"))
  const { planOwnershipUpdate } = await import(port("packages/knowledge/src/ownership/update-plan.ts"))
  const { prepareEvaluationUpdate, finalizeEvaluationUpdate } = await import(port("packages/adapter-io/src/evaluation-rebuild.ts"))
  insist(nativeRoot(root) === root && nativeRoot(runtime) === runtime, "invalid-roots")
  const store = createDiskStore(nativeCasDirectory(root))
  const baseline = json(request.baseline_file)
  const retained = new Map<string, Uint8Array>()
  const observe = (key: string) => {
    insist(key.startsWith("file:"), `unsupported-membership-or-input:${key}`)
    const first = observeOwnershipInput(root, key)
    if (!retained.has(key) && first.kind === "present") {
      const data = readNativeFile(root, key.slice(5), ownershipInputMaxBytes)
      const after = observeOwnershipInput(root, key)
      insist(after.kind === "present" && after.version === first.version && String(id({ kind: "ownership-source", version: 1, bytes: Array.from(data) })) === first.version, `capture-drift:${key}`)
      retained.set(key, new Uint8Array(data))
      const name = `capture-${sha(data)}.bin`
      if (!existsSync(join(checkpoints, name))) save(name, data)
      event({ event: "capture", key, observation: first, sha256: sha(data), byte_length: data.length, file: name })
    }
    if (first.kind !== "present") event({ event: "observation", key, observation: first })
    return first
  }
  const readCapturedBytes = (key: string) => {
    const bytes = retained.get(key)
    return bytes === undefined ? undefined : new Uint8Array(bytes)
  }
  const listMembers = (dir: string): never => { throw new Error(`unsupported-membership:${dir}`) }
  const current = (key: string) => { const observed = observe(key); return observed.kind === "present" ? observed.version : undefined }
  const outputBytes = request.outputs_file ? readFileSync(request.outputs_file) : undefined
  if (outputBytes) insist(request.outputs_sha256 !== undefined && sha(outputBytes) === request.outputs_sha256, "sealed-output-registry-drift")
  const outputs: SealedOutput[] = outputBytes ? JSON.parse(outputBytes.toString("utf8")) : []
  insist(Array.isArray(outputs), "outputs-must-be-array")
  const used = new Map<string, SealedOutput>()
  const recipes = new Map(request.recipes.map((spec) => [spec.key, {
    key: spec.key, recipeInputKey: spec.recipe_input_key, recipeVersion: spec.recipe_version,
    declaredInputs: spec.declared_inputs, mandatoryInputs: spec.mandatory_inputs, required: spec.required,
    run: (input: Snapshot) => {
      const snapshot = {
        key: spec.key, recipe_input_key: spec.recipe_input_key, recipe_version: spec.recipe_version,
        captured: sorted(input.captured), bytes: sorted(input.bytes).map(([key, bytes]) => ({ key, sha256: sha(bytes), byte_length: bytes.length })),
        lists: sorted(input.lists), dependencies: sorted(input.dependencies),
      }
      const bytes = Buffer.from(JSON.stringify(snapshot))
      const digest = sha(bytes)
      save(`snapshot-${digest}.json`, bytes)
      event({ event: "callback-enter", key: spec.key, snapshot_sha256: digest })
      const matches = outputs.filter((item) => item.key === spec.key && item.snapshot_sha256 === digest)
      if (matches.length !== 1) {
        event({ event: "callback-hold", key: spec.key, snapshot_sha256: digest, reason: "sealed-producer-output-required", matches: matches.length })
        throw new Error(`sealed-producer-output-required:${spec.key}:${digest}`)
      }
      const record = matches[0]!
      insist(typeof record.producer_id === "string" && record.producer_id.length > 0, `producer-identity-required:${spec.key}`)
      const output = readFileSync(record.output_file)
      insist(sha(output) === record.output_sha256 && output.length > 0, `producer-output-drift:${spec.key}`)
      const value = JSON.parse(output.toString("utf8"))
      insist(typeof value.body === "string" && value.body.length > 0, `invalid-producer-output:${spec.key}`)
      used.set(spec.key, record)
      event({ event: "callback-return", key: spec.key, snapshot_sha256: digest, producer_id: record.producer_id, output_sha256: record.output_sha256 })
      return value
    },
  }]))
  insist(recipes.size === request.recipes.length, "duplicate-recipes")
  const semanticEvidence = (key: string, result: string) => {
    const record = used.get(key)
    const evidence = record?.semantic_evidence
    if (!evidence || evidence.length < 2 || new Set(evidence.map((item) => item.reviewer)).size < 2) {
      event({ event: "semantic-hold", key, result, reason: "two-fresh-semantic-evidence-required" })
      return undefined
    }
    for (const item of evidence) {
      const response = readFileSync(item.response_file)
      insist(item.reviewer.length > 0 && item.verdict === "PASS" && item.result_id === result
        && item.snapshot_sha256 === record?.snapshot_sha256 && sha(response) === item.response_sha256, `semantic-response-drift:${key}`)
      const decision = JSON.parse(response.toString("utf8"))
      insist(decision.reviewer === item.reviewer && decision.verdict === "PASS" && decision.result_id === result
        && decision.snapshot_sha256 === record?.snapshot_sha256, `semantic-response-not-bound:${key}`)
      const value = store.get(item.cas_id)
      insist(value !== undefined && String(id(value)) === item.cas_id && value.kind === "ownership-body"
        && Buffer.from(value.bytes).equals(response), `semantic-cas-drift:${key}`)
    }
    event({ event: "semantic-evidence", key, result, reviewers: evidence.map((item) => item.reviewer), ids: evidence.map((item) => item.cas_id) })
    return evidence.map((item) => item.cas_id)
  }
  event({ event: "start", mode: request.mode, manifest: request.manifest, baseline_candidate: baseline.candidate_id })
  const result = request.mode === "plan"
    ? planOwnershipUpdate(store, request.manifest, baseline.candidate.scope, observe, request.context)
    : request.mode === "prepare"
      ? prepareEvaluationUpdate({ store, baseline, manifest: request.manifest, context: request.context,
          targetGeneration: request.target_generation, targetRepoRoot: request.target_repo_root, recipes, observe, readCapturedBytes, listMembers, semanticEvidence })
      : finalizeEvaluationUpdate({ store, target: json(request.target_file!), binding: json(request.binding_file!), current,
          readReference: (reference: object) => readNativeFile(root, nativeReferencePath(reference)) })
  save("result.json", Buffer.from(JSON.stringify(result, null, 2) + "\n"))
  event({ event: "finish", kind: result.kind })
  process.stdout.write(JSON.stringify(result) + "\n")
  if (result.kind === "hold") process.exitCode = 1
}

await main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({ kind: "hold", error: error instanceof Error ? error.message : String(error) }) + "\n")
  process.exitCode = 1
})
