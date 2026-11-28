export * as ReviewFixPriorV2 from "./review-fix-prior"

import { Effect, Schema } from "effect"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewEngagementStoreV2 } from "../tools/review-engagement-store"
import { ReviewEngagementArtifactsV2 } from "./review-engagement-artifacts"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import { ReviewEvidenceValidationV2 } from "./review-engagement-artifact-validation"
import { ReviewEngagementReportV2 } from "./review-engagement-report"
import { ReviewFixAuthorityV2 } from "./review-fix-authority"
import { ReviewFixSchemaV2 } from "./review-fix-schema"

type Finding = ReviewFixSchemaV2.FixFinding["finding"]
export type Selected = ReviewFixSchemaV2.FixFinding & {
  readonly files: readonly string[]
  readonly native?: {
    readonly proof: ReviewEvidenceSchemaV2.Proof
    readonly recipe: typeof ReviewEvidenceSchemaV2.Recipe.Type
  }
}
type Prepared = ReturnType<typeof prepare>
const { canonical, digest } = ReviewEngagementReportV2
const { failure } = ReviewFixAuthorityV2

export function preflight(view: ReviewEngagementStoreV2.Terminal, profile: string, ids: readonly string[]) {
  return Effect.gen(function* () {
    const result = view.terminal.value
    if (result.status !== "completed" || !result.report || !result.source)
      return yield* failure("engagement-fix-prior-not-completed", "the original report has no completed findings")
    if (result.report.profile !== profile)
      return yield* failure("engagement-fix-profile-mismatch", "fix review must retain the original report profile")
    if (view.schema === "review-engagement-state-v1")
      return yield* failure("engagement-fix-prior-evidence-unavailable", "legacy-record")
    return yield* Effect.forEach(ids, (id) => {
      const matches = result.report?.findings.filter((entry) => entry.id === id && entry.status === "open") ?? []
      return matches.length === 1
        ? Effect.succeed(matches[0])
        : Effect.fail(failure("engagement-fix-finding-invalid", "the requested finding is absent or not open"))
    })
  })
}

export function load(repository: ReviewEngagementArtifactsV2.Repository, view: ReviewEngagementStoreV2.Terminal,
  inputHash: string, findings: readonly Finding[]) {
  return Effect.gen(function* () {
    const data = yield* repository.priorData(view)
    const prepared = yield* Effect.try({ try: () => prepare(view, inputHash, findings, data),
      catch: (error) => ReviewEvidenceSchemaV2.failure("corrupt", String(error)) })
    const imported = yield* Effect.try({ try: () => mergeArtifacts(prepared.artifacts, []),
      catch: (error) => error instanceof Tool.Failure ? error : ReviewEvidenceSchemaV2.failure("corrupt", String(error)) })
    const binding = ReviewFixAuthorityV2.validatedPrior(prepared.binding)
    for (const wrapper of prepared.wrappers) {
      const sha256 = yield* repository.storage.publish(wrapper.bytes, wrapper.descriptor.mime)
      if (sha256 !== wrapper.descriptor.sha256)
        return yield* ReviewEvidenceSchemaV2.failure("corrupt", "published predecessor wrapper differs")
    }
    return { ...prepared, binding, imported: new Map(imported.map((item) => [item.artifactID, item.bytes])) }
  })
}

export function prepare(view: ReviewEngagementStoreV2.Terminal, inputHash: string, findings: readonly Finding[],
  data: ReviewEngagementArtifactsV2.PriorData) {
  const source = view.terminal.value.source
  const report = view.terminal.value.report
  const catalog = data.context.final.catalog
  const tier = catalog.route.tiers.find((item) => item.id === report?.tier && item.built)
  if (!tier || !source || !report || view.schema === "review-engagement-state-v1")
    throw ReviewEvidenceSchemaV2.failure("corrupt", "predecessor tier or evidence is unavailable")
  const selected = findings.map((finding): Selected => {
    const evidence = finding.evidence
    const proof = evidence.kind === "tool" ? ReviewEvidenceValidationV2.qualifiedTool(data.context, finding) : undefined
    const recipe = proof ? data.context.recipes.get(proof.proofID) : undefined
    if (proof && (!recipe || proof.side !== "head" || proof.sourceSha256 !== source.sha256 ||
      !recipe.files.some((item) => item.path === finding.path)))
      throw ReviewEvidenceSchemaV2.failure("corrupt", "native predecessor recipe lacks exact authority")
    const files = [...new Set([finding.path, ...(evidence.kind === "quote" ? [evidence.path] : []),
      ...(recipe?.files.map((file) => file.path) ?? [])])].sort()
    if (files.some((path) => !source.files.some((file) => file.path === path)))
      throw ReviewEvidenceSchemaV2.failure("corrupt", "predecessor finding is outside captured files")
    return { finding, priorFindingSha256: digest(finding), files, ...(proof && recipe ? { native: { proof, recipe } } : {}) }
  })
  const priorReport = wrapper("fix-prior-report", Buffer.from(view.terminal.text))
  const priorReceipt = wrapper("fix-prior-receipt", data.bytes)
  const authority = wrapper("fix-prior-authority", Buffer.from(canonical(ReviewEngagementStoreV2.priorAuthority(view))))
  const wrappers = [priorReport, priorReceipt, authority]
  const binding = ReviewFixAuthorityV2.binding(inputHash, {
    policy: "fix-review-v1", reportID: view.terminal.value.reportID, receiptID: data.receiptID,
    receiptBytes: data.bytes.byteLength, priorStateSchema: view.schema, priorInputHash: view.identity.inputHash,
    priorSourceSha256: source.sha256, authoritySha256: authority.descriptor.sha256,
    profile: Schema.decodeUnknownSync(ReviewFixSchemaV2.Profile)(report.profile),
    executionTier: Schema.decodeUnknownSync(ReviewFixSchemaV2.Tier)(tier.id),
    tierSha256: digest(tier), catalogDigest: data.context.operation.catalogDigest,
    findings: selected.map((item) => ({ findingID: item.finding.id, findingSha256: item.priorFindingSha256 })),
    requiredFiles: [...new Set(selected.flatMap((item) => item.files))].sort(),
  })
  const artifacts = [...data.receipt.artifacts, ...wrappers.map((item) => item.descriptor)]
  return { source, selected, tier, routing: data.context.final.routing, binding, view, wrappers, artifacts,
    reference: { binding, reportArtifactID: priorReport.descriptor.artifactID, receiptArtifactID: priorReceipt.descriptor.artifactID,
      authorityArtifactID: authority.descriptor.artifactID, artifactIDs: data.receipt.artifacts.map((item) => item.artifactID).sort() } }
}

export function wrapper(kind: ReviewFixSchemaV2.FixArtifact["kind"], bytes: Uint8Array, mime = "application/json", uri?: string) {
  const value = { kind, sha256: ReviewEvidenceSchemaV2.hash(bytes), bytes: bytes.byteLength, mime, complete: true,
    ...(uri === undefined ? {} : { uri }) }
  return { bytes, descriptor: { ...value, artifactID: digest(value) } }
}

export function mergeArtifacts(first: readonly ReviewFixSchemaV2.FixArtifact[], second: readonly ReviewFixSchemaV2.FixArtifact[]) {
  const ordered = new Map<string, ReviewFixSchemaV2.FixArtifact>()
  for (const item of [...first, ...second]) {
    const existing = ordered.get(item.artifactID)
    if (existing && !ReviewEvidenceSchemaV2.same(existing, item))
      throw ReviewEvidenceSchemaV2.failure("corrupt", "shared artifact descriptor identity differs")
    if (item.bytes > ReviewEvidenceSchemaV2.limits.body) throw ReviewEvidenceSchemaV2.failure("bound-exceeded", "body")
    ordered.set(item.artifactID, item)
  }
  if (ordered.size > ReviewEvidenceSchemaV2.limits.artifacts)
    throw ReviewEvidenceSchemaV2.failure("bound-exceeded", "artifacts")
  if ([...ordered.values()].reduce((sum, item) => sum + item.bytes, 0) > ReviewEvidenceSchemaV2.limits.total)
    throw ReviewEvidenceSchemaV2.failure("bound-exceeded", "total")
  return [...ordered.values()].sort((a, b) => a.artifactID < b.artifactID ? -1 : a.artifactID > b.artifactID ? 1 : 0)
}

export type Loaded = Prepared & { readonly imported: ReadonlyMap<string, number> }
