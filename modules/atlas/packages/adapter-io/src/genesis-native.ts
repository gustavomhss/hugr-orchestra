import { dirname, posix } from "node:path"
import { asNodeKey, id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { GroundedFact, OwnershipArtifact, OwnershipInput, OwnershipManifest, OwnershipReceipt, OwnershipResult, OwnershipReview } from "@atlas/knowledge"
import { readOwnership } from "@atlas/knowledge"
import { nativeFormatUrl, nativePath, nativeRecord, nativeReferenceKey, nativeReferencePath, validateNativePackage } from "./genesis-native-format.js"
import type { NativeReference } from "./genesis-native-format.js"
import { decodeNativeUtf8, nativeBlobSha, nativeBody, nativeCasDirectory, nativeImplementation, nativeIoUrl, nativePut, nativeRoot, nativeSha256, readNativeFile } from "./genesis-native-io.js"
import { nativeBindingUrl, validateNativeBinding } from "./genesis-native-binding.js"
import { observeOwnershipInput, ownershipInput, ownershipInputMaxBytes } from "./ownership-input.js"
import { ownershipClaim } from "./ownership-access.js"
import { headSha } from "./run-git.js"
import { createDiskStore } from "./store.js"

export type NativeCandidate = {
  kind: "genesis-native-candidate"; version: 1; repo_root: string; observed_head: string | null
  source_revision: string; scope: string; session: string
  reference_commit_verification: "external-capture-evidence-required"
  transport: { path: string; sha256: string; body: Hash }
  implementation: Record<string, string>; contract: Hash; criteria: string[]
  references: { reference: NativeReference; body: Hash }[]
  observations: { key: string; version: string; sha256?: string }[]
  entries: { key: string; artifact: Omit<OwnershipArtifact, "receipt">; inputs: OwnershipInput[]; dependencies: OwnershipReceipt["dependencies"]; inputs_id: Hash }[]
  roots: OwnershipManifest["roots"]; required_artifact_keys: string[]
}
export type PreparedNativePackage = { schema: "genesis-native-prepared/v1"; candidate_id: Hash; candidate: NativeCandidate }

/** CAS-only preparation. This neither writes a projection nor creates policy, reviewers or approvals. */
export function prepareNativePackage(repoPath: string, packagePath: string): PreparedNativePackage {
  const root = nativeRoot(repoPath)
  nativePath(packagePath)
  const packageBytes = readNativeFile(root, packagePath)
  const pack = validateNativePackage(JSON.parse(decodeNativeUtf8(packageBytes)))
  const store = createDiskStore(nativeCasDirectory(root))
  const references = new Map<string, { reference: NativeReference; body: Hash }>()
  const expectedFiles = new Map<string, string>()
  const expectFile = (path: string, digest: string) => {
    if (expectedFiles.has(path) && expectedFiles.get(path) !== digest) throw new Error(`native-conflicting-reference: ${path}`)
    expectedFiles.set(path, digest)
  }
  const preserve = (reference: NativeReference) => {
    expectFile(nativeReferencePath(reference), reference.sha256)
    const bytes = readNativeFile(root, nativeReferencePath(reference))
    if (nativeSha256(bytes) !== reference.sha256) throw new Error(`native-reference-drift: ${nativeReferencePath(reference)}`)
    references.set(nativeReferenceKey(reference), { reference, body: nativeBody(store, bytes) })
  }
  preserve(pack.protocol_ref)
  preserve(pack.contract.oracle_ref)
  const criteria = [...new Set([...pack.contract.criteria, "runtime-import-binding"])]
  const contract = nativePut(store, { kind: "ownership-contract", version: 1, criteria })
  const observations = new Map<string, NativeCandidate["observations"][number]>()
  const entries: NativeCandidate["entries"] = []
  for (const source of pack.artifacts) {
    for (const reference of [source.recipe_ref, source.producer_request_ref, source.producer_response_ref, ...source.semantic_review_refs, ...source.runtime_receipt_refs]) preserve(reference)
    for (const reference of source.source_refs) {
      expectFile(reference.path, reference.sha256)
      const bytes = readNativeFile(root, reference.path, ownershipInputMaxBytes)
      if (nativeSha256(bytes) !== reference.sha256 || nativeBlobSha(bytes) !== reference.git_blob_sha)
        throw new Error(`native-source-drift: ${reference.path}`)
    }
    // Protocol/contract evidence is also a live input. The transport JSON is immutable evidence,
    // not a whole-scope dependency that would invalidate unrelated artifacts whenever a WP is added.
    const inputKeys = [...new Set([...source.input_keys, `file:${nativeReferencePath(pack.protocol_ref)}`])]
    const inputs = inputKeys.map((key) => {
      const observed = observeOwnershipInput(root, key)
      if (observed.kind !== "present") throw new Error(`native-input-${observed.kind}: ${key}`)
      const bytes = key.startsWith("file:") ? readNativeFile(root, key.slice(5), ownershipInputMaxBytes) : undefined
      if (bytes !== undefined && expectedFiles.has(key.slice(5)) && nativeSha256(bytes) !== expectedFiles.get(key.slice(5)))
        throw new Error(`native-source-drift: ${key}`)
      if (bytes !== undefined && observed.version !== String(id({ kind: "ownership-source", version: 1, bytes: Array.from(bytes) })))
        throw new Error(`native-input-raced: ${key}`)
      const previous = observations.get(key)
      if (previous && previous.version !== observed.version) throw new Error(`native-input-raced: ${key}`)
      observations.set(key, { key, version: observed.version, ...(bytes === undefined ? {} : { sha256: nativeSha256(bytes) }) })
      return { key, version: observed.version }
    })
    const bodyPath = posix.join(dirname(packagePath), source.body.path)
    nativePath(bodyPath)
    const bytes = readNativeFile(root, bodyPath)
    if (bytes.length !== source.body.byte_length || nativeSha256(bytes) !== source.body.sha256) throw new Error(`native-body-drift: ${source.key}`)
    decodeNativeUtf8(bytes)
    const result: OwnershipResult = {
      kind: "ownership-result", version: 1, body: nativeBody(store, bytes), authority: source.authority,
      validity: source.validity, gaps: source.gaps, evidence: source.evidence,
    }
    const dependencies = source.build_dependencies.map((dependency) => ({ key: dependency.key, result: entries.find((entry) => entry.key === dependency.key)!.artifact.result }))
    const artifact: Omit<OwnershipArtifact, "receipt"> = {
      kind: "ownership-artifact", version: 1, key: source.key, scope: pack.scope, title: source.title,
      layer: source.layer, need: source.need, result: nativePut(store, result), navigation: source.navigation,
    }
    entries.push({ key: source.key, artifact, inputs, dependencies, inputs_id: id({ inputs, dependencies }) })
  }
  for (const input of observations.values()) {
    const observed = observeOwnershipInput(root, input.key)
    if (observed.kind !== "present" || observed.version !== input.version) throw new Error(`native-input-raced: ${input.key}`)
  }
  const candidate: NativeCandidate = {
    kind: "genesis-native-candidate", version: 1, repo_root: root, observed_head: headSha(root) ?? null,
    source_revision: pack.source_revision, scope: pack.scope, session: pack.session,
    reference_commit_verification: "external-capture-evidence-required",
    transport: { path: packagePath, sha256: nativeSha256(packageBytes), body: nativeBody(store, packageBytes) },
    implementation: {
      adapter: nativeImplementation(import.meta.url), format: nativeImplementation(nativeFormatUrl),
      io: nativeImplementation(nativeIoUrl), binding: nativeImplementation(nativeBindingUrl),
    },
    contract, criteria, references: [...references.values()], observations: [...observations.values()],
    entries, roots: pack.roots, required_artifact_keys: pack.required_artifact_keys,
  }
  return { schema: "genesis-native-prepared/v1", candidate_id: nativePut(store, candidate), candidate }
}

/** Re-derive the candidate from current bytes before considering the separate binding decision. */
export async function publishNativePackage(repoPath: string, value: unknown, approvalPath: string) {
  const record = nativeRecord(value, "prepared record")
  if (record.schema !== "genesis-native-prepared/v1") throw new Error("native-prepared-schema")
  const candidate = nativeRecord(record.candidate, "candidate")
  const transport = nativeRecord(candidate.transport, "candidate.transport")
  const fresh = prepareNativePackage(repoPath, nativePath(transport.path))
  if (record.candidate_id !== id(candidate) || record.candidate_id !== fresh.candidate_id || JSON.stringify(candidate) !== JSON.stringify(fresh.candidate))
    throw new Error("native-candidate-drift: prepare again and obtain new exact binding decisions")
  const root = fresh.candidate.repo_root
  const store = createDiskStore(nativeCasDirectory(root))
  const approvalBytes = readNativeFile(root, nativePath(approvalPath))
  const binding = validateNativeBinding(JSON.parse(decodeNativeUtf8(approvalBytes)), fresh)
  const provenance = nativeBody(store, approvalBytes)
  const decisionBodies = binding.decisions.map((decision) => {
    const capture = (reference: NativeReference) => {
      const bytes = readNativeFile(root, nativeReferencePath(reference))
      if (nativeSha256(bytes) !== reference.sha256) throw new Error("native-binding-reference-drift")
      return nativeBody(store, bytes)
    }
    return { request: capture(decision.request_ref), response: capture(decision.response_ref) }
  })
  const entries = fresh.candidate.entries.map((entry) => {
    const reviews = binding.decisions.map((decision, index) => {
      const review: OwnershipReview = {
        kind: "ownership-review", version: 1, reviewer: decision.reviewer, contract: fresh.candidate.contract,
        inputs: entry.inputs_id, result: entry.artifact.result, criteria: fresh.candidate.criteria, verdict: "pass",
        provenance: `Operator-supplied NEW runtime binding; decision ${decision.decision_id_kind} ${decision.decision_id}; candidate ${fresh.candidate_id}; preserved approval ${provenance}; request ${decisionBodies[index]!.request}; response ${decisionBodies[index]!.response}. This adapter record is not original reviewer prose.`,
      }
      return nativePut(store, review)
    })
    const receipt: OwnershipReceipt = { kind: "ownership-receipt", version: 1, contract: fresh.candidate.contract, inputs: entry.inputs, dependencies: entry.dependencies, reviews }
    return { key: entry.key, artifact: nativePut(store, { ...entry.artifact, receipt: nativePut(store, receipt) }) }
  })
  const manifest: OwnershipManifest = { kind: "ownership-manifest", version: 1, scope: fresh.candidate.scope, entries, roots: fresh.candidate.roots }
  const ownership = nativePut(store, manifest)
  // The existing attachment gate visits roots. Check every transported entry too, so a blocked or
  // unreviewed disconnected entry cannot hide behind a supported root.
  for (const entry of entries) {
    const read = readOwnership(store, ownership, { scope: manifest.scope, key: entry.key, maxBytes: Number.MAX_SAFE_INTEGER }, (key) => ownershipInput(root, key))
    if (read.kind === "hold") return { kind: "hold" as const, stage: "ownership-validation", candidate_id: fresh.candidate_id, ownership, refusal: read }
  }
  const { composeRuntime } = await import("./compose.js")
  const { deriveGroundingAxes } = await import("./grounding-computer.js")
  const { walkFileTree } = await import("./fs.js")
  const { readScipOrEmpty } = await import("./scip.js")
  const axes = deriveGroundingAxes(walkFileTree(root), readScipOrEmpty(posix.join(root, ".atlas/index.scip"))).axes
  const node: GroundedFact = {
    kind: "advisory", id: asNodeKey(String(id({ ownership }))), tier: "T2", scope: manifest.scope,
    claimNorm: ownershipClaim(manifest.scope), predicateSlot: "ownership", ownership,
    grounding: { entries: [{ anchor: { kind: "repo", qualifiedPath: axes.spatial.key, subtreeHash: axes.spatial.subtreeHash }, path: "." }] },
    freshness: "FRESH", claims: [], authoring: "ADVISORY",
  }
  const at = id({ kind: "genesis-native-binding", candidate: fresh.candidate_id })
  const runtime = composeRuntime(root)
  const check = runtime.check(node, at)
  if (!check.wouldEmit) return { kind: "hold" as const, stage: "governed-check", candidate_id: fresh.candidate_id, ownership, check }
  const emission = runtime.handler.handle("atlas-emit", { node, at })
  return { kind: "publication-attempt" as const, candidate_id: fresh.candidate_id, ownership, at, check, emission }
}
