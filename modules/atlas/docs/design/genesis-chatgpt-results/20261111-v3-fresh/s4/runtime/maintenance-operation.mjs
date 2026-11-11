#!/usr/bin/env bun
// S4 campaign reproducer. Product ports own planning, validation and activation.
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"

const DRIVER = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime/maintenance-operation.mjs"
const report = {
  schema: "s4-maintenance-operation/v1",
  execution: "a2095d5a-1464-4c38-a222-6376974fc9c9",
  stage: "arguments",
  activation_attempted: false,
  recipe_returns: [],
  evaluations: [],
  model: "UNKNOWN",
  tokens: "UNKNOWN",
}

async function main() {
  const args = process.argv.slice(2)
  requireValue(args.length === 6 && ["rebuild", "publish"].includes(args[0]), "maintenance-argv", {
    usage: "bun maintenance-operation.mjs <rebuild|publish> <runtimeAtlasRoot> <corpusRoot> <baselineManifest> <preparedTargetJsonPath> <bindingPath-relative-to-corpus>",
  })
  const [mode, runtimeArg, corpusArg, baselineManifest, preparedArg, bindingArg] = args
  report.mode = mode
  const port = (path) => pathToFileURL(join(resolve(runtimeArg), path)).href
  report.stage = "load-ports"
  const { id } = await import(port("packages/kernel/src/canonical.ts"))
  const { prepareNativePackage } = await import(port("packages/adapter-io/src/genesis-native.ts"))
  const { validateNativeBinding } = await import(port("packages/adapter-io/src/genesis-native-binding.ts"))
  const { nativeBody, nativeCasDirectory, nativePut, nativeRoot, nativeSha256, readNativeFile, decodeNativeUtf8 } = await import(port("packages/adapter-io/src/genesis-native-io.ts"))
  const { nativeDigest, nativeKeys, nativePath, nativeRecord, nativeReferencePath } = await import(port("packages/adapter-io/src/genesis-native-format.ts"))
  const { observeOwnershipInput } = await import(port("packages/adapter-io/src/ownership-input.ts"))
  const { rebuildOwnershipUpdate } = await import(port("packages/adapter-io/src/ownership-rebuild.ts"))
  const { createDiskStore } = await import(port("packages/adapter-io/src/store.ts"))
  const { readOwnership } = await import(port("packages/knowledge/src/ownership/read.ts"))
  const { isOwnershipManifest, isOwnershipArtifact, isOwnershipReceipt, isOwnershipResult, isOwnershipBody, isOwnershipContract } = await import(port("packages/knowledge/src/ownership/shape.ts"))
  const runtimeAtlasRoot = nativeRoot(runtimeArg)
  const root = nativeRoot(corpusArg)
  const bindingPath = nativePath(bindingArg)
  nativeDigest(baselineManifest, 64, "baselineManifest")
  const executedPath = fileURLToPath(import.meta.url)
  const readImplementation = () => readNativeFile(nativeRoot(dirname(executedPath)), basename(executedPath), 256000)
  const implementationBytes = readImplementation()
  const preparedPath = isAbsolute(preparedArg) ? preparedArg : resolve(root, nativePath(preparedArg))
  const readPrepared = () => readNativeFile(nativeRoot(dirname(preparedPath)), basename(preparedPath))
  const store = createDiskStore(nativeCasDirectory(root))
  const load = (ref, matches) => {
    nativeDigest(ref, 64, "CAS reference")
    const value = store.get(ref)
    requireValue(matches(value) && id(value) === ref, "maintenance-cas-integrity-or-shape", { ref })
    return value
  }
  const sourceID = (bytes) => String(id({ kind: "ownership-source", version: 1, bytes: Array.from(bytes) }))
  const fileKey = (key) => {
    requireValue(typeof key === "string" && key.startsWith("file:"), "maintenance-file-input-only", { key })
    nativePath(key.slice(5))
    return key
  }
  Object.assign(report, { runtimeAtlasRoot, corpusRoot: root, baseline_manifest: baselineManifest, executed_driver: executedPath, recipe_input: `file:${DRIVER}` })

  // Capture once; every observe invocation still reads the host. Later observations never replace bytes.
  const retained = new Map()
  const observe = (key) => {
    fileKey(key)
    const current = observeOwnershipInput(root, key)
    if (!retained.has(key)) {
      const bytes = current.kind === "present" ? new Uint8Array(readNativeFile(root, key.slice(5), 256000)) : undefined
      if (bytes !== undefined) {
        const after = observeOwnershipInput(root, key)
        requireValue(after.kind === "present" && after.version === current.version && sourceID(bytes) === current.version,
          "maintenance-input-raced-during-capture", { key, before: current, after })
      }
      retained.set(key, { observation: { ...current }, bytes })
    }
    return current
  }
  report.stage = "prepare-exact-target"
  const implementation = observe(report.recipe_input)
  requireValue(implementation.kind === "present", "maintenance-driver-unavailable", { observation: implementation })
  requireValue(sourceID(implementationBytes) === implementation.version, "maintenance-executed-driver-mismatch")
  report.recipe_version = implementation.version
  const preparedBytes = readPrepared()
  const record = nativeRecord(JSON.parse(decodeNativeUtf8(preparedBytes)), "prepared record")
  nativeKeys(record, ["schema", "candidate_id", "candidate"], "prepared record")
  requireValue(record.schema === "genesis-native-prepared/v1", "maintenance-prepared-schema")
  const transportPath = nativePath(nativeRecord(nativeRecord(record.candidate, "candidate").transport, "transport").path)
  const fresh = prepareNativePackage(root, transportPath)
  requireValue(record.candidate_id === id(record.candidate) && record.candidate_id === fresh.candidate_id &&
    JSON.stringify(record.candidate) === JSON.stringify(fresh.candidate), "maintenance-candidate-drift")
  const target = fresh.candidate
  report.target_candidate_id = fresh.candidate_id
  report.contract = target.contract
  const contract = load(target.contract, isOwnershipContract)
  requireValue(isDeepStrictEqual(contract.criteria, target.criteria), "maintenance-contract-criteria-drift")

  report.stage = "baseline-structure"
  const baseline = load(baselineManifest, isOwnershipManifest)
  requireValue(baseline.scope === target.scope && isDeepStrictEqual(baseline.roots, target.roots) &&
    isDeepStrictEqual(baseline.entries.map((entry) => entry.key), target.entries.map((entry) => entry.key)),
  "maintenance-structure-change", { baseline_scope: baseline.scope, target_scope: target.scope, baseline_roots: baseline.roots,
    target_roots: target.roots, baseline_keys: baseline.entries.map((entry) => entry.key), target_keys: target.entries.map((entry) => entry.key) })
  const baselines = new Map(baseline.entries.map((entry) => {
    const artifact = load(entry.artifact, isOwnershipArtifact)
    const receipt = load(artifact.receipt, isOwnershipReceipt)
    return [entry.key, { ref: entry.artifact, artifact, receipt }]
  }))
  const targets = new Map(target.entries.map((entry) => [entry.key, entry]))
  const outputs = new Map()
  for (const entry of target.entries) {
    const prior = baselines.get(entry.key)
    const { receipt: omitted, result: previousResult, ...structure } = prior.artifact
    const { result: targetResult, ...targetStructure } = entry.artifact
    requireValue(isDeepStrictEqual(structure, targetStructure), "maintenance-artifact-structure-change", { key: entry.key, baseline: structure, target: targetStructure })
    const keys = entry.inputs.map((input) => fileKey(input.key))
    prior.receipt.inputs.forEach((input) => fileKey(input.key))
    requireValue(isDeepStrictEqual(keys, [...keys].sort()) && isDeepStrictEqual(prior.receipt.inputs.map((input) => input.key), keys),
      "maintenance-input-layout-change-or-order", { key: entry.key, baseline: prior.receipt.inputs.map((input) => input.key), target: keys })
    requireValue(prior.receipt.contract === target.contract && isDeepStrictEqual(prior.receipt.dependencies.map((dep) => dep.key), entry.dependencies.map((dep) => dep.key)),
      "maintenance-contract-or-dependency-topology-change", { key: entry.key })
    requireValue(entry.inputs.some((input) => input.key === report.recipe_input && input.version === implementation.version),
      "maintenance-driver-not-bound", { key: entry.key })
    requireValue(entry.inputs_id === id({ inputs: entry.inputs, dependencies: entry.dependencies }), "maintenance-target-input-id", { key: entry.key })
    const result = load(entry.artifact.result, isOwnershipResult)
    requireValue(result.authority.scope === target.scope && result.validity === "supported", "maintenance-target-not-supported", { key: entry.key, validity: result.validity, gaps: result.gaps })
    const body = load(result.body, isOwnershipBody)
    const decoded = decodeNativeUtf8(Uint8Array.from(body.bytes))
    requireValue(isDeepStrictEqual(Array.from(new TextEncoder().encode(decoded)), body.bytes), "maintenance-body-round-trip", { key: entry.key })
    outputs.set(entry.key, { body: decoded, authorityBasis: result.authority.basis, validity: result.validity, gaps: [...result.gaps], evidence: [...result.evidence] })
  }
  const identities = (manifestRef) => {
    const manifest = load(manifestRef, isOwnershipManifest)
    return Object.fromEntries(manifest.entries.map((entry) => {
      const artifact = load(entry.artifact, isOwnershipArtifact)
      const receipt = load(artifact.receipt, isOwnershipReceipt)
      const result = load(artifact.result, isOwnershipResult)
      return [entry.key, { artifact: entry.artifact, receipt: artifact.receipt, result: artifact.result, body: result.body,
        inputs_id: id({ inputs: receipt.inputs, dependencies: receipt.dependencies }) }]
    }))
  }
  report.before = identities(baselineManifest)

  report.stage = "validate-binding-and-preserve-decisions"
  const bindingBytes = readNativeFile(root, bindingPath)
  const binding = validateNativeBinding(JSON.parse(decodeNativeUtf8(bindingBytes)), fresh)
  const approval = nativeBody(store, bindingBytes)
  const captureEvidence = (reference) => {
    const bytes = readNativeFile(root, nativeReferencePath(reference))
    requireValue(bytes.length > 0 && nativeSha256(bytes) === reference.sha256, "maintenance-binding-reference-drift", { reference })
    return nativeBody(store, bytes)
  }
  const decisions = binding.decisions.map((decision) => ({ request: captureEvidence(decision.request_ref), response: captureEvidence(decision.response_ref) }))
  report.binding_evidence = { approval, prepared_document: nativeBody(store, preparedBytes), decisions: binding.decisions.map((decision, index) => ({
    reviewer: decision.reviewer, decision_id: decision.decision_id, decision_id_kind: decision.decision_id_kind, ...decisions[index],
  })) }
  // Same existing OwnershipReview type as the importer. PASS is mapped only after validateNativeBinding.
  // These adapter records declare their origin; neither they nor a reviewer string authenticate a person.
  const reviews = new Map(target.entries.map((entry) => [entry.key, binding.decisions.map((decision, index) => nativePut(store, {
    kind: "ownership-review", version: 1, reviewer: decision.reviewer, contract: target.contract,
    inputs: entry.inputs_id, result: entry.artifact.result, criteria: target.criteria, verdict: "pass",
    provenance: `Operator-supplied NEW runtime binding adapted by maintenance-operation; decision ${decision.decision_id_kind} ${decision.decision_id}; candidate ${fresh.candidate_id}; preserved approval ${approval}; request ${decisions[index].request}; response ${decisions[index].response}; recipe ${implementation.version}. This adapter record is not original reviewer prose.`,
  }))]))

  const guard = () => {
    requireValue(sourceID(readImplementation()) === implementation.version, "maintenance-executed-driver-drift")
    requireValue(nativeSha256(readPrepared()) === nativeSha256(preparedBytes), "maintenance-prepared-document-drift")
    requireValue(nativeSha256(readNativeFile(root, bindingPath)) === nativeSha256(bindingBytes), "maintenance-binding-document-drift")
    binding.decisions.forEach((decision, index) => {
      requireValue(captureEvidence(decision.request_ref) === decisions[index].request && captureEvidence(decision.response_ref) === decisions[index].response,
        "maintenance-decision-evidence-drift", { reviewer: decision.reviewer })
    })
    const now = prepareNativePackage(root, transportPath)
    requireValue(now.candidate_id === fresh.candidate_id && JSON.stringify(now.candidate) === JSON.stringify(target), "maintenance-target-or-implementation-drift")
  }
  const recipes = new Map(target.entries.map((entry) => [entry.key, {
    key: entry.key, recipeInputKey: report.recipe_input, recipeVersion: implementation.version,
    declaredInputs: entry.inputs.map((input) => input.key), mandatoryInputs: entry.inputs.map((input) => input.key),
    required: entry.dependencies.map((dependency) => dependency.key),
    run: (input) => {
      requireValue(input.lists.size === 0, "maintenance-members-unsupported", { key: entry.key })
      for (const expected of entry.inputs) {
        const observation = input.captured.get(expected.key)
        const bytes = input.bytes.get(expected.key)
        requireValue(observation?.kind === "present" && observation.version === expected.version && bytes !== undefined && sourceID(bytes) === expected.version,
          "maintenance-recipe-capture-mismatch", { key: entry.key, input: expected.key, expected: expected.version, observed: observation ?? null })
      }
      const dependencies = [...input.dependencies].map(([key, result]) => ({ key, result }))
      requireValue(isDeepStrictEqual(dependencies, entry.dependencies), "maintenance-recipe-dependency-mismatch", { key: entry.key, dependencies, expected: entry.dependencies })
      report.recipe_returns.push({ key: entry.key, result: entry.artifact.result, inputs_id: entry.inputs_id, kind: "native-CAS-import" })
      const output = outputs.get(entry.key)
      return { ...output, gaps: [...output.gaps], evidence: [...output.evidence] }
    },
  }]))
  report.stage = "rebuild"
  guard()
  const rebuilt = rebuildOwnershipUpdate({
    store, manifest: baselineManifest, scope: target.scope, contract: target.contract, recipes, observe,
    readCapturedBytes: (key) => { const bytes = retained.get(fileKey(key))?.bytes; return bytes === undefined ? undefined : new Uint8Array(bytes) },
    listMembers: (dir) => { throw failure("maintenance-members-unsupported", { dir }) },
    evaluate: (input) => {
      const entry = targets.get(input.key)
      const inputsID = id({ inputs: input.inputs, dependencies: input.dependencies })
      const matches = entry !== undefined && input.scope === target.scope && input.result === entry.artifact.result && inputsID === entry.inputs_id &&
        isDeepStrictEqual(input.inputs, entry.inputs) && isDeepStrictEqual(input.dependencies, entry.dependencies)
      report.evaluations.push({ key: input.key, result: input.result, inputs_id: inputsID, matched_target: matches })
      return matches ? { kind: "ready", reviews: reviews.get(input.key) } : {
        kind: "hold", reason: "ownership-review", evidence: [input.key, "maintenance-target-envelope-mismatch", input.result, inputsID],
      }
    },
  })
  report.rebuild = rebuilt
  report.captures = [...retained].map(([key, value]) => ({ key, observation: value.observation,
    ...(value.bytes === undefined ? {} : { byte_length: value.bytes.length, sha256: nativeSha256(value.bytes) }) }))
  if (rebuilt.kind === "hold") return { ...report, kind: "hold", refusal: rebuilt }
  report.affected = rebuilt.affected
  report.calls = rebuilt.calls
  report.private_manifest = rebuilt.manifest
  report.manifest_changed = rebuilt.manifest !== baselineManifest
  report.after = identities(rebuilt.manifest)

  report.stage = "validate-complete-reconstruction"
  const candidate = load(rebuilt.manifest, isOwnershipManifest)
  requireValue(candidate.scope === baseline.scope && isDeepStrictEqual(candidate.roots, baseline.roots) &&
    isDeepStrictEqual(candidate.entries.map((entry) => entry.key), baseline.entries.map((entry) => entry.key)), "maintenance-rebuilt-structure-change")
  for (const entry of candidate.entries) {
    const artifact = load(entry.artifact, isOwnershipArtifact)
    const receipt = load(artifact.receipt, isOwnershipReceipt)
    const expected = targets.get(entry.key)
    const { receipt: omitted, ...nativeArtifact } = artifact
    requireValue(isDeepStrictEqual(nativeArtifact, expected.artifact) && receipt.contract === target.contract &&
      isDeepStrictEqual(receipt.inputs, expected.inputs) && isDeepStrictEqual(receipt.dependencies, expected.dependencies),
    "maintenance-rebuild-does-not-match-target", { key: entry.key, actual: report.after[entry.key], expected_result: expected.artifact.result, expected_inputs_id: expected.inputs_id })
  }
  const validateEveryEntry = () => {
    for (const entry of candidate.entries) {
      const read = readOwnership(store, rebuilt.manifest, { scope: target.scope, key: entry.key, maxBytes: Number.MAX_SAFE_INTEGER }, (key) => {
        const current = observeOwnershipInput(root, fileKey(key))
        return current.kind === "present" ? current.version : undefined
      })
      if (read.kind === "hold") throw Object.assign(failure("maintenance-current-entry-refusal", { key: entry.key }), { refusal: read })
    }
  }
  guard()
  validateEveryEntry()
  if (mode === "rebuild") return { ...report, kind: "candidate", stage: "private-candidate", activation_attempted: false }

  report.stage = "governed-publication"
  const { composeRuntime } = await import(port("packages/adapter-io/src/compose.ts"))
  const { ownershipClaim } = await import(port("packages/adapter-io/src/ownership-access.ts"))
  const { deriveGroundingAxes } = await import(port("packages/adapter-io/src/grounding-computer.ts"))
  const { walkFileTree } = await import(port("packages/adapter-io/src/fs.ts"))
  const { readScipOrEmpty } = await import(port("packages/adapter-io/src/scip.ts"))
  const axes = deriveGroundingAxes(walkFileTree(root), readScipOrEmpty(join(root, ".atlas/index.scip"))).axes
  const node = {
    kind: "advisory", id: String(id({ ownership: rebuilt.manifest })), tier: "T2", scope: target.scope,
    claimNorm: ownershipClaim(target.scope), predicateSlot: "ownership", ownership: rebuilt.manifest,
    grounding: { entries: [{ anchor: { kind: "repo", qualifiedPath: axes.spatial.key, subtreeHash: axes.spatial.subtreeHash }, path: "." }] },
    freshness: "FRESH", claims: [], authoring: "ADVISORY",
  }
  const at = id({ kind: "genesis-native-binding", candidate: fresh.candidate_id })
  const runtime = composeRuntime(root)
  // Historical selection verifies the published baseline despite input drift; it never validates the target.
  const validatePublishedBaseline = () => {
    for (const need of Object.keys(baseline.roots)) {
      const selected = runtime.ownership.read({ scope: target.scope, need, historical: true, maxBytes: Number.MAX_SAFE_INTEGER })
      if (selected.kind === "hold") throw Object.assign(failure("maintenance-published-baseline-refusal", { need }), { refusal: selected })
      requireValue(selected.manifest === baselineManifest, "maintenance-published-baseline-mismatch", { need, actual: selected.manifest, expected: baselineManifest })
    }
  }
  validatePublishedBaseline()
  guard()
  validateEveryEntry()
  const check = runtime.check(node, at)
  report.check = check
  if (!check.wouldEmit) return { ...report, kind: "hold", stage: "governed-check" }
  // No cached observation is substituted here or in the native handler's ownership-input gate.
  guard()
  validateEveryEntry()
  validatePublishedBaseline()
  report.at = at
  report.activation_attempted = true
  report.emission = await runtime.handler.handle("atlas-emit", { node, at })
  report.emitted = typeof report.emission?.data?.emitted === "boolean" ? report.emission.data.emitted : "UNKNOWN"
  if (report.emission?.ok !== true || report.emitted !== true) return { ...report, kind: "hold", stage: "governed-emission" }
  report.stage = "published-readback"
  const reopened = composeRuntime(root)
  report.indices = Object.keys(candidate.roots).map((need) => ({ need, result: reopened.ownership.index(target.scope, need) }))
  report.readbacks = candidate.entries.map((entry) => {
    const read = reopened.ownership.read({ scope: target.scope, key: entry.key, maxBytes: Number.MAX_SAFE_INTEGER })
    if (read.kind === "hold") return { key: entry.key, result: read }
    return { key: entry.key, result: { kind: read.kind, manifest: read.manifest, artifact: read.artifact, receipt: read.receipt,
      result: read.result, historical: read.historical, body_byte_length: new TextEncoder().encode(read.body).length,
      body_sha256: nativeSha256(new TextEncoder().encode(read.body)) } }
  })
  const publishedMatches = report.indices.every((entry) => entry.result.kind === "index" && entry.result.manifest === rebuilt.manifest) &&
    report.readbacks.every((entry) => entry.result.kind === "ready" && entry.result.manifest === rebuilt.manifest &&
      entry.result.artifact === report.after[entry.key].artifact && entry.result.result === report.after[entry.key].result)
  return { ...report, kind: "publication-attempt", published_manifest_matches_candidate: publishedMatches }
}

function failure(code, details = {}) {
  return Object.assign(new Error(code), { code, details })
}

function requireValue(condition, code, details) {
  if (!condition) throw failure(code, details)
}

try {
  const result = await main()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = result.kind === "hold" || (result.kind === "publication-attempt" && !result.published_manifest_matches_candidate) ? 1 : 0
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ...report, kind: "hold", ...(error?.refusal === undefined ? {} : { refusal: error.refusal }),
    error: { name: error?.name ?? "UnknownError", message: error?.message ?? String(error), code: error?.code ?? "UNKNOWN", details: error?.details ?? {} } }, null, 2)}\n`)
  process.exitCode = 1
}
