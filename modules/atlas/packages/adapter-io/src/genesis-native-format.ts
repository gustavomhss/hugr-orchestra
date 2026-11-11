import type { OwnershipArtifact, OwnershipNeed, OwnershipQuery, OwnershipResult } from "@atlas/knowledge"
import { isOwnershipNeed } from "@atlas/knowledge"

export const nativeFormatUrl = import.meta.url

export type NativeReference = { commit: string; path: string; sha256: string } | { payload_path: string; sha256: string }
export type NativeArtifact = {
  key: string; scope: string; title: string; layer: OwnershipArtifact["layer"]; need: OwnershipNeed
  body: { path: string; encoding: "utf-8"; byte_length: number; sha256: string }
  authority: OwnershipResult["authority"]; validity: OwnershipResult["validity"]; gaps: string[]; evidence: string[]
  input_keys: string[]; source_refs: { commit: string; path: string; git_blob_sha: string; sha256: string }[]
  recipe_ref: NativeReference; build_dependencies: { key: string; same_package: true }[]; navigation: string[]
  producer_request_ref: NativeReference; producer_response_ref: NativeReference
  semantic_review_refs: NativeReference[]; runtime_receipt_refs: NativeReference[]
}
export type NativePackage = {
  schema: "genesis-native-package/v1"; campaign: string; protocol_epoch: string; results_epoch: string
  session: string; source_revision: string; protocol_ref: NativeReference; scope: string; package_state: string
  contract: { criteria: string[]; oracle_ref: NativeReference }; required_artifact_keys: string[]
  artifacts: NativeArtifact[]; roots: Partial<Record<OwnershipNeed, string>>
  missing_required_artifact_keys: string[]; known_limits: string[]
}

export function nativeRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`native-object: ${label}`)
  return value as Record<string, unknown>
}

export function nativeKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  if (Object.keys(value).length !== expected.length || !expected.every((key) => Object.hasOwn(value, key)))
    throw new Error(`native-fields: ${label}`)
}

export function nativeText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.normalize("NFC") !== value)
    throw new Error(`native-text: ${label}`)
  return value
}

export function nativeStrings(value: unknown, label: string, unique = true): string[] {
  if (!Array.isArray(value)) throw new Error(`native-array: ${label}`)
  const result = value.map((item) => nativeText(item, label))
  if (unique && new Set(result).size !== result.length) throw new Error(`native-duplicate: ${label}`)
  return result
}

export function nativeDigest(value: unknown, length: 40 | 64, label: string): string {
  if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${length}}$`).test(value)) throw new Error(`native-digest: ${label}`)
  return value
}

export function nativePath(value: unknown): string {
  const path = nativeText(value, "path")
  if (/[\\:*?"<>|\u0000-\u001f\u007f]/.test(path) || path.split("/").some((part) => !part || part === "." || part === ".." || [".git", ".atlas"].includes(part.toLowerCase()) || /[. ]$/.test(part)))
    throw new Error(`native-path: ${path}`)
  return path
}

export function nativeReference(value: unknown): NativeReference {
  const ref = nativeRecord(value, "reference")
  nativeDigest(ref.sha256, 64, "reference.sha256")
  if (Object.hasOwn(ref, "payload_path")) {
    nativeKeys(ref, ["payload_path", "sha256"], "payload reference")
    nativePath(ref.payload_path)
    return ref as NativeReference
  }
  nativeKeys(ref, ["commit", "path", "sha256"], "commit reference")
  nativeDigest(ref.commit, 40, "reference.commit")
  nativePath(ref.path)
  return ref as NativeReference
}

export function nativeReferencePath(ref: NativeReference): string {
  return "payload_path" in ref ? ref.payload_path : ref.path
}

export function nativeReferenceKey(ref: NativeReference): string {
  return "payload_path" in ref ? JSON.stringify(["payload", ref.payload_path, ref.sha256]) : JSON.stringify(["commit", ref.commit, ref.path, ref.sha256])
}

export function validateNativeReadQuery(value: unknown): OwnershipQuery {
  const query = nativeRecord(value, "read query")
  nativeText(query.scope, "query.scope")
  if (Object.keys(query).some((key) => !["scope", "need", "key", "section", "maxBytes", "historical"].includes(key)) ||
    !Number.isSafeInteger(query.maxBytes) || Number(query.maxBytes) < 1 ||
    (Object.hasOwn(query, "need") === Object.hasOwn(query, "key"))) throw new Error("native-query-selection-or-limit")
  if (Object.hasOwn(query, "need") && !isOwnershipNeed(query.need)) throw new Error("native-query-need")
  if (Object.hasOwn(query, "key")) nativeText(query.key, "query.key")
  if (Object.hasOwn(query, "section")) nativeText(query.section, "query.section")
  if (Object.hasOwn(query, "historical") && query.historical !== true) throw new Error("native-query-historical")
  return query as unknown as OwnershipQuery
}

/** Transport is data. No package state, semantic verdict or reference grants runtime authority. */
export function validateNativePackage(value: unknown): NativePackage {
  const pack = nativeRecord(value, "package")
  nativeKeys(pack, ["schema", "campaign", "protocol_epoch", "results_epoch", "session", "source_revision", "protocol_ref", "scope", "package_state", "contract", "required_artifact_keys", "artifacts", "roots", "missing_required_artifact_keys", "known_limits"], "package")
  if (pack.schema !== "genesis-native-package/v1") throw new Error("native-schema")
  for (const key of ["campaign", "protocol_epoch", "results_epoch", "scope", "package_state"]) nativeText(pack[key], key)
  if (!["S1", "S2", "S3", "S4", "S5"].includes(String(pack.session))) throw new Error("native-session")
  nativeDigest(pack.source_revision, 40, "source_revision")
  nativeReference(pack.protocol_ref)
  const contract = nativeRecord(pack.contract, "contract")
  nativeKeys(contract, ["criteria", "oracle_ref"], "contract")
  if (!nativeStrings(contract.criteria, "criteria").length) throw new Error("native-empty-criteria")
  nativeReference(contract.oracle_ref)
  const required = nativeStrings(pack.required_artifact_keys, "required_artifact_keys")
  if (!required.length) throw new Error("native-empty-required")
  const missing = nativeStrings(pack.missing_required_artifact_keys, "missing_required_artifact_keys")
  nativeStrings(pack.known_limits, "known_limits", false)
  if (!Array.isArray(pack.artifacts) || !pack.artifacts.length) throw new Error("native-empty-artifacts")
  for (const value of pack.artifacts) validateArtifact(value, pack.scope)
  const artifacts = pack.artifacts as NativeArtifact[]
  const byKey = new Map(artifacts.map((artifact) => [artifact.key, artifact]))
  if (byKey.size !== artifacts.length) throw new Error("native-duplicate-artifact")
  if (missing.length || required.some((key) => !byKey.has(key))) throw new Error("native-incomplete-required")
  const roots = nativeRecord(pack.roots, "roots")
  if (!Object.keys(roots).length) throw new Error("native-empty-roots")
  for (const [need, key] of Object.entries(roots)) {
    if (!isOwnershipNeed(need) || typeof key !== "string" || byKey.get(key)?.need !== need) throw new Error(`native-root: ${need}`)
  }
  for (const artifact of artifacts) {
    for (const key of [...artifact.build_dependencies.map((dependency) => dependency.key), ...artifact.navigation])
      if (!byKey.has(key)) throw new Error(`native-missing-link: ${artifact.key} -> ${key}`)
  }
  // Kahn's traversal distinguishes an actual cycle from merely unordered predecessors.
  const pending = new Map(artifacts.map((artifact) => [artifact.key, artifact.build_dependencies.length]))
  const dependents = new Map<string, string[]>()
  artifacts.forEach((artifact) => artifact.build_dependencies.forEach((dependency) =>
    dependents.set(dependency.key, [...(dependents.get(dependency.key) ?? []), artifact.key])))
  const ready = artifacts.filter((artifact) => pending.get(artifact.key) === 0).map((artifact) => artifact.key)
  for (let index = 0; index < ready.length; index++) {
    for (const key of dependents.get(ready[index]!) ?? []) {
      pending.set(key, pending.get(key)! - 1)
      if (pending.get(key) === 0) ready.push(key)
    }
  }
  if (ready.length !== artifacts.length) throw new Error("native-build-cycle")
  const preceding = new Set<string>()
  for (const artifact of artifacts) {
    if (artifact.build_dependencies.some((dependency) => !preceding.has(dependency.key) || byKey.get(dependency.key)!.validity !== "supported"))
      throw new Error(`native-predecessor-not-accepted-or-ordered: ${artifact.key}`)
    preceding.add(artifact.key)
  }
  const reachable = new Set<string>()
  const queue = Object.values(roots) as string[]
  for (let index = 0; index < queue.length; index++) {
    const key = queue[index]!
    if (reachable.has(key)) continue
    reachable.add(key)
    const artifact = byKey.get(key)!
    queue.push(...artifact.navigation, ...artifact.build_dependencies.map((dependency) => dependency.key))
  }
  if (required.some((key) => !reachable.has(key))) throw new Error("native-required-unreachable")
  return pack as unknown as NativePackage
}

function validateArtifact(value: unknown, scope: unknown) {
  const artifact = nativeRecord(value, "artifact")
  nativeKeys(artifact, ["key", "scope", "title", "layer", "need", "body", "authority", "validity", "gaps", "evidence", "input_keys", "source_refs", "recipe_ref", "build_dependencies", "navigation", "producer_request_ref", "producer_response_ref", "semantic_review_refs", "runtime_receipt_refs"], "artifact")
  for (const key of ["key", "scope", "title"]) nativeText(artifact[key], key)
  if (artifact.scope !== scope) throw new Error("native-artifact-scope")
  if (typeof artifact.layer !== "number" || ![1, 2, 3, 4].includes(artifact.layer) || !isOwnershipNeed(artifact.need)) throw new Error("native-layer-or-need")
  const body = nativeRecord(artifact.body, "body")
  nativeKeys(body, ["path", "encoding", "byte_length", "sha256"], "body")
  nativePath(body.path)
  if (body.encoding !== "utf-8" || !Number.isSafeInteger(body.byte_length) || Number(body.byte_length) < 1) throw new Error("native-body-encoding-or-length")
  nativeDigest(body.sha256, 64, "body.sha256")
  const authority = nativeRecord(artifact.authority, "authority")
  nativeKeys(authority, ["scope", "basis"], "authority")
  if (authority.scope !== scope) throw new Error("native-authority-scope")
  nativeText(authority.basis, "authority.basis")
  if (artifact.validity !== "supported" && artifact.validity !== "blocked") throw new Error("native-validity")
  nativeStrings(artifact.gaps, "gaps", false)
  nativeStrings(artifact.evidence, "evidence", false)
  const inputs = nativeStrings(artifact.input_keys, "input_keys")
  if (!inputs.length) throw new Error("native-empty-inputs")
  for (const key of inputs) {
    if (!key.startsWith("file:") && !key.startsWith("members:")) throw new Error(`native-input-key: ${key}`)
    nativePath(key.slice(key.indexOf(":") + 1))
  }
  if (!Array.isArray(artifact.source_refs) || !artifact.source_refs.length) throw new Error("native-empty-source-refs")
  const paths = artifact.source_refs.map((value) => {
    const ref = nativeRecord(value, "source_ref")
    nativeKeys(ref, ["commit", "path", "git_blob_sha", "sha256"], "source_ref")
    nativeDigest(ref.commit, 40, "source_ref.commit")
    nativeDigest(ref.git_blob_sha, 40, "source_ref.git_blob_sha")
    nativeDigest(ref.sha256, 64, "source_ref.sha256")
    const path = nativePath(ref.path)
    if (!inputs.includes(`file:${path}`)) throw new Error(`native-source-without-input: ${path}`)
    return path
  })
  if (new Set(paths).size !== paths.length) throw new Error("native-duplicate-source")
  const recipe = nativeReference(artifact.recipe_ref)
  if (!inputs.includes(`file:${nativeReferencePath(recipe)}`)) throw new Error("native-recipe-without-input")
  nativeReference(artifact.producer_request_ref)
  nativeReference(artifact.producer_response_ref)
  for (const key of ["semantic_review_refs", "runtime_receipt_refs"]) {
    const values = artifact[key]
    if (!Array.isArray(values)) throw new Error(`native-reference-array: ${key}`)
    const refs = values.map((ref) => nativeReferenceKey(nativeReference(ref)))
    if (new Set(refs).size !== refs.length) throw new Error(`native-duplicate-reference: ${key}`)
    if (key === "semantic_review_refs" && refs.length < 2) throw new Error("native-semantic-review-evidence-missing")
  }
  nativeStrings(artifact.navigation, "navigation")
  if (!Array.isArray(artifact.build_dependencies)) throw new Error("native-build-dependencies")
  const dependencies = artifact.build_dependencies.map((value) => {
    const dependency = nativeRecord(value, "build_dependency")
    if (Object.hasOwn(dependency, "package_ref")) {
      nativeReference(dependency.package_ref)
      throw new Error("native-external-build-dependency-unsupported: existing ownership manifests resolve within one scope")
    }
    nativeKeys(dependency, ["key", "same_package"], "build_dependency")
    if (dependency.same_package !== true) throw new Error("native-dependency-kind")
    return nativeText(dependency.key, "dependency.key")
  })
  if (new Set(dependencies).size !== dependencies.length) throw new Error("native-duplicate-dependency")
}
