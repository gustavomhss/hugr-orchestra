export * as ReviewFixValidationV2 from "./review-fix-validation"

import { Schema } from "effect"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import { ReviewEvidenceValidationV2 } from "./review-engagement-artifact-validation"
import type { ReviewEngagementReportV2 } from "./review-engagement-report"
import type { ReviewFixAuthorityV2 } from "./review-fix-authority"
import { ReviewFixJudgmentV2 } from "./review-fix-judgment"
import type { ReviewFixPriorV2 } from "./review-fix-prior"
import { ReviewFixRetestV2 } from "./review-fix-retest"
import type { ReviewFixSchemaV2 } from "./review-fix-schema"
import { ReviewScopedProbeEvidenceV2 } from "./review-scoped-probe-evidence"
import { ReviewVariantSchemaV2 } from "./review-variant-schema"

export type Body = (id: string, kind?: (typeof ReviewFixSchemaV2.FixArtifact.Type)["kind"]) => Uint8Array
const ensure: typeof ReviewEvidenceSchemaV2.require = ReviewEvidenceSchemaV2.require
const { same, digest, hash } = ReviewEvidenceSchemaV2

export function validate(receipt: ReviewFixSchemaV2.FixReceipt, value: ReviewFixSchemaV2.FixResult,
  source: ReviewEngagementReportV2.Source, authority: ReviewFixAuthorityV2.FixAuthority,
  previous: ReturnType<typeof ReviewFixPriorV2.prepare>, body: Body): void {
  ensure(same(authority.source ?? null, source) && same(authority.fix.prior ?? null, previous.binding) && same(value.prior ?? null, previous.binding), "fix source or prior authority differs")
  ensure(same(source.files.map((file) => file.path), previous.binding.requiredFiles), "fix source exceeds prior authority")
  const artifacts = receipt.artifacts.filter((artifact): artifact is ReviewEvidenceSchemaV2.Artifact =>
    artifact.kind !== "fix-prior-report" && artifact.kind !== "fix-prior-receipt" && artifact.kind !== "fix-prior-authority")
  const bodies = new Map(artifacts.map((artifact) => [artifact.artifactID, body(artifact.artifactID)]))
  const used = new Set(previous.artifacts.map((artifact) => artifact.artifactID))
  const artifact = (id: string, kind: ReviewEvidenceSchemaV2.Artifact["kind"]) => {
    const found = artifacts.find((item) => item.artifactID === id)
    ensure(found && found.kind === kind, "referenced fix artifact differs")
    body(id, kind)
    used.add(id)
    return found
  }
  ensure(receipt.operations.filter((item) => item.kind === "analysis").length === 1 &&
    receipt.operations.filter((item) => item.kind === "code").length <= ReviewEvidenceSchemaV2.limits.code &&
    new Set(receipt.operations.map((item) => item.operationID)).size === receipt.operations.length, "fix operation count differs")
  ensure(new Set(authority.children.map((child) => child.id)).size === authority.children.length &&
    new Set(authority.children.map((child) => child.key)).size === authority.children.length &&
    authority.children.some((child) => child.id === authority.identity.leadID && child.key === "lead" && child.role === "lead"), "fix child admissions differ")
  for (const operation of receipt.operations) {
    ensure(operation.sourceSha256 === source.sha256, "fix operation source differs")
    if (operation.kind === "code") {
      ensure(operation.operationID === ReviewEvidenceSchemaV2.codeID(receipt.inputHash, operation) &&
        authority.children.some((child) => child.id === operation.sessionID) && operation.nativeSettlement.status === "completed" &&
        operation.nativeSettlement.messageID === operation.assistantMessageID, "CODE admission or native settlement differs")
      const decoded = operation.name === "code_query" ? Schema.decodeUnknownSync(CodeIndex.CodeQuery)(operation.input, ReviewEvidenceSchemaV2.strict)
        : operation.name === "code_search" ? Schema.decodeUnknownSync(CodeIndex.SearchInput)(operation.input, ReviewEvidenceSchemaV2.strict)
        : Schema.decodeUnknownSync(CodeIndex.LocateInput)(operation.input, ReviewEvidenceSchemaV2.strict)
      ensure(same(decoded, operation.input) && (operation.name === "code_locate" ? operation.snapshots.length <= 1 : operation.snapshots.length === 0), "CODE input or snapshots differ")
      for (const [index, evidence] of [operation.evidence, ...operation.snapshots].entries()) {
        const descriptor = artifact(evidence.artifactID, index === 0 ? "code-result" : "code-snapshot")
        ensure(descriptor.uri === evidence.uri && descriptor.sha256 === evidence.sha256, "CODE retained reference differs")
      }
      continue
    }
    artifact(operation.resultArtifactID, "analysis-result")
    artifact(operation.retainedArtifactID, "analysis-retained")
    artifact(operation.debtArtifactID, "analysis-debt")
    for (const check of operation.checks) {
      ensure(new Set(check.artifactIDs).size === check.artifactIDs.length && new Set(check.proofIDs).size === check.proofIDs.length, "duplicate analyzer references")
      if (check.pack !== "oxlint") ensure(check.status === "not-run" && check.reason === "engagement-evidence-scope-unqualified" && !check.workspaceExecuted && !check.uri && !check.artifactIDs.length && !check.proofIDs.length, "unqualified analyzer produced evidence")
      for (const id of check.proofIDs) ensure(receipt.hostProofs.some((proof) => proof.proofID === id && proof.analysisOperationID === operation.operationID && check.pack === "oxlint"), "foreign native proof reference")
      for (const id of check.artifactIDs) ensure(receipt.hostProofs.some((proof) => proof.analysisOperationID === operation.operationID && ReviewEvidenceValidationV2.proofArtifacts(proof).includes(id)), "foreign native artifact reference")
      if (check.uri) ensure(check.artifactIDs.some((id) => artifacts.find((item) => item.artifactID === id)?.uri === check.uri), "analyzer URI is not retained")
      if (check.status !== "pass" && check.status !== "fail") ensure(receipt.notExamined.some((gap) => gap.item === `analyze:${check.id}` && gap.reason === (check.reason ?? check.status)), "analyzer limitation is missing")
    }
  }
  for (const proof of receipt.hostProofs) {
    for (const [id, kind] of [[proof.inputsArtifactID, "analyzer-inputs"], [proof.configArtifactID, "analyzer-config"], [proof.recipeArtifactID, "analyzer-recipe"], [proof.pathMapArtifactID, "analyzer-path-map"], [proof.stdoutArtifactID, "analyzer-stdout"], [proof.stderrArtifactID, "analyzer-stderr"]] as const) artifact(id, kind)
  }
  const analysis = ReviewEvidenceValidationV2.analysisContext({ inputHash: receipt.inputHash, source, finalAnalysisOperationID: receipt.finalAnalysisOperationID,
    operations: receipt.operations, artifacts, hostProofs: receipt.hostProofs }, bodies)
  ReviewEvidenceValidationV2.validateCode(receipt.operations, source, body)
  ensure(analysis.operation.catalogDigest === previous.binding.catalogDigest && digest(previous.tier) === previous.binding.tierSha256 &&
    same(analysis.final.catalog.route.tiers.find((tier) => tier.id === previous.tier.id && tier.built) ?? null, previous.tier) &&
    same(analysis.final.routing, previous.routing), "fix retained catalog, tier or routing differs")
  ensure(receipt.citations.length === value.citations.length, "fix citation count differs")
  for (const [index, citation] of receipt.citations.entries()) {
    const expected = value.citations[index]
    const descriptor = artifact(citation.artifactID, "citation")
    ensure(citation.uri === expected.uri && descriptor.uri === expected.uri && descriptor.sha256 === expected.sha256 &&
      Buffer.from(body(citation.artifactID)).equals(Buffer.from(expected.text)), "fix citation differs")
  }
  const capturedHashes = new Map<string, string>()
  for (const region of receipt.regions) {
    const old = capturedHashes.get(region.path)
    ensure(old === undefined || old === region.blobSha256, "fix captured blob hashes differ")
    capturedHashes.set(region.path, region.blobSha256)
  }
  for (const proof of receipt.hostProofs) {
    const inputs = Schema.decodeUnknownSync(ReviewEvidenceSchemaV2.Inputs)(ReviewEvidenceSchemaV2.json(body(proof.inputsArtifactID, "analyzer-inputs")), ReviewEvidenceSchemaV2.strict)
    for (const file of inputs.files) ensure(!capturedHashes.has(file.path) || capturedHashes.get(file.path) === file.sha256, "fix region differs from native input")
  }
  for (const left of receipt.regions) for (const right of receipt.regions) {
    if (left.path !== right.path || left.regionID >= right.regionID) continue
    const start = Math.max(left.startLine, right.startLine)
    const end = Math.min(left.endLine, right.endLine)
    if (start <= end) ensure(same(left.text.split("\n").slice(start - left.startLine, end - left.startLine + 1), right.text.split("\n").slice(start - right.startLine, end - right.startLine + 1)), "overlapping fix regions differ")
  }
  for (const citation of value.citations) ensure(receipt.regions.some((region) => citation.path === region.path && citation.oid === region.oid && citation.startLine === region.startLine && citation.endLine === region.endLine && citation.text === region.text && citation.sha256 === region.textSha256), "fix citation has no captured region")
  const scoped = ReviewEvidenceValidationV2.scopedProofs(receipt.scopedProbes, source, artifacts, body)
  const usedScoped = new Set<string>()
  const selected = ReviewFixJudgmentV2.sort(previous.selected)
  const cap = previous.tier.budget.verifiers
  const usedRegions = new Set<string>()
  const usedReplies = new Set<string>()
  const usedExaminations = new Set<string>()
  const usedObservations = new Set<string>()
  const verifierChildren = new Set<string>()
  for (const [index, item] of selected.entries()) {
    const findingID = item.finding.id
    const disposition = value.dispositions.find((entry) => entry.findingID === findingID)
    ensure(disposition && disposition.priorFindingSha256 === item.priorFindingSha256, "fix disposition identity differs")
    if (index >= cap) {
      ensure(disposition.disposition === "not-examined" && disposition.reason === (cap === 0 ? "independent-verification-unavailable" : "verification-budget"), "fix selection budget differs")
      continue
    }
    if (disposition.disposition === "not-examined" && disposition.reason === "region-unavailable") continue
    const probe = item.probe
    const current = probe ? scoped.find((result) => result.candidate === probe.candidate && result.path === probe.path) : undefined
    if (probe && !current) {
      ensure(disposition.disposition === "not-examined" && disposition.reason === "probe-unqualified", "scoped probe qualified no retest")
      continue
    }
    if (current) usedScoped.add(current.proofID)
    const observation = probe && current ? ReviewScopedProbeEvidenceV2.observe(receipt.inputHash, findingID, probe, current)
      : item.native ? ReviewFixRetestV2.observe({ inputHash: receipt.inputHash, findingID, priorProof: item.native.proof,
        priorRecipe: item.native.recipe, analysis: analysis.operation, hostProofs: receipt.hostProofs, bodies }) : undefined
    if (probe) ensure(observation, "retained scoped probe recipe is incompatible")
    if (typeof observation === "string") {
      ensure(disposition.disposition === "not-examined" && disposition.reason === observation, "native availability disposition differs")
      continue
    }
    ensure(disposition.disposition !== "not-examined", "eligible finding was not examined")
    const observations = receipt.observations.filter((entry) => entry.findingID === findingID)
    ensure(same(observations, observation ? [observation] : []), "offered native observation differs")
    for (const entry of observations) usedObservations.add(entry.observationID)
    const examinations = receipt.examinations.filter((entry) => entry.findingID === findingID)
    ensure(examinations.length === 1 && examinations[0].examinationID === disposition.examinationID, "fix examination is missing or duplicated")
    const examination = examinations[0]
    usedExaminations.add(examination.examinationID)
    const key = `fix:verify:${findingID}`
    const child = ReviewVariantSchemaV2.childID(authority.identity.key, key, "verifier")
    ensure(child !== authority.identity.leadID && authority.children.some((entry) => entry.id === child && entry.key === key && entry.role === "verifier"), "fix verifier is not admitted")
    verifierChildren.add(child)
    const matches = receipt.replies.filter((entry) => entry.replyID === examination.replyID)
    ensure(matches.length === 1, "fix native reply is missing or duplicated")
    const reply = matches[0]
    ensure(reply.sessionID === child && reply.role === "verifier" && reply.childKey === key && reply.turnKey === "fix:verify" &&
      reply.promptMessageID === ReviewVariantSchemaV2.promptID(authority.identity.key, child, reply.turnKey), "fix reply native identity differs")
    usedReplies.add(reply.replyID)
    const regions = examination.currentRegionIDs.map((id) => {
      const matches = receipt.regions.filter((entry) => entry.regionID === id)
      ensure(matches.length === 1, "fix current region is missing or duplicated")
      const region = matches[0]
      const file = source.files.find((entry) => entry.path === region.path)
      ensure(file && file.size <= 4 * 1024 * 1024 && same(region, ReviewFixJudgmentV2.region(source, { path: region.path, oid: region.oid, sha256: region.blobSha256,
        startLine: region.startLine, endLine: region.endLine, text: region.text })), "fix captured region differs")
      usedRegions.add(id)
      return region
    })
    ensure(ReviewFixJudgmentV2.regions(item).every((range) => regions.some((region) => region.path === range.path && region.startLine === range.startLine && region.endLine === range.endLine)), "fix initial region is missing")
    const expected = ReviewFixJudgmentV2.examine({ inputHash: receipt.inputHash, source, priorSource: previous.source,
      finding: item, relatedFiles: item.files, regions, reply, observations })
    ensure(same(expected, examination) && disposition.disposition === expected.disposition && disposition.reason === expected.reason, "fix judgment differs from native reply")
  }
  ensure(usedRegions.size === receipt.regions.length && usedReplies.size === receipt.replies.length &&
    usedExaminations.size === receipt.examinations.length && usedObservations.size === receipt.observations.length, "fix receipt contains unused judgment facts")
  ensure(authority.children.filter((child) => child.role !== "lead").every((child) => verifierChildren.has(child.id)), "fix receipt contains an unrelated child")
  ensure(usedScoped.size === scoped.length, "fix receipt retains an unused scoped probe")
  for (const reference of receipt.scopedProbes ?? []) artifact(reference.artifactID, "scoped-probe")
  ensure(used.size === receipt.artifacts.length && receipt.artifacts.every((item) => used.has(item.artifactID)), "fix receipt contains unused artifacts")
}
