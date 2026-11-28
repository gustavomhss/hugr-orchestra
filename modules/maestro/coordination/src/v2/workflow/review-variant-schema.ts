export * as ReviewVariantSchemaV2 from "./review-variant-schema"

import { Schema } from "effect"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { ReviewResultV2 } from "../governance/review-result"
import { ReviewEngagementReportV2 } from "./review-engagement-report"

export const strict = { onExcessProperty: "error" } as const
export const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
export const Oid = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/))
export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))
export const Positive = Count.check(Schema.isGreaterThan(0))
export const Ordinal = Schema.Literals([1, 2, 3])
export type Ordinal = typeof Ordinal.Type

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

const Rung = Schema.Struct({ option: Schema.NonEmptyString,
  outcome: Schema.Literals(["settled", "unsettled", "refused", "not-run"]),
  detail: Schema.optional(Schema.NonEmptyString) })

export const Candidate = Schema.Struct({
  path: Schema.NonEmptyString, line: Positive, endLine: Schema.optional(Positive),
  severity: MaestroEvent.Review.Severity, trigger: Schema.NonEmptyString, quote: Schema.NonEmptyString,
}).annotate({ parseOptions: strict })
export type Candidate = typeof Candidate.Type
export const Proposal = Schema.Struct({
  seedFindingID: Schema.NonEmptyString, patternChange: Schema.NonEmptyString,
  candidates: Schema.Array(Candidate).check(Schema.isMaxLength(200)),
}).annotate({ parseOptions: strict })
export type Proposal = typeof Proposal.Type
export const SeedRef = Schema.Struct({ seedID: Digest, findingID: Schema.NonEmptyString }).annotate({ parseOptions: strict })
export type SeedRef = typeof SeedRef.Type
export const Counts = Schema.Struct({
  matches: Count, confirmed: Count, noise: Count, questions: Count, notExamined: Count,
}).annotate({ parseOptions: strict })
export type Counts = typeof Counts.Type
export const Decision = Schema.Union([
  Schema.Struct({ type: Schema.Literal("continue"), nextSeed: SeedRef }),
  Schema.Struct({ type: Schema.Literal("stop"), reason: GenerationStop, detail: Schema.optional(StageInvalidDetail) }),
]).annotate({ parseOptions: strict })
export type Decision = typeof Decision.Type

const reservationFields = {
  generationID: Digest, ordinal: Ordinal, sourceSha256: Digest, seed: SeedRef,
  reservedAt: Count, proposalKey: Schema.NonEmptyString,
}
export const ReservationIdentity = Schema.Struct(reservationFields).annotate({ parseOptions: strict })
export type ReservationIdentity = typeof ReservationIdentity.Type
export const Reservation = Schema.Union([
  Schema.Struct({ ...reservationFields, status: Schema.Literal("reserved") }),
  Schema.Struct({ ...reservationFields, status: Schema.Literal("settled"), settlement: Schema.Struct({
    sha256: Digest, decision: Decision, counts: Schema.optional(Counts),
  }) }),
]).annotate({ parseOptions: strict })
export type Reservation = typeof Reservation.Type
const journalFields = {
  policy: Schema.Literal("audit-variants-v1"), limit: Schema.Literals([0, 3]),
  reservations: Schema.Array(Reservation).check(Schema.isMaxLength(3)),
}
export const VariantJournal = Schema.Union([
  Schema.Struct({ ...journalFields, phase: Schema.Literal("open") }),
  Schema.Struct({ ...journalFields, phase: Schema.Literal("closed"), stop: VariantStop }),
]).annotate({ parseOptions: strict })
export type VariantJournal = typeof VariantJournal.Type

export const NativeReply = Schema.Struct({
  replyID: Digest, sessionID: Schema.NonEmptyString, childKey: Schema.NonEmptyString,
  role: Schema.Literals(["lens", "verifier"]), turnKey: Schema.NonEmptyString,
  promptMessageID: Schema.NonEmptyString, assistantMessageID: Schema.NonEmptyString,
  textPartID: Schema.NonEmptyString, text: Schema.String, textSha256: Digest,
}).annotate({ parseOptions: strict })
export type NativeReply = typeof NativeReply.Type
export const NativeSearchAttempt = Schema.Struct({
  attemptID: Digest, sessionID: Schema.NonEmptyString, assistantMessageID: Schema.NonEmptyString,
  toolCallID: Schema.NonEmptyString, name: Schema.Literal("code_search"), sourceSha256: Digest,
  status: Schema.Literals(["pending", "running", "completed", "error"]),
  providerExecuted: Schema.Boolean, operationID: Schema.optional(Digest),
}).annotate({ parseOptions: strict })
export type NativeSearchAttempt = typeof NativeSearchAttempt.Type
export const CapturedRegion = Schema.Struct({
  regionID: Digest, sourceSha256: Digest, path: Schema.NonEmptyString, oid: Oid, blobSha256: Digest,
  startLine: Positive, endLine: Positive, text: Schema.String, textSha256: Digest,
}).annotate({ parseOptions: strict })
export type CapturedRegion = typeof CapturedRegion.Type
export const Examination = Schema.Struct({
  verifierSessionID: Schema.NonEmptyString, replyID: Digest, regionID: Digest,
  quoteRegionID: Schema.optional(Digest), offered: Schema.Array(Schema.NonEmptyString),
  verdictIndex: Count, candidateCap: Count, rawVerdict: ReviewResultV2.Verdict, verdict: ReviewResultV2.Verdict,
}).annotate({ parseOptions: strict })
export type Examination = typeof Examination.Type
export const SeedFinding = Schema.Struct({
  id: Schema.NonEmptyString, path: Schema.NonEmptyString, line: Positive, endLine: Schema.optional(Positive),
  severity: MaestroEvent.Review.Severity, class: Schema.NonEmptyString, node: Schema.NonEmptyString,
  lens: Schema.NonEmptyString, rule: Schema.NonEmptyString, trigger: Schema.NonEmptyString,
  rung: Schema.NonEmptyString, rungs: Schema.Array(Schema.NonEmptyString), history: Schema.Array(Rung),
  evidence: MaestroEvent.Review.Evidence,
}).annotate({ parseOptions: strict })
export type SeedFinding = typeof SeedFinding.Type
export const Seed = Schema.Struct({
  seedID: Digest, finding: SeedFinding, examination: Examination, toolProofID: Schema.optional(Digest),
}).annotate({ parseOptions: strict })
export type Seed = typeof Seed.Type

const matchFields = { matchID: Digest, path: Schema.NonEmptyString, oid: Oid, line: Positive, candidate: Schema.optional(Candidate) }
export const MatchBase = Schema.Struct(matchFields).annotate({ parseOptions: strict })
export type MatchBase = typeof MatchBase.Type
export const MatchRecord = Schema.Union([
  Schema.Struct({ ...matchFields, state: Schema.Literal("confirmed"), findingID: Schema.NonEmptyString,
    seedID: Digest, examination: Examination }),
  Schema.Struct({ ...matchFields, state: Schema.Literal("noise"), refutation: Schema.NonEmptyString, examination: Examination }),
  Schema.Struct({ ...matchFields, state: Schema.Literal("question"), reason: Schema.NonEmptyString, examination: Examination }),
  Schema.Struct({ ...matchFields, state: Schema.Literal("not-examined"), reason: NotExaminedReason,
    regionID: Schema.optional(Digest), verifierSessionID: Schema.optional(Schema.NonEmptyString), replyID: Schema.optional(Digest) }),
]).annotate({ parseOptions: strict })
export type MatchRecord = typeof MatchRecord.Type
export const AcceptedSearch = Schema.Struct({
  status: Schema.Literal("accepted"), operationID: Digest,
  control: Schema.Struct({ path: Schema.NonEmptyString, line: Positive }), rawMatches: Count, distinctMatches: Count,
  excluded: Schema.Array(Schema.Struct({ matchID: Digest, path: Schema.NonEmptyString, line: Positive,
    reason: Schema.Literals(["seed", "already-confirmed", "processed"]) })),
  matches: Schema.Array(MatchRecord), counts: Counts,
}).annotate({ parseOptions: strict })
export type AcceptedSearch = typeof AcceptedSearch.Type
export const RejectedSearch = Schema.Struct({
  status: Schema.Literal("rejected"),
  reason: Schema.Literals(["stage-invalid", "search-unavailable", "search-incomplete", "seed-not-matched"]),
  detail: Schema.optional(StageInvalidDetail), operationID: Schema.optional(Digest),
}).annotate({ parseOptions: strict })
export type RejectedSearch = typeof RejectedSearch.Type
export const GenerationRecord = Schema.Struct({
  ...reservationFields, attempts: Schema.Array(NativeSearchAttempt), proposalReplyID: Schema.optional(Digest),
  proposal: Schema.optional(Proposal), search: Schema.Union([AcceptedSearch, RejectedSearch]), decision: Decision,
}).annotate({ parseOptions: strict })
export type GenerationRecord = typeof GenerationRecord.Type
export const Variants = Schema.Struct({
  policy: Schema.Literal("audit-variants-v1"), namespace: Digest, limit: Schema.Literals([0, 3]), stop: VariantStop,
  initialSeedIDs: Schema.Array(Digest), unexpandedInitialSeedIDs: Schema.Array(Digest), seeds: Schema.Array(Seed),
  generations: Schema.Array(GenerationRecord).check(Schema.isMaxLength(3)),
  regions: Schema.Array(CapturedRegion), replies: Schema.Array(NativeReply),
}).annotate({ parseOptions: strict })
export type Variants = typeof Variants.Type

export const canonical = ReviewEngagementReportV2.canonical
export const digest = ReviewEngagementReportV2.digest
export const same = (left: unknown, right: unknown) => canonical(left) === canonical(right)

export function seedID(sourceSha256: string, finding: SeedFinding) {
  return digest({ schema: "review-variant-seed-v1", sourceSha256, finding })
}

export function generationID(value: { readonly namespace: string; readonly inputHash: string;
  readonly sourceSha256: string; readonly ordinal: number; readonly seedID: string }) {
  return digest({ schema: "review-variant-generation-v1", namespace: value.namespace, inputHash: value.inputHash,
    sourceSha256: value.sourceSha256, ordinal: value.ordinal, seedID: value.seedID })
}

export function matchID(value: { readonly sourceSha256: string; readonly defectClass: string; readonly path: string; readonly line: number }) {
  return digest({ schema: "review-variant-match-v1", sourceSha256: value.sourceSha256,
    defectClass: value.defectClass, path: value.path, line: value.line })
}

export function regionID(value: Pick<CapturedRegion, "sourceSha256" | "path" | "oid" | "blobSha256" | "startLine" | "endLine" | "textSha256">) {
  return digest({ schema: "review-variant-region-v1", sourceSha256: value.sourceSha256, path: value.path, oid: value.oid,
    blobSha256: value.blobSha256, startLine: value.startLine, endLine: value.endLine, textSha256: value.textSha256 })
}

export function replyID(inputHash: string, value: Pick<NativeReply, "sessionID" | "promptMessageID" | "assistantMessageID" | "textPartID" | "textSha256">) {
  return digest({ schema: "review-variant-reply-v1", inputHash, sessionID: value.sessionID,
    promptMessageID: value.promptMessageID, assistantMessageID: value.assistantMessageID,
    textPartID: value.textPartID, textSha256: value.textSha256 })
}

export const childID = (namespace: string, key: string, role: "lens" | "verifier") =>
  `ses_lucy_engagement_${digest({ namespace, key, role })}`
export const promptID = (namespace: string, child: string, turn: string) =>
  `msg_lucy_engagement_${digest({ key: namespace, child, turn })}`
export const findingID = (ordinal: number, id: string) => `V${ordinal}-${id}`

/** Exact durable projection: no pending reservation or inferred zero count can enter a completed seal. */
export function projectJournal(value: Variants): Extract<VariantJournal, { readonly phase: "closed" }> {
  return { policy: value.policy, limit: value.limit, reservations: value.generations.map((generation) => ({
    generationID: generation.generationID, ordinal: generation.ordinal, sourceSha256: generation.sourceSha256,
    seed: generation.seed, reservedAt: generation.reservedAt, proposalKey: generation.proposalKey, status: "settled",
    settlement: { sha256: digest(generation), decision: generation.decision,
      ...(generation.search.status === "accepted" ? { counts: generation.search.counts } : {}) },
  })), phase: "closed", stop: value.stop }
}

export function countMatches(matches: readonly MatchRecord[]): Counts {
  return { matches: matches.length, confirmed: matches.filter((item) => item.state === "confirmed").length,
    noise: matches.filter((item) => item.state === "noise").length,
    questions: matches.filter((item) => item.state === "question").length,
    notExamined: matches.filter((item) => item.state === "not-examined").length }
}

