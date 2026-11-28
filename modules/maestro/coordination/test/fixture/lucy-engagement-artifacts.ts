import { expect } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import { SessionSchema } from "@orchestra/core/session"
import { ReviewResultV2 } from "../../src/v2/governance/review-result"
import { ReviewBindingV2 } from "../../src/v2/tools/review-binding"
import { ReviewEngagementStoreV2 } from "../../src/v2/tools/review-engagement-store"
import { ReviewEngagementPolicyV2 } from "../../src/v2/workflow/review-engagement-policy"
import { reply, stage, text, type Controls, type Ctx, type Fixture } from "./lucy-engagement"

export const reader = "maestro_read_review_evidence"
export const pageBytes = 4096
export const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]"
  if (value !== null && typeof value === "object")
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" +
      canonical(Reflect.get(value, key))).join(",") + "}"
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
    typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value)
  throw new Error("non-JSON evidence value")
}

export const request = (requestID: string, profile = "audit") => ({
  kind: "engagement" as const, requestID, profile,
  brief: "Inspect the captured src declarations, retain actual host evidence, and quote sharedValue.",
  timeBoxMinutes: 5, paths: ["src"],
})

const Source = Schema.Struct({
  revision: Schema.String, commit: Schema.String, sha256: Schema.String,
  files: Schema.Array(Schema.Struct({ path: Schema.String, oid: Schema.String, mode: Schema.String, size: Schema.Number })),
  notExamined: Schema.Array(Schema.Unknown),
})
const Report = Schema.Struct({
  schema: Schema.Literal("review-engagement-result-v1"), requestID: Schema.String,
  inputHash: Schema.String, sessionID: SessionSchema.ID, reportID: Schema.String,
  status: Schema.Literals(["completed", "cancelled", "expired", "failed"]),
  source: Schema.optional(Source), budget: Schema.Struct({ startedAt: Schema.Number, deadlineAt: Schema.Number }),
  report: Schema.optional(ReviewResultV2.Card), citations: Schema.Array(Schema.Struct({
    uri: Schema.String, path: Schema.String, oid: Schema.String, startLine: Schema.Number,
    endLine: Schema.Number, text: Schema.String, sha256: Schema.String,
  })),
  notExamined: Schema.Array(Schema.Struct({ item: Schema.String, reason: Schema.String })),
})
export type Report = typeof Report.Type

export function decoded(output: { readonly type: string; readonly text: string }) {
  expect(output.type, output.text).toBe("text")
  const raw: unknown = JSON.parse(output.text)
  const value = Schema.decodeUnknownSync(Report)(raw)
  expect(value.reportID).toMatch(/^[0-9a-f]{64}$/)
  expect(output.text).toBe(canonical(raw))
  if (typeof raw !== "object" || raw === null || !("reportID" in raw)) throw new Error("report identity missing")
  const { reportID, ...payload } = raw
  expect(reportID).toBe(digest(canonical(payload)))
  return value
}

export const codeCalls = [
  { name: "code_search", input: { pattern: "sharedValue", paths: ["**/*"] } },
  { name: "code_query", input: { op: "symbols", name: "sharedValue" } },
  { name: "code_locate", input: { symbols: ["sharedValue"] } },
] as const

/** Only the provider is scripted. Every CODE event is settled by the real owned Session runner. */
export function codeStream(options: {
  readonly calls?: readonly { readonly name: string; readonly input: unknown }[]
  readonly rounds?: number
  readonly reply?: (log: Parameters<NonNullable<Controls["stream"]>>[0], request: Parameters<NonNullable<Controls["stream"]>>[1]) => string
  readonly afterCode?: (sessionID: string) => Effect.Effect<void>
  readonly beforeFinish?: (sessionID: string) => Effect.Effect<void>
  readonly quote?: boolean
} = {}) {
  const started = new Set<string>()
  const acknowledged = new Set<string>()
  const finished = new Set<string>()
  const rounds = new Map<string, number>()
  const stream: NonNullable<Controls["stream"]> = (log, modelRequest) => {
    const current = stage(log.text)
    if (current === "entry" && (rounds.get(log.sessionID) ?? 0) < (options.rounds ?? 1)) {
      started.add(log.sessionID)
      rounds.set(log.sessionID, (rounds.get(log.sessionID) ?? 0) + 1)
      return Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        ...(options.calls ?? codeCalls).flatMap((call) => {
          const id = `artifact_${call.name}`
          return [LLMEvent.toolInputStart({ id, name: call.name }),
            LLMEvent.toolInputDelta({ id, name: call.name, text: JSON.stringify(call.input) }),
            LLMEvent.toolInputEnd({ id, name: call.name }),
            LLMEvent.toolCall({ id, name: call.name, input: call.input })]
        }),
        LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }), LLMEvent.finish({ reason: "tool-calls" }),
      ])
    }
    const response = () => text(options.reply?.(log, modelRequest) ?? reply(log, modelRequest, { quote: options.quote ?? true }))
    if (current === "entry" && !acknowledged.has(log.sessionID)) {
      acknowledged.add(log.sessionID)
      return Stream.unwrap((options.afterCode?.(log.sessionID) ?? Effect.void).pipe(Effect.map(response)))
    }
    if (current === "finish" && !finished.has(log.sessionID)) {
      finished.add(log.sessionID)
      return Stream.unwrap((options.beforeFinish?.(log.sessionID) ?? Effect.void).pipe(Effect.map(response)))
    }
    return response()
  }
  return { stream, started, acknowledged, finished }
}

export const nativeCode = (host: Ctx, sessionID: string) => host.sessions.context(SessionSchema.ID.make(sessionID)).pipe(
  Effect.map((messages) => messages.flatMap((message) => message.type === "assistant"
    ? message.content.flatMap((part) => part.type === "tool" && codeCalls.some((call) => call.name === part.name)
      ? [{ id: part.id, assistantMessageID: message.id, name: part.name, status: part.state.status, providerExecuted: part.provider?.executed,
        body: JSON.stringify(part.state) }] : []) : [])),
)

const Descriptor = Schema.Struct({ artifactID: Schema.String, sha256: Schema.String,
  bytes: Schema.Number, mime: Schema.String })
export type Descriptor = typeof Descriptor.Type
const Index = Schema.Struct({
  schema: Schema.Literal("review-engagement-evidence-index-v1"), reportID: Schema.String, receiptID: Schema.String,
  manifest: Descriptor, counts: Schema.Struct({ operations: Schema.Number, artifacts: Schema.Number, hostProofs: Schema.Number }),
})
export type Index = typeof Index.Type
const Page = Schema.Struct({
  schema: Schema.Literal("review-engagement-evidence-page-v1"), reportID: Schema.String, receiptID: Schema.String,
  artifactID: Schema.String, sha256: Schema.String, bytes: Schema.Number, mime: Schema.String,
  offset: Schema.Number, encoding: Schema.Literal("base64"), data: Schema.String, next: Schema.optional(Schema.String),
})
export type Page = typeof Page.Type

export const manifest = (host: Ctx, reportID: string) => Effect.gen(function* () {
  const output = yield* host.call(reader, { op: "manifest", reportID })
  expect(output.type, output.text).toBe("text")
  const value = Schema.decodeUnknownSync(Index)(JSON.parse(output.text), { onExcessProperty: "error" })
  expect(value.reportID).toBe(reportID)
  expect(value.receiptID).toMatch(/^[0-9a-f]{64}$/)
  expect(value.manifest.artifactID).toBe(value.receiptID)
  expect(value.manifest.sha256).toBe(value.receiptID)
  expect(value.manifest.mime).toBe("application/json")
  expect(value.manifest.bytes).toBeGreaterThan(0)
  expect(value.manifest.bytes).toBeLessThanOrEqual(1024 * 1024)
  expect(output.text).toBe(canonical(value))
  return { output, value }
})

/** Reassemble bytes, not independently decoded text pages: boundaries may split a UTF-8 sequence. */
export const readAll = (host: Ctx, index: Index, artifact: Descriptor) => Effect.gen(function* () {
  expect(Number.isSafeInteger(artifact.bytes)).toBe(true)
  expect(artifact.bytes).toBeGreaterThanOrEqual(0)
  expect(artifact.bytes).toBeLessThanOrEqual(16 * 1024 * 1024)
  const chunks: Buffer[] = []
  const pages: Page[] = []
  let cursor: string | undefined
  let offset = 0
  for (let count = 0; count < Math.max(1, Math.ceil(artifact.bytes / pageBytes)); count++) {
    const output = yield* host.call(reader, { op: "read", reportID: index.reportID, artifactID: artifact.artifactID,
      ...(cursor === undefined ? {} : { cursor }) })
    expect(output.type, output.text).toBe("text")
    const value = Schema.decodeUnknownSync(Page)(JSON.parse(output.text), { onExcessProperty: "error" })
    expect(value).toMatchObject({ reportID: index.reportID, receiptID: index.receiptID, artifactID: artifact.artifactID,
      sha256: artifact.sha256, bytes: artifact.bytes, mime: artifact.mime, offset, encoding: "base64" })
    expect(output.text).toBe(canonical(value))
    const bytes = Buffer.from(value.data, "base64")
    expect(bytes.toString("base64")).toBe(value.data)
    expect(bytes.length).toBe(Math.min(pageBytes, artifact.bytes - offset))
    chunks.push(bytes)
    pages.push(value)
    offset += bytes.length
    if (offset < artifact.bytes) {
      expect(value.next).toBeTypeOf("string")
      expect(value.next).not.toBe(cursor)
    } else expect(value.next).toBeUndefined()
    cursor = value.next
  }
  expect(offset).toBe(artifact.bytes)
  expect(cursor).toBeUndefined()
  const bytes = Buffer.concat(chunks)
  expect(digest(bytes)).toBe(artifact.sha256)
  return { bytes, pages }
})

/** The fixed private root is a host test observation, never an argument accepted by the public reader. */
export function blobRoot(root: Fixture, host: Ctx) {
  const storageID = host.database.storageID
  if (!storageID) throw new Error("artifact fixture requires a persistent database identity")
  return path.join(root.global.data, "lucy-evidence", digest(storageID))
}

/** Locate only this request's pre-existing temporary cache for deletion and producer-positive controls. */
export function cache(host: Ctx, input: unknown) {
  const identity = ReviewEngagementStoreV2.identity(host.parent, Schema.decodeUnknownSync(ReviewEngagementPolicyV2.Input)(input))
  return ReviewBindingV2.analysisStore(`engagement_${identity.key}`)
}

export const blobs = (directory: string) => Effect.promise(async () => {
  const names = await fs.readdir(directory).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return []
    throw error
  })
  return Promise.all(names.filter((name) => /^[0-9a-f]{64}$/.test(name)).sort().map(async (sha256) => ({
    sha256, bytes: await fs.readFile(path.join(directory, sha256)),
  })))
})

const Evidence = Schema.Struct({ uri: Schema.String, sha256: Schema.String, artifactID: Schema.String })
const CodeOperation = Schema.Struct({
  operationID: Schema.String, kind: Schema.Literal("code"), status: Schema.Literal("captured"),
  sessionID: Schema.String, assistantMessageID: Schema.String, toolCallID: Schema.String,
  name: Schema.Literals(["code_search", "code_locate", "code_query"]), input: Schema.Unknown,
  sourceSha256: Schema.String, evidence: Evidence, snapshots: Schema.Array(Evidence),
  nativeSettlement: Schema.Union([
    Schema.Struct({ status: Schema.Literal("completed"), messageID: Schema.String }),
    Schema.Struct({ status: Schema.Literal("not-observed") }),
  ]),
})
const AnalysisOperation = Schema.Struct({
  operationID: Schema.String, kind: Schema.Literal("analysis"), status: Schema.Literal("completed"),
  ordinal: Schema.Number, sourceSha256: Schema.String, routingDigest: Schema.String, catalogDigest: Schema.String,
  resultArtifactID: Schema.String, retainedArtifactID: Schema.String, debtArtifactID: Schema.String,
  checks: Schema.Array(Schema.Struct({
    id: Schema.String, pack: Schema.String, version: Schema.String, lane: Schema.String,
    status: Schema.Literals(["pass", "fail", "not-run", "acquisition-error"]), workspaceExecuted: Schema.Boolean,
    reason: Schema.optional(Schema.String), uri: Schema.optional(Schema.String),
    artifactIDs: Schema.Array(Schema.String), proofIDs: Schema.Array(Schema.String),
  })),
})
const Runtime = Schema.Struct({ id: Schema.Literal("oxlint"), pinnedVersion: Schema.Literal("1.91.0"),
  target: Schema.Literal("linux-x64"), executableSha256: Schema.String })
const Capture = Schema.Struct({ bytes: Schema.Number, retainedBytes: Schema.Number, truncated: Schema.Boolean })
const Proof = Schema.Struct({
  proofID: Schema.String, kind: Schema.Literal("oxlint"), analysisOperationID: Schema.String, invocationID: Schema.String,
  side: Schema.Literals(["head", "base"]), sourceSha256: Schema.String, runtime: Runtime,
  inputsArtifactID: Schema.String, configArtifactID: Schema.String, recipeArtifactID: Schema.String,
  pathMapArtifactID: Schema.String, stdoutArtifactID: Schema.String, stderrArtifactID: Schema.String,
  outcome: Schema.Struct({ exitCode: Schema.NullOr(Schema.Number), durationMs: Schema.Number,
    timedOut: Schema.Boolean, overflow: Schema.Boolean, memoryExceeded: Schema.Boolean,
    failure: Schema.optional(Schema.String), stdout: Capture, stderr: Capture }),
})
const Artifact = Schema.Struct({
  ...Descriptor.fields, kind: Schema.Literals(["code-result", "code-snapshot", "citation", "analysis-result",
    "analysis-retained", "analysis-debt", "analyzer-stdout", "analyzer-stderr", "analyzer-path-map",
    "analyzer-inputs", "analyzer-config", "analyzer-recipe"]), complete: Schema.Boolean, uri: Schema.optional(Schema.String),
})
export const Receipt = Schema.Struct({
  schema: Schema.Literal("review-engagement-evidence-v1"), reportID: Schema.String, inputHash: Schema.String,
  sessionID: Schema.String, sourceSha256: Schema.String, budget: Schema.Struct({ startedAt: Schema.Number, deadlineAt: Schema.Number }),
  finalAnalysisOperationID: Schema.String, operations: Schema.Array(Schema.Union([CodeOperation, AnalysisOperation])),
  artifacts: Schema.Array(Artifact), citations: Schema.Array(Schema.Struct({ uri: Schema.String, artifactID: Schema.String })),
  hostProofs: Schema.Array(Proof), notExamined: Schema.Array(Schema.Struct({ item: Schema.String, reason: Schema.String })),
})
export type Receipt = typeof Receipt.Type

export const receipt = (host: Ctx, report: Report) => Effect.gen(function* () {
  const index = (yield* manifest(host, report.reportID)).value
  const body = yield* readAll(host, index, index.manifest)
  const value = Schema.decodeUnknownSync(Receipt)(JSON.parse(body.bytes.toString("utf8")), { onExcessProperty: "error" })
  expect(body.bytes.toString("utf8")).toBe(canonical(value))
  expect(value).toMatchObject({ reportID: report.reportID, inputHash: report.inputHash, sessionID: report.sessionID,
    sourceSha256: report.source?.sha256, budget: report.budget })
  expect(value.notExamined).toEqual(report.notExamined)
  expect(index.counts).toEqual({ operations: value.operations.length, artifacts: value.artifacts.length, hostProofs: value.hostProofs.length })
  expect(value.artifacts.length).toBeLessThanOrEqual(256)
  expect(value.operations.filter((operation) => operation.kind === "code").length).toBeLessThanOrEqual(128)
  expect(value.artifacts.reduce((size, artifact) => size + artifact.bytes, 0)).toBeLessThanOrEqual(64 * 1024 * 1024)
  expect(value.artifacts.map((artifact) => artifact.artifactID)).toEqual(
    [...new Set(value.artifacts.map((artifact) => artifact.artifactID))].sort(),
  )
  const bodies = new Map<string, Buffer>()
  for (const artifact of value.artifacts) {
    const { artifactID, ...descriptor } = artifact
    expect(artifactID).toBe(digest(canonical(descriptor)))
    bodies.set(artifactID, (yield* readAll(host, index, artifact)).bytes)
  }
  for (const operation of value.operations) {
    expect(operation.sourceSha256).toBe(value.sourceSha256)
    const payload = operation.kind === "code" ? {
      schema: "review-engagement-code-operation-v1", inputHash: value.inputHash,
      sessionID: operation.sessionID, assistantMessageID: operation.assistantMessageID,
      toolCallID: operation.toolCallID, name: operation.name, sourceSha256: operation.sourceSha256,
    } : { schema: "review-engagement-analysis-operation-v1", inputHash: value.inputHash,
      sourceSha256: operation.sourceSha256, ordinal: operation.ordinal,
      routingDigest: operation.routingDigest, catalogDigest: operation.catalogDigest }
    expect(operation.operationID).toBe(digest(canonical(payload)))
    if (operation.kind === "analysis") {
      const wrapped = Schema.decodeUnknownSync(Schema.Struct({
        schema: Schema.Literal("review-engagement-analysis-result-v1"), operationID: Schema.String,
        routing: Schema.Unknown, catalog: Schema.Unknown, result: Schema.Unknown,
      }))(JSON.parse(required(bodies, operation.resultArtifactID).toString("utf8")), { onExcessProperty: "error" })
      expect(wrapped.operationID).toBe(operation.operationID)
      expect(digest(canonical(wrapped.routing))).toBe(operation.routingDigest)
      expect(digest(canonical(wrapped.catalog))).toBe(operation.catalogDigest)
      expect(required(bodies, operation.retainedArtifactID).length).toBeGreaterThan(0)
      expect(required(bodies, operation.debtArtifactID).length).toBeGreaterThan(0)
    } else for (const evidence of [operation.evidence, ...operation.snapshots]) {
      expect(digest(required(bodies, evidence.artifactID))).toBe(evidence.sha256)
      expect(value.artifacts.find((artifact) => artifact.artifactID === evidence.artifactID)?.uri).toBe(evidence.uri)
    }
  }
  const analysis = value.operations.filter((operation) => operation.kind === "analysis")
  expect(analysis.map((operation) => operation.ordinal)).toEqual(analysis.map((_, index) => index + 1))
  expect(analysis.some((operation) => operation.operationID === value.finalAnalysisOperationID)).toBe(true)
  expect(value.citations.map((citation) => citation.uri)).toEqual(report.citations.map((citation) => citation.uri))
  for (const [index, citation] of value.citations.entries()) {
    expect(required(bodies, citation.artifactID).toString("utf8")).toBe(report.citations[index].text)
    expect(digest(required(bodies, citation.artifactID))).toBe(report.citations[index].sha256)
    expect(value.artifacts.find((artifact) => artifact.artifactID === citation.artifactID)?.kind).toBe("citation")
  }
  for (const proof of value.hostProofs) {
    const { proofID, ...payload } = proof
    expect(proofID).toBe(digest(canonical(payload)))
    expect(proof.invocationID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(analysis.some((operation) => operation.operationID === proof.analysisOperationID)).toBe(true)
  }
  expect(new Set(value.hostProofs.map((proof) => proof.invocationID)).size).toBe(value.hostProofs.length)
  return { index, value, bodies, bytes: body.bytes }
})

export function required(bodies: ReadonlyMap<string, Buffer>, artifactID: string) {
  const bytes = bodies.get(artifactID)
  if (bytes === undefined) throw new Error(`required artifact was not read: ${artifactID}`)
  return bytes
}

export function refused(output: { readonly type: string; readonly text: string }, reason: string) {
  expect(output.type, output.text).toBe("error")
  expect(output.text).toContain(reason)
}
