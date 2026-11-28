export * as ReviewEvidenceSchemaV2 from "./review-engagement-artifact-schema"

import { createHash } from "node:crypto"
import { Schema } from "effect"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { ReviewItem } from "@orchestra/core/review-toolkit/item"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewEngagementReportV2 } from "./review-engagement-report"
import { ReviewVariantSchemaV2 } from "./review-variant-schema"

export const limits = { body: 16 * 1024 * 1024, total: 64 * 1024 * 1024, artifacts: 256,
  code: 128, receipt: 1024 * 1024, page: 4096, cursor: 1024 } as const
export const strict = { onExcessProperty: "error" } as const
export const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
const Oid = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/))
export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))
const Positive = Count.check(Schema.isGreaterThan(0))
const Text = Schema.NonEmptyString
const UUID = Schema.String.check(Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/))

export const Input = Schema.Union([
  Schema.Struct({ op: Schema.Literal("manifest"), reportID: Digest }),
  Schema.Struct({ op: Schema.Literal("read"), reportID: Digest, artifactID: Digest,
    cursor: Schema.optional(Schema.String) }),
]).annotate({ parseOptions: strict })
export type Input = typeof Input.Type
export const EvidenceState = Schema.Struct({ policy: Schema.Literal("required-completed-v1"),
  receiptID: Schema.optional(Digest), bytes: Schema.optional(Positive.check(Schema.isLessThanOrEqualTo(limits.receipt))) })
export type EvidenceState = typeof EvidenceState.Type
export const Cursor = Schema.Struct({ schema: Schema.Literal("review-engagement-evidence-cursor-v1"),
  reportID: Digest, receiptID: Digest, artifactID: Digest, sha256: Digest, offset: Positive })

export const Artifact = Schema.Struct({
  artifactID: Digest, kind: Schema.Literals(["code-result", "code-snapshot", "citation", "analysis-result",
    "analysis-retained", "analysis-debt", "analyzer-stdout", "analyzer-stderr", "analyzer-path-map",
    "analyzer-inputs", "analyzer-config", "analyzer-recipe"]),
  sha256: Digest, bytes: Count.check(Schema.isLessThanOrEqualTo(limits.body)), mime: Text,
  complete: Schema.Boolean, uri: Schema.optional(Text),
})
export type Artifact = typeof Artifact.Type
const Evidence = Schema.Struct({ uri: Text, sha256: Digest, artifactID: Digest })
export const CodeOperation = Schema.Struct({
  operationID: Digest, kind: Schema.Literal("code"), status: Schema.Literal("captured"),
  sessionID: Text, assistantMessageID: Text, toolCallID: Text,
  name: Schema.Literals(["code_search", "code_locate", "code_query"]), input: Schema.Json,
  sourceSha256: Digest, evidence: Evidence, snapshots: Schema.Array(Evidence),
  nativeSettlement: Schema.Union([
    Schema.Struct({ status: Schema.Literal("completed"), messageID: Text }),
    Schema.Struct({ status: Schema.Literal("not-observed") }),
  ]),
})
export type CodeOperation = typeof CodeOperation.Type
export const Check = Schema.Struct({ id: Text, pack: Text, version: Text, lane: Text,
  status: Schema.Literals(["pass", "fail", "not-run", "acquisition-error"]), workspaceExecuted: Schema.Boolean,
  reason: Schema.optional(Text), uri: Schema.optional(Text) })
export const AnalysisOperation = Schema.Struct({
  operationID: Digest, kind: Schema.Literal("analysis"), status: Schema.Literal("completed"), ordinal: Positive,
  sourceSha256: Digest, routingDigest: Digest, catalogDigest: Digest,
  resultArtifactID: Digest, retainedArtifactID: Digest, debtArtifactID: Digest,
  checks: Schema.Array(Schema.Struct({ ...Check.fields, artifactIDs: Schema.Array(Digest), proofIDs: Schema.Array(Digest) })),
})
export type AnalysisOperation = typeof AnalysisOperation.Type
export const Runtime = Schema.Struct({ id: Schema.Literal("oxlint"), pinnedVersion: Schema.Literal("1.91.0"),
  target: Schema.Literal("linux-x64"), executableSha256: Digest })
const Capture = Schema.Struct({ bytes: Count, retainedBytes: Count, truncated: Schema.Boolean })
export const Proof = Schema.Struct({
  proofID: Digest, kind: Schema.Literal("oxlint"), analysisOperationID: Digest, invocationID: UUID,
  side: Schema.Literals(["head", "base"]), sourceSha256: Digest, runtime: Runtime,
  inputsArtifactID: Digest, configArtifactID: Digest, recipeArtifactID: Digest,
  pathMapArtifactID: Digest, stdoutArtifactID: Digest, stderrArtifactID: Digest,
  outcome: Schema.Struct({ exitCode: Schema.NullOr(Schema.Int), durationMs: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
    timedOut: Schema.Boolean, overflow: Schema.Boolean, memoryExceeded: Schema.Boolean, failure: Schema.optional(Text),
    stdout: Capture, stderr: Capture }),
})
export type Proof = typeof Proof.Type
const File = Schema.Struct({ path: Text, oid: Oid, sha256: Digest, bytes: Count })
export const Inputs = Schema.Struct({ schema: Schema.Literal("review-engagement-analyzer-inputs-v1"), sourceSha256: Digest,
  files: Schema.Array(Schema.Struct({ ...File.fields, encoding: Schema.Literal("base64"), data: Schema.String })) })
export const Recipe = Schema.Struct({
  schema: Schema.Literal("review-engagement-analyzer-recipe-v1"), analysisOperationID: Digest, invocationID: UUID,
  pack: Schema.Literal("oxlint"), template: Schema.Literal("oxlint-host-sarif"), sourceSha256: Digest,
  side: Schema.Literals(["head", "base"]), runtime: Runtime, files: Schema.Array(File), rules: Schema.Array(Text),
  config: Schema.Struct({ sha256: Digest, bytes: Count }),
  invocation: Schema.Struct({ argv: Schema.Array(Schema.Union([
    Schema.Struct({ kind: Schema.Literal("runtime") }),
    Schema.Struct({ kind: Schema.Literal("literal"), value: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("source"), path: Text }),
    Schema.Struct({ kind: Schema.Literal("config"), path: Schema.Literal(".host/oxlint.json") }),
  ])), cwd: Schema.Literal("projection"), environment: Schema.Literal("oxlint-host-sanitized-v1"),
  network: Schema.Literal(false), repositoryExecution: Schema.Literal(false), write: Schema.Array(Schema.Never) }),
  limits: Schema.Struct({ timeoutMs: Positive, maxBytes: Positive, maxRssBytes: Positive }),
})
export const AnalysisResult = Schema.Struct({
  schema: Schema.Literal("review-engagement-analysis-result-v1"), operationID: Digest,
  routing: ReviewRouting.Record, catalog: ReviewCatalog.Catalog,
  result: Schema.Struct({ checks: Schema.Array(Check), items: Schema.Record(Schema.String, Schema.Array(ReviewItem.ToolItem)),
    retained: Schema.Struct({ uri: Text, total: Count, unread: Schema.Record(Schema.String, Count) }),
    debt: Schema.Struct({ uri: Text, total: Count }) }),
})
export type AnalysisResult = typeof AnalysisResult.Type
export const ReceiptV1 = Schema.Struct({
  schema: Schema.Literal("review-engagement-evidence-v1"), reportID: Digest, inputHash: Digest,
  sessionID: Text, sourceSha256: Digest, budget: ReviewEngagementReportV2.Budget,
  finalAnalysisOperationID: Digest, operations: Schema.Array(Schema.Union([CodeOperation, AnalysisOperation])),
  artifacts: Schema.Array(Artifact), citations: Schema.Array(Schema.Struct({ uri: Text, artifactID: Digest })),
  hostProofs: Schema.Array(Proof), notExamined: Schema.Array(Schema.Struct({ item: Text, reason: Text })),
})
export type ReceiptV1 = typeof ReceiptV1.Type
export const ReceiptV2 = Schema.Struct({ ...ReceiptV1.fields,
  schema: Schema.Literal("review-engagement-evidence-v2"), variants: ReviewVariantSchemaV2.Variants,
})
export type ReceiptV2 = typeof ReceiptV2.Type
export const Receipt = Schema.Union([ReceiptV1, ReceiptV2])
export type Receipt = typeof Receipt.Type
export type Bodies = ReadonlyMap<string, Uint8Array>

export const canonical = ReviewEngagementReportV2.canonical
export const digest = ReviewEngagementReportV2.digest
export const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")
export const same = (left: unknown, right: unknown) => canonical(left) === canonical(right)
export function failure(reason: string, detail = reason) {
  return new Tool.Failure({ message: `engagement-evidence-${reason}: ${detail}`,
    metadata: { reason: `engagement-evidence-${reason}` } })
}
export function require(value: unknown, detail: string): asserts value {
  if (!value) throw failure("corrupt", detail)
}
export function json(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes))
}
export function codeID(inputHash: string, operation: Pick<CodeOperation,
  "sessionID" | "assistantMessageID" | "toolCallID" | "name" | "sourceSha256">) {
  return digest({ schema: "review-engagement-code-operation-v1", inputHash, sessionID: operation.sessionID,
    assistantMessageID: operation.assistantMessageID, toolCallID: operation.toolCallID,
    name: operation.name, sourceSha256: operation.sourceSha256 })
}
export function analysisID(inputHash: string, operation: Pick<AnalysisOperation,
  "sourceSha256" | "ordinal" | "routingDigest" | "catalogDigest">) {
  return digest({ schema: "review-engagement-analysis-operation-v1", inputHash, sourceSha256: operation.sourceSha256,
    ordinal: operation.ordinal, routingDigest: operation.routingDigest, catalogDigest: operation.catalogDigest })
}
