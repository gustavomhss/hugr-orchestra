import { isOwnershipEvaluationContext, ownershipEvaluationLabel, sameOwnershipEvaluation } from "./evaluation.js"
import { isEvaluationOwnershipArtifact, isEvaluationOwnershipContract, isEvaluationOwnershipManifest, isEvaluationOwnershipReceipt, isEvaluationOwnershipReview } from "./shape.js"
import type { EvaluationOwnershipArtifact, EvaluationOwnershipContract, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, EvaluationOwnershipReview, OwnershipEvaluationContext } from "./types.js"
import { id } from "@atlas/kernel"
import type { StoreApi } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { OwnershipManifest, OwnershipContract, OwnershipReview, OwnershipArtifact, OwnershipIndex, OwnershipQuery, OwnershipRead, OwnershipReceipt, OwnershipRefusal, OwnershipResult } from "./types.js"
import {
  isOwnershipArtifact,
  isOwnershipBody,
  isOwnershipContract,
  isOwnershipManifest,
  isOwnershipNeed,
  isOwnershipReceipt,
  isOwnershipResult,
  isOwnershipReview,
} from "./shape.js"

/** Low-level CAS resolver; publication authority is supplied only by the existing governed adapter. */
export function readOwnership(
  store: StoreApi,
  manifestRef: Hash,
  query: OwnershipQuery,
  current: (key: string) => string | undefined,
  context?: OwnershipEvaluationContext,
): OwnershipRead {
  if (context !== undefined && !isOwnershipEvaluationContext(context)) return hold("ownership-phase", [manifestRef, "invalid-context"])
  const captured = context === undefined ? undefined : { ...context, evaluation: { ...context.evaluation } }
  const read = resolveOwnership(store, manifestRef, query, current, captured)
  return captured === undefined ? read : { ...read, evaluation: ownershipEvaluationLabel(captured, manifestRef) }
}

function resolveOwnership(
  store: StoreApi,
  manifestRef: Hash,
  query: OwnershipQuery,
  current: (key: string) => string | undefined,
  context: OwnershipEvaluationContext | undefined,
): OwnershipRead {
  const manifest = load(store, manifestRef, (value): value is OwnershipManifest | EvaluationOwnershipManifest =>
    context === undefined ? isOwnershipManifest(value) : isEvaluationOwnershipManifest(value))
  if ("kind" in manifest) return manifest
  if (context !== undefined && (manifest.value.version !== 2 ||
    !sameOwnershipEvaluation(manifest.value.evaluation, context.evaluation) ||
    manifest.value.evaluationCandidate !== context.evaluationCandidate || manifest.value.generation !== context.generation))
    return hold("ownership-phase", [manifestRef])
  if (query.scope !== manifest.value.scope) return hold("ownership-scope", [query.scope])
  if (!Number.isSafeInteger(query.maxBytes) || query.maxBytes < 1) return hold("ownership-limit", [])
  if ((query.need === undefined) === (query.key === undefined) ||
    (query.need !== undefined && !isOwnershipNeed(query.need))) return hold("ownership-selection", [])
  const selected = query.key ?? manifest.value.roots[query.need!]
  if (!selected) return hold("ownership-selection", [query.need ?? ""])
  const entries = new Map(manifest.value.entries.map((entry) => [entry.key, entry.artifact]))
  const visiting = new Set<string>()
  type Checked = { artifact: OwnershipArtifact | EvaluationOwnershipArtifact; result: OwnershipResult; ref: Hash; body: string; dependencies: OwnershipReceipt["dependencies"] }
  const checked = new Map<string, Checked>()

  const inspect = (key: string): Checked | OwnershipRefusal => {
    const ref = entries.get(key)
    if (!ref) return hold("ownership-missing", [key])
    const artifact = load(store, ref, (value): value is OwnershipArtifact | EvaluationOwnershipArtifact =>
      context === undefined ? isOwnershipArtifact(value) : isEvaluationOwnershipArtifact(value))
    if ("kind" in artifact) return artifact
    if (context !== undefined && (artifact.value.version !== 2 ||
      !sameOwnershipEvaluation(artifact.value.evaluation, context.evaluation) ||
      artifact.value.evaluationCandidate !== context.evaluationCandidate)) return hold("ownership-phase", [key, ref])
    if (artifact.value.key !== key || artifact.value.scope !== query.scope) return hold("ownership-scope", [key])
    const result = load(store, artifact.value.result, isOwnershipResult)
    if ("kind" in result) return result
    if (result.value.authority.scope !== query.scope) return hold("ownership-scope", [key])
    if (result.value.validity !== "supported") return hold("ownership-blocked", [key, ...result.value.gaps])
    const receipt = load(store, artifact.value.receipt, (value): value is OwnershipReceipt | EvaluationOwnershipReceipt =>
      context === undefined ? isOwnershipReceipt(value) : isEvaluationOwnershipReceipt(value))
    if ("kind" in receipt) return receipt
    if (context !== undefined && (receipt.value.version !== 2 ||
      !sameOwnershipEvaluation(receipt.value.evaluation, context.evaluation) ||
      receipt.value.evaluationCandidate !== context.evaluationCandidate)) return hold("ownership-phase", [key, artifact.value.receipt])
    const contract = load(store, receipt.value.contract, (value): value is OwnershipContract | EvaluationOwnershipContract =>
      context === undefined ? isOwnershipContract(value) : isEvaluationOwnershipContract(value))
    if ("kind" in contract) return contract
    if (context !== undefined && (contract.value.version !== 2 ||
      !sameOwnershipEvaluation(contract.value.evaluation, context.evaluation))) return hold("ownership-phase", [key, receipt.value.contract])
    const inputHash = id({ inputs: receipt.value.inputs, dependencies: receipt.value.dependencies })
    const reviewers = new Set<string>()
    for (const reviewRef of receipt.value.reviews) {
      const review = load(store, reviewRef, (value): value is OwnershipReview | EvaluationOwnershipReview =>
        context === undefined ? isOwnershipReview(value) : isEvaluationOwnershipReview(value))
      if ("kind" in review) return review
      if (context !== undefined && (review.value.version !== 2 ||
        !sameOwnershipEvaluation(review.value.evaluation, context.evaluation) ||
        review.value.evaluationCandidate !== context.evaluationCandidate)) return hold("ownership-phase", [key, reviewRef])
      if (review.value.verdict !== "pass" || review.value.contract !== receipt.value.contract ||
        review.value.inputs !== inputHash || review.value.result !== artifact.value.result ||
        reviewers.has(review.value.reviewer) || review.value.criteria.length !== contract.value.criteria.length ||
        !contract.value.criteria.every((criterion) => review.value.criteria.includes(criterion))) return hold("ownership-review", [key, reviewRef])
      reviewers.add(review.value.reviewer)
    }
    if (!query.historical) {
      for (const input of receipt.value.inputs) {
        const version = current(input.key)
        if (version === undefined) return hold("ownership-input-unavailable", [key, input.key])
        if (version !== input.version) return hold("ownership-input-changed", [key, input.key])
      }
    }
    const body = load(store, result.value.body, isOwnershipBody)
    if ("kind" in body) return body
    const decoded = decode(body.value.bytes)
    if (decoded === undefined) return hold("malformed-ownership", [key, "body-utf8"])
    return { artifact: artifact.value, result: result.value, ref, body: decoded, dependencies: receipt.value.dependencies }
  }

  // An explicit traversal stack avoids a deep, finite dependency chain overflowing the process stack.
  // Evaluation validates every required entry, including disconnected entries, before serving any body.
  const pending: { key: string; leave?: Checked }[] = context === undefined
    ? [{ key: selected }] : [...entries.keys()].reverse().map((key) => ({ key }))
  while (pending.length > 0) {
    const entry = pending.pop()!
    if (entry.leave !== undefined) {
      for (const dependency of entry.leave.dependencies) {
        if (checked.get(dependency.key)?.artifact.result !== dependency.result)
          return hold("ownership-dependency-changed", [entry.key, dependency.key])
      }
      visiting.delete(entry.key)
      checked.set(entry.key, entry.leave)
      continue
    }
    if (checked.has(entry.key)) continue
    if (visiting.has(entry.key)) return hold("ownership-cycle", [entry.key])
    const value = inspect(entry.key)
    if ("kind" in value) return value
    visiting.add(entry.key)
    pending.push({ key: entry.key, leave: value })
    value.dependencies.slice().reverse().forEach((dependency) => pending.push({ key: dependency.key }))
  }
  const selectedArtifact = checked.get(selected)!
  if (query.need !== undefined && selectedArtifact.artifact.need !== query.need)
    return hold("ownership-selection", [selected, query.need, selectedArtifact.artifact.need])
  const content = query.section === undefined ? selectedArtifact.body : section(selectedArtifact.body, query.section)
  if (content === undefined) return hold("ownership-section", [selected, query.section ?? ""])
  if (new TextEncoder().encode(content).length > query.maxBytes) return hold("ownership-limit", [selected])
  return {
    kind: "ready", manifest: manifestRef, artifact: selectedArtifact.ref, result: selectedArtifact.artifact.result,
    receipt: selectedArtifact.artifact.receipt, key: selected, scope: query.scope, title: selectedArtifact.artifact.title,
    layer: selectedArtifact.artifact.layer, need: selectedArtifact.artifact.need,
    navigation: selectedArtifact.artifact.navigation, dependencies: selectedArtifact.dependencies.map((dependency) => dependency.key),
    body: content, historical: query.historical === true, checked: [...checked.keys()],
    knowledge: {
      authority: selectedArtifact.result.authority, validity: selectedArtifact.result.validity,
      gaps: selectedArtifact.result.gaps, evidence: selectedArtifact.result.evidence,
    },
  }
}

/** Metadata stays small; verifying local CAS body bytes is not reported as a zero-body-read server path. */
export function indexOwnership(
  store: StoreApi,
  manifest: Hash,
  query: Pick<OwnershipQuery, "scope" | "need">,
  current: (key: string) => string | undefined,
  context?: OwnershipEvaluationContext,
): OwnershipIndex {
  const read = readOwnership(store, manifest, { ...query, maxBytes: Number.MAX_SAFE_INTEGER }, current, context)
  if (read.kind === "hold") return read
  return {
    kind: "index", manifest: read.manifest, artifact: read.artifact, result: read.result, receipt: read.receipt,
    key: read.key, scope: read.scope, title: read.title, layer: read.layer, need: read.need,
    sections: headings(read.body).filter((heading) => heading.depth === 2).map((heading) => heading.text),
    navigation: read.navigation, dependencies: read.dependencies, bodyBytes: new TextEncoder().encode(read.body).length,
    bodiesReturned: false, bodyBytesVerified: true, checked: read.checked,
    ...(read.evaluation === undefined ? {} : { evaluation: read.evaluation }),
  }
}

function load<T>(store: StoreApi, ref: Hash, matches: (value: unknown) => value is T): { value: T } | OwnershipRefusal {
  const value = store.get(ref)
  if (value === undefined) return hold("ownership-missing", [ref])
  if (!matches(value)) return hold("malformed-ownership", [ref])
  if (id(value) !== ref) return hold("ownership-integrity", [ref])
  return { value }
}

function hold(reason: OwnershipRefusal["reason"], evidence: readonly string[]): OwnershipRefusal {
  return { kind: "hold", reason, evidence }
}

function decode(bytes: readonly number[]): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new Uint8Array(bytes))
  } catch {
    return undefined
  }
}

function section(body: string, heading: string): string | undefined {
  const entries = headings(body)
  const starts = entries.flatMap((entry, index) => entry.depth === 2 && entry.text === heading ? [index] : [])
  if (starts.length !== 1) return undefined
  const start = starts[0]!
  return body.slice(entries[start]!.offset, entries[start + 1]?.offset)
}

function headings(body: string) {
  const state: { offset: number; fence?: string } = { offset: 0 }
  return body.split(/(?<=\n)/).flatMap((line) => {
    const offset = state.offset
    state.offset += line.length
    const fence = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line)
    if (state.fence !== undefined) {
      if (fence && fence[1]![0] === state.fence[0] && fence[1]!.length >= state.fence.length && !fence[2]!.trim())
        delete state.fence
      return []
    }
    if (fence && !(fence[1]![0] === "`" && fence[2]!.includes("`"))) {
      state.fence = fence[1]!
      return []
    }
    const heading = /^ {0,3}(#{1,2})[\t ]+(.+?)(?:[\t ]+#+)?[\t ]*(?:\r?\n)?$/.exec(line)
    return heading ? [{ depth: heading[1]!.length, text: heading[2]!, offset }] : []
  })
}
