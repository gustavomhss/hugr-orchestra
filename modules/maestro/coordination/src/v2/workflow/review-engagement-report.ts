export * as ReviewEngagementReportV2 from "./review-engagement-report"

import { createHash } from "node:crypto"
import { Effect, Schema } from "effect"
import { SessionSchema } from "@orchestra/core/session"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { NonNegativeInt, PositiveInt } from "@orchestra/schema/schema"
import { ReviewResultV2 } from "../governance/review-result"
import type { ReviewEngagementEvidenceV2 } from "./review-engagement-evidence"
import { ReviewEngagementPolicyV2 } from "./review-engagement-policy"
import type { ReviewEngagementSourceV2 } from "./review-engagement-source"

const strict = { onExcessProperty: "error" } as const
const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
const Oid = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/))
const Gap = Schema.Struct({ item: Schema.NonEmptyString, reason: Schema.NonEmptyString })

export const Budget = Schema.Struct({ startedAt: NonNegativeInt, deadlineAt: NonNegativeInt })
export type Budget = typeof Budget.Type
export const Source = Schema.Struct({
  revision: Schema.NonEmptyString, commit: Oid, sha256: Digest,
  files: Schema.Array(Schema.Struct({ path: Schema.NonEmptyString, oid: Oid,
    mode: Schema.Literals(["100644", "100755"]), size: NonNegativeInt })),
  notExamined: Schema.Array(Schema.Struct({ path: Schema.NonEmptyString, reason: Schema.Literals(["symlink", "submodule"]) })),
})
export type Source = typeof Source.Type
export const Citation = Schema.Struct({
  uri: Schema.NonEmptyString, path: Schema.NonEmptyString, oid: Oid,
  startLine: PositiveInt, endLine: PositiveInt, text: Schema.NonEmptyString, sha256: Digest,
})
export type Citation = typeof Citation.Type
export const Result = Schema.Struct({
  schema: Schema.Literal("review-engagement-result-v1"), requestID: Schema.NonEmptyString,
  inputHash: Digest, sessionID: SessionSchema.ID,
  status: Schema.Literals(["completed", "cancelled", "expired", "failed"]),
  source: Schema.optional(Source), budget: Budget, report: Schema.optional(ReviewResultV2.Card),
  citations: Schema.Array(Citation),
  classifications: Schema.Array(Schema.Struct({ findingID: Schema.NonEmptyString,
    severity: MaestroEvent.Review.Severity, label: Schema.NonEmptyString })),
  notExamined: Schema.Array(Gap), reportID: Digest,
})
export type Result = typeof Result.Type
export type Stored = { readonly value: Result; readonly text: string }
export type Context = {
  readonly input: ReviewEngagementPolicyV2.Input
  readonly inputHash: string
  readonly sessionID: SessionSchema.ID
  readonly budget: Budget
  readonly source?: ReviewEngagementEvidenceV2.Prepared
  readonly notExamined?: Result["notExamined"]
  readonly variantCoverage?: "host"
}
export type Stopped = "cancelled" | "expired" | "failed"

/** Code-unit key ordering, exact array order and JSON-only values; no locale-dependent identity. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
    typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) {
    const items: string[] = []
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) throw new Error("non-JSON engagement array")
      items.push(canonical(value[index]))
    }
    return "[" + items.join(",") + "]"
  }
  if (typeof value === "object" && value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    if (Object.getOwnPropertySymbols(value).length) throw new Error("non-JSON engagement value")
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + canonical(Reflect.get(value, key))).join(",") + "}"
  }
  throw new Error("non-JSON engagement value")
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex")
export const digest = (value: unknown) => sha256(canonical(value))
const failure = (reason: string) => new Tool.Failure({ message: `engagement-report-invalid: ${reason}`,
  metadata: { reason: "engagement-report-invalid" } })

/** Validation and source reads remain inside the controller's original deadline. */
export function completed(context: Context & { readonly source: ReviewEngagementEvidenceV2.Prepared }, input: {
  readonly reply: string
  readonly expected: Parameters<typeof ReviewEngagementPolicyV2.validateReport>[1]
  readonly read: (path: string, startLine: number, endLine: number) => ReturnType<typeof ReviewEngagementSourceV2.read>
}): Effect.Effect<Stored, Tool.Failure> {
  return Effect.gen(function* () {
    const card = yield* Effect.try({
      try: () => {
        const card = ReviewEngagementPolicyV2.validateReport(input.reply, input.expected)
        if (card.profile !== context.input.profile || canonical(card.scope) !== canonical(scope(context.source)))
          throw new Error("captured scope mismatch")
        validatePaths(card, context.source)
        return card
      },
      catch: (error) => failure(String(error)),
    })
    const citations = yield* Effect.forEach(ranges(card), (range) => Effect.gen(function* () {
      const quoted = yield* input.read(range.path, range.startLine, range.endLine)
      const file = context.source.files.find((file) => file.path === range.path)
      if (!file || quoted.path !== range.path || quoted.oid !== file.oid || quoted.startLine !== range.startLine ||
        quoted.endLine !== range.endLine || quoted.text.split("\n").length !== range.endLine - range.startLine + 1)
        return yield* failure("captured citation mismatch")
      const citation = { path: quoted.path, oid: quoted.oid, startLine: quoted.startLine, endLine: quoted.endLine,
        text: quoted.text, sha256: sha256(quoted.text) }
      return { ...citation, uri: `review-engagement://${context.sessionID}/citation/${digest(citation)}` }
    }))
    const notExamined = gaps(context, card.coverage.notExamined)
    return seal({ ...base(context), status: "completed", source: context.source,
      report: { ...card, coverage: { ...card.coverage, notExamined } }, citations,
      classifications: card.findings.map((finding) => ({ findingID: finding.id, severity: finding.severity,
        label: ReviewEngagementPolicyV2.severity(context.input.profile, finding.severity) })), notExamined })
  })
}

/** Builds no partial card or invented capture when an admitted request stops. */
export function terminal(context: Context, status: Stopped, reason?: string): Stored {
  return seal({ ...base(context), status, ...(context.source ? { source: context.source } : {}),
    citations: [], classifications: [], notExamined: gaps(context, [{ item: "engagement:remaining",
      reason: status === "expired" ? "time-box" : status === "cancelled" ? "cancelled" : reason ?? "failed" }]) })
}

/** A replay verifies stored bytes without reading Git, settings, catalog or model state. */
export function read(text: string): Effect.Effect<Stored, Tool.Failure> {
  return Effect.try({
    try: () => {
      const value = Schema.decodeUnknownSync(Result)(JSON.parse(text), strict)
      validate(value)
      const { reportID, ...payload } = value
      if (digest(payload) !== reportID || canonical(value) !== text) throw new Error("stored report digest or bytes mismatch")
      return { value, text }
    },
    catch: (error) => failure(String(error)),
  })
}

function base(context: Context) {
  return { schema: "review-engagement-result-v1" as const, requestID: context.input.requestID,
    inputHash: context.inputHash, sessionID: context.sessionID, budget: context.budget }
}

function seal(payload: Omit<Result, "reportID">): Stored {
  const value = { ...payload, reportID: digest(payload) }
  validate(value)
  return { value, text: canonical(value) }
}

const scope = (source: ReviewEngagementEvidenceV2.Prepared) => ({
  base: source.commit, head: source.commit, files: source.files.length, changedLines: 0,
})

function gaps(context: Context, existing: Result["notExamined"]) {
  const values = [...(context.variantCoverage === "host" ? existing.filter((entry) => !entry.item.startsWith("audit:variants")) : existing),
    ...(context.notExamined ?? []),
    ...(context.source?.notExamined.map((entry) => ({ item: entry.path, reason: entry.reason })) ?? []),
    { item: "engagement:history", reason: "not-built" },
    { item: "engagement:probe", reason: "not-built" },
    ...(context.input.profile === "audit" && context.variantCoverage !== "host" ? [{ item: "audit:variants", reason: "not-built" }] : []),
    ...(context.input.profile === "artifact" ? [{ item: "artifact:behavioral-eval", reason: "owner-permission" }] : []),
  ]
  return [...new Map(values.map((entry) => [canonical(entry), entry])).values()]
}

function ranges(card: ReviewResultV2.Card) {
  return [...new Map(card.findings.flatMap((finding) => [{ path: finding.path, startLine: finding.line,
    endLine: finding.endLine ?? finding.line }, ...(finding.evidence.kind === "quote" ? [{
      path: finding.evidence.path, startLine: finding.evidence.startLine, endLine: finding.evidence.endLine,
    }] : [])]).map((range) => [canonical(range), range])).values()]
}

function validatePaths(card: ReviewResultV2.Card, source: ReviewEngagementEvidenceV2.Prepared) {
  // This route has no scoped executable probe. A quote rung cannot launder claimed probe evidence.
  if (card.findings.some((finding) => finding.evidence.kind === "probe" || finding.rungs.some((rung) => rung.startsWith("probe:"))))
    throw new Error("engagement probes are not built")
  const files = new Set(source.files.map((file) => file.path))
  if (card.findings.some((finding) => !files.has(finding.path) ||
    finding.cause !== undefined && !files.has(finding.cause.path) ||
    finding.evidence.kind === "quote" && !files.has(finding.evidence.path)) ||
    card.questions.some((question) => question.path !== undefined && !files.has(question.path)))
    throw new Error("report path outside captured authority")
}

/** Also used when decoding durable admission/source metadata. */
export function validateSource(source: ReviewEngagementEvidenceV2.Prepared): void {
  if (!source.files.length) throw new Error("empty captured authority")
  const regular = source.files.map((file) => file.path)
  const skipped = source.notExamined.map((entry) => entry.path)
  for (const paths of [regular, skipped]) if (new Set(paths).size !== paths.length ||
    canonical(paths) !== canonical([...paths].sort()) || paths.some((file) => !canonicalPath(file)))
    throw new Error("invalid captured paths")
  if (regular.some((file) => skipped.includes(file)) || source.files.some((file) => !Number.isSafeInteger(file.size) || file.size < 0))
    throw new Error("invalid captured manifest")
  // Preserve the existing prepare() digest format, whose field order predates canonical report JSON.
  const prepared = { commit: source.commit,
    files: source.files.map((file) => ({ path: file.path, oid: file.oid, mode: file.mode, size: file.size })),
    notExamined: source.notExamined.map((entry) => ({ path: entry.path, reason: entry.reason })) }
  if (sha256(JSON.stringify(prepared)) !== source.sha256) throw new Error("captured source digest mismatch")
}

function validate(value: Result) {
  if (!Number.isSafeInteger(value.budget.startedAt) || !Number.isSafeInteger(value.budget.deadlineAt) ||
    value.budget.startedAt < 0 || value.budget.deadlineAt <= value.budget.startedAt) throw new Error("invalid original budget")
  if (value.source) validateSource(value.source)
  if (value.status !== "completed") {
    if (value.report !== undefined || value.citations.length || value.classifications.length) throw new Error("partial terminal report")
    return
  }
  const source = value.source
  const card = value.report
  if (!source || !card || card.verdict !== undefined || canonical(card.scope) !== canonical(scope(source)))
    throw new Error("incomplete terminal report")
  validatePaths(card, source)
  const labels = card.findings.map((finding) => ({ findingID: finding.id, severity: finding.severity,
    label: ReviewEngagementPolicyV2.severity(card.profile, finding.severity) }))
  if (canonical(labels) !== canonical(value.classifications)) throw new Error("classification mismatch")
  const expected = ranges(card)
  if (expected.length !== value.citations.length || expected.some((range) => !value.citations.some((citation) =>
    range.path === citation.path && range.startLine === citation.startLine && range.endLine === citation.endLine)))
    throw new Error("missing finding citation")
  for (const citation of value.citations) {
    const file = source.files.find((file) => file.path === citation.path)
    const { uri, ...quoted } = citation
    if (!file || file.oid !== citation.oid || citation.endLine < citation.startLine ||
      citation.text.split("\n").length !== citation.endLine - citation.startLine + 1 || sha256(citation.text) !== citation.sha256 ||
      uri !== `review-engagement://${value.sessionID}/citation/${digest(quoted)}`)
      throw new Error("stored citation mismatch")
  }
}

function canonicalPath(value: string) {
  return value.length > 0 && !value.includes("\\") && !value.includes("\0") && !value.startsWith("/") &&
    !/^[A-Za-z]:/.test(value) && value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
}
