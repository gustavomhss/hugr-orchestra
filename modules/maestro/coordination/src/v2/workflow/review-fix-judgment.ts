export * as ReviewFixJudgmentV2 from "./review-fix-judgment"

import { Option, Schema } from "effect"
import { SessionSchema } from "@orchestra/core/session"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewEngagementReportV2 } from "./review-engagement-report"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import { ReviewFixSchemaV2 } from "./review-fix-schema"
import { ReviewVariantSchemaV2 } from "./review-variant-schema"

export type Finding = ReviewFixSchemaV2.FixFinding
export type Disposition = ReviewFixSchemaV2.Disposition
export type Evidence = {
  readonly source: ReviewEngagementReportV2.Source
  readonly priorSource: ReviewEngagementReportV2.Source
  readonly finding: Finding
  readonly relatedFiles: readonly string[]
  readonly regions: readonly ReviewVariantSchemaV2.CapturedRegion[]
  readonly observations: readonly ReviewFixSchemaV2.ToolObservation[]
}

const invalid = (detail: string): never => {
  throw new Tool.Failure({ message: `engagement-report-invalid: ${detail}`, metadata: { reason: "engagement-report-invalid" } })
}
const decode = Schema.decodeUnknownOption(ReviewFixSchemaV2.FixVerifierReturn)
const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

export function parse(text: string): ReviewFixSchemaV2.FixVerifierReturn {
  const marker = "```review-fix-verify"
  if (text.split(marker).length !== 2) return invalid("fix verifier return must contain exactly one block")
  const body = new RegExp("```review-fix-verify[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n```").exec(text)?.[1]
  if (body === undefined) return invalid("fix verifier block is malformed")
  const json = Option.getOrUndefined(decodeJson(body))
  const value = json === undefined ? undefined : Option.getOrUndefined(decode(json))
  if (!value) return invalid("fix verifier return is malformed or ambiguous")
  return value
}

export function regions(finding: Finding): ReadonlyArray<{ path: string; startLine: number; endLine: number }> {
  const value = finding.finding
  const ranges = [
    { path: value.path, startLine: value.line, endLine: value.endLine ?? value.line },
    ...(value.evidence.kind === "quote" ? [{ path: value.evidence.path, startLine: value.evidence.startLine, endLine: value.evidence.endLine }] : []),
  ]
  return [...new Map(ranges.map((range) => [ReviewEngagementReportV2.canonical(range), range])).values()]
}

export function reply(inputHash: string, input: Omit<ReviewVariantSchemaV2.NativeReply, "replyID">): ReviewVariantSchemaV2.NativeReply {
  if (input.textSha256 !== ReviewEvidenceSchemaV2.hash(input.text)) return invalid("native fix reply text digest differs")
  return { ...input, replyID: ReviewEngagementReportV2.digest({ schema: "review-fix-reply-v1", inputHash,
    sessionID: input.sessionID, promptMessageID: input.promptMessageID, assistantMessageID: input.assistantMessageID,
    textPartID: input.textPartID, textSha256: input.textSha256 }) }
}

export function region(source: ReviewEngagementReportV2.Source, quote: {
  readonly path: string; readonly oid: string; readonly sha256: string
  readonly startLine: number; readonly endLine: number; readonly text: string
}): ReviewVariantSchemaV2.CapturedRegion {
  const file = source.files.find((item) => item.path === quote.path)
  if (!file || file.oid !== quote.oid || quote.startLine < 1 ||
    quote.endLine < quote.startLine || quote.endLine - quote.startLine >= 400 ||
    quote.text.split("\n").length !== quote.endLine - quote.startLine + 1 ||
    Buffer.byteLength(quote.text) > file.size || quote.text.includes("\0")) return invalid("fix source region identity differs")
  const textSha256 = ReviewEvidenceSchemaV2.hash(quote.text)
  return { sourceSha256: source.sha256, path: quote.path, oid: quote.oid,
    blobSha256: quote.sha256, startLine: quote.startLine, endLine: quote.endLine,
    text: quote.text, textSha256,
    regionID: ReviewEngagementReportV2.digest({ schema: "review-fix-region-v1", sourceSha256: source.sha256,
      path: quote.path, oid: quote.oid, blobSha256: quote.sha256, startLine: quote.startLine,
      endLine: quote.endLine, textSha256 }) }
}

export function examine(input: Evidence & { readonly inputHash: string; readonly reply: ReviewVariantSchemaV2.NativeReply }): ReviewFixSchemaV2.Examination {
  const prior = input.finding
  const finding = prior.finding
  const reply = input.reply
  if (reply.role !== "verifier" || reply.textSha256 !== ReviewEvidenceSchemaV2.hash(reply.text) ||
    reply.replyID !== ReviewEngagementReportV2.digest({ schema: "review-fix-reply-v1", inputHash: input.inputHash,
      sessionID: reply.sessionID, promptMessageID: reply.promptMessageID, assistantMessageID: reply.assistantMessageID,
      textPartID: reply.textPartID, textSha256: reply.textSha256 })) return invalid("fix verifier native reply identity differs")
  const rawReturn = parse(reply.text)
  if (rawReturn.findingID !== finding.id || rawReturn.priorFindingSha256 !== prior.priorFindingSha256)
    return invalid("fix verifier returned a foreign finding identity")
  const offeredObservationIDs = input.observations.filter((item) => item.findingID === finding.id).map((item) => item.observationID)
  const current = input.regions.filter((item) => item.sourceSha256 === input.source.sha256 &&
    input.relatedFiles.includes(item.path))
  const supportingIDs = rawReturn.supporting.map((support) => {
    if (support.kind === "tool") {
      if (!offeredObservationIDs.includes(support.observationID)) return invalid("fix verifier referenced an unoffered observation")
      return support.observationID
    }
    const matches = current.filter((item) => item.path === support.path && item.startLine === support.startLine && item.endLine === support.endLine)
    if (matches.length !== 1) return invalid("fix verifier referenced an unretained quote")
    return matches[0].regionID
  })
  if (new Set(supportingIDs).size !== supportingIDs.length) return invalid("fix verifier repeated supporting evidence")
  const currentRegionIDs = [...new Set(current.map((item) => item.regionID))]
  const unchanged = input.relatedFiles.every((path) => input.priorSource.files.find((item) => item.path === path)?.oid ===
    input.source.files.find((item) => item.path === path)?.oid)
  const hasQuote = rawReturn.supporting.some((support) => support.kind === "quote")
  const hasTool = rawReturn.supporting.some((support) => support.kind === "tool")
  let disposition = rawReturn.disposition
  let reason = rawReturn.reason
  if (disposition === "resolved" && unchanged) {
    disposition = "open"
    reason = "unchanged-inputs"
  } else if (disposition === "resolved" && finding.evidence.kind === "tool" &&
    input.observations.some((item) => offeredObservationIDs.includes(item.observationID) && item.result === "nonzero")) {
    disposition = "question"
    reason = "native-results-remain"
  } else if (disposition === "resolved" && (finding.evidence.kind === "quote" ? !hasQuote : !hasTool)) {
    disposition = "question"
  } else if (disposition === "dismissed" && (!hasQuote ||
    (finding.evidence.kind === "tool" && !hasTool))) {
    disposition = "question"
  } else if (rawReturn.supporting.length === 0) {
    disposition = "question"
  }
  const withoutID = { findingID: finding.id, priorFindingSha256: prior.priorFindingSha256,
    verifierSessionID: SessionSchema.ID.make(reply.sessionID), replyID: reply.replyID, offeredObservationIDs, currentRegionIDs,
    rawReturn, disposition, reason }
  return { ...withoutID, examinationID: ReviewEngagementReportV2.digest({ schema: "review-fix-examination-v1", inputHash: input.inputHash, ...withoutID }) }
}

export function sort<T extends Finding>(findings: readonly T[]): T[] {
  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 } as const
  return [...findings].sort((left, right) => rank[left.finding.severity] - rank[right.finding.severity] ||
    (left.finding.id < right.finding.id ? -1 : left.finding.id > right.finding.id ? 1 : 0))
}
