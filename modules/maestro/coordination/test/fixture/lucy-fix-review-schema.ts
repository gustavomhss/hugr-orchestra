import { Schema } from "effect"
import { SessionSchema } from "@orchestra/core/session"
import { ReviewItem } from "@orchestra/core/review-toolkit/item"
import { ReviewResultV2 } from "../../src/v2/governance/review-result"
import { ReviewEvidenceSchemaV2 } from "../../src/v2/workflow/review-engagement-artifact-schema"
import { ReviewEngagementReportV2 } from "../../src/v2/workflow/review-engagement-report"
import { ScopedProbeReference } from "./lucy-engagement-artifacts"
import { CapturedRegion, Count, Digest, NativeReply, Positive, StateV2, strict } from "./lucy-variant-schema"

// Test-only frozen wire contract. No new production symbol is needed by the compiling RED packet.
export const Profile = Schema.Literals(["audit", "diligence", "artifact"])
export const Tier = Schema.Literals(["quick", "standard", "deep"])
const Text = Schema.NonEmptyString
const FindingRef = Schema.Struct({ findingID: Text, findingSha256: Digest })
export const PriorBinding = Schema.Struct({
  policy: Schema.Literal("fix-review-v1"), bindingID: Digest,
  reportID: Digest, receiptID: Digest, receiptBytes: Positive,
  priorStateSchema: Schema.Literals(["review-engagement-state-v2", "review-engagement-state-v3"]),
  priorInputHash: Digest, priorSourceSha256: Digest, authoritySha256: Digest,
  profile: Profile, executionTier: Tier, tierSha256: Digest, catalogDigest: Digest,
  findings: Schema.Array(FindingRef).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  requiredFiles: Schema.Array(Text).check(Schema.isMinLength(1)),
}).annotate({ parseOptions: strict })
export type PriorBinding = typeof PriorBinding.Type

// A projection of existing facts into the actual report verifier prompt, not a new producer or authority token.
export const AnalyzerEvidence = Schema.Array(Schema.Struct({ candidate: Text, item: ReviewItem.ToolItem,
  check: Schema.Struct({ ...ReviewEvidenceSchemaV2.Check.fields, uri: Text }),
})).annotate({ parseOptions: strict })
export type AnalyzerEvidence = typeof AnalyzerEvidence.Type

export const QuoteSupport = Schema.Struct({ kind: Schema.Literal("quote"), path: Text,
  startLine: Positive, endLine: Positive })
export const ToolSupport = Schema.Struct({ kind: Schema.Literal("tool"), observationID: Digest })
export const Support = Schema.Union([QuoteSupport, ToolSupport])
const verdictFields = { findingID: Text, priorFindingSha256: Digest, reason: Text,
  supporting: Schema.Array(Support).check(Schema.isMaxLength(4)) }
export const FixVerifierReturn = Schema.Union([
  Schema.Struct({ ...verdictFields, disposition: Schema.Literals(["open", "resolved", "question"]) }),
  Schema.Struct({ ...verdictFields, disposition: Schema.Literal("dismissed"), refutation: Text }),
]).annotate({ parseOptions: strict })
export type FixVerifierReturn = typeof FixVerifierReturn.Type
export const NotExaminedReason = Schema.Literals([
  "independent-verification-unavailable", "verification-budget", "region-unavailable",
  "native-runtime-unqualified", "runtime-unavailable", "recipe-incompatible", "probe-unqualified",
])
export const Disposition = Schema.Union([
  Schema.Struct({ findingID: Text, priorFindingSha256: Digest,
    disposition: Schema.Literals(["open", "resolved", "dismissed", "question"]),
    reason: Text, examinationID: Digest }),
  Schema.Struct({ findingID: Text, priorFindingSha256: Digest, disposition: Schema.Literal("not-examined"),
    reason: NotExaminedReason }),
]).annotate({ parseOptions: strict })
export type Disposition = typeof Disposition.Type
export const Gap = Schema.Struct({ item: Text, reason: Text })
export const FixResult = Schema.Struct({
  schema: Schema.Literal("review-engagement-fix-result-v1"),
  requestID: Text, inputHash: Digest, sessionID: SessionSchema.ID,
  status: Schema.Literals(["completed", "cancelled", "expired", "failed"]), profile: Profile,
  budget: ReviewEngagementReportV2.Budget, prior: Schema.optional(PriorBinding),
  source: Schema.optional(ReviewEngagementReportV2.Source), dispositions: Schema.Array(Disposition),
  citations: Schema.Array(ReviewEngagementReportV2.Citation),
  questions: Schema.Array(Schema.Struct({ findingID: Text, question: Text })),
  notExamined: Schema.Array(Gap), reportID: Digest,
}).annotate({ parseOptions: strict })
export type FixResult = typeof FixResult.Type

export const FixState = Schema.Struct({ policy: Schema.Literal("fix-review-v1"), prior: Schema.optional(PriorBinding) })
export const StateV4 = Schema.Struct({
  ...StateV2.fields, schema: Schema.Literal("review-engagement-state-v4"),
  evidence: ReviewEvidenceSchemaV2.EvidenceState, fix: FixState,
}).annotate({ parseOptions: strict })
export type StateV4 = typeof StateV4.Type

export const ToolObservation = Schema.Struct({
  observationID: Digest, findingID: Text, priorProofID: Digest, analysisOperationID: Digest,
  headProofID: Digest, baseProofID: Digest, recipeSha256: Digest,
  result: Schema.Literals(["zero", "nonzero"]),
}).annotate({ parseOptions: strict })
export type ToolObservation = typeof ToolObservation.Type
export const ScopedProbeObservation = Schema.Struct({
  kind: Schema.Literal("scoped-typecheck"), observationID: Digest, findingID: Text, priorProofID: Digest, proofID: Digest,
  result: Schema.Literals(["zero", "nonzero"]),
})
export const Observation = Schema.Union([ScopedProbeObservation, ToolObservation])
export type Observation = typeof Observation.Type
export const Examination = Schema.Struct({
  examinationID: Digest, findingID: Text, priorFindingSha256: Digest, verifierSessionID: SessionSchema.ID,
  replyID: Digest, offeredObservationIDs: Schema.Array(Digest), currentRegionIDs: Schema.Array(Digest),
  rawReturn: FixVerifierReturn, disposition: Schema.Literals(["open", "resolved", "dismissed", "question"]),
  reason: Text,
}).annotate({ parseOptions: strict })
export type Examination = typeof Examination.Type
export const FixArtifact = Schema.Struct({
  ...ReviewEvidenceSchemaV2.Artifact.fields,
  kind: Schema.Union([ReviewEvidenceSchemaV2.Artifact.fields.kind,
    Schema.Literals(["fix-prior-report", "fix-prior-receipt", "fix-prior-authority"])]),
}).annotate({ parseOptions: strict })
export const FixReceipt = Schema.Struct({
  schema: Schema.Literal("review-engagement-fix-evidence-v1"),
  reportID: Digest, inputHash: Digest, sessionID: SessionSchema.ID, sourceSha256: Digest,
  budget: ReviewEngagementReportV2.Budget,
  prior: Schema.Struct({ binding: PriorBinding, reportArtifactID: Digest, receiptArtifactID: Digest,
    authorityArtifactID: Digest, artifactIDs: Schema.Array(Digest) }),
  finalAnalysisOperationID: Digest,
  operations: Schema.Array(Schema.Union([ReviewEvidenceSchemaV2.CodeOperation, ReviewEvidenceSchemaV2.AnalysisOperation])),
  artifacts: Schema.Array(FixArtifact), citations: Schema.Array(Schema.Struct({ uri: Text, artifactID: Digest })),
  hostProofs: Schema.Array(ReviewEvidenceSchemaV2.Proof), observations: Schema.Array(Observation),
  scopedProbes: Schema.optional(Schema.Array(ScopedProbeReference)),
  examinations: Schema.Array(Examination), regions: Schema.Array(CapturedRegion), replies: Schema.Array(NativeReply),
  notExamined: Schema.Array(Gap),
}).annotate({ parseOptions: strict })
export type FixReceipt = typeof FixReceipt.Type

export const FixFinding = Schema.Struct({ finding: ReviewResultV2.Finding, priorFindingSha256: Digest })
export type FixFinding = typeof FixFinding.Type
export const FixSource = Schema.Struct({ source: ReviewEngagementReportV2.Source, regions: Schema.Array(CapturedRegion) })
export const PriorEvidence = Schema.Struct({ sourceSha256: Digest, citations: Schema.Array(ReviewEngagementReportV2.Citation) })

// The index/page/cursor protocol stays v1. These constants describe quota accounting, not larger quotas.
export const limits = { body: 16 * 1024 * 1024, total: 64 * 1024 * 1024,
  artifacts: 256, code: 128, receipt: 1024 * 1024, page: 4096 } as const
export const Counted = Schema.Struct({ artifacts: Count, operations: Count, hostProofs: Count })
