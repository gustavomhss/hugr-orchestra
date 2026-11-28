import { Schema } from "effect"
import { SessionSchema } from "@orchestra/core/session"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { ReviewResultV2 } from "../../src/v2/governance/review-result"
import { ReviewEvidenceSchemaV2 } from "../../src/v2/workflow/review-engagement-artifact-schema"
import { ReviewEngagementPolicyV2 } from "../../src/v2/workflow/review-engagement-policy"
import { ReviewEngagementReportV2 } from "../../src/v2/workflow/review-engagement-report"

export const strict = { onExcessProperty: "error" } as const
export const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
export const Oid = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/))
export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))
export const Positive = Count.check(Schema.isGreaterThan(0))

export const GenerationStop = Schema.Literals([
  "stage-invalid", "search-unavailable", "search-incomplete", "seed-not-matched",
  "verification-incomplete", "no-new-matches", "half-noise", "generation-limit",
])
export type GenerationStop = typeof GenerationStop.Type
export const VariantStop = Schema.Union([
  GenerationStop,
  Schema.Literals(["not-applicable", "independent-verification-unavailable", "no-confirmed-seed"]),
])
export type VariantStop = typeof VariantStop.Type
export const StageInvalidDetail = Schema.Literals([
  "search-attempt-count", "provider-executed-search", "search-stage-mismatch", "search-input-scope",
  "proposal-return", "proposal-seed", "proposal-candidates",
])
export type StageInvalidDetail = typeof StageInvalidDetail.Type
export const NotExaminedReason = Schema.Literals([
  "candidate-missing", "verification-budget", "region-unavailable", "verifier-return-invalid", "stage-invalid",
])
export type NotExaminedReason = typeof NotExaminedReason.Type

// The private review-result Rung schema is copied without changing its vocabulary.
export const Rung = Schema.Struct({
  option: Schema.NonEmptyString,
  outcome: Schema.Literals(["settled", "unsettled", "refused", "not-run"]),
  detail: Schema.optional(Schema.NonEmptyString),
}).annotate({ parseOptions: strict })
export type Rung = typeof Rung.Type

export const Candidate = Schema.Struct({
  path: Schema.NonEmptyString,
  line: Positive,
  endLine: Schema.optional(Positive),
  severity: MaestroEvent.Review.Severity,
  trigger: Schema.NonEmptyString,
  quote: Schema.NonEmptyString,
}).annotate({ parseOptions: strict })
export type Candidate = typeof Candidate.Type
export const Proposal = Schema.Struct({
  seedFindingID: Schema.NonEmptyString,
  patternChange: Schema.NonEmptyString,
  candidates: Schema.Array(Candidate).check(Schema.isMaxLength(200)),
}).annotate({ parseOptions: strict })
export type Proposal = typeof Proposal.Type

export const SeedRef = Schema.Struct({
  seedID: Digest,
  findingID: Schema.NonEmptyString,
}).annotate({ parseOptions: strict })
export type SeedRef = typeof SeedRef.Type
export const Counts = Schema.Struct({
  matches: Count,
  confirmed: Count,
  noise: Count,
  questions: Count,
  notExamined: Count,
}).annotate({ parseOptions: strict })
export type Counts = typeof Counts.Type
export const Decision = Schema.Union([
  Schema.Struct({ type: Schema.Literal("continue"), nextSeed: SeedRef }),
  Schema.Struct({ type: Schema.Literal("stop"), reason: GenerationStop, detail: Schema.optional(StageInvalidDetail) }),
]).annotate({ parseOptions: strict })
export type Decision = typeof Decision.Type

const reservationFields = {
  generationID: Digest,
  ordinal: Schema.Literals([1, 2, 3]),
  sourceSha256: Digest,
  seed: SeedRef,
  reservedAt: Count,
  proposalKey: Schema.NonEmptyString,
}
export const ReservationIdentity = Schema.Struct(reservationFields).annotate({ parseOptions: strict })
export type ReservationIdentity = typeof ReservationIdentity.Type
export const Reservation = Schema.Union([
  Schema.Struct({ ...reservationFields, status: Schema.Literal("reserved") }),
  Schema.Struct({ ...reservationFields, status: Schema.Literal("settled"), settlement: Schema.Struct({
    sha256: Digest,
    decision: Decision,
    counts: Schema.optional(Counts),
  }) }),
]).annotate({ parseOptions: strict })
export type Reservation = typeof Reservation.Type
const journalFields = {
  policy: Schema.Literal("audit-variants-v1"),
  limit: Schema.Literals([0, 3]),
  reservations: Schema.Array(Reservation).check(Schema.isMaxLength(3)),
}
export const VariantJournal = Schema.Union([
  Schema.Struct({ ...journalFields, phase: Schema.Literal("open") }),
  Schema.Struct({ ...journalFields, phase: Schema.Literal("closed"), stop: VariantStop }),
]).annotate({ parseOptions: strict })
export type VariantJournal = typeof VariantJournal.Type

export const NativeReply = Schema.Struct({
  replyID: Digest,
  sessionID: Schema.NonEmptyString,
  childKey: Schema.NonEmptyString,
  role: Schema.Literals(["lens", "verifier"]),
  turnKey: Schema.NonEmptyString,
  promptMessageID: Schema.NonEmptyString,
  assistantMessageID: Schema.NonEmptyString,
  textPartID: Schema.NonEmptyString,
  text: Schema.String,
  textSha256: Digest,
}).annotate({ parseOptions: strict })
export type NativeReply = typeof NativeReply.Type
export const NativeSearchAttempt = Schema.Struct({
  attemptID: Digest,
  sessionID: Schema.NonEmptyString,
  assistantMessageID: Schema.NonEmptyString,
  toolCallID: Schema.NonEmptyString,
  name: Schema.Literal("code_search"),
  sourceSha256: Digest,
  status: Schema.Literals(["pending", "running", "completed", "error"]),
  providerExecuted: Schema.Boolean,
  operationID: Schema.optional(Digest),
}).annotate({ parseOptions: strict })
export type NativeSearchAttempt = typeof NativeSearchAttempt.Type
export const CapturedRegion = Schema.Struct({
  regionID: Digest,
  sourceSha256: Digest,
  path: Schema.NonEmptyString,
  oid: Oid,
  blobSha256: Digest,
  startLine: Positive,
  endLine: Positive,
  text: Schema.String,
  textSha256: Digest,
}).annotate({ parseOptions: strict })
export type CapturedRegion = typeof CapturedRegion.Type
export const Examination = Schema.Struct({
  verifierSessionID: Schema.NonEmptyString,
  replyID: Digest,
  regionID: Digest,
  quoteRegionID: Schema.optional(Digest),
  offered: Schema.Array(Schema.NonEmptyString),
  verdictIndex: Count,
  candidateCap: Count,
  rawVerdict: ReviewResultV2.Verdict,
  verdict: ReviewResultV2.Verdict,
}).annotate({ parseOptions: strict })
export type Examination = typeof Examination.Type
export const SeedFinding = Schema.Struct({
  id: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  line: Positive,
  endLine: Schema.optional(Positive),
  severity: MaestroEvent.Review.Severity,
  class: Schema.NonEmptyString,
  node: Schema.NonEmptyString,
  lens: Schema.NonEmptyString,
  rule: Schema.NonEmptyString,
  trigger: Schema.NonEmptyString,
  rung: Schema.NonEmptyString,
  rungs: Schema.Array(Schema.NonEmptyString),
  history: Schema.Array(Rung),
  evidence: MaestroEvent.Review.Evidence,
}).annotate({ parseOptions: strict })
export type SeedFinding = typeof SeedFinding.Type
export const Seed = Schema.Struct({
  seedID: Digest,
  finding: SeedFinding,
  examination: Examination,
  toolProofID: Schema.optional(Digest),
}).annotate({ parseOptions: strict })
export type Seed = typeof Seed.Type

const matchFields = {
  matchID: Digest,
  path: Schema.NonEmptyString,
  oid: Oid,
  line: Positive,
  candidate: Schema.optional(Candidate),
}
export const MatchBase = Schema.Struct(matchFields).annotate({ parseOptions: strict })
export type MatchBase = typeof MatchBase.Type
export const MatchRecord = Schema.Union([
  Schema.Struct({ ...matchFields, state: Schema.Literal("confirmed"), findingID: Schema.NonEmptyString,
    seedID: Digest, examination: Examination }),
  Schema.Struct({ ...matchFields, state: Schema.Literal("noise"), refutation: Schema.NonEmptyString,
    examination: Examination }),
  Schema.Struct({ ...matchFields, state: Schema.Literal("question"), reason: Schema.NonEmptyString,
    examination: Examination }),
  Schema.Struct({ ...matchFields, state: Schema.Literal("not-examined"), reason: NotExaminedReason,
    regionID: Schema.optional(Digest), verifierSessionID: Schema.optional(Schema.NonEmptyString),
    replyID: Schema.optional(Digest) }),
]).annotate({ parseOptions: strict })
export type MatchRecord = typeof MatchRecord.Type
export const AcceptedSearch = Schema.Struct({
  status: Schema.Literal("accepted"),
  operationID: Digest,
  control: Schema.Struct({ path: Schema.NonEmptyString, line: Positive }),
  rawMatches: Count,
  distinctMatches: Count,
  excluded: Schema.Array(Schema.Struct({ matchID: Digest, path: Schema.NonEmptyString, line: Positive,
    reason: Schema.Literals(["seed", "already-confirmed", "processed"]) })),
  matches: Schema.Array(MatchRecord),
  counts: Counts,
}).annotate({ parseOptions: strict })
export type AcceptedSearch = typeof AcceptedSearch.Type
export const RejectedSearch = Schema.Struct({
  status: Schema.Literal("rejected"),
  reason: Schema.Literals(["stage-invalid", "search-unavailable", "search-incomplete", "seed-not-matched"]),
  detail: Schema.optional(StageInvalidDetail),
  operationID: Schema.optional(Digest),
}).annotate({ parseOptions: strict })
export type RejectedSearch = typeof RejectedSearch.Type
export const GenerationRecord = Schema.Struct({
  ...reservationFields,
  attempts: Schema.Array(NativeSearchAttempt),
  proposalReplyID: Schema.optional(Digest),
  proposal: Schema.optional(Proposal),
  search: Schema.Union([AcceptedSearch, RejectedSearch]),
  decision: Decision,
}).annotate({ parseOptions: strict })
export type GenerationRecord = typeof GenerationRecord.Type
export const Variants = Schema.Struct({
  policy: Schema.Literal("audit-variants-v1"),
  namespace: Digest,
  limit: Schema.Literals([0, 3]),
  stop: VariantStop,
  initialSeedIDs: Schema.Array(Digest),
  unexpandedInitialSeedIDs: Schema.Array(Digest),
  seeds: Schema.Array(Seed),
  generations: Schema.Array(GenerationRecord).check(Schema.isMaxLength(3)),
  regions: Schema.Array(CapturedRegion),
  replies: Schema.Array(NativeReply),
}).annotate({ parseOptions: strict })
export type Variants = typeof Variants.Type

// These common persisted fields retain the delivered Store schemas, including optional output/evidence.
const Model = Schema.Struct({ id: Schema.NonEmptyString, providerID: Schema.NonEmptyString, variant: Schema.optional(Schema.NonEmptyString) })
const IdentitySchema = Schema.Struct({
  key: Digest, leadID: SessionSchema.ID, parentID: SessionSchema.ID, projectID: Schema.NonEmptyString,
  location: Schema.Struct({ directory: Schema.NonEmptyString, workspaceID: Schema.optional(Schema.NonEmptyString) }),
  requestID: Schema.NonEmptyString, inputHash: Digest,
})
const ChildSchema = Schema.Struct({ id: SessionSchema.ID, key: Schema.NonEmptyString, role: Schema.Literals(["lead", "lens", "verifier"]) })
const recordFields = {
  identity: IdentitySchema,
  input: ReviewEngagementPolicyV2.Input, owner: Schema.NonEmptyString, model: Schema.optional(Model),
  budget: ReviewEngagementReportV2.Budget, source: Schema.optional(ReviewEngagementReportV2.Source),
  children: Schema.Array(ChildSchema), state: Schema.Literals(["running", "terminal"]), output: Schema.optional(Schema.String),
}
export const StateV1 = Schema.Struct({
  schema: Schema.Literal("review-engagement-state-v1"), ...recordFields,
}).annotate({ parseOptions: strict })
export type StateV1 = typeof StateV1.Type
export const StateV2 = Schema.Struct({
  schema: Schema.Literal("review-engagement-state-v2"), ...recordFields,
  evidence: Schema.optional(ReviewEvidenceSchemaV2.EvidenceState),
}).annotate({ parseOptions: strict })
export type StateV2 = typeof StateV2.Type
export const StateV3 = Schema.Struct({
  schema: Schema.Literal("review-engagement-state-v3"), ...recordFields,
  evidence: Schema.optional(ReviewEvidenceSchemaV2.EvidenceState),
  variants: VariantJournal,
}).annotate({ parseOptions: strict })
export type StateV3 = typeof StateV3.Type
