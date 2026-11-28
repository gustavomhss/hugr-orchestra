export * as ReviewFixArtifactsV2 from "./review-fix-artifacts"

import { Effect, Schema } from "effect"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewEngagementStoreV2 } from "../tools/review-engagement-store"
import type { ReviewEvidenceCollectorV2 } from "./review-engagement-artifact-collector"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import type { ReviewEngagementArtifactsV2 } from "./review-engagement-artifacts"
import { ReviewEngagementReportV2 } from "./review-engagement-report"
import { ReviewFixAuthorityV2 } from "./review-fix-authority"
import { ReviewFixPriorV2 } from "./review-fix-prior"
import { ReviewFixSchemaV2 } from "./review-fix-schema"
import { ReviewFixValidationV2 } from "./review-fix-validation"

const ensure: typeof ReviewEvidenceSchemaV2.require = ReviewEvidenceSchemaV2.require
const { failure, same, hash } = ReviewEvidenceSchemaV2
const { canonical, digest } = ReviewEngagementReportV2

function checked<A>(read: () => A) {
  return Effect.try({ try: read, catch: (error) => error instanceof Tool.Failure &&
    error.metadata?.reason === "engagement-evidence-bound-exceeded" ? error : failure("corrupt", String(error)) })
}

export function load(repository: ReviewEngagementArtifactsV2.Repository,
  view: { readonly terminal: ReviewFixSchemaV2.Stored; readonly evidence: ReviewEvidenceSchemaV2.EvidenceState } &
    ReviewFixAuthorityV2.FixAuthority) {
  return Effect.gen(function* () {
    if (view.terminal.value.status !== "completed") return yield* failure("unavailable", "terminal-status")
    const id = view.evidence.receiptID
    const size = view.evidence.bytes
    if (!id || size === undefined || size > ReviewEvidenceSchemaV2.limits.receipt)
      return yield* failure("corrupt", "completed fix has no bounded receipt")
    const bytes = yield* repository.storage.read(id, size, "application/json")
    const receipt = yield* checked(() => {
      const value = Schema.decodeUnknownSync(ReviewFixSchemaV2.FixReceipt)(ReviewEvidenceSchemaV2.json(bytes))
      ensure(canonical(value) === new TextDecoder().decode(bytes), "fix receipt is not canonical")
      ensure(same(value.artifacts, ReviewFixPriorV2.mergeArtifacts(value.artifacts, [])), "fix artifacts are not unique and ordered")
      return value
    })
    return { receipt, bytes, receiptID: id, bodies: loadBodies(repository, receipt, view.terminal, view) }
  })
}

export function replay(repository: ReviewEngagementArtifactsV2.Repository, view: ReviewEngagementStoreV2.FixTerminal) {
  if (view.terminal.value.status !== "completed") return Effect.succeed(view.terminal.text)
  return load(repository, view).pipe(Effect.flatMap((held) => held.bodies), Effect.as(view.terminal.text))
}

export function publish(repository: ReviewEngagementArtifactsV2.Repository, input: {
  readonly authority: ReviewFixAuthorityV2.FixAuthority
  readonly report: ReviewFixSchemaV2.Stored
  readonly previous: ReviewFixPriorV2.Loaded
  readonly snapshot: ReviewEvidenceCollectorV2.Snapshot
  readonly observations: ReviewFixSchemaV2.FixReceipt["observations"]
  readonly examinations: ReviewFixSchemaV2.FixReceipt["examinations"]
  readonly regions: ReviewFixSchemaV2.FixReceipt["regions"]
  readonly replies: ReviewFixSchemaV2.FixReceipt["replies"]
}) {
  return Effect.gen(function* () {
    const value = input.report.value
    if (!value.source) return yield* failure("corrupt", "fix receipt has no captured source")
    const quotes = value.citations.map((item) => ({
      uri: item.uri, ...ReviewFixPriorV2.wrapper("citation", Buffer.from(item.text), "text/plain", item.uri),
    }))
    const artifacts = yield* checked(() => ReviewFixPriorV2.mergeArtifacts(input.previous.artifacts,
      [...input.snapshot.artifacts, ...quotes.map((quote) => quote.descriptor)]))
    for (const quote of quotes) {
      const sha256 = yield* repository.storage.publish(quote.bytes, quote.descriptor.mime)
      if (sha256 !== quote.descriptor.sha256) return yield* failure("corrupt", "published fix citation differs")
    }
    const receipt: ReviewFixSchemaV2.FixReceipt = { schema: "review-engagement-fix-evidence-v1",
      reportID: value.reportID, inputHash: value.inputHash, sessionID: value.sessionID,
      sourceSha256: value.source.sha256, budget: value.budget, prior: input.previous.reference,
      finalAnalysisOperationID: input.snapshot.finalAnalysisOperationID, operations: input.snapshot.operations,
      artifacts, citations: quotes.map((quote) => ({ uri: quote.uri, artifactID: quote.descriptor.artifactID })),
      hostProofs: input.snapshot.hostProofs,
      ...(input.snapshot.scopedProbes.length ? { scopedProbes: input.snapshot.scopedProbes } : {}), observations: input.observations, examinations: input.examinations,
      regions: input.regions, replies: input.replies, notExamined: value.notExamined }
    const bytes = Buffer.from(canonical(receipt))
    if (bytes.length > ReviewEvidenceSchemaV2.limits.receipt) return yield* failure("bound-exceeded", "receipt")
    const receiptID = yield* repository.storage.publish(bytes, "application/json")
    const verified = yield* load(repository, { ...input.authority, terminal: input.report,
      evidence: { policy: "required-completed-v1", receiptID, bytes: bytes.length } })
    yield* verified.bodies
    return ReviewFixAuthorityV2.seal(receiptID, bytes.length, input.report, input.authority)
  })
}

function loadBodies(repository: ReviewEngagementArtifactsV2.Repository, receipt: ReviewFixSchemaV2.FixReceipt,
  report: ReviewFixSchemaV2.Stored, authority: ReviewFixAuthorityV2.FixAuthority) {
  return Effect.gen(function* () {
    const storage = repository.storage
    const value = report.value
    const source = value.source
    if (!source || !value.prior || receipt.reportID !== value.reportID || receipt.inputHash !== value.inputHash ||
      receipt.sessionID !== value.sessionID || receipt.sourceSha256 !== source.sha256 ||
      !same(receipt.budget, value.budget) || !same(receipt.prior.binding, value.prior) ||
      !same(receipt.notExamined, value.notExamined))
      return yield* failure("corrupt", "fix receipt differs from retained report")
    const descriptors = new Map(receipt.artifacts.map((item) => [item.artifactID, item]))
    const bodies = new Map(yield* Effect.forEach(receipt.artifacts, (item) => Effect.gen(function* () {
      const { artifactID, ...payload } = item
      if (artifactID !== digest(payload)) return yield* failure("corrupt", "fix artifact descriptor hash differs")
      const bytes = yield* storage.read(item.sha256, item.bytes, item.mime)
      if (hash(bytes) !== item.sha256 || bytes.length !== item.bytes) return yield* failure("corrupt", "fix artifact bytes differ")
      return [item.artifactID, bytes] as const
    })))
    const body: ReviewFixValidationV2.Body = (id, kind) => {
      const found = descriptors.get(id)
      const bytes = bodies.get(id)
      ensure(found && bytes && (kind === undefined || kind === found.kind), "fix artifact has no matching descriptor and body")
      return bytes
    }
    const prior = yield* checked(() => ReviewEvidenceSchemaV2.json(body(receipt.prior.authorityArtifactID, "fix-prior-authority")))
    const view = yield* ReviewEngagementStoreV2.readPriorAuthority(prior).pipe(
      Effect.mapError((error) => failure("corrupt", error.message)))
    const findings = yield* ReviewFixPriorV2.preflight(view, value.profile, authority.input.fixReview?.findingIDs ?? [])
      .pipe(Effect.mapError((error) => failure("corrupt", error.message)))
    const imported = yield* checked(() => {
      ensure(view.identity.parentID === authority.identity.parentID && view.identity.projectID === authority.identity.projectID &&
        same(view.identity.location, authority.identity.location) &&
        view.terminal.value.reportID === authority.input.fixReview?.reportID, "imported predecessor authority differs")
      const oldText = new TextDecoder().decode(body(receipt.prior.reportArtifactID, "fix-prior-report"))
      ensure(oldText === view.terminal.text, "imported predecessor report bytes differ")
      const bytes = body(receipt.prior.receiptArtifactID, "fix-prior-receipt")
      const receiptID = hash(bytes)
      ensure(view.schema !== "review-engagement-state-v1" && view.evidence?.receiptID === receiptID &&
        view.evidence.bytes === bytes.length, "imported predecessor receipt bytes differ")
      return { bytes, receiptID }
    })
    // Imported predecessor evidence crosses the same full native-settlement boundary as ordinary replay.
    const data = yield* repository.priorData(view)
    yield* checked(() => {
      ensure(data.receiptID === imported.receiptID && Buffer.from(data.bytes).equals(Buffer.from(imported.bytes)),
        "validated predecessor receipt differs from imported bytes")
      const previous = ReviewFixPriorV2.prepare(view, value.inputHash, findings, data)
      ensure(same(previous.reference, receipt.prior) && previous.artifacts.every((item) => same(descriptors.get(item.artifactID) ?? null, item)),
        "imported predecessor closure differs")
      ReviewFixValidationV2.validate(receipt, value, source, authority, previous, body)
    })
    return bodies
  })
}
