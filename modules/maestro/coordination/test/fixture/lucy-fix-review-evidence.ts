import { expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { SessionSchema } from "@orchestra/core/session"
import { SessionTable } from "@orchestra/core/session/sql"
import { ReviewEvidenceSchemaV2 } from "../../src/v2/workflow/review-engagement-artifact-schema"
import type { Ctx, Fixture } from "./lucy-engagement"
import { blobRoot, canonical, digest, manifest, readAll, reader, receipt, refused, required,
  ReceiptV1, type Report } from "./lucy-engagement-artifacts"
import { decodedFix } from "./lucy-fix-review"
import { FixReceipt, StateV4, type FixResult } from "./lucy-fix-review-schema"
import { StateV1, StateV2, StateV3, strict } from "./lucy-variant-schema"

export const saved = (host: Ctx, sessionID: SessionSchema.ID) => Effect.gen(function* () {
  const row = yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
  const raw = row?.metadata?.lucyEngagementV1
  if (!row || !raw || typeof raw !== "object" || Array.isArray(raw)) return yield* Effect.die("native engagement metadata missing")
  return { row, raw: Object.fromEntries(Object.entries(raw)) }
})

export const stateV4 = (host: Ctx, sessionID: SessionSchema.ID) => saved(host, sessionID).pipe(
  Effect.map((held) => ({ ...held, value: Schema.decodeUnknownSync(StateV4)(held.raw, strict) })),
)

/** The same real blob backend as the delivered replay tests; no synthetic process/evidence producer. */
export const publish = (root: Fixture, host: Ctx, bytes: Uint8Array) => Effect.gen(function* () {
  const storage = yield* CapabilityArtifacts.storage({ root: blobRoot(root, host), boundedBytes: 16 * 1024 * 1024,
    quota: 64 * 1024 * 1024 }).pipe(Effect.provideService(Database.Service, host.database),
    Effect.provideService(Global.Service, root.global), Effect.orDie)
  const receiptID = yield* storage.blobs.publish(bytes, "application/json").pipe(Effect.orDie)
  return { receiptID, bytes: bytes.byteLength }
}).pipe(Effect.provide(AppNodeBuilder.build(FSUtil.node)))

/** Public manifest/pages are the observation; the helper does not read internal temp URIs. */
export const fixReceipt = (host: Ctx, report: FixResult) => Effect.gen(function* () {
  expect(report.status).toBe("completed")
  const prior = report.prior
  const source = report.source
  if (!prior || !source) return yield* Effect.die("completed fix omitted its prior/source")
  const index = (yield* manifest(host, report.reportID)).value
  const body = yield* readAll(host, index, index.manifest)
  const value = Schema.decodeUnknownSync(FixReceipt)(JSON.parse(body.bytes.toString("utf8")), strict)
  expect(body.bytes.toString("utf8")).toBe(canonical(value))
  expect(value).toMatchObject({ reportID: report.reportID, inputHash: report.inputHash, sessionID: report.sessionID,
    sourceSha256: source.sha256, budget: report.budget, prior: { binding: prior } })
  expect(value.notExamined).toEqual(report.notExamined)
  expect(index.counts).toEqual({ operations: value.operations.length, artifacts: value.artifacts.length, hostProofs: value.hostProofs.length })
  expect(value.artifacts.map((artifact) => artifact.artifactID)).toEqual([...new Set(value.artifacts.map((artifact) => artifact.artifactID))].sort())
  expect(value.artifacts.length).toBeLessThanOrEqual(256)
  expect(value.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0)).toBeLessThanOrEqual(64 * 1024 * 1024)
  expect(value.operations.filter((operation) => operation.kind === "code").length).toBeLessThanOrEqual(128)
  const bodies = new Map<string, Buffer>()
  for (const artifact of value.artifacts) {
    const { artifactID, ...descriptor } = artifact
    expect(artifactID).toBe(digest(canonical(descriptor)))
    expect(artifact.bytes).toBeLessThanOrEqual(16 * 1024 * 1024)
    bodies.set(artifactID, (yield* readAll(host, index, artifact)).bytes)
  }
  const priorOutput = required(bodies, value.prior.reportArtifactID).toString("utf8")
  const priorReceiptBytes = required(bodies, value.prior.receiptArtifactID)
  const priorReceipt = Schema.decodeUnknownSync(ReviewEvidenceSchemaV2.Receipt)(JSON.parse(priorReceiptBytes.toString("utf8")), strict)
  const authorityBytes = required(bodies, value.prior.authorityArtifactID)
  const authority = Schema.decodeUnknownSync(Schema.Union([StateV2, StateV3]))(JSON.parse(authorityBytes.toString("utf8")), strict)
  expect(authority.state).toBe("terminal")
  expect(authority.output).toBe(priorOutput)
  expect(authority.schema).toBe(prior.priorStateSchema)
  expect(digest(authorityBytes)).toBe(prior.authoritySha256)
  expect(digest(priorReceiptBytes)).toBe(prior.receiptID)
  expect(priorReceiptBytes.length).toBe(prior.receiptBytes)
  expect(priorReceipt.reportID).toBe(prior.reportID)
  expect(priorReceipt.inputHash).toBe(prior.priorInputHash)
  expect(priorReceipt.sourceSha256).toBe(prior.priorSourceSha256)
  expect(value.prior.artifactIDs).toEqual(priorReceipt.artifacts.map((artifact) => artifact.artifactID).sort())
  for (const artifact of priorReceipt.artifacts) {
    expect(value.artifacts.find((entry) => entry.artifactID === artifact.artifactID)).toEqual(artifact)
    expect(digest(required(bodies, artifact.artifactID))).toBe(artifact.sha256)
  }
  for (const [artifactID, kind] of [[value.prior.reportArtifactID, "fix-prior-report"],
    [value.prior.receiptArtifactID, "fix-prior-receipt"], [value.prior.authorityArtifactID, "fix-prior-authority"]] as const)
    expect(value.artifacts.find((artifact) => artifact.artifactID === artifactID)?.kind).toBe(kind)
  expect(value.operations.every((operation) => operation.sourceSha256 === source.sha256)).toBe(true)
  expect(value.operations.some((operation) => operation.kind === "analysis" && operation.operationID === value.finalAnalysisOperationID)).toBe(true)
  for (const operation of value.operations) if (operation.kind === "code") {
    expect(operation.nativeSettlement).toEqual({ status: "completed", messageID: operation.assistantMessageID })
    for (const evidence of [operation.evidence, ...operation.snapshots])
      expect(digest(required(bodies, evidence.artifactID))).toBe(evidence.sha256)
  }
  for (const disposition of report.dispositions) if (disposition.disposition !== "not-examined") {
    const examination = value.examinations.find((entry) => entry.examinationID === disposition.examinationID)
    expect(examination).toBeDefined()
    if (!examination) return yield* Effect.die("completed disposition has no retained examination")
    expect(examination).toMatchObject({ findingID: disposition.findingID, priorFindingSha256: disposition.priorFindingSha256,
      disposition: disposition.disposition, reason: disposition.reason })
    const reply = value.replies.find((entry) => entry.replyID === examination.replyID)
    expect(reply).toBeDefined()
    expect(reply?.sessionID).toBe(examination.verifierSessionID)
    expect(reply?.role).toBe("verifier")
    expect(examination.verifierSessionID).not.toBe(report.sessionID)
  }
  expect(value.citations.map((entry) => entry.uri)).toEqual(report.citations.map((entry) => entry.uri))
  for (const [index, citation] of value.citations.entries())
    expect(required(bodies, citation.artifactID).toString("utf8")).toBe(report.citations[index].text)
  return { index, value, bytes: body.bytes, bodies, priorOutput, priorReceipt, authority }
})

export const stoppedFix = (root: Fixture, host: Ctx, input: unknown, first: { type: string; text: string }, reason: string) =>
  Effect.gen(function* () {
    refused(first, reason)
    const requests = root.requests.length
    const replay = yield* host.invoke(input)
    const result = decodedFix(replay)
    expect(result.status).toBe("failed")
    const held = yield* stateV4(host, result.sessionID)
    expect(held.value.state).toBe("terminal")
    expect(held.value.evidence.receiptID).toBeUndefined()
    expect(root.requests.length).toBe(requests)
    expect((yield* host.execution.active).size).toBe(0)
    refused(yield* host.call(reader, { op: "manifest", reportID: result.reportID }), "engagement-evidence-unavailable")
    expect((yield* host.invoke(input)).text).toBe(replay.text)
    return { result, replay, held }
  })

/** Construct a strict historical fixture from a real zero-variant diligence result, then freeze before replay. */
export const historical = (root: Fixture, host: Ctx, report: Report, version: "v1" | "v2") => Effect.gen(function* () {
  const original = yield* saved(host, report.sessionID)
  const state = Schema.decodeUnknownSync(StateV3)(original.raw, strict)
  const evidence = yield* receipt(host, report)
  if (evidence.value.schema !== "review-engagement-evidence-v2") return yield* Effect.die("historical construction expects actual v2 receipt")
  const { variants: receiptVariants, ...receiptCommon } = evidence.value
  expect(receiptVariants.generations).toEqual([])
  expect(receiptVariants.stop).toBe("not-applicable")
  const receiptValue = Schema.decodeUnknownSync(ReceiptV1)({ ...receiptCommon, schema: "review-engagement-evidence-v1" }, strict)
  const receiptBytes = Buffer.from(canonical(receiptValue))
  const reference = yield* publish(root, host, receiptBytes)
  const { variants, ...common } = state
  expect(variants.limit).toBe(0)
  const v2 = Schema.decodeUnknownSync(StateV2)({ ...common, schema: "review-engagement-state-v2",
    evidence: { policy: "required-completed-v1", ...reference } }, strict)
  const legacy = version === "v2" ? v2 : withoutEvidence(v2)
  const metadata = { ...original.row.metadata, lucyEngagementV1: legacy }
  yield* host.db.update(SessionTable).set({ metadata }).where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)
  return { output: legacy.output, metadata, state: legacy, receiptBytes, bodies: evidence.bodies,
    frozenMetadata: canonical(metadata), frozenOutput: legacy.output }
})

function withoutEvidence(value: StateV2) {
  const { evidence, ...common } = value
  expect(evidence?.receiptID).toBeDefined()
  return Schema.decodeUnknownSync(StateV1)({ ...common, schema: "review-engagement-state-v1",
    ...(value.model && value.model.variant === undefined ? { model: { ...value.model, variant: "default" } } : {}) }, strict)
}
