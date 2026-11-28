export * as ReviewHistoryEvidenceV2 from "./review-history-evidence"

import { Option, Schema, type Effect } from "effect"
import { ReviewHistory } from "@orchestra/core/review-toolkit/history"
import { ReviewScopedHistory } from "@orchestra/core/review-toolkit/index"
import type { SessionMessage } from "@orchestra/core/session/message"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewEngagementReportV2 } from "./review-engagement-report"

const strict = { onExcessProperty: "error" } as const
const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
const Oid = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/))
const Text = Schema.NonEmptyString
const Metadata = Schema.Struct({ commit: Oid, timestamp: Text, authorID: Digest })
const Attribution = Schema.Struct({ line: Schema.Int.check(Schema.isGreaterThan(0)), text: Schema.String,
  commit: Schema.optional(Oid), timestamp: Schema.optional(Text), authorID: Schema.optional(Digest) })

export const Reference = Schema.Struct({ historyID: Digest, artifactID: Digest })
export type Reference = typeof Reference.Type
export const Proof = Schema.Struct({
  schema: Schema.Literal("review-engagement-history-proof-v1"), historyID: Digest,
  inputHash: Digest, sourceSha256: Digest, anchorCommit: Oid, budget: ReviewEngagementReportV2.Budget,
  sessionID: Text, assistantMessageID: Text, toolCallID: Text, name: Schema.Literal("review_history"),
  input: ReviewHistory.Input, result: ReviewScopedHistory.Envelope,
  nativeSettlement: Schema.Struct({ status: Schema.Literal("completed"), messageID: Text }),
})
export type Proof = typeof Proof.Type
export type Capture = {
  readonly sessionID: string
  readonly assistantMessageID: string
  readonly toolCallID: string
  readonly input: ReviewHistory.Input
  readonly result: ReviewScopedHistory.Envelope
  readonly active: Effect.Effect<void, Tool.Failure>
  /** Call-local admission deadline; completed native ACK uses only the original binding lifetime. */
  readonly admissionActive?: Effect.Effect<void, Tool.Failure>
}
export type Authority = {
  readonly inputHash: string
  readonly sessionID: string
  readonly source: ReviewEngagementReportV2.Source
  readonly budget: ReviewEngagementReportV2.Budget
  readonly profile: string
}
export type Validated = {
  readonly proof: Proof
  readonly model: ReviewScopedHistory.Envelope
  readonly modelText: string
  readonly resultSha256: string
  readonly resultBytes: number
  readonly uri: string
}

/** These immutable bytes remain pending until the actual native completed event is acknowledged. */
export function prepare(value: Capture, authority: Authority) {
  const historyID = ReviewScopedHistory.identity(authority.inputHash, authority.source.sha256, value)
  const bytes = Buffer.from(ReviewScopedHistory.canonical({
    schema: "review-engagement-history-proof-v1", historyID,
    inputHash: authority.inputHash, sourceSha256: authority.source.sha256, anchorCommit: authority.source.commit,
    budget: authority.budget, sessionID: value.sessionID, assistantMessageID: value.assistantMessageID,
    toolCallID: value.toolCallID, name: "review_history", input: value.input, result: value.result,
    nativeSettlement: { status: "completed", messageID: value.assistantMessageID },
  }))
  return { bytes, validated: read(bytes, authority, historyID) }
}

/** Pure proof validation. Git ancestry was admitted by the confined reader, never rediscovered during replay. */
export function read(bytes: Uint8Array, authority: Authority, expectedID: string): Validated {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
  const proof = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(Proof))(text, strict))
  ensure(proof && text === ReviewScopedHistory.canonical(proof), "history proof is malformed or noncanonical")
  ensure(authority.profile === "audit" || authority.profile === "diligence", "history profile is not admitted")
  ReviewEngagementReportV2.validateSource(authority.source)
  ensure(proof.historyID === expectedID && proof.historyID === ReviewScopedHistory.identity(authority.inputHash, authority.source.sha256, proof) &&
    proof.inputHash === authority.inputHash && proof.sourceSha256 === authority.source.sha256 && proof.anchorCommit === authority.source.commit &&
    proof.sessionID === authority.sessionID && same(proof.budget, authority.budget) &&
    proof.nativeSettlement.messageID === proof.assistantMessageID, "history proof differs from captured authority")
  const result = proof.result
  ensure(result.historyID === proof.historyID && result.sourceSha256 === proof.sourceSha256 && result.anchorCommit === proof.anchorCommit &&
    result.op === proof.input.op && result.path === proof.input.path && authority.source.files.some((file) => file.path === result.path),
  "history result differs from its exact admitted input")
  const selected = selection(proof.input, authority.source)
  ensure(same(result.selection, selected), "history normalized selection differs from its input")
  ensure(result.complete ? !result.truncated && result.notExamined.length === 0 : result.notExamined.length > 0,
    "history completeness has no concrete limitation")
  ensure(result.notExamined.every((gap) => gap.item.length > 0 && gap.reason.length > 0), "history limitation is empty")
  records(result)
  const raw = ReviewScopedHistory.canonical(result)
  const resultBytes = Buffer.byteLength(raw)
  ensure(resultBytes <= ReviewHistory.Limits.rawBytes, "history safe result exceeds its byte bound")
  const model = ReviewScopedHistory.project(result)
  const modelText = ReviewScopedHistory.canonical(model)
  ensure(Buffer.byteLength(modelText) <= ReviewHistory.Limits.textBytes, "history model result exceeds its byte bound")
  return { proof, model, modelText, resultSha256: ReviewScopedHistory.hash(raw), resultBytes,
    uri: ReviewHistory.uri(proof.sessionID, proof.historyID) }
}

/** Compare the entire safe result with the original host settlement, including any undisplayed tail. */
export function settled(value: Validated, sessionID: string, message: SessionMessage.Message): void {
  const proof = value.proof
  ensure(sessionID === proof.sessionID && message.id === proof.assistantMessageID && message.type === "assistant",
    "history native message belongs to another Session or call")
  const matches = message.content.filter((part) => part.type === "tool" && part.id === proof.toolCallID)
  const event = matches[0]
  ensure(matches.length === 1 && event?.type === "tool" && event.name === "review_history" &&
    event.provider?.executed !== true && event.state.status === "completed", "history has no unique native completed settlement")
  ensure(same(event.state.input, proof.input), "history native input differs from retained input")
  const content = event.state.content
  ensure(content.length === 1 && content[0].type === "text" && content[0].text === value.modelText,
    "history native model projection differs from retained result")
  const settlement = Option.getOrUndefined(Schema.decodeUnknownOption(ReviewScopedHistory.Settlement)(event.state.structured.review, strict))
  ensure(event.state.structured.output === value.modelText && settlement && settlement.historyID === proof.historyID &&
    settlement.uri === value.uri && settlement.truncated === value.model.truncated &&
    settlement.resultSha256 === value.resultSha256 && settlement.resultBytes === value.resultBytes,
  "history native settlement does not bind the complete retained result")
}

export function gaps(value: Validated): ReviewEngagementReportV2.Result["notExamined"] {
  const unique = new Map([...value.proof.result.notExamined, ...value.model.notExamined].map((gap) => {
    const entry = { item: `history:${value.proof.historyID}:${gap.item}`, reason: gap.reason }
    return [ReviewScopedHistory.canonical(entry), entry] as const
  }))
  return [...unique.values()]
}

function records(result: ReviewScopedHistory.Envelope): void {
  if (result.op === "show") return
  const lines = result.text === "" ? [] : result.text.replace(/\n$/, "").split("\n")
  if (result.op !== "blame") {
    ensure(lines.length <= ReviewHistory.Limits.commits, "history metadata exceeds its commit bound")
    const seen = new Set<string>()
    for (const line of lines) {
      const entry = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(Metadata))(line, strict))
      ensure(entry && line === ReviewScopedHistory.canonical(entry) && entry.commit.length === result.anchorCommit.length &&
        !seen.has(entry.commit) && timestamp(entry.timestamp), "history metadata is malformed")
      seen.add(entry.commit)
    }
    return
  }
  for (const [index, line] of lines.entries()) {
    const entry = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(Attribution))(line, strict))
    ensure(entry && line === ReviewScopedHistory.canonical(entry) && entry.line === index + 1, "history attribution is malformed")
    ensure(entry.commit === undefined
      ? entry.timestamp === undefined && entry.authorID === undefined && !result.complete
      : entry.commit.length === result.anchorCommit.length && entry.timestamp !== undefined && timestamp(entry.timestamp) && entry.authorID !== undefined,
    "history attribution lacks complete metadata or an explicit boundary")
  }
}

function timestamp(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value
}

function selection(input: ReviewHistory.Input, source: ReviewEngagementReportV2.Source) {
  try {
    return ReviewScopedHistory.selection(input, {
      sha256: source.sha256, commit: source.commit, files: source.files.map((file) => file.path),
    })
  } catch {
    throw corrupt("history retained input has no admissible normalized selection")
  }
}

const same = (left: unknown, right: unknown) => ReviewScopedHistory.canonical(left) === ReviewScopedHistory.canonical(right)
function ensure(value: unknown, detail: string): asserts value {
  if (!value) throw corrupt(detail)
}
function corrupt(detail: string) {
  return new Tool.Failure({ message: `engagement-evidence-corrupt: ${detail}`,
    metadata: { reason: "engagement-evidence-corrupt" } })
}
