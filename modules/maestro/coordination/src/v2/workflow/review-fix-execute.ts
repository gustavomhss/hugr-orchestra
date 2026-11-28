export * as ReviewFixExecuteV2 from "./review-fix-execute"

import { Effect } from "effect"
import { SessionSchema } from "@orchestra/core/session"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import { ReviewEvidenceCollectorV2 } from "./review-engagement-artifact-collector"
import { ReviewEngagementReportV2 } from "./review-engagement-report"
import { ReviewFixJudgmentV2 } from "./review-fix-judgment"
import { ReviewFixPriorV2 } from "./review-fix-prior"
import { ReviewFixRetestV2 } from "./review-fix-retest"
import { ReviewFixSchemaV2 } from "./review-fix-schema"
import { ReviewVariantSchemaV2 } from "./review-variant-schema"

export type Input = {
  readonly inputHash: string
  readonly sessionID: SessionSchema.ID
  readonly source: ReviewEngagementReportV2.Source
  readonly previous: ReviewFixPriorV2.Loaded
  readonly snapshot: ReviewEvidenceCollectorV2.Snapshot
  readonly read: (path: string, startLine: number, endLine: number) => Effect.Effect<ReturnType<typeof ReviewFixJudgmentV2.region>, Tool.Failure>
  readonly verifier: (finding: ReviewFixJudgmentV2.Finding, regions: readonly ReviewVariantSchemaV2.CapturedRegion[], observations: readonly ReviewFixSchemaV2.ToolObservation[]) => Effect.Effect<ReviewVariantSchemaV2.NativeReply, Tool.Failure>
}

export type Output = {
  readonly dispositions: ReviewFixSchemaV2.FixResult["dispositions"]
  readonly citations: ReviewFixSchemaV2.FixResult["citations"]
  readonly questions: ReviewFixSchemaV2.FixResult["questions"]
  readonly notExamined: ReviewFixSchemaV2.FixResult["notExamined"]
  readonly observations: ReviewFixSchemaV2.FixReceipt["observations"]
  readonly examinations: ReviewFixSchemaV2.FixReceipt["examinations"]
  readonly regions: ReviewFixSchemaV2.FixReceipt["regions"]
  readonly replies: ReviewFixSchemaV2.FixReceipt["replies"]
}
type NotExaminedReason = Extract<ReviewFixSchemaV2.Disposition, { readonly disposition: "not-examined" }>["reason"]

export function run(input: Input): Effect.Effect<Output, Tool.Failure> {
  const selected = ReviewFixJudgmentV2.sort(input.previous.selected)
  const cap = input.previous.tier.budget.verifiers
  const admitted = selected.slice(0, cap)
  const deferred = new Map<string, NotExaminedReason>(selected.slice(cap).map((item) =>
    [item.finding.id, cap === 0 ? "independent-verification-unavailable" : "verification-budget"]))
  const results = new Map<string, { readonly examination: ReviewFixSchemaV2.Examination; readonly regions: readonly ReviewVariantSchemaV2.CapturedRegion[]; readonly reply: ReviewVariantSchemaV2.NativeReply }>()
  const observations: ReviewFixSchemaV2.ToolObservation[] = []
  return Effect.gen(function* () {
    const retests = yield* Effect.forEach(admitted, (item) => {
      if (item.finding.evidence.kind !== "tool" || !item.native)
        return Effect.succeed(undefined)
      return Effect.map(observe(input, item), (observed) => ({ item, observed }))
    }, { concurrency: 2 })
    const observationByFinding = new Map<string, ReviewFixSchemaV2.ToolObservation>()
    for (const retest of retests) {
      if (!retest) continue
      if (typeof retest.observed === "string") {
        deferred.set(retest.item.finding.id, reason(retest.observed))
        continue
      }
      observationByFinding.set(retest.item.finding.id, retest.observed)
      observations.push(retest.observed)
    }
    const outcomes = yield* Effect.forEach(admitted, (item) => Effect.gen(function* () {
      const id = item.finding.id
      if (deferred.has(id)) return undefined
      const initial = yield* Effect.forEach(ReviewFixJudgmentV2.regions(item), (range) => input.read(range.path, range.startLine, range.endLine),
        { concurrency: 2 }).pipe(Effect.catch((error) => regionUnavailable(error) ? Effect.succeed(undefined) : Effect.fail(error)))
      if (!initial) {
        deferred.set(id, "region-unavailable")
        return undefined
      }
      const currentRegions = [...new Map(initial.map((region) => [region.regionID, region])).values()]
      const observation = observationByFinding.get(id)
      const findingObservations = observation ? [observation] : []
      const reply = yield* input.verifier(item, currentRegions, findingObservations)
      const parsed = yield* judge(() => ReviewFixJudgmentV2.parse(reply.text))
      for (const support of parsed.supporting) {
        if (support.kind !== "quote" || currentRegions.some((region) => region.path === support.path &&
          region.startLine === support.startLine && region.endLine === support.endLine)) continue
        if (!item.files.includes(support.path)) return yield* invalid("fix verifier supplied a foreign quote")
        const extra = yield* input.read(support.path, support.startLine, support.endLine).pipe(
          Effect.catch((error) => regionUnavailable(error) ? Effect.fail(invalid("fix verifier supplied an unavailable quote")) : Effect.fail(error)))
        currentRegions.push(extra)
      }
      const examination = yield* judge(() => ReviewFixJudgmentV2.examine({ inputHash: input.inputHash, source: input.source,
        priorSource: input.previous.source, finding: item, relatedFiles: item.files, regions: currentRegions,
        observations: findingObservations, reply }))
      return { id, examination, regions: currentRegions, reply }
    }), { concurrency: 2 })
    for (const outcome of outcomes) if (outcome) results.set(outcome.id, outcome)
    const final = buildOutput(input, results, deferred, observations)
    return final
  })
}

function buildOutput(input: Input, results: ReadonlyMap<string, { readonly examination: ReviewFixSchemaV2.Examination; readonly regions: readonly ReviewVariantSchemaV2.CapturedRegion[]; readonly reply: ReviewVariantSchemaV2.NativeReply }>, deferred: ReadonlyMap<string, NotExaminedReason>, observations: readonly ReviewFixSchemaV2.ToolObservation[]): Output {
  const examinations = [...results.values()].map((item) => item.examination)
  const usedObservationIDs = new Set(examinations.flatMap((item) => item.offeredObservationIDs))
  const replies = [...results.values()].map((item) => item.reply)
  const regions = [...new Map([...results.values()].flatMap((item) => item.regions).map((item) => [item.regionID, item])).values()]
  const dispositions = input.previous.selected.map((item) => {
    const result = results.get(item.finding.id)
    if (result) return { findingID: item.finding.id, priorFindingSha256: item.priorFindingSha256,
      disposition: result.examination.disposition, reason: result.examination.reason, examinationID: result.examination.examinationID }
    return { findingID: item.finding.id, priorFindingSha256: item.priorFindingSha256,
      disposition: "not-examined" as const, reason: deferred.get(item.finding.id) ?? "independent-verification-unavailable" as const }
  })
  const citations = [...new Map([...results.values()].flatMap((item) => item.examination.rawReturn.supporting.flatMap((support) => {
    if (support.kind !== "quote") return []
    const region = item.regions.find((entry) => entry.path === support.path && entry.startLine === support.startLine && entry.endLine === support.endLine)
    if (!region) return []
    const citation = { path: region.path, oid: region.oid, startLine: region.startLine, endLine: region.endLine,
      text: region.text, sha256: region.textSha256 }
    return [[ReviewEngagementReportV2.canonical(citation), { ...citation,
      uri: `review-engagement://${input.sessionID}/citation/${ReviewEngagementReportV2.digest(citation)}` }]]
  })).values()]
  const questions = dispositions.flatMap((item) => item.disposition === "question"
    ? [{ findingID: item.findingID, question: item.reason }] : [])
  const notExamined = dispositions.flatMap((item) => item.disposition === "not-examined"
    ? [{ item: item.findingID, reason: item.reason }] : [])
  if (input.previous.binding.profile === "artifact") notExamined.push({ item: "artifact:behavioral-eval", reason: "owner-permission" })
  return { dispositions, citations, questions, notExamined,
    observations: observations.filter((item) => usedObservationIDs.has(item.observationID)), examinations, regions, replies }
}

function invalid(detail: string) {
  return new Tool.Failure({ message: `engagement-report-invalid: ${detail}`, metadata: { reason: "engagement-report-invalid" } })
}

function judge<A>(read: () => A) {
  return Effect.try({ try: read, catch: (error) => error instanceof Tool.Failure ? error : invalid(String(error)) })
}

function regionUnavailable(error: Tool.Failure) {
  return error.metadata?.reason === "engagement-region" || error.metadata?.reason === "engagement-encoding"
}

function reason(value: string): NotExaminedReason {
  if (value.includes("runtime-unavailable")) return "runtime-unavailable"
  if (value.includes("native-runtime-unqualified")) return "native-runtime-unqualified"
  if (value.includes("recipe-incompatible")) return "recipe-incompatible"
  if (value.includes("probe-unqualified")) return "probe-unqualified"
  return "runtime-unavailable"
}

function observe(input: Input, item: ReviewFixPriorV2.Selected): Effect.Effect<ReviewFixSchemaV2.ToolObservation | string, Tool.Failure> {
  const analysis = input.snapshot.operations.find((operation) => operation.kind === "analysis" &&
    operation.operationID === input.snapshot.finalAnalysisOperationID)
  if (!analysis || !item.native) return Effect.succeed("runtime-unavailable")
  return Effect.try({ try: () => ReviewFixRetestV2.observe({ inputHash: input.inputHash, findingID: item.finding.id,
    priorProof: item.native.proof, priorRecipe: item.native.recipe, analysis, hostProofs: input.snapshot.hostProofs,
    bodies: input.snapshot.bodies }), catch: (error) => error instanceof Tool.Failure ? error : ReviewEvidenceSchemaV2.failure("corrupt", String(error)) })
}
