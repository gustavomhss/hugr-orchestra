export * as ReviewFixAuthorityV2 from "./review-fix-authority"

import { Schema } from "effect"
import { Tool } from "@orchestra/core/tool/tool"
import type { ReviewEngagementStoreV2 } from "../tools/review-engagement-store"
import type { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import { ReviewEngagementReportV2 } from "./review-engagement-report"
import { ReviewFixSchemaV2 } from "./review-fix-schema"

export type FixAuthority = Pick<ReviewEngagementStoreV2.FixRunning, "identity" | "input" | "model" | "budget" | "source" | "children" | "fix">
const { canonical, digest } = ReviewEngagementReportV2
const priors = new WeakSet<ReviewFixSchemaV2.PriorBinding>()
const seals = new WeakMap<ReviewFixSchemaV2.Sealed, { readonly text: string; readonly authority: string }>()

export const failure = (reason: string, detail: string, extra?: { readonly notExamined: ReviewFixSchemaV2.FixResult["notExamined"] }) =>
  new Tool.Failure({ message: `${reason}: ${detail}`, metadata: { reason, ...extra } })
const corrupt = (detail: string) => failure("engagement-evidence-corrupt", detail)

export function binding(inputHash: string, value: Omit<ReviewFixSchemaV2.PriorBinding, "bindingID">) {
  return { ...value, bindingID: digest({ schema: "review-engagement-fix-prior-binding-v1", inputHash, ...value }) }
}

// Call only after verifying the full originating report and all of its receipt bodies.
export function validatedPrior(prior: ReviewFixSchemaV2.PriorBinding) {
  const checked = Schema.decodeUnknownSync(ReviewFixSchemaV2.PriorBinding)(prior)
  priors.add(checked)
  return checked
}

export function assertPrior(prior: ReviewFixSchemaV2.PriorBinding) {
  if (!priors.has(prior)) throw corrupt("predecessor was not validated by the host")
}

const authorityProjection = (value: FixAuthority) => ({
  identity: value.identity, input: value.input, budget: value.budget, children: value.children, fix: value.fix,
  ...(value.model === undefined ? {} : { model: value.model }),
  ...(value.source === undefined ? {} : { source: value.source }),
})

// The collector verifies published bytes and their whole closure before invoking this seal.
export function seal(receiptID: string, bytes: number, result: ReviewFixSchemaV2.Stored, authority: FixAuthority) {
  const sealed = Object.freeze({ receiptID, bytes })
  seals.set(sealed, { text: result.text, authority: digest(authorityProjection(authority)) })
  return sealed
}

export function assertSeal(sealed: ReviewFixSchemaV2.Sealed, result: ReviewFixSchemaV2.Stored, authority: FixAuthority): ReviewEvidenceSchemaV2.EvidenceState {
  const issued = seals.get(sealed)
  if (!issued || issued.text !== result.text || issued.authority !== digest(authorityProjection(authority)))
    throw corrupt("completion has no sealed fix evidence for this admission")
  return { policy: "required-completed-v1", receiptID: sealed.receiptID, bytes: sealed.bytes }
}

function base(value: FixAuthority) {
  return { schema: "review-engagement-fix-result-v1" as const, requestID: value.identity.requestID,
    inputHash: value.identity.inputHash, sessionID: value.identity.leadID, budget: value.budget,
    profile: Schema.decodeUnknownSync(ReviewFixSchemaV2.Profile)(value.input.profile),
    ...(value.fix.prior === undefined ? {} : { prior: value.fix.prior }),
    ...(value.source === undefined ? {} : { source: value.source }),
  }
}

export function completed(value: FixAuthority, facts: Pick<ReviewFixSchemaV2.FixResult, "dispositions" | "citations" | "questions" | "notExamined">) {
  return encode({ ...base(value), status: "completed", ...facts })
}

export function stopped(value: FixAuthority, status: ReviewEngagementReportV2.Stopped, reason?: string,
  notExamined: ReviewFixSchemaV2.FixResult["notExamined"] = []) {
  const publication = status === "expired" ? "time-box" : status === "cancelled" ? "cancelled" : "failure"
  return encode({ ...base(value), status, dispositions: [], citations: [], questions: [], notExamined: [
    ...notExamined, { item: "engagement:remaining", reason: reason ?? publication },
    { item: "engagement:evidence-publication", reason: publication },
  ] })
}

function encode(payload: Omit<ReviewFixSchemaV2.FixResult, "reportID">) {
  return parse(canonical({ ...payload, reportID: digest(payload) }))
}

export function parse(text: string): ReviewFixSchemaV2.Stored {
  const value = Schema.decodeUnknownSync(ReviewFixSchemaV2.FixResult)(JSON.parse(text))
  const { reportID, ...payload } = value
  if (digest(payload) !== reportID || canonical(value) !== text) throw corrupt("stored fix result digest or bytes differ")
  if (value.source) ReviewEngagementReportV2.validateSource(value.source)
  if (value.prior) {
    const { bindingID, ...fields } = value.prior
    if (binding(value.inputHash, fields).bindingID !== bindingID || value.prior.profile !== value.profile ||
      new Set(value.prior.findings.map((finding) => finding.findingID)).size !== value.prior.findings.length ||
      canonical(value.prior.requiredFiles) !== canonical([...new Set(value.prior.requiredFiles)].sort()))
      throw corrupt("stored fix result predecessor binding differs")
  }
  if (value.status === "completed") {
    if (!value.prior || !value.source || value.source.files.length === 0 ||
      canonical(value.source.files.map((file) => file.path)) !== canonical(value.prior.requiredFiles) ||
      canonical(value.dispositions.map(({ findingID, priorFindingSha256 }) => [findingID, priorFindingSha256])) !==
        canonical(value.prior.findings.map(({ findingID, findingSha256 }) => [findingID, findingSha256])) ||
      canonical(value.questions) !== canonical(value.dispositions.flatMap((item) => item.disposition === "question"
        ? [{ findingID: item.findingID, question: item.reason }] : [])))
      throw corrupt("stored fix result scope or dispositions differ")
  } else if (value.dispositions.length || value.citations.length || value.questions.length ||
    !value.notExamined.some((gap) => gap.item === "engagement:evidence-publication") ||
    !value.notExamined.some((gap) => gap.item === "engagement:remaining")) {
    throw corrupt("stopped fix result contains partial judgment")
  }
  return { value, text }
}
