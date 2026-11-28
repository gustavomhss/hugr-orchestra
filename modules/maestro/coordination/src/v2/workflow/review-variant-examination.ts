export * as ReviewVariantExaminationV2 from "./review-variant-examination"

import type { ReviewCatalog } from "@orchestra/core/review/catalog"
import type { ReviewRouting } from "@orchestra/core/review/routing"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewResultV2 } from "../governance/review-result"
import { ReviewCandidatesV2 } from "./review-candidates"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import { ReviewEvidenceValidationV2 } from "./review-engagement-artifact-validation"
import type { ReviewEngagementEvidenceV2 } from "./review-engagement-evidence"
import { ReviewFanoutSupportV2 } from "./review-fanout-support"
import { ReviewVariantSchemaV2 } from "./review-variant-schema"
import { ReviewVerdictV2 } from "./review-verdict"

export type Child = { readonly key: string; readonly role: "lead" | "lens" | "verifier"; readonly id: string }
export type Context = {
  readonly namespace: string
  readonly inputHash: string
  readonly source: ReviewEngagementEvidenceV2.Prepared
  readonly children: readonly Child[]
  readonly catalog: ReviewCatalog.Catalog
  readonly routing: ReviewRouting.Record
  readonly tier: ReviewCatalog.Catalog["route"]["tiers"][number]
  readonly analysis: ReviewEvidenceValidationV2.AnalysisContext
  readonly regions: readonly ReviewVariantSchemaV2.CapturedRegion[]
  readonly replies: readonly ReviewVariantSchemaV2.NativeReply[]
}
export type Candidate = Pick<ReviewVariantSchemaV2.SeedFinding, "id" | "path" | "line" | "endLine" | "class" | "severity">
export type IndexedVerdict = { readonly index: number; readonly raw: ReviewResultV2.Verdict; readonly value: ReviewResultV2.Verdict }

/** New stages reject a foreign class/candidate or duplicate before any result is admitted. */
export function parseVerifier(text: string, defectClass: string,
  candidates: readonly { readonly id: string; readonly offered: readonly string[] }[]): {
    readonly parsed?: ReviewResultV2.VerifierReturn; readonly results: readonly IndexedVerdict[] } {
  const parsed = ReviewResultV2.parseVerifier(ReviewFanoutSupportV2.block(text, "review-verify"))
  if (!parsed) return { results: [] }
  const ids = new Set(candidates.map((candidate) => candidate.id))
  if (parsed.class !== defectClass || ids.size !== candidates.length || parsed.results.length > candidates.length ||
    new Set(parsed.results.map((result) => result.candidate)).size !== parsed.results.length ||
    parsed.results.some((result) => !ids.has(result.candidate))) return { parsed, results: [] }
  return { parsed, results: parsed.results.map((raw, index) => ({ index, raw,
    value: ReviewVerdictV2.validate(raw, candidates.find((candidate) => candidate.id === raw.candidate)?.offered ?? []) })) }
}

export function offered(context: Pick<Context, "catalog" | "routing" | "tier">,
  candidate: Pick<Candidate, "class" | "severity">): readonly string[] {
  return ReviewCandidatesV2.options(context.catalog, context.tier, context.routing, candidate)
    .map((option) => option.id).filter((id) => !id.startsWith("probe:"))
}

/** Validates host-observed reply identity, never reconstructs an assistant turn from prose. */
export function validateReply(context: Pick<Context, "namespace" | "inputHash" | "children">,
  reply: ReviewVariantSchemaV2.NativeReply): void {
  requireProof(reply.sessionID === ReviewVariantSchemaV2.childID(context.namespace, reply.childKey, reply.role) &&
    context.children.some((child) => child.id === reply.sessionID && child.key === reply.childKey && child.role === reply.role),
  "reply belongs to an unadmitted child")
  requireProof(reply.promptMessageID === ReviewVariantSchemaV2.promptID(context.namespace, reply.sessionID, reply.turnKey) &&
    reply.textSha256 === ReviewEvidenceSchemaV2.hash(reply.text) && reply.replyID === ReviewVariantSchemaV2.replyID(context.inputHash, reply),
  "reply text or native prompt identity differs")
}

/** Partial regions bind their observed blob hash; they do not purport to re-create a full Git blob. */
export function validateRegion(context: Pick<Context, "source">, region: ReviewVariantSchemaV2.CapturedRegion): void {
  const file = context.source.files.find((file) => file.path === region.path)
  requireProof(file && file.oid === region.oid && file.size <= 4 * 1024 * 1024 &&
    region.sourceSha256 === context.source.sha256 && Number.isSafeInteger(region.startLine) && Number.isSafeInteger(region.endLine) &&
    region.startLine > 0 && region.endLine >= region.startLine && region.endLine - region.startLine < 400 &&
    !region.text.includes("\0") && Buffer.byteLength(region.text) <= file.size && region.text.split("\n").length === region.endLine - region.startLine + 1 &&
    region.text.split("\n").some((line) => line.trim() !== "") && region.textSha256 === ReviewEvidenceSchemaV2.hash(region.text) &&
    region.regionID === ReviewVariantSchemaV2.regionID(region), "captured examination region differs")
}

export function validateExamination(context: Context, candidate: Candidate,
  examination: ReviewVariantSchemaV2.Examination): ReviewResultV2.Verdict {
  const reply = context.replies.find((reply) => reply.replyID === examination.replyID)
  requireProof(reply && reply.role === "verifier" && reply.sessionID === examination.verifierSessionID,
    "examination has no independent native reply")
  validateReply(context, reply)
  const initial = reply.childKey === `verify:${candidate.class}` && reply.turnKey === "verify"
  const variant = /^variant:([123]):verify:/.exec(reply.childKey)
  requireProof(initial || variant && reply.childKey === `variant:${variant[1]}:verify:${candidate.class}` &&
    reply.turnKey === `variant:${variant[1]}:verify`, "examination belongs to another native stage")
  if (variant) requireProof(candidate.id.startsWith(`V${variant[1]}-`), "variant examination candidate belongs to another generation")
  const region = context.regions.find((region) => region.regionID === examination.regionID)
  requireProof(region && region.path === candidate.path && region.startLine === candidate.line &&
    region.endLine === (candidate.endLine ?? candidate.line), "examination has no exact candidate region")
  validateRegion(context, region)
  requireProof(context.catalog.classes.some((entry) => entry.id === candidate.class) &&
    ReviewVariantSchemaV2.same(examination.offered, offered(context, candidate)), "examination offered rungs differ from the pinned catalog")
  const parsed = ReviewResultV2.parseVerifier(ReviewFanoutSupportV2.block(reply.text, "review-verify"))
  requireProof(parsed && parsed.class === candidate.class && Number.isSafeInteger(examination.candidateCap) && examination.candidateCap > 0 &&
    examination.candidateCap <= Math.min(variant ? 4 : Number.MAX_SAFE_INTEGER, context.tier.budget.candidatesPerVerifier) &&
    Number.isSafeInteger(examination.verdictIndex) && examination.verdictIndex >= 0 && examination.verdictIndex < examination.candidateCap && examination.verdictIndex < parsed.results.length &&
    ReviewVariantSchemaV2.same(parsed.results[examination.verdictIndex], examination.rawVerdict) &&
    examination.rawVerdict.candidate === candidate.id && examination.verdict.candidate === candidate.id,
  "examination is not the admitted indexed verifier result")
  const verdict = ReviewVerdictV2.validate(examination.rawVerdict, examination.offered)
  requireProof(ReviewVariantSchemaV2.same(verdict, examination.verdict), "examination normalized verdict differs")
  if (verdict.state === "confirmed" && verdict.evidence.kind === "quote") {
    const quote = context.regions.find((region) => region.regionID === examination.quoteRegionID)
    requireProof(quote && quote.path === verdict.evidence.path && quote.startLine === verdict.evidence.startLine &&
      quote.endLine === verdict.evidence.endLine, "quote evidence has no exact captured supporting region")
    validateRegion(context, quote)
  } else requireProof(examination.quoteRegionID === undefined, "non-quote verdict has an unrelated supporting region")
  return verdict
}

/** Used by the initial barrier and every newly confirmed seed before another generation is reserved. */
export function qualifySeed(context: Context, finding: ReviewVariantSchemaV2.SeedFinding,
  examination: ReviewVariantSchemaV2.Examination): ReviewVariantSchemaV2.Seed {
  const verdict = validateExamination(context, finding, examination)
  requireProof(examination.rawVerdict.state === "confirmed" && verdict.state === "confirmed" &&
    verdict.evidence.kind !== "probe" && !finding.rung.startsWith("probe:") && !finding.rungs.some((rung) => rung.startsWith("probe:")),
  "seed has no independent settled proof")
  requireProof(finding.rung === verdict.rung && ReviewVariantSchemaV2.same(finding.history, verdict.history) &&
    ReviewVariantSchemaV2.same(finding.rungs, verdict.history.map((rung) => rung.option)) &&
    ReviewVariantSchemaV2.same(finding.evidence, verdict.evidence) &&
    finding.rule === (verdict.evidence.kind === "tool" ? verdict.evidence.rule : finding.class), "seed differs from its verified finding")
  // An ordinary lens may raise a legitimate out-of-lens observation; its host-assigned lens remains its identity.
  requireProof(context.catalog.lenses.some((lens) => lens.id === finding.lens), "seed lens is absent from the pinned catalog")
  const proof = finding.evidence.kind === "tool" ? ReviewEvidenceValidationV2.qualifiedTool(context.analysis, finding) : undefined
  return { seedID: ReviewVariantSchemaV2.seedID(context.source.sha256, finding), finding, examination,
    ...(proof ? { toolProofID: proof.proofID } : {}) }
}

function requireProof(value: unknown, detail: string): asserts value {
  if (!value) throw new Tool.Failure({ message: `engagement-report-invalid: ${detail}`, metadata: { reason: "engagement-report-invalid" } })
}
